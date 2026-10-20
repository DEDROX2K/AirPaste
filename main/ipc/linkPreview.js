const { app, ipcMain } = require("electron");
const path = require("node:path");
const workspaceService = require("../../workspace-service");
const { getCardStateFromResolvedPreview } = require("../../preview/card-mapper");
const { PREVIEW_STATE_VALUES } = require("../../preview/constants");
const context = require("../context");
const { nowIso } = require("../fsUtils");
const { withWorkspaceQueue } = require("../workspaceQueue");

// NOTE: this module owns the *completion* side of link-preview resolution
// (turning a resolved preview result into an updated card on disk, with
// concurrency control and cancellation). The actual scraping/resolution
// implementation (OG tags, Amazon/Spotify/YouTube/Twitter providers, the
// headless-screenshot fallback) lives in ../../preview/* and is loaded
// dynamically below via getPreviewResolverModule() -- NOT reimplemented here.
//
// An older, now-fully-superseded inline scraping pipeline used to live in
// main.js alongside this code (fetchOpenGraphMetadata, fetchAmazonProductPreview,
// capturePreviewScreenshot, and ~50 related helpers, roughly 1300 lines). It
// was confirmed dead via a call-graph reachability check from every IPC
// handler and app-lifecycle hook before this refactor and was removed rather
// than relocated -- see the Phase 2A commit for how that was verified.

const NOTE_FOLDER_CARD_TYPE = "note-folder";
const FOLDER_CARD_TYPE = "folder";
const RACK_CARD_TYPE = "rack";
const FILE_CARD_TYPE = "file";
const AMAZON_PRODUCT_CARD_TYPE = "amazon-product";
const LINK_CONTENT_KIND_BOOKMARK = "bookmark";
const LINK_CONTENT_KIND_IMAGE = "image";
const NOTE_STYLE_TWO = "notes-2";
const NOTE_STYLE_THREE = "notes-3";
const NOTE_FOLDER_DEFAULT_TITLE = "Daily memo";
const NOTE_FOLDER_DEFAULT_DESCRIPTION = "Notes & Journaling";
const IMAGE_CARD_PORTRAIT_MAX_HEIGHT = 540;
const IMAGE_CARD_FIXED_WIDTH = 240;
const PREVIEW_JOB_CONCURRENCY = 4;
// During filesystem v2 stabilization, preview resolution must not mutate
// workspace files through legacy workspace-document assumptions.
const STORAGE_V2_STABILIZATION = false;

const previewJobs = new Map();
const cancelledPreviewJobs = new Set();
const previewExecutionQueue = [];
let activePreviewExecutionCount = 0;
let previewResolverModule = null;

function isPreviewJobDebugEnabled() {
  return process.env.NODE_ENV !== "production"
    || String(process.env.AIRPASTE_PREVIEW_DEBUG ?? "").trim() === "1";
}

function logPreviewJob(event, payload = {}) {
  if (!isPreviewJobDebugEnabled()) {
    return;
  }

  console.debug(`[preview:job] ${event}`, payload);
}

function clearPreviewResolverModuleCache() {
  const previewModuleRoot = `${path.join(__dirname, "..", "..", "preview")}${path.sep}`;

  Object.keys(require.cache).forEach((cacheKey) => {
    if (cacheKey.startsWith(previewModuleRoot)) {
      delete require.cache[cacheKey];
    }
  });
}

function getPreviewResolverModule() {
  const shouldHotReloadPreviewModules = !app.isPackaged;

  if (previewResolverModule !== null && !shouldHotReloadPreviewModules) {
    return previewResolverModule;
  }

  try {
    if (shouldHotReloadPreviewModules) {
      clearPreviewResolverModuleCache();
    }

    previewResolverModule = require("../../preview/resolve-preview");
  } catch (error) {
    previewResolverModule = undefined;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[preview] resolve-preview module unavailable", error?.message || error);
    }
  }

  return previewResolverModule;
}

function isFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function defaultCardSize(type) {
  if (type === FILE_CARD_TYPE) {
    return { width: 344, height: 436 };
  }

  if (type === "link") {
    return { width: 340, height: 280 };
  }

  if (type === AMAZON_PRODUCT_CARD_TYPE) {
    return { width: 340, height: 388 };
  }

  if (type === RACK_CARD_TYPE) {
    return { width: 694, height: 126 };
  }

  if (type === FOLDER_CARD_TYPE) {
    return { width: 320, height: 220 };
  }

  if (type === NOTE_FOLDER_CARD_TYPE) {
    return { width: 360, height: 284 };
  }

  return { width: 428, height: 540 };
}

function getImageCardSizeFromAspectRatio(aspectRatio) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return null;
  }

  let width = IMAGE_CARD_FIXED_WIDTH;
  let height = IMAGE_CARD_FIXED_WIDTH / aspectRatio;

  if (height > IMAGE_CARD_PORTRAIT_MAX_HEIGHT) {
    height = IMAGE_CARD_PORTRAIT_MAX_HEIGHT;
    width = height * aspectRatio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

function getNormalizedImageLinkDimensions(cardWidth, cardHeight, fallbackSize, contentKind, asset, mediaAspectRatio) {
  const width = isFiniteNumber(cardWidth, fallbackSize.width);
  const height = isFiniteNumber(cardHeight, fallbackSize.height);
  const isDefaultLinkSize = Math.abs(width - fallbackSize.width) <= 1 && Math.abs(height - fallbackSize.height) <= 1;

  if (contentKind !== LINK_CONTENT_KIND_IMAGE || !isDefaultLinkSize) {
    return { width, height };
  }

  const derivedAspectRatio = Number.isFinite(mediaAspectRatio) && mediaAspectRatio > 0
    ? mediaAspectRatio
    : (asset && Number.isFinite(asset.width) && Number.isFinite(asset.height) && asset.width > 0 && asset.height > 0
      ? (asset.width / asset.height)
      : null);
  const normalizedSize = getImageCardSizeFromAspectRatio(derivedAspectRatio);

  return normalizedSize ?? { width, height };
}

function defaultTextCardSize(noteStyle) {
  if (noteStyle === NOTE_STYLE_THREE) {
    return { width: 452, height: 468 };
  }

  return { width: 428, height: 540 };
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function getCardType(card) {
  if (card?.type === FILE_CARD_TYPE) {
    return FILE_CARD_TYPE;
  }

  if (card?.type === "link") {
    return "link";
  }

  if (card?.type === AMAZON_PRODUCT_CARD_TYPE) {
    return AMAZON_PRODUCT_CARD_TYPE;
  }

  if (card?.type === RACK_CARD_TYPE) {
    return RACK_CARD_TYPE;
  }

  if (card?.type === FOLDER_CARD_TYPE) {
    return FOLDER_CARD_TYPE;
  }

  if (card?.type === NOTE_FOLDER_CARD_TYPE) {
    return NOTE_FOLDER_CARD_TYPE;
  }

  return "text";
}

function normalizeLinkContentKind(contentKind, asset = null) {
  if (contentKind === LINK_CONTENT_KIND_IMAGE) {
    return LINK_CONTENT_KIND_IMAGE;
  }

  if (asset?.relativePath) {
    return LINK_CONTENT_KIND_IMAGE;
  }

  return LINK_CONTENT_KIND_BOOKMARK;
}

function isLinkLikeCardType(type) {
  return type === "link" || type === AMAZON_PRODUCT_CARD_TYPE;
}

function normalizeLinkAsset(asset) {
  if (!asset || typeof asset !== "object") {
    return null;
  }

  const relativePath = typeof asset.relativePath === "string" ? asset.relativePath.trim() : "";

  if (!relativePath) {
    return null;
  }

  return {
    relativePath,
    fileName: typeof asset.fileName === "string" ? asset.fileName : "",
    mimeType: typeof asset.mimeType === "string" ? asset.mimeType : "",
    sizeBytes: Number.isFinite(asset.sizeBytes) ? Math.max(0, asset.sizeBytes) : 0,
    width: Number.isFinite(asset.width) ? Math.max(0, asset.width) : 0,
    height: Number.isFinite(asset.height) ? Math.max(0, asset.height) : 0,
  };
}

function normalizeFileExtension(value) {
  return typeof value === "string" ? value.trim().replace(/^\.+/, "").toLowerCase() : "";
}

function normalizeFileAttachment(file) {
  if (!file || typeof file !== "object") {
    return null;
  }

  const relativePath = typeof file.relativePath === "string" ? file.relativePath.trim() : "";

  if (!relativePath) {
    return null;
  }

  const fileName = typeof file.fileName === "string" ? file.fileName.trim() : "";
  const extension = normalizeFileExtension(
    typeof file.extension === "string" && file.extension.trim().length > 0
      ? file.extension
      : fileName.split(".").pop(),
  );

  return {
    relativePath,
    fileName,
    extension,
    mimeType: typeof file.mimeType === "string" ? file.mimeType : "",
    sizeBytes: Number.isFinite(file.sizeBytes) ? Math.max(0, file.sizeBytes) : 0,
  };
}

function normalizePreviewDiagnostics(previewDiagnostics) {
  if (!previewDiagnostics || typeof previewDiagnostics !== "object" || Array.isArray(previewDiagnostics)) {
    return null;
  }

  return JSON.parse(JSON.stringify(previewDiagnostics));
}

function stripNoteLine(line) {
  return String(line ?? "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^(?:[-*•]\s*)?\[(?:\s|x|X)\]\s+/, "")
    .replace(/^(?:[-*•]\s+)/, "")
    .trim();
}

function getTextCardHeadline(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(stripNoteLine)
    .find(Boolean) ?? "";
}

function normalizeFolderNote(note, index = 0) {
  const createdAt = typeof note?.createdAt === "string" ? note.createdAt : nowIso();
  const updatedAt = typeof note?.updatedAt === "string" ? note.updatedAt : createdAt;

  return {
    id: typeof note?.id === "string" ? note.id : `note-${index}-${Date.now()}`,
    text: String(note?.text ?? ""),
    secondaryText: String(note?.secondaryText ?? ""),
    noteStyle: typeof note?.noteStyle === "string" ? note.noteStyle : NOTE_STYLE_TWO,
    quoteAuthor: String(note?.quoteAuthor ?? ""),
    createdAt,
    updatedAt,
  };
}

function normalizeFolderNotes(notes) {
  return Array.isArray(notes)
    ? notes.map((note, index) => normalizeFolderNote(note, index))
    : [];
}

function getFolderTitleFromNotes(notes) {
  return firstString(
    ...notes.map((note) => getTextCardHeadline(note.text)),
    NOTE_FOLDER_DEFAULT_TITLE,
  );
}

function normalizeCard(card, index = 0) {
  const type = getCardType(card);
  const isLinkLikeCard = isLinkLikeCardType(type);
  const linkAsset = type === "link" ? normalizeLinkAsset(card?.asset) : null;
  const file = type === FILE_CARD_TYPE ? normalizeFileAttachment(card?.file) : null;
  const contentKind = isLinkLikeCard
    ? normalizeLinkContentKind(card?.contentKind, linkAsset)
    : "";
  const noteStyle = type === "text" && typeof card?.noteStyle === "string"
    ? card.noteStyle
    : NOTE_STYLE_TWO;
  const size = type === "text" ? defaultTextCardSize(noteStyle) : defaultCardSize(type);
  const rawMediaAspectRatio = isLinkLikeCard && Number.isFinite(card?.mediaAspectRatio) && card.mediaAspectRatio > 0
    ? Number(card.mediaAspectRatio)
    : (linkAsset && Number.isFinite(linkAsset.width) && Number.isFinite(linkAsset.height) && linkAsset.width > 0 && linkAsset.height > 0
      ? (linkAsset.width / linkAsset.height)
      : null);
  const normalizedLinkDimensions = isLinkLikeCard
    ? getNormalizedImageLinkDimensions(card?.width, card?.height, size, contentKind, linkAsset, rawMediaAspectRatio)
    : null;
  const createdAt = typeof card?.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card?.updatedAt === "string" ? card.updatedAt : createdAt;
  const notes = type === NOTE_FOLDER_CARD_TYPE ? normalizeFolderNotes(card?.notes) : [];
  const tileIds = type === RACK_CARD_TYPE
    ? (Array.isArray(card?.tileIds)
      ? card.tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0)
      : [])
    : [];
  const minSlots = type === RACK_CARD_TYPE
    ? Math.max(3, isFiniteNumber(card?.minSlots, 3))
    : null;
  const childIds = type === FOLDER_CARD_TYPE
    ? (Array.isArray(card?.childIds)
      ? card.childIds.filter((childId) => typeof childId === "string" && childId.trim().length > 0)
      : [])
    : [];

  return {
    id: typeof card?.id === "string" ? card.id : `card-${index}-${Date.now()}`,
    type,
    x: isFiniteNumber(card?.x, 120 + (index % 3) * 28),
    y: isFiniteNumber(card?.y, 120 + index * 24),
    width: normalizedLinkDimensions?.width ?? isFiniteNumber(card?.width, size.width),
    height: normalizedLinkDimensions?.height ?? isFiniteNumber(card?.height, size.height),
    text: type === "text" ? String(card?.text ?? "") : "",
    secondaryText: type === "text" ? String(card?.secondaryText ?? "") : "",
    noteStyle: type === "text" ? noteStyle : "",
    quoteAuthor: type === "text" ? String(card?.quoteAuthor ?? "") : "",
    url: isLinkLikeCard ? String(card?.url ?? "") : "",
    contentKind,
    title: isLinkLikeCard
      ? String(card?.title ?? "")
      : type === FILE_CARD_TYPE
        ? firstString(card?.title, file?.fileName, "Untitled file")
      : type === RACK_CARD_TYPE
        ? firstString(card?.title, "Rack")
        : type === FOLDER_CARD_TYPE
          ? firstString(card?.title, "Folder")
          : type === NOTE_FOLDER_CARD_TYPE
            ? firstString(card?.title, getFolderTitleFromNotes(notes), NOTE_FOLDER_DEFAULT_TITLE)
            : "",
    description: isLinkLikeCard
      ? String(card?.description ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.description, "Mounted display rack")
        : type === FOLDER_CARD_TYPE
          ? firstString(card?.description, "Grouped tiles")
          : type === NOTE_FOLDER_CARD_TYPE
            ? firstString(card?.description, NOTE_FOLDER_DEFAULT_DESCRIPTION)
            : "",
    image: isLinkLikeCard ? String(card?.image ?? "") : "",
    favicon: isLinkLikeCard ? String(card?.favicon ?? "") : "",
    siteName: isLinkLikeCard ? String(card?.siteName ?? "") : "",
    resolvedUrl: isLinkLikeCard ? String(card?.resolvedUrl ?? card?.url ?? "") : "",
    previewStatus: isLinkLikeCard ? String(card?.previewStatus ?? card?.status ?? "") : "",
    contentType: isLinkLikeCard ? String(card?.contentType ?? "link") : "",
    sourceType: isLinkLikeCard ? String(card?.sourceType ?? "generic-link") : "",
    duration: isLinkLikeCard && Number.isFinite(card?.duration) ? Math.max(0, Math.round(card.duration)) : null,
    author: isLinkLikeCard ? String(card?.author ?? "") : "",
    channelName: isLinkLikeCard ? String(card?.channelName ?? "") : "",
    mediaAspectRatio: rawMediaAspectRatio,
    previewKind: isLinkLikeCard && card?.previewKind === "music" ? "music" : "default",
    previewError: isLinkLikeCard ? String(card?.previewError ?? "") : "",
    status: isLinkLikeCard && PREVIEW_STATE_VALUES.includes(card?.status)
      ? card.status
      : "idle",
    previewDiagnostics: isLinkLikeCard ? normalizePreviewDiagnostics(card?.previewDiagnostics) : null,
    previewMode: isLinkLikeCard && card?.previewMode === "webclip" ? "webclip" : "standard",
    webclipImagePath: isLinkLikeCard ? String(card?.webclipImagePath ?? "") : "",
    webclipAspectRatio: isLinkLikeCard && Number.isFinite(card?.webclipAspectRatio) && card.webclipAspectRatio > 0
      ? Number(card.webclipAspectRatio)
      : null,
    webclipPreviousHeight: isLinkLikeCard && Number.isFinite(card?.webclipPreviousHeight)
      ? Number(card.webclipPreviousHeight)
      : null,
    webclipStatus: isLinkLikeCard && ["idle", "capturing", "ready", "error"].includes(card?.webclipStatus)
      ? card.webclipStatus
      : "idle",
    asset: type === "link" ? linkAsset : null,
    file,
    productAsin: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productAsin ?? "") : "",
    productPrice: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productPrice ?? "") : "",
    productDomain: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productDomain ?? "") : "",
    productRating: type === AMAZON_PRODUCT_CARD_TYPE && Number.isFinite(card?.productRating)
      ? Number(card.productRating)
      : null,
    productReviewCount: type === AMAZON_PRODUCT_CARD_TYPE && Number.isFinite(card?.productReviewCount)
      ? Math.max(0, Math.round(card.productReviewCount))
      : null,
    tileIds,
    minSlots,
    childIds,
    childLayouts: type === FOLDER_CARD_TYPE && card?.childLayouts && typeof card.childLayouts === "object"
      ? card.childLayouts
      : {},
    parentRackId: type !== RACK_CARD_TYPE && typeof card?.parentRackId === "string" && card.parentRackId.trim().length > 0
      ? card.parentRackId
      : null,
    rackIndex: type !== RACK_CARD_TYPE && Number.isFinite(card?.rackIndex)
      ? Math.max(0, Math.round(card.rackIndex))
      : null,
    notes,
    createdAt,
    updatedAt,
  };
}

