import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addTileToFolder,
  addTileToRack,
  createFolderFromTiles,
  FOLDER_CARD_TYPE,
  getFolderByChildId,
  getRackByTileId,
  isUrl,
  NOTE_FOLDER_CARD_TYPE,
  NOTE_STYLE_ONE,
  NOTE_STYLE_THREE,
  NOTE_STYLE_QUICK,
  NOTE_STYLE_TWO,
  removeTileFromFolder,
  removeTileFromRack,
  RACK_CARD_TYPE,
} from "../../lib/workspace";
import { desktop } from "../../lib/desktop";

const IMAGE_CARD_PORTRAIT_MAX_WIDTH = 320;
const IMAGE_CARD_PORTRAIT_MAX_HEIGHT = 540;
const IMAGE_CARD_SQUARE_MAX_WIDTH = 340;
const IMAGE_CARD_SQUARE_MAX_HEIGHT = 380;
const IMAGE_CARD_LANDSCAPE_MAX_WIDTH = 420;
const IMAGE_CARD_LANDSCAPE_MAX_HEIGHT = 320;
const IMAGE_CARD_MIN_WIDTH = 180;
const IMAGE_CARD_MIN_HEIGHT = 140;

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

function getImageCardSize(width, height, previewKind = "default") {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {
      width: 340,
      height: 280,
    };
  }

  if (previewKind === "music") {
    const side = Math.max(
      IMAGE_CARD_MIN_WIDTH,
      Math.min(IMAGE_CARD_SQUARE_MAX_WIDTH, Math.round(Math.min(width, height))),
    );

    return {
      width: side,
      height: side,
    };
  }

  const aspectRatio = width / height;
  const bounds = aspectRatio < 0.9
    ? {
      maxWidth: IMAGE_CARD_PORTRAIT_MAX_WIDTH,
      maxHeight: IMAGE_CARD_PORTRAIT_MAX_HEIGHT,
    }
    : aspectRatio > 1.18
      ? {
        maxWidth: IMAGE_CARD_LANDSCAPE_MAX_WIDTH,
        maxHeight: IMAGE_CARD_LANDSCAPE_MAX_HEIGHT,
      }
      : {
        maxWidth: IMAGE_CARD_SQUARE_MAX_WIDTH,
        maxHeight: IMAGE_CARD_SQUARE_MAX_HEIGHT,
      };

  let scale = Math.min(
    bounds.maxWidth / width,
    bounds.maxHeight / height,
    1,
  );
  let nextWidth = width * scale;
  let nextHeight = height * scale;

  if (nextWidth < IMAGE_CARD_MIN_WIDTH && nextHeight < IMAGE_CARD_MIN_HEIGHT) {
    const upscale = Math.max(
      IMAGE_CARD_MIN_WIDTH / nextWidth,
      IMAGE_CARD_MIN_HEIGHT / nextHeight,
    );

    nextWidth *= upscale;
    nextHeight *= upscale;
  }

  return {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
  };
}

