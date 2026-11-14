// Canvas sharing: packs one canvas plus every local file it points at into a
// single ".airpaste-share" file, and unpacks such a file into a Dome.
//
// Bundle format (formatVersion 1) -- a ZIP archive (see ./zip.js):
//   manifest.json   { format: "airpaste-share", formatVersion, createdAt,
//                     generator: { app, version },
//                     canvas: { name, document, workspaceSchemaVersion,
//                               pageCount, tileCount },
//                     thumbnail: "thumbnail.jpg" | null,
//                     assets: [{ path, kind, name, sizeBytes, sha256 }] }
//   canvas.json     the canvas as the app's internal workspace document
//                   ({ version, name, activePageId, pages, airpaste }), with
//                   every local file reference rewritten to its bundle path
//                   ("assets/003-photo.png") and machine-specific absolute
//                   paths removed.
//   thumbnail.jpg   optional Home-card preview.
//   assets/*        the files themselves. kind "file" = images, PDFs,
//                   Markdown notes... that live in the Dome; "webclip" =
//                   full-page link screenshots (.airpaste/previews/webclip);
//                   "article" = saved reader-view text (.airpaste/articles).
//
// Why a ZIP with its own extension: one file is what people can attach to a
// message; ZIP keeps images as-is and compresses the JSON; its own extension
// stops it being mistaken for a ".canvas" (JSON Canvas, which other apps
// open) or a legacy ".airpaste.json", and lets the OS route double-clicks to
// AirPaste instead of an archive tool.
//
// Versioning: formatVersion describes the bundle layout; the canvas document
// keeps its own workspace schema version, which the renderer's existing
// migration chain (renderer/src/lib/workspace.js migrateWorkspace) upgrades
// on open, exactly like an old canvas file on disk. migrateManifest() below
// is where a future bundle layout change gets upgraded on import.
//
// Imports are untrusted: every entry name, size, type and reference is
// validated, nothing is ever written outside the target Dome, and a failed
// import removes whatever it had written.

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const workspaceService = require("../../workspace-service");
const { DEFAULT_CANVAS_SUFFIX, serializeJsonCanvasDocument, stripCanvasSuffix } = require("../../json-canvas");
const { WORKSPACE_SCHEMA_VERSION } = require("../../shared/workspace-schema.json");
const { openZip, writeZip } = require("./zip");

const SHARE_FILE_EXTENSION = ".airpaste-share";
const SHARE_FORMAT = "airpaste-share";
const SHARE_FORMAT_VERSION = 1;
const MANIFEST_ENTRY = "manifest.json";
const DOCUMENT_ENTRY = "canvas.json";
const THUMBNAIL_ENTRY = "thumbnail.jpg";
const ASSET_DIR = "assets";

const MiB = 1024 * 1024;
const LIMITS = Object.freeze({
  maxArchiveBytes: 1024 * MiB,
  maxEntries: 5000,
  maxEntryBytes: 512 * MiB,
  maxTotalBytes: 2048 * MiB,
  maxManifestBytes: 4 * MiB,
  maxDocumentBytes: 128 * MiB,
  maxArticleBytes: 16 * MiB,
  maxThumbnailBytes: 8 * MiB,
  maxPages: 500,
});

const INTERNAL_PREFIX = ".airpaste/";
const WEBCLIP_DIR = ".airpaste/previews/webclip";
const ARTICLE_DIR = ".airpaste/articles";
const CANVAS_THUMB_DIR = ".airpaste/previews/canvas-thumbs";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"]);
// Everything a file tile can sensibly point at. Anything else (executables,
// scripts, archives, shortcuts...) is left out of exports and refused on
// import.
const FILE_EXTS = new Set([
  ...IMAGE_EXTS,
  "mp4", "mov", "m4v", "webm",
  "mp3", "wav", "m4a", "ogg", "flac",
  "pdf", "md", "markdown", "txt", "csv", "rtf",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
]);
const KIND_EXTS = Object.freeze({
  file: FILE_EXTS,
  webclip: new Set(["jpg", "jpeg", "png", "webp"]),
  article: new Set(["json"]),
});
const COMPRESSIBLE_EXTS = new Set(["json", "md", "markdown", "txt", "csv", "rtf", "svg", "bmp"]);

