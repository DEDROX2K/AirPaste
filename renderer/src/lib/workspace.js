import TILE_TYPES from "../tiles/tileTypes";
import workspaceSchema from "../../../shared/workspace-schema.json";
import {
  CANVAS_TEXT_FORMAT_PLAIN,
  CANVAS_TEXT_SOURCE_FILE,
  CANVAS_TEXT_SOURCE_LOCAL,
  CANVAS_TEXT_TITLE_MODE_DERIVED,
  CANVAS_TEXT_VARIANT_DEFAULT,
  CANVAS_TEXT_VARIANT_STICKY,
  QUICK_TEXT_MIN_HEIGHT,
  QUICK_TEXT_MIN_WIDTH,
  deriveCanvasTextTitle,
  getCanvasTextLineCount,
} from "./canvasText";
import {
  clamp,
  getDefaultCameraDistance,
  getDefaultWorkspaceView,
  MAX_CAMERA_DISTANCE,
  MIN_GLOBE_RADIUS,
  getSoftGlobeRadius,
} from "../systems/globe/globeLayout";
import { createEmptyDrawings, normalizeDrawings } from "../systems/drawing/drawingTypes";
import { TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT } from "./textBoxStyle";
// Per-tile-type data model modules (Phase 2B extraction). These import
// normalizeCard/getNextCardPosition/firstString/nowIso back from this file,
// which creates a two-way circular import between this module and each
// tiles/<type>/model.js -- safe under ESM/Vite because every usage on both
// sides happens inside function bodies, never at module-evaluation time.
import {
  COUNTER_CARD_SIZE,
  COUNTER_DEFAULT_STEP,
  COUNTER_DEFAULT_TITLE,
  COUNTER_DEFAULT_UNIT,
  COUNTER_DEFAULT_VALUE,
  normalizeCounterStep,
  normalizeCounterUnit,
  normalizeCounterValue,
} from "../tiles/counter/model";
import {
  PROGRESS_CARD_SIZE,
  PROGRESS_DEFAULT_MAX,
  PROGRESS_DEFAULT_MODE,
  PROGRESS_DEFAULT_TITLE,
  PROGRESS_DEFAULT_VALUE,
  normalizeProgressLinkedTileId,
  normalizeProgressMax,
  normalizeProgressMode,
  normalizeProgressValue,
} from "../tiles/progress/model";
import {
  DEADLINE_CARD_SIZE,
  DEADLINE_DEFAULT_TIMEZONE,
  DEADLINE_DEFAULT_TITLE,
  normalizeDeadlineTargetAt,
  normalizeDeadlineTimezone,
} from "../tiles/deadline/model";
import {
  CHECKLIST_CARD_SIZE,
  CHECKLIST_DEFAULT_TITLE,
  normalizeChecklistDateLabel,
  normalizeChecklistItems,
  normalizeChecklistTimeLabel,
} from "../tiles/checklist/model";
import {
  CODE_CARD_SIZE,
  CODE_DEFAULT_LANGUAGE,
  CODE_DEFAULT_TITLE,
  normalizeCodeLanguage,
} from "../tiles/code/model";
import {
  CALENDAR_CARD_SIZE,
  CALENDAR_DEFAULT_HEIGHT_PRESET,
  CALENDAR_DEFAULT_MONTH,
  CALENDAR_DEFAULT_THEME_ID,
  CALENDAR_DEFAULT_TITLE,
  CALENDAR_DEFAULT_VIEW,
  CALENDAR_DEFAULT_YEAR,
  normalizeCalendarHeightPreset,
  normalizeCalendarMonth,
  normalizeCalendarThemeId,
  normalizeCalendarView,
  normalizeCalendarYear,
} from "../tiles/calendar/model";
import {
  TABLE_CARD_SIZE,
  TABLE_DEFAULT_TITLE,
  normalizeTableColumns,
  normalizeTableRows,
} from "../tiles/table/model";
import {
  FILE_CARD_SIZE,
  FILE_DEFAULT_TITLE,
  normalizeFileAttachment,
} from "../tiles/file/model";
import {
  RACK_DEFAULT_DESCRIPTION,
  RACK_DEFAULT_TITLE,
  normalizeRackPlasticColor,
  normalizeRackTileIds,
} from "../tiles/rack/model";
import {
  LINK_CARD_SIZE,
  AMAZON_PRODUCT_CARD_SIZE,
  LINK_PREVIEW_STATUSES,
  getNormalizedImageLinkDimensions,
  isLinkLikeType,
  normalizeLinkAsset,
  normalizeLinkContentKind,
} from "../tiles/link/model";
import {
  GITHUB_REPO_CARD_SIZE,
  GITHUB_REPO_CARD_TYPE,
  normalizeGitHubRepoData,
} from "../tiles/github/model";
import {
  WEATHER_CARD_SIZE,
  WEATHER_CARD_TYPE,
  normalizeWeatherCity,
  normalizeWeatherLocation,
} from "../tiles/weather/model";
import {
  NOTE_CARD_SIZE,
  NOTE_DEFAULT_TITLE,
  TEXT_BOX_MIN_HEIGHT,
  TEXT_BOX_MIN_WIDTH,
  normalizeCanvasTextPayload,
  normalizeLanguageHints,
} from "../tiles/canvasText/model";
import { clampStickySize } from "../tiles/sticky/model";
import {
  PAPER_NOTE_CARD_SIZE,
  normalizePaperNoteSubtitle,
  normalizePaperNoteText,
  normalizePaperNoteTitle,
} from "../tiles/paperNote/model";
// Re-exported so existing `import { createXCard } from "../lib/workspace"`
// call sites (AppProvider.jsx, useCanvasCommands.js, testingTiles.js) don't
// need to change -- the implementations live in tiles/<type>/model.js now.
export { createCounterCard } from "../tiles/counter/model";
export { createPaperNoteCard } from "../tiles/paperNote/model";
export { createProgressCard } from "../tiles/progress/model";
export { createDeadlineCard } from "../tiles/deadline/model";
export { createChecklistCard } from "../tiles/checklist/model";
export { createCodeCard } from "../tiles/code/model";
export { createCalendarCard } from "../tiles/calendar/model";
export { createTableCard } from "../tiles/table/model";
export { createFileCard } from "../tiles/file/model";
export { createRackCard } from "../tiles/rack/model";
export { createWeatherCard } from "../tiles/weather/model";
export { createLinkCard, createStickerCard } from "../tiles/link/model";
export { createNoteCard, createTextBoxCard, createCanvasTextCard } from "../tiles/canvasText/model";

