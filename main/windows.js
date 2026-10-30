const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const fsSync = require("node:fs");
const path = require("node:path");
const context = require("./context");

const WINDOW_CLOSE_ANIMATION_MS = 190;
// Upper bound on how long quitting can wait for the renderer to flush pending
// autosaves before closing anyway -- protects against a hung or crashed
// renderer blocking the app from ever closing.
const WINDOW_CLOSE_SAFETY_TIMEOUT_MS = 4000;

// ~120Hz cursor poll while the titlebar drags the window.
const WINDOW_MOVE_POLL_MS = 8;
const WINDOW_MOVE_THRESHOLD_PX = 3;

let activeWindowResizeSession = null;
let activeWindowMoveSession = null;
let allowImmediateWindowClose = false;
let closeFlushPending = false;
let pendingCloseReadyResolve = null;

function resolveWindowIconPath() {
  const iconCandidates = [
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(__dirname, "..", "public", "logo.png"),
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

// Asks the renderer to flush any pending debounced autosave before the
// window is actually allowed to close, instead of closing on a blind timer
// (which used to drop whatever was still in the 420ms autosave debounce when
// the app quit shortly after an edit). The renderer acknowledges via
// "window:ready-to-close" once its flush settles; WINDOW_CLOSE_SAFETY_TIMEOUT_MS
// guarantees this can never block the app from closing indefinitely.
function requestGracefulClose(onReady) {
  const mainWindow = context.mainWindow;
  if (!mainWindow || mainWindow.isDestroyed()) {
    onReady();
    return;
  }

  if (closeFlushPending) {
    // A close/quit is already being flushed; this request will be satisfied
    // when that one finishes and the window actually closes.
    return;
  }
  closeFlushPending = true;

  const closeRequestedAt = Date.now();
  mainWindow.webContents.send("window:prepare-close");

  const finish = () => {
    if (!closeFlushPending) return;
    closeFlushPending = false;
    pendingCloseReadyResolve = null;
    clearTimeout(safetyTimer);
    const elapsedMs = Date.now() - closeRequestedAt;
    const remainingAnimationMs = Math.max(0, WINDOW_CLOSE_ANIMATION_MS - elapsedMs);
    setTimeout(onReady, remainingAnimationMs);
  };

  pendingCloseReadyResolve = finish;
  const safetyTimer = setTimeout(finish, WINDOW_CLOSE_SAFETY_TIMEOUT_MS);
}

async function createWindow() {
  const windowIconPath = resolveWindowIconPath();
  allowImmediateWindowClose = false;

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
    // No titleBarStyle/titleBarOverlay: those ask the OS for native window
    // buttons. The renderer draws its own (TopTabBar.jsx).
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
    requestGracefulClose(() => {
      allowImmediateWindowClose = true;
      mainWindow?.close();
    });
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

  // The titlebar moves the window itself instead of using
  // -webkit-app-region: drag, because Windows always shows the native
  // cursor over a drag region (it would break the pixel cursors).
  ipcMain.on("window:moveStart", () => {
    const mainWindow = context.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    stopWindowMove();

    const startCursor = screen.getCursorScreenPoint();
    const startBounds = mainWindow.getBounds();
    activeWindowMoveSession = {
      startCursor,
      startBounds,
      timer: setInterval(() => moveWindowWithCursor(mainWindow), WINDOW_MOVE_POLL_MS),
    };
  });

  ipcMain.on("window:moveEnd", () => {
    const mainWindow = context.mainWindow;
    const session = activeWindowMoveSession;
    stopWindowMove();

    // Dropped on the top edge of the screen: maximize, like Windows snap.
    if (session?.moved && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
      const cursor = screen.getCursorScreenPoint();
      const { workArea } = screen.getDisplayNearestPoint(cursor);
      if (cursor.y <= workArea.y + 2) {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on("window:ready-to-close", () => {
    pendingCloseReadyResolve?.();
  });
}

function stopWindowMove() {
  if (activeWindowMoveSession?.timer) {
    clearInterval(activeWindowMoveSession.timer);
  }
  activeWindowMoveSession = null;
}

function moveWindowWithCursor(mainWindow) {
  const session = activeWindowMoveSession;
  if (!session || mainWindow.isDestroyed()) {
    stopWindowMove();
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const deltaX = cursor.x - session.startCursor.x;
  const deltaY = cursor.y - session.startCursor.y;

  if (!session.moved) {
    if (Math.abs(deltaX) < WINDOW_MOVE_THRESHOLD_PX && Math.abs(deltaY) < WINDOW_MOVE_THRESHOLD_PX) {
      return;
    }
    session.moved = true;

    // Dragging a maximized window restores it under the cursor, keeping
    // the cursor at the same fraction across the titlebar.
    if (mainWindow.isMaximized()) {
      const maximizedBounds = mainWindow.getBounds();
      const ratio = (session.startCursor.x - maximizedBounds.x) / Math.max(1, maximizedBounds.width);
      mainWindow.unmaximize();
      const restored = mainWindow.getBounds();
      session.startBounds = {
        ...restored,
        x: Math.round(session.startCursor.x - (restored.width * ratio)),
        y: maximizedBounds.y,
      };
    }
  }

  mainWindow.setPosition(
    Math.round(session.startBounds.x + deltaX),
    Math.round(session.startBounds.y + deltaY),
  );
}

function markImmediateCloseAllowed() {
  allowImmediateWindowClose = true;
}

module.exports = {
  createWindow,
  getDevServerUrl,
  markImmediateCloseAllowed,
  registerIpc,
  requestGracefulClose,
};
