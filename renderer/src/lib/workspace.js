import TILE_TYPES from "../tiles/tileTypes";
import {
  clamp,
  getDefaultCameraDistance,
  getDefaultWorkspaceView,
  MAX_CAMERA_DISTANCE,
  MIN_GLOBE_RADIUS,
  getSoftGlobeRadius,
} from "../systems/globe/globeLayout";
import { createEmptyDrawings, normalizeDrawings } from "../systems/drawing/drawingTypes";
import {
  getTextBoxLineCount,
  normalizeTextBoxStyle,
  normalizeTextBoxText,
  TEXT_BOX_DEFAULT_STYLE,
  TEXT_BOX_DEFAULT_TEXT,
} from "./textBoxStyle";

export const RACK_CARD_TYPE = TILE_TYPES.RACK;
export const AMAZON_PRODUCT_CARD_TYPE = TILE_TYPES.AMAZON_PRODUCT;
export const CHECKLIST_CARD_TYPE = TILE_TYPES.CHECKLIST;
export const CODE_CARD_TYPE = TILE_TYPES.CODE;
export const COUNTER_CARD_TYPE = TILE_TYPES.COUNTER;
export const DEADLINE_CARD_TYPE = TILE_TYPES.DEADLINE;
export const NOTE_CARD_TYPE = TILE_TYPES.NOTE;
export const PROGRESS_CARD_TYPE = TILE_TYPES.PROGRESS;
export const TABLE_CARD_TYPE = TILE_TYPES.TABLE;
export const TEXT_BOX_CARD_TYPE = TILE_TYPES.TEXT_BOX;
export const LINK_CONTENT_KIND_BOOKMARK = "bookmark";
export const LINK_CONTENT_KIND_IMAGE = "image";
export const WORKSPACE_SCHEMA_VERSION = 15;
export const CANVAS_SELECTION_CLIPBOARD_TYPE = "airpaste/canvas-selection";
export const RACK_MIN_SLOTS = 3;
export const RACK_SLOT_WIDTH = 216;
export const RACK_LEFT_CAP_WIDTH = 94;
export const RACK_RIGHT_CAP_WIDTH = 94;
export const RACK_HEIGHT = 126;
export const RACK_TILE_BASELINE = 44;
const DEFAULT_PAGE_NAME = "Page 1";
const LEGACY_FOLDER_CARD_TYPE = "folder";
const LEGACY_FOLDER_ZONE_GAP = 24;
const LEGACY_FOLDER_ZONE_MIN_WIDTH = 860;
const STRUCTURED_TILE_REFERENCE_KEY_PATTERN = /(tile|card|node|member|source|target|from|to|start|end|child).*(id|ids)$/i;

const DEFAULT_VIEWPORT = Object.freeze({
  x: 180,
  y: 120,
  zoom: 1,
});

const LINK_CARD_SIZE = Object.freeze({
  width: 340,
  height: 280,
});

const AMAZON_PRODUCT_CARD_SIZE = Object.freeze({
  width: 340,
  height: 388,
});

const CHECKLIST_CARD_SIZE = Object.freeze({
  width: 380,
  height: 360,
});

const CODE_CARD_SIZE = Object.freeze({
  width: 520,
  height: 360,
});

const COUNTER_CARD_SIZE = Object.freeze({
  width: 360,
  height: 300,
});

const DEADLINE_CARD_SIZE = Object.freeze({
  width: 400,
  height: 320,
});

const NOTE_CARD_SIZE = Object.freeze({
  width: 460,
  height: 420,
});

const PROGRESS_CARD_SIZE = Object.freeze({
  width: 400,
  height: 280,
});

const TABLE_CARD_SIZE = Object.freeze({
  width: 560,
  height: 360,
});

const TEXT_BOX_CARD_SIZE = Object.freeze({
  width: 520,
  height: 180,
});

const RACK_CARD_SIZE = Object.freeze({
  width: RACK_LEFT_CAP_WIDTH + RACK_RIGHT_CAP_WIDTH + (RACK_SLOT_WIDTH * RACK_MIN_SLOTS),
  height: RACK_HEIGHT,
});

const RACK_DEFAULT_TITLE = "Rack";
const RACK_DEFAULT_DESCRIPTION = "Mounted display rack";
const CHECKLIST_DEFAULT_TITLE = "Checklist";
const CODE_DEFAULT_TITLE = "Untitled snippet";
const CODE_DEFAULT_LANGUAGE = "plain";
const COUNTER_DEFAULT_TITLE = "Counter";
const COUNTER_DEFAULT_VALUE = 0;
const COUNTER_DEFAULT_STEP = 1;
const COUNTER_DEFAULT_UNIT = "";
const DEADLINE_DEFAULT_TITLE = "Launch countdown";
const DEADLINE_DEFAULT_TIMEZONE = "local";
const PROGRESS_DEFAULT_TITLE = "Feature progress";
const PROGRESS_DEFAULT_MODE = "manual";
const PROGRESS_DEFAULT_VALUE = 0;
const PROGRESS_DEFAULT_MAX = 100;
const NOTE_DEFAULT_TITLE = "Untitled note";
const TABLE_DEFAULT_TITLE = "Untitled table";
const CHECKLIST_DEFAULT_ITEMS = Object.freeze([
  Object.freeze({
    id: "item-1",
    text: "",
    checked: false,
  }),
]);
const TABLE_COLUMN_KINDS = Object.freeze(["text", "number", "checkbox", "date"]);
const TABLE_DEFAULT_COLUMNS = Object.freeze([
  Object.freeze({ id: "col_name", name: "Name", kind: "text" }),
  Object.freeze({ id: "col_status", name: "Status", kind: "text" }),
  Object.freeze({ id: "col_notes", name: "Notes", kind: "text" }),
]);
const TABLE_DEFAULT_ROWS = Object.freeze([
  Object.freeze({
    id: "row_1",
    cells: Object.freeze({
      col_name: "",
      col_status: "",
      col_notes: "",
    }),
  }),
]);
const CODE_SUPPORTED_LANGUAGES = Object.freeze([
  "plain",
  "bash",
  "javascript",
  "typescript",
  "json",
  "css",
  "html",
  "sql",
  "regex",
  "python",
  "markdown",
  "yaml",
]);
const LINK_PREVIEW_STATUSES = Object.freeze(["idle", "loading", "ready", "fallback", "blocked", "error", "failed"]);

function nowIso() {
  return new Date().toISOString();
}

function generateWorkspacePageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `page-${Math.random().toString(36).slice(2, 10)}`;
}

