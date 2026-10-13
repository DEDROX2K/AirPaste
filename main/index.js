const { app, BrowserWindow } = require("electron");
const context = require("./context");
const windows = require("./windows");
const assetsIpc = require("./ipc/assets");
const domeIpc = require("./ipc/dome");
const filesIpc = require("./ipc/files");
const linkPreviewIpc = require("./ipc/linkPreview");
const workspaceIpc = require("./ipc/workspace");

// Must run before app is ready, same as the original main.js top level.
assetsIpc.registerProtocolScheme();

windows.registerIpc();
domeIpc.registerIpc();
workspaceIpc.registerIpc();
assetsIpc.registerIpc();
filesIpc.registerIpc();
linkPreviewIpc.registerIpc();

app.whenReady().then(async () => {
  assetsIpc.registerProtocolHandler();

  await windows.createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await windows.createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Quitting via Cmd+Q / the app menu's Quit (role: "quit") fires "before-quit"
// *before* any window's own "close" event -- without this handler, that used
// to let the app quit (and lose any still-debounced canvas edit) without ever
// giving the renderer a chance to flush, even though closing the window via
// its own close button already did, through the window's "close" listener.
// Routing both paths through the same requestGracefulClose keeps them
// consistent instead of only fixing the one the original bug report covered.
let quitFlushHandled = false;

app.on("before-quit", (event) => {
  if (quitFlushHandled) {
    void linkPreviewIpc.closePreviewBrowserOnQuit();
    return;
  }

  const mainWindow = context.mainWindow;
  if (!mainWindow || mainWindow.isDestroyed()) {
    void linkPreviewIpc.closePreviewBrowserOnQuit();
    return;
  }

  event.preventDefault();
  windows.requestGracefulClose(() => {
    quitFlushHandled = true;
    windows.markImmediateCloseAllowed();
    void linkPreviewIpc.closePreviewBrowserOnQuit();
    app.quit();
  });
});