export function useCanvasCommands({
  folderPath,
  workspace,
  getViewportCenter,
  openFolderDialog,
  createNewLinkCard,
  createNewNoteFolderCard,
  createNewRackCard,
  createNewTextCard,
  deleteExistingCard,
  mergeExistingNoteCardIntoFolder,
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
      updateExistingCard(card.id, { status: "failed" });
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

  const createNoteVariant = useCallback((noteStyle, successMessage, logMessage, text = "") => {
    if (!folderPath) {
      log("warn", "New note blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = getViewportCenter();
    const card = createNewTextCard(text, centerPoint, { noteStyle });

    log("success", logMessage, centerPoint);
    toast("success", successMessage);
    return card;
  }, [createNewTextCard, folderPath, getViewportCenter, log, toast]);

  const createQuickNote = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "Quick note blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const card = createNewTextCard("", centerPoint, { noteStyle: NOTE_STYLE_QUICK });

    log("success", "Quick note created from empty canvas double-tap", centerPoint);
    toast("success", "Quick note added.");
    return card;
  }, [createNewTextCard, folderPath, getViewportCenter, log, toast]);

  const createNoteOne = useCallback(() => (
    createNoteVariant(
      NOTE_STYLE_ONE,
      "Note 1 dropped into the center.",
      "New blank note 1 card created in canvas center",
    )
  ), [createNoteVariant]);

  const createNoteTwo = useCallback(() => (
    createNoteVariant(
      NOTE_STYLE_TWO,
      "Note 2 dropped into the center.",
      "New blank note 2 card created in canvas center",
    )
  ), [createNoteVariant]);

  const createNoteThree = useCallback(() => (
    createNoteVariant(
      NOTE_STYLE_THREE,
      "Note 3 dropped into the center.",
      "New blank note 3 card created in canvas center",
    )
  ), [createNoteVariant]);

  const createFolderTile = useCallback(() => {
    if (!folderPath) {
      log("warn", "New folder note blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = getViewportCenter();
    const card = createNewNoteFolderCard(centerPoint);

    log("success", "New note folder card created in canvas center", centerPoint);
    toast("success", "Folder note dropped into the center.");
    return card;
  }, [createNewNoteFolderCard, folderPath, getViewportCenter, log, toast]);

  const createRack = useCallback(() => {
    if (!folderPath) {
      log("warn", "New rack blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = getViewportCenter();
    const rack = createNewRackCard(centerPoint);

    log("success", "New rack created in canvas center", centerPoint);
    toast("success", "Rack dropped into the center.");
    return rack;
  }, [createNewRackCard, folderPath, getViewportCenter, log, toast]);

  const updateTile = useCallback((tileId, updates) => {
    updateExistingCard(tileId, updates);
  }, [updateExistingCard]);

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

  const mergeTilesIntoFolder = useCallback((sourceTileId, targetTileId) => {
    const folderTile = mergeExistingNoteCardIntoFolder(sourceTileId, targetTileId);

    if (folderTile) {
      log("success", "Notes grouped into a folder", {
        sourceTileId,
        targetTileId,
        folderTileId: folderTile.id,
      });
      toast("success", "Note tucked into a folder.");
    }

    return folderTile;
  }, [log, mergeExistingNoteCardIntoFolder, toast]);

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

  const duplicateTile = useCallback((tile) => {
    if (!tile) {
      return null;
    }

    const preferredCenter = {
      x: tile.x + tile.width / 2 + 36,
      y: tile.y + tile.height / 2 + 36,
    };

    if (tile.type === "text") {
      return createNewTextCard(tile.text, preferredCenter, {
        noteStyle: tile.noteStyle,
        secondaryText: tile.secondaryText,
        quoteAuthor: tile.quoteAuthor,
      });
    }

    if (tile.type === NOTE_FOLDER_CARD_TYPE) {
      return createNewNoteFolderCard(preferredCenter, {
        title: tile.title,
        description: tile.description,
        notes: tile.notes,
      });
    }

    if (tile.type === FOLDER_CARD_TYPE || tile.type === RACK_CARD_TYPE) {
      return null;
    }

    const clonedTile = createNewLinkCard(tile.url, preferredCenter);

    updateExistingCard(clonedTile.id, {
      title: tile.title,
      description: tile.description,
      image: tile.image,
      favicon: tile.favicon,
      siteName: tile.siteName,
      previewKind: tile.previewKind,
      status: tile.status,
      width: tile.width,
      height: tile.height,
    });

    return clonedTile;
  }, [
    createNewLinkCard,
    createNewNoteFolderCard,
    createNewTextCard,
    updateExistingCard,
  ]);

  const updateTileFromMediaLoad = useCallback((tile, mediaWidth, mediaHeight) => {
    if (!tile?.id || !tile.image) {
      return;
    }

    const nextSize = getImageCardSize(mediaWidth, mediaHeight, tile.previewKind);

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

        const imageTile = createNewLinkCard(pastedImage.dataUrl, centerPoint);
        const imageTileSize = getImageCardSize(pastedImage.width, pastedImage.height);

        updateExistingCard(imageTile.id, {
          url: pastedImage.dataUrl,
          title: "Pasted image",
          description: "",
          image: pastedImage.dataUrl,
          siteName: "Image",
          status: "ready",
          width: imageTileSize.width,
          height: imageTileSize.height,
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

    createNoteVariant(
      NOTE_STYLE_TWO,
      "Text note dropped into the center of the canvas.",
      "Pasted text note into canvas center",
      text,
    );
  }, [
    createNewLinkCard,
    createNoteVariant,
    folderPath,
    getViewportCenter,
    log,
    queueLinkPreview,
    toast,
    updateExistingCard,
  ]);

  const createTileFromDefinition = useCallback((definition) => {
    if (!definition?.type) {
      return null;
    }

    if (definition.type === "text") {
      return createNewTextCard(definition.text ?? "", definition.preferredCenter ?? getViewportCenter(), {
        noteStyle: definition.noteStyle ?? NOTE_STYLE_TWO,
        secondaryText: definition.secondaryText ?? "",
        quoteAuthor: definition.quoteAuthor ?? "",
      });
    }

    if (definition.type === NOTE_FOLDER_CARD_TYPE) {
      return createNewNoteFolderCard(definition.preferredCenter ?? getViewportCenter(), {
        title: definition.title,
        description: definition.description,
        notes: definition.notes,
      });
    }

    if (definition.type === RACK_CARD_TYPE) {
      return createNewRackCard(definition.preferredCenter ?? getViewportCenter(), {
        title: definition.title,
        description: definition.description,
        minSlots: definition.minSlots,
      });
    }

    if (definition.type === FOLDER_CARD_TYPE) {
      return null;
    }

    const tile = createNewLinkCard(definition.url, definition.preferredCenter ?? getViewportCenter());

    if (definition.updates) {
      updateExistingCard(tile.id, definition.updates);
    }

    return tile;
  }, [
    createNewLinkCard,
    createNewNoteFolderCard,
    createNewRackCard,
    createNewTextCard,
    getViewportCenter,
    updateExistingCard,
  ]);

  const replaceTiles = useCallback((tiles) => {
    replaceWorkspaceCards(tiles);
  }, [replaceWorkspaceCards]);

  return useMemo(() => ({
    openFolderId,
    createRack,
    createFolderTile,
    createNoteOne,
    createNoteTwo,
    createNoteThree,
    createQuickNote,
    createTileFromDefinition,
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
    duplicateTile,
    openTileLink,
    openWorkspaceFolder,
    pasteFromClipboard,
    queueLinkPreview,
    moveTiles,
    mergeTilesIntoFolder,
    bringTilesToFront,
    replaceTiles,
    retryTilePreview,
    updateTile,
    updateTileFromMediaLoad,
  }), [
    addTileToFolderCommand,
    addTileToRackCommand,
    addTilesToRackCommand,
    closeFolder,
    createRack,
    createFolderTile,
    createFolderFromTileSet,
    createNoteOne,
    createNoteThree,
    createNoteTwo,
    createQuickNote,
    createTileFromDefinition,
    deleteTile,
    deleteTiles,
    duplicateTile,
    openTileLink,
    openWorkspaceFolder,
    pasteFromClipboard,
    queueLinkPreview,
    moveTiles,
    mergeTilesIntoFolder,
    openFolder,
    openFolderId,
    bringTilesToFront,
    replaceTiles,
    removeTileFromFolderCommand,
    removeTileFromRackCommand,
    retryTilePreview,
    toggleFolder,
    updateTile,
    updateTileFromMediaLoad,
  ]);
}