async function loadPreviewWorkspaceTarget(folderPath, canvasFilePath = "") {
  const requestedCanvasPath = typeof canvasFilePath === "string" ? canvasFilePath.trim() : "";

  if (requestedCanvasPath) {
    try {
      const loadedCanvas = await workspaceService.loadCanvas(requestedCanvasPath);
      return {
        workspace: loadedCanvas.workspace,
        canvasFilePath: loadedCanvas.filePath,
      };
    } catch (error) {
      console.warn("[preview] canvas-load-fallback", {
        folderPath,
        canvasFilePath: requestedCanvasPath,
        message: error?.message || "Unable to load requested canvas for preview update",
      });
    }
  }

  return {
    workspace: await workspaceService.readWorkspaceDocument(folderPath),
    canvasFilePath: "",
  };
}

async function savePreviewWorkspaceTarget(folderPath, workspace, canvasFilePath = "") {
  const targetCanvasPath = typeof canvasFilePath === "string" ? canvasFilePath.trim() : "";

  if (targetCanvasPath) {
    await workspaceService.saveCanvas(targetCanvasPath, workspace);
    return;
  }

  await workspaceService.saveWorkspace(folderPath, workspace);
}

function pumpPreviewExecutionQueue() {
  while (activePreviewExecutionCount < PREVIEW_JOB_CONCURRENCY && previewExecutionQueue.length > 0) {
    const next = previewExecutionQueue.shift();

    if (!next) {
      break;
    }

    activePreviewExecutionCount += 1;
    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        activePreviewExecutionCount = Math.max(0, activePreviewExecutionCount - 1);
        pumpPreviewExecutionQueue();
      });
  }
}

