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
import { createPageRevision } from "../lib/pageDocument";
import { desktop } from "../lib/desktop";
import { recordSaveSample } from "../lib/perf";

const SAVE_DELAY_MS = 250;
const CANVAS_SAVE_DELAY_MS = 420;
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

function mergeCanvasDirtyFields(currentFields = null, nextFields = null) {
  return {
    viewport: Boolean(currentFields?.viewport || nextFields?.viewport),
    cards: Boolean(currentFields?.cards || nextFields?.cards),
    view: Boolean(currentFields?.view || nextFields?.view),
    name: Boolean(currentFields?.name || nextFields?.name),
  };
}

function getCanvasDirtyFields(previousWorkspace, nextWorkspace) {
  if (!nextWorkspace) {
    return {
      viewport: false,
      cards: false,
      view: false,
      name: false,
    };
  }

  if (!previousWorkspace) {
    return {
      viewport: true,
      cards: true,
      view: true,
      name: true,
    };
  }

  return {
    viewport: previousWorkspace.viewport !== nextWorkspace.viewport,
    cards: previousWorkspace.cards !== nextWorkspace.cards,
    view: previousWorkspace.view !== nextWorkspace.view,
    name: previousWorkspace.name !== nextWorkspace.name,
  };
}

function buildCanvasSavePayload(workspace, dirtyFields = null) {
  const payload = {};

  if (dirtyFields?.viewport) {
    payload.viewport = workspace?.viewport ?? null;
  }

  if (dirtyFields?.cards) {
    payload.cards = Array.isArray(workspace?.cards) ? workspace.cards : [];
  }

  if (dirtyFields?.view) {
    payload.view = workspace?.view ?? null;
  }

  if (dirtyFields?.name && typeof workspace?.name === "string") {
    payload.name = workspace.name;
  }

  return payload;
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

function createDomesState() {
  return {
    activeDomeId: null,
    recentDomes: [],
  };
}

export function AppProvider({ children }) {
  const { activeTab, openTab, closeTabsForEntity, renameTabForEntity, rebindTabEntity, showHomeTab } = useTabs();
  const [booting, setBooting] = useState(true);
  const [folderPath, setFolderPath] = useState(null);
  const [homeData, setHomeData] = useState(createHomeState());
  const [domesState, setDomesState] = useState(createDomesState());
  const [folderLoading, setFolderLoading] = useState(false);
  const [error, setError] = useState("");
  const [workspacesByPath, setWorkspacesByPath] = useState({});
  const [pagesByPath, setPagesByPath] = useState({});
  const [canvasInteractionVersion, setCanvasInteractionVersion] = useState(0);

  const saveTimeoutRef = useRef(null);
  const pageSaveTimeoutRef = useRef(null);
  const skipCanvasSaveRef = useRef({});
  const skipPageSaveRef = useRef({});
  const pendingCanvasSaveRef = useRef({});
  const pendingCanvasDirtyFieldsRef = useRef({});
  const canvasInteractionStateRef = useRef({});
  const lastSavedCanvasWorkspaceRef = useRef({});
  const lastObservedCanvasWorkspaceRef = useRef({});
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

  const activeDome = useMemo(() => (
    domesState.recentDomes.find((entry) => entry.id === domesState.activeDomeId) ?? null
  ), [domesState.activeDomeId, domesState.recentDomes]);

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
    pendingCanvasSaveRef.current = {};
    pendingCanvasDirtyFieldsRef.current = {};
    canvasInteractionStateRef.current = {};
    lastSavedCanvasWorkspaceRef.current = {};
    lastObservedCanvasWorkspaceRef.current = {};
    workspaceDraftBaseRef.current = {};
    showHomeTab();
  }, [showHomeTab]);

  const applyDomesState = useCallback((payload) => {
    setDomesState({
      activeDomeId: typeof payload?.activeDomeId === "string" ? payload.activeDomeId : null,
      recentDomes: Array.isArray(payload?.recentDomes) ? payload.recentDomes : [],
    });
  }, []);

  const refreshDomes = useCallback(async () => {
    const payload = await desktop.dome.listDomes();
    applyDomesState(payload);
    return payload;
  }, [applyDomesState]);

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
      pendingCanvasSaveRef.current = {};
      pendingCanvasDirtyFieldsRef.current = {};
      canvasInteractionStateRef.current = {};
      lastSavedCanvasWorkspaceRef.current = {};
      lastObservedCanvasWorkspaceRef.current = {};
      workspaceDraftBaseRef.current = {};
      applyHomeData(payload);
      showHomeTab();
      void refreshDomes().catch(() => {});
      return nextFolderPath;
    } catch (loadError) {
      setError(loadError.message || "Unable to open that folder.");
      clearWorkspaceState();
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [applyHomeData, clearWorkspaceState, refreshDomes, showHomeTab]);

  const openExistingWorkspace = useCallback(async () => {
    try {
      const dome = await desktop.dome.openDome();
      if (dome?.path) {
        await refreshDomes().catch(() => {});
        return loadFolder(dome.path);
      }
    } catch {
      // Fall through to legacy folder picker flow.
    }
    const selectedPath = await desktop.workspace.openFolder();
    if (!selectedPath) return null;
    return loadFolder(selectedPath);
  }, [loadFolder, refreshDomes]);

  const createNewDome = useCallback(async (name = "New Dome") => {
    const selectedParentPath = await desktop.workspace.openFolder();
    if (!selectedParentPath) return null;
    setFolderLoading(true);
    setError("");
    try {
      const dome = await desktop.dome.createDome(selectedParentPath, name);
      if (!dome?.path) return null;
      await refreshDomes().catch(() => {});
      return await loadFolder(dome.path);
    } catch (createError) {
      setError(createError.message || "Unable to create Dome in this folder.");
      clearWorkspaceState();
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [clearWorkspaceState, loadFolder, refreshDomes]);

  const switchDome = useCallback(async (domeId) => {
    if (!domeId) return null;
    setFolderLoading(true);
    setError("");
    try {
      const dome = await desktop.dome.switchDome(domeId);
      await refreshDomes().catch(() => {});
      if (!dome?.path) return null;
      return await loadFolder(dome.path);
    } catch (switchError) {
      setError(switchError.message || "Unable to switch Dome.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [loadFolder, refreshDomes]);

  const removeDome = useCallback(async (domeId) => {
    const payload = await desktop.dome.removeDome(domeId);
    applyDomesState(payload);
    if (payload?.activeDomeId) {
      const active = payload.recentDomes?.find((entry) => entry.id === payload.activeDomeId);
      if (active?.path && active.path !== folderPath) {
        await loadFolder(active.path);
      }
    } else if (!payload?.activeDomeId) {
      clearWorkspaceState();
    }
    return payload;
  }, [applyDomesState, clearWorkspaceState, folderPath, loadFolder]);

  const revealDome = useCallback(async (domePath) => {
    return desktop.dome.revealDome(domePath);
  }, []);

  const createNewWorkspace = useCallback(async () => {
    return createNewDome("New Dome");
  }, [createNewDome]);

  useEffect(() => {
    let cancelled = false;
    const bootFallbackTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setBooting(false);
      }
    }, 1800);

    async function boot() {
      try {
        const active = await desktop.dome.getActiveDome();
        const domes = await desktop.dome.listDomes();
        if (!cancelled) {
          applyDomesState(domes);
        }
        if (!cancelled && active?.path && active.valid && active.exists) {
          await loadFolder(active.path);
        } else if (!cancelled) {
          const lastFolder = await desktop.workspace.getLastFolder();
          if (lastFolder) {
            await loadFolder(lastFolder);
          }
        }
      } catch (bootError) {
        if (!cancelled) setError(bootError.message || "Unable to restore previous Dome.");
      } finally {
        window.clearTimeout(bootFallbackTimeout);
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
      window.clearTimeout(bootFallbackTimeout);
    };
  }, [applyDomesState, loadFolder]);

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
    const lastSavedRevision = createPageRevision({
      title: doc.title,
      content: doc.content,
    });
    setPagesByPath((prev) => ({
      ...prev,
      [doc.filePath]: {
        ...doc,
        dirty: false,
        saveStatus: "saved",
        lastSavedRevision,
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

  useEffect(() => {
    if (!folderPath || !activeTab?.entityId) {
      return undefined;
    }

    if (activeTab.type === "canvas" && workspacesByPath[activeTab.entityId]) {
      return undefined;
    }

    if (activeTab.type === "page" && pagesByPath[activeTab.entityId]) {
      return undefined;
    }

    let cancelled = false;

    async function hydrateActiveEditor() {
      try {
        if (activeTab.type === "canvas") {
          const doc = await desktop.workspace.loadCanvas(activeTab.entityId);
          if (cancelled) return;
          setWorkspacesByPath((prev) => {
            if (prev[doc.filePath]) return prev;
            return { ...prev, [doc.filePath]: createWorkspaceHistory(doc.workspace) };
          });
          skipCanvasSaveRef.current[doc.filePath] = true;
          return;
        }

        if (activeTab.type === "page") {
          const doc = await desktop.workspace.loadPage(activeTab.entityId);
          if (cancelled) return;
          const lastSavedRevision = createPageRevision({
            title: doc.title,
            content: doc.content,
          });
          setPagesByPath((prev) => {
            if (prev[doc.filePath]) return prev;
            return {
              ...prev,
              [doc.filePath]: {
                ...doc,
                dirty: false,
                saveStatus: "saved",
                lastSavedRevision,
              },
            };
          });
          skipPageSaveRef.current[doc.filePath] = true;
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to open the selected file.");
        }
      }
    }

    void hydrateActiveEditor();

    return () => {
      cancelled = true;
    };
  }, [activeTab, folderPath, pagesByPath, workspacesByPath]);

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
        lastSavedRevision: createPageRevision({
          title: renamed.title,
          content: renamed.content,
        }),
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

  const updateCurrentPageDraft = useCallback(({ content, title }) => {
    const activePath = activePagePathRef.current;
    if (!activePath) return;
    setPagesByPath((current) => {
      const page = current[activePath];
      if (!page) return current;
      const nextTitle = typeof title === "string" && title.trim() ? title.trim() : page.name;
      const nextContent = content && typeof content === "object" ? content : page.content;
      const nextRevision = createPageRevision({
        title: nextTitle,
        content: nextContent,
      });
      return {
        ...current,
        [activePath]: {
          ...page,
          title: nextTitle,
          name: nextTitle,
          content: nextContent,
          dirty: nextRevision !== page.lastSavedRevision,
          saveStatus: nextRevision === page.lastSavedRevision ? "saved" : "dirty",
        },
      };
    });
    if (typeof title === "string" && title.trim()) {
      renameTabForEntity(activePath, title.trim());
    }
  }, [renameTabForEntity]);

  const setCanvasInteractionState = useCallback((isInteracting, options = {}) => {
    const targetPath = options?.targetPath ?? activeCanvasPathRef.current;

    if (!targetPath) {
      return;
    }

    const normalizedValue = isInteracting === true;
    const previousValue = canvasInteractionStateRef.current[targetPath] === true;

    if (previousValue === normalizedValue) {
      return;
    }

    canvasInteractionStateRef.current[targetPath] = normalizedValue;

    if (normalizedValue) {
      clearTimeout(saveTimeoutRef.current);
    }

    setCanvasInteractionVersion((currentVersion) => currentVersion + 1);
  }, []);

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
    const canvasEntry = workspacesRef.current[activeCanvasPath];
    const workspaceToEvaluate = normalizeWorkspaceHistory(canvasEntry).present;
    const previousWorkspace = lastObservedCanvasWorkspaceRef.current[activeCanvasPath] ?? null;
    const hasWorkspaceChanged = previousWorkspace !== workspaceToEvaluate;

    if (hasWorkspaceChanged) {
      pendingCanvasDirtyFieldsRef.current[activeCanvasPath] = mergeCanvasDirtyFields(
        pendingCanvasDirtyFieldsRef.current[activeCanvasPath],
        getCanvasDirtyFields(previousWorkspace, workspaceToEvaluate),
      );
      lastObservedCanvasWorkspaceRef.current[activeCanvasPath] = workspaceToEvaluate;
      pendingCanvasSaveRef.current[activeCanvasPath] = true;
    }

    if (skipCanvasSaveRef.current[activeCanvasPath]) {
      skipCanvasSaveRef.current[activeCanvasPath] = false;
      pendingCanvasSaveRef.current[activeCanvasPath] = false;
      pendingCanvasDirtyFieldsRef.current[activeCanvasPath] = {
        viewport: false,
        cards: false,
        view: false,
        name: false,
      };
      lastSavedCanvasWorkspaceRef.current[activeCanvasPath] = workspaceToEvaluate;

      return undefined;
    }

    if (workspaceDraftBaseRef.current[activeCanvasPath]) {
      return undefined;
    }

    if (!pendingCanvasSaveRef.current[activeCanvasPath]) {
      return undefined;
    }

    if (canvasInteractionStateRef.current[activeCanvasPath]) {
      return undefined;
    }

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (canvasInteractionStateRef.current[activeCanvasPath]) {
        pendingCanvasSaveRef.current[activeCanvasPath] = true;
        return;
      }

      const canvas = workspacesRef.current[activeCanvasPath];
      const workspaceToSave = normalizeWorkspaceHistory(canvas).present;
      if (!workspaceToSave) return;
      const dirtyFields = pendingCanvasDirtyFieldsRef.current[activeCanvasPath];
      const savePayload = buildCanvasSavePayload(workspaceToSave, dirtyFields);
      const changedKeys = Object.keys(savePayload);

      if (!changedKeys.length) {
        pendingCanvasSaveRef.current[activeCanvasPath] = false;
        return;
      }

      const totalStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const serializeStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      let serializedPayload = "";

      try {
        serializedPayload = JSON.stringify(savePayload);
      } catch (serializeError) {
        recordSaveSample({
          path: activeCanvasPath,
          serializeMs: 0,
          saveMs: 0,
          totalMs: 0,
          payloadBytes: 0,
          status: "error",
        });
        setError(serializeError?.message || "Unable to serialize the current canvas.");
        return;
      }

      const serializeEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      const serializeMs = serializeEnd - serializeStart;

      if (canvasInteractionStateRef.current[activeCanvasPath]) {
        pendingCanvasSaveRef.current[activeCanvasPath] = true;
        return;
      }

      const saveStart = typeof performance !== "undefined" ? performance.now() : Date.now();

      void desktop.workspace.saveCanvas(activeCanvasPath, savePayload, {
        partial: true,
        returnWorkspace: false,
        changedKeys,
      })
        .then(() => {
          const saveEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
          const saveMs = saveEnd - saveStart;
          const totalMs = saveEnd - totalStart;
          const latestCanvas = workspacesRef.current[activeCanvasPath];
          const latestWorkspace = normalizeWorkspaceHistory(latestCanvas).present;
          const hasNewerChanges = latestWorkspace !== workspaceToSave;

          if (hasNewerChanges) {
            pendingCanvasSaveRef.current[activeCanvasPath] = true;
            pendingCanvasDirtyFieldsRef.current[activeCanvasPath] = mergeCanvasDirtyFields(
              pendingCanvasDirtyFieldsRef.current[activeCanvasPath],
              getCanvasDirtyFields(workspaceToSave, latestWorkspace),
            );
          } else {
            pendingCanvasSaveRef.current[activeCanvasPath] = false;
            pendingCanvasDirtyFieldsRef.current[activeCanvasPath] = {
              viewport: false,
              cards: false,
              view: false,
              name: false,
            };
            lastSavedCanvasWorkspaceRef.current[activeCanvasPath] = workspaceToSave;
          }

          recordSaveSample({
            path: activeCanvasPath,
            serializeMs,
            saveMs,
            totalMs,
            payloadBytes: serializedPayload.length,
            status: "success",
          });
        })
        .catch((saveError) => {
          const saveEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
          const saveMs = saveEnd - saveStart;
          const totalMs = saveEnd - totalStart;

          pendingCanvasSaveRef.current[activeCanvasPath] = true;
          recordSaveSample({
            path: activeCanvasPath,
            serializeMs,
            saveMs,
            totalMs,
            payloadBytes: serializedPayload.length,
            status: "error",
          });
          setError(saveError.message || "Unable to save the current canvas.");
        });
    }, CANVAS_SAVE_DELAY_MS);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [canvasInteractionVersion, folderPath, workspaceHistory.present]);

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
      void desktop.workspace.savePage(activePagePath, {
        title: page.title,
        content: page.content,
      })
        .then((savedPage) => {
          setPagesByPath((current) => {
            const activePage = current[activePagePath];
            if (!activePage) return current;

            const savedRevision = createPageRevision({
              title: savedPage.title,
              content: savedPage.content,
            });
            const currentRevision = createPageRevision({
              title: activePage.title,
              content: activePage.content,
            });
            const isStillDirty = currentRevision !== savedRevision;
            const nextPage = {
              ...activePage,
              ...savedPage,
              title: isStillDirty ? activePage.title : savedPage.title,
              name: isStillDirty ? activePage.name : savedPage.name,
              content: isStillDirty ? activePage.content : savedPage.content,
              dirty: isStillDirty,
              saveStatus: isStillDirty ? "dirty" : "saved",
              lastSavedRevision: savedRevision,
            };

            const nextState = { ...current };
            delete nextState[activePagePath];
            nextState[savedPage.filePath] = nextPage;
            return nextState;
          });
          if (savedPage.filePath !== activePagePath) {
            rebindTabEntity(activePagePath, savedPage.filePath, savedPage.name);
          } else {
            renameTabForEntity(activePagePath, savedPage.name);
          }
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
  }, [currentPage, folderPath, rebindTabEntity, refreshHomeData, renameTabForEntity]);

  const value = useMemo(() => ({
    activeDome,
    booting,
    createNewDome,
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
    domes: domesState.recentDomes,
    error,
    folderLoading,
    folderPath,
    homeData,
    navigateHomeFolder,
    openExistingWorkspace,
    openHomeItem,
    refreshDomes,
    refreshHomeData,
    removeDome,
    renameItemEntry,
    reorderExistingCards,
    replaceWorkspaceCards,
    saveHomeUiState,
    revealDome,
    setError,
    setCanvasInteractionState,
    setViewport,
    setWorkspaceView,
    showHome,
    switchDome,
    toggleItemStarred,
    redoWorkspaceChange,
    undoWorkspaceChange,
    updateCurrentPageDraft,
    updateExistingCard,
    updateExistingCards,
    workspace,
  }), [
    activeDome,
    booting,
    createNewDome,
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
    domesState.recentDomes,
    error,
    folderLoading,
    folderPath,
    homeData,
    navigateHomeFolder,
    openExistingWorkspace,
    openHomeItem,
    refreshDomes,
    refreshHomeData,
    removeDome,
    renameItemEntry,
    reorderExistingCards,
    replaceWorkspaceCards,
    saveHomeUiState,
    revealDome,
    setError,
    setCanvasInteractionState,
    setViewport,
    setWorkspaceView,
    showHome,
    switchDome,
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
