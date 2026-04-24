import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppContext } from "./AppContext";
import { useTabs } from "./useTabs";
import {
  createEmptyWorkspace,
  createLinkCard,
  createRackCard,
  isBookmarkLinkCard,
  normalizeWorkspace,
  removeCard,
  reorderCards,
  replaceCards,
  updateCard,
  updateCards,
} from "../lib/workspace";
import { desktop } from "../lib/desktop";
import { recordSaveSample } from "../lib/perf";

const CANVAS_SAVE_DELAY_MS = 420;
const DEFAULT_WORKSPACE_HISTORY_LIMIT = 8;
const PREVIEW_UNAVAILABLE_MESSAGE = "Link previews are temporarily unavailable.";
const WORKSPACE_HISTORY_LIMIT_STORAGE_KEY = "airpaste.workspaceHistoryLimit";
const MIN_WORKSPACE_HISTORY_LIMIT = 1;
const MAX_WORKSPACE_HISTORY_LIMIT = 20;

function getWorkspaceHistoryLimit() {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_WORKSPACE_HISTORY_LIMIT;
  }

  const rawValue = window.localStorage.getItem(WORKSPACE_HISTORY_LIMIT_STORAGE_KEY);
  const parsedValue = Number.parseInt(rawValue ?? "", 10);

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_WORKSPACE_HISTORY_LIMIT;
  }

  return Math.max(MIN_WORKSPACE_HISTORY_LIMIT, Math.min(MAX_WORKSPACE_HISTORY_LIMIT, parsedValue));
}

