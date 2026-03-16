const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const openGraphScraper = require("open-graph-scraper");

const DATA_FILE_NAME = "data.json";
const CONFIG_FILE_NAME = "config.json";
const TEMP_SUFFIX = ".tmp";
const BACKUP_SUFFIX = ".bak";

const DEFAULT_WORKSPACE = Object.freeze({
  version: 1,
  viewport: {
    x: 180,
    y: 120,
    zoom: 1,
  },
  cards: [],
});

let mainWindow = null;
const previewJobs = new Map();
const workspaceQueues = new Map();

function cloneDefaultWorkspace() {
  return JSON.parse(JSON.stringify(DEFAULT_WORKSPACE));
}

function nowIso() {
  return new Date().toISOString();
}

function isFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function defaultCardSize(type) {
  return type === "link"
    ? { width: 340, height: 280 }
    : { width: 300, height: 220 };
}

function normalizeCard(card, index = 0) {
  const type = card?.type === "link" ? "link" : "text";
  const size = defaultCardSize(type);
  const createdAt = typeof card?.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card?.updatedAt === "string" ? card.updatedAt : createdAt;

  return {
    id: typeof card?.id === "string" ? card.id : `card-${index}-${Date.now()}`,
    type,
    x: isFiniteNumber(card?.x, 120 + (index % 3) * 28),
    y: isFiniteNumber(card?.y, 120 + index * 24),
    width: isFiniteNumber(card?.width, size.width),
    height: isFiniteNumber(card?.height, size.height),
    text: type === "text" ? String(card?.text ?? "") : "",
    url: type === "link" ? String(card?.url ?? "") : "",
    title: type === "link" ? String(card?.title ?? "") : "",
    description: type === "link" ? String(card?.description ?? "") : "",
    image: type === "link" ? String(card?.image ?? "") : "",
    siteName: type === "link" ? String(card?.siteName ?? "") : "",
    status: type === "link" && ["loading", "ready", "failed"].includes(card?.status)
      ? card.status
      : "idle",
    createdAt,
    updatedAt,
  };
}

function normalizeWorkspace(rawWorkspace) {
  const workspace = rawWorkspace && typeof rawWorkspace === "object"
    ? rawWorkspace
    : cloneDefaultWorkspace();

  const cards = Array.isArray(workspace.cards)
    ? workspace.cards.map((card, index) => normalizeCard(card, index))
    : [];

  return {
    version: 1,
    viewport: {
      x: isFiniteNumber(workspace.viewport?.x, DEFAULT_WORKSPACE.viewport.x),
      y: isFiniteNumber(workspace.viewport?.y, DEFAULT_WORKSPACE.viewport.y),
      zoom: isFiniteNumber(workspace.viewport?.zoom, DEFAULT_WORKSPACE.viewport.zoom),
    },
    cards,
  };
}

function getConfigPath() {
  return path.join(app.getPath("userData"), CONFIG_FILE_NAME);
}

