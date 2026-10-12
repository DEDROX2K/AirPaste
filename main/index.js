const { app, BrowserWindow } = require("electron");
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

app.on("before-quit", () => {
  windows.markImmediateCloseAllowed();
  void linkPreviewIpc.closePreviewBrowserOnQuit();
});