export const RACK_CARD_TYPE = TILE_TYPES.RACK;
export const FILE_CARD_TYPE = TILE_TYPES.FILE;
export const AMAZON_PRODUCT_CARD_TYPE = TILE_TYPES.AMAZON_PRODUCT;
export const CALENDAR_CARD_TYPE = TILE_TYPES.CALENDAR;
export const CHECKLIST_CARD_TYPE = TILE_TYPES.CHECKLIST;
export const CODE_CARD_TYPE = TILE_TYPES.CODE;
export const COUNTER_CARD_TYPE = TILE_TYPES.COUNTER;
export const DEADLINE_CARD_TYPE = TILE_TYPES.DEADLINE;
export const CANVAS_TEXT_CARD_TYPE = TILE_TYPES.CANVAS_TEXT;
export const NOTE_CARD_TYPE = TILE_TYPES.NOTE;
export const PROGRESS_CARD_TYPE = TILE_TYPES.PROGRESS;
export const TABLE_CARD_TYPE = TILE_TYPES.TABLE;
export const TEXT_BOX_CARD_TYPE = TILE_TYPES.TEXT_BOX;
export const PAPER_NOTE_CARD_TYPE = TILE_TYPES.PAPER_NOTE;
export const LINK_CONTENT_KIND_BOOKMARK = "bookmark";
export const LINK_CONTENT_KIND_IMAGE = "image";
// Single source of truth shared with the main process (workspace-service.js)
// via shared/workspace-schema.json -- do not hardcode this number here.
export const WORKSPACE_SCHEMA_VERSION = workspaceSchema.WORKSPACE_SCHEMA_VERSION;
export const CANVAS_SELECTION_CLIPBOARD_TYPE = "airpaste/canvas-selection";
// Rack geometry (see RackTile.css). Tiles stand in the rack as 176 x 216
// preview cards, 206px apart, centred as a group; the rack is never
// narrower than three cards and widens by one pitch per extra tile.
export const RACK_MIN_SLOTS = 3;
export const RACK_CARD_PITCH = 206;
export const RACK_PREVIEW_WIDTH = 176;
export const RACK_PREVIEW_HEIGHT = 216;
export const RACK_SIDE_MARGIN = 26;
export const RACK_HEIGHT = 360;
// Top edge of a card in its lifted (hovered) pose, from the rack's top.
export const RACK_LIFTED_PREVIEW_TOP = 26;
// Defined here (not in tiles/rack/model.js) because it's computed from the
// geometry constants directly above at module-evaluation time. Since those
// constants are themselves imported back into tiles/rack/model.js (which
// this file also imports from, for normalizeRackTileIds/createRackCard),
// computing this in rack/model.js instead would read them before lib/
// workspace.js's own top-level code has run -- ES module imports are
// hoisted and evaluated before the importing module's body, so the circular
// reference would throw "Cannot access ... before initialization" under
// native ESM (Vite dev), even though a bundler like Rollup can mask it.
export const RACK_CARD_SIZE = Object.freeze({
  width: ((RACK_MIN_SLOTS - 1) * RACK_CARD_PITCH) + RACK_PREVIEW_WIDTH + (RACK_SIDE_MARGIN * 2),
  height: RACK_HEIGHT,
});
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

