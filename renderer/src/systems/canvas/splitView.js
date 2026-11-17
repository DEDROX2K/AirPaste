// Split screen and floating view. UI state, kept in
// .airpaste/ui-state.json under `splitView`, never in a canvas document.
//
// - Split: the left pane is the active tab's canvas. Its right pane shows
//   either another page of the same file (`filePath: null`, with its own
//   page and viewport) or another canvas file (`filePath` set: a linked
//   pair, shown whenever either file's tab is active).
// - Floating: one canvas in a small phone-shaped card over the app.
//
// ui-state.json:
//   splitView: {
//     ratio: number,               // left pane share, 0.15..0.85
//     panes: {
//       [leftCanvasFilePath]: {
//         enabled: boolean,
//         filePath: string|null,     // null = same file, another page
//         pageId: string|null,       // same-file split only
//         viewport: {x,y,zoom}|null, // same-file split only
//       }
//     },
//     floating: { filePath, x, y, orientation: "portrait"|"landscape",
//                 snap: null|"left"|"right"|"top"|"bottom" } | null
//   }

import { removeStructuredEntriesForTileIds, withActivePageMirror } from "../../lib/workspace";

export const SPLIT_MIN_PANE_WIDTH = 320;
export const SPLIT_DIVIDER_WIDTH = 8;
export const SPLIT_SAVE_DEBOUNCE_MS = 400;
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;
const MAX_PANE_ENTRIES = 200;

export const FLOAT_SIZES = Object.freeze({
  portrait: Object.freeze({ width: 300, height: 540 }),
  landscape: Object.freeze({ width: 540, height: 300 }),
});
export const FLOAT_EDGE_INSET = 12;
export const FLOAT_SNAP_DISTANCE = 32;
const FLOAT_SNAPS = new Set(["left", "right", "top", "bottom"]);

function normalizeViewport(value) {
  if (!value || typeof value !== "object") return null;
  const { x, y, zoom } = value;
  if (![x, y, zoom].every(Number.isFinite) || zoom <= 0) return null;
  return { x, y, zoom };
}

function normalizeFloating(value) {
  if (!value || typeof value !== "object" || typeof value.filePath !== "string" || !value.filePath) {
    return null;
  }
  return {
    filePath: value.filePath,
    x: Number.isFinite(value.x) ? value.x : null,
    y: Number.isFinite(value.y) ? value.y : null,
    orientation: value.orientation === "landscape" ? "landscape" : "portrait",
    snap: FLOAT_SNAPS.has(value.snap) ? value.snap : null,
  };
}

// Older ui-state had one global `enabled` flag; it's dropped (every split
// starts closed once) rather than guessed onto a file.
export function normalizeSplitView(value) {
  const safe = value && typeof value === "object" ? value : {};
  const panes = {};
  if (safe.panes && typeof safe.panes === "object") {
    for (const [key, pane] of Object.entries(safe.panes).slice(-MAX_PANE_ENTRIES)) {
      if (!pane || typeof pane !== "object") continue;
      const filePath = typeof pane.filePath === "string" && pane.filePath && pane.filePath !== key ? pane.filePath : null;
      panes[key] = {
        enabled: pane.enabled === true,
        filePath,
        pageId: typeof pane.pageId === "string" ? pane.pageId : null,
        viewport: normalizeViewport(pane.viewport),
      };
    }
  }
  return {
    ratio: Number.isFinite(safe.ratio) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, safe.ratio)) : 0.5,
    panes,
    floating: normalizeFloating(safe.floating),
  };
}

// The open two-file pair `filePath` belongs to (as either half), or null.
export function findFilePair(splitView, filePath) {
  if (!filePath || !splitView?.panes) return null;
  const own = splitView.panes[filePath];
  if (own?.enabled && own.filePath) {
    return { leftPath: filePath, rightPath: own.filePath };
  }
  for (const [leftPath, pane] of Object.entries(splitView.panes)) {
    if (pane?.enabled && pane.filePath === filePath) {
      return { leftPath, rightPath: filePath };
    }
  }
  return null;
}

function withPane(splitView, leftPath, patch) {
  const previous = splitView.panes[leftPath] ?? { enabled: false, filePath: null, pageId: null, viewport: null };
  return { ...splitView, panes: { ...splitView.panes, [leftPath]: { ...previous, ...patch } } };
}

