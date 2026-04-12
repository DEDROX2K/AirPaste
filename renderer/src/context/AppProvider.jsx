import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppContext } from "./AppContext";
import { useTabs } from "./useTabs";
import {
  createEmptyWorkspace,
  createLinkCard,
  createRackCard,
  normalizeWorkspace,
  removeCard,
  reorderCards,
  replaceCards,
  updateCard,
  updateCards,
} from "../lib/workspace";
import { desktop } from "../lib/desktop";

const SAVE_DELAY_MS = 250;
const DEFAULT_WORKSPACE_HISTORY_LIMIT = 20;

function getWorkspaceHistoryLimit() {
  // Keep this behind a helper so the limit can later come from Settings.
  return DEFAULT_WORKSPACE_HISTORY_LIMIT;
}

function areObjectsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every((key) => a[key] === b[key]);
}

function areCardsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  return areObjectsEqual(a, b)
    && areObjectsEqual(a.asset, b.asset)
    && areObjectsEqual(a.layout?.globe, b.layout?.globe);
}

function areWorkspacesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  if (
    a.version !== b.version
    || !areObjectsEqual(a.viewport, b.viewport)
    || !areObjectsEqual(a.view, b.view)
    || a.cards.length !== b.cards.length
  ) {
    return false;
  }

  for (let index = 0; index < a.cards.length; index += 1) {
    if (!areCardsEqual(a.cards[index], b.cards[index])) {
      return false;
    }
  }

  return true;
}

function createWorkspaceHistory(workspace, limit = getWorkspaceHistoryLimit()) {
  return {
    past: [],
    present: normalizeWorkspace(workspace),
    future: [],
    limit,
  };
}

function normalizeWorkspaceHistory(entry) {
  if (
    entry
    && typeof entry === "object"
    && Array.isArray(entry.past)
    && entry.present
    && Array.isArray(entry.future)
  ) {
    const limit = Number.isFinite(entry.limit) ? Math.max(1, Math.round(entry.limit)) : getWorkspaceHistoryLimit();
    return {
      past: entry.past.map((workspace) => normalizeWorkspace(workspace)).slice(-limit),
      present: normalizeWorkspace(entry.present),
      future: entry.future.map((workspace) => normalizeWorkspace(workspace)),
      limit,
    };
  }

  return createWorkspaceHistory(entry ?? createEmptyWorkspace());
}

function createHomeState() {
  return {
    workspace: null,
    currentFolderPath: "",
    folders: [],
    files: [],
    allFiles: [],
    recentItems: [],
    starredItems: [],
    uiState: null,
  };
}

