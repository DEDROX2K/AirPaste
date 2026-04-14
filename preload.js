const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("airpaste", {
  openFolder: () => ipcRenderer.invoke("airpaste:openFolder"),
  listDomes: () => ipcRenderer.invoke("airpaste:listDomes"),
  getActiveDome: () => ipcRenderer.invoke("airpaste:getActiveDome"),
  createDome: (parentFolderPath, name) => ipcRenderer.invoke("airpaste:createDome", parentFolderPath, name),
  openDome: () => ipcRenderer.invoke("airpaste:openDome"),
  switchDome: (domeId) => ipcRenderer.invoke("airpaste:switchDome", domeId),
  removeDome: (domeId) => ipcRenderer.invoke("airpaste:removeDome", domeId),
  revealDome: (domePath) => ipcRenderer.invoke("airpaste:revealDome", domePath),
  createWorkspace: (folderPath) => ipcRenderer.invoke("airpaste:createWorkspace", folderPath),
  loadWorkspace: (folderPath) => ipcRenderer.invoke("airpaste:loadWorkspace", folderPath),
  saveWorkspace: (folderPath, data) => ipcRenderer.invoke("airpaste:saveWorkspace", folderPath, data),
  listFiles: (folderPath) => ipcRenderer.invoke("airpaste:listFiles", folderPath),
  getHomeData: (folderPath, currentFolderPath) =>
    ipcRenderer.invoke("airpaste:getHomeData", folderPath, currentFolderPath),
  getRecentItems: (folderPath) => ipcRenderer.invoke("airpaste:getRecentItems", folderPath),
  getStarredItems: (folderPath) => ipcRenderer.invoke("airpaste:getStarredItems", folderPath),
  createCanvas: (folderPath, name, targetFolderPath) =>
    ipcRenderer.invoke("airpaste:createCanvas", folderPath, name, targetFolderPath),
  createPage: (folderPath, name, targetFolderPath) =>
    ipcRenderer.invoke("airpaste:createPage", folderPath, name, targetFolderPath),
  loadCanvas: (filePath) =>
    ipcRenderer.invoke("airpaste:loadCanvas", filePath),
  saveCanvas: (filePath, data, options = null) =>
    ipcRenderer.invoke("airpaste:saveCanvas", filePath, data, options),
  loadPage: (filePath) =>
    ipcRenderer.invoke("airpaste:loadPage", filePath),
  savePage: (filePath, markdown) =>
    ipcRenderer.invoke("airpaste:savePage", filePath, markdown),
  renameFile: (folderPath, filePath, name) =>
    ipcRenderer.invoke("airpaste:renameFile", folderPath, filePath, name),
  deleteFile: (folderPath, filePath) =>
    ipcRenderer.invoke("airpaste:deleteFile", folderPath, filePath),
  markItemStarred: (folderPath, filePath, starred) =>
    ipcRenderer.invoke("airpaste:markItemStarred", folderPath, filePath, starred),
  recordRecentItem: (folderPath, filePath) =>
    ipcRenderer.invoke("airpaste:recordRecentItem", folderPath, filePath),
  getItemForFilePath: (folderPath, filePath) =>
    ipcRenderer.invoke("airpaste:getItemForFilePath", folderPath, filePath),
  loadUiState: (folderPath) => ipcRenderer.invoke("airpaste:loadUiState", folderPath),
  saveUiState: (folderPath, partialState) =>
    ipcRenderer.invoke("airpaste:saveUiState", folderPath, partialState),
  openExternal: (url) => ipcRenderer.invoke("airpaste:openExternal", url),
  openFile: (filePath) => ipcRenderer.invoke("airpaste:openFile", filePath),
  fetchLinkPreview: (folderPath, cardId, url, cardSnapshot) =>
    ipcRenderer.invoke("airpaste:fetchLinkPreview", folderPath, cardId, url, cardSnapshot),
  cancelLinkPreview: (folderPath, cardId) =>
    ipcRenderer.invoke("airpaste:cancelLinkPreview", folderPath, cardId),
  importImageAsset: (folderPath, payload) =>
    ipcRenderer.invoke("airpaste:importImageAsset", folderPath, payload),
  resolveAssetUrl: (folderPath, relativePath, options) =>
    ipcRenderer.invoke("airpaste:resolveAssetUrl", folderPath, relativePath, options),
  getLastFolder: () => ipcRenderer.invoke("airpaste:getLastFolder"),
  onPreviewUpdated: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("airpaste:previewUpdated", handler);
    return () => ipcRenderer.removeListener("airpaste:previewUpdated", handler);
  },
});

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  usesCustomTitlebar: true,
});
