/* global crypto, module, require */
const fs = require("node:fs/promises");
const path = require("node:path");

const LEGACY_DATA_FILE_NAME = "data.json";
const PHASE_ONE_WORKSPACE_FILE_NAME = "workspace.json";
const WORKSPACE_METADATA_FILE_NAME = "airpaste.json";
const INTERNAL_DIRECTORY_NAME = ".airpaste";
const INDEX_FILE_NAME = "index.json";
const UI_STATE_FILE_NAME = "ui-state.json";
const PREVIEWS_DIRECTORY_NAME = "previews";
const PROJECTS_DIRECTORY_NAME = "projects";
const PROJECT_FILE_NAME = "project.json";
const SPACES_DIRECTORY_NAME = "spaces";
const SPACE_FILE_NAME = "space.json";
const CANVASES_DIRECTORY_NAME = "canvases";
const PAGES_DIRECTORY_NAME = "pages";
const TEMP_SUFFIX = ".tmp";
const BACKUP_SUFFIX = ".bak";

const ROOT_METADATA_VERSION = 2;
const INDEX_METADATA_VERSION = 4;
const UI_STATE_VERSION = 2;
const PROJECT_METADATA_VERSION = 1;
const SPACE_METADATA_VERSION = 1;
const CANVAS_FILE_VERSION = 1;
const WORKSPACE_SCHEMA_VERSION = 4;
const MAX_RECENT_ITEMS = 25;

const DEFAULT_PROJECT_NAME = "Untitled Project";
const DEFAULT_SPACE_NAME = "Main Space";
const DEFAULT_CANVAS_NAME = "Main Canvas";
const DEFAULT_PAGE_NAME = "Untitled Page";

const DEFAULT_RENDERER_WORKSPACE = Object.freeze({
  version: WORKSPACE_SCHEMA_VERSION,
  viewport: {
    x: 180,
    y: 120,
    zoom: 1,
  },
  cards: [],
});

const DEFAULT_INDEX_METADATA = Object.freeze({
  version: INDEX_METADATA_VERSION,
  workspace: {
    name: "",
    createdAt: null,
    updatedAt: null,
  },
  projects: [],
  spaces: [],
  items: [],
  recentItemIds: [],
  starredItemIds: [],
});

const DEFAULT_UI_STATE = Object.freeze({
  version: UI_STATE_VERSION,
  lastOpenedProjectId: null,
  lastOpenedSpaceId: null,
  lastOpenedItemId: null,
  homeView: "grid",
  sortBy: "updatedAt",
  filter: "all",
  homeMode: "home",
  selectedSection: "overview",
  selectedProjectId: null,
  selectedSpaceId: null,
  homeScrollTop: 0,
  lastHomeRoute: {
    mode: "home",
    selectedSection: "overview",
    selectedProjectId: null,
    selectedSpaceId: null,
    scrollTop: 0,
  },
});

const HOME_UI_MODES = new Set(["home", "project", "space"]);
const HOME_SECTIONS = new Set(["overview", "recents", "projects", "resources", "trash", "starred"]);

const NOTE_FOLDER_CARD_TYPE = "note-folder";
const FOLDER_CARD_TYPE = "folder";
const RACK_CARD_TYPE = "rack";
const NOTE_STYLE_TWO = "notes-2";
const NOTE_STYLE_THREE = "notes-3";
const NOTE_FOLDER_DEFAULT_TITLE = "Daily memo";
const NOTE_FOLDER_DEFAULT_DESCRIPTION = "Notes & Journaling";

function cloneDefaultRendererWorkspace() {
  return JSON.parse(JSON.stringify(DEFAULT_RENDERER_WORKSPACE));
}

function cloneDefaultIndexMetadata() {
  return JSON.parse(JSON.stringify(DEFAULT_INDEX_METADATA));
}

function cloneDefaultUiState() {
  return JSON.parse(JSON.stringify(DEFAULT_UI_STATE));
}

function nowIso() {
  return new Date().toISOString();
}

function clampNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function truncateText(value, maxLength = 180) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeExcerpt(value) {
  return truncateText(value, 220);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function createId() {
  return crypto.randomUUID();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function requireName(name, label) {
  const normalized = firstString(name);

  if (!normalized) {
    throw new Error(`${label} name is required.`);
  }

  return normalized;
}

function requireId(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function isFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function defaultCardSize(type) {
  if (type === "link") {
    return { width: 340, height: 280 };
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

function defaultTextCardSize(noteStyle) {
  if (noteStyle === NOTE_STYLE_THREE) {
    return { width: 452, height: 468 };
  }

  return { width: 428, height: 540 };
}

function getCardType(card) {
  if (card?.type === "link") {
    return "link";
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

function getCardPreviewText(card) {
  return truncateText(firstString(
    card?.title,
    getTextCardHeadline(card?.text),
    card?.description,
    card?.secondaryText,
    card?.url,
    card?.type === "link" ? "Link" : "Canvas card",
  ), 42);
}

function extractMarkdownPreviewLines(markdown) {
  const lines = [];
  let inFence = false;

  for (const rawLine of String(markdown ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const normalizedLine = stripNoteLine(line)
      .replace(/^>\s*/, "")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1");

    if (!normalizedLine) {
      continue;
    }

    lines.push(normalizedLine);
  }

  return lines;
}

function extractPageExcerpt(markdown) {
  return normalizeExcerpt(extractMarkdownPreviewLines(markdown).slice(0, 3).join(" "));
}

function normalizeHomeMode(value) {
  return HOME_UI_MODES.has(value) ? value : DEFAULT_UI_STATE.homeMode;
}

function normalizeHomeSection(value) {
  return HOME_SECTIONS.has(value) ? value : DEFAULT_UI_STATE.selectedSection;
}

function normalizeHomeRoute(rawRoute) {
  const safeRoute = isPlainObject(rawRoute) ? rawRoute : {};

  return {
    mode: normalizeHomeMode(safeRoute.mode),
    selectedSection: normalizeHomeSection(safeRoute.selectedSection),
    selectedProjectId: typeof safeRoute.selectedProjectId === "string" ? safeRoute.selectedProjectId : null,
    selectedSpaceId: typeof safeRoute.selectedSpaceId === "string" ? safeRoute.selectedSpaceId : null,
    scrollTop: clampNonNegativeNumber(safeRoute.scrollTop, DEFAULT_UI_STATE.homeScrollTop),
  };
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
  const noteStyle = type === "text" && typeof card?.noteStyle === "string"
    ? card.noteStyle
    : NOTE_STYLE_TWO;
  const size = type === "text" ? defaultTextCardSize(noteStyle) : defaultCardSize(type);
  const createdAt = typeof card?.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card?.updatedAt === "string" ? card.updatedAt : createdAt;
  const notes = type === NOTE_FOLDER_CARD_TYPE ? normalizeFolderNotes(card?.notes) : [];
  const tileIds = type === RACK_CARD_TYPE
    ? (Array.isArray(card?.tileIds)
      ? card.tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0)
      : [])
    : [];
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
    width: isFiniteNumber(card?.width, size.width),
    height: isFiniteNumber(card?.height, size.height),
    text: type === "text" ? String(card?.text ?? "") : "",
    secondaryText: type === "text" ? String(card?.secondaryText ?? "") : "",
    noteStyle: type === "text" ? noteStyle : "",
    quoteAuthor: type === "text" ? String(card?.quoteAuthor ?? "") : "",
    url: type === "link" ? String(card?.url ?? "") : "",
    title: type === "link"
      ? String(card?.title ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.title, "Rack")
      : type === FOLDER_CARD_TYPE
        ? firstString(card?.title, "Folder")
      : type === NOTE_FOLDER_CARD_TYPE
        ? firstString(card?.title, getFolderTitleFromNotes(notes), NOTE_FOLDER_DEFAULT_TITLE)
        : "",
    description: type === "link"
      ? String(card?.description ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.description, "Mounted display rack")
      : type === FOLDER_CARD_TYPE
        ? firstString(card?.description, "Grouped tiles")
      : type === NOTE_FOLDER_CARD_TYPE
        ? firstString(card?.description, NOTE_FOLDER_DEFAULT_DESCRIPTION)
        : "",
    image: type === "link" ? String(card?.image ?? "") : "",
    favicon: type === "link" ? String(card?.favicon ?? "") : "",
    siteName: type === "link" ? String(card?.siteName ?? "") : "",
    previewKind: type === "link" && card?.previewKind === "music" ? "music" : "default",
    status: type === "link" && ["loading", "ready", "failed"].includes(card?.status)
      ? card.status
      : "idle",
    tileIds,
    minSlots: type === RACK_CARD_TYPE
      ? Math.max(3, isFiniteNumber(card?.minSlots, 3))
      : null,
    childIds,
    childLayouts: type === FOLDER_CARD_TYPE && isPlainObject(card?.childLayouts)
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

function migrateRendererWorkspace(rawWorkspace) {
  const safeWorkspace = isPlainObject(rawWorkspace)
    ? rawWorkspace
    : cloneDefaultRendererWorkspace();
  const version = Number.isFinite(safeWorkspace.version) ? safeWorkspace.version : 1;

  if (version >= WORKSPACE_SCHEMA_VERSION) {
    return safeWorkspace;
  }

  let nextWorkspace = { ...safeWorkspace };

  if (version < 2) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 2,
    };
  }

  if (version < 3) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 3,
    };
  }

  if (version < 4) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 4,
    };
  }

  return nextWorkspace;
}

function normalizeRendererWorkspace(rawWorkspace) {
  const workspace = migrateRendererWorkspace(rawWorkspace);

  return {
    version: WORKSPACE_SCHEMA_VERSION,
    viewport: {
      x: isFiniteNumber(workspace.viewport?.x, DEFAULT_RENDERER_WORKSPACE.viewport.x),
      y: isFiniteNumber(workspace.viewport?.y, DEFAULT_RENDERER_WORKSPACE.viewport.y),
      zoom: isFiniteNumber(workspace.viewport?.zoom, DEFAULT_RENDERER_WORKSPACE.viewport.zoom),
    },
    cards: Array.isArray(workspace.cards)
      ? workspace.cards.map((card, index) => normalizeCard(card, index))
      : [],
  };
}

function normalizeWorkspaceMetadata(rawMetadata, folderPath) {
  const createdAt = typeof rawMetadata?.createdAt === "string" ? rawMetadata.createdAt : nowIso();
  const updatedAt = typeof rawMetadata?.updatedAt === "string" ? rawMetadata.updatedAt : createdAt;

  return {
    version: ROOT_METADATA_VERSION,
    name: firstString(rawMetadata?.name, path.basename(folderPath)),
    createdAt,
    updatedAt,
  };
}

function normalizeProjectMetadata(rawProject, projectId) {
  const createdAt = typeof rawProject?.createdAt === "string" ? rawProject.createdAt : nowIso();
  const updatedAt = typeof rawProject?.updatedAt === "string" ? rawProject.updatedAt : createdAt;

  return {
    version: PROJECT_METADATA_VERSION,
    id: typeof rawProject?.id === "string" ? rawProject.id : projectId,
    type: "project",
    name: firstString(rawProject?.name, DEFAULT_PROJECT_NAME),
    createdAt,
    updatedAt,
  };
}

function normalizeSpaceMetadata(rawSpace, projectId, spaceId) {
  const createdAt = typeof rawSpace?.createdAt === "string" ? rawSpace.createdAt : nowIso();
  const updatedAt = typeof rawSpace?.updatedAt === "string" ? rawSpace.updatedAt : createdAt;

  return {
    version: SPACE_METADATA_VERSION,
    id: typeof rawSpace?.id === "string" ? rawSpace.id : spaceId,
    projectId: typeof rawSpace?.projectId === "string" ? rawSpace.projectId : projectId,
    type: "space",
    name: firstString(rawSpace?.name, DEFAULT_SPACE_NAME),
    createdAt,
    updatedAt,
  };
}

function normalizeItemType(value, fallback = "canvas") {
  return value === "page" ? "page" : fallback;
}

function normalizeCanvasDocument(rawCanvas, projectId, spaceId, canvasId) {
  const workspace = normalizeRendererWorkspace({
    viewport: rawCanvas?.viewport,
    cards: rawCanvas?.tiles,
  });
  const createdAt = typeof rawCanvas?.createdAt === "string" ? rawCanvas.createdAt : nowIso();
  const updatedAt = typeof rawCanvas?.updatedAt === "string" ? rawCanvas.updatedAt : createdAt;

  return {
    version: CANVAS_FILE_VERSION,
    id: typeof rawCanvas?.id === "string" ? rawCanvas.id : canvasId,
    projectId: typeof rawCanvas?.projectId === "string" ? rawCanvas.projectId : projectId,
    spaceId: typeof rawCanvas?.spaceId === "string" ? rawCanvas.spaceId : spaceId,
    name: firstString(rawCanvas?.name, DEFAULT_CANVAS_NAME),
    type: normalizeItemType(rawCanvas?.type, "canvas"),
    viewport: workspace.viewport,
    tiles: workspace.cards,
    links: Array.isArray(rawCanvas?.links)
      ? rawCanvas.links.filter((entry) => isPlainObject(entry))
      : [],
    createdAt,
    updatedAt,
  };
}

function canvasDocumentToRendererWorkspace(canvasDocument) {
  return normalizeRendererWorkspace({
    viewport: canvasDocument.viewport,
    cards: canvasDocument.tiles,
  });
}

function rendererWorkspaceToCanvasDocument(projectId, spaceId, canvasId, name, workspace, existingCanvas = null) {
  const normalizedWorkspace = normalizeRendererWorkspace(workspace);
  const createdAt = typeof existingCanvas?.createdAt === "string" ? existingCanvas.createdAt : nowIso();

  return {
    version: CANVAS_FILE_VERSION,
    id: canvasId,
    projectId,
    spaceId,
    name: firstString(name, existingCanvas?.name, DEFAULT_CANVAS_NAME),
    type: "canvas",
    viewport: normalizedWorkspace.viewport,
    tiles: normalizedWorkspace.cards,
    links: Array.isArray(existingCanvas?.links)
      ? existingCanvas.links.filter((entry) => isPlainObject(entry))
      : [],
    createdAt,
    updatedAt: nowIso(),
  };
}

function normalizeRelativePath(value, fallback = null) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().replaceAll("\\", "/");
  }

  return fallback;
}