function withPreviewExecutionSlot(task) {
  return new Promise((resolve, reject) => {
    previewExecutionQueue.push({ task, resolve, reject });
    pumpPreviewExecutionQueue();
  });
}

function createPreviewFailureDiagnostics(error, currentCard = null) {
  const existingDiagnostics = currentCard?.previewDiagnostics && typeof currentCard.previewDiagnostics === "object"
    ? currentCard.previewDiagnostics
    : {};
  const failureMessage = error?.message || "Preview resolution failed";
  const existingErrors = Array.isArray(existingDiagnostics.errors)
    ? existingDiagnostics.errors.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    : [];

  return {
    ...existingDiagnostics,
    fallbackUsed: true,
    fallbackReason: existingDiagnostics.fallbackReason || "preview-resolution-failed",
    finalPreviewStatus: "error",
    errors: [...existingErrors, failureMessage],
    warnings: Array.isArray(existingDiagnostics.warnings) ? existingDiagnostics.warnings : [],
  };
}

function getWorkspacePages(workspace) {
  if (Array.isArray(workspace?.pages) && workspace.pages.length > 0) {
    return workspace.pages;
  }

  return [{
    id: typeof workspace?.activePageId === "string" ? workspace.activePageId : "page-1",
    name: "Page 1",
    tiles: Array.isArray(workspace?.cards) ? workspace.cards : [],
    viewport: workspace?.viewport ?? { x: 180, y: 120, zoom: 1 },
    drawings: workspace?.drawings ?? { version: 1, objects: [] },
    edges: Array.isArray(workspace?.edges) ? workspace.edges : [],
    groups: Array.isArray(workspace?.groups) ? workspace.groups : [],
    view: workspace?.view ?? null,
  }];
}