// Keys whose string values are user content, never tile-id references --
// skipped when remapping ids so a note that happens to contain an id-shaped
// string is left alone.
const CONTENT_KEYS = new Set([
  "text", "body", "code", "title", "description", "label", "url", "resolvedUrl", "html",
  "markdown", "content", "name", "excerpt", "siteName", "caption", "note", "notes", "image",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shareError(message, code = "SHARE_INVALID") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function extOf(fileName) {
  const ext = path.posix.extname(String(fileName ?? ""));
  return ext ? ext.slice(1).toLowerCase() : "";
}

function normalizeRel(value) {
  return String(value ?? "").replaceAll("\\", "/").trim().replace(/^\.\/+/, "").replace(/\/+/g, "/");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canvasThumbId(relativePath) {
  // Same scheme as main/ipc/assets.js and workspace-service.js.
  return createHash("sha1").update(normalizeRel(relativePath)).digest("hex").slice(0, 20);
}

function isShareFilePath(filePath) {
  return typeof filePath === "string" && filePath.toLowerCase().endsWith(SHARE_FILE_EXTENSION);
}

// A ZIP entry name is only acceptable as a plain relative POSIX path:
// no absolute paths, drive letters, backslashes, "." / ".." segments, empty
// segments, control characters or Windows-reserved characters. This is the
// zip-slip guard; names are additionally never joined onto a filesystem path
// directly (assets get fresh names on import).
function isSafeEntryName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 255) return false;
  if (name.startsWith("/") || name.includes("\\") || /^[a-zA-Z]:/.test(name)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f<>:"|?*]/.test(name)) return false;
  return name.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function expectedKindForField(field) {
  if (field === "webclipImagePath") return "webclip";
  if (field === "article.path") return "article";
  return "file";
}

function classifyWorkspaceRel(rel) {
  if (rel.startsWith(`${WEBCLIP_DIR}/`)) return "webclip";
  if (rel.startsWith(`${ARTICLE_DIR}/`)) return "article";
  if (rel.startsWith(INTERNAL_PREFIX) || rel === ".airpaste") return null;
  return "file";
}

// Visits every local-file reference inside a tile (or anything nested in
// it): image tiles (asset.relativePath, and `image` when it is that same
// path), file / Markdown-backed tiles (file.relativePath), link screenshots
// (webclipImagePath) and saved articles (article.path). `onRef` returns the
// replacement value ("" clears it). `onNode` sees every object, for the
// absolute-path cleanup.
function visitLocalRefs(value, onRef, onNode) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitLocalRefs(item, onRef, onNode));
    return;
  }
  if (!isObject(value)) return;

  if (isObject(value.asset) && typeof value.asset.relativePath === "string" && value.asset.relativePath) {
    const original = value.asset.relativePath;
    const next = onRef(original, "asset.relativePath");
    value.asset.relativePath = next;
    if (typeof value.image === "string" && value.image === original) {
      value.image = next;
    }
  }
  if (isObject(value.file) && typeof value.file.relativePath === "string" && value.file.relativePath) {
    value.file.relativePath = onRef(value.file.relativePath, "file.relativePath");
  }
  if (typeof value.webclipImagePath === "string" && value.webclipImagePath) {
    value.webclipImagePath = onRef(value.webclipImagePath, "webclipImagePath");
  }
  if (isObject(value.article) && typeof value.article.path === "string" && value.article.path) {
    value.article.path = onRef(value.article.path, "article.path");
  }
  onNode?.(value);

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      visitLocalRefs(child, onRef, onNode);
    }
  }
}

function pageTileLists(page) {
  return [page?.tiles, page?.cards, page?.groups].filter(Array.isArray);
}

function countTiles(pages) {
  return pages.reduce((total, page) => total + (Array.isArray(page?.tiles) ? page.tiles.length : Array.isArray(page?.cards) ? page.cards.length : 0), 0);
}

