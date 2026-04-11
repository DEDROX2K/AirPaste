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
  const { activeTab, openTab, closeTabsForEntity, showHomeTab } = useTabs();
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
    return workspacesByPath[currentEditor.filePath] ?? createEmptyWorkspace();
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
    setWorkspacesByPath((prev) => ({ ...prev, [doc.filePath]: normalizeWorkspace(doc.workspace) }));
    skipCanvasSaveRef.current[doc.filePath] = true;
    openTab({ type: "canvas", entityId: doc.filePath, title: doc.name, filePath: doc.path });
    await refreshHomeData(folderPath);
    return doc;
  }, [folderPath, openTab, refreshHomeData]);

  const openPageFile = useCallback(async (filePath) => {
    const doc = await desktop.workspace.loadPage(filePath);
    setPagesByPath((prev) => ({ ...prev, [doc.filePath]: doc }));
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
      return next;
    });
    setPagesByPath((prev) => {
      if (!prev[item.filePath]) return prev;
      const next = { ...prev };
      next[renamed.filePath] = { ...next[item.filePath], ...renamed };
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

  const updateCurrentPageMarkdown = useCallback((markdown) => {
    const activePath = activePagePathRef.current;
    if (!activePath) return;
    setPagesByPath((current) => {
      const page = current[activePath];
      if (!page) return current;
      return { ...current, [activePath]: { ...page, markdown } };
    });
  }, []);

  const patchWorkspace = useCallback((updater) => {
    const activePath = activeCanvasPathRef.current;
    if (!activePath) return;
    setWorkspacesByPath((current) => {
      const currentWorkspace = current[activePath] ?? createEmptyWorkspace();
      const nextWorkspace = typeof updater === "function" ? updater(currentWorkspace) : updater;
      return { ...current, [activePath]: normalizeWorkspace(nextWorkspace) };
    });
  }, []);

  const setViewport = useCallback((nextViewport) => patchWorkspace((current) => ({ ...current, viewport: nextViewport })), [patchWorkspace]);
  const setWorkspaceView = useCallback((nextView) => patchWorkspace((current) => ({
    ...current,
    view: typeof nextView === "function" ? nextView(current.view ?? null) : nextView,
  })), [patchWorkspace]);
  const createNewLinkCard = useCallback((url, center = null, options = {}) => {
    const card = createLinkCard(workspace.cards, workspace.viewport, url, center, options);
    patchWorkspace((current) => ({ ...current, cards: [...current.cards, card] }));
    return card;
  }, [patchWorkspace, workspace.cards, workspace.viewport]);
  const createNewRackCard = useCallback((center = null, options = {}) => {
    const card = createRackCard(workspace.cards, workspace.viewport, center, options);
    patchWorkspace((current) => ({ ...current, cards: [...current.cards, card] }));
    return card;
  }, [patchWorkspace, workspace.cards, workspace.viewport]);
  const updateExistingCard = useCallback((cardId, updates) => patchWorkspace((current) => ({ ...current, cards: updateCard(current.cards, cardId, updates) })), [patchWorkspace]);
  const updateExistingCards = useCallback((updatesById) => patchWorkspace((current) => ({ ...current, cards: updateCards(current.cards, updatesById) })), [patchWorkspace]);
  const replaceWorkspaceCards = useCallback((nextCards) => patchWorkspace((current) => ({ ...current, cards: replaceCards(current.cards, nextCards) })), [patchWorkspace]);
  const reorderExistingCards = useCallback((orderedIds) => patchWorkspace((current) => ({ ...current, cards: reorderCards(current.cards, orderedIds) })), [patchWorkspace]);
  const deleteExistingCard = useCallback((cardId) => {
    patchWorkspace((current) => ({ ...current, cards: removeCard(current.cards, cardId) }));
    if (folderPath) void desktop.workspace.cancelLinkPreview(folderPath, cardId).catch(() => {});
  }, [folderPath, patchWorkspace]);

  useEffect(() => {
    const unsubscribe = desktop.workspace.onPreviewUpdated((payload) => {
      if (!payload?.card || (folderPath && payload.folderPath !== folderPath)) return;
      patchWorkspace((current) => ({
        ...current,
        cards: current.cards.map((card) => (card.id === payload.card.id ? { ...card, ...payload.card } : card)),
      }));
    });
    return unsubscribe;
  }, [folderPath, patchWorkspace]);

  useEffect(() => {
    const activeCanvasPath = activeCanvasPathRef.current;
    if (!folderPath || !activeCanvasPath) return undefined;
    if (skipCanvasSaveRef.current[activeCanvasPath]) {
      skipCanvasSaveRef.current[activeCanvasPath] = false;
      return undefined;
    }
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const canvas = workspacesRef.current[activeCanvasPath];
      if (!canvas) return;
      void desktop.workspace.saveCanvas(activeCanvasPath, canvas).catch((saveError) => {
        setError(saveError.message || "Unable to save the current canvas.");
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [folderPath, workspace]);

  useEffect(() => {
    const activePagePath = activePagePathRef.current;
    if (!folderPath || !activePagePath) return undefined;
    if (skipPageSaveRef.current[activePagePath]) {
      skipPageSaveRef.current[activePagePath] = false;
      return undefined;
    }
    clearTimeout(pageSaveTimeoutRef.current);
    pageSaveTimeoutRef.current = setTimeout(() => {
      const page = pagesRef.current[activePagePath];
      if (!page) return;
      void desktop.workspace.savePage(activePagePath, page.markdown).catch((saveError) => {
        setError(saveError.message || "Unable to save the current page.");
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(pageSaveTimeoutRef.current);
  }, [currentPage, folderPath]);

  const value = useMemo(() => ({
    booting,
    createCanvasEntry,
    createNewLinkCard,
    createNewRackCard,
    createNewWorkspace,
    createPageEntry,
    currentEditor,
    currentPage,
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
    updateCurrentPageMarkdown,
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
    setViewport,
    setWorkspaceView,
    showHome,
    toggleItemStarred,
    updateCurrentPageMarkdown,
    updateExistingCard,
    updateExistingCards,
    workspace,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