export function AppProvider({ children }) {
  const { activeTab, openTab, closeTabsForEntity, renameTabForEntity, showHomeTab } = useTabs();
  const [booting, setBooting] = useState(true);
  const [folderPath, setFolderPath] = useState(null);
  const [homeData, setHomeData] = useState(createHomeState());
  const [folderLoading, setFolderLoading] = useState(false);
  const [error, setError] = useState("");
  const [workspacesByPath, setWorkspacesByPath] = useState({});
  const [pagesByPath, setPagesByPath] = useState({});

  const saveTimeoutRef = useRef(null);
  const pageSaveTimeoutRef = useRef(null);
  const skipCanvasSaveRef = useRef({});
  const skipPageSaveRef = useRef({});
  const workspaceDraftBaseRef = useRef({});
  const workspacesRef = useRef(workspacesByPath);
  const pagesRef = useRef(pagesByPath);
  const activeCanvasPathRef = useRef(null);
  const activePagePathRef = useRef(null);

  useEffect(() => {
    workspacesRef.current = workspacesByPath;
    activeCanvasPathRef.current = activeTab?.type === "canvas" ? activeTab.entityId : null;
  }, [activeTab, workspacesByPath]);

  useEffect(() => {
    pagesRef.current = pagesByPath;
    activePagePathRef.current = activeTab?.type === "page" ? activeTab.entityId : null;
  }, [activeTab, pagesByPath]);

  const currentEditor = useMemo(() => {
    if (!activeTab || activeTab.type === "home") return { kind: "home" };
    return {
      kind: activeTab.type,
      filePath: activeTab.entityId,
      name: activeTab.title,
    };
  }, [activeTab]);

  const workspace = useMemo(() => {
    if (currentEditor.kind !== "canvas") return createEmptyWorkspace();
    return workspacesByPath[currentEditor.filePath]?.present ?? createEmptyWorkspace();
  }, [currentEditor, workspacesByPath]);

  const workspaceHistory = useMemo(() => {
    if (currentEditor.kind !== "canvas") return createWorkspaceHistory(createEmptyWorkspace());
    return workspacesByPath[currentEditor.filePath] ?? createWorkspaceHistory(createEmptyWorkspace());
  }, [currentEditor, workspacesByPath]);

  const currentPage = useMemo(() => {
    if (currentEditor.kind !== "page") return null;
    return pagesByPath[currentEditor.filePath] ?? null;
  }, [currentEditor, pagesByPath]);

  const applyHomeData = useCallback((payload) => {
    setHomeData({
      workspace: payload?.workspace ?? null,
      currentFolderPath: typeof payload?.currentFolderPath === "string" ? payload.currentFolderPath : "",
      folders: Array.isArray(payload?.folders) ? payload.folders : [],
      files: Array.isArray(payload?.files) ? payload.files : [],
      allFiles: Array.isArray(payload?.allFiles) ? payload.allFiles : [],
      recentItems: Array.isArray(payload?.recentItems) ? payload.recentItems : [],
      starredItems: Array.isArray(payload?.starredItems) ? payload.starredItems : [],
      uiState: payload?.uiState ?? null,
    });
  }, []);

  const clearWorkspaceState = useCallback(() => {
    setFolderPath(null);
    setHomeData(createHomeState());
    setWorkspacesByPath({});
    setPagesByPath({});
    skipCanvasSaveRef.current = {};
    skipPageSaveRef.current = {};
    workspaceDraftBaseRef.current = {};
    showHomeTab();
  }, [showHomeTab]);

  const refreshHomeData = useCallback(async (targetFolderPath = folderPath, currentFolderPath = undefined) => {
    if (!targetFolderPath) return null;
    const payload = await desktop.workspace.getHomeData(targetFolderPath, currentFolderPath);
    applyHomeData(payload);
    return payload;
  }, [applyHomeData, folderPath]);

  const loadFolder = useCallback(async (nextFolderPath) => {
    if (!nextFolderPath) return null;
    setFolderLoading(true);
    setError("");
    try {
      await desktop.workspace.loadWorkspace(nextFolderPath);
      const payload = await desktop.workspace.getHomeData(nextFolderPath);
      setFolderPath(nextFolderPath);
      setWorkspacesByPath({});
      setPagesByPath({});
      skipCanvasSaveRef.current = {};
      skipPageSaveRef.current = {};
      workspaceDraftBaseRef.current = {};
      applyHomeData(payload);
      showHomeTab();
      return nextFolderPath;
    } catch (loadError) {
      setError(loadError.message || "Unable to open that folder.");
      clearWorkspaceState();
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [applyHomeData, clearWorkspaceState, showHomeTab]);

  const openExistingWorkspace = useCallback(async () => {
    const selectedPath = await desktop.workspace.openFolder();
    if (!selectedPath) return null;
    return loadFolder(selectedPath);
  }, [loadFolder]);

  const createNewWorkspace = useCallback(async () => {
    const selectedPath = await desktop.workspace.openFolder();
    if (!selectedPath) return null;
    setFolderLoading(true);
    setError("");
    try {
      await desktop.workspace.createWorkspace(selectedPath);
      return await loadFolder(selectedPath);
    } catch (createError) {
      setError(createError.message || "Unable to create workspace in this folder.");
      clearWorkspaceState();
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [clearWorkspaceState, loadFolder]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const lastFolder = await desktop.workspace.getLastFolder();
        if (!cancelled && lastFolder) await loadFolder(lastFolder);
      } catch (bootError) {
        if (!cancelled) setError(bootError.message || "Unable to restore previous workspace.");
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [loadFolder]);

  const openCanvasFile = useCallback(async (filePath) => {
    const doc = await desktop.workspace.loadCanvas(filePath);
    setWorkspacesByPath((prev) => ({ ...prev, [doc.filePath]: createWorkspaceHistory(doc.workspace) }));
    delete workspaceDraftBaseRef.current[doc.filePath];
    skipCanvasSaveRef.current[doc.filePath] = true;
    openTab({ type: "canvas", entityId: doc.filePath, title: doc.name, filePath: doc.path });
    await refreshHomeData(folderPath);
    return doc;
  }, [folderPath, openTab, refreshHomeData]);

  const openPageFile = useCallback(async (filePath) => {
    const doc = await desktop.workspace.loadPage(filePath);
    setPagesByPath((prev) => ({
      ...prev,
      [doc.filePath]: {
        ...doc,
        dirty: false,
        saveStatus: "saved",
        lastSavedMarkdown: doc.markdown,
      },
    }));
    skipPageSaveRef.current[doc.filePath] = true;
    openTab({ type: "page", entityId: doc.filePath, title: doc.name, filePath: doc.path });
    await refreshHomeData(folderPath);
    return doc;
  }, [folderPath, openTab, refreshHomeData]);

  const openHomeItem = useCallback(async (item) => {
    if (!item?.filePath) return null;
    if (item.type === "canvas") return openCanvasFile(item.filePath);
    if (item.type === "page") return openPageFile(item.filePath);
    await desktop.workspace.openFile(item.filePath);
    await desktop.workspace.recordRecentItem(folderPath, item.filePath).catch(() => {});
    await refreshHomeData(folderPath);
    return item;
  }, [folderPath, openCanvasFile, openPageFile, refreshHomeData]);

  const showHome = useCallback(async () => {
    showHomeTab();
    if (folderPath) await refreshHomeData(folderPath);
  }, [folderPath, refreshHomeData, showHomeTab]);

  const navigateHomeFolder = useCallback(async (nextFolderPath) => {
    if (!folderPath) return null;
    const payload = await desktop.workspace.getHomeData(folderPath, nextFolderPath);
    applyHomeData(payload);
    return payload;
  }, [applyHomeData, folderPath]);

  const saveHomeUiState = useCallback(async (partialState) => {
    if (!folderPath) return null;
    const nextUiState = await desktop.workspace.saveUiState(folderPath, partialState);
    setHomeData((current) => ({ ...current, uiState: nextUiState }));
    return nextUiState;
  }, [folderPath]);

  const createCanvasEntry = useCallback(async (name, targetFolderPath = homeData.currentFolderPath) => {
    if (!folderPath) return null;
    const doc = await desktop.workspace.createCanvas(folderPath, name, targetFolderPath);
    await openCanvasFile(doc.filePath);
    return doc;
  }, [folderPath, homeData.currentFolderPath, openCanvasFile]);

  const createPageEntry = useCallback(async (name, targetFolderPath = homeData.currentFolderPath) => {
    if (!folderPath) return null;
    const doc = await desktop.workspace.createPage(folderPath, name, targetFolderPath);
    await openPageFile(doc.filePath);
    return doc;
  }, [folderPath, homeData.currentFolderPath, openPageFile]);

  const renameItemEntry = useCallback(async (item, name) => {
    if (!folderPath || !item?.filePath) return null;
    const renamed = await desktop.workspace.renameFile(folderPath, item.filePath, name);
    closeTabsForEntity(item.filePath);
    setWorkspacesByPath((prev) => {
      if (!prev[item.filePath]) return prev;
      const next = { ...prev };
      next[renamed.filePath] = next[item.filePath];
      delete next[item.filePath];
      if (workspaceDraftBaseRef.current[item.filePath]) {
        workspaceDraftBaseRef.current[renamed.filePath] = workspaceDraftBaseRef.current[item.filePath];
        delete workspaceDraftBaseRef.current[item.filePath];
      }
      return next;
    });
    setPagesByPath((prev) => {
      if (!prev[item.filePath]) return prev;
      const next = { ...prev };
      next[renamed.filePath] = {
        ...next[item.filePath],
        ...renamed,
        dirty: false,
        saveStatus: "saved",
        lastSavedMarkdown: renamed.markdown,
      };
      delete next[item.filePath];
      return next;
    });
    await refreshHomeData(folderPath);
    return renamed;
  }, [closeTabsForEntity, folderPath, refreshHomeData]);

  const deleteItemEntry = useCallback(async (item) => {
    if (!folderPath || !item?.filePath) return false;
    await desktop.workspace.deleteFile(folderPath, item.filePath);
    closeTabsForEntity(item.filePath);
    delete workspaceDraftBaseRef.current[item.filePath];
    setWorkspacesByPath((prev) => {
      const next = { ...prev };
      delete next[item.filePath];
      return next;
    });
    setPagesByPath((prev) => {
      const next = { ...prev };
      delete next[item.filePath];
      return next;
    });
    await refreshHomeData(folderPath);
    return true;
  }, [closeTabsForEntity, folderPath, refreshHomeData]);

  const toggleItemStarred = useCallback(async (filePath, starred) => {
    if (!folderPath || !filePath) return null;
    const item = await desktop.workspace.markItemStarred(folderPath, filePath, starred);
    await refreshHomeData(folderPath);
    return item;
  }, [folderPath, refreshHomeData]);

  const updateCurrentPageDraft = useCallback(({ markdown, title }) => {
    const activePath = activePagePathRef.current;
    if (!activePath) return;
    setPagesByPath((current) => {
      const page = current[activePath];
      if (!page) return current;
      const nextMarkdown = typeof markdown === "string" ? markdown : page.markdown;
      const nextTitle = typeof title === "string" && title.trim() ? title.trim() : page.name;
      return {
        ...current,
        [activePath]: {
          ...page,
          name: nextTitle,
          markdown: nextMarkdown,
          dirty: nextMarkdown !== page.lastSavedMarkdown,
          saveStatus: nextMarkdown === page.lastSavedMarkdown ? "saved" : "dirty",
        },
      };
    });
    if (typeof title === "string" && title.trim()) {
      renameTabForEntity(activePath, title.trim());
    }
  }, [renameTabForEntity]);

  const updateWorkspaceState = useCallback((updater, options = {}) => {
    const activePath = options.targetPath ?? activeCanvasPathRef.current;
    if (!activePath) return;

    setWorkspacesByPath((current) => {
      const currentHistory = normalizeWorkspaceHistory(current[activePath]);
      const currentWorkspace = currentHistory.present;
      const candidateWorkspace = typeof updater === "function" ? updater(currentWorkspace) : updater;
      const nextWorkspace = normalizeWorkspace(candidateWorkspace);
      const committedBaseWorkspace = workspaceDraftBaseRef.current[activePath] ?? currentWorkspace;

      if (options.commitHistory) {
        delete workspaceDraftBaseRef.current[activePath];

        if (areWorkspacesEqual(committedBaseWorkspace, nextWorkspace)) {
          if (areWorkspacesEqual(currentWorkspace, committedBaseWorkspace)) {
            return current;
          }

          return {
            ...current,
            [activePath]: {
              ...currentHistory,
              present: committedBaseWorkspace,
            },
          };
        }

        return {
          ...current,
          [activePath]: {
            ...currentHistory,
            past: [...currentHistory.past, committedBaseWorkspace].slice(-currentHistory.limit),
            present: nextWorkspace,
            future: [],
          },
        };
      }

      if (areWorkspacesEqual(currentWorkspace, nextWorkspace)) {
        return current;
      }

      if (options.preserveCommitBase && !workspaceDraftBaseRef.current[activePath]) {
        workspaceDraftBaseRef.current[activePath] = currentWorkspace;
      }

      return {
        ...current,
        [activePath]: {
          ...currentHistory,
          present: nextWorkspace,
        },
      };
    });
  }, []);

  const commitWorkspaceChange = useCallback((nextWorkspace) => {
    updateWorkspaceState(nextWorkspace, { commitHistory: true });
  }, [updateWorkspaceState]);

  const undoWorkspaceChange = useCallback(() => {
    const activePath = activeCanvasPathRef.current;
    if (!activePath) return;

    setWorkspacesByPath((current) => {
      const currentHistory = normalizeWorkspaceHistory(current[activePath]);

      if (currentHistory.past.length === 0) {
        return current;
      }

      delete workspaceDraftBaseRef.current[activePath];

      const previousWorkspace = currentHistory.past[currentHistory.past.length - 1];
      const nextHistory = {
        ...currentHistory,
        past: currentHistory.past.slice(0, -1),
        present: previousWorkspace,
        future: [currentHistory.present, ...currentHistory.future],
      };

      return { ...current, [activePath]: nextHistory };
    });
  }, []);

  const redoWorkspaceChange = useCallback(() => {
    const activePath = activeCanvasPathRef.current;
    if (!activePath) return;

    setWorkspacesByPath((current) => {
      const currentHistory = normalizeWorkspaceHistory(current[activePath]);

      if (currentHistory.future.length === 0) {
        return current;
      }

      delete workspaceDraftBaseRef.current[activePath];

      const [nextWorkspace, ...remainingFuture] = currentHistory.future;
      const nextHistory = {
        ...currentHistory,
        past: [...currentHistory.past, currentHistory.present].slice(-currentHistory.limit),
        present: nextWorkspace,
        future: remainingFuture,
      };

      return { ...current, [activePath]: nextHistory };
    });
  }, []);

  const discardWorkspaceDraft = useCallback(() => {
    const activePath = activeCanvasPathRef.current;
    if (!activePath) return;

    setWorkspacesByPath((current) => {
      const draftBaseWorkspace = workspaceDraftBaseRef.current[activePath];

      if (!draftBaseWorkspace) {
        return current;
      }

      delete workspaceDraftBaseRef.current[activePath];

      return {
        ...current,
        [activePath]: {
          ...normalizeWorkspaceHistory(current[activePath]),
          present: draftBaseWorkspace,
        },
      };
    });
  }, []);

  const setViewport = useCallback((nextViewport) => updateWorkspaceState((current) => ({ ...current, viewport: nextViewport })), [updateWorkspaceState]);
  const setWorkspaceView = useCallback((nextView) => updateWorkspaceState((current) => ({
    ...current,
    view: typeof nextView === "function" ? nextView(current.view ?? null) : nextView,
  })), [updateWorkspaceState]);
  const createNewLinkCard = useCallback((url, center = null, options = {}) => {
    const card = createLinkCard(workspace.cards, workspace.viewport, url, center, options);
    commitWorkspaceChange((current) => ({ ...current, cards: [...current.cards, card] }));
    return card;
  }, [commitWorkspaceChange, workspace.cards, workspace.viewport]);
  const createNewRackCard = useCallback((center = null, options = {}) => {
    const card = createRackCard(workspace.cards, workspace.viewport, center, options);
    commitWorkspaceChange((current) => ({ ...current, cards: [...current.cards, card] }));
    return card;
  }, [commitWorkspaceChange, workspace.cards, workspace.viewport]);
  const updateExistingCard = useCallback((cardId, updates) => updateWorkspaceState((current) => ({ ...current, cards: updateCard(current.cards, cardId, updates) })), [updateWorkspaceState]);
  const updateExistingCards = useCallback((updatesById) => updateWorkspaceState((current) => ({ ...current, cards: updateCards(current.cards, updatesById) })), [updateWorkspaceState]);
  const replaceWorkspaceCards = useCallback((nextCards) => updateWorkspaceState((current) => ({ ...current, cards: replaceCards(current.cards, nextCards) }), { preserveCommitBase: true }), [updateWorkspaceState]);
  const reorderExistingCards = useCallback((orderedIds) => updateWorkspaceState((current) => ({ ...current, cards: reorderCards(current.cards, orderedIds) }), { preserveCommitBase: true }), [updateWorkspaceState]);
  const deleteExistingCard = useCallback((cardId) => {
    commitWorkspaceChange((current) => ({ ...current, cards: removeCard(current.cards, cardId) }));
    if (folderPath) void desktop.workspace.cancelLinkPreview(folderPath, cardId).catch(() => {});
  }, [commitWorkspaceChange, folderPath]);

  useEffect(() => {
    const unsubscribe = desktop.workspace.onPreviewUpdated((payload) => {
      if (!payload?.card || (folderPath && payload.folderPath !== folderPath)) return;
      updateWorkspaceState((current) => ({
        ...current,
        cards: current.cards.map((card) => (card.id === payload.card.id ? { ...card, ...payload.card } : card)),
      }));
    });
    return unsubscribe;
  }, [folderPath, updateWorkspaceState]);

  useEffect(() => {
    const activeCanvasPath = activeCanvasPathRef.current;
    if (!folderPath || !activeCanvasPath) return undefined;
    if (skipCanvasSaveRef.current[activeCanvasPath]) {
      skipCanvasSaveRef.current[activeCanvasPath] = false;
      return undefined;
    }
    if (workspaceDraftBaseRef.current[activeCanvasPath]) {
      return undefined;
    }
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const canvas = workspacesRef.current[activeCanvasPath];
      const workspaceToSave = normalizeWorkspaceHistory(canvas).present;
      if (!workspaceToSave) return;
      void desktop.workspace.saveCanvas(activeCanvasPath, workspaceToSave).catch((saveError) => {
        setError(saveError.message || "Unable to save the current canvas.");
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [folderPath, workspaceHistory.present]);

  useEffect(() => {
    const activePagePath = activePagePathRef.current;
    if (!folderPath || !activePagePath) return undefined;
    if (skipPageSaveRef.current[activePagePath]) {
      skipPageSaveRef.current[activePagePath] = false;
      return undefined;
    }
    const currentDraft = pagesRef.current[activePagePath];
    if (!currentDraft?.dirty) {
      return undefined;
    }
    clearTimeout(pageSaveTimeoutRef.current);
    pageSaveTimeoutRef.current = setTimeout(() => {
      const page = pagesRef.current[activePagePath];
      if (!page?.dirty) return;
      setPagesByPath((current) => {
        const activePage = current[activePagePath];
        if (!activePage) return current;
        return {
          ...current,
          [activePagePath]: {
            ...activePage,
            saveStatus: "saving",
          },
        };
      });
      void desktop.workspace.savePage(activePagePath, page.markdown)
        .then((savedPage) => {
          setPagesByPath((current) => {
            const activePage = current[activePagePath];
            if (!activePage) return current;

            const isStillDirty = activePage.markdown !== savedPage.markdown;
            const nextPage = {
              ...activePage,
              ...savedPage,
              name: isStillDirty ? activePage.name : savedPage.name,
              markdown: isStillDirty ? activePage.markdown : savedPage.markdown,
              dirty: isStillDirty,
              saveStatus: isStillDirty ? "dirty" : "saved",
              lastSavedMarkdown: savedPage.markdown,
            };

            return {
              ...current,
              [activePagePath]: nextPage,
            };
          });
          renameTabForEntity(activePagePath, page.name);
          void refreshHomeData(folderPath).catch(() => {});
        })
        .catch((saveError) => {
          setPagesByPath((current) => {
            const activePage = current[activePagePath];
            if (!activePage) return current;
            return {
              ...current,
              [activePagePath]: {
                ...activePage,
                saveStatus: "error",
              },
            };
          });
          setError(saveError.message || "Unable to save the current page.");
        });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(pageSaveTimeoutRef.current);
  }, [currentPage, folderPath, refreshHomeData, renameTabForEntity]);

  const value = useMemo(() => ({
    booting,
    createCanvasEntry,
    createNewLinkCard,
    createNewRackCard,
    createNewWorkspace,
    createPageEntry,
    currentEditor,
    currentPage,
    canRedo: workspaceHistory.future.length > 0,
    canUndo: workspaceHistory.past.length > 0,
    commitWorkspaceChange,
    discardWorkspaceDraft,
    deleteExistingCard,
    deleteItemEntry,
    error,
    folderLoading,
    folderPath,
    homeData,
    navigateHomeFolder,
    openExistingWorkspace,
    openHomeItem,
    refreshHomeData,
    renameItemEntry,
    reorderExistingCards,
    replaceWorkspaceCards,
    saveHomeUiState,
    setError,
    setViewport,
    setWorkspaceView,
    showHome,
    toggleItemStarred,
    redoWorkspaceChange,
    undoWorkspaceChange,
    updateCurrentPageDraft,
    updateExistingCard,
    updateExistingCards,
    workspace,
  }), [
    booting,
    createCanvasEntry,
    createNewLinkCard,
    createNewRackCard,
    createNewWorkspace,
    createPageEntry,
    currentEditor,
    currentPage,
    workspaceHistory.future.length,
    workspaceHistory.past.length,
    commitWorkspaceChange,
    discardWorkspaceDraft,
    deleteExistingCard,
    deleteItemEntry,
    error,
    folderLoading,
    folderPath,
    homeData,
    navigateHomeFolder,
    openExistingWorkspace,
    openHomeItem,
    refreshHomeData,
    renameItemEntry,
    reorderExistingCards,
    replaceWorkspaceCards,
    saveHomeUiState,
    setError,
    setViewport,
    setWorkspaceView,
    showHome,
    toggleItemStarred,
    redoWorkspaceChange,
    undoWorkspaceChange,
    updateCurrentPageDraft,
    updateExistingCard,
    updateExistingCards,
    workspace,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