function sniffMatchesExt(buffer, ext) {
  const head = buffer.subarray(0, 16);
  switch (ext) {
    case "png":
      return head.length >= 8 && head.readUInt32BE(0) === 0x89504e47;
    case "jpg":
    case "jpeg":
      return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "gif":
      return head.toString("latin1", 0, 4) === "GIF8";
    case "webp":
      return head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP";
    case "bmp":
      return head.toString("latin1", 0, 2) === "BM";
    case "avif":
      return head.toString("latin1", 4, 8) === "ftyp";
    case "pdf":
      return head.toString("latin1", 0, 5) === "%PDF-";
    case "svg":
      return /<svg[\s>]/i.test(buffer.subarray(0, 4096).toString("utf8"));
    case "json":
      try {
        return isObject(JSON.parse(buffer.toString("utf8")));
      } catch {
        return false;
      }
    default:
      // Video/audio/office/text: extension allowlist only.
      return true;
  }
}

// ---------------------------------------------------------------- export

async function buildShareBundle(canvasFilePath) {
  const absCanvas = path.resolve(canvasFilePath);
  const root = await workspaceService.workspaceRootFromFile(absCanvas);
  if (!root) {
    throw shareError("Could not find the workspace this canvas belongs to.", "SHARE_NOT_FOUND");
  }
  const loaded = await workspaceService.loadCanvas(absCanvas, { recordRecent: false });
  const source = loaded.workspace;
  const document = clone({
    version: Number.isFinite(source.version) ? source.version : WORKSPACE_SCHEMA_VERSION,
    name: source.name,
    activePageId: source.activePageId,
    pages: Array.isArray(source.pages) ? source.pages : [],
    airpaste: isObject(source.airpaste) ? source.airpaste : null,
  });

  const assets = [];
  const assetByRel = new Map();
  const skipped = [];

  const exportRef = async (rel, field) => {
    const normalized = normalizeRel(rel);
    if (assetByRel.has(normalized)) {
      return assetByRel.get(normalized);
    }
    const kind = classifyWorkspaceRel(normalized);
    const ext = extOf(normalized);
    let bundlePath = "";
    if (kind && kind === expectedKindForField(field) && KIND_EXTS[kind].has(ext)) {
      const abs = workspaceService.resolveWorkspaceAssetPath(root, normalized);
      const stat = abs ? await fs.stat(abs).catch(() => null) : null;
      if (stat?.isFile() && stat.size <= LIMITS.maxEntryBytes) {
        const data = await fs.readFile(abs);
        const baseName = workspaceService.sanitizeName(path.posix.basename(normalized), `asset.${ext}`).replace(/\s+/g, "-");
        bundlePath = `${ASSET_DIR}/${String(assets.length + 1).padStart(3, "0")}-${baseName}`;
        assets.push({
          path: bundlePath,
          kind,
          name: path.posix.basename(normalized),
          sizeBytes: data.length,
          sha256: sha256(data),
          data,
        });
      }
    }
    if (!bundlePath) {
      skipped.push(normalized);
    }
    assetByRel.set(normalized, bundlePath);
    return bundlePath;
  };

  // Two passes: collect (async file reads), then rewrite synchronously.
  const pending = [];
  for (const page of document.pages) {
    for (const list of pageTileLists(page)) {
      visitLocalRefs(clone(list), (rel, field) => {
        pending.push([rel, field]);
        return rel;
      });
    }
  }
  for (const [rel, field] of pending) {
    await exportRef(rel, field);
  }
  for (const page of document.pages) {
    for (const list of pageTileLists(page)) {
      visitLocalRefs(list, (rel) => assetByRel.get(normalizeRel(rel)) ?? "", (node) => {
        // Absolute paths only mean something on the sender's computer (and
        // reveal their folder layout / user name): drop them.
        if (isObject(node.file) && "filePath" in node.file) delete node.file.filePath;
        if (isObject(node.sticky) && "filePath" in node.sticky) delete node.sticky.filePath;
      });
    }
  }

  let thumbnail = null;
  const thumbAbs = path.join(root, CANVAS_THUMB_DIR, `${canvasThumbId(loaded.path)}.jpg`);
  const thumbStat = await fs.stat(thumbAbs).catch(() => null);
  if (thumbStat?.isFile() && thumbStat.size <= LIMITS.maxThumbnailBytes) {
    thumbnail = await fs.readFile(thumbAbs);
  }

  return { root, loaded, document, assets, skipped: [...new Set(skipped)], thumbnail };
}