// Closes every two-file pair `filePath` is part of, and the floating view
// if it shows that file. A file is only ever on screen in one place.
export function detachFile(splitView, filePath) {
  if (!filePath) return splitView;
  let next = splitView;
  for (const [leftPath, pane] of Object.entries(splitView.panes)) {
    if (!pane?.enabled || !pane.filePath) continue;
    if (leftPath === filePath || pane.filePath === filePath) {
      next = withPane(next, leftPath, { enabled: false, filePath: null });
    }
  }
  if (next.floating?.filePath === filePath) {
    next = { ...next, floating: null };
  }
  return next;
}

// Opens `leftPath | rightPath` as a linked pair.
export function openFilePair(splitView, leftPath, rightPath) {
  if (!leftPath || !rightPath || leftPath === rightPath) return splitView;
  let next = detachFile(detachFile(splitView, leftPath), rightPath);
  // The right file's own same-file split would otherwise come back when its
  // tab is clicked; that tab now shows the pair.
  if (next.panes[rightPath]?.enabled) {
    next = withPane(next, rightPath, { enabled: false });
  }
  return withPane(next, leftPath, { enabled: true, filePath: rightPath });
}

// Same-file split on `leftPath`, showing `pageId` on the right.
export function openPageSplit(splitView, leftPath, pageId, viewport = null) {
  if (!leftPath) return splitView;
  const next = detachFile(splitView, leftPath);
  return withPane(next, leftPath, { enabled: true, filePath: null, pageId: pageId ?? null, viewport });
}

// Closes whatever split `filePath` is showing (its pair, or its own
// same-file split).
export function closeSplitFor(splitView, filePath) {
  const pair = findFilePair(splitView, filePath);
  if (pair) return withPane(splitView, pair.leftPath, { enabled: false, filePath: null });
  if (splitView.panes[filePath]?.enabled) return withPane(splitView, filePath, { enabled: false });
  return splitView;
}

export function openFloating(splitView, filePath) {
  if (!filePath) return splitView;
  const previous = splitView.floating;
  const next = detachFile(splitView, filePath);
  return {
    ...next,
    floating: {
      filePath,
      x: previous?.x ?? null,
      y: previous?.y ?? null,
      orientation: previous?.orientation ?? "portrait",
      snap: previous?.snap ?? null,
    },
  };
}

// The floating card's size in a window of `bounds`, never larger than the
// window minus the edge inset.
export function getFloatSize(orientation, bounds) {
  const base = FLOAT_SIZES[orientation] ?? FLOAT_SIZES.portrait;
  const maxWidth = Math.max(160, (bounds?.width ?? base.width) - FLOAT_EDGE_INSET * 2);
  const maxHeight = Math.max(160, (bounds?.height ?? base.height) - FLOAT_EDGE_INSET * 2);
  return { width: Math.min(base.width, maxWidth), height: Math.min(base.height, maxHeight) };
}

function floatLimits(size, bounds) {
  const left = bounds.left ?? 0;
  const top = bounds.top ?? 0;
  return {
    minX: left + FLOAT_EDGE_INSET,
    minY: top + FLOAT_EDGE_INSET,
    maxX: Math.max(left + FLOAT_EDGE_INSET, left + bounds.width - size.width - FLOAT_EDGE_INSET),
    maxY: Math.max(top + FLOAT_EDGE_INSET, top + bounds.height - size.height - FLOAT_EDGE_INSET),
  };
}

export function clampFloatPosition({ x, y, width, height }, bounds) {
  const { minX, minY, maxX, maxY } = floatLimits({ width, height }, bounds);
  return {
    x: Math.round(Math.max(minX, Math.min(maxX, x))),
    y: Math.round(Math.max(minY, Math.min(maxY, y))),
  };
}

// Where a released floating card settles: within FLOAT_SNAP_DISTANCE of an
// edge it sticks to that edge (on a corner both axes stick, and `snap`
// names the side). Always kept inside `bounds`.
export function snapFloatPosition(rect, bounds) {
  const { minX, minY, maxX, maxY } = floatLimits(rect, bounds);
  let { x, y } = clampFloatPosition(rect, bounds);
  let snapX = null;
  let snapY = null;
  if (x - minX <= FLOAT_SNAP_DISTANCE) { x = minX; snapX = "left"; }
  else if (maxX - x <= FLOAT_SNAP_DISTANCE) { x = maxX; snapX = "right"; }
  if (y - minY <= FLOAT_SNAP_DISTANCE) { y = minY; snapY = "top"; }
  else if (maxY - y <= FLOAT_SNAP_DISTANCE) { y = maxY; snapY = "bottom"; }
  return { x: Math.round(x), y: Math.round(y), snap: snapX ?? snapY };
}

