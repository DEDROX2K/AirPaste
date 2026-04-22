const airpasteBridge = window.airpaste ?? {};
const electronBridge = window.electronAPI ?? {};

async function invokeWithFallback(invoke, fallbackValue) {
  try {
    return await invoke();
  } catch (error) {
    const message = String(error?.message ?? "");
    if (message.includes("No handler registered")) {
      return typeof fallbackValue === "function" ? fallbackValue() : fallbackValue;
    }
    throw error;
  }
}

export const desktop = {
  dome: {
    listDomes: (...args) => invokeWithFallback(
      () => airpasteBridge.listDomes?.(...args) ?? Promise.resolve({ activeDomeId: null, recentDomes: [] }),
      { activeDomeId: null, recentDomes: [] },
    ),
    getActiveDome: (...args) => invokeWithFallback(
      () => airpasteBridge.getActiveDome?.(...args) ?? Promise.resolve(null),
      null,
    ),
    createDome: (...args) => invokeWithFallback(
      () => airpasteBridge.createDome?.(...args) ?? Promise.resolve(null),
      null,
    ),
    openDome: (...args) => invokeWithFallback(
      () => airpasteBridge.openDome?.(...args) ?? Promise.resolve(null),
      null,
    ),
    switchDome: (...args) => invokeWithFallback(
      () => airpasteBridge.switchDome?.(...args) ?? Promise.resolve(null),
      null,
    ),
    removeDome: (...args) => invokeWithFallback(
      () => airpasteBridge.removeDome?.(...args) ?? Promise.resolve({ activeDomeId: null, recentDomes: [] }),
      { activeDomeId: null, recentDomes: [] },
    ),
    revealDome: (...args) => invokeWithFallback(
      () => airpasteBridge.revealDome?.(...args) ?? Promise.resolve({ opened: false }),
      { opened: false },
    ),
  },
  workspace: {
    openFolder: (...args) => airpasteBridge.openFolder?.(...args) ?? Promise.resolve(null),
    openFiles: (...args) => airpasteBridge.openFiles?.(...args) ?? Promise.resolve([]),
    createWorkspace: (...args) => airpasteBridge.createWorkspace?.(...args) ?? Promise.resolve(null),
    loadWorkspace: (...args) => airpasteBridge.loadWorkspace?.(...args) ?? Promise.resolve(null),
    saveWorkspace: (...args) => airpasteBridge.saveWorkspace?.(...args) ?? Promise.resolve(null),
    listFiles: (...args) => airpasteBridge.listFiles?.(...args) ?? Promise.resolve([]),
    createCanvas: (...args) => airpasteBridge.createCanvas?.(...args) ?? Promise.resolve(null),
    createFolder: (...args) => airpasteBridge.createFolder?.(...args) ?? Promise.resolve(null),
    getHomeData: (...args) => airpasteBridge.getHomeData?.(...args) ?? Promise.resolve(null),
    getRecentItems: (...args) => airpasteBridge.getRecentItems?.(...args) ?? Promise.resolve([]),
    getStarredItems: (...args) => airpasteBridge.getStarredItems?.(...args) ?? Promise.resolve([]),
    loadCanvas: (...args) => airpasteBridge.loadCanvas?.(...args) ?? Promise.resolve(null),
    saveCanvas: (filePath, data, options = null) =>
      airpasteBridge.saveCanvas?.(filePath, data, options) ?? Promise.resolve(null),
    renameFile: (...args) => airpasteBridge.renameFile?.(...args) ?? Promise.resolve(null),
    renameEntry: (...args) => airpasteBridge.renameEntry?.(...args) ?? Promise.resolve(null),
    deleteFile: (...args) => airpasteBridge.deleteFile?.(...args) ?? Promise.resolve({ deleted: false }),
    deleteEntry: (...args) => airpasteBridge.deleteEntry?.(...args) ?? Promise.resolve({ deleted: false }),
    markItemStarred: (...args) => airpasteBridge.markItemStarred?.(...args) ?? Promise.resolve(null),
    recordRecentItem: (...args) => airpasteBridge.recordRecentItem?.(...args) ?? Promise.resolve([]),
    getItemForFilePath: (...args) => airpasteBridge.getItemForFilePath?.(...args) ?? Promise.resolve(null),
    loadUiState: (...args) => airpasteBridge.loadUiState?.(...args) ?? Promise.resolve(null),
    saveUiState: (...args) => airpasteBridge.saveUiState?.(...args) ?? Promise.resolve(null),
    fetchLinkPreview: (...args) => airpasteBridge.fetchLinkPreview?.(...args) ?? Promise.resolve({ queued: false }),
    cancelLinkPreview: (...args) => airpasteBridge.cancelLinkPreview?.(...args) ?? Promise.resolve({ cancelled: false }),
    importImageAsset: (...args) => airpasteBridge.importImageAsset?.(...args) ?? Promise.resolve(null),
    importFiles: (...args) => airpasteBridge.importFiles?.(...args) ?? Promise.resolve([]),
    resolveAssetUrl: (folderPath, relativePath, options = null) =>
      airpasteBridge.resolveAssetUrl?.(folderPath, relativePath, options) ?? Promise.resolve(""),
    getPreviewCapabilities: (...args) =>
      airpasteBridge.getPreviewCapabilities?.(...args) ?? Promise.resolve({ enabled: true }),
    openFile: (...args) => airpasteBridge.openFile?.(...args) ?? Promise.resolve({ opened: false }),
    getLastFolder: (...args) => airpasteBridge.getLastFolder?.(...args) ?? Promise.resolve(null),
    restoreLastWorkspace: async () => {
      const folderPath = await airpasteBridge.getLastFolder?.();
      if (folderPath) {
        const payload = await airpasteBridge.loadWorkspace?.(folderPath);
        return payload;
      }
      return null;
    },
    onPreviewUpdated: (listener) => airpasteBridge.onPreviewUpdated?.(listener) ?? (() => { }),
  },
  shell: {
    openExternal: (url) => airpasteBridge.openExternal?.(url) ?? Promise.resolve({ opened: false }),
  },
  window: {
    minimize: () => electronBridge.minimize?.(),
    maximize: () => electronBridge.maximize?.(),
    close: () => electronBridge.close?.(),
    usesCustomTitlebar: electronBridge.usesCustomTitlebar === true,
  },
};