function getCanvasPreviewPalette(cardType) {
  if (cardType === "link") {
    return {
      fill: "rgba(81, 122, 255, 0.28)",
      stroke: "rgba(135, 163, 255, 0.52)",
      accent: "#90a9ff",
    };
  }

  if (cardType === NOTE_FOLDER_CARD_TYPE) {
    return {
      fill: "rgba(255, 182, 72, 0.22)",
      stroke: "rgba(255, 203, 126, 0.46)",
      accent: "#ffd08e",
    };
  }

  if (cardType === FOLDER_CARD_TYPE || cardType === RACK_CARD_TYPE) {
    return {
      fill: "rgba(134, 240, 196, 0.18)",
      stroke: "rgba(147, 240, 206, 0.4)",
      accent: "#9ef0d3",
    };
  }

  return {
    fill: "rgba(244, 77, 39, 0.22)",
    stroke: "rgba(255, 146, 118, 0.44)",
    accent: "#ffb29f",
  };
}

function getCanvasPreviewRelativePath(canvasId) {
  return path.posix.join(INTERNAL_DIRECTORY_NAME, PREVIEWS_DIRECTORY_NAME, `${canvasId}.svg`);
}

function getPreviewBounds(tiles) {
  const positionedTiles = Array.isArray(tiles)
    ? tiles.filter((tile) => Number.isFinite(tile?.x) && Number.isFinite(tile?.y))
    : [];

  if (positionedTiles.length === 0) {
    return null;
  }

  const minX = Math.min(...positionedTiles.map((tile) => tile.x));
  const minY = Math.min(...positionedTiles.map((tile) => tile.y));
  const maxX = Math.max(...positionedTiles.map((tile) => tile.x + isFiniteNumber(tile.width, 240)));
  const maxY = Math.max(...positionedTiles.map((tile) => tile.y + isFiniteNumber(tile.height, 180)));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function generateCanvasPreviewSvg(canvasDocument) {
  const width = 640;
  const height = 400;
  const inset = 32;
  const tiles = Array.isArray(canvasDocument?.tiles) ? canvasDocument.tiles : [];
  const bounds = getPreviewBounds(tiles);
  const scale = bounds
    ? Math.min(
      (width - inset * 2) / Math.max(bounds.width, 240),
      (height - inset * 2 - 54) / Math.max(bounds.height, 180),
    )
    : 1;
  const contentWidth = bounds ? bounds.width * scale : 0;
  const contentHeight = bounds ? bounds.height * scale : 0;
  const offsetX = bounds ? (width - contentWidth) / 2 - bounds.minX * scale : inset;
  const offsetY = bounds ? (height - contentHeight) / 2 - bounds.minY * scale + 20 : inset + 32;
  const previewTiles = tiles.slice(0, 18);
  const tileMarkup = previewTiles.map((tile) => {
    const palette = getCanvasPreviewPalette(getCardType(tile));
    const x = (isFiniteNumber(tile.x, 0) * scale) + offsetX;
    const y = (isFiniteNumber(tile.y, 0) * scale) + offsetY;
    const tileWidth = Math.max(40, isFiniteNumber(tile.width, 240) * scale);
    const tileHeight = Math.max(34, isFiniteNumber(tile.height, 180) * scale);
    const previewText = getCardPreviewText(tile);
    const label = tileWidth >= 90 && tileHeight >= 44
      ? `<text x="${(x + 14).toFixed(1)}" y="${(y + 24).toFixed(1)}" fill="${palette.accent}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600">${escapeXml(previewText)}</text>`
      : "";

    return [
      `<g>`,
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${tileWidth.toFixed(1)}" height="${tileHeight.toFixed(1)}" rx="18" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="1.4" />`,
      `<rect x="${(x + 12).toFixed(1)}" y="${(y + 12).toFixed(1)}" width="${Math.max(18, tileWidth - 24).toFixed(1)}" height="${Math.min(8, Math.max(6, tileHeight - 24)).toFixed(1)}" rx="4" fill="rgba(255,255,255,0.08)" />`,
      label,
      `</g>`,
    ].join("");
  }).join("");
  const emptyStateMarkup = previewTiles.length === 0
    ? [
      `<g opacity="0.9">`,
      `<rect x="104" y="126" width="432" height="168" rx="32" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-dasharray="8 10" />`,
      `<text x="320" y="192" text-anchor="middle" fill="#f7efe8" font-family="ui-sans-serif, system-ui, sans-serif" font-size="24" font-weight="700">Empty canvas</text>`,
      `<text x="320" y="226" text-anchor="middle" fill="rgba(255,255,255,0.58)" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14">Preview will appear after the first few cards are saved.</text>`,
      `</g>`,
    ].join("")
    : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`,
    `<defs>`,
    `<linearGradient id="bg" x1="64" y1="28" x2="576" y2="372" gradientUnits="userSpaceOnUse">`,
    `<stop stop-color="#171517" />`,
    `<stop offset="1" stop-color="#0f1012" />`,
    `</linearGradient>`,
    `<linearGradient id="glow" x1="120" y1="52" x2="488" y2="320" gradientUnits="userSpaceOnUse">`,
    `<stop stop-color="rgba(244,77,39,0.34)" />`,
    `<stop offset="1" stop-color="rgba(83,120,255,0.08)" />`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" rx="36" fill="url(#bg)" />`,
    `<rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="28" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />`,
    `<circle cx="92" cy="64" r="96" fill="url(#glow)" opacity="0.45" />`,
    `<text x="42" y="52" fill="#f8f1eb" font-family="ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="700">${escapeXml(truncateText(canvasDocument?.name ?? DEFAULT_CANVAS_NAME, 40))}</text>`,
    `<text x="42" y="76" fill="rgba(255,255,255,0.56)" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" letter-spacing="1.6">CANVAS PREVIEW</text>`,
    tileMarkup,
    emptyStateMarkup,
    `</svg>`,
  ].join("");
}

function dedupeStringList(entries) {
  const values = Array.isArray(entries) ? entries : [];
  const nextEntries = [];
  const seenEntries = new Set();

  for (const entry of values) {
    if (typeof entry !== "string" || entry.trim().length === 0 || seenEntries.has(entry)) {
      continue;
    }

    seenEntries.add(entry);
    nextEntries.push(entry);
  }

  return nextEntries;
}

function getProjectRelativePath(projectId) {
  return path.posix.join(PROJECTS_DIRECTORY_NAME, projectId, PROJECT_FILE_NAME);
}

function getSpaceRelativePath(projectId, spaceId) {
  return path.posix.join(
    PROJECTS_DIRECTORY_NAME,
    projectId,
    SPACES_DIRECTORY_NAME,
    spaceId,
    SPACE_FILE_NAME,
  );
}

function getCanvasRelativePath(projectId, spaceId, canvasId) {
  return path.posix.join(
    PROJECTS_DIRECTORY_NAME,
    projectId,
    SPACES_DIRECTORY_NAME,
    spaceId,
    CANVASES_DIRECTORY_NAME,
    `${canvasId}.json`,
  );
}

function getPageRelativePath(projectId, spaceId, pageId) {
  return path.posix.join(
    PROJECTS_DIRECTORY_NAME,
    projectId,
    SPACES_DIRECTORY_NAME,
    spaceId,
    PAGES_DIRECTORY_NAME,
    `${pageId}.md`,
  );
}

function normalizeWorkspaceIndexEntry(entry, workspaceMetadata) {
  const createdAt = typeof entry?.createdAt === "string"
    ? entry.createdAt
    : workspaceMetadata.createdAt;
  const updatedAt = typeof entry?.updatedAt === "string"
    ? entry.updatedAt
    : workspaceMetadata.updatedAt;

  return {
    name: firstString(entry?.name, workspaceMetadata.name),
    createdAt,
    updatedAt,
  };
}

function normalizeProjectIndexEntry(entry) {
  const id = requireId(entry?.id, "Project id");

  return {
    id,
    type: "project",
    name: firstString(entry?.name, DEFAULT_PROJECT_NAME),
    relativePath: normalizeRelativePath(entry?.relativePath, getProjectRelativePath(id)),
    updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : nowIso(),
    spaceCount: normalizeCount(entry?.spaceCount),
    itemCount: normalizeCount(entry?.itemCount),
    canvasCount: normalizeCount(entry?.canvasCount),
    pageCount: normalizeCount(entry?.pageCount),
  };
}

function normalizeSpaceIndexEntry(entry) {
  const id = requireId(entry?.id, "Space id");
  const projectId = requireId(entry?.projectId, "Space project id");

  return {
    id,
    projectId,
    type: "space",
    name: firstString(entry?.name, DEFAULT_SPACE_NAME),
    relativePath: normalizeRelativePath(entry?.relativePath, getSpaceRelativePath(projectId, id)),
    updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : nowIso(),
    itemCount: normalizeCount(entry?.itemCount),
    canvasCount: normalizeCount(entry?.canvasCount),
    pageCount: normalizeCount(entry?.pageCount),
  };
}

function normalizeItemIndexEntry(entry, starredItemIds = new Set()) {
  const id = requireId(entry?.id, "Item id");
  const projectId = requireId(entry?.projectId, "Item project id");
  const spaceId = requireId(entry?.spaceId, "Item space id");
  const type = entry?.type === "page" ? "page" : "canvas";

  return {
    id,
    projectId,
    spaceId,
    type,
    name: firstString(entry?.name, type === "page" ? DEFAULT_PAGE_NAME : DEFAULT_CANVAS_NAME),
    relativePath: normalizeRelativePath(
      entry?.relativePath,
      type === "page"
        ? getPageRelativePath(projectId, spaceId, id)
        : getCanvasRelativePath(projectId, spaceId, id),
    ),
    updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : nowIso(),
    starred: Boolean(entry?.starred) || starredItemIds.has(id),
    thumbnailPath: normalizeRelativePath(entry?.thumbnailPath, null),
    excerpt: normalizeExcerpt(entry?.excerpt),
  };
}

