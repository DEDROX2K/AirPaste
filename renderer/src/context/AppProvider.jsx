import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppContext } from "./AppContext";
import {
  createEmptyWorkspace,
  createLinkCard,
  createNoteFolderCard,
  createRackCard,
  createTextCard,
  mergeCardIntoNoteFolder,
  normalizeWorkspace,
  replaceCards,
  removeCard,
  reorderCards,
  updateCard,
  updateCards,
} from "../lib/workspace";
import { desktop } from "../lib/desktop";

const SAVE_DELAY_MS = 250;

function createHomeState() {
  return {
    workspace: null,
    projects: [],
    recentItems: [],
    starredItems: [],
    uiState: null,
  };
}

function createEditorState(nextEditor = {}) {
  return {
    kind: "home",
    itemId: null,
    itemType: null,
    name: "",
    projectId: null,
    spaceId: null,
    ...nextEditor,
  };
}

function canvasDocumentToWorkspace(canvasDocument) {
  return normalizeWorkspace({
    version: canvasDocument?.version,
    viewport: canvasDocument?.viewport,
    cards: canvasDocument?.tiles,
  });
}

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [folderPath, setFolderPath] = useState(null);
  const [workspace, setWorkspace] = useState(createEmptyWorkspace());
  const [homeData, setHomeData] = useState(createHomeState());
  const [currentEditor, setCurrentEditor] = useState(createEditorState());
  const [currentPage, setCurrentPage] = useState(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const [error, setError] = useState("");
  const workspaceRef = useRef(workspace);
  const currentPageRef = useRef(currentPage);
  const skipSaveRef = useRef(true);
  const skipPageSaveRef = useRef(true);
  const saveTimeoutRef = useRef(null);
  const pageSaveTimeoutRef = useRef(null);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const resetWorkspaceState = useCallback(() => {
    skipSaveRef.current = true;
    skipPageSaveRef.current = true;
    setFolderPath(null);
    setWorkspace(createEmptyWorkspace());
    setHomeData(createHomeState());
    setCurrentPage(null);
    setCurrentEditor(createEditorState());
  }, []);

  const applyHomeData = useCallback((nextHomeData) => {
    setHomeData({
      workspace: nextHomeData?.workspace ?? null,
      projects: Array.isArray(nextHomeData?.projects) ? nextHomeData.projects : [],
      recentItems: Array.isArray(nextHomeData?.recentItems) ? nextHomeData.recentItems : [],
      starredItems: Array.isArray(nextHomeData?.starredItems) ? nextHomeData.starredItems : [],
      uiState: nextHomeData?.uiState ?? null,
    });
  }, []);

  const applyWorkspacePayload = useCallback((payload) => {
    skipSaveRef.current = true;
    skipPageSaveRef.current = true;
    setFolderPath(payload.folderPath);
    setCurrentPage(null);
    setWorkspace(normalizeWorkspace(payload.workspace));
  }, []);

  const openCanvasDocument = useCallback((canvasDocument) => {
    skipSaveRef.current = true;
    setWorkspace(canvasDocumentToWorkspace(canvasDocument));
    setCurrentEditor(createEditorState({
      kind: "canvas",
      itemId: canvasDocument.id,
      itemType: "canvas",
      name: canvasDocument.name,
      projectId: canvasDocument.projectId,
      spaceId: canvasDocument.spaceId,
    }));
  }, []);

  const openPageDocument = useCallback((pageDocument) => {
    skipPageSaveRef.current = true;
    setCurrentPage(pageDocument);
    setCurrentEditor(createEditorState({
      kind: "page",
      itemId: pageDocument.id,
      itemType: "page",
      name: pageDocument.name,
      projectId: pageDocument.projectId,
      spaceId: pageDocument.spaceId,
    }));
  }, []);

  const refreshHomeData = useCallback(async (targetFolderPath = folderPath) => {
    if (!targetFolderPath) {
      return null;
    }

    const payload = await desktop.workspace.getHomeData(targetFolderPath);
    applyHomeData(payload);
    return payload;
  }, [applyHomeData, folderPath]);

  const loadFolder = useCallback(async (nextFolderPath) => {
    if (!nextFolderPath) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const [workspacePayload, nextHomeData] = await Promise.all([
        desktop.workspace.loadWorkspace(nextFolderPath),
        desktop.workspace.getHomeData(nextFolderPath),
      ]);

      applyWorkspacePayload(workspacePayload);
      applyHomeData(nextHomeData);
      setCurrentEditor(createEditorState({ kind: "home" }));
      return {
        ...workspacePayload,
        homeData: nextHomeData,
      };
    } catch (loadError) {
      setError(loadError.message || "Unable to open that folder.");
      resetWorkspaceState();
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [applyHomeData, applyWorkspacePayload, resetWorkspaceState]);

  const openExistingWorkspace = useCallback(async () => {
    try {
      const selectedPath = await desktop.workspace.openFolder();

      if (!selectedPath) {
        return null;
      }

      const payload = await loadFolder(selectedPath);
      return payload?.folderPath ?? null;
    } catch (openError) {
      setError(openError.message || "Unable to select a folder.");
      return null;
    }
  }, [loadFolder]);

  const createNewWorkspace = useCallback(async () => {
    try {
      const selectedPath = await desktop.workspace.openFolder();

      if (!selectedPath) {
        return null;
      }

      setFolderLoading(true);
      setError("");

      const payload = await desktop.workspace.createWorkspace(selectedPath);
      const nextHomeData = await desktop.workspace.getHomeData(selectedPath);

      applyWorkspacePayload(payload);
      applyHomeData(nextHomeData);
      setCurrentEditor(createEditorState({ kind: "home" }));
      return payload.folderPath;
    } catch (createError) {
      setError(createError.message || "Unable to create a workspace in that folder.");
      resetWorkspaceState();
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [applyHomeData, applyWorkspacePayload, resetWorkspaceState]);

  const patchWorkspace = useCallback((updater) => {
    setWorkspace((currentWorkspace) => {
      const nextWorkspace = typeof updater === "function"
        ? updater(currentWorkspace)
        : updater;

      return normalizeWorkspace(nextWorkspace);
    });
  }, []);

  const setViewport = useCallback((nextViewport) => {
    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      viewport: nextViewport,
    }));
  }, [patchWorkspace]);

  const createNewTextCard = useCallback((text = "", preferredCenter = null, options = {}) => {
    const card = createTextCard(
      workspaceRef.current.cards,
      workspaceRef.current.viewport,
      text,
      preferredCenter,
      options,
    );

    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: [...currentWorkspace.cards, card],
    }));

    return card;
  }, [patchWorkspace]);

  const createNewNoteFolderCard = useCallback((preferredCenter = null, options = {}) => {
    const card = createNoteFolderCard(
      workspaceRef.current.cards,
      workspaceRef.current.viewport,
      preferredCenter,
      options,
    );

    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: [...currentWorkspace.cards, card],
    }));

    return card;
  }, [patchWorkspace]);

  const createNewLinkCard = useCallback((url, preferredCenter = null) => {
    const card = createLinkCard(
      workspaceRef.current.cards,
      workspaceRef.current.viewport,
      url,
      preferredCenter,
    );

    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: [...currentWorkspace.cards, card],
    }));

    return card;
  }, [patchWorkspace]);

  const updateExistingCard = useCallback((cardId, updates) => {
    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: updateCard(currentWorkspace.cards, cardId, updates),
    }));
  }, [patchWorkspace]);

  const updateExistingCards = useCallback((updatesById) => {
    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: updateCards(currentWorkspace.cards, updatesById),
    }));
  }, [patchWorkspace]);

  const createNewRackCard = useCallback((preferredCenter = null, options = {}) => {
    const card = createRackCard(
      workspaceRef.current.cards,
      workspaceRef.current.viewport,
      preferredCenter,
      options,
    );

    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: [...currentWorkspace.cards, card],
    }));

    return card;
  }, [patchWorkspace]);

  const replaceWorkspaceCards = useCallback((nextCards) => {
    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: replaceCards(currentWorkspace.cards, nextCards),
    }));
  }, [patchWorkspace]);

  const reorderExistingCards = useCallback((orderedCardIds) => {
    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: reorderCards(currentWorkspace.cards, orderedCardIds),
    }));
  }, [patchWorkspace]);

  const mergeExistingNoteCardIntoFolder = useCallback((sourceCardId, targetCardId) => {
    const mergeResult = mergeCardIntoNoteFolder(workspaceRef.current.cards, sourceCardId, targetCardId);

    if (!mergeResult) {
      return null;
    }

    const nextWorkspace = {
      ...workspaceRef.current,
      cards: mergeResult.cards,
    };

    workspaceRef.current = nextWorkspace;
    patchWorkspace(nextWorkspace);

    return mergeResult.folderCard;
  }, [patchWorkspace]);

  const deleteExistingCard = useCallback((cardId) => {
    if (!cardId) {
      return;
    }

    patchWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      cards: removeCard(currentWorkspace.cards, cardId),
    }));

    const cancelPreview = desktop.workspace.cancelLinkPreview;

    if (folderPath && typeof cancelPreview === "function") {
      void cancelPreview(folderPath, cardId).catch(() => {});
    }
  }, [folderPath, patchWorkspace]);

  const showHome = useCallback(async () => {
    setCurrentEditor(createEditorState({ kind: "home" }));

    if (folderPath) {
      try {
        await refreshHomeData(folderPath);
      } catch (homeError) {
        setError(homeError.message || "Unable to refresh the Home view.");
      }
    }
  }, [folderPath, refreshHomeData]);

  const openCanvasItem = useCallback(async (projectId, spaceId, canvasId) => {
    if (!folderPath) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const canvasDocument = await desktop.workspace.loadCanvas(folderPath, projectId, spaceId, canvasId);
      openCanvasDocument(canvasDocument);
      await refreshHomeData(folderPath);
      return canvasDocument;
    } catch (openError) {
      setError(openError.message || "Unable to open that canvas.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, openCanvasDocument, refreshHomeData]);

  const openPageItem = useCallback(async (projectId, spaceId, pageId) => {
    if (!folderPath) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const pageDocument = await desktop.workspace.loadPage(folderPath, projectId, spaceId, pageId);
      openPageDocument(pageDocument);
      await refreshHomeData(folderPath);
      return pageDocument;
    } catch (openError) {
      setError(openError.message || "Unable to open that page.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, openPageDocument, refreshHomeData]);

  const openHomeItem = useCallback(async (item) => {
    if (!item) {
      return null;
    }

    if (item.type === "page") {
      return openPageItem(item.projectId, item.spaceId, item.id);
    }

    return openCanvasItem(item.projectId, item.spaceId, item.id);
  }, [openCanvasItem, openPageItem]);

  const updateCurrentPageMarkdown = useCallback((markdown) => {
    setCurrentPage((currentValue) => {
      if (!currentValue) {
        return currentValue;
      }

      return {
        ...currentValue,
        markdown,
      };
    });
  }, []);

  const saveHomeUiState = useCallback(async (partialState) => {
    if (!folderPath) {
      return null;
    }

    const nextUiState = await desktop.workspace.saveUiState(folderPath, partialState);
    setHomeData((currentValue) => ({
      ...currentValue,
      uiState: nextUiState,
    }));
    return nextUiState;
  }, [folderPath]);

  const fetchProjectContents = useCallback(async (projectId) => {
    if (!folderPath || !projectId) {
      return null;
    }

    return desktop.workspace.getProjectContents(folderPath, projectId);
  }, [folderPath]);

  const fetchSpaceContents = useCallback(async (projectId, spaceId) => {
    if (!folderPath || !projectId || !spaceId) {
      return null;
    }

    return desktop.workspace.getSpaceContents(folderPath, projectId, spaceId);
  }, [folderPath]);

  const createProjectEntry = useCallback(async (name) => {
    if (!folderPath) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const project = await desktop.workspace.createProject(folderPath, name);
      await refreshHomeData(folderPath);
      return project;
    } catch (createError) {
      setError(createError.message || "Unable to create a project.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, refreshHomeData]);

  const createSpaceEntry = useCallback(async (projectId, name) => {
    if (!folderPath) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const space = await desktop.workspace.createSpace(folderPath, projectId, name);
      await refreshHomeData(folderPath);
      return space;
    } catch (createError) {
      setError(createError.message || "Unable to create a space.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, refreshHomeData]);

  const createCanvasEntry = useCallback(async (projectId, spaceId, name) => {
    if (!folderPath) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const canvasDocument = await desktop.workspace.createCanvas(folderPath, projectId, spaceId, name);
      openCanvasDocument(canvasDocument);
      await refreshHomeData(folderPath);
      return canvasDocument;
    } catch (createError) {
      setError(createError.message || "Unable to create a canvas.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, openCanvasDocument, refreshHomeData]);

  const createPageEntry = useCallback(async (projectId, spaceId, name) => {
    if (!folderPath) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const page = await desktop.workspace.createPage(folderPath, projectId, spaceId, name);
      const pageDocument = await desktop.workspace.loadPage(folderPath, projectId, spaceId, page.id);
      openPageDocument(pageDocument);
      await refreshHomeData(folderPath);
      return pageDocument;
    } catch (createError) {
      setError(createError.message || "Unable to create a page.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, openPageDocument, refreshHomeData]);

  const renameProjectEntry = useCallback(async (projectId, name) => {
    if (!folderPath || !projectId) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const project = await desktop.workspace.renameProject(folderPath, projectId, name);
      await refreshHomeData(folderPath);
      return project;
    } catch (renameError) {
      setError(renameError.message || "Unable to rename that project.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, refreshHomeData]);

  const renameSpaceEntry = useCallback(async (projectId, spaceId, name) => {
    if (!folderPath || !projectId || !spaceId) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const space = await desktop.workspace.renameSpace(folderPath, projectId, spaceId, name);
      await refreshHomeData(folderPath);
      return space;
    } catch (renameError) {
      setError(renameError.message || "Unable to rename that space.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, refreshHomeData]);

  const renameItemEntry = useCallback(async (item, name) => {
    if (!folderPath || !item?.id || !item?.projectId || !item?.spaceId) {
      return null;
    }

    setFolderLoading(true);
    setError("");

    try {
      const renamedItem = item.type === "page"
        ? await desktop.workspace.renamePage(folderPath, item.projectId, item.spaceId, item.id, name)
        : await desktop.workspace.renameCanvas(folderPath, item.projectId, item.spaceId, item.id, name);

      if (renamedItem?.id && currentEditor.itemId === renamedItem.id) {
        setCurrentEditor((currentValue) => ({
          ...currentValue,
          name: renamedItem.name,
        }));
        setCurrentPage((currentValue) => (
          currentValue?.id === renamedItem.id
            ? {
              ...currentValue,
              name: renamedItem.name,
            }
            : currentValue
        ));
      }

      await refreshHomeData(folderPath);
      return renamedItem;
    } catch (renameError) {
      setError(renameError.message || "Unable to rename that item.");
      return null;
    } finally {
      setFolderLoading(false);
    }
  }, [currentEditor.itemId, folderPath, refreshHomeData]);

  const deleteProjectEntry = useCallback(async (projectId) => {
    if (!folderPath || !projectId) {
      return false;
    }

    setFolderLoading(true);
    setError("");

    try {
      await desktop.workspace.deleteProject(folderPath, projectId);
      await refreshHomeData(folderPath);
      return true;
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete that project.");
      return false;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, refreshHomeData]);

  const deleteSpaceEntry = useCallback(async (projectId, spaceId) => {
    if (!folderPath || !projectId || !spaceId) {
      return false;
    }

    setFolderLoading(true);
    setError("");

    try {
      await desktop.workspace.deleteSpace(folderPath, projectId, spaceId);
      await refreshHomeData(folderPath);
      return true;
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete that space.");
      return false;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, refreshHomeData]);

  const deleteItemEntry = useCallback(async (item) => {
    if (!folderPath || !item?.id || !item?.projectId || !item?.spaceId) {
      return false;
    }

    setFolderLoading(true);
    setError("");

    try {
      if (item.type === "page") {
        await desktop.workspace.deletePage(folderPath, item.projectId, item.spaceId, item.id);
      } else {
        await desktop.workspace.deleteCanvas(folderPath, item.projectId, item.spaceId, item.id);
      }

      await refreshHomeData(folderPath);
      return true;
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete that item.");
      return false;
    } finally {
      setFolderLoading(false);
    }
  }, [folderPath, refreshHomeData]);

  const toggleItemStarred = useCallback(async (itemId, starred) => {
    if (!folderPath || !itemId) {
      return null;
    }

    try {
      const item = await desktop.workspace.markItemStarred(folderPath, itemId, starred);
      await refreshHomeData(folderPath);
      return item;
    } catch (toggleError) {
      setError(toggleError.message || "Unable to update the starred state.");
      return null;
    }
  }, [folderPath, refreshHomeData]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const lastFolder = await desktop.workspace.getLastFolder();

        if (cancelled || !lastFolder) {
          return;
        }

        await loadFolder(lastFolder);
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError.message || "Unable to restore the previous folder.");
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [loadFolder]);

  useEffect(() => {
    const unsubscribe = desktop.workspace.onPreviewUpdated((payload) => {
      if (!payload?.card || (folderPath && payload.folderPath !== folderPath)) {
        return;
      }

      patchWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        cards: currentWorkspace.cards.map((card) =>
            card.id === payload.card.id
              ? {
                ...card,
                title: payload.card.title,
                description: payload.card.description,
                image: payload.card.image,
                favicon: payload.card.favicon,
                siteName: payload.card.siteName,
                previewKind: payload.card.previewKind,
                width: payload.card.width,
                height: payload.card.height,
                status: payload.card.status,
                updatedAt: payload.card.updatedAt,
              }
              : card),
      }));
    });

    return unsubscribe;
  }, [folderPath, patchWorkspace]);

  useEffect(() => {
    if (!folderPath) {
      return undefined;
    }

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return undefined;
    }

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await desktop.workspace.saveWorkspace(folderPath, workspaceRef.current);
      } catch (saveError) {
        setError(saveError.message || "Unable to save the current canvas.");
      }
    }, SAVE_DELAY_MS);

    return () => {
      clearTimeout(saveTimeoutRef.current);
    };
  }, [folderPath, workspace]);

  useEffect(() => {
    if (!folderPath || !currentPage) {
      return undefined;
    }

    if (skipPageSaveRef.current) {
      skipPageSaveRef.current = false;
      return undefined;
    }

    clearTimeout(pageSaveTimeoutRef.current);
    pageSaveTimeoutRef.current = setTimeout(async () => {
      const page = currentPageRef.current;

      if (!page) {
        return;
      }

      try {
        const savedPage = await desktop.workspace.savePage(
          folderPath,
          page.projectId,
          page.spaceId,
          page.id,
          page.markdown,
        );
        skipPageSaveRef.current = true;
        setCurrentPage((currentValue) => {
          if (!currentValue || currentValue.id !== savedPage.id) {
            return currentValue;
          }

          return {
            ...currentValue,
            name: savedPage.name,
            updatedAt: savedPage.updatedAt,
          };
        });
      } catch (saveError) {
        setError(saveError.message || "Unable to save the current page.");
      }
    }, SAVE_DELAY_MS);

    return () => {
      clearTimeout(pageSaveTimeoutRef.current);
    };
  }, [currentPage, folderPath]);

  const value = useMemo(() => ({
    booting,
    currentEditor,
    currentPage,
    error,
    fetchProjectContents,
    fetchSpaceContents,
    folderLoading,
    folderPath,
    homeData,
    openCanvasItem,
    openExistingWorkspace,
    openHomeItem,
    openPageItem,
    refreshHomeData,
    setError,
    showHome,
    saveHomeUiState,
    toggleItemStarred,
    updateCurrentPageMarkdown,
    workspace,
    createCanvasEntry,
    createNewWorkspace,
    createPageEntry,
    createProjectEntry,
    createSpaceEntry,
    deleteItemEntry,
    deleteProjectEntry,
    deleteSpaceEntry,
    setViewport,
    createNewTextCard,
    createNewNoteFolderCard,
    createNewRackCard,
    createNewLinkCard,
    deleteExistingCard,
    mergeExistingNoteCardIntoFolder,
    replaceWorkspaceCards,
    renameItemEntry,
    renameProjectEntry,
    renameSpaceEntry,
    reorderExistingCards,
    updateExistingCard,
    updateExistingCards,
  }), [
    booting,
    createCanvasEntry,
    createNewLinkCard,
    createNewNoteFolderCard,
    createNewRackCard,
    createNewTextCard,
    createNewWorkspace,
    createPageEntry,
    createProjectEntry,
    createSpaceEntry,
    currentEditor,
    currentPage,
    deleteItemEntry,
    deleteProjectEntry,
    deleteSpaceEntry,
    deleteExistingCard,
    error,
    fetchProjectContents,
    fetchSpaceContents,
    folderLoading,
    folderPath,
    homeData,
    mergeExistingNoteCardIntoFolder,
    openCanvasItem,
    openExistingWorkspace,
    openHomeItem,
    openPageItem,
    refreshHomeData,
    renameItemEntry,
    renameProjectEntry,
    renameSpaceEntry,
    reorderExistingCards,
    replaceWorkspaceCards,
    saveHomeUiState,
    setViewport,
    showHome,
    toggleItemStarred,
    updateCurrentPageMarkdown,
    updateExistingCard,
    updateExistingCards,
    workspace,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