function updateWorkspaceCardAcrossPages(workspace, cardId, updater, cardSnapshot = null) {
  const pages = getWorkspacePages(workspace);
  let matchedPageId = null;
  let nextCard = null;

  const nextPages = pages.map((page, pageIndex) => {
    const tileKey = Array.isArray(page.tiles) ? "tiles" : "cards";
    const cards = Array.isArray(page[tileKey]) ? page[tileKey] : [];
    let cardIndex = cards.findIndex((card) => card.id === cardId);
    let nextCards = cards;

    if (cardIndex === -1 && cardSnapshot && matchedPageId === null) {
      const placeholderCard = normalizeCard(cardSnapshot, cards.length);
      nextCards = [...cards, placeholderCard];
      cardIndex = nextCards.length - 1;
    }

    if (cardIndex === -1) {
      return page;
    }

    const currentCard = nextCards[cardIndex];
    nextCard = updater(currentCard, page, pageIndex);
    const cardsWithUpdate = [...nextCards];
    cardsWithUpdate.splice(cardIndex, 1, nextCard);
    matchedPageId = page.id;
    return {
      ...page,
      [tileKey]: cardsWithUpdate,
    };
  });

  if (!matchedPageId || !nextCard) {
    return null;
  }

  return {
    workspace: {
      ...workspace,
      activePageId: typeof workspace?.activePageId === "string" ? workspace.activePageId : matchedPageId,
      pages: nextPages,
    },
    pageId: matchedPageId,
    card: nextCard,
  };
}