function normalizeIndexMetadata(rawIndex, workspaceMetadata) {
  const safeIndex = isPlainObject(rawIndex) ? rawIndex : cloneDefaultIndexMetadata();
  const legacyRecentItemIds = Array.isArray(safeIndex.recentItemIds)
    ? safeIndex.recentItemIds
    : Array.isArray(safeIndex.recents)
      ? safeIndex.recents
      : [];
  const legacyStarredItemIds = Array.isArray(safeIndex.starredItemIds)
    ? safeIndex.starredItemIds
    : Array.isArray(safeIndex.starred)
      ? safeIndex.starred
      : [];
  const explicitStarredItemIds = new Set(dedupeStringList(legacyStarredItemIds));
  const items = Array.isArray(safeIndex.items)
    ? safeIndex.items.map((entry) => normalizeItemIndexEntry(entry, explicitStarredItemIds))
    : [];
  const validItemIds = new Set(items.map((entry) => entry.id));
  const starredItemIds = dedupeStringList([
    ...legacyStarredItemIds,
    ...items.filter((entry) => entry.starred).map((entry) => entry.id),
  ]).filter((entry) => validItemIds.has(entry));
  const starredItemIdSet = new Set(starredItemIds);

  return {
    version: INDEX_METADATA_VERSION,
    workspace: normalizeWorkspaceIndexEntry(safeIndex.workspace, workspaceMetadata),
    projects: Array.isArray(safeIndex.projects)
      ? safeIndex.projects.map(normalizeProjectIndexEntry)
      : [],
    spaces: Array.isArray(safeIndex.spaces)
      ? safeIndex.spaces.map(normalizeSpaceIndexEntry)
      : [],
    items: items.map((entry) => ({
      ...entry,
      starred: starredItemIdSet.has(entry.id),
    })),
    recentItemIds: dedupeStringList(legacyRecentItemIds).filter((entry) => validItemIds.has(entry)),
    starredItemIds,
  };
}

function extractLegacySelection(rawIndex) {
  return {
    lastOpenedProjectId: typeof rawIndex?.currentProjectId === "string" ? rawIndex.currentProjectId : null,
    lastOpenedSpaceId: typeof rawIndex?.currentSpaceId === "string" ? rawIndex.currentSpaceId : null,
    lastOpenedItemId: typeof rawIndex?.currentCanvasId === "string" ? rawIndex.currentCanvasId : null,
  };
}

function normalizeUiStateSelection(uiState, index) {
  const validProjectIds = new Set(index.projects.map((entry) => entry.id));
  const validSpaces = new Map(index.spaces.map((entry) => [entry.id, entry]));
  const validItems = new Map(index.items.map((entry) => [entry.id, entry]));
  const nextState = {
    ...uiState,
  };
  const selectedItem = validItems.get(nextState.lastOpenedItemId);

  if (selectedItem) {
    nextState.lastOpenedProjectId = selectedItem.projectId;
    nextState.lastOpenedSpaceId = selectedItem.spaceId;
    return nextState;
  }

  nextState.lastOpenedItemId = null;

  const selectedSpace = validSpaces.get(nextState.lastOpenedSpaceId);

  if (selectedSpace) {
    nextState.lastOpenedProjectId = selectedSpace.projectId;
    return nextState;
  }

  nextState.lastOpenedSpaceId = null;

  if (!validProjectIds.has(nextState.lastOpenedProjectId)) {
    nextState.lastOpenedProjectId = null;
  }

  const selectedHomeSpace = validSpaces.get(nextState.selectedSpaceId);

  if (selectedHomeSpace) {
    nextState.selectedProjectId = selectedHomeSpace.projectId;
  } else {
    nextState.selectedSpaceId = null;
  }

  if (!validProjectIds.has(nextState.selectedProjectId)) {
    nextState.selectedProjectId = null;
  }

  nextState.homeMode = normalizeHomeMode(nextState.homeMode);
  nextState.selectedSection = normalizeHomeSection(nextState.selectedSection);
  nextState.homeScrollTop = clampNonNegativeNumber(nextState.homeScrollTop, DEFAULT_UI_STATE.homeScrollTop);

  if (nextState.homeMode === "space" && !nextState.selectedSpaceId) {
    nextState.homeMode = nextState.selectedProjectId ? "project" : "home";
  }

  if (nextState.homeMode === "project" && !nextState.selectedProjectId) {
    nextState.homeMode = "home";
  }

  const nextRoute = normalizeHomeRoute(nextState.lastHomeRoute);
  const routeSpace = validSpaces.get(nextRoute.selectedSpaceId);

  if (routeSpace) {
    nextRoute.selectedProjectId = routeSpace.projectId;
  } else {
    nextRoute.selectedSpaceId = null;
  }

  if (!validProjectIds.has(nextRoute.selectedProjectId)) {
    nextRoute.selectedProjectId = null;
  }

  if (nextRoute.mode === "space" && !nextRoute.selectedSpaceId) {
    nextRoute.mode = nextRoute.selectedProjectId ? "project" : "home";
  }

  if (nextRoute.mode === "project" && !nextRoute.selectedProjectId) {
    nextRoute.mode = "home";
  }

  nextState.lastHomeRoute = nextRoute;
  return nextState;
}

function normalizeUiState(rawState, index, fallbackSelection = {}) {
  const safeState = isPlainObject(rawState) ? rawState : cloneDefaultUiState();
  const rawHomeRoute = isPlainObject(safeState.lastHomeRoute) ? safeState.lastHomeRoute : null;
  const fallbackHomeRoute = normalizeHomeRoute(rawHomeRoute);

  return normalizeUiStateSelection({
    version: UI_STATE_VERSION,
    lastOpenedProjectId: typeof safeState.lastOpenedProjectId === "string"
      ? safeState.lastOpenedProjectId
      : typeof fallbackSelection.lastOpenedProjectId === "string"
        ? fallbackSelection.lastOpenedProjectId
        : null,
    lastOpenedSpaceId: typeof safeState.lastOpenedSpaceId === "string"
      ? safeState.lastOpenedSpaceId
      : typeof fallbackSelection.lastOpenedSpaceId === "string"
        ? fallbackSelection.lastOpenedSpaceId
        : null,
    lastOpenedItemId: typeof safeState.lastOpenedItemId === "string"
      ? safeState.lastOpenedItemId
      : typeof fallbackSelection.lastOpenedItemId === "string"
        ? fallbackSelection.lastOpenedItemId
        : null,
    homeView: firstString(safeState.homeView, DEFAULT_UI_STATE.homeView),
    sortBy: firstString(safeState.sortBy, DEFAULT_UI_STATE.sortBy),
    filter: typeof safeState.filter === "string"
      ? safeState.filter
      : DEFAULT_UI_STATE.filter,
    homeMode: normalizeHomeMode(safeState.homeMode),
    selectedSection: normalizeHomeSection(safeState.selectedSection),
    selectedProjectId: typeof safeState.selectedProjectId === "string"
      ? safeState.selectedProjectId
      : typeof safeState.lastOpenedProjectId === "string"
        ? safeState.lastOpenedProjectId
        : null,
    selectedSpaceId: typeof safeState.selectedSpaceId === "string"
      ? safeState.selectedSpaceId
      : typeof safeState.lastOpenedSpaceId === "string"
        ? safeState.lastOpenedSpaceId
        : null,
    homeScrollTop: clampNonNegativeNumber(safeState.homeScrollTop, DEFAULT_UI_STATE.homeScrollTop),
    lastHomeRoute: {
      ...fallbackHomeRoute,
      mode: normalizeHomeMode(rawHomeRoute?.mode ?? safeState.homeMode),
      selectedSection: normalizeHomeSection(rawHomeRoute?.selectedSection ?? safeState.selectedSection),
      selectedProjectId: typeof rawHomeRoute?.selectedProjectId === "string"
        ? fallbackHomeRoute.selectedProjectId
        : typeof safeState.selectedProjectId === "string"
          ? safeState.selectedProjectId
          : null,
      selectedSpaceId: typeof rawHomeRoute?.selectedSpaceId === "string"
        ? fallbackHomeRoute.selectedSpaceId
        : typeof safeState.selectedSpaceId === "string"
          ? safeState.selectedSpaceId
          : null,
      scrollTop: clampNonNegativeNumber(
        rawHomeRoute?.scrollTop,
        clampNonNegativeNumber(safeState.homeScrollTop, DEFAULT_UI_STATE.homeScrollTop),
      ),
    },
  }, index);
}

function getWorkspaceMetadataPath(folderPath) {
  return path.join(folderPath, WORKSPACE_METADATA_FILE_NAME);
}

function getWorkspaceIndexDirectoryPath(folderPath) {
  return path.join(folderPath, INTERNAL_DIRECTORY_NAME);
}

function getWorkspaceIndexPath(folderPath) {
  return path.join(getWorkspaceIndexDirectoryPath(folderPath), INDEX_FILE_NAME);
}

function getWorkspaceUiStatePath(folderPath) {
  return path.join(getWorkspaceIndexDirectoryPath(folderPath), UI_STATE_FILE_NAME);
}

function getWorkspacePreviewsPath(folderPath) {
  return path.join(getWorkspaceIndexDirectoryPath(folderPath), PREVIEWS_DIRECTORY_NAME);
}

function getProjectsPath(folderPath) {
  return path.join(folderPath, PROJECTS_DIRECTORY_NAME);
}

function getProjectPath(folderPath, projectId) {
  return path.join(getProjectsPath(folderPath), projectId);
}

function getProjectMetadataPath(folderPath, projectId) {
  return path.join(getProjectPath(folderPath, projectId), PROJECT_FILE_NAME);
}

function getProjectSpacesPath(folderPath, projectId) {
  return path.join(getProjectPath(folderPath, projectId), SPACES_DIRECTORY_NAME);
}

function getSpacePath(folderPath, projectId, spaceId) {
  return path.join(getProjectSpacesPath(folderPath, projectId), spaceId);
}

function getSpaceMetadataPath(folderPath, projectId, spaceId) {
  return path.join(getSpacePath(folderPath, projectId, spaceId), SPACE_FILE_NAME);
}

function getSpaceCanvasesPath(folderPath, projectId, spaceId) {
  return path.join(getSpacePath(folderPath, projectId, spaceId), CANVASES_DIRECTORY_NAME);
}

function getCanvasPath(folderPath, projectId, spaceId, canvasId) {
  return path.join(getSpaceCanvasesPath(folderPath, projectId, spaceId), `${canvasId}.json`);
}

function getSpacePagesPath(folderPath, projectId, spaceId) {
  return path.join(getSpacePath(folderPath, projectId, spaceId), PAGES_DIRECTORY_NAME);
}

function getPagePath(folderPath, projectId, spaceId, pageId) {
  return path.join(getSpacePagesPath(folderPath, projectId, spaceId), `${pageId}.md`);
}

function getCanvasPreviewPath(folderPath, canvasId) {
  return path.join(getWorkspacePreviewsPath(folderPath), `${canvasId}.svg`);
}

function resolveWorkspaceRelativePath(folderPath, relativePath) {
  const normalizedRelativePath = normalizeRelativePath(relativePath, null);

  if (!normalizedRelativePath) {
    return null;
  }

  return path.join(folderPath, ...normalizedRelativePath.split("/"));
}

function getPhaseOneWorkspacePath(folderPath) {
  return path.join(folderPath, PHASE_ONE_WORKSPACE_FILE_NAME);
}

function getLegacyDataPath(folderPath) {
  return path.join(folderPath, LEGACY_DATA_FILE_NAME);
}

