const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("airpaste", {
  openFolder: () => ipcRenderer.invoke("airpaste:openFolder"),
  createWorkspace: (folderPath) => ipcRenderer.invoke("airpaste:createWorkspace", folderPath),
  loadWorkspace: (folderPath) => ipcRenderer.invoke("airpaste:loadWorkspace", folderPath),
  saveWorkspace: (folderPath, data) => ipcRenderer.invoke("airpaste:saveWorkspace", folderPath, data),
  createProject: (folderPath, name) => ipcRenderer.invoke("airpaste:createProject", folderPath, name),
  createSpace: (folderPath, projectId, name) => ipcRenderer.invoke("airpaste:createSpace", folderPath, projectId, name),
  createCanvas: (folderPath, projectId, spaceId, name) =>
    ipcRenderer.invoke("airpaste:createCanvas", folderPath, projectId, spaceId, name),
  createPage: (folderPath, projectId, spaceId, name) =>
    ipcRenderer.invoke("airpaste:createPage", folderPath, projectId, spaceId, name),
  listProjects: (folderPath) => ipcRenderer.invoke("airpaste:listProjects", folderPath),
  getProject: (folderPath, projectId) => ipcRenderer.invoke("airpaste:getProject", folderPath, projectId),
  listSpaces: (folderPath, projectId) => ipcRenderer.invoke("airpaste:listSpaces", folderPath, projectId),
  getSpace: (folderPath, projectId, spaceId) =>
    ipcRenderer.invoke("airpaste:getSpace", folderPath, projectId, spaceId),
  listItems: (folderPath, projectId, spaceId) =>
    ipcRenderer.invoke("airpaste:listItems", folderPath, projectId, spaceId),
  getHomeData: (folderPath) => ipcRenderer.invoke("airpaste:getHomeData", folderPath),
  getRecentItems: (folderPath) => ipcRenderer.invoke("airpaste:getRecentItems", folderPath),
  getStarredItems: (folderPath) => ipcRenderer.invoke("airpaste:getStarredItems", folderPath),
  getProjectsSummary: (folderPath) => ipcRenderer.invoke("airpaste:getProjectsSummary", folderPath),
  getProjectContents: (folderPath, projectId) =>
    ipcRenderer.invoke("airpaste:getProjectContents", folderPath, projectId),
  getSpaceContents: (folderPath, projectId, spaceId) =>
    ipcRenderer.invoke("airpaste:getSpaceContents", folderPath, projectId, spaceId),
  loadCanvas: (folderPath, projectId, spaceId, canvasId) =>
    ipcRenderer.invoke("airpaste:loadCanvas", folderPath, projectId, spaceId, canvasId),
  saveCanvas: (folderPath, projectId, spaceId, canvasId, data) =>
    ipcRenderer.invoke("airpaste:saveCanvas", folderPath, projectId, spaceId, canvasId, data),
  loadPage: (folderPath, projectId, spaceId, pageId) =>
    ipcRenderer.invoke("airpaste:loadPage", folderPath, projectId, spaceId, pageId),
  savePage: (folderPath, projectId, spaceId, pageId, markdown) =>
    ipcRenderer.invoke("airpaste:savePage", folderPath, projectId, spaceId, pageId, markdown),
  renameProject: (folderPath, projectId, name) =>
    ipcRenderer.invoke("airpaste:renameProject", folderPath, projectId, name),
  renameSpace: (folderPath, projectId, spaceId, name) =>
    ipcRenderer.invoke("airpaste:renameSpace", folderPath, projectId, spaceId, name),
  renameCanvas: (folderPath, projectId, spaceId, canvasId, name) =>
    ipcRenderer.invoke("airpaste:renameCanvas", folderPath, projectId, spaceId, canvasId, name),
  renamePage: (folderPath, projectId, spaceId, pageId, name) =>
    ipcRenderer.invoke("airpaste:renamePage", folderPath, projectId, spaceId, pageId, name),
  markItemStarred: (folderPath, itemId, starred) =>
    ipcRenderer.invoke("airpaste:markItemStarred", folderPath, itemId, starred),
  loadUiState: (folderPath) => ipcRenderer.invoke("airpaste:loadUiState", folderPath),
  saveUiState: (folderPath, partialState) =>
    ipcRenderer.invoke("airpaste:saveUiState", folderPath, partialState),
  deleteProject: (folderPath, projectId) => ipcRenderer.invoke("airpaste:deleteProject", folderPath, projectId),
  deleteSpace: (folderPath, projectId, spaceId) =>
    ipcRenderer.invoke("airpaste:deleteSpace", folderPath, projectId, spaceId),
  deleteCanvas: (folderPath, projectId, spaceId, canvasId) =>
    ipcRenderer.invoke("airpaste:deleteCanvas", folderPath, projectId, spaceId, canvasId),
  deletePage: (folderPath, projectId, spaceId, pageId) =>
    ipcRenderer.invoke("airpaste:deletePage", folderPath, projectId, spaceId, pageId),
  openExternal: (url) => ipcRenderer.invoke("airpaste:openExternal", url),
  fetchLinkPreview: (folderPath, cardId, url, cardSnapshot) =>
    ipcRenderer.invoke("airpaste:fetchLinkPreview", folderPath, cardId, url, cardSnapshot),
  cancelLinkPreview: (folderPath, cardId) =>
    ipcRenderer.invoke("airpaste:cancelLinkPreview", folderPath, cardId),
  importImageAsset: (folderPath, projectId, spaceId, canvasId, payload) =>
    ipcRenderer.invoke("airpaste:importImageAsset", folderPath, projectId, spaceId, canvasId, payload),
  resolveAssetUrl: (folderPath, relativePath) =>
    ipcRenderer.invoke("airpaste:resolveAssetUrl", folderPath, relativePath),
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
  usesTitleBarOverlay: process.platform === "win32",
});
