const airpasteBridge = window.airpaste ?? {};
const electronBridge = window.electronAPI ?? {};

export const desktop = {
  workspace: {
    openFolder: (...args) => airpasteBridge.openFolder?.(...args) ?? Promise.resolve(null),
    loadWorkspace: (...args) => airpasteBridge.loadWorkspace?.(...args) ?? Promise.resolve(null),
    saveWorkspace: (...args) => airpasteBridge.saveWorkspace?.(...args) ?? Promise.resolve(null),
    fetchLinkPreview: (...args) => airpasteBridge.fetchLinkPreview?.(...args) ?? Promise.resolve({ queued: false }),
    cancelLinkPreview: (...args) => airpasteBridge.cancelLinkPreview?.(...args) ?? Promise.resolve({ cancelled: false }),
    getLastFolder: (...args) => airpasteBridge.getLastFolder?.(...args) ?? Promise.resolve(null),
    onPreviewUpdated: (listener) => airpasteBridge.onPreviewUpdated?.(listener) ?? (() => {}),
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