async function statOrNull(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function pathExists(targetPath) {
  return Boolean(await statOrNull(targetPath));
}

async function isDirectory(targetPath) {
  const stats = await statOrNull(targetPath);
  return stats?.isDirectory() ?? false;
}

async function recoverFileArtifacts(filePath) {
  const tempPath = `${filePath}${TEMP_SUFFIX}`;
  const backupPath = `${filePath}${BACKUP_SUFFIX}`;

  if (!(await pathExists(filePath)) && (await pathExists(tempPath))) {
    await fs.rename(tempPath, filePath);
  }

  if (!(await pathExists(filePath)) && (await pathExists(backupPath))) {
    await fs.rename(backupPath, filePath);
  }

  if (await pathExists(tempPath)) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }

  if (await pathExists(backupPath)) {
    await fs.rm(backupPath, { force: true }).catch(() => {});
  }
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallbackValue;
    }

    throw error;
  }
}

async function readJsonObject(filePath, label) {
  await recoverFileArtifacts(filePath);

  let parsed;

  try {
    parsed = await readJsonFile(filePath, null);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} must contain valid JSON.`);
    }

    throw error;
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must contain a JSON object.`);
  }

  return parsed;
}

async function safeWriteJson(filePath, data) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}${TEMP_SUFFIX}`;
  const backupPath = `${filePath}${BACKUP_SUFFIX}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, payload, "utf8");

  try {
    await fs.rm(backupPath, { force: true });
  } catch {
    // Ignore leftover backups from prior runs.
  }

  if (await pathExists(filePath)) {
    await fs.rename(filePath, backupPath);
  }

  await fs.rename(tempPath, filePath);
  await fs.rm(backupPath, { force: true }).catch(() => {});
}

async function readTextFile(filePath, fallbackValue = null) {
  await recoverFileArtifacts(filePath);

  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallbackValue;
    }

    throw error;
  }
}

async function safeWriteText(filePath, text) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}${TEMP_SUFFIX}`;
  const backupPath = `${filePath}${BACKUP_SUFFIX}`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, text, "utf8");

  try {
    await fs.rm(backupPath, { force: true });
  } catch {
    // Ignore leftover backups from prior runs.
  }

  if (await pathExists(filePath)) {
    await fs.rename(filePath, backupPath);
  }

  await fs.rename(tempPath, filePath);
  await fs.rm(backupPath, { force: true }).catch(() => {});
}

async function resolveExistingRelativePath(folderPath, relativePath) {
  const filePath = resolveWorkspaceRelativePath(folderPath, relativePath);

  if (!filePath) {
    return null;
  }

  const stats = await statOrNull(filePath);
  return stats?.isFile() ? normalizeRelativePath(relativePath, null) : null;
}

async function writeCanvasPreview(folderPath, canvasDocument) {
  const previewRelativePath = getCanvasPreviewRelativePath(canvasDocument.id);

  try {
    await safeWriteText(
      getCanvasPreviewPath(folderPath, canvasDocument.id),
      generateCanvasPreviewSvg(canvasDocument),
    );
    return previewRelativePath;
  } catch {
    return resolveExistingRelativePath(folderPath, previewRelativePath);
  }
}

async function removeRelativeFile(folderPath, relativePath) {
  const filePath = resolveWorkspaceRelativePath(folderPath, relativePath);

  if (!filePath) {
    return;
  }

  await fs.rm(filePath, { force: true }).catch(() => {});
}

function createValidationError(issues) {
  return new Error(`Selected folder is not a valid AirPaste workspace. ${issues.join(" ")}`);
}

function upsertById(entries, nextEntry) {
  const nextEntries = entries.filter((entry) => entry.id !== nextEntry.id);
  nextEntries.push(nextEntry);
  return nextEntries;
}

function removeById(entries, id) {
  return entries.filter((entry) => entry.id !== id);
}

async function readWorkspaceMetadata(folderPath) {
  const metadata = await readJsonObject(getWorkspaceMetadataPath(folderPath), "airpaste.json");
  return normalizeWorkspaceMetadata(metadata, folderPath);
}

async function writeWorkspaceMetadata(folderPath, metadata) {
  const normalizedMetadata = normalizeWorkspaceMetadata(metadata, folderPath);
  await safeWriteJson(getWorkspaceMetadataPath(folderPath), normalizedMetadata);
  return normalizedMetadata;
}

async function touchWorkspaceMetadata(folderPath) {
  const metadata = await readWorkspaceMetadata(folderPath);
  return writeWorkspaceMetadata(folderPath, {
    ...metadata,
    updatedAt: nowIso(),
  });
}

function shouldRewriteIndexMetadata(rawIndex, normalizedIndex, workspaceMetadata) {
  if (!isPlainObject(rawIndex) || rawIndex.version !== INDEX_METADATA_VERSION) {
    return true;
  }

  if (!isPlainObject(rawIndex.workspace)) {
    return true;
  }

  if (!Array.isArray(rawIndex.recentItemIds) || !Array.isArray(rawIndex.starredItemIds)) {
    return true;
  }

  if (
    rawIndex.currentProjectId !== undefined
    || rawIndex.currentSpaceId !== undefined
    || rawIndex.currentCanvasId !== undefined
    || rawIndex.recents !== undefined
    || rawIndex.starred !== undefined
  ) {
    return true;
  }

  if (
    rawIndex.workspace.name !== normalizedIndex.workspace.name
    || rawIndex.workspace.createdAt !== workspaceMetadata.createdAt
    || rawIndex.workspace.updatedAt !== workspaceMetadata.updatedAt
  ) {
    return true;
  }

  if (rawIndex.projects?.some((entry) => typeof entry?.relativePath !== "string")) {
    return true;
  }

  if (rawIndex.spaces?.some((entry) => typeof entry?.relativePath !== "string")) {
    return true;
  }

  const invalidItemEntries = rawIndex.items?.some((entry) => (
    typeof entry?.relativePath !== "string"
    || typeof entry?.starred !== "boolean"
    || (!Object.hasOwn(entry ?? {}, "thumbnailPath"))
    || (!Object.hasOwn(entry ?? {}, "excerpt"))
  )) ?? false;
  const invalidProjectEntries = rawIndex.projects?.some((entry) => (
    !Object.hasOwn(entry ?? {}, "spaceCount")
    || !Object.hasOwn(entry ?? {}, "itemCount")
    || !Object.hasOwn(entry ?? {}, "canvasCount")
    || !Object.hasOwn(entry ?? {}, "pageCount")
  )) ?? false;
  const invalidSpaceEntries = rawIndex.spaces?.some((entry) => (
    !Object.hasOwn(entry ?? {}, "itemCount")
    || !Object.hasOwn(entry ?? {}, "canvasCount")
    || !Object.hasOwn(entry ?? {}, "pageCount")
  )) ?? false;

  return invalidItemEntries || invalidProjectEntries || invalidSpaceEntries;
}

function shouldRebuildIndex(error) {
  if (error?.code === "ENOENT" || error instanceof SyntaxError) {
    return true;
  }

  return typeof error?.message === "string"
    && error.message.startsWith(".airpaste/index.json");
}

async function readIndexMetadata(folderPath, workspaceMetadata) {
  const indexPath = getWorkspaceIndexPath(folderPath);

  await recoverFileArtifacts(indexPath);

  const rawIndex = await readJsonFile(indexPath, null);

  if (rawIndex == null) {
    const missingError = new Error("Missing .airpaste/index.json.");
    missingError.code = "ENOENT";
    throw missingError;
  }

  if (!isPlainObject(rawIndex)) {
    throw new Error(".airpaste/index.json must contain a JSON object.");
  }

  const normalizedIndex = normalizeIndexCollections(
    normalizeIndexMetadata(rawIndex, workspaceMetadata),
  );

  if (shouldRewriteIndexMetadata(rawIndex, normalizedIndex, workspaceMetadata)) {
    await safeWriteJson(indexPath, normalizedIndex);
  }

  return {
    index: normalizedIndex,
    legacySelection: extractLegacySelection(rawIndex),
  };
}

async function writeIndexMetadata(folderPath, index, workspaceMetadata = null) {
  const metadata = workspaceMetadata ?? await readWorkspaceMetadata(folderPath);
  const normalizedIndex = normalizeIndexCollections(
    normalizeIndexMetadata(index, metadata),
  );
  await safeWriteJson(getWorkspaceIndexPath(folderPath), normalizedIndex);
  return normalizedIndex;
}

function shouldRewriteUiState(rawState) {
  if (!isPlainObject(rawState) || rawState.version !== UI_STATE_VERSION) {
    return true;
  }

  return (
    !Object.hasOwn(rawState, "lastOpenedProjectId")
    || !Object.hasOwn(rawState, "lastOpenedSpaceId")
    || !Object.hasOwn(rawState, "lastOpenedItemId")
    || !Object.hasOwn(rawState, "homeView")
    || !Object.hasOwn(rawState, "sortBy")
    || !Object.hasOwn(rawState, "filter")
    || !Object.hasOwn(rawState, "homeMode")
    || !Object.hasOwn(rawState, "selectedSection")
    || !Object.hasOwn(rawState, "selectedProjectId")
    || !Object.hasOwn(rawState, "selectedSpaceId")
    || !Object.hasOwn(rawState, "homeScrollTop")
    || !Object.hasOwn(rawState, "lastHomeRoute")
  );
}

async function readUiStateMetadata(folderPath, index, fallbackSelection = {}) {
  const uiStatePath = getWorkspaceUiStatePath(folderPath);

  await recoverFileArtifacts(uiStatePath);

  let rawState;

  try {
    rawState = await readJsonFile(uiStatePath, null);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    rawState = null;
  }

  const normalizedUiState = normalizeUiState(rawState, index, fallbackSelection);

  if (rawState == null || !isPlainObject(rawState) || shouldRewriteUiState(rawState)) {
    await safeWriteJson(uiStatePath, normalizedUiState);
  }

  return normalizedUiState;
}

async function writeUiStateMetadata(folderPath, uiState, index) {
  const normalizedUiState = normalizeUiState(uiState, index);
  await safeWriteJson(getWorkspaceUiStatePath(folderPath), normalizedUiState);
  return normalizedUiState;
}

async function ensureWorkspaceStructure(folderPath) {
  if (!(await isDirectory(folderPath))) {
    throw new Error("Selected folder is no longer available.");
  }

  const issues = [];
  const metadataPath = getWorkspaceMetadataPath(folderPath);
  const projectsPath = getProjectsPath(folderPath);
  const indexDirectoryPath = getWorkspaceIndexDirectoryPath(folderPath);

  const metadataStats = await statOrNull(metadataPath);
  if (!metadataStats) {
    issues.push("Missing airpaste.json.");
  } else if (!metadataStats.isFile()) {
    issues.push("airpaste.json must be a file.");
  }

  const projectsStats = await statOrNull(projectsPath);
  if (!projectsStats) {
    issues.push("Missing projects/ directory.");
  } else if (!projectsStats.isDirectory()) {
    issues.push("projects/ must be a directory.");
  }

  const indexDirectoryStats = await statOrNull(indexDirectoryPath);
  if (indexDirectoryStats && !indexDirectoryStats.isDirectory()) {
    issues.push(".airpaste must be a directory.");
  }

  if (issues.length > 0) {
    throw createValidationError(issues);
  }

  if (!indexDirectoryStats) {
    await fs.mkdir(indexDirectoryPath, { recursive: true });
  }

  return {
    metadata: await readWorkspaceMetadata(folderPath),
  };
}

async function isValidWorkspace(folderPath) {
  if (!(await isDirectory(folderPath))) {
    return false;
  }

  try {
    await ensureWorkspaceStructure(folderPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureWorkspacePrepared(folderPath) {
  try {
    return {
      folderPath,
      ...(await ensureWorkspaceStructure(folderPath)),
    };
  } catch (phaseTwoError) {
    const migrated = await migrateLegacyWorkspaceToPhaseTwo(folderPath);

    if (migrated) {
      return {
        folderPath,
        ...(await ensureWorkspaceStructure(folderPath)),
      };
    }

    throw phaseTwoError;
  }
}

function createWorkspaceMetadataPayload(folderPath) {
  const timestamp = nowIso();

  return {
    version: ROOT_METADATA_VERSION,
    name: path.basename(folderPath),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createProjectMetadata(name, projectId) {
  const timestamp = nowIso();

  return {
    version: PROJECT_METADATA_VERSION,
    id: projectId,
    type: "project",
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createSpaceMetadata(projectId, name, spaceId) {
  const timestamp = nowIso();

  return {
    version: SPACE_METADATA_VERSION,
    id: spaceId,
    projectId,
    type: "space",
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createCanvasDocument(projectId, spaceId, name, canvasId, workspace = cloneDefaultRendererWorkspace()) {
  return rendererWorkspaceToCanvasDocument(projectId, spaceId, canvasId, name, workspace);
}

async function readProject(folderPath, projectId) {
  const normalizedProjectId = requireId(projectId, "Project id");
  const metadata = await readJsonObject(
    getProjectMetadataPath(folderPath, normalizedProjectId),
    `projects/${normalizedProjectId}/project.json`,
  );
  return normalizeProjectMetadata(metadata, normalizedProjectId);
}

async function writeProject(folderPath, project) {
  const normalizedProject = normalizeProjectMetadata(project, project.id);
  await safeWriteJson(getProjectMetadataPath(folderPath, normalizedProject.id), normalizedProject);
  return normalizedProject;
}

async function ensureProject(folderPath, projectId) {
  try {
    return await readProject(folderPath, projectId);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Project "${projectId}" does not exist.`);
    }
    throw error;
  }
}