// A new floating card: on the right edge, centred vertically.
export function defaultFloatPosition(size, bounds) {
  return snapFloatPosition({
    x: (bounds.left ?? 0) + bounds.width,
    y: (bounds.top ?? 0) + (bounds.height - size.height) / 2,
    ...size,
  }, bounds);
}

// Which drop box a point is in. The area splits in thirds: left, middle
// (floating view), right. Without a file to split with, only the middle.
export function getDetachZone(area, clientX, clientY, canSplit) {
  if (!area) return null;
  if (clientX < area.left || clientX > area.left + area.width || clientY < area.top || clientY > area.top + area.height) {
    return null;
  }
  const t = (clientX - area.left) / area.width;
  if (t < 1 / 3) return canSplit ? "left" : null;
  if (t > 2 / 3) return canSplit ? "right" : null;
  return "float";
}

// Keeps both panes at least SPLIT_MIN_PANE_WIDTH wide. When the container
// can't fit two minimum panes, the split sits at the middle.
export function clampSplitRatio(ratio, containerWidth) {
  const usable = containerWidth - SPLIT_DIVIDER_WIDTH;
  if (!Number.isFinite(usable) || usable < SPLIT_MIN_PANE_WIDTH * 2) {
    return 0.5;
  }
  const min = Math.max(MIN_RATIO, SPLIT_MIN_PANE_WIDTH / usable);
  const max = Math.min(MAX_RATIO, 1 - SPLIT_MIN_PANE_WIDTH / usable);
  return Math.min(max, Math.max(min, Number.isFinite(ratio) ? ratio : 0.5));
}

