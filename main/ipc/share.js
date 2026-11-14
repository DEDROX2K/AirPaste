// Canvas sharing IPC (see main/share/canvasShare.js for the bundle format).
// Also collects ".airpaste-share" files the OS asks AirPaste to open
// (double-click / "Open with", on first launch or while running) and hands
// them to the renderer, which imports them into the active Dome.

const { app, dialog, ipcMain } = require("electron");
const fsSync = require("node:fs");
const path = require("node:path");
const context = require("../context");
const { resolveWorkspaceQueueKeyForFile, withWorkspaceQueue } = require("../workspaceQueue");
const {
  SHARE_FILE_EXTENSION,
  exportCanvasShare,
  importCanvasShare,
  isShareFilePath,
} = require("../share/canvasShare");

const SHARE_DIALOG_FILTERS = [{ name: "AirPaste shared canvas", extensions: [SHARE_FILE_EXTENSION.slice(1)] }];
const pendingShareFiles = [];

function shareFilesFromArgv(argv) {
  return (Array.isArray(argv) ? argv : [])
    .filter((arg) => isShareFilePath(arg) && fsSync.existsSync(arg))
    .map((arg) => path.resolve(arg));
}

function queueOpenedShareFiles(filePaths) {
  const fresh = filePaths.filter((filePath) => !pendingShareFiles.includes(filePath));
  if (fresh.length === 0) return;
  pendingShareFiles.push(...fresh);
  const mainWindow = context.mainWindow;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("airpaste:shareFilesOpened");
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

// Called once from main/index.js before the app is ready. Returns false when
// another AirPaste is already running (it gets our files instead and this
// process should quit). Only the packaged app takes the single-instance
// lock: the OS only routes double-clicks to the installed app, and a dev
// build (`electron .`) shouldn't refuse to start next to it.
function setupOpenFileHandling() {
  if (app.isPackaged && !app.requestSingleInstanceLock()) {
    return false;
  }

  app.on("second-instance", (_event, argv) => {
    queueOpenedShareFiles(shareFilesFromArgv(argv));
  });

  // macOS delivers double-clicked files through this event, including the
  // one that launched the app (before "ready").
  app.on("open-file", (event, filePath) => {
    if (isShareFilePath(filePath)) {
      event.preventDefault();
      queueOpenedShareFiles([path.resolve(filePath)]);
    }
  });

  pendingShareFiles.push(...shareFilesFromArgv(process.argv.slice(1)));
  return true;
}

function defaultExportDirectory() {
  for (const key of ["downloads", "documents", "home"]) {
    try {
      return app.getPath(key);
    } catch {
      // Try the next one.
    }
  }
  return "";
}

function safeFileBaseName(name) {
  return String(name ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "") || "Canvas";
}

function registerIpc() {
  ipcMain.handle("airpaste:exportCanvasShare", async (_event, folderPath, canvasFilePath, suggestedName = "") => {
    if (typeof canvasFilePath !== "string" || !canvasFilePath) {
      throw new Error("Pick a canvas to share.");
    }
    const absCanvas = path.resolve(canvasFilePath);
    if (typeof folderPath === "string" && folderPath) {
      const rel = path.relative(path.resolve(folderPath), absCanvas);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error("That canvas isn't in the open workspace.");
      }
    }

    const baseName = safeFileBaseName(suggestedName || path.basename(absCanvas).replace(/\.(canvas|airpaste\.json)$/i, ""));
    const result = await dialog.showSaveDialog(context.mainWindow, {
      title: "Share canvas",
      buttonLabel: "Save",
      defaultPath: path.join(defaultExportDirectory(), `${baseName}${SHARE_FILE_EXTENSION}`),
      filters: SHARE_DIALOG_FILTERS,
      properties: ["showOverwriteConfirmation", "createDirectory"],
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    let outPath = result.filePath;
    if (!isShareFilePath(outPath)) {
      outPath = `${outPath}${SHARE_FILE_EXTENSION}`;
    }

    // Queued with the canvas's saves so the export reads a settled file.
    const queueKey = await resolveWorkspaceQueueKeyForFile(absCanvas);
    return withWorkspaceQueue(queueKey, () => exportCanvasShare(absCanvas, outPath, { appVersion: app.getVersion() }));
  });

  ipcMain.handle("airpaste:importCanvasShare", async (_event, folderPath, bundlePath = null, targetFolderPath = "") => {
    if (typeof folderPath !== "string" || !folderPath) {
      throw new Error("Open a workspace before importing a canvas.");
    }

    let sourcePath = typeof bundlePath === "string" && bundlePath ? bundlePath : "";
    if (!sourcePath) {
      const picked = await dialog.showOpenDialog(context.mainWindow, {
        title: "Import shared canvas",
        buttonLabel: "Import",
        filters: SHARE_DIALOG_FILTERS,
        properties: ["openFile"],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { canceled: true };
      }
      sourcePath = picked.filePaths[0];
    }

    return withWorkspaceQueue(folderPath, () => importCanvasShare(folderPath, sourcePath, { targetFolderPath }));
  });

  ipcMain.handle("airpaste:takePendingShareFiles", async () => pendingShareFiles.splice(0));
}

module.exports = {
  registerIpc,
  setupOpenFileHandling,
  shareFilesFromArgv,
};