async function readSpace(folderPath, projectId, spaceId) {
  const normalizedProjectId = requireId(projectId, "Project id");
  const normalizedSpaceId = requireId(spaceId, "Space id");
  const metadata = await readJsonObject(
    getSpaceMetadataPath(folderPath, normalizedProjectId, normalizedSpaceId),
    `projects/${normalizedProjectId}/spaces/${normalizedSpaceId}/space.json`,
  );
  return normalizeSpaceMetadata(metadata, normalizedProjectId, normalizedSpaceId);
}

async function writeSpace(folderPath, space) {
  const normalizedSpace = normalizeSpaceMetadata(space, space.projectId, space.id);
  await safeWriteJson(
    getSpaceMetadataPath(folderPath, normalizedSpace.projectId, normalizedSpace.id),
    normalizedSpace,
  );
  return normalizedSpace;
}

async function ensureSpace(folderPath, projectId, spaceId) {
  await ensureProject(folderPath, projectId);

  try {
    return await readSpace(folderPath, projectId, spaceId);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Space "${spaceId}" does not exist.`);
    }
    throw error;
  }
}

async function readCanvas(folderPath, projectId, spaceId, canvasId) {
  const normalizedProjectId = requireId(projectId, "Project id");
  const normalizedSpaceId = requireId(spaceId, "Space id");
  const normalizedCanvasId = requireId(canvasId, "Canvas id");
  const document = await readJsonObject(
    getCanvasPath(folderPath, normalizedProjectId, normalizedSpaceId, normalizedCanvasId),
    `projects/${normalizedProjectId}/spaces/${normalizedSpaceId}/canvases/${normalizedCanvasId}.json`,
  );
  return normalizeCanvasDocument(document, normalizedProjectId, normalizedSpaceId, normalizedCanvasId);
}

async function writeCanvas(folderPath, canvasDocument) {
  const normalizedCanvas = normalizeCanvasDocument(
    canvasDocument,
    canvasDocument.projectId,
    canvasDocument.spaceId,
    canvasDocument.id,
  );
  await safeWriteJson(
    getCanvasPath(folderPath, normalizedCanvas.projectId, normalizedCanvas.spaceId, normalizedCanvas.id),
    normalizedCanvas,
  );
  return normalizedCanvas;
}

async function ensureCanvas(folderPath, projectId, spaceId, canvasId) {
  await ensureSpace(folderPath, projectId, spaceId);

  try {
    return await readCanvas(folderPath, projectId, spaceId, canvasId);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Canvas "${canvasId}" does not exist.`);
    }
    throw error;
  }
}

async function touchProject(folderPath, projectId, updatedAt = nowIso()) {
  const project = await ensureProject(folderPath, projectId);
  const updatedProject = {
    ...project,
    updatedAt,
  };

  await writeProject(folderPath, updatedProject);
  return updatedProject;
}

async function touchSpace(folderPath, projectId, spaceId, updatedAt = nowIso()) {
  const space = await ensureSpace(folderPath, projectId, spaceId);
  const updatedSpace = {
    ...space,
    updatedAt,
  };

  await writeSpace(folderPath, updatedSpace);
  return updatedSpace;
}

async function touchProjectAndSpace(folderPath, projectId, spaceId, updatedAt = nowIso()) {
  const updatedSpace = await touchSpace(folderPath, projectId, spaceId, updatedAt);
  const updatedProject = await touchProject(folderPath, projectId, updatedAt);

  return {
    updatedAt,
    project: updatedProject,
    space: updatedSpace,
  };
}

function resolvePageName(markdown, fallbackName) {
  const firstLine = String(markdown ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return firstString(fallbackName, DEFAULT_PAGE_NAME);
  }

  return firstString(firstLine.replace(/^#+\s*/, ""), fallbackName, DEFAULT_PAGE_NAME);
}

async function readPageMarkdown(folderPath, projectId, spaceId, pageId) {
  const normalizedProjectId = requireId(projectId, "Project id");
  const normalizedSpaceId = requireId(spaceId, "Space id");
  const normalizedPageId = requireId(pageId, "Page id");
  const markdown = await readTextFile(
    getPagePath(folderPath, normalizedProjectId, normalizedSpaceId, normalizedPageId),
  );

  if (markdown == null) {
    throw new Error(`Page "${normalizedPageId}" does not exist.`);
  }

  return markdown;
}

function updateIndexProject(index, project) {
  return normalizeIndexMetadata({
    ...index,
    projects: upsertById(index.projects, {
      id: project.id,
      type: "project",
      name: project.name,
      relativePath: getProjectRelativePath(project.id),
      updatedAt: project.updatedAt,
    }),
  }, index.workspace);
}

function updateIndexSpace(index, space) {
  return normalizeIndexMetadata({
    ...index,
    spaces: upsertById(index.spaces, {
      id: space.id,
      projectId: space.projectId,
      type: "space",
      name: space.name,
      relativePath: getSpaceRelativePath(space.projectId, space.id),
      updatedAt: space.updatedAt,
    }),
  }, index.workspace);
}

function normalizeIndexCollections(index) {
  const validItemIds = new Set(index.items.map((entry) => entry.id));
  const starredItemIds = dedupeStringList([
    ...index.starredItemIds,
    ...index.items.filter((entry) => entry.starred).map((entry) => entry.id),
  ]).filter((entry) => validItemIds.has(entry));
  const starredItemIdSet = new Set(starredItemIds);
  const projectCounts = new Map(index.projects.map((entry) => [entry.id, {
    spaceCount: 0,
    itemCount: 0,
    canvasCount: 0,
    pageCount: 0,
  }]));
  const spaceCounts = new Map(index.spaces.map((entry) => [entry.id, {
    itemCount: 0,
    canvasCount: 0,
    pageCount: 0,
  }]));

  for (const space of index.spaces) {
    const projectCount = projectCounts.get(space.projectId);

    if (projectCount) {
      projectCount.spaceCount += 1;
    }
  }

  for (const item of index.items) {
    const projectCount = projectCounts.get(item.projectId);
    const spaceCount = spaceCounts.get(item.spaceId);

    if (projectCount) {
      projectCount.itemCount += 1;
      projectCount[`${item.type}Count`] += 1;
    }

    if (spaceCount) {
      spaceCount.itemCount += 1;
      spaceCount[`${item.type}Count`] += 1;
    }
  }

  return {
    ...index,
    projects: index.projects.map((entry) => ({
      ...entry,
      ...projectCounts.get(entry.id),
    })),
    spaces: index.spaces.map((entry) => ({
      ...entry,
      ...spaceCounts.get(entry.id),
    })),
    items: index.items.map((entry) => ({
      ...entry,
      starred: starredItemIdSet.has(entry.id),
      thumbnailPath: normalizeRelativePath(entry.thumbnailPath, null),
      excerpt: normalizeExcerpt(entry.excerpt),
    })),
    recentItemIds: dedupeStringList(index.recentItemIds)
      .filter((entry) => validItemIds.has(entry))
      .slice(0, MAX_RECENT_ITEMS),
    starredItemIds,
  };
}

function updateIndexItem(index, item) {
  const existingItem = index.items.find((entry) => entry.id === item.id);
  const relativePath = item.type === "page"
    ? getPageRelativePath(item.projectId, item.spaceId, item.id)
    : getCanvasRelativePath(item.projectId, item.spaceId, item.id);

  return normalizeIndexCollections({
    ...index,
    items: upsertById(index.items, {
      id: item.id,
      projectId: item.projectId,
      spaceId: item.spaceId,
      type: item.type,
      name: item.name,
      relativePath: normalizeRelativePath(item.relativePath, relativePath),
      updatedAt: item.updatedAt,
      starred: Boolean(item.starred ?? existingItem?.starred),
      thumbnailPath: normalizeRelativePath(
        Object.hasOwn(item ?? {}, "thumbnailPath")
          ? item.thumbnailPath
          : item.type === "page"
            ? null
            : existingItem?.thumbnailPath ?? null,
        null,
      ),
      excerpt: normalizeExcerpt(
        Object.hasOwn(item ?? {}, "excerpt")
          ? item.excerpt
          : existingItem?.excerpt ?? "",
      ),
    }),
  });
}

function recordRecentInIndex(index, itemId) {
  return normalizeIndexCollections({
    ...index,
    recentItemIds: [
      itemId,
      ...index.recentItemIds.filter((entry) => entry !== itemId),
    ],
  });
}

function setItemStarredInIndex(index, itemId, starred) {
  return normalizeIndexCollections({
    ...index,
    items: index.items.map((entry) => (
      entry.id === itemId
        ? {
          ...entry,
          starred,
        }
        : entry
    )),
    starredItemIds: starred
      ? [
        itemId,
        ...index.starredItemIds.filter((entry) => entry !== itemId),
      ]
      : index.starredItemIds.filter((entry) => entry !== itemId),
  });
}

function removeProjectFromIndex(index, projectId) {
  const remainingSpaces = index.spaces.filter((entry) => entry.projectId !== projectId);
  const remainingItems = index.items.filter((entry) => entry.projectId !== projectId);

  return normalizeIndexCollections({
    ...index,
    projects: removeById(index.projects, projectId),
    spaces: remainingSpaces,
    items: remainingItems,
  });
}

function removeSpaceFromIndex(index, spaceId) {
  const remainingItems = index.items.filter((entry) => entry.spaceId !== spaceId);

  return normalizeIndexCollections({
    ...index,
    spaces: removeById(index.spaces, spaceId),
    items: remainingItems,
  });
}

function removeItemFromIndex(index, itemId) {
  return normalizeIndexCollections({
    ...index,
    items: removeById(index.items, itemId),
  });
}

async function writeIndexAndUiState(folderPath, index, uiState, workspaceMetadata = null) {
  const nextIndex = await writeIndexMetadata(folderPath, index, workspaceMetadata);
  const nextUiState = await writeUiStateMetadata(folderPath, uiState, nextIndex);

  return {
    index: nextIndex,
    uiState: nextUiState,
  };
}

function getItemMap(index) {
  return new Map(index.items.map((entry) => [entry.id, entry]));
}

function getProjectMap(index) {
  return new Map(index.projects.map((entry) => [entry.id, entry]));
}

function getSpaceMap(index) {
  return new Map(index.spaces.map((entry) => [entry.id, entry]));
}

function compareByUpdatedAtDesc(left, right) {
  if (left.updatedAt === right.updatedAt) {
    return left.name.localeCompare(right.name);
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function decorateItemForHome(item, projectsById, spacesById) {
  return {
    ...item,
    projectName: projectsById.get(item.projectId)?.name ?? null,
    spaceName: spacesById.get(item.spaceId)?.name ?? null,
  };
}

function buildProjectSummary(index, project) {
  return {
    ...project,
    spaceCount: normalizeCount(project.spaceCount),
    itemCount: normalizeCount(project.itemCount),
    canvasCount: normalizeCount(project.canvasCount),
    pageCount: normalizeCount(project.pageCount),
  };
}

function buildSpaceSummary(index, space) {
  return {
    ...space,
    itemCount: normalizeCount(space.itemCount),
    canvasCount: normalizeCount(space.canvasCount),
    pageCount: normalizeCount(space.pageCount),
  };
}

function getOrderedItems(index, itemIds) {
  const itemEntriesById = getItemMap(index);
  const projectsById = getProjectMap(index);
  const spacesById = getSpaceMap(index);

  return itemIds
    .map((itemId) => itemEntriesById.get(itemId))
    .filter(Boolean)
    .map((item) => decorateItemForHome(item, projectsById, spacesById));
}

async function getPageUpdatedAt(folderPath, projectId, spaceId, pageId) {
  const stats = await statOrNull(getPagePath(folderPath, projectId, spaceId, pageId));
  return stats?.mtime?.toISOString?.() ?? nowIso();
}

async function createProject(folderPath, name) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const projectName = requireName(name, "Project");
  const projectId = createId();
  const project = createProjectMetadata(projectName, projectId);

  await fs.mkdir(getProjectSpacesPath(folderPath, projectId), { recursive: true });
  await writeProject(folderPath, project);

  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  const nextIndex = updateIndexProject(index, project);
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: uiState.lastOpenedProjectId ?? project.id,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, workspaceMetadata);
  return project;
}

async function createSpace(folderPath, projectId, name) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const project = await ensureProject(folderPath, projectId);
  const spaceName = requireName(name, "Space");
  const spaceId = createId();
  const space = createSpaceMetadata(project.id, spaceName, spaceId);

  await fs.mkdir(getSpaceCanvasesPath(folderPath, project.id, spaceId), { recursive: true });
  await fs.mkdir(getSpacePagesPath(folderPath, project.id, spaceId), { recursive: true });
  await writeSpace(folderPath, space);

  const updatedProject = await touchProject(folderPath, project.id, space.updatedAt);
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = updateIndexProject(index, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, space);
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: uiState.lastOpenedProjectId ?? project.id,
    lastOpenedSpaceId: uiState.lastOpenedSpaceId ?? space.id,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, workspaceMetadata);
  return space;
}

