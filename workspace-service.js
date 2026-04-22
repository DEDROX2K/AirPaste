const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const INTERNAL_DIR = ".airpaste";
const TMP_DIR = "tmp";
const INDEX_FILE = "index.json";
const DOME_FILE = "dome.json";
const UI_STATE_FILE = "ui-state.json";
const STATE_FILE = "state.json";
const CANVAS_SUFFIX = ".airpaste.json";
const MAX_RECENTS = 25;
const DEFAULT_WORKSPACE_NAME = "Main Canvas";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const DOC_EXTS = new Set(["pdf"]);
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
  version: 5,
  viewport: { x: 180, y: 120, zoom: 1 },
  cards: [],
  drawings: DEFAULT_DRAWINGS,
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

function stripCanvasSuffix(fileName) {
  const name = String(fileName ?? "");
  return name.toLowerCase().endsWith(CANVAS_SUFFIX) ? name.slice(0, -CANVAS_SUFFIX.length) : stripExt(name);
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

function indexPath(root) {
  return path.join(internalPath(root), INDEX_FILE);
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
    homeView: ["grid", "list"].includes(safe.homeView) ? safe.homeView : "grid",
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

async function ensureWorkspaceScaffold(root) {
  const absRoot = path.resolve(root);
  if (!(await isDirectory(absRoot))) {
    throw new Error("Selected folder is no longer available.");
  }

  await ensureInternalDirs(absRoot);

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

function isCanvasPath(filePath) {
  return String(filePath ?? "").toLowerCase().endsWith(CANVAS_SUFFIX);
}

function detectType(fileName) {
  const lower = String(fileName ?? "").toLowerCase();
  if (lower.endsWith(CANVAS_SUFFIX)) {
    return "canvas";
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
  return {
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
  };
}

function compareUpdatedDesc(a, b) {
  if (a.updatedAt === b.updatedAt) {
    return a.name.localeCompare(b.name);
  }
  return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
}

async function scanWorkspace(folderPath) {
  const root = await ensureWorkspaceScaffold(folderPath);
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

      const type = detectType(entry.name);
      const stat = await fs.stat(absPath);

      if (type === "canvas") {
        let raw = {};
        try {
          raw = await readJson(absPath, entry.name);
        } catch {
          raw = {};
        }

        items.push({
          id: firstString(raw.id, legacyDocumentId(relPath)),
          path: relPath,
          type,
          name: firstString(raw.name, stripCanvasSuffix(entry.name), "Canvas"),
          updatedAt: stat.mtime.toISOString(),
          excerpt: "",
        });
        continue;
      }

      items.push({
        id: null,
        path: relPath,
        type,
        name: type === "asset" ? stripExt(entry.name) || entry.name : entry.name,
        updatedAt: stat.mtime.toISOString(),
        excerpt: "",
      });
    }
  }

  return {
    folderPath: root,
    workspace: await readWorkspaceMeta(root),
    items: items.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

async function openWorkspace(folderPath) {
  const root = await ensureWorkspaceScaffold(folderPath);
  await writeWorkspaceMeta(root);
  return {
    folderPath: root,
    workspace: await readWorkspaceMeta(root),
  };
}

async function loadCanvas(filePath) {
  const abs = path.resolve(filePath);
  if (!isCanvasPath(abs)) {
    throw new Error(`Canvas path must end with "${CANVAS_SUFFIX}".`);
  }

  const root = await workspaceRootFromFile(abs);
  if (!root) {
    throw new Error("Could not resolve the workspace for this canvas.");
  }

  ensureInside(root, abs);
  const raw = await readJson(abs, path.basename(abs));
  const stat = await fs.stat(abs);
  const rel = toWorkspaceRel(root, abs);

  const workspace = {
    version: Number.isFinite(raw.version) ? raw.version : DEFAULT_WORKSPACE.version,
    viewport: isObject(raw.viewport) ? raw.viewport : DEFAULT_WORKSPACE.viewport,
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    drawings: normalizeDrawingsPayload(raw.drawings),
    view: raw.view === null || isObject(raw.view) ? raw.view : null,
    name: firstString(raw.name, stripCanvasSuffix(path.basename(abs)), "Canvas"),
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
    throw new Error(`Canvas path must end with "${CANVAS_SUFFIX}".`);
  }

  const root = await workspaceRootFromFile(abs);
  if (!root) {
    throw new Error("Could not resolve the workspace for this canvas.");
  }

  ensureInside(root, abs);
  const current = (await exists(abs)) ? await readJson(abs, path.basename(abs)) : {};
  const input = isObject(data) ? data : {};
  const saveOptions = isObject(options) ? options : {};
  const nextName = firstString(input.name, current.name, stripCanvasSuffix(path.basename(abs)), "Canvas");
  const payload = {
    version: 2,
    type: "canvas",
    id: firstString(current.id, input.id, randomUUID()),
    name: nextName,
    createdAt: typeof current.createdAt === "string" ? current.createdAt : nowIso(),
    updatedAt: nowIso(),
    viewport: isObject(input.viewport)
      ? input.viewport
      : isObject(current.viewport)
        ? current.viewport
        : DEFAULT_WORKSPACE.viewport,
    cards: Array.isArray(input.cards)
      ? input.cards
      : Array.isArray(current.cards)
        ? current.cards
        : [],
    drawings: normalizeDrawingsPayload(input.drawings ?? current.drawings),
    view: input.view === null || isObject(input.view)
      ? input.view
      : (current.view ?? null),
  };

  await atomicWriteJson(root, abs, payload);
  const rel = toWorkspaceRel(root, abs);

  if (saveOptions.returnWorkspace !== false) {
    await recordRecentItem(root, abs);
    return loadCanvas(abs);
  }

  return {
    type: "canvas",
    path: rel,
    filePath: abs,
    updatedAt: payload.updatedAt,
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
    CANVAS_SUFFIX,
  );

  await atomicWriteJson(root, filePath, {
    version: 2,
    type: "canvas",
    id: randomUUID(),
    name: stripCanvasSuffix(path.basename(filePath)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    viewport: DEFAULT_WORKSPACE.viewport,
    cards: [],
    drawings: DEFAULT_DRAWINGS,
    view: null,
  });

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

  const renamed = await uniquePath(path.dirname(abs), nextBaseName, CANVAS_SUFFIX);
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

async function loadIndex(root) {
  await ensureWorkspaceScaffold(root);
  return readJsonIfExists(indexPath(root), null);
}

async function saveIndex(root, index) {
  await ensureWorkspaceScaffold(root);
  const next = isObject(index) ? index : {};
  await atomicWriteJson(root, indexPath(root), next);
  return next;
}

async function rebuildIndex(root) {
  const scan = await scanWorkspace(root);
  const state = await readWorkspaceState(root);
  const items = scan.items.map((item) => mapScannedItemForResponse(root, item, state));
  const payload = {
    version: 1,
    workspace: scan.workspace,
    items,
    recentDocumentIds: state.recentDocumentIds,
    starredDocumentIds: state.starredDocumentIds,
  };
  await atomicWriteJson(root, indexPath(root), payload);
  return payload;
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

async function loadWorkspace(root) {
  const opened = await openWorkspace(root);
  return { folderPath: opened.folderPath };
}

async function createWorkspace(root) {
  const opened = await openWorkspace(root);
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
  await ensureWorkspaceScaffold(absRoot);
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
  const extension = type === "asset" || type === "file" ? path.extname(abs) : "";
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

module.exports = {
  createCanvas,
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
  listFiles,
  loadCanvas,
  loadIndex,
  loadUiState,
  loadWorkspace,
  markItemStarred,
  openWorkspace,
  readWorkspaceDocument,
  rebuildIndex,
  recordRecentItem,
  renameEntry,
  renameFile,
  resolveWorkspaceAssetPath,
  saveCanvas,
  saveIndex,
  saveUiState,
  saveWorkspace,
  scanWorkspace,
};