export function nowIso() {
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

export function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function getCardType(card) {
  if (card?.type === CANVAS_TEXT_CARD_TYPE || card?.type === NOTE_CARD_TYPE || card?.type === TEXT_BOX_CARD_TYPE) {
    return CANVAS_TEXT_CARD_TYPE;
  }

  if (card?.type === FILE_CARD_TYPE) {
    return FILE_CARD_TYPE;
  }

  if (card?.type === TILE_TYPES.LINK) {
    return TILE_TYPES.LINK;
  }

  if (card?.type === AMAZON_PRODUCT_CARD_TYPE) {
    return AMAZON_PRODUCT_CARD_TYPE;
  }

  if (card?.type === GITHUB_REPO_CARD_TYPE) {
    return GITHUB_REPO_CARD_TYPE;
  }

  if (card?.type === WEATHER_CARD_TYPE) {
    return WEATHER_CARD_TYPE;
  }

  if (card?.type === CALENDAR_CARD_TYPE) {
    return CALENDAR_CARD_TYPE;
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

  if (card?.type === PROGRESS_CARD_TYPE) {
    return PROGRESS_CARD_TYPE;
  }

  if (card?.type === TABLE_CARD_TYPE) {
    return TABLE_CARD_TYPE;
  }

  if (card?.type === RACK_CARD_TYPE) {
    return RACK_CARD_TYPE;
  }

  if (card?.type === PAPER_NOTE_CARD_TYPE) {
    return PAPER_NOTE_CARD_TYPE;
  }

  return null;
}

export function normalizeFileExtension(value) {
  return typeof value === "string" ? value.trim().replace(/^\.+/, "").toLowerCase() : "";
}

function normalizeLegacyFolderChildIds(childIds) {
  return Array.isArray(childIds)
    ? [...new Set(childIds.filter((childId) => typeof childId === "string" && childId.trim().length > 0))]
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
  if (type === FILE_CARD_TYPE) {
    return FILE_CARD_SIZE;
  }

  if (type === TILE_TYPES.LINK) {
    return LINK_CARD_SIZE;
  }

  if (type === AMAZON_PRODUCT_CARD_TYPE) {
    return AMAZON_PRODUCT_CARD_SIZE;
  }

  if (type === GITHUB_REPO_CARD_TYPE) {
    return GITHUB_REPO_CARD_SIZE;
  }

  if (type === WEATHER_CARD_TYPE) {
    return WEATHER_CARD_SIZE;
  }

  if (type === CALENDAR_CARD_TYPE) {
    return CALENDAR_CARD_SIZE;
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

  if (type === CANVAS_TEXT_CARD_TYPE) {
    return NOTE_CARD_SIZE;
  }

  if (type === PROGRESS_CARD_TYPE) {
    return PROGRESS_CARD_SIZE;
  }

  if (type === TABLE_CARD_TYPE) {
    return TABLE_CARD_SIZE;
  }

  if (type === RACK_CARD_TYPE) {
    return RACK_CARD_SIZE;
  }

  if (type === PAPER_NOTE_CARD_TYPE) {
    return PAPER_NOTE_CARD_SIZE;
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

// Tethers link two tiles each (Obsidian-style graph edges), persisted as
// { id, a, b } on the page. Older pages stored whole groups as
// { id, tileIds }; those load as a chain of links through the group.
function getTetherPairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function normalizeTethers(tethers, cards) {
  const cardIdSet = new Set((Array.isArray(cards) ? cards : []).map((card) => card.id));
  const seenPairs = new Set();
  const nextTethers = [];
  const pushLink = (id, a, b) => {
    const key = getTetherPairKey(a, b);

    if (a === b || !cardIdSet.has(a) || !cardIdSet.has(b) || seenPairs.has(key)) {
      return;
    }

    seenPairs.add(key);
    nextTethers.push({
      id: typeof id === "string" && id.trim().length > 0 ? id : generateWorkspaceEntityId("tether"),
      a,
      b,
    });
  };

  (Array.isArray(tethers) ? tethers : []).forEach((tether) => {
    if (typeof tether?.a === "string" && typeof tether?.b === "string") {
      pushLink(tether.id, tether.a, tether.b);
      return;
    }

    if (Array.isArray(tether?.tileIds)) {
      const tileIds = [...new Set(tether.tileIds)].filter((tileId) => cardIdSet.has(tileId));
      tileIds.slice(1).forEach((tileId, index) => {
        pushLink(index === 0 ? tether.id : null, tileIds[index], tileId);
      });
    }
  });

  return nextTethers;
}

export function hasTether(page, a, b) {
  const key = getTetherPairKey(a, b);
  return (page?.tethers ?? []).some((tether) => getTetherPairKey(tether.a, tether.b) === key);
}

/** Links tiles `a` and `b`. Self-links and duplicates are refused (null). */
export function addTether(page, a, b, id = generateWorkspaceEntityId("tether")) {
  if (!a || !b || a === b || hasTether(page, a, b)) {
    return null;
  }

  return { ...page, tethers: [...(page.tethers ?? []), { id, a, b }] };
}

/** Links each tile to the next one, in order (skipping pairs already linked). */
export function chainTethers(page, tileIds) {
  const ids = [...new Set(Array.isArray(tileIds) ? tileIds : [])].filter(Boolean);
  let nextPage = page;

  ids.slice(1).forEach((tileId, index) => {
    nextPage = addTether(nextPage, ids[index], tileId) ?? nextPage;
  });

  return nextPage;
}

export function removeTether(page, tetherId) {
  return { ...page, tethers: (page.tethers ?? []).filter((tether) => tether.id !== tetherId) };
}

/** Cuts every tether of one tile. */
export function untetherTile(page, tileId) {
  return { ...page, tethers: (page.tethers ?? []).filter((tether) => tether.a !== tileId && tether.b !== tileId) };
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
    tethers: normalizeTethers(page?.tethers, cards),
    airpaste: page?.airpaste && typeof page.airpaste === "object"
      ? deepCloneStructuredValue(page.airpaste)
      : null,
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
      tethers: workspace?.tethers,
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
    tethers: [],
    airpaste: null,
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
    airpaste: null,
  };
}

export function getRackSlotCount(rackCard) {
  return Math.max(RACK_MIN_SLOTS, Array.isArray(rackCard?.tileIds) ? rackCard.tileIds.length : 0);
}

export function getRackSize(rackCard) {
  return {
    width: ((getRackSlotCount(rackCard) - 1) * RACK_CARD_PITCH) + RACK_PREVIEW_WIDTH + (RACK_SIDE_MARGIN * 2),
    height: RACK_HEIGHT,
  };
}

// Horizontal centre of a tile's preview card, from the rack's left edge.
export function getRackCardCenterX(rackCard, rackIndex) {
  const tileCount = Array.isArray(rackCard?.tileIds) ? rackCard.tileIds.length : 0;
  const normalizedIndex = Number.isFinite(rackIndex) ? rackIndex : 0;

  return (getRackSize(rackCard).width / 2) + ((normalizedIndex - ((tileCount - 1) / 2)) * RACK_CARD_PITCH);
}

// Where a tile lands, full size, when it leaves the rack: centred on its
// card, top edge where the lifted card's top is -- i.e. under the pointer
// that grabbed it.
export function getRackTileWorldPosition(rackCard, tile, rackIndex = tile?.rackIndex ?? 0) {
  return {
    x: rackCard.x + getRackCardCenterX(rackCard, rackIndex) - ((tile?.width ?? 0) / 2),
    y: rackCard.y + RACK_LIFTED_PREVIEW_TOP,
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
  const file = type === FILE_CARD_TYPE ? normalizeFileAttachment(card?.file) : null;
  const contentKind = isLinkLikeCard
    ? normalizeLinkContentKind(card?.contentKind, linkAsset)
    : "";
  const size = getCardSize(type);
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
  const calendarMonth = type === CALENDAR_CARD_TYPE ? normalizeCalendarMonth(card?.month) : CALENDAR_DEFAULT_MONTH;
  const calendarYear = type === CALENDAR_CARD_TYPE ? normalizeCalendarYear(card?.year) : CALENDAR_DEFAULT_YEAR;
  const calendarView = type === CALENDAR_CARD_TYPE ? normalizeCalendarView(card?.view) : CALENDAR_DEFAULT_VIEW;
  const calendarThemeId = type === CALENDAR_CARD_TYPE ? normalizeCalendarThemeId(card?.themeId) : CALENDAR_DEFAULT_THEME_ID;
  const calendarHeightPreset = type === CALENDAR_CARD_TYPE
    ? normalizeCalendarHeightPreset(card?.heightPreset)
    : CALENDAR_DEFAULT_HEIGHT_PRESET;
  const checklistItems = type === CHECKLIST_CARD_TYPE ? normalizeChecklistItems(card?.items) : [];
  const codeLanguage = type === CODE_CARD_TYPE ? normalizeCodeLanguage(card?.language) : CODE_DEFAULT_LANGUAGE;
  const counterValue = type === COUNTER_CARD_TYPE ? normalizeCounterValue(card?.value) : COUNTER_DEFAULT_VALUE;
  const counterStep = type === COUNTER_CARD_TYPE ? normalizeCounterStep(card?.step) : COUNTER_DEFAULT_STEP;
  const counterUnit = type === COUNTER_CARD_TYPE ? normalizeCounterUnit(card?.unit) : COUNTER_DEFAULT_UNIT;
  const deadlineTargetAt = type === DEADLINE_CARD_TYPE ? normalizeDeadlineTargetAt(card?.targetAt) : "";
  const deadlineTimezone = type === DEADLINE_CARD_TYPE ? normalizeDeadlineTimezone(card?.timezone) : DEADLINE_DEFAULT_TIMEZONE;
  const progressMode = type === PROGRESS_CARD_TYPE ? normalizeProgressMode(card?.mode) : PROGRESS_DEFAULT_MODE;
  const progressValue = type === PROGRESS_CARD_TYPE ? normalizeProgressValue(card?.value) : PROGRESS_DEFAULT_VALUE;
  const progressMax = type === PROGRESS_CARD_TYPE ? normalizeProgressMax(card?.max) : PROGRESS_DEFAULT_MAX;
  const progressLinkedTileId = type === PROGRESS_CARD_TYPE ? normalizeProgressLinkedTileId(card?.linkedTileId) : null;
  const languageHints = type === CANVAS_TEXT_CARD_TYPE ? normalizeLanguageHints(card?.languageHints) : [];
  const tableColumns = type === TABLE_CARD_TYPE ? normalizeTableColumns(card?.columns) : [];
  const tableRows = type === TABLE_CARD_TYPE ? normalizeTableRows(card?.rows, tableColumns) : [];
  const canvasText = type === CANVAS_TEXT_CARD_TYPE ? normalizeCanvasTextPayload(card) : null;
  // A (local) sticky is always square: its width is its size.
  const stickySize = canvasText?.variant === CANVAS_TEXT_VARIANT_STICKY && canvasText.source === CANVAS_TEXT_SOURCE_LOCAL
    ? clampStickySize(Number.isFinite(card?.width) ? card.width : size.width)
    : null;
  const paperNoteTitle = type === PAPER_NOTE_CARD_TYPE ? normalizePaperNoteTitle(card?.title) : "";
  const paperNoteSubtitle = type === PAPER_NOTE_CARD_TYPE ? normalizePaperNoteSubtitle(card?.subtitle) : "";
  const paperNoteText = type === PAPER_NOTE_CARD_TYPE ? normalizePaperNoteText(card?.text) : "";
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
    width: type === RACK_CARD_TYPE
      ? rackSize.width
      : stickySize ?? (type === CANVAS_TEXT_CARD_TYPE
        ? Math.max(canvasText.format === CANVAS_TEXT_FORMAT_PLAIN ? QUICK_TEXT_MIN_WIDTH : TEXT_BOX_MIN_WIDTH, Number.isFinite(card?.width) ? card.width : size.width)
        : normalizedLinkDimensions?.width ?? (Number.isFinite(card?.width) ? card.width : size.width)),
    height: type === RACK_CARD_TYPE
      ? rackSize.height
      : stickySize ?? (type === CANVAS_TEXT_CARD_TYPE
        ? Math.max(canvasText.format === CANVAS_TEXT_FORMAT_PLAIN ? QUICK_TEXT_MIN_HEIGHT : TEXT_BOX_MIN_HEIGHT, Number.isFinite(card?.height) ? card.height : size.height)
        : normalizedLinkDimensions?.height ?? (Number.isFinite(card?.height) ? card.height : size.height)),
    url: isLinkLikeCard ? String(card?.url ?? "") : "",
    contentKind,
    title: isLinkLikeCard
      ? String(card?.title ?? "")
      : type === FILE_CARD_TYPE
        ? firstString(card?.title, file?.fileName, FILE_DEFAULT_TITLE)
      : type === CALENDAR_CARD_TYPE
        ? firstString(card?.title, CALENDAR_DEFAULT_TITLE)
      : type === CHECKLIST_CARD_TYPE
        // Not firstString(): that trims on every keystroke, which clobbers
        // a trailing space the instant you type it (the very next render
        // feeds the trimmed value back into the controlled input), making
        // it look like the title field can't contain spaces at all.
        ? (typeof card?.title === "string" ? card.title : CHECKLIST_DEFAULT_TITLE)
        : type === CODE_CARD_TYPE
          ? firstString(card?.title, CODE_DEFAULT_TITLE)
        : type === COUNTER_CARD_TYPE
          ? firstString(card?.title, COUNTER_DEFAULT_TITLE)
        : type === DEADLINE_CARD_TYPE
          ? firstString(card?.title, DEADLINE_DEFAULT_TITLE)
        : type === CANVAS_TEXT_CARD_TYPE
          // A sticky's title is exactly what it has (usually nothing): a
          // derived "Untitled note" would show up as a line of its text.
          ? (canvasText.variant === CANVAS_TEXT_VARIANT_STICKY
            ? canvasText.title
            : firstString(canvasText.title, deriveCanvasTextTitle(canvasText), NOTE_DEFAULT_TITLE))
        : type === PROGRESS_CARD_TYPE
          ? firstString(card?.title, PROGRESS_DEFAULT_TITLE)
          : type === TABLE_CARD_TYPE
            ? firstString(card?.title, TABLE_DEFAULT_TITLE)
            : type === RACK_CARD_TYPE
              ? firstString(card?.title, RACK_DEFAULT_TITLE)
            : type === PAPER_NOTE_CARD_TYPE
              ? paperNoteTitle
        : "",
    description: isLinkLikeCard
      ? String(card?.description ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.description, RACK_DEFAULT_DESCRIPTION)
        : "",
    body: "",
    subtitle: type === PAPER_NOTE_CARD_TYPE ? paperNoteSubtitle : "",
    text: type === CANVAS_TEXT_CARD_TYPE
      ? canvasText.text
      : type === PAPER_NOTE_CARD_TYPE
        ? paperNoteText
        : "",
    style: type === CANVAS_TEXT_CARD_TYPE ? canvasText.style : null,
    placeholder: type === CANVAS_TEXT_CARD_TYPE ? canvasText.placeholder : false,
    appearance: type === CANVAS_TEXT_CARD_TYPE && canvasText.variant === CANVAS_TEXT_VARIANT_STICKY ? "sticky" : "plain",
    placeholderText: type === CANVAS_TEXT_CARD_TYPE ? canvasText.placeholderText : TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT,
    autoWidth: type === CANVAS_TEXT_CARD_TYPE ? canvasText.autoWidth : false,
    source: type === CANVAS_TEXT_CARD_TYPE ? canvasText.source : CANVAS_TEXT_SOURCE_LOCAL,
    variant: type === CANVAS_TEXT_CARD_TYPE ? canvasText.variant : CANVAS_TEXT_VARIANT_DEFAULT,
    format: type === CANVAS_TEXT_CARD_TYPE ? canvasText.format : "",
    titleMode: type === CANVAS_TEXT_CARD_TYPE ? canvasText.titleMode : CANVAS_TEXT_TITLE_MODE_DERIVED,
    sticky: type === CANVAS_TEXT_CARD_TYPE ? canvasText.sticky : null,
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
    mode: type === PROGRESS_CARD_TYPE ? progressMode : "",
    max: type === PROGRESS_CARD_TYPE ? progressMax : null,
    linkedTileId: type === PROGRESS_CARD_TYPE ? progressLinkedTileId : null,
    month: type === CALENDAR_CARD_TYPE ? calendarMonth : null,
    year: type === CALENDAR_CARD_TYPE ? calendarYear : null,
    view: type === CALENDAR_CARD_TYPE ? calendarView : "",
    themeId: type === CALENDAR_CARD_TYPE ? calendarThemeId : "",
    heightPreset: type === CALENDAR_CARD_TYPE ? calendarHeightPreset : "",
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
    mediaAspectRatio: rawMediaAspectRatio,
    previewKind: isLinkLikeCard && card?.previewKind === "music" ? "music" : "default",
    previewError: isLinkLikeCard ? String(card?.previewError ?? "") : "",
    status: isLinkLikeCard && LINK_PREVIEW_STATUSES.includes(card?.status)
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
    asset: type === TILE_TYPES.LINK ? linkAsset : null,
    file: type === CANVAS_TEXT_CARD_TYPE ? canvasText.file : file,
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
    repo: type === GITHUB_REPO_CARD_TYPE ? normalizeGitHubRepoData(card?.repo, card?.url) : null,
    city: type === WEATHER_CARD_TYPE ? normalizeWeatherCity(card?.city) : "",
    location: type === WEATHER_CARD_TYPE ? normalizeWeatherLocation(card?.location) : null,
    dateLabel: type === CHECKLIST_CARD_TYPE ? normalizeChecklistDateLabel(card?.dateLabel, createdAt) : "",
    timeLabel: type === CHECKLIST_CARD_TYPE ? normalizeChecklistTimeLabel(card?.timeLabel, createdAt) : "",
    columns: tableColumns,
    rows: tableRows,
    tileIds: rackTileIds,
    minSlots: type === RACK_CARD_TYPE
      ? Math.max(RACK_MIN_SLOTS, Number.isFinite(card?.minSlots) ? card.minSlots : RACK_MIN_SLOTS)
      : null,
    plasticColor: type === RACK_CARD_TYPE ? normalizeRackPlasticColor(card?.plasticColor) : null,
    layout: normalizeCardLayout(card?.layout),
    airpaste: card?.airpaste && typeof card.airpaste === "object"
      ? deepCloneStructuredValue(card.airpaste)
      : null,
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
    edges: activePage.edges,
    groups: activePage.groups,
    tethers: activePage.tethers,
    airpaste: safeWorkspace?.airpaste && typeof safeWorkspace.airpaste === "object"
      ? deepCloneStructuredValue(safeWorkspace.airpaste)
      : null,
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

  // Versions 13-17 never changed the *shape* of any pre-existing card type --
  // each bump shipped purely additive new tile types (checklist/code/note/
  // table at v14, the dock UI at v15, the calendar tile at v16, another dock
  // pass at v17), which `normalizeCard` already defaults correctly for old
  // data with zero cards of the new types. These branches are therefore
  // no-ops today, but are written explicitly (rather than left as a gap) so
  // a *future* version bump that does change an existing type's shape has an
  // obvious place to add a real transform, and so the version-reached check
  // below can catch a forgotten branch instead of silently masking it.
  if (version < 13) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 13,
    };
  }

  if (version < 14) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 14,
    };
  }

  if (version < 15) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 15,
    };
  }

  if (version < 16) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 16,
    };
  }

  if (version < 17) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 17,
    };
  }

  if (nextWorkspace.version < WORKSPACE_SCHEMA_VERSION && typeof console !== "undefined") {
    // A version bump landed without a corresponding migration branch above.
    // This does not block loading (normalizeWorkspace still stamps the
    // current version), but it means any shape change that bump introduced
    // for pre-existing card types has not been explicitly migrated -- treat
    // this warning as a signal to add the missing branch, not to ignore it.
    console.warn(
      `[workspace] migrateWorkspace only reached version ${nextWorkspace.version}, `
      + `expected ${WORKSPACE_SCHEMA_VERSION}. Add an explicit migration branch for the gap.`,
    );
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

  // A repo tile keeps its type and last-known numbers while it refreshes,
  // so it shows its own loading state instead of becoming a link tile.
  if (card.type === GITHUB_REPO_CARD_TYPE) {
    return { status: "loading", previewError: "" };
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

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest(
    "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])",
  ));
}

