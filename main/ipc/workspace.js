const { ipcMain } = require("electron");
const path = require("node:path");
const workspaceService = require("../../workspace-service");
const { openOrInitializeDome } = require("./dome");
const { resolveWorkspaceQueueKeyForFile, withWorkspaceQueue } = require("../workspaceQueue");

const workspaceActionHandlers = Object.freeze({
  "airpaste:listFiles": (folderPath) =>
    workspaceService.listFiles(folderPath),
  "airpaste:getHomeData": (folderPath, currentFolderPath) =>
    workspaceService.getHomeData(folderPath, currentFolderPath),
  "airpaste:getRecentItems": (folderPath) =>
    workspaceService.getRecentItems(folderPath),
  "airpaste:getStarredItems": (folderPath) =>
    workspaceService.getStarredItems(folderPath),
  "airpaste:createCanvas": (folderPath, name, targetFolderPath) =>
    workspaceService.createCanvas(folderPath, name, targetFolderPath),
  "airpaste:createMarkdownFile": (folderPath, name, content, targetFolderPath) =>
    workspaceService.createMarkdownFile(folderPath, name, content, targetFolderPath),
  "airpaste:createFolder": (folderPath, name, targetFolderPath) =>
    workspaceService.createFolder(folderPath, name, targetFolderPath),
  "airpaste:renameFile": (folderPath, filePath, name) =>
    workspaceService.renameFile(folderPath, filePath, name),
  "airpaste:renameEntry": (folderPath, entryPath, name) =>
    workspaceService.renameEntry(folderPath, entryPath, name),
  "airpaste:deleteFile": (folderPath, filePath) =>
    workspaceService.deleteFile(folderPath, filePath),
  "airpaste:deleteEntry": (folderPath, entryPath) =>
    workspaceService.deleteEntry(folderPath, entryPath),
  "airpaste:markItemStarred": (folderPath, filePath, starred) =>
    workspaceService.markItemStarred(folderPath, filePath, starred),
  "airpaste:recordRecentItem": (folderPath, filePath) =>
    workspaceService.recordRecentItem(folderPath, filePath),
  "airpaste:getItemForFilePath": (folderPath, filePath) =>
    workspaceService.getItemForFilePath(folderPath, filePath),
  "airpaste:loadUiState": (folderPath) =>
    workspaceService.loadUiState(folderPath),
  "airpaste:readMarkdownFile": (folderPath, filePath) =>
    workspaceService.readMarkdownFile(folderPath, filePath),
  "airpaste:saveUiState": (folderPath, partialState) =>
    workspaceService.saveUiState(folderPath, partialState),
  "airpaste:writeMarkdownFile": (folderPath, filePath, content) =>
    workspaceService.writeMarkdownFile(folderPath, filePath, content),
});

// A structured error's informative fields (code, pending/updatedAt) don't
// survive the IPC boundary -- ipcRenderer.invoke only reliably carries the
// message back to the renderer -- so they're folded into the message here,
// behind a prefix the renderer can detect and parse. Mirrored in
// renderer/src/lib/desktop.js's parseDomeSyncPendingError/parseCanvasConflictError.
const SYNC_PENDING_MESSAGE_PREFIX = "DOME_SYNC_PENDING:";
const CANVAS_CONFLICT_MESSAGE_PREFIX = "CANVAS_CONFLICT:";

function rethrowForRenderer(error) {
  if (error?.code === "DOME_SYNC_PENDING") {
    throw new Error(`${SYNC_PENDING_MESSAGE_PREFIX}${JSON.stringify({ pending: error.pending ?? [] })}`);
  }
  if (error?.code === "CANVAS_CONFLICT") {
    throw new Error(`${CANVAS_CONFLICT_MESSAGE_PREFIX}${JSON.stringify({ updatedAt: error.updatedAt ?? null })}`);
  }
  throw error;
}

function registerIpc() {
  ipcMain.handle("airpaste:loadWorkspace", async (_event, folderPath, options = null) => {
    const allowScaffold = Boolean(options?.allowScaffold);
    try {
      await openOrInitializeDome(folderPath, { initialize: true, allowScaffold });
      return await withWorkspaceQueue(folderPath, async () => (
        workspaceService.loadWorkspace(folderPath, { allowScaffold })
      ));
    } catch (error) {
      return rethrowForRenderer(error);
    }
  });

  ipcMain.handle("airpaste:createWorkspace", async (_event, folderPath) => {
    await workspaceService.createDome(folderPath, path.basename(folderPath));
    await openOrInitializeDome(folderPath, { initialize: false });
    return withWorkspaceQueue(folderPath, async () => {
      return workspaceService.createWorkspace(folderPath, { allowScaffold: true });
    });
  });

  ipcMain.handle("airpaste:saveWorkspace", async (_event, folderPath, data) => {
    return withWorkspaceQueue(folderPath, async () => {
      return workspaceService.saveWorkspace(folderPath, data);
    });
  });

  for (const [channel, handler] of Object.entries(workspaceActionHandlers)) {
    ipcMain.handle(channel, async (_event, folderPath, ...args) => (
      withWorkspaceQueue(folderPath, () => handler(folderPath, ...args))
    ));
  }

  ipcMain.handle("airpaste:loadCanvas", async (_event, filePath) => {
    const queueKey = await resolveWorkspaceQueueKeyForFile(filePath);
    return withWorkspaceQueue(queueKey, () => workspaceService.loadCanvas(filePath));
  });

  ipcMain.handle("airpaste:saveCanvas", async (_event, filePath, data, options = null) => {
    const queueKey = await resolveWorkspaceQueueKeyForFile(filePath);
    try {
      return await withWorkspaceQueue(queueKey, () => workspaceService.saveCanvas(filePath, data, options));
    } catch (error) {
      return rethrowForRenderer(error);
    }
  });

  ipcMain.handle("airpaste:listCanvasHistory", async (_event, filePath) => {
    const queueKey = await resolveWorkspaceQueueKeyForFile(filePath);
    return withWorkspaceQueue(queueKey, () => workspaceService.listCanvasHistory(filePath));
  });

  ipcMain.handle("airpaste:restoreCanvasHistoryEntry", async (_event, filePath, entryId) => {
    const queueKey = await resolveWorkspaceQueueKeyForFile(filePath);
    return withWorkspaceQueue(queueKey, () => workspaceService.restoreCanvasHistoryEntry(filePath, entryId));
  });
}

module.exports = {
  registerIpc,
};
