import { useCallback, useMemo } from "react";
import {
  addTileToRack,
  canRefreshLinkPreviewCard,
  createLinkPreviewRefreshPatch,
  createLinkCard,
  getRackByTileId,
  isUrl,
  LINK_CONTENT_KIND_BOOKMARK,
  LINK_CONTENT_KIND_IMAGE,
  removeCard,
  removeTileFromRack,
  shouldRecoverLinkPreviewCard,
  updateCards,
} from "../../lib/workspace";
import { desktop } from "../../lib/desktop";
import { formatDropRejectionMessage, formatDropSuccessMessage } from "../import/dropMessages";
import { getImageTileSize } from "../import/imageSizing";
import { getDropSpreadCenters } from "../import/dropTileLayout";

const PREVIEW_REFRESH_CONCURRENCY = 4;

function folderNameFromPath(folderPath) {
  if (!folderPath) {
    return "No folder";
  }

  const segments = folderPath.split(/[\\/]/);
  return segments[segments.length - 1] || folderPath;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Unable to read pasted image."));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    image.onerror = () => reject(new Error("Unable to decode pasted image."));
    image.src = src;
  });
}

function normalizeExternalUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Fall through and try an https-prefixed variant.
  }

  try {
    return new URL(`https://${trimmed}`).toString();
  } catch {
    return "";
  }
}

async function readClipboardImage(clipboardData) {
  const imageItem = Array.from(clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));

  if (!imageItem) {
    return null;
  }

  const file = imageItem.getAsFile();

  if (!file) {
    return null;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await getImageDimensions(dataUrl);

  return {
    dataUrl,
    width: dimensions.width,
    height: dimensions.height,
  };
}

async function runWithConcurrency(items, limit, worker) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const concurrency = Math.max(1, Math.min(limit, normalizedItems.length || 1));
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < normalizedItems.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(normalizedItems[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => consume()));
}