function normalizeFsPath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function isSameOrDescendantPath(targetPath, basePath) {
  const normalizedTarget = normalizeFsPath(targetPath);
  const normalizedBase = normalizeFsPath(basePath);
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}/`);
}

function areSamePath(leftPath, rightPath) {
  const left = normalizeFsPath(leftPath).toLowerCase();
  const right = normalizeFsPath(rightPath).toLowerCase();
  return left === right;
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

function areNumberArraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

function areDrawingObjectsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  return a.id === b.id
    && a.type === b.type
    && areNumberArraysEqual(a.points, b.points)
    && areObjectsEqual(a.style, b.style)
    && areObjectsEqual(a.meta, b.meta);
}

function areDrawingsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.version !== b.version) return false;

  const aObjects = Array.isArray(a.objects) ? a.objects : [];
  const bObjects = Array.isArray(b.objects) ? b.objects : [];

  if (aObjects.length !== bObjects.length) {
    return false;
  }

  for (let index = 0; index < aObjects.length; index += 1) {
    if (!areDrawingObjectsEqual(aObjects[index], bObjects[index])) {
      return false;
    }
  }

  return true;
}

function areWorkspacesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  if (
    a.version !== b.version
    || !areObjectsEqual(a.viewport, b.viewport)
    || !areObjectsEqual(a.view, b.view)
    || a.cards.length !== b.cards.length
    || !areDrawingsEqual(a.drawings, b.drawings)
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
    drawings: Boolean(currentFields?.drawings || nextFields?.drawings),
    view: Boolean(currentFields?.view || nextFields?.view),
    name: Boolean(currentFields?.name || nextFields?.name),
  };
}

function getCanvasDirtyFields(previousWorkspace, nextWorkspace) {
  if (!nextWorkspace) {
    return {
      viewport: false,
      cards: false,
      drawings: false,
      view: false,
      name: false,
    };
  }

  if (!previousWorkspace) {
    return {
      viewport: true,
      cards: true,
      drawings: true,
      view: true,
      name: true,
    };
  }

  return {
    viewport: previousWorkspace.viewport !== nextWorkspace.viewport,
    cards: previousWorkspace.cards !== nextWorkspace.cards,
    drawings: previousWorkspace.drawings !== nextWorkspace.drawings,
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

  if (dirtyFields?.drawings) {
    payload.drawings = workspace?.drawings ?? null;
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

function sanitizeWorkspaceForPreviewAvailability(workspace, previewEnabled) {
  const safeWorkspace = normalizeWorkspace(workspace);

  if (previewEnabled !== false) {
    return safeWorkspace;
  }

  let changed = false;
  const nextCards = safeWorkspace.cards.map((card) => {
    if (!isBookmarkLinkCard(card) || card.status !== "loading") {
      return card;
    }

    changed = true;
    return {
      ...card,
      status: "error",
      previewStatus: "disabled",
      previewError: card.previewError?.trim() || PREVIEW_UNAVAILABLE_MESSAGE,
    };
  });

  if (!changed) {
    return safeWorkspace;
  }

  return {
    ...safeWorkspace,
    cards: nextCards,
  };
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
  const { activeTab, openTab, closeTabsForEntity, rebindTabEntity, showHomeTab } = useTabs();
  const [booting, setBooting] = useState(true);
  const [folderPath, setFolderPath] = useState(null);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [homeData, setHomeData] = useState(createHomeState());
  const [domesState, setDomesState] = useState(createDomesState());
  const [folderLoading, setFolderLoading] = useState(false);
  const [error, setError] = useState("");
  const [workspacesByPath, setWorkspacesByPath] = useState({});
  const [canvasInteractionVersion, setCanvasInteractionVersion] = useState(0);

  const saveTimeoutRef = useRef(null);
  const skipCanvasSaveRef = useRef({});
  const pendingCanvasSaveRef = useRef({});
  const pendingCanvasDirtyFieldsRef = useRef({});
  const canvasInteractionStateRef = useRef({});
  const lastSavedCanvasWorkspaceRef = useRef({});
  const lastObservedCanvasWorkspaceRef = useRef({});
  const workspaceDraftBaseRef = useRef({});
  const workspacesRef = useRef(workspacesByPath);
  const activeCanvasPathRef = useRef(null);

  useEffect(() => {
    workspacesRef.current = workspacesByPath;
    activeCanvasPathRef.current = activeTab?.type === "canvas" ? activeTab.entityId : null;
  }, [activeTab, workspacesByPath]);

  const currentEditor = useMemo(() => {
    if (!activeTab || activeTab.type !== "canvas") return { kind: "home" };
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
    skipCanvasSaveRef.current = {};
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
      skipCanvasSaveRef.current = {};
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
        const previewCapabilities = await desktop.workspace.getPreviewCapabilities().catch(() => null);
        if (!cancelled && typeof previewCapabilities?.enabled === "boolean") {
          setPreviewEnabled(previewCapabilities.enabled);
        }

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
    const sanitizedWorkspace = sanitizeWorkspaceForPreviewAvailability(doc.workspace, previewEnabled);
    setWorkspacesByPath((prev) => ({ ...prev, [doc.filePath]: createWorkspaceHistory(sanitizedWorkspace) }));
    delete workspaceDraftBaseRef.current[doc.filePath];
    skipCanvasSaveRef.current[doc.filePath] = true;
    openTab({ type: "canvas", entityId: doc.filePath, title: doc.name, filePath: doc.path });
    await refreshHomeData(folderPath);
    return doc;
  }, [folderPath, openTab, previewEnabled, refreshHomeData]);

  const openHomeItem = useCallback(async (item) => {
    if (!item?.filePath) return null;
    if (item.type === "folder") {
      const payload = await desktop.workspace.getHomeData(folderPath, item.path);
      applyHomeData(payload);
      return item;
    }
    if (item.type === "canvas") return openCanvasFile(item.filePath);
    await desktop.workspace.openFile(item.filePath);
    await desktop.workspace.recordRecentItem(folderPath, item.filePath).catch(() => {});
    await refreshHomeData(folderPath);
    return item;
  }, [applyHomeData, folderPath, openCanvasFile, refreshHomeData]);

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

    let cancelled = false;

    async function hydrateActiveEditor() {
      try {
        if (activeTab.type === "canvas") {
          const doc = await desktop.workspace.loadCanvas(activeTab.entityId);
          if (cancelled) return;
          setWorkspacesByPath((prev) => {
            if (prev[doc.filePath]) return prev;
            const sanitizedWorkspace = sanitizeWorkspaceForPreviewAvailability(doc.workspace, previewEnabled);
            return { ...prev, [doc.filePath]: createWorkspaceHistory(sanitizedWorkspace) };
          });
          skipCanvasSaveRef.current[doc.filePath] = true;
          return;
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
  }, [activeTab, folderPath, previewEnabled, workspacesByPath]);

  useEffect(() => {
    if (previewEnabled !== false) {
      return;
    }

    setWorkspacesByPath((current) => {
      let changed = false;
      const next = { ...current };

      for (const [filePath, historyEntry] of Object.entries(current)) {
        const history = normalizeWorkspaceHistory(historyEntry);
        const sanitizedPresent = sanitizeWorkspaceForPreviewAvailability(history.present, false);
        if (!areWorkspacesEqual(history.present, sanitizedPresent)) {
          changed = true;
          next[filePath] = {
            ...history,
            present: sanitizedPresent,
          };
        }
      }

      return changed ? next : current;
    });
  }, [previewEnabled]);

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

  const createFolderEntry = useCallback(async (name, targetFolderPath = homeData.currentFolderPath) => {
    if (!folderPath) return null;
    const folder = await desktop.workspace.createFolder(folderPath, name, targetFolderPath);
    await refreshHomeData(folderPath, targetFolderPath);
    return folder;
  }, [folderPath, homeData.currentFolderPath, refreshHomeData]);

  const importFilesIntoFolder = useCallback(async (targetFolderPath = homeData.currentFolderPath) => {
    if (!folderPath) return [];
    const sourcePaths = await desktop.workspace.openFiles();
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) return [];
    const imported = await desktop.workspace.importFiles(folderPath, sourcePaths, targetFolderPath);
    await refreshHomeData(folderPath, targetFolderPath);
    return imported;
  }, [folderPath, homeData.currentFolderPath, refreshHomeData]);

  const renameItemEntry = useCallback(async (item, name) => {
    if (!folderPath || !item?.filePath) return null;
    const renamed = item.type === "folder"
      ? await desktop.workspace.renameEntry(folderPath, item.filePath, name)
      : await desktop.workspace.renameFile(folderPath, item.filePath, name);

    if (item.type === "folder") {
      setWorkspacesByPath((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(prev)) {
          if (!isSameOrDescendantPath(key, item.filePath)) continue;
          const replacementKey = `${renamed.filePath}${normalizeFsPath(key).slice(normalizeFsPath(item.filePath).length)}`;
          next[replacementKey] = next[key];
          delete next[key];
          if (workspaceDraftBaseRef.current[key]) {
            workspaceDraftBaseRef.current[replacementKey] = workspaceDraftBaseRef.current[key];
            delete workspaceDraftBaseRef.current[key];
          }
        }
        return next;
      });
      await refreshHomeData(folderPath, renamed.path);
      return renamed;
    }

    rebindTabEntity(item.filePath, renamed.filePath, renamed.name);
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
    await refreshHomeData(folderPath);
    return renamed;
  }, [folderPath, rebindTabEntity, refreshHomeData]);

  const deleteItemEntry = useCallback(async (item) => {
    if (!folderPath || !item?.filePath) return false;
    if (item.type === "folder") {
      await desktop.workspace.deleteEntry(folderPath, item.filePath);
      const workspaceKeys = Object.keys(workspacesRef.current).filter((key) => isSameOrDescendantPath(key, item.filePath));
      workspaceKeys.forEach((key) => closeTabsForEntity(key));
      workspaceKeys.forEach((key) => { delete workspaceDraftBaseRef.current[key]; });
      setWorkspacesByPath((prev) => {
        const next = { ...prev };
        workspaceKeys.forEach((key) => { delete next[key]; });
        return next;
      });
      await refreshHomeData(folderPath);
      return true;
    }

    await desktop.workspace.deleteFile(folderPath, item.filePath);
    closeTabsForEntity(item.filePath);
    delete workspaceDraftBaseRef.current[item.filePath];
    setWorkspacesByPath((prev) => {
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
      const nextWorkspace = options.skipNormalize
        ? (
          candidateWorkspace && typeof candidateWorkspace === "object"
            ? candidateWorkspace
            : currentWorkspace
        )
        : normalizeWorkspace(candidateWorkspace);
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

  const setViewport = useCallback((nextViewport) => updateWorkspaceState((current) => {
    const currentViewport = current?.viewport ?? { x: 0, y: 0, zoom: 1 };
    const normalizedViewport = {
      x: Number.isFinite(nextViewport?.x) ? nextViewport.x : currentViewport.x,
      y: Number.isFinite(nextViewport?.y) ? nextViewport.y : currentViewport.y,
      zoom: Number.isFinite(nextViewport?.zoom) ? nextViewport.zoom : currentViewport.zoom,
    };

    if (
      normalizedViewport.x === currentViewport.x
      && normalizedViewport.y === currentViewport.y
      && normalizedViewport.zoom === currentViewport.zoom
    ) {
      return current;
    }

    return {
      ...current,
      viewport: normalizedViewport,
    };
  }, { skipNormalize: true }), [updateWorkspaceState]);
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
      if (!payload?.card) {
        return;
      }

      if (
        folderPath
        && typeof payload.folderPath === "string"
        && payload.folderPath.trim().length > 0
        && !areSamePath(payload.folderPath, folderPath)
      ) {
        return;
      }
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
        drawings: false,
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
              drawings: false,
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

  const value = useMemo(() => ({
    activeDome,
    booting,
    createNewDome,
    createCanvasEntry,
    createFolderEntry,
    createNewLinkCard,
    createNewRackCard,
    createNewWorkspace,
    currentEditor,
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
    importFilesIntoFolder,
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
    updateExistingCard,
    updateExistingCards,
    workspace,
  }), [
    activeDome,
    booting,
    createNewDome,
    createCanvasEntry,
    createFolderEntry,
    createNewLinkCard,
    createNewRackCard,
    createNewWorkspace,
    currentEditor,
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
    importFilesIntoFolder,
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
    updateExistingCard,
    updateExistingCards,
    workspace,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