function generateWorkspaceEntityId(prefix = "item") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function getCardType(card) {
  if (card?.type === TILE_TYPES.LINK) {
    return TILE_TYPES.LINK;
  }

  if (card?.type === AMAZON_PRODUCT_CARD_TYPE) {
    return AMAZON_PRODUCT_CARD_TYPE;
  }

  if (card?.type === CHECKLIST_CARD_TYPE) {
    return CHECKLIST_CARD_TYPE;
  }

  if (card?.type === CODE_CARD_TYPE) {
    return CODE_CARD_TYPE;
  }

  if (card?.type === COUNTER_CARD_TYPE) {
    return COUNTER_CARD_TYPE;
  }

  if (card?.type === DEADLINE_CARD_TYPE) {
    return DEADLINE_CARD_TYPE;
  }

  if (card?.type === NOTE_CARD_TYPE) {
    return NOTE_CARD_TYPE;
  }

  if (card?.type === PROGRESS_CARD_TYPE) {
    return PROGRESS_CARD_TYPE;
  }

  if (card?.type === TABLE_CARD_TYPE) {
    return TABLE_CARD_TYPE;
  }

  if (card?.type === TEXT_BOX_CARD_TYPE) {
    return TEXT_BOX_CARD_TYPE;
  }

  if (card?.type === RACK_CARD_TYPE) {
    return RACK_CARD_TYPE;
  }

  return null;
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

function normalizeLegacyFolderChildIds(childIds) {
  return Array.isArray(childIds)
    ? [...new Set(childIds.filter((childId) => typeof childId === "string" && childId.trim().length > 0))]
    : [];
}

function isLinkLikeType(type) {
  return type === TILE_TYPES.LINK || type === AMAZON_PRODUCT_CARD_TYPE;
}

function normalizeChecklistItems(items) {
  const normalizedItems = Array.isArray(items)
    ? items
      .map((item, index) => {
        const text = typeof item?.text === "string" ? item.text : "";
        const checked = item?.checked === true;
        const itemId = typeof item?.id === "string" && item.id.trim().length > 0
          ? item.id.trim()
          : `item-${index + 1}`;

        return {
          id: itemId,
          text,
          checked,
        };
      })
      .filter((item) => item.id.length > 0)
    : [];

  return normalizedItems.length > 0
    ? normalizedItems
    : CHECKLIST_DEFAULT_ITEMS.map((item) => ({ ...item }));
}

function normalizeNoteMode(mode) {
  return mode === "preview" ? "preview" : "edit";
}

function normalizeCodeLanguage(language) {
  return CODE_SUPPORTED_LANGUAGES.includes(language) ? language : CODE_DEFAULT_LANGUAGE;
}

function normalizeCounterValue(value) {
  return Number.isFinite(value) ? Number(value) : COUNTER_DEFAULT_VALUE;
}

function normalizeCounterStep(step) {
  return Number.isFinite(step) && Number(step) > 0 ? Number(step) : COUNTER_DEFAULT_STEP;
}

function normalizeCounterUnit(unit) {
  return typeof unit === "string" ? unit : COUNTER_DEFAULT_UNIT;
}

function normalizeDeadlineTargetAt(targetAt) {
  return typeof targetAt === "string" ? targetAt : "";
}

function normalizeDeadlineTimezone(timezone) {
  return timezone === DEADLINE_DEFAULT_TIMEZONE ? DEADLINE_DEFAULT_TIMEZONE : DEADLINE_DEFAULT_TIMEZONE;
}

function normalizeProgressMode(mode) {
  return mode === "linked" ? "linked" : PROGRESS_DEFAULT_MODE;
}

function normalizeProgressValue(value) {
  return Number.isFinite(value) ? Number(value) : PROGRESS_DEFAULT_VALUE;
}

function normalizeProgressMax(max) {
  return Number.isFinite(max) && Number(max) > 0 ? Number(max) : PROGRESS_DEFAULT_MAX;
}

function normalizeProgressLinkedTileId(linkedTileId) {
  return typeof linkedTileId === "string" && linkedTileId.trim().length > 0
    ? linkedTileId.trim()
    : null;
}

function normalizeTextBoxPayload(card) {
  return {
    text: normalizeTextBoxText(card?.text),
    style: normalizeTextBoxStyle(card?.style),
  };
}

function normalizeLanguageHints(languageHints) {
  return Array.isArray(languageHints)
    ? [...new Set(
      languageHints
        .filter((hint) => typeof hint === "string")
        .map((hint) => hint.trim())
        .filter((hint) => hint.length > 0),
    )]
    : [];
}

function normalizeTableColumnKind(kind) {
  return TABLE_COLUMN_KINDS.includes(kind) ? kind : "text";
}

function createDefaultTableColumns() {
  return TABLE_DEFAULT_COLUMNS.map((column) => ({ ...column }));
}

function createDefaultTableRows(columns = TABLE_DEFAULT_COLUMNS) {
  const safeColumns = Array.isArray(columns) && columns.length > 0
    ? columns
    : TABLE_DEFAULT_COLUMNS;

  return [
    {
      id: "row_1",
      cells: Object.fromEntries(
        safeColumns.map((column) => [
          column.id,
          normalizeTableCellValue(column.kind, TABLE_DEFAULT_ROWS[0]?.cells?.[column.id]),
        ]),
      ),
    },
  ];
}

function normalizeTableColumns(columns) {
  const normalizedColumns = Array.isArray(columns)
    ? columns
      .map((column, index) => ({
        id: typeof column?.id === "string" && column.id.trim().length > 0
          ? column.id.trim()
          : `col_${index + 1}`,
        name: typeof column?.name === "string" && column.name.trim().length > 0
          ? column.name
          : `Column ${index + 1}`,
        kind: normalizeTableColumnKind(column?.kind),
      }))
      .filter((column) => column.id.length > 0)
    : [];

  return normalizedColumns.length > 0 ? normalizedColumns : createDefaultTableColumns();
}

function normalizeTableCellValue(kind, value) {
  if (kind === "checkbox") {
    return value === true;
  }

  return typeof value === "string"
    ? value
    : (value == null ? "" : String(value));
}

function normalizeTableRows(rows, columns) {
  const safeColumns = Array.isArray(columns) && columns.length > 0
    ? columns
    : createDefaultTableColumns();
  const normalizedRows = Array.isArray(rows)
    ? rows
      .map((row, index) => {
        const safeCells = row?.cells && typeof row.cells === "object" ? row.cells : {};

        return {
          id: typeof row?.id === "string" && row.id.trim().length > 0
            ? row.id.trim()
            : `row_${index + 1}`,
          cells: Object.fromEntries(
            safeColumns.map((column) => [
              column.id,
              normalizeTableCellValue(column.kind, safeCells[column.id]),
            ]),
          ),
        };
      })
      .filter((row) => row.id.length > 0)
    : [];

  return normalizedRows.length > 0 ? normalizedRows : createDefaultTableRows(safeColumns);
}

function normalizeRackTileIds(tileIds) {
  return Array.isArray(tileIds)
    ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
    : [];
}

function normalizeLegacyFolderChildLayouts(childIds, childLayouts) {
  const safeLayouts = childLayouts && typeof childLayouts === "object" ? childLayouts : {};

  return Object.fromEntries(
    childIds.map((childId) => {
      const entry = safeLayouts[childId];

      return [
        childId,
        {
          x: Number.isFinite(entry?.x) ? entry.x : 0,
          y: Number.isFinite(entry?.y) ? entry.y : 0,
        },
      ];
    }),
  );
}

function getCardSize(type) {
  if (type === TILE_TYPES.LINK) {
    return LINK_CARD_SIZE;
  }

  if (type === AMAZON_PRODUCT_CARD_TYPE) {
    return AMAZON_PRODUCT_CARD_SIZE;
  }

  if (type === CHECKLIST_CARD_TYPE) {
    return CHECKLIST_CARD_SIZE;
  }

  if (type === CODE_CARD_TYPE) {
    return CODE_CARD_SIZE;
  }

  if (type === COUNTER_CARD_TYPE) {
    return COUNTER_CARD_SIZE;
  }

  if (type === DEADLINE_CARD_TYPE) {
    return DEADLINE_CARD_SIZE;
  }

  if (type === NOTE_CARD_TYPE) {
    return NOTE_CARD_SIZE;
  }

  if (type === PROGRESS_CARD_TYPE) {
    return PROGRESS_CARD_SIZE;
  }

  if (type === TABLE_CARD_TYPE) {
    return TABLE_CARD_SIZE;
  }

  if (type === TEXT_BOX_CARD_TYPE) {
    return TEXT_BOX_CARD_SIZE;
  }

  if (type === RACK_CARD_TYPE) {
    return RACK_CARD_SIZE;
  }

  return RACK_CARD_SIZE;
}

function normalizeCardLayout(layout) {
  const globe = layout?.globe;

  return {
    globe: Number.isFinite(globe?.theta) && Number.isFinite(globe?.phi)
      ? {
        theta: globe.theta,
        phi: globe.phi,
      }
      : null,
  };
}

function normalizePreviewDiagnostics(previewDiagnostics) {
  if (!previewDiagnostics || typeof previewDiagnostics !== "object" || Array.isArray(previewDiagnostics)) {
    return null;
  }

  return JSON.parse(JSON.stringify(previewDiagnostics));
}

function normalizeWorkspaceView(view, tileCount = 0) {
  const defaults = getDefaultWorkspaceView(tileCount);
  const globeRadius = Number.isFinite(view?.globeRadius)
    ? clamp(view.globeRadius, MIN_GLOBE_RADIUS, getSoftGlobeRadius(9999))
    : defaults.globeRadius;

  return {
    mode: view?.mode === "grid" ? "grid" : "flat",
    globeRadius,
    yaw: Number.isFinite(view?.yaw) ? view.yaw : defaults.yaw,
    pitch: Number.isFinite(view?.pitch) ? view.pitch : defaults.pitch,
    cameraDistance: Number.isFinite(view?.cameraDistance)
      ? clamp(view.cameraDistance, getDefaultCameraDistance(globeRadius), MAX_CAMERA_DISTANCE)
      : getDefaultCameraDistance(globeRadius),
    focusedTileId: typeof view?.focusedTileId === "string" ? view.focusedTileId : null,
  };
}

function normalizeWorkspaceViewport(viewport) {
  return {
    x: Number.isFinite(viewport?.x) ? viewport.x : DEFAULT_VIEWPORT.x,
    y: Number.isFinite(viewport?.y) ? viewport.y : DEFAULT_VIEWPORT.y,
    zoom: Number.isFinite(viewport?.zoom) ? viewport.zoom : DEFAULT_VIEWPORT.zoom,
  };
}

function cloneStructuredArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => (
    entry && typeof entry === "object"
      ? JSON.parse(JSON.stringify(entry))
      : entry
  ));
}

function deepCloneStructuredValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeSelectedClipboardTileIds(tileIds) {
  return Array.isArray(tileIds)
    ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
    : [];
}

function isStructuredTileReferenceKey(key) {
  return typeof key === "string" && STRUCTURED_TILE_REFERENCE_KEY_PATTERN.test(key);
}

function collectStructuredTileReferences(value, references = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      collectStructuredTileReferences(entry, references);
    });
    return references;
  }

  if (!value || typeof value !== "object") {
    return references;
  }

  Object.entries(value).forEach(([key, entryValue]) => {
    if (typeof entryValue === "string" && isStructuredTileReferenceKey(key)) {
      references.add(entryValue);
      return;
    }

    if (Array.isArray(entryValue) && isStructuredTileReferenceKey(key)) {
      entryValue.forEach((entry) => {
        if (typeof entry === "string" && entry.trim().length > 0) {
          references.add(entry);
        }
      });
      return;
    }

    collectStructuredTileReferences(entryValue, references);
  });

  return references;
}

function filterClipboardStructuredEntries(entries, selectedTileIdSet) {
  const safeEntries = Array.isArray(entries) ? entries : [];

  return safeEntries
    .map((entry) => {
      const referencedTileIds = [...collectStructuredTileReferences(entry)];

      if (
        referencedTileIds.length === 0
        || !referencedTileIds.every((tileId) => selectedTileIdSet.has(tileId))
      ) {
        return null;
      }

      return deepCloneStructuredValue(entry);
    })
    .filter(Boolean);
}

function filterStructuredEntriesForRemovedTileIds(entries, removedTileIdSet) {
  const safeEntries = Array.isArray(entries) ? entries : [];

  return safeEntries
    .map((entry) => {
      const referencedTileIds = [...collectStructuredTileReferences(entry)];

      if (referencedTileIds.some((tileId) => removedTileIdSet.has(tileId))) {
        return null;
      }

      return deepCloneStructuredValue(entry);
    })
    .filter(Boolean);
}

function remapStructuredTileReferences(value, tileIdMap) {
  if (Array.isArray(value)) {
    return value.map((entry) => remapStructuredTileReferences(entry, tileIdMap));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (typeof entryValue === "string" && isStructuredTileReferenceKey(key)) {
        return [key, tileIdMap.get(entryValue) ?? entryValue];
      }

      if (Array.isArray(entryValue) && isStructuredTileReferenceKey(key)) {
        return [
          key,
          entryValue.map((entry) => (
            typeof entry === "string"
              ? (tileIdMap.get(entry) ?? entry)
              : remapStructuredTileReferences(entry, tileIdMap)
          )),
        ];
      }

      return [key, remapStructuredTileReferences(entryValue, tileIdMap)];
    }),
  );
}

function remapClipboardStructuredEntries(entries, kind, tileIdMap) {
  const safeEntries = Array.isArray(entries) ? entries : [];

  return safeEntries.map((entry, index) => {
    const nextEntry = remapStructuredTileReferences(deepCloneStructuredValue(entry), tileIdMap);

    if (typeof nextEntry?.id === "string" && nextEntry.id.trim().length > 0) {
      return {
        ...nextEntry,
        id: generateWorkspaceEntityId(`${kind}-${index}`),
      };
    }

    return nextEntry;
  });
}

function normalizeWorkspacePage(page, fallbackIndex = 0) {
  const sourceCards = Array.isArray(page?.cards)
    ? page.cards
    : Array.isArray(page?.tiles)
      ? page.tiles
      : [];
  const cards = sourceCards
    .map((card, index) => normalizeCard(card, index))
    .filter(Boolean);

  return {
    id: typeof page?.id === "string" && page.id.trim().length > 0 ? page.id : generateWorkspacePageId(),
    name: firstString(page?.name, `Page ${fallbackIndex + 1}`, DEFAULT_PAGE_NAME),
    viewport: normalizeWorkspaceViewport(page?.viewport),
    view: normalizeWorkspaceView(page?.view, cards.length),
    cards,
    drawings: normalizeDrawings(page?.drawings),
    edges: cloneStructuredArray(page?.edges),
    groups: cloneStructuredArray(page?.groups),
  };
}

function normalizeWorkspacePages(workspace) {
  if (Array.isArray(workspace?.pages) && workspace.pages.length > 0) {
    return workspace.pages
      .map((page, index) => normalizeWorkspacePage(page, index))
      .filter(Boolean);
  }

  return [
    normalizeWorkspacePage({
      id: typeof workspace?.activePageId === "string" ? workspace.activePageId : undefined,
      name: DEFAULT_PAGE_NAME,
      viewport: workspace?.viewport,
      view: workspace?.view,
      cards: workspace?.cards,
      drawings: workspace?.drawings,
      edges: workspace?.edges,
      groups: workspace?.groups,
    }, 0),
  ];
}

export function getWorkspaceActivePage(workspace) {
  const pages = Array.isArray(workspace?.pages) ? workspace.pages : [];
  if (!pages.length) {
    return normalizeWorkspacePage(null, 0);
  }

  const requestedActivePageId = typeof workspace?.activePageId === "string" ? workspace.activePageId : "";
  return pages.find((page) => page.id === requestedActivePageId) ?? pages[0];
}

export function createWorkspacePage(name = "", index = 0) {
  return normalizeWorkspacePage({
    id: generateWorkspacePageId(),
    name: firstString(name, `Page ${index + 1}`, DEFAULT_PAGE_NAME),
    cards: [],
    drawings: createEmptyDrawings(),
    edges: [],
    groups: [],
  }, index);
}