async function updateCardPreview(folderPath, cardId, url, cardSnapshot, resolvedPreview, canvasFilePath = "") {
  if (STORAGE_V2_STABILIZATION) {
    return null;
  }

  const jobKey = `${folderPath}:${cardId}`;

  if (cancelledPreviewJobs.has(jobKey)) {
    return null;
  }

  const previewTarget = await loadPreviewWorkspaceTarget(folderPath, canvasFilePath);
  const nextState = updateWorkspaceCardAcrossPages(
    previewTarget.workspace,
    cardId,
    (currentCard) => {
      const previewCardState = getCardStateFromResolvedPreview(
        currentCard,
        resolvedPreview,
        defaultCardSize,
      );

      return normalizeCard({
        ...currentCard,
        ...previewCardState,
        updatedAt: nowIso(),
      });
    },
    cancelledPreviewJobs.has(jobKey) ? null : cardSnapshot,
  );

  if (!nextState) {
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("[preview] final-mapped-card", {
      cardId,
      url,
      card: nextState.card,
    });
  }

  await savePreviewWorkspaceTarget(folderPath, nextState.workspace, previewTarget.canvasFilePath);
  logPreviewJob("tile-state-updated", {
    folderPath,
    canvasFilePath: previewTarget.canvasFilePath || canvasFilePath || "",
    cardId,
    status: nextState.card.status,
    previewStatus: nextState.card.previewStatus,
  });

  const mainWindow = context.mainWindow;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("airpaste:previewUpdated", {
      folderPath,
      canvasFilePath: previewTarget.canvasFilePath || canvasFilePath || "",
      pageId: nextState.pageId,
      card: nextState.card,
    });
  }

  return nextState.card;
}

async function markCardPreviewFailed(folderPath, cardId, url, cardSnapshot, error, canvasFilePath = "") {
  if (STORAGE_V2_STABILIZATION) {
    return null;
  }

  const previewTarget = await loadPreviewWorkspaceTarget(folderPath, canvasFilePath);
  const nextState = updateWorkspaceCardAcrossPages(
    previewTarget.workspace,
    cardId,
    (currentCard) => {
      const failureMessage = error?.message || "Preview resolution failed";

      return normalizeCard({
        ...currentCard,
        status: "error",
        previewStatus: "error",
        previewError: failureMessage,
        previewDiagnostics: createPreviewFailureDiagnostics(error, currentCard),
        updatedAt: nowIso(),
      });
    },
    cardSnapshot,
  );

  if (!nextState) {
    return null;
  }

  await savePreviewWorkspaceTarget(folderPath, nextState.workspace, previewTarget.canvasFilePath);
  logPreviewJob("tile-state-updated", {
    folderPath,
    canvasFilePath: previewTarget.canvasFilePath || canvasFilePath || "",
    cardId,
    status: nextState.card.status,
    previewStatus: nextState.card.previewStatus,
    failed: true,
  });

  const mainWindow = context.mainWindow;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("airpaste:previewUpdated", {
      folderPath,
      canvasFilePath: previewTarget.canvasFilePath || canvasFilePath || "",
      pageId: nextState.pageId,
      card: nextState.card,
    });
  }

  return nextState.card;
}

