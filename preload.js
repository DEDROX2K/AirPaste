const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("airpaste", {
  openFolder: () => ipcRenderer.invoke("airpaste:openFolder"),
  loadWorkspace: (folderPath) => ipcRenderer.invoke("airpaste:loadWorkspace", folderPath),
  saveWorkspace: (folderPath, data) => ipcRenderer.invoke("airpaste:saveWorkspace", folderPath, data),
  fetchLinkPreview: (folderPath, cardId, url, cardSnapshot) =>
    ipcRenderer.invoke("airpaste:fetchLinkPreview", folderPath, cardId, url, cardSnapshot),
  cancelLinkPreview: (folderPath, cardId) =>
    ipcRenderer.invoke("airpaste:cancelLinkPreview", folderPath, cardId),
  getLastFolder: () => ipcRenderer.invoke("airpaste:getLastFolder"),
  onPreviewUpdated: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("airpaste:previewUpdated", handler);
    return () => ipcRenderer.removeListener("airpaste:previewUpdated", handler);
  },
});

contextBridge.exposeInMainWorld("electronAPI", {
  minimize:  () => ipcRenderer.send("window:minimize"),
  maximize:  () => ipcRenderer.send("window:maximize"),
  close:     () => ipcRenderer.send("window:close"),
  usesCustomTitlebar: process.platform === "darwin",
});
