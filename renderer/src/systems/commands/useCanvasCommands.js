import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addTileToFolder,
  addTileToRack,
  createFolderCard,
  createFolderFromTiles,
  FOLDER_CARD_TYPE,
  getFolderByChildId,
  getRackByTileId,
  isUrl,
  LINK_CONTENT_KIND_BOOKMARK,
  LINK_CONTENT_KIND_IMAGE,
  removeTileFromFolder,
  removeTileFromRack,
  RACK_CARD_TYPE,
} from "../../lib/workspace";
import { desktop } from "../../lib/desktop";
import { formatDropRejectionMessage, formatDropSuccessMessage } from "../import/dropMessages";
import { getImageTileSize } from "../import/imageSizing";
import { getDropSpreadCenters } from "../import/dropTileLayout";

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

export function useCanvasCommands({
  folderPath,
  canvasFilePath,
  workspace,
  getViewportCenter,
  openFolderDialog,
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
  const [openFolderId, setOpenFolderId] = useState(null);

  useEffect(() => {
    if (!openFolderId) {
      return;
    }

    if (!workspace.cards.some((card) => card.id === openFolderId && card.type === FOLDER_CARD_TYPE)) {
      setOpenFolderId(null);
    }
  }, [openFolderId, workspace.cards]);

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

  const createFolderTile = useCallback((preferredCenter = null, options = {}) => {
    if (!folderPath) {
      log("warn", "New folder blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const card = createFolderCard(workspace.cards, workspace.viewport, centerPoint, options);
    replaceWorkspaceCards([...workspace.cards, card]);
    setOpenFolderId(card.id);

    log("success", "New folder created on the canvas", centerPoint);
    toast("success", "Folder dropped into place.");
    return card;
  }, [folderPath, getViewportCenter, log, replaceWorkspaceCards, toast, workspace.cards, workspace.viewport]);

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

      if (origin.containerType === "folder" && origin.folderId) {
        const folderCard = workspace.cards.find((card) => card.id === origin.folderId);

        if (!folderCard) {
          return;
        }

        updatesById[origin.folderId] = {
          ...(updatesById[origin.folderId] ?? {}),
          childLayouts: {
            ...(updatesById[origin.folderId]?.childLayouts ?? folderCard.childLayouts),
            [tileId]: {
              x: origin.localX + delta.x,
              y: origin.localY + delta.y,
            },
          },
        };
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

    updateExistingCards(updatesById);
  }, [updateExistingCards, workspace.cards]);

  const bringTilesToFront = useCallback((tileIds) => {
    const rootTileIds = tileIds.filter((tileId) => (
      !getFolderByChildId(workspace.cards, tileId)
      && !getRackByTileId(workspace.cards, tileId)
    ));

    if (rootTileIds.length > 0) {
      reorderExistingCards(rootTileIds);
    }
  }, [reorderExistingCards, workspace.cards]);

  const createFolderFromTileSet = useCallback((sourceTileId, targetTileId) => {
    const result = createFolderFromTiles(workspace.cards, sourceTileId, targetTileId);

    if (!result?.folderCard) {
      return null;
    }

    replaceWorkspaceCards(result.cards);
    setOpenFolderId(result.folderCard.id);
    log("success", "Tiles grouped into a folder", {
      sourceTileId,
      targetTileId,
      folderTileId: result.folderCard.id,
    });
    toast("success", "Folder created.");
    return result.folderCard;
  }, [log, replaceWorkspaceCards, toast, workspace.cards]);

  const createFolderFromSelection = useCallback((tileIds, preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "Folder creation blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const normalizedTileIds = Array.isArray(tileIds)
      ? [...new Set(tileIds.filter(Boolean))]
      : [];
    const centerPoint = preferredCenter ?? getViewportCenter();
    const initialFolderCard = createFolderCard(workspace.cards, workspace.viewport, centerPoint);
    let nextCards = [...workspace.cards, initialFolderCard];
    let nextFolderCard = initialFolderCard;
    let attachedCount = 0;

    normalizedTileIds.forEach((tileId) => {
      const result = addTileToFolder(nextCards, tileId, nextFolderCard.id);

      if (!result?.folderCard) {
        return;
      }

      nextCards = result.cards;
      nextFolderCard = result.folderCard;
      attachedCount += 1;
    });

    replaceWorkspaceCards(nextCards);
    setOpenFolderId(nextFolderCard.id);

    if (attachedCount > 0) {
      log("success", "Created folder from selection", {
        folderId: nextFolderCard.id,
        attachedCount,
      });
      toast("success", attachedCount === 1 ? "Tile moved into a new folder." : `${attachedCount} tiles moved into a new folder.`);
    } else {
      log("success", "Created empty folder on the canvas", centerPoint);
      toast("success", "Folder dropped into place.");
    }

    return nextFolderCard;
  }, [folderPath, getViewportCenter, log, replaceWorkspaceCards, toast, workspace.cards, workspace.viewport]);

  const addTileToFolderCommand = useCallback((tileId, folderId, folderPosition = null) => {
    const result = addTileToFolder(workspace.cards, tileId, folderId, folderPosition);

    if (!result?.folderCard) {
      return null;
    }

    replaceWorkspaceCards(result.cards);
    setOpenFolderId(result.folderCard.id);
    log("success", "Tile added to folder", { tileId, folderId });
    return result.folderCard;
  }, [log, replaceWorkspaceCards, workspace.cards]);

  const removeTileFromFolderCommand = useCallback((tileId, folderId, dropPosition) => {
    const result = removeTileFromFolder(workspace.cards, tileId, folderId, dropPosition);

    if (!result?.tile) {
      return null;
    }

    replaceWorkspaceCards(result.cards);
    log("info", "Tile removed from folder", { tileId, folderId, dropPosition });
    return result.tile;
  }, [log, replaceWorkspaceCards, workspace.cards]);

  const addTileToRackCommand = useCallback((tileId, rackId, slotIndex = null) => {
    const result = addTileToRack(workspace.cards, tileId, rackId, slotIndex);

    if (!result?.rackCard) {
      return null;
    }

    replaceWorkspaceCards(result.cards);
    log("success", "Tile attached to rack", { tileId, rackId, slotIndex });
    toast("success", "Tile mounted on rack.");
    return result.rackCard;
  }, [log, replaceWorkspaceCards, toast, workspace.cards]);

  const addTilesToRackCommand = useCallback((tileIds, rackId) => {
    const normalizedTileIds = Array.isArray(tileIds)
      ? [...new Set(tileIds.filter(Boolean))]
      : [];

    if (!rackId || normalizedTileIds.length === 0) {
      return null;
    }

    let nextCards = workspace.cards;
    let nextRackCard = null;

    normalizedTileIds.forEach((tileId) => {
      const result = addTileToRack(nextCards, tileId, rackId);

      if (result?.rackCard) {
        nextCards = result.cards;
        nextRackCard = result.rackCard;
      }
    });

    if (!nextRackCard) {
      return null;
    }

    replaceWorkspaceCards(nextCards);
    log("success", "Tiles attached to rack", { rackId, tileIds: normalizedTileIds });
    toast("success", normalizedTileIds.length === 1 ? "Tile mounted on rack." : `${normalizedTileIds.length} tiles mounted on rack.`);
    return nextRackCard;
  }, [log, replaceWorkspaceCards, toast, workspace.cards]);

  const removeTileFromRackCommand = useCallback((tileId, rackId, dropPosition) => {
    const result = removeTileFromRack(workspace.cards, tileId, rackId, dropPosition);

    if (!result?.tile) {
      return null;
    }

    replaceWorkspaceCards(result.cards);
    log("info", "Tile detached from rack", { tileId, rackId, dropPosition });
    return result.tile;
  }, [log, replaceWorkspaceCards, workspace.cards]);

  const openFolder = useCallback((folderId) => {
    if (!workspace.cards.some((card) => card.id === folderId && card.type === FOLDER_CARD_TYPE)) {
      return false;
    }

    setOpenFolderId(folderId);
    return true;
  }, [workspace.cards]);

  const closeFolder = useCallback((folderId = null) => {
    setOpenFolderId((currentId) => {
      if (!folderId || currentId === folderId) {
        return null;
      }

      return currentId;
    });
  }, []);

  const toggleFolder = useCallback((folderId) => {
    setOpenFolderId((currentId) => (currentId === folderId ? null : folderId));
  }, []);

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
      normalizedIds.forEach((tileId) => {
        deleteExistingCard(tileId);
      });

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
  }, [deleteExistingCard, log, toast]);

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
    if (!tile) {
      return;
    }

    log("info", `Retrying preview for card ${tile.id}`);
    toast("info", "Retrying link preview...");
    updateExistingCard(tile.id, { status: "loading" });
    void queueLinkPreview(tile);
  }, [log, queueLinkPreview, toast, updateExistingCard]);

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

          createNewLinkCard("", preferredCenter, {
            contentKind: LINK_CONTENT_KIND_IMAGE,
            title: importedAsset.fileName || entry.item.name,
            description: "",
            image: importedAsset.relativePath,
            siteName: "Image",
            status: "ready",
            width: nextSize.width,
            height: nextSize.height,
            asset: importedAsset,
          });
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
        const tile = createNewLinkCard(entry.item.url, preferredCenter, {
          contentKind: LINK_CONTENT_KIND_BOOKMARK,
        });
        createdBookmarkCount += 1;
        void queueLinkPreview(tile);
      }
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
    createNewLinkCard,
    folderPath,
    getViewportCenter,
    log,
    queueLinkPreview,
    toast,
  ]);

  const replaceTiles = useCallback((tiles) => {
    replaceWorkspaceCards(tiles);
  }, [replaceWorkspaceCards]);

  return useMemo(() => ({
    openFolderId,
    createRack,
    createFolderTile,
    createFolderFromSelection,
    createLinkFromClipboard,
    createFolderFromTiles: createFolderFromTileSet,
    addTileToFolder: addTileToFolderCommand,
    addTileToRack: addTileToRackCommand,
    addTilesToRack: addTilesToRackCommand,
    removeTileFromFolder: removeTileFromFolderCommand,
    removeTileFromRack: removeTileFromRackCommand,
    openFolder,
    closeFolder,
    toggleFolder,
    deleteTile,
    deleteTiles,
    openTileLink,
    openWorkspaceFolder,
    pasteFromClipboard,
    queueLinkPreview,
    moveTiles,
    bringTilesToFront,
    replaceTiles,
    importResolvedDrop,
    retryTilePreview,
    updateTileFromMediaLoad,
  }), [
    addTileToFolderCommand,
    addTileToRackCommand,
    addTilesToRackCommand,
    closeFolder,
    createRack,
    createFolderTile,
    createFolderFromSelection,
    createFolderFromTileSet,
    createLinkFromClipboard,
    deleteTile,
    deleteTiles,
    openTileLink,
    openWorkspaceFolder,
    pasteFromClipboard,
    importResolvedDrop,
    queueLinkPreview,
    moveTiles,
    openFolder,
    openFolderId,
    bringTilesToFront,
    replaceTiles,
    removeTileFromFolderCommand,
    removeTileFromRackCommand,
    retryTilePreview,
    toggleFolder,
    updateTileFromMediaLoad,
  ]);
}