function getWorkspaceFilePath(folderPath) {
  return path.join(folderPath, DATA_FILE_NAME);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(folderPath) {
  try {
    const stats = await fs.stat(folderPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
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
  const tempPath = `${filePath}${TEMP_SUFFIX}`;
  const backupPath = `${filePath}${BACKUP_SUFFIX}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, payload, "utf8");

  try {
    await fs.rm(backupPath, { force: true });
  } catch {
    // Ignore leftover backups from prior runs.
  }

  if (await pathExists(filePath)) {
    await fs.rename(filePath, backupPath);
  }

  await fs.rename(tempPath, filePath);
  await fs.rm(backupPath, { force: true }).catch(() => {});
}

function withWorkspaceQueue(folderPath, task) {
  const queueKey = getWorkspaceFilePath(folderPath);
  const previous = workspaceQueues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(task);

  workspaceQueues.set(queueKey, next);

  return next.finally(() => {
    if (workspaceQueues.get(queueKey) === next) {
      workspaceQueues.delete(queueKey);
    }
  });
}

async function recoverWorkspaceArtifacts(folderPath) {
  const filePath = getWorkspaceFilePath(folderPath);
  const tempPath = `${filePath}${TEMP_SUFFIX}`;
  const backupPath = `${filePath}${BACKUP_SUFFIX}`;

  if (!(await pathExists(filePath)) && (await pathExists(tempPath))) {
    await fs.rename(tempPath, filePath);
  }

  if (!(await pathExists(filePath)) && (await pathExists(backupPath))) {
    await fs.rename(backupPath, filePath);
  }

  if (await pathExists(tempPath)) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }

  if (await pathExists(backupPath)) {
    await fs.rm(backupPath, { force: true }).catch(() => {});
  }
}

async function readConfig() {
  return readJsonFile(getConfigPath(), { lastFolder: null });
}

async function writeConfig(config) {
  await safeWriteJson(getConfigPath(), {
    lastFolder: typeof config?.lastFolder === "string" ? config.lastFolder : null,
  });
}

async function setLastFolder(lastFolder) {
  await writeConfig({ lastFolder });
}

async function ensureWorkspace(folderPath) {
  if (!(await isDirectory(folderPath))) {
    throw new Error("Selected folder is no longer available.");
  }

  await recoverWorkspaceArtifacts(folderPath);

  const filePath = getWorkspaceFilePath(folderPath);
  const existing = await readJsonFile(filePath, null);

  if (!existing) {
    const workspace = cloneDefaultWorkspace();
    await safeWriteJson(filePath, workspace);
    return workspace;
  }

  const workspace = normalizeWorkspace(existing);
  await safeWriteJson(filePath, workspace);
  return workspace;
}

function getDevServerUrl() {
  return "http://127.0.0.1:5173";
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function normalizeImage(input) {
  if (!input) {
    return "";
  }

  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return normalizeImage(input[0]);
  }

  if (typeof input === "object") {
    return firstString(input.url, input.secureUrl, input.source);
  }

  return "";
}

async function fetchPreviewData(url) {
  const hostname = getHostname(url);

  try {
    const { error, result } = await openGraphScraper({
      url,
      timeout: 10000,
    });

    if (error || !result) {
      return {
        status: "failed",
        title: hostname,
        description: "",
        image: "",
        siteName: hostname,
      };
    }

    const image = normalizeImage(result.ogImage ?? result.twitterImage);
    const title = firstString(
      result.ogTitle,
      result.twitterTitle,
      result.dcTitle,
      result.title,
      hostname,
    );
    const description = firstString(
      result.ogDescription,
      result.twitterDescription,
      result.description,
    );
    const siteName = firstString(
      result.ogSiteName,
      result.twitterSite,
      hostname,
    );

    return {
      status: title || description || image ? "ready" : "failed",
      title,
      description,
      image,
      siteName,
    };
  } catch {
    return {
      status: "failed",
      title: hostname,
      description: "",
      image: "",
      siteName: hostname,
    };
  }
}

async function updateCardPreview(folderPath, cardId, url, cardSnapshot) {
  const preview = await fetchPreviewData(url);
  const workspace = await ensureWorkspace(folderPath);
  let cardIndex = workspace.cards.findIndex((card) => card.id === cardId);

  if (cardIndex === -1 && cardSnapshot) {
    const placeholderCard = normalizeCard(cardSnapshot, workspace.cards.length);
    workspace.cards.push(placeholderCard);
    cardIndex = workspace.cards.length - 1;
  }

  if (cardIndex === -1) {
    return null;
  }

  const currentCard = workspace.cards[cardIndex];
  const nextCard = normalizeCard({
    ...currentCard,
    title: preview.title || currentCard.title || getHostname(url),
    description: preview.description || currentCard.description,
    image: preview.image || currentCard.image,
    siteName: preview.siteName || currentCard.siteName || getHostname(url),
    status: preview.status,
    updatedAt: nowIso(),
  });

  workspace.cards.splice(cardIndex, 1, nextCard);
  await safeWriteJson(getWorkspaceFilePath(folderPath), workspace);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("airpaste:previewUpdated", {
      folderPath,
      card: nextCard,
    });
  }

  return nextCard;
}

async function createWindow() {
  const useCustomTitlebar = process.platform === "darwin";

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0d0d0d",
    frame: !useCustomTitlebar,
    titleBarStyle: useCustomTitlebar ? "hidden" : "default",
    show: false,
    title: "AirPaste",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    const isInternalDevServer = !app.isPackaged && url.startsWith(getDevServerUrl());

    if (url !== currentUrl && !isInternalDevServer) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(__dirname, "dist-renderer", "index.html"));
  } else {
    await mainWindow.loadURL(getDevServerUrl());
  }
}

ipcMain.handle("airpaste:openFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("airpaste:getLastFolder", async () => {
  const config = await readConfig();

  if (config.lastFolder && (await isDirectory(config.lastFolder))) {
    return config.lastFolder;
  }

  if (config.lastFolder) {
    await writeConfig({ lastFolder: null });
  }

  return null;
});

ipcMain.handle("airpaste:loadWorkspace", async (_event, folderPath) => {
  return withWorkspaceQueue(folderPath, async () => {
    const workspace = await ensureWorkspace(folderPath);
    await setLastFolder(folderPath);
    return {
      folderPath,
      workspace,
    };
  });
});

ipcMain.handle("airpaste:saveWorkspace", async (_event, folderPath, data) => {
  return withWorkspaceQueue(folderPath, async () => {
    const workspace = normalizeWorkspace(data);
    await safeWriteJson(getWorkspaceFilePath(folderPath), workspace);
    return workspace;
  });
});

ipcMain.handle("airpaste:fetchLinkPreview", async (_event, folderPath, cardId, url, cardSnapshot) => {
  if (!folderPath || !cardId || !url) {
    return { queued: false };
  }

  const jobKey = `${folderPath}:${cardId}`;

  if (previewJobs.has(jobKey)) {
    return { queued: false };
  }

  const job = withWorkspaceQueue(
    folderPath,
    () => updateCardPreview(folderPath, cardId, url, cardSnapshot),
  )
    .catch(() => null)
    .finally(() => {
      previewJobs.delete(jobKey);
    });

  previewJobs.set(jobKey, job);

  return { queued: true };
});

// ── Window controls ─────────────────────────────────────
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window:close", () => mainWindow?.close());


app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