function registerIpc() {
  ipcMain.handle("airpaste:getPreviewCapabilities", async () => {
    return {
      enabled: !STORAGE_V2_STABILIZATION,
    };
  });

  ipcMain.handle("airpaste:fetchLinkPreview", async (_event, folderPath, cardId, url, cardSnapshot, canvasFilePath = "") => {
    if (STORAGE_V2_STABILIZATION) {
      return {
        queued: false,
        disabled: true,
      };
    }

    if (!folderPath || !cardId || !url) {
      return { queued: false };
    }

    const jobKey = `${folderPath}:${cardId}`;
    cancelledPreviewJobs.delete(jobKey);

    if (previewJobs.has(jobKey)) {
      return { queued: false };
    }

    logPreviewJob("queued", {
      folderPath,
      canvasFilePath,
      cardId,
      url,
      activeJobs: activePreviewExecutionCount,
      queuedJobs: previewExecutionQueue.length,
    });

    const job = withPreviewExecutionSlot(async () => {
      logPreviewJob("started", {
        folderPath,
        canvasFilePath,
        cardId,
        url,
        activeJobs: activePreviewExecutionCount,
        queuedJobs: previewExecutionQueue.length,
      });

      const previewResolver = getPreviewResolverModule();
      if (!previewResolver?.resolveUrlToPreview) {
        throw new Error("Preview resolver is unavailable in this build.");
      }

      const resolvedPreview = await previewResolver.resolveUrlToPreview(url);

      if (cancelledPreviewJobs.has(jobKey)) {
        logPreviewJob("cancelled", {
          folderPath,
          canvasFilePath,
          cardId,
          url,
        });
        return null;
      }

      const nextCard = await withWorkspaceQueue(
        folderPath,
        () => updateCardPreview(folderPath, cardId, url, cardSnapshot, resolvedPreview, canvasFilePath),
      );

      logPreviewJob("completed", {
        folderPath,
        canvasFilePath,
        cardId,
        url,
        status: nextCard?.status || "",
        previewStatus: nextCard?.previewStatus || "",
      });

      return nextCard;
    })
      .catch(async (error) => {
        console.error("[preview] queued-job-error", {
          folderPath,
          cardId,
          url,
          message: error?.message || "Preview resolution failed",
        });
        logPreviewJob("failed", {
          folderPath,
          canvasFilePath,
          cardId,
          url,
          message: error?.message || "Preview resolution failed",
        });

        try {
          await withWorkspaceQueue(
            folderPath,
            () => markCardPreviewFailed(folderPath, cardId, url, cardSnapshot, error, canvasFilePath),
          );
        } catch (secondaryError) {
          console.error("[preview] queued-job-error:failure-state-write-failed", {
            folderPath,
            cardId,
            message: secondaryError?.message || "Unable to persist preview failure",
          });
        }

        return null;
      })
      .finally(() => {
        previewJobs.delete(jobKey);
      });

    previewJobs.set(jobKey, job);

    return { queued: true };
  });

  ipcMain.handle("airpaste:cancelLinkPreview", async (_event, folderPath, cardId) => {
    if (!folderPath || !cardId) {
      return { cancelled: false };
    }

    cancelledPreviewJobs.add(`${folderPath}:${cardId}`);
    return { cancelled: true };
  });
}

async function closePreviewBrowserOnQuit() {
  const previewResolver = getPreviewResolverModule();
  await previewResolver?.closePreviewBrowser?.();
}

module.exports = {
  closePreviewBrowserOnQuit,
  registerIpc,
};