export function updateWorkspaceActivePage(workspace, updater) {
  const normalizedWorkspace = normalizeWorkspace(workspace);
  const activePageId = normalizedWorkspace.activePageId;

  return normalizeWorkspace({
    ...normalizedWorkspace,
    pages: normalizedWorkspace.pages.map((page) => (
      page.id === activePageId
        ? updater(page)
        : page
    )),
  });
}

export function hasCanvasSelectionClipboardPayload(payload) {
  return Boolean(
    payload
    && payload.type === CANVAS_SELECTION_CLIPBOARD_TYPE
    && payload.version === 1
    && Array.isArray(payload.tiles)
  );
}

export function createCanvasSelectionClipboardPayload(page, selectedTileIds) {
  const normalizedTileIds = normalizeSelectedClipboardTileIds(selectedTileIds);

  if (normalizedTileIds.length === 0) {
    return null;
  }

  const selectedTileIdSet = new Set(normalizedTileIds);
  const pageTiles = Array.isArray(page?.cards) ? page.cards : [];
  const tiles = pageTiles
    .filter((tile) => selectedTileIdSet.has(tile.id))
    .map((tile) => deepCloneStructuredValue(tile));

  if (tiles.length === 0) {
    return null;
  }

  return {
    type: CANVAS_SELECTION_CLIPBOARD_TYPE,
    version: 1,
    tiles,
    edges: filterClipboardStructuredEntries(page?.edges, selectedTileIdSet),
    groups: filterClipboardStructuredEntries(page?.groups, selectedTileIdSet),
  };
}

export function pasteCanvasSelectionClipboardPayload(payload, options = {}) {
  if (!hasCanvasSelectionClipboardPayload(payload)) {
    return null;
  }

  const offsetX = Number.isFinite(options.offsetX) ? options.offsetX : 24;
  const offsetY = Number.isFinite(options.offsetY) ? options.offsetY : 24;
  const sourceTiles = payload.tiles
    .map((tile, index) => normalizeCard(tile, index))
    .filter(Boolean);

  if (sourceTiles.length === 0) {
    return null;
  }

  const sourceTileIdSet = new Set(sourceTiles.map((tile) => tile.id));
  const tileIdMap = new Map(
    sourceTiles.map((tile, index) => [tile.id, generateWorkspaceEntityId(`card-${index}`)]),
  );

  const tiles = sourceTiles.map((tile, index) => {
    const nextRackId = sourceTileIdSet.has(tile.parentRackId)
      ? (tileIdMap.get(tile.parentRackId) ?? null)
      : null;
    const nextTileIds = tile.type === RACK_CARD_TYPE
      ? tile.tileIds
        .filter((tileId) => sourceTileIdSet.has(tileId))
        .map((tileId) => tileIdMap.get(tileId))
        .filter(Boolean)
      : tile.tileIds;

    return normalizeCard({
      ...deepCloneStructuredValue(tile),
      id: tileIdMap.get(tile.id),
      x: tile.x + offsetX,
      y: tile.y + offsetY,
      tileIds: nextTileIds,
      parentRackId: tile.type === RACK_CARD_TYPE ? null : nextRackId,
      rackIndex: tile.type === RACK_CARD_TYPE ? null : (nextRackId ? tile.rackIndex : null),
      updatedAt: nowIso(),
    }, index);
  });

  return {
    tiles,
    edges: remapClipboardStructuredEntries(payload.edges, "edge", tileIdMap),
    groups: remapClipboardStructuredEntries(payload.groups, "group", tileIdMap),
    newTileIds: tiles.map((tile) => tile.id),
  };
}

export function removeStructuredEntriesForTileIds(entries, tileIds) {
  const removedTileIdSet = new Set(normalizeSelectedClipboardTileIds(tileIds));

  if (removedTileIdSet.size === 0) {
    return cloneStructuredArray(entries);
  }

  return filterStructuredEntriesForRemovedTileIds(entries, removedTileIdSet);
}

export function getDomainLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

export function createEmptyWorkspace() {
  const firstPage = createWorkspacePage(DEFAULT_PAGE_NAME, 0);

  return {
    version: WORKSPACE_SCHEMA_VERSION,
    name: "Canvas",
    activePageId: firstPage.id,
    pages: [firstPage],
    activePage: firstPage,
    viewport: { ...firstPage.viewport },
    view: { ...firstPage.view },
    cards: [],
    drawings: createEmptyDrawings(),
  };
}

export function getRackSlotCount(rackCard) {
  return Math.max(
    Number.isFinite(rackCard?.minSlots) ? rackCard.minSlots : RACK_MIN_SLOTS,
    Array.isArray(rackCard?.tileIds) ? rackCard.tileIds.length : 0,
  );
}

export function getRackSize(rackCard) {
  return {
    width: RACK_LEFT_CAP_WIDTH + RACK_RIGHT_CAP_WIDTH + (getRackSlotCount(rackCard) * RACK_SLOT_WIDTH),
    height: RACK_HEIGHT,
  };
}

export function getRackTileWorldPosition(rackCard, tile, rackIndex = tile?.rackIndex ?? 0) {
  const normalizedIndex = Number.isFinite(rackIndex) ? rackIndex : 0;
  const slotLeft = rackCard.x + RACK_LEFT_CAP_WIDTH + (normalizedIndex * RACK_SLOT_WIDTH);
  const centeredOffset = (RACK_SLOT_WIDTH - tile.width) / 2;

  return {
    x: slotLeft + centeredOffset,
    y: rackCard.y + RACK_TILE_BASELINE - tile.height,
  };
}

export function canAttachTileToRack(tile) {
  return Boolean(
    tile
    && tile.type !== RACK_CARD_TYPE,
  );
}