export function isSplitToggleShortcut(event) {
  return Boolean(event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && (event.key === "\\" || event.code === "Backslash");
}

// Runs a workspace updater against `pageId` instead of the active page (the
// split screen's second pane). The updater sees that page as active, so the
// usual updateActivePageDocument / getWorkspaceActivePage paths edit it; the
// real active page is restored afterwards unless the updater itself chose a
// different page (e.g. creating a page).
export function applyInPageScope(currentWorkspace, pageId, updater) {
  if (!currentWorkspace?.pages?.some((page) => page.id === pageId) || currentWorkspace.activePageId === pageId) {
    return typeof updater === "function" ? updater(currentWorkspace) : updater;
  }

  const realActivePageId = currentWorkspace.activePageId;
  const scoped = withActivePageMirror({ ...currentWorkspace, activePageId: pageId });
  const next = typeof updater === "function" ? updater(scoped) : updater;

  if (!next || typeof next !== "object") {
    return currentWorkspace;
  }

  if (next === scoped) {
    return currentWorkspace;
  }

  if (next.activePageId !== pageId) {
    return next;
  }

  return withActivePageMirror({ ...next, activePageId: realActivePageId });
}

// Takes dragged tiles out of a page (a drop into the other split pane, or
// the floating view). Dragged tiles shift by `delta`; tiles sitting inside a
// dragged rack travel with it unchanged. Edges and groups that reference a
// moved tile are dropped from the source page; tethers come along when both
// ends move, and are cut otherwise. Null when nothing would move.
export function takeTilesFromPage(sourcePage, tileIds, delta) {
  if (!sourcePage || !tileIds?.length) return null;
  const draggedIds = new Set(tileIds.filter((id) => sourcePage.cards.some((card) => card.id === id)));
  if (draggedIds.size === 0) return null;

  const movedIds = new Set(draggedIds);
  for (const card of sourcePage.cards) {
    if (card.parentRackId && draggedIds.has(card.parentRackId)) {
      movedIds.add(card.id);
    }
  }

  const dx = Number.isFinite(delta?.x) ? delta.x : 0;
  const dy = Number.isFinite(delta?.y) ? delta.y : 0;
  const movedCards = sourcePage.cards
    .filter((card) => movedIds.has(card.id))
    .map((card) => (draggedIds.has(card.id) && !card.parentRackId
      ? { ...card, x: Math.round(card.x + dx), y: Math.round(card.y + dy) }
      : card));
  const movedIdList = [...movedIds];
  const sourceTethers = sourcePage.tethers ?? [];

  return {
    movedCards,
    carriedTethers: sourceTethers.filter((link) => movedIds.has(link.a) && movedIds.has(link.b)),
    nextSourcePage: {
      ...sourcePage,
      cards: sourcePage.cards.filter((card) => !movedIds.has(card.id)),
      edges: removeStructuredEntriesForTileIds(sourcePage.edges, movedIdList),
      groups: removeStructuredEntriesForTileIds(sourcePage.groups, movedIdList),
      tethers: sourceTethers.filter((link) => !movedIds.has(link.a) && !movedIds.has(link.b)),
    },
  };
}

export function addTilesToPage(targetPage, movedCards, carriedTethers = []) {
  return {
    ...targetPage,
    cards: [...targetPage.cards, ...movedCards],
    tethers: [...(targetPage.tethers ?? []), ...carriedTethers],
  };
}

function replacePage(workspace, pageId, nextPage) {
  return {
    ...workspace,
    pages: workspace.pages.map((page) => (page.id === pageId ? nextPage : page)),
  };
}

// Moves dragged tiles from one page to another of the same file.
export function moveTilesBetweenPages(workspace, { sourcePageId, targetPageId, tileIds, delta }) {
  const pages = Array.isArray(workspace?.pages) ? workspace.pages : [];
  const sourcePage = pages.find((page) => page.id === sourcePageId);
  const targetPage = pages.find((page) => page.id === targetPageId);
  if (!sourcePage || !targetPage || sourcePageId === targetPageId) {
    return workspace;
  }

  const taken = takeTilesFromPage(sourcePage, tileIds, delta);
  if (!taken) return workspace;

  return replacePage(
    replacePage(workspace, sourcePageId, taken.nextSourcePage),
    targetPageId,
    addTilesToPage(targetPage, taken.movedCards, taken.carriedTethers),
  );
}

// Moves dragged tiles from a page of one canvas file to a page of another
// (split pair or floating view). Returns both next workspaces, or null when
// nothing would move. A tile whose id already exists in the target gets a
// fresh id (and its tethers follow).
export function moveTilesBetweenFiles(sourceWorkspace, targetWorkspace, { sourcePageId, targetPageId, tileIds, delta }) {
  const sourcePage = sourceWorkspace?.pages?.find((page) => page.id === sourcePageId);
  const targetPage = targetWorkspace?.pages?.find((page) => page.id === targetPageId);
  if (!sourcePage || !targetPage) return null;

  const taken = takeTilesFromPage(sourcePage, tileIds, delta);
  if (!taken) return null;

  const usedIds = new Set(targetWorkspace.pages.flatMap((page) => page.cards.map((card) => card.id)));
  const renamed = new Map();
  for (const card of taken.movedCards) {
    if (usedIds.has(card.id)) {
      let nextId = `${card.id}-${Math.random().toString(36).slice(2, 8)}`;
      while (usedIds.has(nextId)) nextId = `${card.id}-${Math.random().toString(36).slice(2, 8)}`;
      renamed.set(card.id, nextId);
      usedIds.add(nextId);
    }
  }
  const rename = (id) => renamed.get(id) ?? id;
  const movedCards = renamed.size === 0 ? taken.movedCards : taken.movedCards.map((card) => ({
    ...card,
    id: rename(card.id),
    ...(card.parentRackId ? { parentRackId: rename(card.parentRackId) } : {}),
  }));
  const carriedTethers = renamed.size === 0 ? taken.carriedTethers : taken.carriedTethers.map((link) => ({
    ...link,
    a: rename(link.a),
    b: rename(link.b),
  }));

  return {
    source: replacePage(sourceWorkspace, sourcePageId, taken.nextSourcePage),
    target: replacePage(targetWorkspace, targetPageId, addTilesToPage(targetPage, movedCards, carriedTethers)),
  };
}

// Same-page drop into the other pane: the tiles just move to where they
// were dropped (that pane's camera may be anywhere on the page).
export function movePageTilesBy(workspace, pageId, tileIds, delta) {
  const ids = new Set(tileIds ?? []);
  const dx = Number.isFinite(delta?.x) ? delta.x : 0;
  const dy = Number.isFinite(delta?.y) ? delta.y : 0;
  if (ids.size === 0 || (dx === 0 && dy === 0)) {
    return workspace;
  }
  return {
    ...workspace,
    pages: (workspace?.pages ?? []).map((page) => (
      page.id === pageId
        ? {
          ...page,
          cards: page.cards.map((card) => (
            ids.has(card.id) && !card.parentRackId
              ? { ...card, x: Math.round(card.x + dx), y: Math.round(card.y + dy) }
              : card
          )),
        }
        : page
    )),
  };
}
