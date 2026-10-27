const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const {
  DEFAULT_CANVAS_SUFFIX,
  getCanvasSuffix,
  isCanvasPath,
  isJsonCanvasDocument,
  isJsonCanvasPath,
  parseJsonCanvasDocument,
  serializeJsonCanvasDocument,
  stripCanvasSuffix,
} = require("./json-canvas");
// Single source of truth shared with the renderer (renderer/src/lib/workspace.js)
// via shared/workspace-schema.json -- do not hardcode this number here.
const { WORKSPACE_SCHEMA_VERSION } = require("./shared/workspace-schema.json");
// A workspace file with no version field at all predates versioning entirely;
// treat it as the oldest possible version so the renderer's migration chain
// (which also defaults a missing version to 1) runs in full, rather than
// skipping legacy transforms because it was mistaken for already-current.
const UNVERSIONED_WORKSPACE_FALLBACK_VERSION = 1;

const INTERNAL_DIR = ".airpaste";
const TMP_DIR = "tmp";
const DOME_FILE = "dome.json";
const UI_STATE_FILE = "ui-state.json";
const STATE_FILE = "state.json";
const MAX_RECENTS = 25;
const DEFAULT_WORKSPACE_NAME = "Main Canvas";
const CANVAS_THUMB_DIR_SEGMENTS = Object.freeze([INTERNAL_DIR, "previews", "canvas-thumbs"]);
const HISTORY_DIR_SEGMENTS = Object.freeze([INTERNAL_DIR, "history"]);
const MAX_HISTORY_ENTRIES_PER_CANVAS = 20;
// Throttles how often a save creates a history snapshot: a 420ms autosave
// loop firing on every keystroke would otherwise produce a near-useless
// snapshot per edit. forceHistorySnapshot (used when a conflict is
// explicitly overwritten, and when restoring an older version) bypasses this.
const MIN_HISTORY_SNAPSHOT_INTERVAL_MS = 3 * 60 * 1000;
// Process-lifetime only (resets on app restart) -- a missed snapshot after a
// restart just means one fewer checkpoint, never incorrect data.
const lastHistorySnapshotAtByPath = new Map();

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const DOC_EXTS = new Set(["pdf"]);
const SKIP_FILE_EXTS = new Set(["tmp", "bak", "part", "crdownload"]);
const SKIP_FILE_SUFFIXES = [".tmp.driveupload"];
const SKIP_DIRS = new Set([
  INTERNAL_DIR,
  ".git",
  "node_modules",
  "dist",
  "dist-renderer",
  "release",
  "build",
  ".tmp",
  ".tmp.driveupload",
]);

const DEFAULT_DRAWINGS = Object.freeze({
  version: 1,
  objects: [],
});

const DEFAULT_WORKSPACE = Object.freeze({
  version: WORKSPACE_SCHEMA_VERSION,
  activePageId: "page-1",
  pages: [{
    id: "page-1",
    name: "Page 1",
    viewport: { x: 180, y: 120, zoom: 1 },
    tiles: [],
    drawings: DEFAULT_DRAWINGS,
    edges: [],
    groups: [],
    view: null,
  }],
});

const DEFAULT_UI_STATE = Object.freeze({
  version: 3,
  homeView: "grid",
  sortBy: "updatedAt",
  filter: "all",
  selectedSection: "home",
  currentFolderPath: "",
  homeScrollTop: 0,
  canvasSnapToGrid: false,
  canvasSnapGridSize: 32,
  lastOpenedItemPath: null,
  lastOpenedCanvasPath: null,
  lastHomeRoute: {
    selectedSection: "home",
    currentFolderPath: "",
    scrollTop: 0,
  },
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  recentDocumentIds: [],
  starredDocumentIds: [],
});

function nowIso() {
  return new Date().toISOString();
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRel(value, fallback = "") {
  const normalized = String(value ?? "")
    .replaceAll("\\", "/")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  if (!normalized || normalized === ".") {
    return fallback;
  }
  return normalized;
}

function normalizeFolder(value) {
  return normalizeRel(value, "").replace(/\/$/, "");
}

function fileExt(fileName) {
  const ext = path.extname(String(fileName ?? ""));
  return ext ? ext.slice(1).toLowerCase() : "";
}

function stripExt(fileName) {
  const name = String(fileName ?? "");
  return name.slice(0, name.length - path.extname(name).length);
}

function shouldSkipFileName(fileName) {
  const name = String(fileName ?? "").toLowerCase();
  if (!name) {
    return true;
  }

  if (SKIP_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    return true;
  }

  const ext = fileExt(name);
  return SKIP_FILE_EXTS.has(ext);
}

function sanitizeName(name, fallback = "untitled") {
  const normalized = Array.from(String(name ?? ""))
    .map((char) => (char.charCodeAt(0) < 32 ? " " : char))
    .join("")
    .trim()
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  return normalized || fallback;
}

function normalizeDrawingsPayload(drawings) {
  const safeDrawings = isObject(drawings) ? drawings : DEFAULT_DRAWINGS;
  return {
    version: Number.isFinite(safeDrawings.version) ? Math.max(1, Math.round(safeDrawings.version)) : DEFAULT_DRAWINGS.version,
    objects: Array.isArray(safeDrawings.objects) ? safeDrawings.objects : [],
  };
}

function normalizeViewportPayload(viewport) {
  const safeViewport = isObject(viewport) ? viewport : {};
  return {
    x: Number.isFinite(safeViewport.x) ? safeViewport.x : DEFAULT_WORKSPACE.pages[0].viewport.x,
    y: Number.isFinite(safeViewport.y) ? safeViewport.y : DEFAULT_WORKSPACE.pages[0].viewport.y,
    zoom: Number.isFinite(safeViewport.zoom) ? safeViewport.zoom : DEFAULT_WORKSPACE.pages[0].viewport.zoom,
  };
}

function cloneStructuredArray(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => (
    item && typeof item === "object"
      ? JSON.parse(JSON.stringify(item))
      : item
  ));
}

function cloneStructuredValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizePagePayload(page, fallbackIndex = 0) {
  const safePage = isObject(page) ? page : {};
  return {
    id: firstString(safePage.id, `page-${fallbackIndex + 1}`),
    name: firstString(safePage.name, `Page ${fallbackIndex + 1}`),
    viewport: normalizeViewportPayload(safePage.viewport),
    tiles: Array.isArray(safePage.tiles)
      ? safePage.tiles
      : Array.isArray(safePage.cards)
        ? safePage.cards
        : [],
    drawings: normalizeDrawingsPayload(safePage.drawings),
    edges: cloneStructuredArray(safePage.edges),
    groups: cloneStructuredArray(safePage.groups),
    tethers: cloneStructuredArray(safePage.tethers),
    view: safePage.view === null || isObject(safePage.view) ? (safePage.view ?? null) : null,
    airpaste: isObject(safePage.airpaste) ? cloneStructuredValue(safePage.airpaste) : null,
  };
}

function normalizeCanvasPages(raw) {
  if (Array.isArray(raw?.pages) && raw.pages.length > 0) {
    return raw.pages.map((page, index) => normalizePagePayload(page, index));
  }

  return [
    normalizePagePayload({
      id: typeof raw?.activePageId === "string" ? raw.activePageId : "page-1",
      name: "Page 1",
      viewport: raw?.viewport,
      tiles: raw?.cards,
      drawings: raw?.drawings,
      edges: raw?.edges,
      groups: raw?.groups,
      view: raw?.view,
    }, 0),
  ];
}

function internalPath(root) {
  return path.join(root, INTERNAL_DIR);
}

function tmpPath(root) {
  return path.join(internalPath(root), TMP_DIR);
}

function domeMetaPath(root) {
  return path.join(internalPath(root), DOME_FILE);
}

function uiStatePath(root) {
  return path.join(internalPath(root), UI_STATE_FILE);
}