export function useCanvasCommands({
  folderPath,
  canvasFilePath,
  workspace,
  getViewportCenter,
  openFolderDialog,
  commitWorkspaceChange,
  discardWorkspaceDraft,
  createNewLinkCard,
  createNewRackCard,
  deleteExistingCard,
  replaceWorkspaceCards,
  reorderExistingCards,
  updateExistingCard,
  updateExistingCards,
  log,
  toast,
}) {
  const queueLinkPreview = useCallback(async (card) => {
    log("info", "Fetching link preview...", { url: card.url, cardId: card.id });

    try {
      await desktop.workspace.fetchLinkPreview(folderPath, card.id, card.url, card);
      log("success", `Preview queued for "${card.url}"`);
    } catch (previewError) {
      const message = previewError.message || "Unable to fetch preview metadata.";
      updateExistingCard(card.id, { status: "failed", previewError: message });
      log("error", `Preview failed for "${card.url}"`, message);
      toast("error", `Preview failed: ${message}`);
    }
  }, [folderPath, log, toast, updateExistingCard]);

  const refreshTilePreview = useCallback(async (tile, options = {}) => {
    if (!canRefreshLinkPreviewCard(tile)) {
      return false;
    }

    const refreshPatch = createLinkPreviewRefreshPatch(tile);

    if (!refreshPatch) {
      return false;
    }

    const nextTile = {
      ...tile,
      ...refreshPatch,
    };

    updateExistingCard(tile.id, refreshPatch);

    if (!options.silent) {
      log("info", `Refreshing preview for card ${tile.id}`);
      toast("info", "Refreshing link preview...");
    }

    await queueLinkPreview(nextTile);
    return true;
  }, [log, queueLinkPreview, toast, updateExistingCard]);

  const refreshRecoverableTilePreviews = useCallback(async (tiles) => {
    const recoverableTiles = (Array.isArray(tiles) ? tiles : [])
      .filter((tile) => shouldRecoverLinkPreviewCard(tile));

    if (recoverableTiles.length === 0) {
      return 0;
    }

    const updatesById = Object.fromEntries(
      recoverableTiles.map((tile) => [tile.id, createLinkPreviewRefreshPatch(tile)]),
    );

    updateExistingCards(updatesById);
    log("info", "Refreshing failed previews", { count: recoverableTiles.length });
    toast(
      "info",
      recoverableTiles.length === 1
        ? "Refreshing 1 failed preview..."
        : `Refreshing ${recoverableTiles.length} failed previews...`,
    );

    await runWithConcurrency(recoverableTiles, PREVIEW_REFRESH_CONCURRENCY, async (tile) => {
      await queueLinkPreview({
        ...tile,
        ...updatesById[tile.id],
      });
    });

    return recoverableTiles.length;
  }, [log, queueLinkPreview, toast, updateExistingCards]);

  const openWorkspaceFolder = useCallback(async () => {
    log("info", "Opening folder picker...");

    try {
      const selectedPath = await openFolderDialog();

      if (selectedPath) {
        log("success", `Folder opened: ${selectedPath}`);
        toast("success", `Folder opened: ${folderNameFromPath(selectedPath)}`);
      } else {
        log("warn", "Folder picker dismissed");
      }

      return selectedPath;
    } catch (openError) {
      const message = openError.message || "Could not open folder.";
      log("error", "Folder open failed", message);
      toast("error", message);
      return null;
    }
  }, [log, openFolderDialog, toast]);

  const createRack = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New rack blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const rack = createNewRackCard(centerPoint);

    log("success", "New rack created on the canvas", centerPoint);
    toast("success", "Rack dropped into place.");
    return rack;
  }, [createNewRackCard, folderPath, getViewportCenter, log, toast]);

  const moveTiles = useCallback((tileIds, origins, delta) => {
    const updatesById = {};

    tileIds.forEach((tileId) => {
      const origin = origins[tileId];

      if (!origin) {
        return;
      }

      if (origin.containerType === "rack" || origin.containerType === "rack-preview") {
        return;
      }

      updatesById[tileId] = {
        x: origin.x + delta.x,
        y: origin.y + delta.y,
      };
    });

    commitWorkspaceChange((current) => ({ ...current, cards: updateCards(current.cards, updatesById) }));
  }, [commitWorkspaceChange]);

  const bringTilesToFront = useCallback((tileIds) => {
    const rootTileIds = tileIds.filter((tileId) => (
      !getRackByTileId(workspace.cards, tileId)
    ));

    if (rootTileIds.length > 0) {
      reorderExistingCards(rootTileIds);
    }
  }, [reorderExistingCards, workspace.cards]);

  const addTileToRackCommand = useCallback((tileId, rackId, slotIndex = null) => {
    let nextRackCard = null;

    commitWorkspaceChange((current) => {
      const result = addTileToRack(current.cards, tileId, rackId, slotIndex);

      if (!result?.rackCard) {
        return current;
      }

      nextRackCard = result.rackCard;
      return { ...current, cards: result.cards };
    });

    if (!nextRackCard) {
      return null;
    }

    log("success", "Tile attached to rack", { tileId, rackId, slotIndex });
    toast("success", "Tile mounted on rack.");
    return nextRackCard;
  }, [commitWorkspaceChange, log, toast]);

  const addTilesToRackCommand = useCallback((tileIds, rackId) => {
    const normalizedTileIds = Array.isArray(tileIds)
      ? [...new Set(tileIds.filter(Boolean))]
      : [];

    if (!rackId || normalizedTileIds.length === 0) {
      return null;
    }

    let nextRackCard = null;

    commitWorkspaceChange((current) => {
      let nextCards = current.cards;

      normalizedTileIds.forEach((tileId) => {
        const result = addTileToRack(nextCards, tileId, rackId);

        if (result?.rackCard) {
          nextCards = result.cards;
          nextRackCard = result.rackCard;
        }
      });

      return nextRackCard ? { ...current, cards: nextCards } : current;
    });

    if (!nextRackCard) {
      return null;
    }

    log("success", "Tiles attached to rack", { rackId, tileIds: normalizedTileIds });
    toast("success", normalizedTileIds.length === 1 ? "Tile mounted on rack." : `${normalizedTileIds.length} tiles mounted on rack.`);
    return nextRackCard;
  }, [commitWorkspaceChange, log, toast]);

  const removeTileFromRackCommand = useCallback((tileId, rackId, dropPosition) => {
    const result = removeTileFromRack(workspace.cards, tileId, rackId, dropPosition);

    if (!result?.tile) {
      return null;
    }

    replaceWorkspaceCards(result.cards);
    log("info", "Tile detached from rack", { tileId, rackId, dropPosition });
    return result.tile;
  }, [log, replaceWorkspaceCards, workspace.cards]);

  const deleteTile = useCallback((tile) => {
    if (!tile?.id) {
      return;
    }

    try {
      deleteExistingCard(tile.id);
      log("info", `Deleted card ${tile.id}`);
      toast("success", "Tile deleted.");
    } catch (deleteError) {
      const message = deleteError?.message || "Unable to delete this tile.";
      log("error", `Failed to delete card ${tile.id}`, message);
      toast("error", message);
    }
  }, [deleteExistingCard, log, toast]);

  const deleteTiles = useCallback((tileIds) => {
    const normalizedIds = Array.isArray(tileIds)
      ? [...new Set(tileIds.filter(Boolean))]
      : [];

    if (normalizedIds.length === 0) {
      return;
    }

    try {
      commitWorkspaceChange((current) => ({
        ...current,
        cards: normalizedIds.reduce((nextCards, tileId) => removeCard(nextCards, tileId), current.cards),
      }));
      if (folderPath) {
        normalizedIds.forEach((tileId) => {
          void desktop.workspace.cancelLinkPreview(folderPath, tileId).catch(() => {});
        });
      }

      log("info", "Deleted selected tiles", {
        tileIds: normalizedIds,
        count: normalizedIds.length,
      });
      toast("success", normalizedIds.length === 1 ? "Tile deleted." : `${normalizedIds.length} tiles deleted.`);
    } catch (deleteError) {
      const message = deleteError?.message || "Unable to delete these tiles.";
      log("error", "Failed to delete selected tiles", message);
      toast("error", message);
    }
  }, [commitWorkspaceChange, folderPath, log, toast]);

  const updateTileFromMediaLoad = useCallback((tile, mediaWidth, mediaHeight) => {
    if (!tile?.id || !tile.image) {
      return;
    }

    const nextSize = getImageTileSize(mediaWidth, mediaHeight, tile.previewKind);

    if (
      Math.abs(tile.width - nextSize.width) <= 1
      && Math.abs(tile.height - nextSize.height) <= 1
    ) {
      return;
    }

    updateExistingCard(tile.id, {
      width: nextSize.width,
      height: nextSize.height,
    });
  }, [updateExistingCard]);

  const retryTilePreview = useCallback((tile) => {
    void refreshTilePreview(tile);
  }, [refreshTilePreview]);

  const openTileLink = useCallback(async (tile) => {
    if (!tile?.url) {
      return;
    }

    const externalUrl = normalizeExternalUrl(tile.url);

    if (!externalUrl) {
      throw new Error("Invalid link");
    }

    await desktop.shell.openExternal(externalUrl);
  }, []);

  const pasteFromClipboard = useCallback(async (event) => {
    if (!folderPath) {
      const clipboardItems = Array.from(event.clipboardData?.items ?? []);

      if (!event.clipboardData?.getData("text/plain")?.trim() && !clipboardItems.some((item) => item.type.startsWith("image/"))) {
        return;
      }

      event.preventDefault();
      log("warn", "Paste blocked because no folder is open");
      toast("warn", "Open a folder first so AirPaste knows where to save the board.");
      return;
    }

    const centerPoint = getViewportCenter();
    const clipboardData = event.clipboardData;
    const text = clipboardData?.getData("text/plain")?.trim() ?? "";

    try {
      const pastedImage = await readClipboardImage(clipboardData);

      if (pastedImage?.dataUrl) {
        event.preventDefault();

        const imageTileSize = getImageTileSize(pastedImage.width, pastedImage.height);
        createNewLinkCard("", centerPoint, {
          contentKind: LINK_CONTENT_KIND_IMAGE,
          title: "Pasted image",
          description: "",
          image: pastedImage.dataUrl,
          siteName: "Image",
          status: "ready",
          width: imageTileSize.width,
          height: imageTileSize.height,
          asset: null,
        });

        log("success", "Pasted image into canvas center", {
          width: pastedImage.width,
          height: pastedImage.height,
          centerPoint,
        });
        toast("success", "Image dropped into the center of the canvas.");
        return;
      }
    } catch (pasteError) {
      event.preventDefault();
      const message = pasteError?.message || "Unable to paste that image.";
      log("error", "Image paste failed", message);
      toast("error", message);
      return;
    }

    if (!text) {
      return;
    }

    event.preventDefault();

    if (isUrl(text)) {
      log("info", "Pasted URL into canvas center", { url: text, centerPoint });
      const tile = createNewLinkCard(text, centerPoint);
      toast("info", "Link pasted into the center. Fetching preview...");
      void queueLinkPreview(tile);
      return;
    }
  }, [
    createNewLinkCard,
    folderPath,
    getViewportCenter,
    log,
    queueLinkPreview,
    toast,
  ]);

  const createLinkFromClipboard = useCallback(async (preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New link blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    let clipboardText = "";

    try {
      clipboardText = await navigator.clipboard?.readText?.() ?? "";
    } catch (clipboardError) {
      const message = clipboardError?.message || "Could not read the clipboard.";
      log("warn", "Clipboard read failed for link creation", message);
      toast("warn", message);
      return null;
    }

    if (!isUrl(clipboardText.trim())) {
      toast("warn", "Copy a URL first, then try Link.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const tile = createNewLinkCard(clipboardText.trim(), centerPoint);
    toast("info", "Link dropped into place. Fetching preview...");
    void queueLinkPreview(tile);
    return tile;
  }, [createNewLinkCard, folderPath, getViewportCenter, log, queueLinkPreview, toast]);

  const importResolvedDrop = useCallback(async (resolvedDrop, dropWorldPoint) => {
    if (!folderPath) {
      log("warn", "Drop import blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return {
        createdImageCount: 0,
        createdBookmarkCount: 0,
        rejectedItems: resolvedDrop?.rejectedItems ?? [],
      };
    }

    if (!canvasFilePath) {
      const message = "Drop import failed because the active canvas could not be resolved.";
      log("error", "Drop import failed", message);
      toast("error", message);
      return {
        createdImageCount: 0,
        createdBookmarkCount: 0,
        rejectedItems: resolvedDrop?.rejectedItems ?? [],
      };
    }

    const acceptedItems = Array.isArray(resolvedDrop?.acceptedItems) ? resolvedDrop.acceptedItems : [];
    const dropCenters = getDropSpreadCenters(dropWorldPoint ?? getViewportCenter(), acceptedItems.length);
    const rejectedItems = [...(resolvedDrop?.rejectedItems ?? [])];
    const createdCards = [];
    const previewQueue = [];
    let createdImageCount = 0;
    let createdBookmarkCount = 0;

    for (let index = 0; index < acceptedItems.length; index += 1) {
      const entry = acceptedItems[index];
      const preferredCenter = dropCenters[index] ?? getViewportCenter();

      if (entry.intent === "import-image") {
        try {
          const importedAsset = await desktop.workspace.importImageAsset(
            folderPath,
            {
              fileName: entry.item.name,
              mimeType: entry.item.mimeType,
              sourcePath: entry.item.sourcePath,
              sizeBytes: entry.item.sizeBytes,
            },
          );
          const nextSize = getImageTileSize(importedAsset.width, importedAsset.height);

          createdCards.push(createLinkCard(workspace.cards.concat(createdCards), workspace.viewport, "", preferredCenter, {
            contentKind: LINK_CONTENT_KIND_IMAGE,
            title: importedAsset.fileName || entry.item.name,
            description: "",
            image: importedAsset.relativePath,
            siteName: "Image",
            status: "ready",
            width: nextSize.width,
            height: nextSize.height,
            asset: importedAsset,
          }));
          createdImageCount += 1;
        } catch (importError) {
          const detail = importError?.message || `Unable to import "${entry.item.name}".`;
          rejectedItems.push({
            item: entry.item,
            reason: "asset-import-failed",
            detail,
          });
          log("error", "Image import failed", detail);
        }

        continue;
      }

      if (entry.intent === "create-bookmark") {
        const tile = createLinkCard(workspace.cards.concat(createdCards), workspace.viewport, entry.item.url, preferredCenter, {
          contentKind: LINK_CONTENT_KIND_BOOKMARK,
        });
        createdCards.push(tile);
        previewQueue.push(tile);
        createdBookmarkCount += 1;
      }
    }

    if (createdCards.length > 0) {
      commitWorkspaceChange((current) => ({
        ...current,
        cards: [...current.cards, ...createdCards],
      }));
      previewQueue.forEach((tile) => {
        void queueLinkPreview(tile);
      });
    }

    const successMessage = formatDropSuccessMessage(createdImageCount, createdBookmarkCount);

    if (successMessage) {
      log("success", "Drop import completed", {
        createdImageCount,
        createdBookmarkCount,
      });
      toast("success", successMessage);
    }

    const rejectionMessage = formatDropRejectionMessage(rejectedItems);

    if (rejectionMessage) {
      log("warn", "Drop import completed with rejections", rejectionMessage);
      toast(createdImageCount + createdBookmarkCount > 0 ? "warn" : "error", rejectionMessage);
    }

    return {
      createdImageCount,
      createdBookmarkCount,
      rejectedItems,
    };
  }, [
    canvasFilePath,
    commitWorkspaceChange,
    folderPath,
    getViewportCenter,
    log,
    queueLinkPreview,
    toast,
    workspace.cards,
    workspace.viewport,
  ]);

  const replaceTiles = useCallback((tiles) => {
    replaceWorkspaceCards(tiles);
  }, [replaceWorkspaceCards]);

  const commitCurrentWorkspace = useCallback(() => {
    commitWorkspaceChange((current) => current);
  }, [commitWorkspaceChange]);

  const cancelPendingWorkspaceChange = useCallback(() => {
    discardWorkspaceDraft();
  }, [discardWorkspaceDraft]);

  return useMemo(() => ({
    createRack,
    createLinkFromClipboard,
    addTileToRack: addTileToRackCommand,
    addTilesToRack: addTilesToRackCommand,
    removeTileFromRack: removeTileFromRackCommand,
    deleteTile,
    deleteTiles,
    openTileLink,
    openWorkspaceFolder,
    pasteFromClipboard,
    queueLinkPreview,
    moveTiles,
    bringTilesToFront,
    cancelPendingWorkspaceChange,
    commitCurrentWorkspace,
    replaceTiles,
    importResolvedDrop,
    refreshRecoverableTilePreviews,
    refreshTilePreview,
    retryTilePreview,
    updateTileFromMediaLoad,
  }), [
    addTileToRackCommand,
    addTilesToRackCommand,
    createRack,
    createLinkFromClipboard,
    deleteTile,
    deleteTiles,
    openTileLink,
    openWorkspaceFolder,
    pasteFromClipboard,
    importResolvedDrop,
    queueLinkPreview,
    moveTiles,
    bringTilesToFront,
    cancelPendingWorkspaceChange,
    commitCurrentWorkspace,
    replaceTiles,
    removeTileFromRackCommand,
    refreshRecoverableTilePreviews,
    refreshTilePreview,
    retryTilePreview,
    updateTileFromMediaLoad,
  ]);
}