export function normalizeCard(card, fallbackIndex = 0) {
  const type = getCardType(card);

  if (!type) {
    return null;
  }

  const isLinkLikeCard = isLinkLikeType(type);
  const linkAsset = type === TILE_TYPES.LINK ? normalizeLinkAsset(card?.asset) : null;
  const contentKind = isLinkLikeCard
    ? normalizeLinkContentKind(card?.contentKind, linkAsset)
    : "";
  const size = getCardSize(type);
  const createdAt = typeof card?.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card?.updatedAt === "string" ? card.updatedAt : createdAt;
  const checklistItems = type === CHECKLIST_CARD_TYPE ? normalizeChecklistItems(card?.items) : [];
  const codeLanguage = type === CODE_CARD_TYPE ? normalizeCodeLanguage(card?.language) : CODE_DEFAULT_LANGUAGE;
  const counterValue = type === COUNTER_CARD_TYPE ? normalizeCounterValue(card?.value) : COUNTER_DEFAULT_VALUE;
  const counterStep = type === COUNTER_CARD_TYPE ? normalizeCounterStep(card?.step) : COUNTER_DEFAULT_STEP;
  const counterUnit = type === COUNTER_CARD_TYPE ? normalizeCounterUnit(card?.unit) : COUNTER_DEFAULT_UNIT;
  const deadlineTargetAt = type === DEADLINE_CARD_TYPE ? normalizeDeadlineTargetAt(card?.targetAt) : "";
  const deadlineTimezone = type === DEADLINE_CARD_TYPE ? normalizeDeadlineTimezone(card?.timezone) : DEADLINE_DEFAULT_TIMEZONE;
  const noteMode = type === NOTE_CARD_TYPE ? normalizeNoteMode(card?.mode) : "edit";
  const progressMode = type === PROGRESS_CARD_TYPE ? normalizeProgressMode(card?.mode) : PROGRESS_DEFAULT_MODE;
  const progressValue = type === PROGRESS_CARD_TYPE ? normalizeProgressValue(card?.value) : PROGRESS_DEFAULT_VALUE;
  const progressMax = type === PROGRESS_CARD_TYPE ? normalizeProgressMax(card?.max) : PROGRESS_DEFAULT_MAX;
  const progressLinkedTileId = type === PROGRESS_CARD_TYPE ? normalizeProgressLinkedTileId(card?.linkedTileId) : null;
  const languageHints = type === NOTE_CARD_TYPE ? normalizeLanguageHints(card?.languageHints) : [];
  const tableColumns = type === TABLE_CARD_TYPE ? normalizeTableColumns(card?.columns) : [];
  const tableRows = type === TABLE_CARD_TYPE ? normalizeTableRows(card?.rows, tableColumns) : [];
  const textBox = type === TEXT_BOX_CARD_TYPE ? normalizeTextBoxPayload(card) : null;
  const rackTileIds = type === RACK_CARD_TYPE ? normalizeRackTileIds(card?.tileIds) : [];
  const rackSize = type === RACK_CARD_TYPE
    ? getRackSize({
      minSlots: Math.max(RACK_MIN_SLOTS, Number.isFinite(card?.minSlots) ? card.minSlots : RACK_MIN_SLOTS),
      tileIds: rackTileIds,
    })
    : null;

  return {
    id: typeof card?.id === "string" ? card.id : `card-${fallbackIndex}-${Date.now()}`,
    type,
    x: Number.isFinite(card?.x) ? card.x : 120,
    y: Number.isFinite(card?.y) ? card.y : 120,
    width: type === RACK_CARD_TYPE ? rackSize.width : Number.isFinite(card?.width) ? card.width : size.width,
    height: type === RACK_CARD_TYPE ? rackSize.height : Number.isFinite(card?.height) ? card.height : size.height,
    url: isLinkLikeCard ? String(card?.url ?? "") : "",
    contentKind,
    title: isLinkLikeCard
      ? String(card?.title ?? "")
      : type === CHECKLIST_CARD_TYPE
        ? firstString(card?.title, CHECKLIST_DEFAULT_TITLE)
        : type === CODE_CARD_TYPE
          ? firstString(card?.title, CODE_DEFAULT_TITLE)
        : type === COUNTER_CARD_TYPE
          ? firstString(card?.title, COUNTER_DEFAULT_TITLE)
        : type === DEADLINE_CARD_TYPE
          ? firstString(card?.title, DEADLINE_DEFAULT_TITLE)
        : type === NOTE_CARD_TYPE
          ? firstString(card?.title, NOTE_DEFAULT_TITLE)
        : type === PROGRESS_CARD_TYPE
          ? firstString(card?.title, PROGRESS_DEFAULT_TITLE)
          : type === TABLE_CARD_TYPE
            ? firstString(card?.title, TABLE_DEFAULT_TITLE)
            : type === TEXT_BOX_CARD_TYPE
              ? ""
            : type === RACK_CARD_TYPE
              ? firstString(card?.title, RACK_DEFAULT_TITLE)
        : "",
    description: isLinkLikeCard
      ? String(card?.description ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.description, RACK_DEFAULT_DESCRIPTION)
        : "",
    body: type === NOTE_CARD_TYPE ? String(card?.body ?? "") : "",
    text: type === TEXT_BOX_CARD_TYPE ? textBox.text : "",
    style: type === TEXT_BOX_CARD_TYPE ? textBox.style : null,
    language: type === CODE_CARD_TYPE ? codeLanguage : "",
    code: type === CODE_CARD_TYPE ? String(card?.code ?? "") : "",
    wrap: type === CODE_CARD_TYPE ? card?.wrap !== false : false,
    showLineNumbers: type === CODE_CARD_TYPE ? card?.showLineNumbers !== false : false,
    value: type === COUNTER_CARD_TYPE
      ? counterValue
      : type === PROGRESS_CARD_TYPE
        ? progressValue
        : null,
    step: type === COUNTER_CARD_TYPE ? counterStep : null,
    unit: type === COUNTER_CARD_TYPE ? counterUnit : "",
    targetAt: type === DEADLINE_CARD_TYPE ? deadlineTargetAt : "",
    timezone: type === DEADLINE_CARD_TYPE ? deadlineTimezone : "",
    showSeconds: type === DEADLINE_CARD_TYPE ? card?.showSeconds === true : false,
    mode: type === NOTE_CARD_TYPE ? noteMode : type === PROGRESS_CARD_TYPE ? progressMode : "",
    max: type === PROGRESS_CARD_TYPE ? progressMax : null,
    linkedTileId: type === PROGRESS_CARD_TYPE ? progressLinkedTileId : null,
    languageHints,
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
    mediaAspectRatio: isLinkLikeCard && Number.isFinite(card?.mediaAspectRatio) && card.mediaAspectRatio > 0
      ? Number(card.mediaAspectRatio)
      : null,
    previewKind: isLinkLikeCard && card?.previewKind === "music" ? "music" : "default",
    previewError: isLinkLikeCard ? String(card?.previewError ?? "") : "",
    status: isLinkLikeCard && LINK_PREVIEW_STATUSES.includes(card?.status)
      ? card.status
      : "idle",
    previewDiagnostics: isLinkLikeCard ? normalizePreviewDiagnostics(card?.previewDiagnostics) : null,
    asset: type === TILE_TYPES.LINK ? linkAsset : null,
    productAsin: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productAsin ?? "") : "",
    productPrice: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productPrice ?? "") : "",
    productDomain: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productDomain ?? "") : "",
    productRating: type === AMAZON_PRODUCT_CARD_TYPE && Number.isFinite(card?.productRating)
      ? Number(card.productRating)
      : null,
    productReviewCount: type === AMAZON_PRODUCT_CARD_TYPE && Number.isFinite(card?.productReviewCount)
      ? Math.max(0, Math.round(card.productReviewCount))
      : null,
    items: checklistItems,
    columns: tableColumns,
    rows: tableRows,
    tileIds: rackTileIds,
    minSlots: type === RACK_CARD_TYPE
      ? Math.max(RACK_MIN_SLOTS, Number.isFinite(card?.minSlots) ? card.minSlots : RACK_MIN_SLOTS)
      : null,
    layout: normalizeCardLayout(card?.layout),
    parentRackId: type !== RACK_CARD_TYPE && typeof card?.parentRackId === "string" && card.parentRackId.trim().length > 0
      ? card.parentRackId
      : null,
    rackIndex: type !== RACK_CARD_TYPE && Number.isFinite(card?.rackIndex)
      ? Math.max(0, Math.round(card.rackIndex))
      : null,
    createdAt,
    updatedAt,
  };
}

export function normalizeWorkspace(workspace) {
  const safeWorkspace = migrateWorkspace(workspace && typeof workspace === "object"
    ? workspace
    : createEmptyWorkspace());
  const pages = normalizeWorkspacePages(safeWorkspace);
  const activePage = getWorkspaceActivePage({
    ...safeWorkspace,
    pages,
  });

  return {
    version: WORKSPACE_SCHEMA_VERSION,
    name: firstString(safeWorkspace.name, "Canvas"),
    activePageId: activePage.id,
    pages,
    activePage,
    viewport: activePage.viewport,
    view: activePage.view,
    cards: activePage.cards,
    drawings: activePage.drawings,
  };
}

