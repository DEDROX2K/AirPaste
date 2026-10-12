const { app, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const workspaceService = require("../../workspace-service");
const context = require("../context");
const { nowIso, pathExists } = require("../fsUtils");

const CONFIG_FILE_NAME = "config.json";
const DOME_CONFIG_VERSION = 2;
const TEMP_SUFFIX = ".tmp";
const BACKUP_SUFFIX = ".bak";

function getConfigPath() {
  return path.join(app.getPath("userData"), CONFIG_FILE_NAME);
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallbackValue;
    }
    throw error;
  }
}

async function safeWriteJson(filePath, data) {
  const directory = path.dirname(filePath);
  const opId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = `${filePath}${TEMP_SUFFIX}-${opId}`;
  const backupPath = `${filePath}${BACKUP_SUFFIX}-${opId}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, payload, "utf8");

  try {
    await fs.rm(backupPath, { force: true });
  } catch {
    // Ignore leftover backups from prior runs.
  }

  let movedPreviousFile = false;

  if (await pathExists(filePath)) {
    try {
      await fs.rename(filePath, backupPath);
      movedPreviousFile = true;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (movedPreviousFile) {
      await fs.rename(backupPath, filePath).catch(() => { });
    }
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => { });
    await fs.rm(backupPath, { force: true }).catch(() => { });
  }
}

function createDomeId(domePath) {
  return createHash("sha1").update(String(domePath).toLowerCase()).digest("hex").slice(0, 16);
}

function normalizeDomeEntry(value) {
  if (!value || typeof value !== "object") return null;
  const domePath = typeof value.path === "string" ? value.path.trim() : "";
  if (!domePath) return null;
  const resolvedPath = path.resolve(domePath);
  const id = typeof value.id === "string" && value.id.trim()
    ? value.id.trim()
    : createDomeId(resolvedPath);
  const name = typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : path.basename(resolvedPath);
  return {
    id,
    name,
    path: resolvedPath,
    lastOpenedAt: typeof value.lastOpenedAt === "string" ? value.lastOpenedAt : null,
  };
}

function defaultConfig() {
  return {
    version: DOME_CONFIG_VERSION,
    recentDomes: [],
    activeDomeId: null,
    lastFolder: null,
  };
}

async function readConfig() {
  const raw = await readJsonFile(getConfigPath(), defaultConfig());
  const next = defaultConfig();
  const seen = new Set();

  if (Array.isArray(raw?.recentDomes)) {
    for (const entry of raw.recentDomes) {
      const dome = normalizeDomeEntry(entry);
      if (!dome || seen.has(dome.id)) continue;
      seen.add(dome.id);
      next.recentDomes.push(dome);
    }
  }

  if (
    next.recentDomes.length === 0
    && typeof raw?.lastFolder === "string"
    && raw.lastFolder.trim()
  ) {
    const migrated = normalizeDomeEntry({
      id: createDomeId(raw.lastFolder),
      name: path.basename(raw.lastFolder),
      path: raw.lastFolder,
      lastOpenedAt: nowIso(),
    });
    if (migrated) {
      next.recentDomes.push(migrated);
      next.activeDomeId = migrated.id;
      next.lastFolder = migrated.path;
    }
  }

  if (!next.activeDomeId && typeof raw?.activeDomeId === "string" && raw.activeDomeId.trim()) {
    next.activeDomeId = raw.activeDomeId.trim();
  }

  if (!next.activeDomeId && next.recentDomes.length > 0) {
    next.activeDomeId = next.recentDomes[0].id;
  }

  const active = next.recentDomes.find((entry) => entry.id === next.activeDomeId);
  next.lastFolder = active?.path ?? null;
  return next;
}

async function writeConfig(config) {
  const next = defaultConfig();
  const seen = new Set();
  const domes = Array.isArray(config?.recentDomes) ? config.recentDomes : [];
  for (const entry of domes) {
    const dome = normalizeDomeEntry(entry);
    if (!dome || seen.has(dome.id)) continue;
    seen.add(dome.id);
    next.recentDomes.push(dome);
  }
  next.activeDomeId = typeof config?.activeDomeId === "string" && config.activeDomeId.trim()
    ? config.activeDomeId.trim()
    : null;
  if (next.activeDomeId && !next.recentDomes.some((entry) => entry.id === next.activeDomeId)) {
    next.activeDomeId = next.recentDomes[0]?.id ?? null;
  }
  const active = next.recentDomes.find((entry) => entry.id === next.activeDomeId);
  next.lastFolder = active?.path ?? null;
  await safeWriteJson(getConfigPath(), next);
  return next;
}

async function upsertRecentDome({ path: domePath, name }) {
  const config = await readConfig();
  const resolvedPath = path.resolve(String(domePath));
  const id = createDomeId(resolvedPath);
  const existing = config.recentDomes.find((entry) => entry.id === id);
  const nextEntry = {
    id,
    path: resolvedPath,
    name: (typeof name === "string" && name.trim()) || existing?.name || path.basename(resolvedPath),
    lastOpenedAt: nowIso(),
  };
  const remaining = config.recentDomes.filter((entry) => entry.id !== id);
  const nextConfig = await writeConfig({
    ...config,
    activeDomeId: id,
    recentDomes: [nextEntry, ...remaining].slice(0, 20),
  });
  return {
    config: nextConfig,
    dome: nextEntry,
  };
}

async function getRecentDomesWithStatus() {
  const config = await readConfig();
  const domes = [];
  for (const entry of config.recentDomes) {
    const inspected = await workspaceService.inspectDome(entry.path);
    domes.push({
      ...entry,
      name: inspected?.name || entry.name,
      valid: inspected?.valid === true,
      exists: inspected?.exists === true,
      status: inspected?.reason || "unknown",
    });
  }
  return {
    activeDomeId: config.activeDomeId,
    recentDomes: domes,
  };
}

async function setActiveDomeById(domeId) {
  const config = await readConfig();
  const nextId = typeof domeId === "string" ? domeId.trim() : "";
  if (!nextId) throw new Error("Dome id is required.");
  const dome = config.recentDomes.find((entry) => entry.id === nextId);
  if (!dome) throw new Error("Dome not found in recent list.");
  const inspected = await workspaceService.inspectDome(dome.path);
  if (!inspected.exists) throw new Error("Dome path is missing.");
  if (!inspected.valid) throw new Error("Dome metadata was not found in this folder.");
  const result = await upsertRecentDome({
    path: dome.path,
    name: inspected.name || dome.name,
  });
  return result.dome;
}

async function openOrInitializeDome(folderPath, options = {}) {
  const absPath = path.resolve(String(folderPath));
  const inspected = await workspaceService.inspectDome(absPath);
  if (!inspected.exists) {
    throw new Error("Selected folder is no longer available.");
  }
  if (!inspected.valid) {
    if (options.initialize !== true) {
      throw new Error("Selected folder is not an AirPaste Dome yet.");
    }
    await workspaceService.createDome(absPath, options.name || inspected.name || path.basename(absPath));
  }
  const reopened = await workspaceService.inspectDome(absPath);
  if (!reopened.valid) throw new Error("Unable to initialize this Dome folder.");
  const result = await upsertRecentDome({
    path: absPath,
    name: options.name || reopened.name || path.basename(absPath),
  });
  return result.dome;
}

function registerIpc() {
  ipcMain.handle("airpaste:openFolder", async () => {
    const result = await dialog.showOpenDialog(context.mainWindow, {
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("airpaste:openFiles", async () => {
    const result = await dialog.showOpenDialog(context.mainWindow, {
      properties: ["openFile", "multiSelections"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    return result.filePaths;
  });

  ipcMain.handle("airpaste:listDomes", async () => {
    return getRecentDomesWithStatus();
  });

  ipcMain.handle("airpaste:getActiveDome", async () => {
    const config = await readConfig();
    if (!config.activeDomeId) return null;
    const active = config.recentDomes.find((entry) => entry.id === config.activeDomeId);
    if (!active) return null;
    const inspected = await workspaceService.inspectDome(active.path);
    return {
      ...active,
      name: inspected?.name || active.name,
      valid: inspected?.valid === true,
      exists: inspected?.exists === true,
      status: inspected?.reason || "unknown",
    };
  });

  ipcMain.handle("airpaste:createDome", async (_event, parentFolderPath, domeName) => {
    if (!parentFolderPath || typeof parentFolderPath !== "string") {
      throw new Error("A parent folder path is required.");
    }
    const baseName = typeof domeName === "string" && domeName.trim()
      ? domeName.trim()
      : "New Dome";
    const safeName = Array.from(baseName)
      .map((char) => (char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? " " : char))
      .join("")
      .replace(/\s+/g, " ")
      .trim() || "New Dome";
    let targetPath = path.join(path.resolve(parentFolderPath), safeName);
    let counter = 2;
    while (await pathExists(targetPath)) {
      targetPath = path.join(path.resolve(parentFolderPath), `${safeName} ${counter}`);
      counter += 1;
    }
    await workspaceService.createDome(targetPath, safeName);
    return openOrInitializeDome(targetPath, { name: safeName, initialize: false });
  });

  ipcMain.handle("airpaste:openDome", async () => {
    const result = await dialog.showOpenDialog(context.mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const folderPath = result.filePaths[0];
    return openOrInitializeDome(folderPath, { initialize: true });
  });

  ipcMain.handle("airpaste:switchDome", async (_event, domeId) => {
    return setActiveDomeById(domeId);
  });

  ipcMain.handle("airpaste:removeDome", async (_event, domeId) => {
    const config = await readConfig();
    const nextId = typeof domeId === "string" ? domeId.trim() : "";
    if (!nextId) return getRecentDomesWithStatus();
    const remaining = config.recentDomes.filter((entry) => entry.id !== nextId);
    const activeDomeId = config.activeDomeId === nextId ? (remaining[0]?.id ?? null) : config.activeDomeId;
    await writeConfig({ ...config, recentDomes: remaining, activeDomeId });
    return getRecentDomesWithStatus();
  });

  ipcMain.handle("airpaste:revealDome", async (_event, domePath) => {
    if (!domePath || typeof domePath !== "string") return { opened: false };
    const resolvedPath = path.resolve(domePath);
    if (!(await pathExists(resolvedPath))) return { opened: false };
    shell.showItemInFolder(resolvedPath);
    return { opened: true };
  });

  ipcMain.handle("airpaste:getLastFolder", async () => {
    const config = await readConfig();
    const candidates = [
      ...config.recentDomes.filter((entry) => entry.id === config.activeDomeId),
      ...config.recentDomes.filter((entry) => entry.id !== config.activeDomeId),
    ];
    for (const dome of candidates) {
      const inspected = await workspaceService.inspectDome(dome.path);
      if (inspected.exists && inspected.valid) {
        return dome.path;
      }
    }
    return null;
  });
}

module.exports = {
  openOrInitializeDome,
  registerIpc,
};