function statePath(root) {
  return path.join(internalPath(root), STATE_FILE);
}

function ensureInside(root, target) {
  const absRoot = path.resolve(root);
  const absTarget = path.resolve(target);
  const rel = path.relative(absRoot, absTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path is outside the selected workspace.");
  }
  return absTarget;
}

function resolveWorkspacePath(root, relativePath = "") {
  return ensureInside(root, path.join(root, normalizeRel(relativePath, "")));
}

function toWorkspaceRel(root, value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error("File path is required.");
  }
  const abs = path.isAbsolute(raw) ? ensureInside(root, raw) : resolveWorkspacePath(root, raw);
  return normalizeRel(path.relative(root, abs), "");
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

// How long ensureWorkspaceScaffold() waits, per attempt, for a
// missing-but-expected Dome file to appear before giving up and reporting it
// as pending sync, rather than immediately fabricating a fresh default in
// its place. A cloud sync client (Google Drive, Dropbox, OneDrive...)
// commonly materializes a folder before the files inside it finish
// downloading, so "not on disk right now" is not the same thing as "never
// existed". Kept short (rather than one long wait) because the renderer's
// boot flow calls this repeatedly in a loop to keep waiting indefinitely --
// short attempts keep that loop responsive to a user-initiated "open anyway"
// override instead of it having to sit through one long wait first.
const DOME_SYNC_WAIT_TIMEOUT_MS = 4000;
const DOME_SYNC_POLL_INTERVAL_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function statOrNull(target) {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

function sameStat(a, b) {
  if (!a || !b) {
    return a === b;
  }
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

// Polls each of `paths` until every one of them has looked identical
// (missing on both samples, or same size+mtime) across two consecutive
// polls, or until timeoutMs elapses -- whichever comes first. A path that
// flips from missing to present, or whose size/mtime is still changing, is
// actively being written (e.g. still downloading), so it never reports
// "settled" while that's happening.
async function waitForPathsToSettle(paths, {
  timeoutMs = DOME_SYNC_WAIT_TIMEOUT_MS,
  pollIntervalMs = DOME_SYNC_POLL_INTERVAL_MS,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let previous = await Promise.all(paths.map((target) => statOrNull(target)));

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const current = await Promise.all(paths.map((target) => statOrNull(target)));
    if (current.every((stat, index) => sameStat(stat, previous[index]))) {
      return { settled: true, missing: paths.filter((_, index) => !current[index]) };
    }
    previous = current;
  }

  return { settled: false, missing: paths.filter((_, index) => !previous[index]) };
}

function domeSyncPendingError(missingPaths) {
  const error = new Error(
    "This Dome's files don't look fully synced to this computer yet. Waiting instead of creating new ones, to avoid overwriting your data.",
  );
  error.code = "DOME_SYNC_PENDING";
  error.pending = missingPaths.map((target) => path.basename(target));
  return error;
}

async function isDirectory(target) {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function readJson(filePath, label) {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) {
      throw new Error(`${label} must contain a JSON object.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} contains invalid JSON.`);
    }
    throw error;
  }
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return await readJson(filePath, path.basename(filePath));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function atomicWriteText(root, targetPath, text) {
  const absTarget = path.resolve(targetPath);
  await ensureInternalDirs(root);
  await fs.mkdir(path.dirname(absTarget), { recursive: true });

  const opId = `${Date.now()}-${randomUUID()}`;
  const tempFile = path.join(tmpPath(root), `${opId}.tmp`);
  const backupFile = path.join(tmpPath(root), `${opId}.bak`);
  const hadExisting = await exists(absTarget);

  await fs.writeFile(tempFile, text, "utf8");

  try {
    if (hadExisting) {
      await fs.rename(absTarget, backupFile);
    }

    await fs.rename(tempFile, absTarget);

    if (hadExisting) {
      await fs.rm(backupFile, { force: true }).catch(() => {});
    }
  } catch (error) {
    await fs.rm(tempFile, { force: true }).catch(() => {});

    if (hadExisting && (await exists(backupFile))) {
      await fs.rename(backupFile, absTarget).catch(() => {});
    }

    throw error;
  }
}

async function atomicWriteJson(root, targetPath, data) {
  await atomicWriteText(root, targetPath, `${JSON.stringify(data, null, 2)}\n`);
}

async function ensureInternalDirs(root) {
  const absRoot = path.resolve(root);
  await fs.mkdir(internalPath(absRoot), { recursive: true });
  await fs.mkdir(tmpPath(absRoot), { recursive: true });
  return absRoot;
}

function normalizeUiState(uiState) {
  const safe = isObject(uiState) ? uiState : {};
  return {
    ...DEFAULT_UI_STATE,
    ...safe,
    version: DEFAULT_UI_STATE.version,
    selectedSection: ["home", "recents", "starred"].includes(safe.selectedSection) ? safe.selectedSection : "home",
    homeView: ["grid", "list", "sheets", "cards"].includes(safe.homeView) ? safe.homeView : "grid",
    sortBy: ["updatedAt", "name", "type"].includes(safe.sortBy) ? safe.sortBy : "updatedAt",
    filter: ["all", "canvases", "assets", "starred"].includes(safe.filter) ? safe.filter : "all",
    currentFolderPath: normalizeFolder(safe.currentFolderPath),
    lastOpenedItemPath: typeof safe.lastOpenedItemPath === "string" ? normalizeRel(safe.lastOpenedItemPath, "") : null,
    lastOpenedCanvasPath: typeof safe.lastOpenedCanvasPath === "string" ? normalizeRel(safe.lastOpenedCanvasPath, "") : null,
  };
}

function normalizeWorkspaceState(data) {
  const safe = isObject(data) ? data : {};
  const recentDocumentIds = Array.isArray(safe.recentDocumentIds)
    ? safe.recentDocumentIds.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  const starredDocumentIds = Array.isArray(safe.starredDocumentIds)
    ? safe.starredDocumentIds.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];

  return {
    version: 1,
    recentDocumentIds: [...new Set(recentDocumentIds)].slice(0, MAX_RECENTS),
    starredDocumentIds: [...new Set(starredDocumentIds)],
  };
}

// A Dome whose root folder exists but is missing one of its .airpaste/*.json
// files is ambiguous: it might genuinely be brand new, or it might be an
// existing Dome that a cloud sync client hasn't finished downloading onto
// this machine yet. Defaults to allowScaffold: true (scaffold whatever's
// missing immediately) because almost every caller here runs against a
// workspace that was already opened earlier in the session -- by that point
// any genuine sync race was already resolved at the one place that matters,
// openWorkspace(), which is the only caller that passes allowScaffold:
// false (waiting for the missing files to settle, and throwing a
// DOME_SYNC_PENDING error instead of fabricating defaults if they're still
// missing afterward) unless the renderer's "open anyway" override opts in.
async function ensureWorkspaceScaffold(root, options = {}) {
  const { allowScaffold = true } = options;
  const absRoot = path.resolve(root);
  if (!(await isDirectory(absRoot))) {
    throw new Error("Selected folder is no longer available.");
  }

  await ensureInternalDirs(absRoot);

  const scaffoldPaths = [domeMetaPath(absRoot), uiStatePath(absRoot), statePath(absRoot)];
  const missingPaths = [];
  for (const target of scaffoldPaths) {
    if (!(await exists(target))) {
      missingPaths.push(target);
    }
  }

  if (missingPaths.length > 0 && !allowScaffold) {
    const { missing: stillMissing } = await waitForPathsToSettle(missingPaths);
    if (stillMissing.length > 0) {
      throw domeSyncPendingError(stillMissing);
    }
  }

  if (!(await exists(domeMetaPath(absRoot)))) {
    await atomicWriteJson(absRoot, domeMetaPath(absRoot), {
      version: 1,
      name: path.basename(absRoot),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  if (!(await exists(uiStatePath(absRoot)))) {
    await atomicWriteJson(absRoot, uiStatePath(absRoot), DEFAULT_UI_STATE);
  }

  if (!(await exists(statePath(absRoot)))) {
    await atomicWriteJson(absRoot, statePath(absRoot), DEFAULT_STATE);
  }

  return absRoot;
}

// Used by the Dome-open IPC layer to decide, before it ever calls
// ensureWorkspaceScaffold, whether a Dome whose dome.json is currently
// missing is worth waiting on (see main/ipc/dome.js's openOrInitializeDome).
async function waitForDomeFilesToSettle(root, options = {}) {
  const absRoot = path.resolve(root);
  const scaffoldPaths = [domeMetaPath(absRoot), uiStatePath(absRoot), statePath(absRoot)];
  return waitForPathsToSettle(scaffoldPaths, options);
}

async function readWorkspaceMeta(root) {
  const absRoot = await ensureWorkspaceScaffold(root);
  const meta = await readJsonIfExists(domeMetaPath(absRoot), {
    version: 1,
    name: path.basename(absRoot),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return {
    version: 1,
    name: firstString(meta.name, path.basename(absRoot)),
    createdAt: typeof meta.createdAt === "string" ? meta.createdAt : nowIso(),
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : nowIso(),
  };
}

async function writeWorkspaceMeta(root, partial = {}) {
  const current = await readWorkspaceMeta(root);
  const next = {
    ...current,
    ...(isObject(partial) ? partial : {}),
    version: 1,
    name: firstString(partial.name, current.name, path.basename(root)),
    updatedAt: nowIso(),
  };
  await atomicWriteJson(root, domeMetaPath(root), next);
  return next;
}

async function readUiState(root) {
  await ensureWorkspaceScaffold(root);
  return normalizeUiState(await readJsonIfExists(uiStatePath(root), DEFAULT_UI_STATE));
}

async function writeUiState(root, partialState) {
  const next = normalizeUiState({
    ...(await readUiState(root)),
    ...(isObject(partialState) ? partialState : {}),
  });
  await atomicWriteJson(root, uiStatePath(root), next);
  return next;
}

async function readWorkspaceState(root) {
  await ensureWorkspaceScaffold(root);
  return normalizeWorkspaceState(await readJsonIfExists(statePath(root), DEFAULT_STATE));
}

async function writeWorkspaceState(root, partialState) {
  const next = normalizeWorkspaceState({
    ...(await readWorkspaceState(root)),
    ...(isObject(partialState) ? partialState : {}),
  });
  await atomicWriteJson(root, statePath(root), next);
  return next;
}

function detectType(fileName) {
  const lower = String(fileName ?? "").toLowerCase();
  if (isCanvasPath(lower)) {
    return "canvas";
  }
  if (lower.endsWith(".md")) {
    return "page";
  }
  const ext = fileExt(lower);
  if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || DOC_EXTS.has(ext)) {
    return "asset";
  }
  return "file";
}

function detectEntryType(stats, entryName) {
  if (stats?.isDirectory?.()) {
    return "folder";
  }
  return detectType(entryName);
}

function legacyDocumentId(relativePath) {
  return `legacy-${createHash("sha1").update(normalizeRel(relativePath, "")).digest("hex")}`;
}

async function uniquePath(dir, baseName, suffix) {
  let nextPath = path.join(dir, `${baseName}${suffix}`);
  let index = 2;
  while (await exists(nextPath)) {
    nextPath = path.join(dir, `${baseName} ${index}${suffix}`);
    index += 1;
  }
  return nextPath;
}

async function workspaceRootFromFile(filePath) {
  let dir = path.dirname(path.resolve(filePath));
  while (true) {
    if (await exists(path.join(dir, INTERNAL_DIR))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function mapScannedItemForResponse(root, item, state) {
  const starredIds = new Set(state.starredDocumentIds);
  const pages = Array.isArray(item.pages)
    ? item.pages.map((page, index) => ({
      id: firstString(page?.id, `page-${index + 1}`),
      name: firstString(page?.name, `Page ${index + 1}`),
    }))
    : [];
  const response = {
    id: item.id ?? null,
    path: item.path,
    filePath: resolveWorkspacePath(root, item.path),
    type: item.type,
    name: item.name,
    updatedAt: item.updatedAt,
    starred: item.type !== "folder" && Boolean(item.id && starredIds.has(item.id)),
    thumbnail: null,
    thumbnailPath: null,
    excerpt: item.excerpt ?? "",
    pageCount: Number.isFinite(item.pageCount) ? item.pageCount : 0,
    tileCount: Number.isFinite(item.tileCount) ? item.tileCount : 0,
    pages,
  };

  if (item.type === "canvas" && typeof item.path === "string" && item.path.trim()) {
    const normalizedRelPath = normalizeRel(item.path, "");
    const thumbId = createHash("sha1").update(normalizedRelPath).digest("hex").slice(0, 20);
    const thumbRelPath = normalizeRel(path.join(...CANVAS_THUMB_DIR_SEGMENTS, `${thumbId}.jpg`), "");
    const thumbAbsPath = path.join(root, thumbRelPath);
    response.thumbnailPath = fsSync.existsSync(thumbAbsPath) ? thumbRelPath : null;
  }

  return response;
}

function compareUpdatedDesc(a, b) {
  if (a.updatedAt === b.updatedAt) {
    return a.name.localeCompare(b.name);
  }
  return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
}

// scanWorkspace() runs on nearly every home navigation and canvas open, and
// used to re-parse every canvas file's full JSON on every single call just
// to report its name/page/tile counts -- for a Dome with many canvases,
// that's an O(n) full-file-read-and-parse on every listing, every time. This
// cache lets a scan reuse the last parse for any canvas whose size and mtime
// haven't changed since then, so only files that actually changed (or are
// new) get re-read. Rebuilt fresh each scan (old entries simply aren't
// copied forward) rather than mutated in place, so a removed/renamed file's
// entry is naturally dropped instead of growing unbounded over a long
// session. Process-lifetime only, like the history-snapshot throttle.
const canvasScanCacheByRoot = new Map();

async function scanWorkspace(folderPath) {
  const root = await ensureWorkspaceScaffold(folderPath);
  const previousCanvasCache = canvasScanCacheByRoot.get(root) ?? new Map();
  const nextCanvasCache = new Map();
  const items = [];
  const stack = [root];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      const relPath = normalizeRel(path.relative(root, absPath), "");

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        const stat = await fs.stat(absPath);
        items.push({
          id: null,
          path: relPath,
          type: "folder",
          name: entry.name,
          updatedAt: stat.mtime.toISOString(),
          excerpt: "",
        });
        stack.push(absPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (shouldSkipFileName(entry.name)) {
        continue;
      }

      const type = detectType(entry.name);
      const stat = await fs.stat(absPath);

      if (type === "canvas") {
        const cached = previousCanvasCache.get(relPath);
        let item;

        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
          item = cached.item;
        } else {
          let raw = {};
          try {
            raw = await readJson(absPath, entry.name);
          } catch {
            raw = {};
          }

          const workspaceDocument = isJsonCanvasDocument(raw) || isJsonCanvasPath(absPath)
            ? parseJsonCanvasDocument(raw, stripCanvasSuffix(entry.name))
            : {
              pages: normalizeCanvasPages(raw),
            };
          const pages = Array.isArray(workspaceDocument.pages) ? workspaceDocument.pages : [];
          const tileCount = pages.reduce((total, page) => {
            if (Array.isArray(page?.tiles)) {
              return total + page.tiles.length;
            }
            if (Array.isArray(page?.cards)) {
              return total + page.cards.length;
            }
            return total;
          }, 0);

          item = {
            id: firstString(raw.id, legacyDocumentId(relPath)),
            path: relPath,
            type,
            name: firstString(workspaceDocument.name, raw.name, stripCanvasSuffix(entry.name), "Canvas"),
            updatedAt: stat.mtime.toISOString(),
            excerpt: "",
            pageCount: pages.length,
            tileCount,
            pages: pages.map((page, index) => ({
              id: firstString(page?.id, `page-${index + 1}`),
              name: firstString(page?.name, `Page ${index + 1}`),
            })),
          };
        }

        nextCanvasCache.set(relPath, { mtimeMs: stat.mtimeMs, size: stat.size, item });
        items.push(item);
        continue;
      }

      items.push({
        id: type === "page" ? legacyDocumentId(relPath) : null,
        path: relPath,
        type,
        name: type === "asset" || type === "page" ? stripExt(entry.name) || entry.name : entry.name,
        updatedAt: stat.mtime.toISOString(),
        excerpt: "",
      });
    }
  }

  canvasScanCacheByRoot.set(root, nextCanvasCache);

  return {
    folderPath: root,
    workspace: await readWorkspaceMeta(root),
    items: items.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

async function openWorkspace(folderPath, options = {}) {
  // The one call site that defaults to the protective sync-settle wait
  // (ensureWorkspaceScaffold's own default is allowScaffold: true, since
  // every other caller runs against an already-opened workspace) -- this is
  // where a genuinely mid-sync Dome gets caught before anything is
  // fabricated in its place. Also deliberately does not touch dome.json
  // just because the Dome was opened -- a plain open should never write
  // anything, both so a read-only session produces zero disk activity to
  // race a concurrent cloud sync against, and so "I opened the app" can
  // never by itself explain a changed file.
  const root = await ensureWorkspaceScaffold(folderPath, { allowScaffold: options.allowScaffold === true });
  return {
    folderPath: root,
    workspace: await readWorkspaceMeta(root),
  };
}

// Where this canvas's history snapshots live: one subfolder per canvas (by
// hash of its workspace-relative path, same scheme as the thumbnail cache),
// so renaming/moving the canvas doesn't silently orphan its history as long
// as the path stays stable; a renamed canvas starting fresh history is an
// acceptable tradeoff for not having to migrate a whole directory on rename.
function historyDirFor(root, abs) {
  const rel = normalizeRel(path.relative(root, abs), "");
  const id = createHash("sha1").update(rel).digest("hex").slice(0, 20);
  return path.join(root, ...HISTORY_DIR_SEGMENTS, id);
}

async function snapshotCanvasHistory(root, abs, content, { force = false } = {}) {
  try {
    const now = Date.now();
    const last = lastHistorySnapshotAtByPath.get(abs) ?? 0;
    if (!force && now - last < MIN_HISTORY_SNAPSHOT_INTERVAL_MS) {
      return;
    }
    lastHistorySnapshotAtByPath.set(abs, now);

    const dir = historyDirFor(root, abs);
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(path.join(dir, `${stamp}.json`), `${JSON.stringify(content, null, 2)}\n`, "utf8");

    const entries = (await fs.readdir(dir).catch(() => [])).filter((name) => name.endsWith(".json")).sort();
    const excess = entries.length - MAX_HISTORY_ENTRIES_PER_CANVAS;
    if (excess > 0) {
      await Promise.all(entries.slice(0, excess).map((name) => fs.rm(path.join(dir, name), { force: true }).catch(() => {})));
    }
  } catch {
    // History is a convenience, never a requirement for the save itself to
    // succeed -- a snapshot that fails to write (disk full, permissions)
    // should not block or fail the actual save.
  }
}

async function listCanvasHistory(filePath) {
  const abs = path.resolve(filePath);
  const root = await workspaceRootFromFile(abs);
  if (!root) {
    throw new Error("Could not resolve the workspace for this canvas.");
  }

  const dir = historyDirFor(root, abs);
  const entries = await fs.readdir(dir).catch(() => []);
  const items = await Promise.all(
    entries.filter((name) => name.endsWith(".json")).map(async (name) => {
      const stat = await fs.stat(path.join(dir, name)).catch(() => null);
      return stat ? { id: name, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size } : null;
    }),
  );
  return items.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function restoreCanvasHistoryEntry(filePath, entryId) {
  const abs = path.resolve(filePath);
  const root = await workspaceRootFromFile(abs);
  if (!root) {
    throw new Error("Could not resolve the workspace for this canvas.");
  }

  const dir = historyDirFor(root, abs);
  // entryId always comes from a prior listCanvasHistory() result, but
  // basename it anyway so nothing it contains (eg "../../x") can escape dir.
  const snapshotPath = path.join(dir, path.basename(String(entryId ?? "")));
  ensureInside(dir, snapshotPath);
  const snapshotRaw = await fs.readFile(snapshotPath, "utf8");
  const snapshotData = JSON.parse(snapshotRaw);

  // The content being replaced is itself snapshotted first (forced, bypassing
  // the throttle) so restoring an older version is always itself undoable --
  // never a one-way door.
  const current = (await exists(abs)) ? await readJson(abs, path.basename(abs)) : {};
  await snapshotCanvasHistory(root, abs, current, { force: true });

  await atomicWriteJson(root, abs, snapshotData);
  return loadCanvas(abs);
}

async function loadCanvas(filePath) {
  const abs = path.resolve(filePath);
  if (!isCanvasPath(abs)) {
    throw new Error('Canvas path must end with ".canvas" or ".airpaste.json".');
  }

  const root = await workspaceRootFromFile(abs);
  if (!root) {
    throw new Error("Could not resolve the workspace for this canvas.");
  }

  ensureInside(root, abs);
  const raw = await readJson(abs, path.basename(abs));
  const stat = await fs.stat(abs);
  const rel = toWorkspaceRel(root, abs);

  const workspace = isJsonCanvasDocument(raw) || isJsonCanvasPath(abs)
    ? parseJsonCanvasDocument(raw, stripCanvasSuffix(path.basename(abs)))
    : {
      version: Number.isFinite(raw.version) ? raw.version : UNVERSIONED_WORKSPACE_FALLBACK_VERSION,
      name: firstString(raw.name, stripCanvasSuffix(path.basename(abs)), "Canvas"),
      activePageId: firstString(raw.activePageId, DEFAULT_WORKSPACE.activePageId),
      pages: normalizeCanvasPages(raw),
      airpaste: isObject(raw.airpaste) ? cloneStructuredValue(raw.airpaste) : null,
    };

  await recordRecentItem(root, abs);

  return {
    id: firstString(raw.id, legacyDocumentId(rel)),
    type: "canvas",
    path: rel,
    filePath: abs,
    name: workspace.name,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    workspace,
  };
}

async function saveCanvas(filePath, data, options = null) {
  const abs = path.resolve(filePath);
  if (!isCanvasPath(abs)) {
    throw new Error('Canvas path must end with ".canvas" or ".airpaste.json".');
  }

  const root = await workspaceRootFromFile(abs);
  if (!root) {
    throw new Error("Could not resolve the workspace for this canvas.");
  }

  ensureInside(root, abs);
  // A canvas file is always created up front (createCanvas writes it
  // directly), so by the time anything calls saveCanvas the file should
  // already be on disk. If it isn't, that's far more likely to mean a cloud
  // sync client hasn't finished downloading it onto this machine yet than
  // that it's genuinely new -- settle-check before deciding, and refuse to
  // save over it as if it were empty if it's still missing afterward, since
  // that would overwrite whatever content was about to arrive.
  if (!(await exists(abs))) {
    const { missing } = await waitForPathsToSettle([abs]);
    if (missing.length > 0) {
      throw new Error(
        `"${path.basename(abs)}" appears to be missing or still syncing from the cloud. Not saving, to avoid overwriting it -- try again once it has finished syncing.`,
      );
    }
  }

  const saveOptions = isObject(options) ? options : {};

  // Conflict detection: the caller (the renderer) remembers the updatedAt it
  // last synced its in-memory copy with -- from loadCanvas, or from this
  // canvas's own previous save -- and sends it back as expectedUpdatedAt. If
  // the file's actual on-disk timestamp has moved since then, something else
  // wrote to it in the meantime (another PC's edit arriving via cloud sync,
  // another process, a manual edit) and this save would silently clobber it.
  // Refuse instead and let the caller decide (keep mine / use the other
  // version) rather than merging blind.
  if (typeof saveOptions.expectedUpdatedAt === "string" && saveOptions.expectedUpdatedAt) {
    const diskStat = await fs.stat(abs).catch(() => null);
    const actualUpdatedAt = diskStat ? diskStat.mtime.toISOString() : null;
    if (actualUpdatedAt && actualUpdatedAt !== saveOptions.expectedUpdatedAt) {
      const error = new Error(`"${path.basename(abs)}" was changed elsewhere since you opened it.`);
      error.code = "CANVAS_CONFLICT";
      error.updatedAt = actualUpdatedAt;
      throw error;
    }
  }

  const current = (await exists(abs)) ? await readJson(abs, path.basename(abs)) : {};
  const currentWorkspace = isJsonCanvasDocument(current) || isJsonCanvasPath(abs)
    ? parseJsonCanvasDocument(current, stripCanvasSuffix(path.basename(abs)))
    : {
      version: Number.isFinite(current.version) ? current.version : UNVERSIONED_WORKSPACE_FALLBACK_VERSION,
      name: firstString(current.name, stripCanvasSuffix(path.basename(abs)), "Canvas"),
      activePageId: firstString(current.activePageId, DEFAULT_WORKSPACE.activePageId),
      pages: normalizeCanvasPages(current),
      airpaste: isObject(current.airpaste) ? cloneStructuredValue(current.airpaste) : null,
    };
  const input = isObject(data) ? data : {};
  const nextName = firstString(input.name, currentWorkspace.name, stripCanvasSuffix(path.basename(abs)), "Canvas");
  const basePages = Array.isArray(input.pages) ? input.pages : Array.isArray(currentWorkspace.pages) ? currentWorkspace.pages : null;
  // A pan/zoom-only autosave sends just { pageViewports: { [pageId]: viewport } }
  // instead of every page with all its tiles; patch those onto the pages.
  const pageViewports = isObject(input.pageViewports) ? input.pageViewports : null;
  const nextPages = normalizeCanvasPages({
    pages: pageViewports && basePages
      ? basePages.map((page) => (isObject(pageViewports[page?.id]) ? { ...page, viewport: pageViewports[page.id] } : page))
      : basePages,
    activePageId: input.activePageId ?? currentWorkspace.activePageId,
    viewport: input.viewport ?? currentWorkspace.viewport,
    cards: input.cards ?? currentWorkspace.cards,
    drawings: input.drawings ?? currentWorkspace.drawings,
    edges: input.edges ?? currentWorkspace.edges,
    groups: input.groups ?? currentWorkspace.groups,
    view: input.view ?? currentWorkspace.view,
  });
  const nextWorkspace = {
    // Always the current schema version, never carried over from the file on
    // disk: the renderer has already normalized `pages` to the current shape
    // before calling saveCanvas (see renderer/src/lib/workspace.js's
    // normalizeWorkspace), even on a partial/dirty-field save, so the file's
    // stamped version must advance too. Persisting a stale version here was
    // the bug that let on-disk files report an outdated schema version
    // forever (see rewrite plan Phase 1A).
    version: WORKSPACE_SCHEMA_VERSION,
    id: firstString(current.id, input.id, randomUUID()),
    name: nextName,
    activePageId: firstString(
      input.activePageId,
      currentWorkspace.activePageId,
      nextPages[0]?.id,
      DEFAULT_WORKSPACE.activePageId,
    ),
    pages: nextPages,
    airpaste: isObject(input.airpaste)
      ? cloneStructuredValue(input.airpaste)
      : isObject(currentWorkspace.airpaste)
        ? cloneStructuredValue(currentWorkspace.airpaste)
        : null,
  };
  const payload = isJsonCanvasPath(abs)
    ? serializeJsonCanvasDocument(nextWorkspace, {
      id: nextWorkspace.id,
      fallbackName: stripCanvasSuffix(path.basename(abs)),
      createdAt: typeof current.createdAt === "string" ? current.createdAt : nowIso(),
      updatedAt: nowIso(),
    })
    : {
      version: WORKSPACE_SCHEMA_VERSION,
      type: "canvas",
      id: nextWorkspace.id,
      name: nextWorkspace.name,
      createdAt: typeof current.createdAt === "string" ? current.createdAt : nowIso(),
      updatedAt: nowIso(),
      activePageId: nextWorkspace.activePageId,
      pages: nextWorkspace.pages,
      airpaste: nextWorkspace.airpaste,
    };

  // Snapshot what's about to be overwritten into history before writing the
  // new content, so a bad save (or an explicit conflict override -- see
  // forceHistorySnapshot) is never a one-way door. Throttled under normal
  // editing (see snapshotCanvasHistory) so a 420ms autosave loop doesn't
  // produce a snapshot per keystroke.
  await snapshotCanvasHistory(root, abs, current, { force: saveOptions.forceHistorySnapshot === true });

  await atomicWriteJson(root, abs, payload);
  const finalStat = await fs.stat(abs);
  const finalUpdatedAt = finalStat.mtime.toISOString();
  const rel = toWorkspaceRel(root, abs);

  if (saveOptions.returnWorkspace !== false) {
    await recordRecentItem(root, abs);
    return loadCanvas(abs);
  }

  return {
    type: "canvas",
    path: rel,
    filePath: abs,
    updatedAt: finalUpdatedAt,
    changedKeys: Array.isArray(saveOptions.changedKeys) ? saveOptions.changedKeys : [],
  };
}

async function createCanvas(folderPath, name, targetFolderPath = "") {
  const root = await ensureWorkspaceScaffold(folderPath);
  const targetDir = resolveWorkspacePath(root, normalizeFolder(targetFolderPath));
  await fs.mkdir(targetDir, { recursive: true });

  const filePath = await uniquePath(
    targetDir,
    sanitizeName(firstString(name, "Canvas"), "Canvas"),
    DEFAULT_CANVAS_SUFFIX,
  );
  const canvasId = randomUUID();

  await atomicWriteJson(root, filePath, serializeJsonCanvasDocument({
    version: DEFAULT_WORKSPACE.version,
    id: canvasId,
    name: stripCanvasSuffix(path.basename(filePath)),
    activePageId: DEFAULT_WORKSPACE.activePageId,
    pages: DEFAULT_WORKSPACE.pages,
    airpaste: null,
  }, {
    id: canvasId,
    fallbackName: stripCanvasSuffix(path.basename(filePath)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));

  return loadCanvas(filePath);
}

async function renameFile(root, filePath, nextName) {
  const absRoot = await ensureWorkspaceScaffold(root);
  const rel = toWorkspaceRel(absRoot, filePath);
  const abs = resolveWorkspacePath(absRoot, rel);

  if (!(await exists(abs))) {
    throw new Error("The selected file no longer exists.");
  }

  const type = detectType(path.basename(abs));
  if (type !== "canvas") {
    throw new Error("Only canvas files can be renamed from AirPaste.");
  }

  const nextBaseName = sanitizeName(nextName, "Canvas");
  const currentBaseName = stripCanvasSuffix(path.basename(abs));

  if (currentBaseName === nextBaseName) {
    return loadCanvas(abs);
  }

  const renamed = await uniquePath(path.dirname(abs), nextBaseName, getCanvasSuffix(abs));
  await fs.rename(abs, renamed);

  const raw = await readJson(renamed, path.basename(renamed));
  raw.name = nextBaseName;
  raw.updatedAt = nowIso();
  await atomicWriteJson(absRoot, renamed, raw);

  const uiState = await readUiState(absRoot);
  if (uiState.lastOpenedItemPath === rel) {
    uiState.lastOpenedItemPath = toWorkspaceRel(absRoot, renamed);
  }
  if (uiState.lastOpenedCanvasPath === rel) {
    uiState.lastOpenedCanvasPath = toWorkspaceRel(absRoot, renamed);
  }
  await atomicWriteJson(absRoot, uiStatePath(absRoot), uiState);

  return loadCanvas(renamed);
}

async function deleteFile(root, filePath) {
  const absRoot = await ensureWorkspaceScaffold(root);
  const rel = toWorkspaceRel(absRoot, filePath);
  const abs = resolveWorkspacePath(absRoot, rel);

  if (!(await exists(abs))) {
    return { deleted: false };
  }

  const type = detectType(path.basename(abs));
  if (type !== "canvas") {
    throw new Error("Only canvas files can be deleted from AirPaste.");
  }

  let deletedId = null;
  try {
    const raw = await readJson(abs, path.basename(abs));
    deletedId = firstString(raw.id);
  } catch {
    deletedId = null;
  }

  await fs.rm(abs, { force: true });

  if (deletedId) {
    const state = await readWorkspaceState(absRoot);
    await writeWorkspaceState(absRoot, {
      recentDocumentIds: state.recentDocumentIds.filter((id) => id !== deletedId),
      starredDocumentIds: state.starredDocumentIds.filter((id) => id !== deletedId),
    });
  }

  const uiState = await readUiState(absRoot);
  if (uiState.lastOpenedItemPath === rel) {
    uiState.lastOpenedItemPath = null;
  }
  if (uiState.lastOpenedCanvasPath === rel) {
    uiState.lastOpenedCanvasPath = null;
  }
  await atomicWriteJson(absRoot, uiStatePath(absRoot), uiState);

  return { deleted: true, path: rel };
}

async function listFiles(root) {
  const scan = await scanWorkspace(root);
  const state = await readWorkspaceState(root);
  return scan.items.map((item) => mapScannedItemForResponse(root, item, state)).sort(compareUpdatedDesc);
}

async function getItemForFilePath(root, filePath) {
  const scan = await scanWorkspace(root);
  const state = await readWorkspaceState(root);
  const rel = toWorkspaceRel(root, filePath);
  const item = scan.items.find((entry) => entry.path === rel);
  return item ? mapScannedItemForResponse(root, item, state) : null;
}

async function recordRecentItem(root, filePath) {
  const scan = await scanWorkspace(root);
  const rel = toWorkspaceRel(root, filePath);
  const item = scan.items.find((entry) => entry.path === rel);
  if (!item?.id) {
    throw new Error("The selected file no longer exists.");
  }

  const state = await readWorkspaceState(root);
  const recentDocumentIds = [item.id, ...state.recentDocumentIds.filter((id) => id !== item.id)].slice(0, MAX_RECENTS);
  await writeWorkspaceState(root, { recentDocumentIds });

  const uiState = await readUiState(root);
  uiState.lastOpenedItemPath = rel;
  if (item.type === "canvas") {
    uiState.lastOpenedCanvasPath = rel;
  }
  await atomicWriteJson(root, uiStatePath(root), uiState);

  return recentDocumentIds;
}

async function markItemStarred(root, filePath, starred) {
  const scan = await scanWorkspace(root);
  const rel = toWorkspaceRel(root, filePath);
  const item = scan.items.find((entry) => entry.path === rel);
  if (!item?.id) {
    throw new Error("The selected file no longer exists.");
  }

  const state = await readWorkspaceState(root);
  const starredDocumentIds = starred === true
    ? [...new Set([...state.starredDocumentIds, item.id])]
    : state.starredDocumentIds.filter((id) => id !== item.id);

  await writeWorkspaceState(root, { starredDocumentIds });
  return mapScannedItemForResponse(root, item, { ...state, starredDocumentIds });
}

async function getRecentItems(root) {
  const scan = await scanWorkspace(root);
  const state = await readWorkspaceState(root);
  const byId = new Map(scan.items.filter((item) => item.id).map((item) => [item.id, item]));
  return state.recentDocumentIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((item) => mapScannedItemForResponse(root, item, state));
}

async function getStarredItems(root) {
  const scan = await scanWorkspace(root);
  const state = await readWorkspaceState(root);
  const starredIds = new Set(state.starredDocumentIds);
  return scan.items
    .filter((item) => item.id && starredIds.has(item.id))
    .map((item) => mapScannedItemForResponse(root, item, state))
    .sort(compareUpdatedDesc);
}

function folderSet(items) {
  const set = new Set([""]);
  for (const item of items) {
    if (item.type === "folder") {
      set.add(normalizeFolder(item.path));
    }
    const parts = item.path.split("/");
    let cursor = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      cursor = cursor ? `${cursor}/${parts[index]}` : parts[index];
      set.add(cursor);
    }
  }
  return set;
}

async function getHomeData(root, requestedFolderPath = null) {
  const scan = await scanWorkspace(root);
  const state = await readWorkspaceState(root);
  const uiState = await readUiState(root);
  const items = scan.items.map((item) => mapScannedItemForResponse(root, item, state));
  const folders = folderSet(items);

  let currentFolderPath = normalizeFolder(requestedFolderPath ?? uiState.currentFolderPath);
  if (!folders.has(currentFolderPath)) {
    currentFolderPath = "";
  }

  if (currentFolderPath !== uiState.currentFolderPath) {
    await writeUiState(root, { currentFolderPath });
  }

  const folderEntriesMap = new Map();
  const files = [];

  for (const item of items) {
    if (item.type === "folder") {
      const folderPath = normalizeFolder(item.path);
      const parent = normalizeFolder(path.posix.dirname(folderPath));
      const normalizedParent = parent === "." ? "" : parent;
      if (normalizedParent === currentFolderPath) {
        folderEntriesMap.set(folderPath, {
          type: "folder",
          path: folderPath,
          filePath: item.filePath,
          name: item.name,
          updatedAt: item.updatedAt,
        });
      }
      continue;
    }

    const parent = normalizeFolder(path.posix.dirname(item.path));
    if ((parent === "." ? "" : parent) === currentFolderPath) {
      files.push(item);
      continue;
    }

    const prefix = currentFolderPath ? `${currentFolderPath}/` : "";
    if (!item.path.startsWith(prefix)) {
      continue;
    }

    const rest = item.path.slice(prefix.length);
    const first = rest.split("/")[0];
    if (!first || !rest.includes("/")) {
      continue;
    }

    const folderPath = currentFolderPath ? `${currentFolderPath}/${first}` : first;
    const existing = folderEntriesMap.get(folderPath);
    if (!existing || existing.updatedAt < item.updatedAt) {
      folderEntriesMap.set(folderPath, {
        type: "folder",
        path: folderPath,
        name: first,
        updatedAt: item.updatedAt,
      });
    }
  }

  const byId = new Map(items.filter((item) => item.id).map((item) => [item.id, item]));
  const recentItems = state.recentDocumentIds.map((id) => byId.get(id)).filter(Boolean);
  const starredItems = items.filter((item) => item.starred);

  return {
    workspace: {
      name: scan.workspace.name,
      createdAt: scan.workspace.createdAt,
      updatedAt: scan.workspace.updatedAt,
    },
    currentFolderPath,
    folders: [...folderEntriesMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    files: files.sort(compareUpdatedDesc),
    allFiles: items.sort(compareUpdatedDesc),
    recentItems,
    starredItems: starredItems.sort(compareUpdatedDesc),
    uiState: await readUiState(root),
  };
}

async function loadUiState(root) {
  return readUiState(root);
}

async function saveUiState(root, partialState) {
  return writeUiState(root, partialState);
}

async function pickPrimaryCanvas(root) {
  const scan = await scanWorkspace(root);
  const uiState = await readUiState(root);

  if (uiState.lastOpenedCanvasPath) {
    const candidate = scan.items.find((item) => item.type === "canvas" && item.path === uiState.lastOpenedCanvasPath);
    if (candidate) {
      return resolveWorkspacePath(root, candidate.path);
    }
  }

  const firstCanvas = scan.items
    .filter((item) => item.type === "canvas")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];

  return firstCanvas ? resolveWorkspacePath(root, firstCanvas.path) : null;
}

async function readWorkspaceDocument(root) {
  const canvasPath = await pickPrimaryCanvas(root);
  if (!canvasPath) {
    return { ...DEFAULT_WORKSPACE };
  }
  const canvas = await loadCanvas(canvasPath);
  return canvas.workspace;
}

async function saveWorkspace(root, data) {
  let canvasPath = await pickPrimaryCanvas(root);
  if (!canvasPath) {
    const created = await createCanvas(root, DEFAULT_WORKSPACE_NAME);
    canvasPath = created.filePath;
  }
  const saved = await saveCanvas(canvasPath, data);
  return saved.workspace;
}

async function loadWorkspace(root, options = {}) {
  const opened = await openWorkspace(root, options);
  return { folderPath: opened.folderPath };
}

async function createWorkspace(root, options = {}) {
  const opened = await openWorkspace(root, options);
  return { folderPath: opened.folderPath };
}

async function isValidWorkspace(root) {
  if (!(await isDirectory(root))) {
    return false;
  }
  return exists(domeMetaPath(path.resolve(root)));
}

async function inspectDome(root) {
  const absRoot = path.resolve(root);
  if (!(await isDirectory(absRoot))) {
    return {
      exists: false,
      valid: false,
      reason: "missing",
      path: absRoot,
      name: path.basename(absRoot),
    };
  }

  const valid = await exists(domeMetaPath(absRoot));
  let name = path.basename(absRoot);

  if (valid) {
    try {
      const meta = await readJson(domeMetaPath(absRoot), DOME_FILE);
      name = firstString(meta.name, name);
    } catch {
      // Ignore invalid metadata and fall back to folder name.
    }
  }

  return {
    exists: true,
    valid,
    reason: valid ? "valid" : "uninitialized",
    path: absRoot,
    name,
  };
}

async function createDome(root, name = "") {
  const absRoot = path.resolve(root);
  await fs.mkdir(absRoot, { recursive: true });
  // This Dome is being created right now by this call, so there is nothing
  // to wait for -- skip the sync-settle check and scaffold immediately.
  await ensureWorkspaceScaffold(absRoot, { allowScaffold: true });
  const meta = await writeWorkspaceMeta(absRoot, {
    name: firstString(name, path.basename(absRoot)),
  });
  return {
    id: createHash("sha1").update(absRoot.toLowerCase()).digest("hex").slice(0, 16),
    name: meta.name,
    path: absRoot,
  };
}

function resolveWorkspaceAssetPath(root, relativePath) {
  if (!root || !relativePath) {
    return null;
  }

  try {
    return resolveWorkspacePath(root, relativePath);
  } catch {
    return null;
  }
}

async function importImageAsset(root, payload) {
  const absRoot = await ensureWorkspaceScaffold(root);
  if (!isObject(payload)) {
    throw new Error("Image import payload is required.");
  }

  const sourcePath = firstString(payload.sourcePath);
  if (!sourcePath) {
    throw new Error("Image import payload is missing sourcePath.");
  }

  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStat?.isFile()) {
    throw new Error("The selected image file could not be found.");
  }

  const ext = fileExt(payload.fileName || sourcePath) || "png";
  const fileName = await uniquePath(
    absRoot,
    sanitizeName(stripExt(firstString(payload.fileName, path.basename(sourcePath), `asset-${randomUUID()}`)), "asset"),
    `.${ext}`,
  );

  await fs.copyFile(sourcePath, fileName);

  return {
    relativePath: toWorkspaceRel(absRoot, fileName),
    fileName: path.basename(fileName),
    mimeType: firstString(payload.mimeType),
    sizeBytes: sourceStat.size,
    width: Number.isFinite(payload.width) ? Math.max(0, payload.width) : 0,
    height: Number.isFinite(payload.height) ? Math.max(0, payload.height) : 0,
  };
}

async function createFolder(root, name, targetFolderPath = "") {
  const absRoot = await ensureWorkspaceScaffold(root);
  const targetDir = resolveWorkspacePath(absRoot, normalizeFolder(targetFolderPath));
  await fs.mkdir(targetDir, { recursive: true });

  const baseName = sanitizeName(firstString(name, "Folder"), "Folder");
  let folderPath = path.join(targetDir, baseName);
  let suffix = 2;
  while (await exists(folderPath)) {
    folderPath = path.join(targetDir, `${baseName} ${suffix}`);
    suffix += 1;
  }

  await fs.mkdir(folderPath, { recursive: true });
  const stat = await fs.stat(folderPath);
  return {
    type: "folder",
    path: toWorkspaceRel(absRoot, folderPath),
    filePath: folderPath,
    name: path.basename(folderPath),
    updatedAt: stat.mtime.toISOString(),
    starred: false,
    excerpt: "",
  };
}

function remapUiStatePath(currentPath, fromRel, toRel) {
  if (currentPath === fromRel) {
    return toRel;
  }
  if (typeof currentPath === "string" && currentPath.startsWith(`${fromRel}/`)) {
    return `${toRel}${currentPath.slice(fromRel.length)}`;
  }
  return currentPath;
}

async function renameEntry(root, entryPath, nextName) {
  const absRoot = await ensureWorkspaceScaffold(root);
  const rel = toWorkspaceRel(absRoot, entryPath);
  const abs = resolveWorkspacePath(absRoot, rel);

  if (!(await exists(abs))) {
    throw new Error("The selected entry no longer exists.");
  }

  const stats = await fs.stat(abs);
  const type = detectEntryType(stats, path.basename(abs));

  if (type === "canvas") {
    return renameFile(absRoot, abs, nextName);
  }

  const nextBaseName = sanitizeName(nextName, type === "folder" ? "Folder" : "File");
  const extension = type === "asset" || type === "file" || type === "page" ? path.extname(abs) : "";
  const currentBaseName = type === "folder" ? path.basename(abs) : stripExt(path.basename(abs));

  if (currentBaseName === nextBaseName) {
    const item = await getItemForFilePath(absRoot, abs);
    if (item) {
      return item;
    }
  }

  let renamed = type === "folder"
    ? path.join(path.dirname(abs), nextBaseName)
    : path.join(path.dirname(abs), `${nextBaseName}${extension}`);
  let suffix = 2;
  while (await exists(renamed)) {
    renamed = type === "folder"
      ? path.join(path.dirname(abs), `${nextBaseName} ${suffix}`)
      : path.join(path.dirname(abs), `${nextBaseName} ${suffix}${extension}`);
    suffix += 1;
  }

  await fs.rename(abs, renamed);

  const nextRel = toWorkspaceRel(absRoot, renamed);
  if (type === "page") {
    const previousId = legacyDocumentId(rel);
    const nextId = legacyDocumentId(nextRel);
    const state = await readWorkspaceState(absRoot);
    await writeWorkspaceState(absRoot, {
      recentDocumentIds: state.recentDocumentIds.map((id) => (id === previousId ? nextId : id)),
      starredDocumentIds: state.starredDocumentIds.map((id) => (id === previousId ? nextId : id)),
    });
  }

  const uiState = await readUiState(absRoot);
  uiState.currentFolderPath = remapUiStatePath(uiState.currentFolderPath, rel, nextRel) ?? "";
  uiState.lastOpenedItemPath = remapUiStatePath(uiState.lastOpenedItemPath, rel, nextRel) ?? null;
  uiState.lastOpenedCanvasPath = remapUiStatePath(uiState.lastOpenedCanvasPath, rel, nextRel) ?? null;
  await atomicWriteJson(absRoot, uiStatePath(absRoot), uiState);

  const stat = await fs.stat(renamed);
  return {
    type,
    path: nextRel,
    filePath: renamed,
    name: path.basename(renamed, extension || undefined),
    updatedAt: stat.mtime.toISOString(),
    starred: false,
    excerpt: "",
  };
}

async function deleteEntry(root, entryPath) {
  const absRoot = await ensureWorkspaceScaffold(root);
  const rel = toWorkspaceRel(absRoot, entryPath);
  const abs = resolveWorkspacePath(absRoot, rel);

  if (!(await exists(abs))) {
    return { deleted: false };
  }

  const stats = await fs.stat(abs);
  const type = detectEntryType(stats, path.basename(abs));

  if (type === "canvas") {
    return deleteFile(absRoot, abs);
  }

  if (type === "page") {
    let deletedId = null;
    try {
      deletedId = legacyDocumentId(rel);
    } catch {
      deletedId = null;
    }

    await fs.rm(abs, { force: true });

    if (deletedId) {
      const state = await readWorkspaceState(absRoot);
      await writeWorkspaceState(absRoot, {
        recentDocumentIds: state.recentDocumentIds.filter((id) => id !== deletedId),
        starredDocumentIds: state.starredDocumentIds.filter((id) => id !== deletedId),
      });
    }

    const uiState = await readUiState(absRoot);
    if (uiState.lastOpenedItemPath === rel) {
      uiState.lastOpenedItemPath = null;
    }
    await atomicWriteJson(absRoot, uiStatePath(absRoot), uiState);

    return { deleted: true, path: rel };
  }

  await fs.rm(abs, { recursive: true, force: true });

  const remaining = await scanWorkspace(absRoot);
  const remainingIds = new Set(remaining.items.filter((item) => item.id).map((item) => item.id));
  const state = await readWorkspaceState(absRoot);
  await writeWorkspaceState(absRoot, {
    recentDocumentIds: state.recentDocumentIds.filter((id) => remainingIds.has(id)),
    starredDocumentIds: state.starredDocumentIds.filter((id) => remainingIds.has(id)),
  });

  const uiState = await readUiState(absRoot);
  if (uiState.currentFolderPath === rel || uiState.currentFolderPath?.startsWith(`${rel}/`)) {
    uiState.currentFolderPath = "";
  }
  if (uiState.lastOpenedItemPath === rel || uiState.lastOpenedItemPath?.startsWith(`${rel}/`)) {
    uiState.lastOpenedItemPath = null;
  }
  if (uiState.lastOpenedCanvasPath === rel || uiState.lastOpenedCanvasPath?.startsWith(`${rel}/`)) {
    uiState.lastOpenedCanvasPath = null;
  }
  await atomicWriteJson(absRoot, uiStatePath(absRoot), uiState);

  return { deleted: true, path: rel };
}

async function importFiles(root, sourcePaths, targetFolderPath = "") {
  const absRoot = await ensureWorkspaceScaffold(root);
  const targetDir = resolveWorkspacePath(absRoot, normalizeFolder(targetFolderPath));
  await fs.mkdir(targetDir, { recursive: true });

  const sources = Array.isArray(sourcePaths)
    ? sourcePaths.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  if (sources.length === 0) {
    return [];
  }

  const imported = [];
  for (const sourcePath of sources) {
    const sourceStat = await fs.stat(sourcePath).catch(() => null);
    if (!sourceStat?.isFile()) {
      continue;
    }

    const parsed = path.parse(sourcePath);
    let targetPath = path.join(targetDir, `${sanitizeName(parsed.name, "file")}${parsed.ext}`);
    let suffix = 2;
    while (await exists(targetPath)) {
      targetPath = path.join(targetDir, `${sanitizeName(parsed.name, "file")} ${suffix}${parsed.ext}`);
      suffix += 1;
    }

    await fs.copyFile(sourcePath, targetPath);
    const item = await getItemForFilePath(absRoot, targetPath);
    if (item) {
      imported.push(item);
    }
  }

  return imported;
}

function ensureMarkdownWorkspacePath(root, filePath) {
  const rel = toWorkspaceRel(root, filePath);
  const abs = resolveWorkspacePath(root, rel);

  if (!/\.md$/i.test(abs)) {
    throw new Error("Only Markdown files are supported here.");
  }

  return {
    relativePath: rel,
    absolutePath: abs,
  };
}

async function buildMarkdownFilePayload(root, absolutePath, relativePath, content = null) {
  const fileContent = typeof content === "string" ? content : await fs.readFile(absolutePath, "utf8");
  const stat = await fs.stat(absolutePath);

  return {
    relativePath,
    filePath: absolutePath,
    fileName: path.basename(absolutePath),
    extension: "md",
    mimeType: "text/markdown",
    sizeBytes: Buffer.byteLength(fileContent, "utf8"),
    content: fileContent,
    updatedAt: stat.mtime.toISOString(),
  };
}

async function readMarkdownFile(root, filePath) {
  const absRoot = await ensureWorkspaceScaffold(root);
  const { relativePath, absolutePath } = ensureMarkdownWorkspacePath(absRoot, filePath);
  return buildMarkdownFilePayload(absRoot, absolutePath, relativePath);
}

async function writeMarkdownFile(root, filePath, content = "") {
  const absRoot = await ensureWorkspaceScaffold(root);
  const { relativePath, absolutePath } = ensureMarkdownWorkspacePath(absRoot, filePath);
  await atomicWriteText(absRoot, absolutePath, typeof content === "string" ? content : String(content ?? ""));
  return buildMarkdownFilePayload(absRoot, absolutePath, relativePath, typeof content === "string" ? content : String(content ?? ""));
}

async function createMarkdownFile(root, name, content = "", targetFolderPath = "") {
  const absRoot = await ensureWorkspaceScaffold(root);
  const targetDir = resolveWorkspacePath(absRoot, normalizeFolder(targetFolderPath));
  await fs.mkdir(targetDir, { recursive: true });

  const requestedBaseName = sanitizeName(firstString(name, "Canvas Note"), "Canvas Note");
  const normalizedBaseName = /\.md$/i.test(requestedBaseName)
    ? requestedBaseName.slice(0, -3).trim() || "Canvas Note"
    : requestedBaseName;
  const absolutePath = await uniquePath(targetDir, normalizedBaseName, ".md");

  await atomicWriteText(absRoot, absolutePath, typeof content === "string" ? content : String(content ?? ""));
  return buildMarkdownFilePayload(absRoot, absolutePath, toWorkspaceRel(absRoot, absolutePath), typeof content === "string" ? content : String(content ?? ""));
}

module.exports = {
  atomicWriteJson,
  atomicWriteText,
  createCanvas,
  createMarkdownFile,
  createDome,
  createFolder,
  createWorkspace,
  deleteEntry,
  deleteFile,
  getHomeData,
  getItemForFilePath,
  getRecentItems,
  getStarredItems,
  importFiles,
  importImageAsset,
  inspectDome,
  isValidWorkspace,
  listCanvasHistory,
  listFiles,
  loadCanvas,
  loadUiState,
  loadWorkspace,
  markItemStarred,
  openWorkspace,
  readMarkdownFile,
  readWorkspaceDocument,
  recordRecentItem,
  renameEntry,
  renameFile,
  resolveWorkspaceAssetPath,
  restoreCanvasHistoryEntry,
  saveCanvas,
  saveUiState,
  saveWorkspace,
  scanWorkspace,
  waitForDomeFilesToSettle,
  writeMarkdownFile,
};