function migrateWorkspace(rawWorkspace) {
  const safeWorkspace = rawWorkspace && typeof rawWorkspace === "object"
    ? rawWorkspace
    : createEmptyWorkspace();
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

  if (version < 5) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 5,
    };
  }

  if (version < 6) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 6,
    };
  }

  if (version < 7) {
    nextWorkspace = {
      ...nextWorkspace,
      cards: flattenLegacyFolderCards(Array.isArray(nextWorkspace.cards) ? nextWorkspace.cards : []),
      version: 7,
    };
  }

  if (version < 8) {
    nextWorkspace = {
      ...nextWorkspace,
      drawings: createEmptyDrawings(),
      version: 8,
    };
  }

  if (version < 9) {
    const migratedPage = normalizeWorkspacePage({
      id: typeof nextWorkspace.activePageId === "string" ? nextWorkspace.activePageId : undefined,
      name: DEFAULT_PAGE_NAME,
      viewport: nextWorkspace.viewport,
      view: nextWorkspace.view,
      cards: flattenLegacyFolderCards(Array.isArray(nextWorkspace.cards) ? nextWorkspace.cards : []),
      drawings: nextWorkspace.drawings,
      edges: nextWorkspace.edges,
      groups: nextWorkspace.groups,
    }, 0);

    nextWorkspace = {
      ...nextWorkspace,
      activePageId: migratedPage.id,
      pages: [migratedPage],
      version: 9,
    };
  }

  if (version < 10) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 10,
    };
  }

  if (version < 11) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 11,
    };
  }

  if (version < 12) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 12,
    };
  }

  return nextWorkspace;
}

function updateRackTiles(rackCard, nextTileIds) {
  return normalizeCard({
    ...rackCard,
    tileIds: nextTileIds,
    updatedAt: nowIso(),
  });
}

function syncRackChildren(cards, rackId, nextTileIds) {
  const timestamp = nowIso();
  const tileSet = new Set(nextTileIds);

  return cards.map((card) => {
    if (card.id === rackId && card.type === RACK_CARD_TYPE) {
      return normalizeCard({
        ...card,
        tileIds: nextTileIds,
        updatedAt: timestamp,
      });
    }

    if (tileSet.has(card.id)) {
      return normalizeCard({
        ...card,
        parentRackId: rackId,
        rackIndex: nextTileIds.indexOf(card.id),
        updatedAt: timestamp,
      });
    }

    if (card.parentRackId === rackId) {
      return normalizeCard({
        ...card,
        parentRackId: null,
        rackIndex: null,
        updatedAt: timestamp,
      });
    }

    return card;
  });
}

function detachTileFromRacks(cards, tileId) {
  const sourceRack = cards.find((card) => card.type === RACK_CARD_TYPE && card.tileIds.includes(tileId));

  if (!sourceRack) {
    return cards;
  }

  const nextTileIds = sourceRack.tileIds.filter((attachedTileId) => attachedTileId !== tileId);
  return syncRackChildren(cards, sourceRack.id, nextTileIds);
}

function intersects(a, b) {
  return !(
    a.x + a.width < b.x
    || b.x + b.width < a.x
    || a.y + a.height < b.y
    || b.y + b.height < a.y
  );
}

function getCanvasCollisionCards(cards) {
  return cards.filter((card) => !card.parentRackId);
}

function hasCollision(cards, candidate) {
  return getCanvasCollisionCards(cards).some((card) =>
    intersects(candidate, {
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
    }));
}

function getCenteredCardPosition(cards, preferredCenter, type) {
  const size = getCardSize(type);
  const startX = Math.round(preferredCenter.x - size.width / 2);
  const startY = Math.round(preferredCenter.y - size.height / 2);
  const stepX = Math.max(48, Math.round(size.width * 0.42));
  const stepY = Math.max(40, Math.round(size.height * 0.38));

  for (let radius = 0; radius < 18; radius += 1) {
    for (let row = -radius; row <= radius; row += 1) {
      for (let col = -radius; col <= radius; col += 1) {
        if (radius > 0 && Math.max(Math.abs(row), Math.abs(col)) !== radius) {
          continue;
        }

        const candidate = {
          x: startX + col * stepX,
          y: startY + row * stepY,
          width: size.width,
          height: size.height,
        };

        if (!hasCollision(cards, candidate)) {
          return candidate;
        }
      }
    }
  }

  return {
    x: startX,
    y: startY + cards.length * 36,
    width: size.width,
    height: size.height,
  };
}

export function getNextCardPosition(
  cards,
  viewport,
  type,
  preferredCenter = null,
) {
  if (preferredCenter && Number.isFinite(preferredCenter.x) && Number.isFinite(preferredCenter.y)) {
    return getCenteredCardPosition(cards, preferredCenter, type);
  }

  const size = getCardSize(type);
  const startX = Math.max(72, Math.round((-viewport.x + 120) / viewport.zoom));
  const startY = Math.max(72, Math.round((-viewport.y + 160) / viewport.zoom));
  const gapX = 28;
  const gapY = 28;

  for (let row = 0; row < 18; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      const candidate = {
        x: startX + col * (size.width + gapX),
        y: startY + row * (size.height + gapY),
        width: size.width,
        height: size.height,
      };

      if (!hasCollision(cards, candidate)) {
        return candidate;
      }
    }
  }

  return {
    x: startX,
    y: startY + cards.length * 36,
    width: size.width,
    height: size.height,
  };
}