async function createCanvas(folderPath, projectId, spaceId, name) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const space = await ensureSpace(folderPath, projectId, spaceId);
  const canvasName = requireName(name, "Canvas");
  const canvasId = createId();
  const canvas = createCanvasDocument(space.projectId, space.id, canvasName, canvasId);

  await fs.mkdir(getSpaceCanvasesPath(folderPath, space.projectId, space.id), { recursive: true });
  await writeCanvas(folderPath, canvas);
  const thumbnailPath = await writeCanvasPreview(folderPath, canvas);

  const { project: updatedProject, space: updatedSpace } = await touchProjectAndSpace(
    folderPath,
    canvas.projectId,
    canvas.spaceId,
    canvas.updatedAt,
  );
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = updateIndexProject(index, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, updatedSpace);
  nextIndex = updateIndexItem(nextIndex, {
    ...canvas,
    thumbnailPath,
  });
  nextIndex = recordRecentInIndex(nextIndex, canvas.id);
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: canvas.projectId,
    lastOpenedSpaceId: canvas.spaceId,
    lastOpenedItemId: canvas.id,
    selectedProjectId: canvas.projectId,
    selectedSpaceId: canvas.spaceId,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, workspaceMetadata);
  return canvas;
}

async function createPage(folderPath, projectId, spaceId, name) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const space = await ensureSpace(folderPath, projectId, spaceId);
  const pageName = requireName(name, "Page");
  const pageId = createId();
  const timestamp = nowIso();

  await fs.mkdir(getSpacePagesPath(folderPath, space.projectId, space.id), { recursive: true });
  await safeWriteText(getPagePath(folderPath, space.projectId, space.id, pageId), "");

  const { project: updatedProject, space: updatedSpace } = await touchProjectAndSpace(
    folderPath,
    space.projectId,
    space.id,
    timestamp,
  );
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = updateIndexProject(index, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, updatedSpace);
  nextIndex = updateIndexItem(nextIndex, {
    id: pageId,
    projectId: space.projectId,
    spaceId: space.id,
    type: "page",
    name: pageName,
    updatedAt: timestamp,
    excerpt: "",
  });
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: uiState.lastOpenedProjectId ?? space.projectId,
    lastOpenedSpaceId: uiState.lastOpenedSpaceId ?? space.id,
    selectedProjectId: uiState.selectedProjectId ?? space.projectId,
    selectedSpaceId: uiState.selectedSpaceId ?? space.id,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, workspaceMetadata);

  return {
    id: pageId,
    projectId: space.projectId,
    spaceId: space.id,
    type: "page",
    name: pageName,
    updatedAt: timestamp,
  };
}

async function listProjects(folderPath) {
  const index = await loadIndex(folderPath);
  return [...index.projects];
}

async function getProject(folderPath, projectId) {
  await ensureWorkspaceReady(folderPath);
  return ensureProject(folderPath, projectId);
}

async function listSpaces(folderPath, projectId) {
  const normalizedProjectId = requireId(projectId, "Project id");
  const index = await loadIndex(folderPath);
  await ensureProject(folderPath, normalizedProjectId);
  return index.spaces.filter((entry) => entry.projectId === normalizedProjectId);
}

async function getSpace(folderPath, projectId, spaceId) {
  await ensureWorkspaceReady(folderPath);
  return ensureSpace(folderPath, projectId, spaceId);
}

async function listItems(folderPath, projectId, spaceId) {
  const normalizedProjectId = requireId(projectId, "Project id");
  const normalizedSpaceId = requireId(spaceId, "Space id");
  const index = await loadIndex(folderPath);
  await ensureSpace(folderPath, normalizedProjectId, normalizedSpaceId);
  return index.items.filter((entry) => (
    entry.projectId === normalizedProjectId
    && entry.spaceId === normalizedSpaceId
  ));
}

async function loadCanvas(folderPath, projectId, spaceId, canvasId) {
  const { metadata, index, uiState } = await ensureWorkspaceReady(folderPath);
  const canvas = await ensureCanvas(folderPath, projectId, spaceId, canvasId);
  const thumbnailPath = await resolveExistingRelativePath(
    folderPath,
    getCanvasPreviewRelativePath(canvas.id),
  );
  let nextIndex = updateIndexItem(index, {
    ...canvas,
    thumbnailPath,
  });
  nextIndex = recordRecentInIndex(nextIndex, canvas.id);
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: canvas.projectId,
    lastOpenedSpaceId: canvas.spaceId,
    lastOpenedItemId: canvas.id,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, metadata);
  return canvas;
}

async function saveCanvas(folderPath, projectId, spaceId, canvasId, data) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const existingCanvas = await ensureCanvas(folderPath, projectId, spaceId, canvasId);
  const canvas = rendererWorkspaceToCanvasDocument(
    existingCanvas.projectId,
    existingCanvas.spaceId,
    existingCanvas.id,
    existingCanvas.name,
    data,
    existingCanvas,
  );

  await writeCanvas(folderPath, canvas);
  const thumbnailPath = await writeCanvasPreview(folderPath, canvas);

  const { project: updatedProject, space: updatedSpace } = await touchProjectAndSpace(
    folderPath,
    canvas.projectId,
    canvas.spaceId,
    canvas.updatedAt,
  );
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = updateIndexProject(index, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, updatedSpace);
  nextIndex = updateIndexItem(nextIndex, {
    ...canvas,
    thumbnailPath,
  });
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: canvas.projectId,
    lastOpenedSpaceId: canvas.spaceId,
    lastOpenedItemId: canvas.id,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, workspaceMetadata);
  return canvas;
}

async function loadPage(folderPath, projectId, spaceId, pageId) {
  const { metadata, index, uiState } = await ensureWorkspaceReady(folderPath);
  const normalizedProjectId = requireId(projectId, "Project id");
  const normalizedSpaceId = requireId(spaceId, "Space id");
  const normalizedPageId = requireId(pageId, "Page id");

  await ensureSpace(folderPath, normalizedProjectId, normalizedSpaceId);

  const markdown = await readPageMarkdown(folderPath, normalizedProjectId, normalizedSpaceId, normalizedPageId);
  const item = index.items.find((entry) => entry.id === normalizedPageId && entry.type === "page");
  const page = {
    id: normalizedPageId,
    projectId: normalizedProjectId,
    spaceId: normalizedSpaceId,
    type: "page",
    name: item?.name ?? resolvePageName(markdown, normalizedPageId),
    markdown,
    updatedAt: item?.updatedAt ?? await getPageUpdatedAt(
      folderPath,
      normalizedProjectId,
      normalizedSpaceId,
      normalizedPageId,
    ),
  };
  let nextIndex = updateIndexItem(index, {
    ...page,
    excerpt: extractPageExcerpt(markdown),
  });
  nextIndex = recordRecentInIndex(nextIndex, page.id);
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: page.projectId,
    lastOpenedSpaceId: page.spaceId,
    lastOpenedItemId: page.id,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, metadata);
  return page;
}

async function savePage(folderPath, projectId, spaceId, pageId, markdown) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const space = await ensureSpace(folderPath, projectId, spaceId);
  const normalizedPageId = requireId(pageId, "Page id");
  const nextMarkdown = typeof markdown === "string" ? markdown : String(markdown ?? "");

  await safeWriteText(
    getPagePath(folderPath, space.projectId, space.id, normalizedPageId),
    nextMarkdown,
  );

  const timestamp = nowIso();
  const existingItem = index.items.find((entry) => entry.id === normalizedPageId && entry.type === "page");
  const nextPage = {
    id: normalizedPageId,
    projectId: space.projectId,
    spaceId: space.id,
    type: "page",
    name: existingItem?.name ?? resolvePageName(nextMarkdown, DEFAULT_PAGE_NAME),
    updatedAt: timestamp,
    excerpt: extractPageExcerpt(nextMarkdown),
  };
  const { project: updatedProject, space: updatedSpace } = await touchProjectAndSpace(
    folderPath,
    space.projectId,
    space.id,
    timestamp,
  );
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = updateIndexProject(index, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, updatedSpace);
  nextIndex = updateIndexItem(nextIndex, nextPage);
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: space.projectId,
    lastOpenedSpaceId: space.id,
    lastOpenedItemId: normalizedPageId,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, workspaceMetadata);

  return {
    ...nextPage,
    markdown: nextMarkdown,
  };
}

async function renameProject(folderPath, projectId, name) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const project = await ensureProject(folderPath, projectId);
  const renamedProject = {
    ...project,
    name: requireName(name, "Project"),
    updatedAt: nowIso(),
  };

  await writeProject(folderPath, renamedProject);

  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  const nextIndex = updateIndexProject(index, renamedProject);
  await writeIndexAndUiState(folderPath, nextIndex, uiState, workspaceMetadata);
  return renamedProject;
}

async function renameSpace(folderPath, projectId, spaceId, name) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const space = await ensureSpace(folderPath, projectId, spaceId);
  const timestamp = nowIso();
  const renamedSpace = {
    ...space,
    name: requireName(name, "Space"),
    updatedAt: timestamp,
  };

  await writeSpace(folderPath, renamedSpace);

  const updatedProject = await touchProject(folderPath, renamedSpace.projectId, timestamp);
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = updateIndexProject(index, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, renamedSpace);
  await writeIndexAndUiState(folderPath, nextIndex, uiState, workspaceMetadata);
  return renamedSpace;
}