export function isEditableElement(element) {
  return isTypingTarget(element);
}

export function formatCardSubtitle(card) {
  if (card.type === FILE_CARD_TYPE) {
    const extension = normalizeFileExtension(card.file?.extension);
    const extensionLabel = extension ? `.${extension}` : ".file";
    const sizeBytes = Number.isFinite(card.file?.sizeBytes) ? card.file.sizeBytes : 0;

    if (sizeBytes > 0) {
      const megabytes = sizeBytes / (1024 * 1024);
      const sizeLabel = megabytes >= 1
        ? `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`
        : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
      return `${extensionLabel} · ${sizeLabel}`;
    }

    return extensionLabel;
  }

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

  if (card.type === CALENDAR_CARD_TYPE) {
    return `${normalizeCalendarView(card.view)} view · ${normalizeCalendarHeightPreset(card.heightPreset)}`;
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

  if (card.type === CANVAS_TEXT_CARD_TYPE) {
    const lineCount = getCanvasTextLineCount(card.text ?? "");
    const sourceLabel = card.source === CANVAS_TEXT_SOURCE_FILE ? "file-backed" : "local";
    const variantLabel = card.variant === CANVAS_TEXT_VARIANT_STICKY
      ? "sticky"
      : (card.format === CANVAS_TEXT_FORMAT_PLAIN ? "plain text" : "markdown");
    return `${lineCount} ${lineCount === 1 ? "line" : "lines"} · ${variantLabel} · ${sourceLabel}`;
  }

  if (card.type === WEATHER_CARD_TYPE) {
    return `weather · ${card.city || "local"}`;
  }

  if (card.type === GITHUB_REPO_CARD_TYPE) {
    return firstString(card.repo?.owner && card.repo?.name ? `${card.repo.owner}/${card.repo.name}` : "", "GitHub repository");
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

// Returns { [pageId]: viewport } when the only differences between two page
// lists are page viewports (a pan or zoom), otherwise null. Pages carry every
// tile -- embedded images included -- so autosave uses this to send just the
// viewports instead of resending every page after each pan.
export function getViewportOnlyPageChanges(previousPages, nextPages) {
  if (!Array.isArray(previousPages) || !Array.isArray(nextPages) || previousPages.length !== nextPages.length) {
    return null;
  }

  const viewports = {};

  for (let index = 0; index < nextPages.length; index += 1) {
    const previousPage = previousPages[index];
    const nextPage = nextPages[index];

    if (previousPage === nextPage) {
      continue;
    }

    if (!previousPage || !nextPage || previousPage.id !== nextPage.id) {
      return null;
    }

    const keys = new Set([...Object.keys(previousPage), ...Object.keys(nextPage)]);
    for (const key of keys) {
      if (key !== "viewport" && previousPage[key] !== nextPage[key]) {
        return null;
      }
    }

    viewports[nextPage.id] = nextPage.viewport;
  }

  return Object.keys(viewports).length > 0 ? viewports : null;
}

// For a workspace that is already normalized (everything in AppProvider's
// history is): refreshes the top-level mirror of the active page (cards,
// viewport, ...) from `pages` without re-normalizing anything, and returns the
// same object when the mirror is already current. normalizeWorkspace rebuilds
// every card -- and deep-clones `airpaste` -- so calling it on each update gave
// every tile a new identity and re-rendered all of them after every pan.
export function withActivePageMirror(workspace) {
  const activePage = getWorkspaceActivePage(workspace);

  if (
    workspace.activePageId === activePage.id
    && workspace.activePage === activePage
    && workspace.viewport === activePage.viewport
    && workspace.view === activePage.view
    && workspace.cards === activePage.cards
    && workspace.drawings === activePage.drawings
    && workspace.edges === activePage.edges
    && workspace.groups === activePage.groups
    && workspace.tethers === activePage.tethers
  ) {
    return workspace;
  }

  return {
    ...workspace,
    activePageId: activePage.id,
    activePage,
    viewport: activePage.viewport,
    view: activePage.view,
    cards: activePage.cards,
    drawings: activePage.drawings,
    edges: activePage.edges,
    groups: activePage.groups,
    tethers: activePage.tethers,
  };
}