async function exportCanvasShare(canvasFilePath, outPath, options = {}) {
  const { loaded, document, assets, skipped, thumbnail } = await buildShareBundle(canvasFilePath);
  const name = String(document.name || stripCanvasSuffix(path.basename(loaded.filePath)) || "Canvas");
  const manifest = {
    format: SHARE_FORMAT,
    formatVersion: SHARE_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    generator: {
      app: "AirPaste",
      version: typeof options.appVersion === "string" ? options.appVersion : "",
    },
    canvas: {
      name,
      document: DOCUMENT_ENTRY,
      workspaceSchemaVersion: document.version,
      pageCount: document.pages.length,
      tileCount: countTiles(document.pages),
    },
    thumbnail: thumbnail ? THUMBNAIL_ENTRY : null,
    assets: assets.map(({ path: assetPath, kind, name: assetName, sizeBytes, sha256: hash }) => ({
      path: assetPath,
      kind,
      name: assetName,
      sizeBytes,
      sha256: hash,
    })),
  };

  const entries = [
    { name: MANIFEST_ENTRY, data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
    { name: DOCUMENT_ENTRY, data: Buffer.from(JSON.stringify(document), "utf8") },
  ];
  if (thumbnail) {
    entries.push({ name: THUMBNAIL_ENTRY, data: thumbnail, compress: false });
  }
  for (const asset of assets) {
    entries.push({ name: asset.path, data: asset.data, compress: COMPRESSIBLE_EXTS.has(extOf(asset.path)) });
  }

  const written = await writeZip(outPath, entries);
  return {
    outPath: written.outPath,
    sizeBytes: written.sizeBytes,
    name,
    assetCount: assets.length,
    skippedAssets: skipped,
  };
}

// ---------------------------------------------------------------- import

// Upgrades an older bundle manifest to the current layout. formatVersion 1 is
// the first and current layout, so there is nothing to do yet; a future v2
// adds an `if (manifest.formatVersion < 2) { ... }` step here.
function migrateManifest(manifest) {
  return manifest;
}

function validateManifest(raw, entryNames) {
  if (!isObject(raw) || raw.format !== SHARE_FORMAT) {
    throw shareError("This isn't an AirPaste share file.");
  }
  if (!Number.isInteger(raw.formatVersion) || raw.formatVersion < 1) {
    throw shareError("This share file's format version is missing or invalid.");
  }
  if (raw.formatVersion > SHARE_FORMAT_VERSION) {
    throw shareError("This canvas was shared from a newer version of AirPaste. Update AirPaste to import it.", "SHARE_TOO_NEW");
  }
  const manifest = migrateManifest(raw);
  const canvas = isObject(manifest.canvas) ? manifest.canvas : null;
  if (!canvas || canvas.document !== DOCUMENT_ENTRY || !entryNames.has(DOCUMENT_ENTRY)) {
    throw shareError("This share file has no canvas in it.");
  }

  const assets = [];
  const seen = new Set();
  const rawAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (rawAssets.length > LIMITS.maxEntries) {
    throw shareError("This share file lists too many files.", "SHARE_TOO_LARGE");
  }
  for (const asset of rawAssets) {
    if (!isObject(asset) || typeof asset.path !== "string") {
      throw shareError("This share file's file list is damaged.");
    }
    const parts = asset.path.split("/");
    if (!isSafeEntryName(asset.path) || parts.length !== 2 || parts[0] !== ASSET_DIR || seen.has(asset.path)) {
      throw shareError("This share file lists a file in an unexpected place.");
    }
    if (!Object.prototype.hasOwnProperty.call(KIND_EXTS, asset.kind)) {
      throw shareError("This share file lists a file of an unknown kind.");
    }
    seen.add(asset.path);
    assets.push({
      path: asset.path,
      kind: asset.kind,
      name: typeof asset.name === "string" ? asset.name : parts[1],
      sha256: typeof asset.sha256 === "string" && /^[0-9a-f]{64}$/i.test(asset.sha256) ? asset.sha256.toLowerCase() : null,
    });
  }

  return {
    formatVersion: manifest.formatVersion,
    name: typeof canvas.name === "string" ? canvas.name : "",
    workspaceSchemaVersion: Number.isFinite(canvas.workspaceSchemaVersion) ? canvas.workspaceSchemaVersion : null,
    thumbnail: manifest.thumbnail === THUMBNAIL_ENTRY && entryNames.has(THUMBNAIL_ENTRY) ? THUMBNAIL_ENTRY : null,
    assets,
  };
}

function validateDocument(raw) {
  if (!isObject(raw) || !Array.isArray(raw.pages) || raw.pages.length === 0) {
    throw shareError("The canvas inside this share file is damaged.");
  }
  if (raw.pages.length > LIMITS.maxPages) {
    throw shareError("The canvas inside this share file has too many pages.", "SHARE_TOO_LARGE");
  }
  const pages = raw.pages.map((page, index) => {
    if (!isObject(page)) {
      throw shareError("The canvas inside this share file is damaged.");
    }
    const tiles = Array.isArray(page.tiles) ? page.tiles : Array.isArray(page.cards) ? page.cards : [];
    const next = { ...page, tiles: tiles.filter(isObject) };
    delete next.cards;
    next.id = typeof page.id === "string" && page.id.trim() ? page.id : `page-${index + 1}`;
    for (const key of ["groups", "edges", "tethers"]) {
      next[key] = Array.isArray(page[key]) ? page[key].filter(isObject) : [];
    }
    return next;
  });
  return {
    version: Number.isFinite(raw.version) ? raw.version : 1,
    name: typeof raw.name === "string" ? raw.name : "",
    activePageId: typeof raw.activePageId === "string" ? raw.activePageId : pages[0].id,
    pages,
    airpaste: isObject(raw.airpaste) ? raw.airpaste : null,
  };
}

function freshId(oldId) {
  if (UUID_PATTERN.test(oldId)) return randomUUID();
  const prefix = /^([a-zA-Z]+-)/.exec(oldId)?.[1] ?? "";
  return `${prefix}${randomUUID()}`;
}

// Gives every tile, group, edge and tether a new id and rewrites every
// reference to them (edges, tethers, racks, groups...). Ids only have to be
// unique within one canvas, but the link-preview queue and anything keyed by
// Dome + tile id would otherwise mix up two imports of the same bundle (or
// a bundle imported back into the Dome it came from).
function remapIds(document) {
  const idMap = new Map();
  for (const page of document.pages) {
    for (const key of ["tiles", "groups", "edges", "tethers"]) {
      for (const item of page[key]) {
        if (typeof item.id === "string" && item.id && !idMap.has(item.id)) {
          idMap.set(item.id, freshId(item.id));
        }
      }
    }
  }

  const rewrite = (value, key = "") => {
    if (typeof value === "string") {
      return !CONTENT_KEYS.has(key) && idMap.has(value) ? idMap.get(value) : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => rewrite(item, key));
    }
    if (isObject(value)) {
      const next = {};
      for (const [childKey, child] of Object.entries(value)) {
        next[childKey] = CONTENT_KEYS.has(childKey) && typeof child === "string" ? child : rewrite(child, childKey);
      }
      return next;
    }
    return value;
  };

  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      tiles: rewrite(page.tiles),
      groups: rewrite(page.groups),
      edges: rewrite(page.edges),
      tethers: rewrite(page.tethers),
      drawings: rewrite(page.drawings),
      view: rewrite(page.view),
    })),
    airpaste: rewrite(document.airpaste),
  };
}