async function renameCanvas(folderPath, projectId, spaceId, canvasId, name) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const canvas = await ensureCanvas(folderPath, projectId, spaceId, canvasId);
  const renamedCanvas = {
    ...canvas,
    name: requireName(name, "Canvas"),
    updatedAt: nowIso(),
  };

  await writeCanvas(folderPath, renamedCanvas);
  const thumbnailPath = await writeCanvasPreview(folderPath, renamedCanvas);

  const { project: updatedProject, space: updatedSpace } = await touchProjectAndSpace(
    folderPath,
    renamedCanvas.projectId,
    renamedCanvas.spaceId,
    renamedCanvas.updatedAt,
  );
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = updateIndexProject(index, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, updatedSpace);
  nextIndex = updateIndexItem(nextIndex, {
    ...renamedCanvas,
    thumbnailPath,
  });
  await writeIndexAndUiState(folderPath, nextIndex, uiState, workspaceMetadata);
  return renamedCanvas;
}

async function renamePage(folderPath, projectId, spaceId, pageId, name) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const space = await ensureSpace(folderPath, projectId, spaceId);
  const normalizedPageId = requireId(pageId, "Page id");
  const existingItem = index.items.find((entry) => entry.id === normalizedPageId && entry.type === "page");
  const timestamp = nowIso();
  const { project: updatedProject, space: updatedSpace } = await touchProjectAndSpace(
    folderPath,
    space.projectId,
    space.id,
    timestamp,
  );
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = updateIndexProject(index, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, updatedSpace);
  nextIndex = updateIndexItem(nextIndex, {
    id: normalizedPageId,
    projectId: space.projectId,
    spaceId: space.id,
    type: "page",
    name: requireName(name, "Page"),
    updatedAt: timestamp,
    excerpt: existingItem?.excerpt ?? "",
  });

  await writeIndexAndUiState(folderPath, nextIndex, uiState, workspaceMetadata);

  return nextIndex.items.find((entry) => entry.id === normalizedPageId && entry.type === "page") ?? null;
}

async function deleteProject(folderPath, projectId) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const normalizedProjectId = requireId(projectId, "Project id");
  await ensureProject(folderPath, normalizedProjectId);
  const previewItems = index.items.filter((entry) => entry.projectId === normalizedProjectId);
  await fs.rm(getProjectPath(folderPath, normalizedProjectId), { recursive: true, force: true });
  await Promise.all(previewItems.map((entry) => removeRelativeFile(folderPath, entry.thumbnailPath)));

  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  const nextIndex = removeProjectFromIndex(index, normalizedProjectId);
  await writeIndexAndUiState(folderPath, nextIndex, uiState, workspaceMetadata);
  return { deleted: true };
}

async function deleteSpace(folderPath, projectId, spaceId) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const normalizedProjectId = requireId(projectId, "Project id");
  const normalizedSpaceId = requireId(spaceId, "Space id");
  await ensureSpace(folderPath, normalizedProjectId, normalizedSpaceId);
  const previewItems = index.items.filter((entry) => entry.spaceId === normalizedSpaceId);
  await fs.rm(getSpacePath(folderPath, normalizedProjectId, normalizedSpaceId), { recursive: true, force: true });
  await Promise.all(previewItems.map((entry) => removeRelativeFile(folderPath, entry.thumbnailPath)));

  const updatedProject = await touchProject(folderPath, normalizedProjectId);
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = removeSpaceFromIndex(index, normalizedSpaceId);
  nextIndex = updateIndexProject(nextIndex, updatedProject);
  await writeIndexAndUiState(folderPath, nextIndex, uiState, workspaceMetadata);
  return { deleted: true };
}

async function deleteCanvas(folderPath, projectId, spaceId, canvasId) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const canvas = await ensureCanvas(folderPath, projectId, spaceId, canvasId);
  const existingItem = index.items.find((entry) => entry.id === canvas.id);
  await fs.rm(getCanvasPath(folderPath, canvas.projectId, canvas.spaceId, canvas.id), { force: true });
  await removeRelativeFile(
    folderPath,
    existingItem?.thumbnailPath ?? getCanvasPreviewRelativePath(canvas.id),
  );

  const timestamp = nowIso();
  const { project: updatedProject, space: updatedSpace } = await touchProjectAndSpace(
    folderPath,
    canvas.projectId,
    canvas.spaceId,
    timestamp,
  );
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = removeItemFromIndex(index, canvas.id);
  nextIndex = updateIndexProject(nextIndex, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, updatedSpace);
  await writeIndexAndUiState(folderPath, nextIndex, uiState, workspaceMetadata);
  return { deleted: true };
}

async function deletePage(folderPath, projectId, spaceId, pageId) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const space = await ensureSpace(folderPath, projectId, spaceId);
  const normalizedPageId = requireId(pageId, "Page id");
  await fs.rm(getPagePath(folderPath, space.projectId, space.id, normalizedPageId), { force: true });

  const timestamp = nowIso();
  const { project: updatedProject, space: updatedSpace } = await touchProjectAndSpace(
    folderPath,
    space.projectId,
    space.id,
    timestamp,
  );
  const workspaceMetadata = await touchWorkspaceMetadata(folderPath);
  let nextIndex = removeItemFromIndex(index, normalizedPageId);
  nextIndex = updateIndexProject(nextIndex, updatedProject);
  nextIndex = updateIndexSpace(nextIndex, updatedSpace);
  await writeIndexAndUiState(folderPath, nextIndex, uiState, workspaceMetadata);
  return { deleted: true };
}

async function loadIndex(folderPath) {
  const { index } = await ensureWorkspaceReady(folderPath);
  return index;
}

async function saveIndex(folderPath, index) {
  const { metadata, uiState } = await ensureWorkspaceReady(folderPath);
  const nextIndex = await writeIndexMetadata(folderPath, index, metadata);
  await writeUiStateMetadata(folderPath, uiState, nextIndex);
  return nextIndex;
}

async function getRecentItems(folderPath) {
  const index = await loadIndex(folderPath);
  return getOrderedItems(index, index.recentItemIds);
}

async function getStarredItems(folderPath) {
  const index = await loadIndex(folderPath);
  return getOrderedItems(index, index.starredItemIds);
}

async function getProjectsSummary(folderPath) {
  const index = await loadIndex(folderPath);
  return [...index.projects]
    .map((project) => buildProjectSummary(index, project))
    .sort(compareByUpdatedAtDesc);
}

async function getProjectContents(folderPath, projectId) {
  const normalizedProjectId = requireId(projectId, "Project id");
  const index = await loadIndex(folderPath);
  const projectsById = getProjectMap(index);
  const spacesById = getSpaceMap(index);
  const project = projectsById.get(normalizedProjectId);

  if (!project) {
    throw new Error(`Project "${normalizedProjectId}" does not exist.`);
  }

  const spaces = index.spaces
    .filter((entry) => entry.projectId === normalizedProjectId)
    .map((space) => ({
      ...buildSpaceSummary(index, space),
      items: index.items
        .filter((item) => item.projectId === normalizedProjectId && item.spaceId === space.id)
        .map((item) => decorateItemForHome(item, projectsById, spacesById))
        .sort(compareByUpdatedAtDesc),
    }))
    .sort(compareByUpdatedAtDesc);

  return {
    project: buildProjectSummary(index, project),
    spaces,
    items: index.items
      .filter((entry) => entry.projectId === normalizedProjectId)
      .map((item) => decorateItemForHome(item, projectsById, spacesById))
      .sort(compareByUpdatedAtDesc),
  };
}

async function getSpaceContents(folderPath, projectId, spaceId) {
  const normalizedProjectId = requireId(projectId, "Project id");
  const normalizedSpaceId = requireId(spaceId, "Space id");
  const index = await loadIndex(folderPath);
  const projectsById = getProjectMap(index);
  const spacesById = getSpaceMap(index);
  const project = projectsById.get(normalizedProjectId);
  const space = spacesById.get(normalizedSpaceId);

  if (!project) {
    throw new Error(`Project "${normalizedProjectId}" does not exist.`);
  }

  if (!space || space.projectId !== normalizedProjectId) {
    throw new Error(`Space "${normalizedSpaceId}" does not exist.`);
  }

  return {
    project: buildProjectSummary(index, project),
    space: buildSpaceSummary(index, space),
    items: index.items
      .filter((entry) => entry.projectId === normalizedProjectId && entry.spaceId === normalizedSpaceId)
      .map((item) => decorateItemForHome(item, projectsById, spacesById))
      .sort(compareByUpdatedAtDesc),
  };
}

async function getHomeData(folderPath) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);

  return {
    workspace: index.workspace,
    projects: [...index.projects]
      .map((project) => buildProjectSummary(index, project))
      .sort(compareByUpdatedAtDesc),
    recentItems: getOrderedItems(index, index.recentItemIds),
    starredItems: getOrderedItems(index, index.starredItemIds),
    uiState,
  };
}

async function markItemStarred(folderPath, itemId, starred) {
  const { metadata, index, uiState } = await ensureWorkspaceReady(folderPath);
  const normalizedItemId = requireId(itemId, "Item id");
  const item = index.items.find((entry) => entry.id === normalizedItemId);

  if (!item) {
    throw new Error(`Item "${normalizedItemId}" does not exist.`);
  }

  const nextIndex = setItemStarredInIndex(index, normalizedItemId, starred === true);
  await writeIndexAndUiState(folderPath, nextIndex, uiState, metadata);
  return nextIndex.items.find((entry) => entry.id === normalizedItemId) ?? null;
}

async function recordRecentItem(folderPath, itemId) {
  const { metadata, index, uiState } = await ensureWorkspaceReady(folderPath);
  const normalizedItemId = requireId(itemId, "Item id");
  const item = index.items.find((entry) => entry.id === normalizedItemId);

  if (!item) {
    throw new Error(`Item "${normalizedItemId}" does not exist.`);
  }

  const nextIndex = recordRecentInIndex(index, normalizedItemId);
  const nextUiState = {
    ...uiState,
    lastOpenedProjectId: item.projectId,
    lastOpenedSpaceId: item.spaceId,
    lastOpenedItemId: item.id,
  };

  await writeIndexAndUiState(folderPath, nextIndex, nextUiState, metadata);
  return getOrderedItems(nextIndex, nextIndex.recentItemIds);
}

async function loadUiState(folderPath) {
  const { uiState } = await ensureWorkspaceReady(folderPath);
  return uiState;
}

async function saveUiState(folderPath, partialState) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  return writeUiStateMetadata(folderPath, {
    ...uiState,
    ...(isPlainObject(partialState) ? partialState : {}),
  }, index);
}

async function inspectCreateWorkspaceIssues(folderPath) {
  const issues = [];

  if (await pathExists(getPhaseOneWorkspacePath(folderPath)) || await pathExists(getLegacyDataPath(folderPath))) {
    issues.push("Legacy AirPaste data already exists in this folder. Use Open existing workspace instead.");
  }

  if (await pathExists(getWorkspaceMetadataPath(folderPath))) {
    issues.push("airpaste.json already exists. Use Open existing workspace or choose another folder.");
  }

  if (await pathExists(getProjectsPath(folderPath))) {
    issues.push("projects/ already exists. Use Open existing workspace or choose another folder.");
  }

  if (await pathExists(getWorkspaceIndexDirectoryPath(folderPath))) {
    issues.push(".airpaste already exists. Use Open existing workspace or choose another folder.");
  }

  return issues;
}

async function createWorkspace(folderPath) {
  if (!(await isDirectory(folderPath))) {
    throw new Error("Selected folder is no longer available.");
  }

  if (await isValidWorkspace(folderPath)) {
    throw new Error("This folder is already a valid AirPaste workspace. Use Open existing workspace instead.");
  }

  const issues = await inspectCreateWorkspaceIssues(folderPath);

  if (issues.length > 0) {
    throw createValidationError(issues);
  }

  await fs.mkdir(getProjectsPath(folderPath), { recursive: true });
  await fs.mkdir(getWorkspaceIndexDirectoryPath(folderPath), { recursive: true });
  await writeWorkspaceMetadata(folderPath, createWorkspaceMetadataPayload(folderPath));
  await writeIndexMetadata(folderPath, cloneDefaultIndexMetadata());
  await safeWriteJson(getWorkspaceUiStatePath(folderPath), cloneDefaultUiState());

  const project = await createProject(folderPath, DEFAULT_PROJECT_NAME);
  const space = await createSpace(folderPath, project.id, DEFAULT_SPACE_NAME);
  const canvas = await createCanvas(folderPath, project.id, space.id, DEFAULT_CANVAS_NAME);

  return {
    folderPath,
    projectId: project.id,
    spaceId: space.id,
    canvasId: canvas.id,
    workspace: canvasDocumentToRendererWorkspace(canvas),
  };
}

