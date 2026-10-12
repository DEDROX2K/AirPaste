const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fsSync = require("node:fs");
const path = require("node:path");
const context = require("./context");

const WINDOW_CLOSE_ANIMATION_MS = 190;

let activeWindowResizeSession = null;
let allowImmediateWindowClose = false;
let pendingWindowCloseTimeout = null;

function resolveWindowIconPath() {
  const iconCandidates = [
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(__dirname, "..", "public", "Logo.png"),
    path.join(__dirname, "..", "build", "logo.png"),
    path.join(__dirname, "..", "build", "favicon.ico"),
  ];

  for (const candidatePath of iconCandidates) {
    if (fsSync.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
}

function getDevServerUrl() {
  return "http://127.0.0.1:5173";
}

async function createWindow() {
  const windowIconPath = resolveWindowIconPath();
  allowImmediateWindowClose = false;
  clearTimeout(pendingWindowCloseTimeout);
  pendingWindowCloseTimeout = null;

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    resizable: true,
    movable: true,
    backgroundColor: "#d4d4d4",
    frame: false,
    transparent: false,
    thickFrame: true,
    hasShadow: true,
    roundedCorners: true,
    titleBarStyle: "hidden",
    titleBarOverlay: process.platform === "win32" ? {
      color: "#ffffff",
      symbolColor: "#1c1c1e",
      height: 36
    } : false,
    show: false,
    title: "AirPaste",
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  context.mainWindow = mainWindow;

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (allowImmediateWindowClose || mainWindow?.isDestroyed()) {
      return;
    }

    event.preventDefault();
    mainWindow.webContents.send("window:prepare-close");
    clearTimeout(pendingWindowCloseTimeout);
    pendingWindowCloseTimeout = setTimeout(() => {
      allowImmediateWindowClose = true;
      mainWindow?.close();
    }, WINDOW_CLOSE_ANIMATION_MS);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("context-menu", (event) => {
    event.preventDefault();
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
    await mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  } else {
    await mainWindow.loadURL(getDevServerUrl());
  }
}

function registerIpc() {
  ipcMain.on("window:minimize", () => context.mainWindow?.minimize());
  ipcMain.on("window:maximize", () => {
    const mainWindow = context.mainWindow;
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on("window:close", () => context.mainWindow?.close());
  ipcMain.on("window:resizeStart", (_event, payload = {}) => {
    const mainWindow = context.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) {
      activeWindowResizeSession = null;
      return;
    }

    const [minWidth = 320, minHeight = 240] = mainWindow.getMinimumSize?.() ?? [320, 240];
    activeWindowResizeSession = {
      direction: String(payload.direction || ""),
      startBounds: mainWindow.getBounds(),
      minWidth: Math.max(320, minWidth),
      minHeight: Math.max(240, minHeight),
    };
  });

  ipcMain.on("window:resizeMove", (_event, payload = {}) => {
    const mainWindow = context.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed() || !activeWindowResizeSession) {
      return;
    }

    if (mainWindow.isMaximized()) {
      activeWindowResizeSession = null;
      return;
    }

    const {
      direction,
      startBounds,
      minWidth,
      minHeight,
    } = activeWindowResizeSession;

    const deltaX = Number(payload.deltaX) || 0;
    const deltaY = Number(payload.deltaY) || 0;

    let nextX = startBounds.x;
    let nextY = startBounds.y;
    let nextWidth = startBounds.width;
    let nextHeight = startBounds.height;

    if (direction.includes("e")) {
      nextWidth = Math.max(minWidth, startBounds.width + deltaX);
    }

    if (direction.includes("s")) {
      nextHeight = Math.max(minHeight, startBounds.height + deltaY);
    }

    if (direction.includes("w")) {
      const proposedWidth = startBounds.width - deltaX;
      nextWidth = Math.max(minWidth, proposedWidth);
      nextX = startBounds.x + (startBounds.width - nextWidth);
    }

    if (direction.includes("n")) {
      const proposedHeight = startBounds.height - deltaY;
      nextHeight = Math.max(minHeight, proposedHeight);
      nextY = startBounds.y + (startBounds.height - nextHeight);
    }

    mainWindow.setBounds({
      x: Math.round(nextX),
      y: Math.round(nextY),
      width: Math.round(nextWidth),
      height: Math.round(nextHeight),
    });
  });

  ipcMain.on("window:resizeEnd", () => {
    activeWindowResizeSession = null;
  });
}

function markImmediateCloseAllowed() {
  allowImmediateWindowClose = true;
  clearTimeout(pendingWindowCloseTimeout);
}

module.exports = {
  createWindow,
  getDevServerUrl,
  markImmediateCloseAllowed,
  registerIpc,
};