async function uniqueFolder(parentDir, baseName) {
  let candidate = path.join(parentDir, baseName);
  let index = 2;
  while (await fs.stat(candidate).then(() => true, () => false)) {
    candidate = path.join(parentDir, `${baseName} ${index}`);
    index += 1;
  }
  return candidate;
}

async function importCanvasShare(domeRoot, bundlePath, options = {}) {
  const root = await workspaceService.ensureWorkspaceScaffold(domeRoot);
  const targetDir = workspaceService.ensureInside(
    root,
    path.join(root, normalizeRel(options.targetFolderPath ?? "").replace(/^\/+|\/+$/g, "")),
  );

  const zip = await openZip(bundlePath, LIMITS);
  const written = [];
  const createdDirs = [];
  const warnings = [];

  const writeNew = async (absTarget, data) => {
    workspaceService.ensureInside(root, absTarget);
    await fs.mkdir(path.dirname(absTarget), { recursive: true });
    // "wx": never overwrite anything already in the Dome.
    await fs.writeFile(absTarget, data, { flag: "wx" });
    written.push(absTarget);
  };

  try {
    const entryByName = new Map();
    for (const entry of zip.entries) {
      if (!isSafeEntryName(entry.name) || entryByName.has(entry.name)) {
        throw shareError(`This share file contains an unsafe path ("${entry.name.slice(0, 80)}").`);
      }
      entryByName.set(entry.name, entry);
    }

    const manifestEntry = entryByName.get(MANIFEST_ENTRY);
    if (!manifestEntry) {
      throw shareError("This isn't an AirPaste share file.");
    }
    if (manifestEntry.size > LIMITS.maxManifestBytes) {
      throw shareError("This share file's manifest is too large.", "SHARE_TOO_LARGE");
    }
    let rawManifest;
    try {
      rawManifest = JSON.parse((await zip.read(manifestEntry)).toString("utf8"));
    } catch (error) {
      if (error?.code) throw error;
      throw shareError("This share file's manifest is damaged.");
    }
    const manifest = validateManifest(rawManifest, new Set(entryByName.keys()));

    const documentEntry = entryByName.get(DOCUMENT_ENTRY);
    if (documentEntry.size > LIMITS.maxDocumentBytes) {
      throw shareError("The canvas inside this share file is too large.", "SHARE_TOO_LARGE");
    }
    let rawDocument;
    try {
      rawDocument = JSON.parse((await zip.read(documentEntry)).toString("utf8"));
    } catch (error) {
      if (error?.code) throw error;
      throw shareError("The canvas inside this share file is damaged.");
    }
    let document = validateDocument(rawDocument);
    if (document.version > WORKSPACE_SCHEMA_VERSION) {
      warnings.push("This canvas was made with a newer version of AirPaste; some tiles may not show correctly until you update.");
    }

    const canvasName = workspaceService.sanitizeName(manifest.name || document.name || stripCanvasSuffix(path.basename(bundlePath)), "Shared canvas");
    await fs.mkdir(targetDir, { recursive: true });
    const canvasPath = await workspaceService.uniquePath(targetDir, canvasName, DEFAULT_CANVAS_SUFFIX);
    const finalName = stripCanvasSuffix(path.basename(canvasPath));

    // Unpack assets under fresh names: user-visible files into a folder
    // beside the canvas ("<name> files"), caches into the Dome's .airpaste.
    const bundleToRel = new Map();
    const kindByBundlePath = new Map();
    let filesDir = null;
    for (const asset of manifest.assets) {
      const entry = entryByName.get(asset.path);
      const ext = extOf(asset.path);
      if (!entry || !KIND_EXTS[asset.kind].has(ext)) {
        warnings.push(`Skipped "${asset.name}" (missing or not an allowed file type).`);
        continue;
      }
      if (asset.kind === "article" && entry.size > LIMITS.maxArticleBytes) {
        warnings.push(`Skipped "${asset.name}" (too large).`);
        continue;
      }
      const data = await zip.read(entry);
      if ((asset.sha256 && sha256(data) !== asset.sha256) || !sniffMatchesExt(data, ext)) {
        warnings.push(`Skipped "${asset.name}" (its contents don't match its type).`);
        continue;
      }

      let absTarget;
      const safeBase = workspaceService.sanitizeName(path.posix.basename(asset.name, path.posix.extname(asset.name)), "file");
      if (asset.kind === "file") {
        if (!filesDir) {
          filesDir = await uniqueFolder(path.dirname(canvasPath), `${finalName} files`);
          workspaceService.ensureInside(root, filesDir);
          await fs.mkdir(filesDir, { recursive: true });
          createdDirs.push(filesDir);
        }
        absTarget = await workspaceService.uniquePath(filesDir, safeBase, `.${ext}`);
      } else {
        const dir = path.join(root, asset.kind === "webclip" ? WEBCLIP_DIR : ARTICLE_DIR);
        absTarget = await workspaceService.uniquePath(dir, safeBase, `.${ext}`);
      }
      await writeNew(absTarget, data);
      bundleToRel.set(asset.path, workspaceService.toWorkspaceRel(root, absTarget));
      kindByBundlePath.set(asset.path, asset.kind);
    }

    // Point every reference at the unpacked file; anything that doesn't
    // resolve to a bundled file of the right kind is cleared rather than
    // left to resolve against whatever happens to be in this Dome.
    for (const page of document.pages) {
      for (const list of pageTileLists(page)) {
        visitLocalRefs(list, (ref, field) => {
          const rel = bundleToRel.get(ref);
          return rel && kindByBundlePath.get(ref) === expectedKindForField(field) ? rel : "";
        }, (node) => {
          if (isObject(node.file)) {
            if (node.file.relativePath) {
              node.file.filePath = path.join(root, node.file.relativePath);
            } else {
              delete node.file.filePath;
            }
          }
          if (isObject(node.sticky)) delete node.sticky.filePath;
        });
      }
    }

    document = remapIds(document);
    const canvasId = randomUUID();
    const now = new Date().toISOString();
    const payload = serializeJsonCanvasDocument({
      ...document,
      id: canvasId,
      name: finalName,
      activePageId: document.pages.some((page) => page.id === document.activePageId)
        ? document.activePageId
        : document.pages[0].id,
    }, { id: canvasId, fallbackName: finalName, createdAt: now, updatedAt: now });
    await writeNew(canvasPath, `${JSON.stringify(payload, null, 2)}\n`);

    if (manifest.thumbnail) {
      const thumbEntry = entryByName.get(manifest.thumbnail);
      if (thumbEntry.size <= LIMITS.maxThumbnailBytes) {
        const thumb = await zip.read(thumbEntry);
        if (sniffMatchesExt(thumb, "jpg")) {
          const rel = workspaceService.toWorkspaceRel(root, canvasPath);
          const thumbPath = path.join(root, CANVAS_THUMB_DIR, `${canvasThumbId(rel)}.jpg`);
          await fs.rm(thumbPath, { force: true });
          await writeNew(thumbPath, thumb);
        }
      }
    }

    return {
      filePath: canvasPath,
      path: workspaceService.toWorkspaceRel(root, canvasPath),
      name: finalName,
      assetCount: bundleToRel.size,
      warnings,
    };
  } catch (error) {
    for (const target of written.reverse()) {
      await fs.rm(target, { force: true }).catch(() => {});
    }
    for (const dir of createdDirs.reverse()) {
      await fs.rmdir(dir).catch(() => {});
    }
    throw error;
  } finally {
    await zip.close().catch(() => {});
  }
}

module.exports = {
  LIMITS,
  SHARE_FILE_EXTENSION,
  SHARE_FORMAT,
  SHARE_FORMAT_VERSION,
  exportCanvasShare,
  importCanvasShare,
  isSafeEntryName,
  isShareFilePath,
};
