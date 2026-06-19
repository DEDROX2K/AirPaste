import { useCallback, useMemo } from "react";
import {
  addTileToRack,
  canRefreshLinkPreviewCard,
  createFileCard,
  createLinkPreviewRefreshPatch,
  createLinkCard,
  FILE_CARD_TYPE,
  getWorkspaceActivePage,
  getRackByTileId,
  isUrl,
  LINK_CONTENT_KIND_BOOKMARK,
  LINK_CONTENT_KIND_IMAGE,
  removeCard,
  removeTileFromRack,
  shouldRecoverLinkPreviewCard,
  updateCards,
} from "../../lib/workspace";
import {
  CANVAS_TEXT_SOURCE_FILE,
  CANVAS_TEXT_SOURCE_LOCAL,
  CANVAS_TEXT_TITLE_MODE_CUSTOM,
  CANVAS_TEXT_TITLE_MODE_DERIVED,
  CANVAS_TEXT_VARIANT_DEFAULT,
  CANVAS_TEXT_VARIANT_STICKY,
  composeStickyNoteFileContent,
  deriveStickyNoteFileDocument,
  deriveCanvasTextTitle,
} from "../../lib/canvasText";
import { desktop } from "../../lib/desktop";
import { formatDropRejectionMessage, formatDropSuccessMessage } from "../import/dropMessages";
import { getImageTileSize } from "../import/imageSizing";
import { getDropSpreadCenters } from "../import/dropTileLayout";
import { getRenderableTileEntries } from "../layout/tileLayout";

const PREVIEW_REFRESH_CONCURRENCY = 4;
const PREVIEW_UNAVAILABLE_MESSAGE = "Link previews are temporarily unavailable.";
const GROUP_DEFAULT_WIDTH = 420;
const GROUP_DEFAULT_HEIGHT = 260;
const GROUP_PADDING_X = 56;
const GROUP_PADDING_Y = 48;

function folderNameFromPath(folderPath) {
  if (!folderPath) {
    return "No folder";
  }

  const segments = folderPath.split(/[\\/]/);
  return segments[segments.length - 1] || folderPath;
}