async function readLegacyWorkspace(folderPath) {
  const candidates = [
    {
      filePath: getPhaseOneWorkspacePath(folderPath),
      label: "workspace.json",
      source: "workspace.json",
    },
    {
      filePath: getLegacyDataPath(folderPath),
      label: "data.json",
      source: "data.json",
    },
  ];

  for (const candidate of candidates) {
    const stats = await statOrNull(candidate.filePath);

    if (!stats) {
      continue;
    }

    if (!stats.isFile()) {
      throw createValidationError([`${candidate.label} must be a file.`]);
    }

    return {
      source: candidate.source,
      workspace: normalizeRendererWorkspace(await readJsonObject(candidate.filePath, candidate.label)),
    };
  }

  return null;
}

async function migrateLegacyWorkspaceToPhaseTwo(folderPath) {
  const legacyWorkspace = await readLegacyWorkspace(folderPath);

  if (!legacyWorkspace) {
    return null;
  }

  const metadata = await pathExists(getWorkspaceMetadataPath(folderPath))
    ? normalizeWorkspaceMetadata(await readJsonObject(getWorkspaceMetadataPath(folderPath), "airpaste.json"), folderPath)
    : createWorkspaceMetadataPayload(folderPath);
  const projectId = createId();
  const spaceId = createId();
  const canvasId = createId();
  const project = createProjectMetadata(DEFAULT_PROJECT_NAME, projectId);
  const space = createSpaceMetadata(projectId, DEFAULT_SPACE_NAME, spaceId);
  const canvas = createCanvasDocument(projectId, spaceId, DEFAULT_CANVAS_NAME, canvasId, legacyWorkspace.workspace);

  await fs.mkdir(getProjectsPath(folderPath), { recursive: true });
  await fs.mkdir(getWorkspaceIndexDirectoryPath(folderPath), { recursive: true });
  const workspaceMetadata = await writeWorkspaceMetadata(folderPath, {
    ...metadata,
    updatedAt: nowIso(),
  });
  await fs.mkdir(getProjectSpacesPath(folderPath, projectId), { recursive: true });
  await writeProject(folderPath, project);
  await fs.mkdir(getSpaceCanvasesPath(folderPath, projectId, spaceId), { recursive: true });
  await fs.mkdir(getSpacePagesPath(folderPath, projectId, spaceId), { recursive: true });
  await writeSpace(folderPath, space);
  await writeCanvas(folderPath, canvas);
  const thumbnailPath = await writeCanvasPreview(folderPath, canvas);
  const migratedIndex = await writeIndexMetadata(folderPath, {
    version: INDEX_METADATA_VERSION,
    workspace: {
      name: workspaceMetadata.name,
      createdAt: workspaceMetadata.createdAt,
      updatedAt: workspaceMetadata.updatedAt,
    },
    projects: [
      {
        id: project.id,
        type: "project",
        name: project.name,
        relativePath: getProjectRelativePath(project.id),
        updatedAt: project.updatedAt,
      },
    ],
    spaces: [
      {
        id: space.id,
        projectId: space.projectId,
        type: "space",
        name: space.name,
        relativePath: getSpaceRelativePath(space.projectId, space.id),
        updatedAt: space.updatedAt,
      },
    ],
    items: [
      {
        id: canvas.id,
        projectId: canvas.projectId,
        spaceId: canvas.spaceId,
        type: "canvas",
        name: canvas.name,
        relativePath: getCanvasRelativePath(canvas.projectId, canvas.spaceId, canvas.id),
        updatedAt: canvas.updatedAt,
        starred: false,
        thumbnailPath,
        excerpt: "",
      },
    ],
    recentItemIds: [canvas.id],
    starredItemIds: [],
  }, workspaceMetadata);
  await writeUiStateMetadata(folderPath, {
    lastOpenedProjectId: project.id,
    lastOpenedSpaceId: space.id,
    lastOpenedItemId: canvas.id,
  }, migratedIndex);

  return {
    projectId: project.id,
    spaceId: space.id,
    canvasId: canvas.id,
    workspace: canvasDocumentToRendererWorkspace(canvas),
  };
}

async function listDirectoryEntries(directoryPath) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return [...entries].sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function rebuildIndex(folderPath) {
  const { metadata } = await ensureWorkspacePrepared(folderPath);
  let existingIndex = null;

  try {
    existingIndex = (await readIndexMetadata(folderPath, metadata)).index;
  } catch {
    existingIndex = null;
  }

  const preservedItemState = new Map(
    (existingIndex?.items ?? []).map((entry) => [entry.id, entry]),
  );
  const projects = [];
  const spaces = [];
  const items = [];

  for (const projectEntry of await listDirectoryEntries(getProjectsPath(folderPath))) {
    if (!projectEntry.isDirectory()) {
      continue;
    }

    const project = await readProject(folderPath, projectEntry.name);
    projects.push({
      id: project.id,
      type: "project",
      name: project.name,
      relativePath: getProjectRelativePath(project.id),
      updatedAt: project.updatedAt,
    });

    for (const spaceEntry of await listDirectoryEntries(getProjectSpacesPath(folderPath, project.id))) {
      if (!spaceEntry.isDirectory()) {
        continue;
      }

      const space = await readSpace(folderPath, project.id, spaceEntry.name);
      spaces.push({
        id: space.id,
        projectId: space.projectId,
        type: "space",
        name: space.name,
        relativePath: getSpaceRelativePath(space.projectId, space.id),
        updatedAt: space.updatedAt,
      });

      for (const canvasEntry of await listDirectoryEntries(getSpaceCanvasesPath(folderPath, project.id, space.id))) {
        if (!canvasEntry.isFile() || !canvasEntry.name.endsWith(".json")) {
          continue;
        }

        const canvasId = canvasEntry.name.slice(0, -".json".length);
        const canvas = await readCanvas(folderPath, project.id, space.id, canvasId);
        const preservedState = preservedItemState.get(canvas.id);
        const thumbnailPath = await writeCanvasPreview(folderPath, canvas);

        items.push({
          id: canvas.id,
          projectId: canvas.projectId,
          spaceId: canvas.spaceId,
          type: "canvas",
          name: canvas.name,
          relativePath: getCanvasRelativePath(canvas.projectId, canvas.spaceId, canvas.id),
          updatedAt: canvas.updatedAt,
          starred: preservedState?.starred === true,
          thumbnailPath: thumbnailPath ?? await resolveExistingRelativePath(folderPath, preservedState?.thumbnailPath),
          excerpt: "",
        });
      }

      for (const pageEntry of await listDirectoryEntries(getSpacePagesPath(folderPath, project.id, space.id))) {
        if (!pageEntry.isFile() || !pageEntry.name.endsWith(".md")) {
          continue;
        }

        const pageId = pageEntry.name.slice(0, -".md".length);
        const markdown = await readPageMarkdown(folderPath, project.id, space.id, pageId);
        const preservedState = preservedItemState.get(pageId);

        items.push({
          id: pageId,
          projectId: project.id,
          spaceId: space.id,
          type: "page",
          name: preservedState?.name ?? resolvePageName(markdown, pageId),
          relativePath: getPageRelativePath(project.id, space.id, pageId),
          updatedAt: await getPageUpdatedAt(folderPath, project.id, space.id, pageId),
          starred: preservedState?.starred === true,
          thumbnailPath: null,
          excerpt: extractPageExcerpt(markdown),
        });
      }
    }
  }

  const nextIndex = normalizeIndexCollections(normalizeIndexMetadata({
    version: INDEX_METADATA_VERSION,
    workspace: {
      name: metadata.name,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    },
    projects,
    spaces,
    items,
    recentItemIds: existingIndex?.recentItemIds ?? [],
    starredItemIds: existingIndex?.starredItemIds ?? [],
  }, metadata));
  const savedIndex = await writeIndexMetadata(folderPath, nextIndex, metadata);
  const fallbackSelection = {
    lastOpenedProjectId: savedIndex.items[0]?.projectId ?? null,
    lastOpenedSpaceId: savedIndex.items[0]?.spaceId ?? null,
    lastOpenedItemId: savedIndex.recentItemIds[0] ?? savedIndex.items[0]?.id ?? null,
  };

  await readUiStateMetadata(folderPath, savedIndex, fallbackSelection);
  return savedIndex;
}

async function ensureWorkspaceReady(folderPath) {
  const prepared = await ensureWorkspacePrepared(folderPath);
  let indexState;

  try {
    indexState = await readIndexMetadata(folderPath, prepared.metadata);
  } catch (error) {
    if (!shouldRebuildIndex(error)) {
      throw error;
    }

    indexState = {
      index: await rebuildIndex(folderPath),
      legacySelection: {},
    };
  }

  const uiState = await readUiStateMetadata(
    folderPath,
    indexState.index,
    indexState.legacySelection,
  );

  return {
    ...prepared,
    index: indexState.index,
    uiState,
  };
}

function resolvePreferredCanvasEntry(index, uiState) {
  const itemEntriesById = getItemMap(index);
  const preferredItem = itemEntriesById.get(uiState.lastOpenedItemId);

  if (preferredItem?.type === "canvas") {
    return preferredItem;
  }

  for (const itemId of index.recentItemIds) {
    const recentItem = itemEntriesById.get(itemId);

    if (recentItem?.type === "canvas") {
      return recentItem;
    }
  }

  return index.items.find((entry) => entry.type === "canvas") ?? null;
}

async function resolveActiveCanvas(folderPath) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const activeCanvas = resolvePreferredCanvasEntry(index, uiState);

  if (!activeCanvas) {
    throw new Error("This workspace does not contain any canvases yet.");
  }

  return loadCanvas(folderPath, activeCanvas.projectId, activeCanvas.spaceId, activeCanvas.id);
}

async function loadWorkspace(folderPath) {
  const canvas = await resolveActiveCanvas(folderPath);

  return {
    folderPath,
    projectId: canvas.projectId,
    spaceId: canvas.spaceId,
    canvasId: canvas.id,
    workspace: canvasDocumentToRendererWorkspace(canvas),
  };
}

async function readWorkspaceDocument(folderPath) {
  const payload = await loadWorkspace(folderPath);
  return payload.workspace;
}

async function saveWorkspace(folderPath, data) {
  const { index, uiState } = await ensureWorkspaceReady(folderPath);
  const activeCanvas = resolvePreferredCanvasEntry(index, uiState);

  if (!activeCanvas) {
    throw new Error("This workspace does not contain any canvases yet.");
  }

  const savedCanvas = await saveCanvas(
    folderPath,
    activeCanvas.projectId,
    activeCanvas.spaceId,
    activeCanvas.id,
    data,
  );

  return canvasDocumentToRendererWorkspace(savedCanvas);
}

module.exports = {
  createCanvas,
  createPage,
  createProject,
  createSpace,
  createWorkspace,
  deleteCanvas,
  deletePage,
  deleteProject,
  deleteSpace,
  getHomeData,
  getProject,
  getProjectContents,
  getProjectsSummary,
  getRecentItems,
  getSpace,
  getSpaceContents,
  getStarredItems,
  isValidWorkspace,
  listItems,
  listProjects,
  listSpaces,
  loadCanvas,
  loadIndex,
  loadPage,
  loadUiState,
  loadWorkspace,
  markItemStarred,
  readWorkspaceDocument,
  rebuildIndex,
  recordRecentItem,
  renameCanvas,
  renamePage,
  renameProject,
  renameSpace,
  saveCanvas,
  saveIndex,
  savePage,
  saveUiState,
  saveWorkspace,
};