export function createRackCard(cards, viewport, preferredCenter = null, options = {}) {
  const title = firstString(options?.title, RACK_DEFAULT_TITLE);
  const description = firstString(options?.description, RACK_DEFAULT_DESCRIPTION);
  const tileIds = normalizeRackTileIds(options?.tileIds);
  const minSlots = Math.max(
    RACK_MIN_SLOTS,
    Number.isFinite(options?.minSlots) ? options.minSlots : RACK_MIN_SLOTS,
  );
  const position = getNextCardPosition(cards, viewport, RACK_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: RACK_CARD_TYPE,
    title,
    description,
    tileIds,
    minSlots,
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createChecklistCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CHECKLIST_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CHECKLIST_CARD_TYPE,
    title: firstString(options?.title, CHECKLIST_DEFAULT_TITLE),
    items: normalizeChecklistItems(options?.items),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createCodeCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CODE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CODE_CARD_TYPE,
    title: firstString(options?.title, CODE_DEFAULT_TITLE),
    language: normalizeCodeLanguage(options?.language),
    code: typeof options?.code === "string" ? options.code : "",
    wrap: options?.wrap !== false,
    showLineNumbers: options?.showLineNumbers !== false,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createCounterCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, COUNTER_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: COUNTER_CARD_TYPE,
    title: firstString(options?.title, COUNTER_DEFAULT_TITLE),
    value: normalizeCounterValue(options?.value),
    step: normalizeCounterStep(options?.step),
    unit: normalizeCounterUnit(options?.unit),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createDeadlineCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, DEADLINE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: DEADLINE_CARD_TYPE,
    title: firstString(options?.title, DEADLINE_DEFAULT_TITLE),
    targetAt: normalizeDeadlineTargetAt(options?.targetAt),
    timezone: normalizeDeadlineTimezone(options?.timezone),
    showSeconds: options?.showSeconds === true,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createNoteCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, NOTE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: NOTE_CARD_TYPE,
    title: firstString(options?.title, NOTE_DEFAULT_TITLE),
    body: typeof options?.body === "string" ? options.body : "",
    mode: normalizeNoteMode(options?.mode),
    languageHints: normalizeLanguageHints(options?.languageHints),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createProgressCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, PROGRESS_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: PROGRESS_CARD_TYPE,
    title: firstString(options?.title, PROGRESS_DEFAULT_TITLE),
    mode: normalizeProgressMode(options?.mode),
    value: normalizeProgressValue(options?.value),
    max: normalizeProgressMax(options?.max),
    linkedTileId: normalizeProgressLinkedTileId(options?.linkedTileId),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createTableCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, TABLE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();
  const columns = normalizeTableColumns(options?.columns);
  const rows = normalizeTableRows(options?.rows, columns);

  return normalizeCard({
    id: crypto.randomUUID(),
    type: TABLE_CARD_TYPE,
    title: firstString(options?.title, TABLE_DEFAULT_TITLE),
    columns,
    rows,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createTextBoxCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, TEXT_BOX_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: TEXT_BOX_CARD_TYPE,
    text: typeof options?.text === "string" ? options.text : TEXT_BOX_DEFAULT_TEXT,
    style: normalizeTextBoxStyle(options?.style),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createLinkCard(cards, viewport, url, preferredCenter = null, options = {}) {
  const type = options?.type === AMAZON_PRODUCT_CARD_TYPE ? AMAZON_PRODUCT_CARD_TYPE : TILE_TYPES.LINK;
  const position = getNextCardPosition(cards, viewport, type, preferredCenter);
  const timestamp = nowIso();
  const contentKind = normalizeLinkContentKind(options?.contentKind, options?.asset);
  const domain = getDomainLabel(url);
  const image = typeof options?.image === "string" ? options.image : "";
  const asset = normalizeLinkAsset(options?.asset);

  return normalizeCard({
    id: crypto.randomUUID(),
    type,
    url,
    contentKind,
    title: typeof options?.title === "string" ? options.title : "",
    siteName: typeof options?.siteName === "string" ? options.siteName : domain,
    description: typeof options?.description === "string" ? options.description : "",
    image,
    favicon: typeof options?.favicon === "string" ? options.favicon : "",
    resolvedUrl: typeof options?.resolvedUrl === "string" ? options.resolvedUrl : url,
    previewStatus: typeof options?.previewStatus === "string" ? options.previewStatus : "",
    contentType: typeof options?.contentType === "string" ? options.contentType : "link",
    sourceType: typeof options?.sourceType === "string" ? options.sourceType : "generic-link",
    duration: Number.isFinite(options?.duration) ? Math.max(0, Math.round(options.duration)) : null,
    author: typeof options?.author === "string" ? options.author : "",
    channelName: typeof options?.channelName === "string" ? options.channelName : "",
    mediaAspectRatio: Number.isFinite(options?.mediaAspectRatio) && options.mediaAspectRatio > 0
      ? Number(options.mediaAspectRatio)
      : null,
    previewKind: options?.previewKind === "music" ? "music" : "default",
    previewError: typeof options?.previewError === "string" ? options.previewError : "",
    status: contentKind === LINK_CONTENT_KIND_IMAGE
      ? "ready"
      : LINK_PREVIEW_STATUSES.includes(options?.status)
        ? options.status
        : "loading",
    asset,
    productAsin: typeof options?.productAsin === "string" ? options.productAsin : "",
    productPrice: typeof options?.productPrice === "string" ? options.productPrice : "",
    productDomain: typeof options?.productDomain === "string" ? options.productDomain : "",
    productRating: Number.isFinite(options?.productRating) ? Number(options.productRating) : null,
    productReviewCount: Number.isFinite(options?.productReviewCount) ? Math.max(0, Math.round(options.productReviewCount)) : null,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function updateCard(cards, cardId, updates) {
  return cards
    .map((card) =>
      card.id === cardId
        ? normalizeCard({
          ...card,
          ...updates,
          updatedAt: nowIso(),
        })
        : card)
    .filter(Boolean);
}

export function updateCards(cards, updatesById) {
  return cards
    .map((card) => {
      const updates = updatesById?.[card.id];

      if (!updates) {
        return card;
      }

      return normalizeCard({
        ...card,
        ...updates,
        updatedAt: nowIso(),
      });
    })
    .filter(Boolean);
}

export function getRackByTileId(cards, tileId) {
  return cards.find((card) => card.type === RACK_CARD_TYPE && card.tileIds.includes(tileId)) ?? null;
}

export function addTileToRack(cards, tileId, rackId, slotIndex = null) {
  if (!tileId || !rackId || tileId === rackId) {
    return null;
  }

  const tile = cards.find((card) => card.id === tileId);
  const rackCard = cards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE);

  if (!tile || !rackCard || !canAttachTileToRack(tile) || rackCard.tileIds.includes(tileId)) {
    return null;
  }

  const cleanedCards = detachTileFromRacks(cards, tileId);
  const latestRackCard = cleanedCards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE);

  if (!latestRackCard) {
    return null;
  }

  const insertionIndex = Number.isFinite(slotIndex)
    ? Math.max(0, Math.min(latestRackCard.tileIds.length, Math.round(slotIndex)))
    : latestRackCard.tileIds.length;
  const nextTileIds = [...latestRackCard.tileIds];
  nextTileIds.splice(insertionIndex, 0, tileId);
  const nextCards = syncRackChildren(cleanedCards, rackId, nextTileIds);
  const nextRackCard = nextCards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE) ?? latestRackCard;

  return {
    cards: nextCards,
    rackCard: nextRackCard,
  };
}

export function removeTileFromRack(cards, tileId, rackId, dropPosition = null) {
  if (!tileId || !rackId) {
    return null;
  }

  const rackCard = cards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE);
  const tile = cards.find((card) => card.id === tileId);

  if (!rackCard || !tile || !rackCard.tileIds.includes(tileId)) {
    return null;
  }

  const nextTileIds = rackCard.tileIds.filter((attachedTileId) => attachedTileId !== tileId);
  const nextCards = syncRackChildren(cards, rackId, nextTileIds).map((card) => {
    if (card.id !== tileId) {
      return card;
    }

    return normalizeCard({
      ...card,
      x: Number.isFinite(dropPosition?.x) ? dropPosition.x : card.x,
      y: Number.isFinite(dropPosition?.y) ? dropPosition.y : card.y,
      parentRackId: null,
      rackIndex: null,
      updatedAt: nowIso(),
    });
  });
  const nextRackCard = nextCards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE) ?? rackCard;
  const nextTile = nextCards.find((card) => card.id === tileId) ?? tile;

  return {
    cards: nextCards,
    rackCard: nextRackCard,
    tile: nextTile,
  };
}

export function replaceCards(cards, nextCards) {
  if (!Array.isArray(nextCards)) {
    return cards;
  }

  return nextCards
    .map((card, index) => normalizeCard(card, index))
    .filter(Boolean);
}

export function reorderCards(cards, orderedCardIds = []) {
  const orderSet = new Set(orderedCardIds);
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const remainingCards = cards.filter((card) => !orderSet.has(card.id));
  const orderedCards = orderedCardIds
    .map((cardId) => cardById.get(cardId))
    .filter(Boolean);

  return [...remainingCards, ...orderedCards];
}

export function removeCard(cards, cardId) {
  if (!cardId) {
    return cards;
  }

  const idsToRemove = new Set([cardId]);

  const removedRackMap = new Map(
    cards
      .filter((card) => idsToRemove.has(card.id) && card.type === RACK_CARD_TYPE)
      .map((card) => [card.id, card]),
  );

  return cards
    .filter((card) => !idsToRemove.has(card.id))
    .map((card) => {
      const removedRack = card.parentRackId ? removedRackMap.get(card.parentRackId) : null;

      if (removedRack) {
        const detachedPosition = getRackTileWorldPosition(
          removedRack,
          card,
          Number.isFinite(card.rackIndex) ? card.rackIndex : removedRack.tileIds.indexOf(card.id),
        );

        return normalizeCard({
          ...card,
          x: detachedPosition.x,
          y: detachedPosition.y,
          parentRackId: null,
          rackIndex: null,
          updatedAt: nowIso(),
        });
      }

      if (card.type === RACK_CARD_TYPE) {
        const nextTileIds = card.tileIds.filter((tileId) => !idsToRemove.has(tileId));

        return nextTileIds.length === card.tileIds.length
          ? card
          : updateRackTiles(card, nextTileIds);
      }

      return card;
    });
}

export function isUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isImageLinkCard(card) {
  return isLinkLikeType(card?.type) && card.contentKind === LINK_CONTENT_KIND_IMAGE;
}

export function isBookmarkLinkCard(card) {
  return isLinkLikeType(card?.type) && !isImageLinkCard(card);
}

export function canRefreshLinkPreviewCard(card) {
  return isBookmarkLinkCard(card)
    && typeof card?.url === "string"
    && card.url.trim().length > 0
    && card.status !== "loading";
}

export function hasUsableLinkPreview(card) {
  if (!isBookmarkLinkCard(card)) {
    return false;
  }

  return Boolean(
    card.image?.trim()
    || card.title?.trim()
    || card.description?.trim()
    || card.favicon?.trim()
    || card.siteName?.trim()
    || card.productAsin?.trim()
    || card.productPrice?.trim()
    || card.productDomain?.trim()
    || Number.isFinite(card.productRating)
    || Number.isFinite(card.productReviewCount),
  );
}

export function shouldRecoverLinkPreviewCard(card) {
  if (!canRefreshLinkPreviewCard(card)) {
    return false;
  }

  const status = String(card.status ?? "").toLowerCase();
  const hasUsablePreview = hasUsableLinkPreview(card);
  const hasImage = Boolean(card.image?.trim());
  const hasPreviewError = Boolean(card.previewError?.trim());

  if (status === "failed" || status === "error" || status === "blocked") {
    return true;
  }

  if (!hasUsablePreview) {
    return true;
  }

  if (status === "fallback" || status === "ready") {
    return hasPreviewError && !hasImage;
  }

  return hasPreviewError && !hasImage;
}

export function createLinkPreviewRefreshPatch(card) {
  if (!isBookmarkLinkCard(card)) {
    return null;
  }

  return {
    type: TILE_TYPES.LINK,
    contentKind: LINK_CONTENT_KIND_BOOKMARK,
    status: "loading",
    previewKind: "default",
    previewStatus: "",
    contentType: "link",
    sourceType: "generic-link",
    duration: null,
    author: "",
    channelName: "",
    mediaAspectRatio: null,
    previewError: "",
    image: "",
    productAsin: "",
    productPrice: "",
    productDomain: "",
    productRating: null,
    productReviewCount: null,
  };
}

export function isEditableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return Boolean(element.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

export function formatCardSubtitle(card) {
  if (card.type === RACK_CARD_TYPE) {
    const tileCount = card.tileIds.length;
    return `${tileCount} ${tileCount === 1 ? "tile" : "tiles"} on rack`;
  }

  if (card.type === CHECKLIST_CARD_TYPE) {
    const totalItems = Array.isArray(card.items) ? card.items.length : 0;
    const completedItems = Array.isArray(card.items)
      ? card.items.filter((item) => item.checked).length
      : 0;
    return `${completedItems}/${totalItems} complete`;
  }

  if (card.type === CODE_CARD_TYPE) {
    const lineCount = String(card.code ?? "").split(/\r?\n/).length;
    return `${card.language || CODE_DEFAULT_LANGUAGE} · ${lineCount} ${lineCount === 1 ? "line" : "lines"}`;
  }

  if (card.type === COUNTER_CARD_TYPE) {
    const unitLabel = firstString(card.unit, "items");
    return `${normalizeCounterValue(card.value)} ${unitLabel} · step ${normalizeCounterStep(card.step)}`;
  }

  if (card.type === DEADLINE_CARD_TYPE) {
    return card.targetAt
      ? (card.showSeconds ? "countdown · live seconds" : "countdown · live")
      : "no deadline set";
  }

  if (card.type === NOTE_CARD_TYPE) {
    const lineCount = String(card.body ?? "").split(/\r?\n/).length;
    return `${lineCount} ${lineCount === 1 ? "line" : "lines"} · ${card.mode === "preview" ? "preview" : "edit"}`;
  }

  if (card.type === PROGRESS_CARD_TYPE) {
    return card.linkedTileId
      ? "linked checklist progress"
      : `${normalizeProgressValue(card.value)} / ${normalizeProgressMax(card.max)}`;
  }

  if (card.type === TABLE_CARD_TYPE) {
    const columnCount = Array.isArray(card.columns) ? card.columns.length : 0;
    const rowCount = Array.isArray(card.rows) ? card.rows.length : 0;
    return `${rowCount} rows · ${columnCount} cols`;
  }

  if (card.type === TEXT_BOX_CARD_TYPE) {
    const lineCount = getTextBoxLineCount(card.text ?? "");
    return `${lineCount} ${lineCount === 1 ? "line" : "lines"} · ${card.style?.preset || TEXT_BOX_DEFAULT_STYLE.preset}`;
  }

  if (card.type === AMAZON_PRODUCT_CARD_TYPE) {
    return firstString(card.productPrice, card.productDomain, getDomainLabel(card.url), "Amazon");
  }

  if (isImageLinkCard(card)) {
    return firstString(card.siteName, "Image");
  }

  return firstString(card.siteName, getDomainLabel(card.url), "Link");
}

function getLegacyFolderZoneRect(folderCard) {
  const width = Math.max(
    LEGACY_FOLDER_ZONE_MIN_WIDTH,
    (Number.isFinite(folderCard?.width) ? folderCard.width : 340) + 220,
  );
  const left = (Number.isFinite(folderCard?.x) ? folderCard.x : 120)
    - Math.round((width - (Number.isFinite(folderCard?.width) ? folderCard.width : 340)) / 2);
  const top = (Number.isFinite(folderCard?.y) ? folderCard.y : 120)
    + (Number.isFinite(folderCard?.height) ? folderCard.height : 236)
    + LEGACY_FOLDER_ZONE_GAP;

  return { left, top };
}

function flattenLegacyFolderCards(cards) {
  const sourceCards = Array.isArray(cards) ? cards : [];
  const nextCards = sourceCards.map((card) => ({ ...card }));
  const cardById = new Map(nextCards.map((card) => [card.id, card]));
  const legacyFolders = nextCards.filter((card) => card?.type === LEGACY_FOLDER_CARD_TYPE);

  legacyFolders.forEach((folderCard) => {
    const zoneOrigin = getLegacyFolderZoneRect(folderCard);
    const childIds = normalizeLegacyFolderChildIds(folderCard?.childIds);
    const childLayouts = normalizeLegacyFolderChildLayouts(childIds, folderCard?.childLayouts);

    childIds.forEach((childId, index) => {
      const childCard = cardById.get(childId);

      if (!childCard) {
        return;
      }

      const fallbackLayout = {
        x: 36 + ((index + 1) % 3) * 220,
        y: 36 + Math.floor(index / 3) * 182,
      };
      const localLayout = childLayouts[childId] ?? fallbackLayout;

      childCard.x = zoneOrigin.left + (Number.isFinite(localLayout.x) ? localLayout.x : fallbackLayout.x);
      childCard.y = zoneOrigin.top + (Number.isFinite(localLayout.y) ? localLayout.y : fallbackLayout.y);
      childCard.updatedAt = typeof childCard.updatedAt === "string" ? childCard.updatedAt : nowIso();
    });
  });

  return nextCards.filter((card) => card?.type !== LEGACY_FOLDER_CARD_TYPE);
}
