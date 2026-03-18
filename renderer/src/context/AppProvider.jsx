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

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [folderPath, setFolderPath] = useState(null);
  const [workspace, setWorkspace] = useState(createEmptyWorkspace());
  const [folderLoading, setFolderLoading] = useState(false);
  const [error, setError] = useState("");
  const workspaceRef = useRef(workspace);
  const skipSaveRef = useRef(true);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const loadFolder = useCallback(async (nextFolderPath) => {
    if (!nextFolderPath) {
      return;
    }

    setFolderLoading(true);
    setError("");

    try {
      const payload = await desktop.workspace.loadWorkspace(nextFolderPath);
      skipSaveRef.current = true;
      setFolderPath(payload.folderPath);
      setWorkspace(normalizeWorkspace(payload.workspace));
    } catch (loadError) {
      setError(loadError.message || "Unable to open that folder.");
      setFolderPath(null);
      setWorkspace(createEmptyWorkspace());
    } finally {
      setFolderLoading(false);
    }
  }, []);

  const openFolder = useCallback(async () => {
    try {
      const selectedPath = await desktop.workspace.openFolder();

      if (!selectedPath) {
        return null;
      }

      await loadFolder(selectedPath);
      return selectedPath;
    } catch (openError) {
      setError(openError.message || "Unable to select a folder.");
      return null;
    }
  }, [loadFolder]);

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
        await desktop.workspace.saveWorkspace(folderPath, workspace);
      } catch (saveError) {
        setError(saveError.message || "Unable to save the current canvas.");
      }
    }, SAVE_DELAY_MS);

    return () => {
      clearTimeout(saveTimeoutRef.current);
    };
  }, [folderPath, workspace]);

  const value = useMemo(() => ({
    booting,
    error,
    folderLoading,
    folderPath,
    workspace,
    openFolder,
    setError,
    setViewport,
    createNewTextCard,
    createNewNoteFolderCard,
    createNewRackCard,
    createNewLinkCard,
    deleteExistingCard,
    mergeExistingNoteCardIntoFolder,
    replaceWorkspaceCards,
    reorderExistingCards,
    updateExistingCard,
    updateExistingCards,
  }), [
    booting,
    error,
    folderLoading,
    folderPath,
    workspace,
    openFolder,
    setViewport,
    createNewTextCard,
    createNewNoteFolderCard,
    createNewRackCard,
    createNewLinkCard,
    deleteExistingCard,
    mergeExistingNoteCardIntoFolder,
    replaceWorkspaceCards,
    reorderExistingCards,
    updateExistingCard,
    updateExistingCards,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