function updateCurrentActivePage(currentWorkspace, updater) {
  const activePage = getWorkspaceActivePage(currentWorkspace);

  return {
    ...currentWorkspace,
    activePageId: activePage.id,
    pages: currentWorkspace.pages.map((page) => (
      page.id === activePage.id
        ? updater(page)
        : page
    )),
  };
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

function getPathFileName(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/").trim();
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  return segments[segments.length - 1] || "";
}

function getFileExtensionLabel(fileName, fallbackExtension = "") {
  const normalizedFallback = String(fallbackExtension ?? "").trim().replace(/^\.+/, "").toLowerCase();
  const normalizedName = String(fileName ?? "").trim();
  const lastDotIndex = normalizedName.lastIndexOf(".");

  if (lastDotIndex >= 0 && lastDotIndex < normalizedName.length - 1) {
    return normalizedName.slice(lastDotIndex + 1).toLowerCase();
  }

  return normalizedFallback;
}

function nowIso() {
  return new Date().toISOString();
}

function isMarkdownFilePath(value) {
  return /\.md$/i.test(String(value ?? "").trim());
}

function fileStem(fileName) {
  return String(fileName ?? "").replace(/\.[^.]+$/, "").trim();
}

function createGroupBoundsFromEntries(entries, fallbackCenter) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      x: Math.round(fallbackCenter.x - (GROUP_DEFAULT_WIDTH / 2)),
      y: Math.round(fallbackCenter.y - (GROUP_DEFAULT_HEIGHT / 2)),
      width: GROUP_DEFAULT_WIDTH,
      height: GROUP_DEFAULT_HEIGHT,
    };
  }

  const bounds = entries.reduce((currentBounds, entry) => {
    const nextRect = entry.rect ?? {
      left: entry.x,
      top: entry.y,
      right: entry.x + entry.width,
      bottom: entry.y + entry.height,
    };

    if (!currentBounds) {
      return { ...nextRect };
    }

    return {
      left: Math.min(currentBounds.left, nextRect.left),
      top: Math.min(currentBounds.top, nextRect.top),
      right: Math.max(currentBounds.right, nextRect.right),
      bottom: Math.max(currentBounds.bottom, nextRect.bottom),
    };
  }, null);

  return {
    x: Math.round(bounds.left - GROUP_PADDING_X),
    y: Math.round(bounds.top - GROUP_PADDING_Y),
    width: Math.round((bounds.right - bounds.left) + (GROUP_PADDING_X * 2)),
    height: Math.round((bounds.bottom - bounds.top) + (GROUP_PADDING_Y * 2)),
  };
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
  createNewCalendarCard,
  createNewChecklistCard,
  createNewCodeCard,
  createNewCounterCard,
  createNewDeadlineCard,
  createNewLinkCard,
  createNewCanvasTextCard,
  createNewProgressCard,
  createNewRackCard,
  createNewTableCard,
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
      const result = await desktop.workspace.fetchLinkPreview(folderPath, card.id, card.url, card, canvasFilePath);
      if (result?.disabled === true) {
        updateExistingCard(card.id, {
          status: "error",
          previewStatus: "disabled",
          previewError: PREVIEW_UNAVAILABLE_MESSAGE,
        });
        log("warn", `Preview unavailable for "${card.url}"`, PREVIEW_UNAVAILABLE_MESSAGE);
        return;
      }
      log("success", `Preview queued for "${card.url}"`);
    } catch (previewError) {
      const message = previewError.message || "Unable to fetch preview metadata.";
      updateExistingCard(card.id, { status: "error", previewError: message });
      log("error", `Preview failed for "${card.url}"`, message);
      toast("error", `Preview failed: ${message}`);
    }
  }, [canvasFilePath, folderPath, log, toast, updateExistingCard]);

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

  const createChecklist = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New checklist blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const checklist = createNewChecklistCard(centerPoint);

    log("success", "New checklist created on the canvas", centerPoint);
    toast("success", "Checklist dropped into place.");
    return checklist;
  }, [createNewChecklistCard, folderPath, getViewportCenter, log, toast]);

  const createCalendar = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New calendar blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const now = new Date();
    const calendar = createNewCalendarCard(centerPoint, {
      title: "Calendar",
      month: now.getMonth(),
      year: now.getFullYear(),
      view: "month",
      themeId: "mist",
      heightPreset: "compact",
      width: 920,
      height: 468,
    });

    log("success", "New calendar created on the canvas", centerPoint);
    toast("success", "Calendar dropped into place.");
    return calendar;
  }, [createNewCalendarCard, folderPath, getViewportCenter, log, toast]);

  const createCode = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New code snippet blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const codeTile = createNewCodeCard(centerPoint, {
      title: "Terminal command",
      language: "bash",
      code: "npm run dev",
      wrap: true,
      showLineNumbers: true,
    });

    log("success", "New code snippet created on the canvas", centerPoint);
    toast("success", "Code snippet dropped into place.");
    return codeTile;
  }, [createNewCodeCard, folderPath, getViewportCenter, log, toast]);

  const createCounter = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New counter blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const counter = createNewCounterCard(centerPoint, {
      title: "Bugs Found",
      value: 0,
      step: 1,
      unit: "bugs",
    });

    log("success", "New counter created on the canvas", centerPoint);
    toast("success", "Counter dropped into place.");
    return counter;
  }, [createNewCounterCard, folderPath, getViewportCenter, log, toast]);

  const createDeadline = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New deadline blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const deadline = createNewDeadlineCard(centerPoint, {
      title: "Launch countdown",
      targetAt: "",
      timezone: "local",
      showSeconds: false,
      width: 480,
      height: 360,
    });

    log("success", "New deadline created on the canvas", centerPoint);
    toast("success", "Deadline dropped into place.");
    return deadline;
  }, [createNewDeadlineCard, folderPath, getViewportCenter, log, toast]);

  const createTextCard = useCallback((preferredCenter = null, options = {}) => {
    if (!folderPath) {
      log("warn", "New text card blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const note = createNewCanvasTextCard(centerPoint, {
      source: CANVAS_TEXT_SOURCE_LOCAL,
      variant: CANVAS_TEXT_VARIANT_DEFAULT,
      titleMode: CANVAS_TEXT_TITLE_MODE_DERIVED,
      text: typeof options?.text === "string" ? options.text : "",
      width: options?.width,
      height: options?.height,
    });

    log("success", "New text card created on the canvas", centerPoint);
    toast("success", "Text card dropped into place.");
    return note;
  }, [createNewCanvasTextCard, folderPath, getViewportCenter, log, toast]);

  const createNote = useCallback((preferredCenter = null) => {
    return createTextCard(preferredCenter);
  }, [createTextCard]);

  const createProgress = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New progress tile blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const progress = createNewProgressCard(centerPoint, {
      title: "Feature progress",
      mode: "manual",
      value: 0,
      max: 100,
      linkedTileId: null,
    });

    log("success", "New progress tile created on the canvas", centerPoint);
    toast("success", "Progress tile dropped into place.");
    return progress;
  }, [createNewProgressCard, folderPath, getViewportCenter, log, toast]);

  const createTable = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New table blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const table = createNewTableCard(centerPoint);

    log("success", "New table created on the canvas", centerPoint);
    toast("success", "Table dropped into place.");
    return table;
  }, [createNewTableCard, folderPath, getViewportCenter, log, toast]);

  const createTextBox = useCallback((preferredCenter = null, options = {}) => {
    return createTextCard(preferredCenter, options);
  }, [createTextCard]);

  const createSticky = useCallback((preferredCenter = null, options = {}) => {
    if (!folderPath) {
      log("warn", "New sticky note blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const sticky = createNewCanvasTextCard(centerPoint, {
      ...options,
      source: CANVAS_TEXT_SOURCE_LOCAL,
      variant: CANVAS_TEXT_VARIANT_STICKY,
      title: typeof options?.title === "string" ? options.title : "",
      titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM,
      text: typeof options?.text === "string" ? options.text : "",
    });

    log("success", "New sticky note created on the canvas", centerPoint);
    toast("success", "Sticky note dropped into place.");
    return sticky;
  }, [createNewCanvasTextCard, folderPath, getViewportCenter, log, toast]);

  const resolveMarkdownSelection = useCallback(async (selectedPath) => {
    const existingItem = await desktop.workspace.getItemForFilePath(folderPath, selectedPath).catch(() => null);
    const existingPath = existingItem?.filePath || existingItem?.path || selectedPath;

    if (existingItem?.filePath && isMarkdownFilePath(existingItem.filePath)) {
      return desktop.workspace.readMarkdownFile(folderPath, existingPath);
    }

    const importedFiles = await desktop.workspace.importFiles(folderPath, [selectedPath], "");
    const importedFile = Array.isArray(importedFiles) ? importedFiles[0] : null;
    const importedPath = importedFile?.filePath || importedFile?.path || "";

    if (!importedPath || !isMarkdownFilePath(importedPath)) {
      throw new Error("Pick a Markdown file to add a file-backed note.");
    }

    return desktop.workspace.readMarkdownFile(folderPath, importedPath);
  }, [folderPath]);

  const addNoteFromVault = useCallback(async (preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "Add note from vault blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const selectedPaths = await desktop.workspace.openFiles();
    const markdownPath = selectedPaths.find((candidate) => isMarkdownFilePath(candidate));

    if (!markdownPath) {
      toast("warn", "Pick a Markdown file.");
      return null;
    }

    try {
      const fileRecord = await resolveMarkdownSelection(markdownPath);
      const centerPoint = preferredCenter ?? getViewportCenter();
      const note = createNewCanvasTextCard(centerPoint, {
        source: CANVAS_TEXT_SOURCE_FILE,
        variant: CANVAS_TEXT_VARIANT_DEFAULT,
        titleMode: CANVAS_TEXT_TITLE_MODE_DERIVED,
        text: fileRecord.content,
        file: fileRecord,
      });

      log("success", "File-backed markdown note created", {
        centerPoint,
        relativePath: fileRecord.relativePath,
      });
      toast("success", "Markdown note added to the canvas.");
      return note;
    } catch (error) {
      const message = error?.message || "Unable to add that Markdown note.";
      log("error", "Markdown note import failed", message);
      toast("error", message);
      return null;
    }
  }, [createNewCanvasTextCard, folderPath, getViewportCenter, log, resolveMarkdownSelection, toast]);

  const convertTextCardToFile = useCallback(async (tile) => {
    if (!folderPath || !tile?.id || tile?.type !== "canvas-text" || tile?.source !== CANVAS_TEXT_SOURCE_LOCAL) {
      return null;
    }

    const suggestedName = fileStem(deriveCanvasTextTitle(tile)) || "Canvas Note";
    const nextContent = tile?.variant === CANVAS_TEXT_VARIANT_STICKY
      ? composeStickyNoteFileContent(tile.title, tile.text)
      : (tile.text ?? "");

    try {
      const fileRecord = await desktop.workspace.createMarkdownFile(folderPath, suggestedName, nextContent, "");
      const stickyDocument = tile?.variant === CANVAS_TEXT_VARIANT_STICKY
        ? deriveStickyNoteFileDocument(fileRecord.content, tile.title)
        : null;
      updateExistingCard(tile.id, {
        source: CANVAS_TEXT_SOURCE_FILE,
        file: fileRecord,
        title: stickyDocument ? stickyDocument.title : tile.title,
        text: stickyDocument ? stickyDocument.bodyText : fileRecord.content,
        titleMode: tile?.variant === CANVAS_TEXT_VARIANT_STICKY
          ? CANVAS_TEXT_TITLE_MODE_CUSTOM
          : (tile.titleMode || CANVAS_TEXT_TITLE_MODE_DERIVED),
        updatedAt: nowIso(),
      });
      toast("success", "Text card converted to a markdown file.");
      return fileRecord;
    } catch (error) {
      const message = error?.message || "Unable to convert this text card to a file.";
      log("error", "Text card conversion failed", message);
      toast("error", message);
      return null;
    }
  }, [folderPath, log, toast, updateExistingCard]);

  const swapTextCardSource = useCallback(async (tile) => {
    if (!folderPath || !tile?.id || tile?.type !== "canvas-text") {
      return null;
    }

    const selectedPaths = await desktop.workspace.openFiles();
    const markdownPath = selectedPaths.find((candidate) => isMarkdownFilePath(candidate));

    if (!markdownPath) {
      toast("warn", "Pick a Markdown file.");
      return null;
    }

    try {
      const fileRecord = await resolveMarkdownSelection(markdownPath);
      const stickyDocument = tile?.variant === CANVAS_TEXT_VARIANT_STICKY
        ? deriveStickyNoteFileDocument(fileRecord.content, tile.title)
        : null;
      updateExistingCard(tile.id, {
        source: CANVAS_TEXT_SOURCE_FILE,
        file: fileRecord,
        title: stickyDocument ? stickyDocument.title : tile.title,
        text: stickyDocument ? stickyDocument.bodyText : fileRecord.content,
        titleMode: tile?.variant === CANVAS_TEXT_VARIANT_STICKY
          ? CANVAS_TEXT_TITLE_MODE_CUSTOM
          : CANVAS_TEXT_TITLE_MODE_DERIVED,
        updatedAt: nowIso(),
      });
      toast("success", "Note source swapped.");
      return fileRecord;
    } catch (error) {
      const message = error?.message || "Unable to swap the source file.";
      log("error", "Swap source file failed", message);
      toast("error", message);
      return null;
    }
  }, [folderPath, log, resolveMarkdownSelection, toast, updateExistingCard]);

  const openTextCardSource = useCallback(async (tile) => {
    if (!folderPath || tile?.type !== "canvas-text" || tile?.source !== CANVAS_TEXT_SOURCE_FILE || !tile?.file?.relativePath) {
      return false;
    }

    const item = await desktop.workspace.getItemForFilePath(folderPath, tile.file.relativePath).catch(() => null);
    if (!item?.filePath) {
      toast("error", "Source file no longer exists.");
      return false;
    }

    await desktop.workspace.openFile(item.filePath);
    return true;
  }, [folderPath, toast]);

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

    commitWorkspaceChange((current) => updateCurrentActivePage(current, (page) => ({
      ...page,
      cards: updateCards(page.cards, updatesById),
    })));
  }, [commitWorkspaceChange]);

  const createFolderTile = useCallback((preferredCenter = null) => {
    const centerPoint = preferredCenter ?? getViewportCenter();
    const timestamp = nowIso();
    const nextGroup = {
      id: crypto.randomUUID(),
      label: "Group",
      tileIds: [],
      x: Math.round(centerPoint.x - (GROUP_DEFAULT_WIDTH / 2)),
      y: Math.round(centerPoint.y - (GROUP_DEFAULT_HEIGHT / 2)),
      width: GROUP_DEFAULT_WIDTH,
      height: GROUP_DEFAULT_HEIGHT,
      color: "",
      background: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      airpaste: {
        variant: "group",
      },
    };

    commitWorkspaceChange((current) => updateCurrentActivePage(current, (page) => ({
      ...page,
      groups: [...(Array.isArray(page.groups) ? page.groups : []), nextGroup],
    })));

    log("success", "Created empty group", { groupId: nextGroup.id, centerPoint });
    toast("success", "Group created.");
    return nextGroup;
  }, [commitWorkspaceChange, getViewportCenter, log, toast]);

  const createFolderFromSelection = useCallback((tileIds, preferredCenter = null) => {
    const normalizedTileIds = Array.isArray(tileIds)
      ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
      : [];
    const centerPoint = preferredCenter ?? getViewportCenter();

    if (normalizedTileIds.length === 0) {
      return createFolderTile(centerPoint);
    }

    let createdGroup = null;

    commitWorkspaceChange((current) => {
      const activePage = getWorkspaceActivePage(current);
      const tileById = Object.fromEntries(activePage.cards.map((card) => [card.id, card]));
      const renderableEntries = getRenderableTileEntries(activePage.cards, tileById)
        .filter((entry) => normalizedTileIds.includes(entry.tile.id));
      const bounds = createGroupBoundsFromEntries(renderableEntries, centerPoint);
      const timestamp = nowIso();

      createdGroup = {
        id: crypto.randomUUID(),
        label: normalizedTileIds.length === 1 ? "Group" : `${normalizedTileIds.length} items`,
        tileIds: normalizedTileIds,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color: "",
        background: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        airpaste: {
          variant: "group",
        },
      };

      return updateCurrentActivePage(current, (page) => ({
        ...page,
        groups: [...(Array.isArray(page.groups) ? page.groups : []), createdGroup],
      }));
    });

    if (!createdGroup) {
      return null;
    }

    log("success", "Created group from selection", {
      groupId: createdGroup.id,
      tileIds: normalizedTileIds,
      count: normalizedTileIds.length,
    });
    toast("success", normalizedTileIds.length === 1 ? "1 tile grouped." : `${normalizedTileIds.length} tiles grouped.`);
    return createdGroup;
  }, [commitWorkspaceChange, createFolderTile, getViewportCenter, log, toast]);

  const moveGroups = useCallback((groupIds, delta) => {
    const normalizedGroupIds = Array.isArray(groupIds)
      ? [...new Set(groupIds.filter((groupId) => typeof groupId === "string" && groupId.trim().length > 0))]
      : [];

    if (normalizedGroupIds.length === 0 || (!delta?.x && !delta?.y)) {
      return;
    }

    commitWorkspaceChange((current) => updateCurrentActivePage(current, (page) => {
      const nextGroups = Array.isArray(page.groups) ? page.groups.map((group) => {
        if (!normalizedGroupIds.includes(group.id)) {
          return group;
        }

        return {
          ...group,
          x: group.x + delta.x,
          y: group.y + delta.y,
          updatedAt: nowIso(),
        };
      }) : [];

      const movedTileIdSet = new Set(
        nextGroups
          .filter((group) => normalizedGroupIds.includes(group.id))
          .flatMap((group) => Array.isArray(group.tileIds) ? group.tileIds : []),
      );
      const nextCards = page.cards.map((card) => (
        movedTileIdSet.has(card.id)
          ? {
            ...card,
            x: card.x + delta.x,
            y: card.y + delta.y,
            updatedAt: nowIso(),
          }
          : card
      ));

      return {
        ...page,
        cards: nextCards,
        groups: nextGroups,
      };
    }));
  }, [commitWorkspaceChange]);

  const deleteGroups = useCallback((groupIds) => {
    const normalizedGroupIds = Array.isArray(groupIds)
      ? [...new Set(groupIds.filter((groupId) => typeof groupId === "string" && groupId.trim().length > 0))]
      : [];

    if (normalizedGroupIds.length === 0) {
      return;
    }

    commitWorkspaceChange((current) => updateCurrentActivePage(current, (page) => ({
      ...page,
      groups: (Array.isArray(page.groups) ? page.groups : []).filter((group) => !normalizedGroupIds.includes(group.id)),
    })));

    log("info", "Deleted selected groups", { groupIds: normalizedGroupIds, count: normalizedGroupIds.length });
    toast("success", normalizedGroupIds.length === 1 ? "Group deleted." : `${normalizedGroupIds.length} groups deleted.`);
  }, [commitWorkspaceChange, log, toast]);

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
      const activePage = getWorkspaceActivePage(current);
      const result = addTileToRack(activePage.cards, tileId, rackId, slotIndex);

      if (!result?.rackCard) {
        return current;
      }

      nextRackCard = result.rackCard;
      return updateCurrentActivePage(current, (page) => ({
        ...page,
        cards: result.cards,
      }));
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
      const activePage = getWorkspaceActivePage(current);
      let nextCards = activePage.cards;

      normalizedTileIds.forEach((tileId) => {
        const result = addTileToRack(nextCards, tileId, rackId);

        if (result?.rackCard) {
          nextCards = result.cards;
          nextRackCard = result.rackCard;
        }
      });

      return nextRackCard
        ? updateCurrentActivePage(current, (page) => ({
          ...page,
          cards: nextCards,
        }))
        : current;
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
      commitWorkspaceChange((current) => updateCurrentActivePage(current, (page) => ({
        ...page,
        cards: normalizedIds.reduce((nextCards, tileId) => removeCard(nextCards, tileId), page.cards),
      })));
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
    if (
      !tile?.id
      || tile?.type !== "link"
      || tile?.contentKind !== LINK_CONTENT_KIND_IMAGE
      || !Number.isFinite(mediaWidth)
      || !Number.isFinite(mediaHeight)
      || mediaWidth <= 0
      || mediaHeight <= 0
    ) {
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
    if (tile?.type === FILE_CARD_TYPE) {
      const relativePath = tile.file?.relativePath ?? "";

      if (!folderPath || !relativePath) {
        throw new Error("Invalid file");
      }

      const item = await desktop.workspace.getItemForFilePath(folderPath, relativePath);

      if (!item?.filePath) {
        throw new Error("File no longer exists");
      }

      await desktop.workspace.openFile(item.filePath);
      return;
    }

    if (!tile?.url) {
      return;
    }

    const externalUrl = normalizeExternalUrl(tile.url);

    if (!externalUrl) {
      throw new Error("Invalid link");
    }

    await desktop.shell.openExternal(externalUrl);
  }, [folderPath]);

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
          mediaAspectRatio: pastedImage.width > 0 && pastedImage.height > 0
            ? (pastedImage.width / pastedImage.height)
            : null,
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
        createdFileCount: 0,
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
        createdFileCount: 0,
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
    let createdFileCount = 0;
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

      if (entry.intent === "import-file") {
        try {
          const importedFiles = await desktop.workspace.importFiles(folderPath, [entry.item.sourcePath], "");
          const importedFile = Array.isArray(importedFiles) ? importedFiles[0] : null;
          const relativePath = importedFile?.path ?? "";
          const fileName = getPathFileName(importedFile?.filePath || relativePath || entry.item.name) || entry.item.name;
          const extension = getFileExtensionLabel(fileName, entry.item.extension);

          if (!relativePath) {
            throw new Error(`Unable to import "${entry.item.name}".`);
          }

          createdCards.push(createFileCard(workspace.cards.concat(createdCards), workspace.viewport, preferredCenter, {
            title: fileName,
            file: {
              relativePath,
              fileName,
              extension,
              mimeType: entry.item.mimeType,
              sizeBytes: entry.item.sizeBytes,
            },
          }));
          createdFileCount += 1;
        } catch (importError) {
          const detail = importError?.message || `Unable to import "${entry.item.name}".`;
          rejectedItems.push({
            item: entry.item,
            reason: "file-import-failed",
            detail,
          });
          log("error", "File import failed", detail);
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
      commitWorkspaceChange((current) => updateCurrentActivePage(current, (page) => ({
        ...page,
        cards: [...page.cards, ...createdCards],
      })));
      previewQueue.forEach((tile) => {
        void queueLinkPreview(tile);
      });
    }

    const successMessage = formatDropSuccessMessage(createdImageCount, createdFileCount, createdBookmarkCount);

    if (successMessage) {
      log("success", "Drop import completed", {
        createdImageCount,
        createdFileCount,
        createdBookmarkCount,
      });
      toast("success", successMessage);
    }

    const rejectionMessage = formatDropRejectionMessage(rejectedItems);

    if (rejectionMessage) {
      log("warn", "Drop import completed with rejections", rejectionMessage);
      toast(createdImageCount + createdFileCount + createdBookmarkCount > 0 ? "warn" : "error", rejectionMessage);
    }

    return {
      createdImageCount,
      createdFileCount,
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
    createCalendar,
    createChecklist,
    createCode,
    createCounter,
    createDeadline,
    createNote,
    createTextCard,
    createProgress,
    createRack,
    createTable,
    createTextBox,
    createSticky,
    addNoteFromVault,
    convertTextCardToFile,
    openTextCardSource,
    swapTextCardSource,
    createLinkFromClipboard,
    createFolderTile,
    createFolderFromSelection,
    addTileToRack: addTileToRackCommand,
    addTilesToRack: addTilesToRackCommand,
    removeTileFromRack: removeTileFromRackCommand,
    deleteTile,
    deleteTiles,
    deleteGroups,
    openTileLink,
    openWorkspaceFolder,
    pasteFromClipboard,
    queueLinkPreview,
    moveTiles,
    moveGroups,
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
    createCalendar,
    createChecklist,
    createCode,
    createCounter,
    createDeadline,
    createNote,
    createTextCard,
    createProgress,
    createRack,
    createTable,
    createTextBox,
    createSticky,
    addNoteFromVault,
    convertTextCardToFile,
    openTextCardSource,
    swapTextCardSource,
    createLinkFromClipboard,
    createFolderTile,
    createFolderFromSelection,
    deleteTile,
    deleteTiles,
    deleteGroups,
    openTileLink,
    openWorkspaceFolder,
    pasteFromClipboard,
    importResolvedDrop,
    queueLinkPreview,
    moveTiles,
    moveGroups,
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
