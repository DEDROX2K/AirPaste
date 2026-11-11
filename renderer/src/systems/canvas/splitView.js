// Split screen: two canvas panes side by side on the same canvas file.
// The left pane is the normal canvas (active page + the page's own saved
// viewport, unchanged from single-pane). The right pane has its own page and
// viewport, kept per canvas file in .airpaste/ui-state.json under
// `splitView` -- UI state, never part of the canvas document.
//
// ui-state.json:
//   splitView: {
//     enabled: boolean,
//     ratio: number,               // left pane share, 0.15..0.85
//     panes: {
//       [canvasFilePath]: { pageId: string|null, viewport: {x,y,zoom}|null }
//     }
//   }

import { removeStructuredEntriesForTileIds, withActivePageMirror } from "../../lib/workspace";

export const SPLIT_MIN_PANE_WIDTH = 320;
export const SPLIT_DIVIDER_WIDTH = 8;
export const SPLIT_SAVE_DEBOUNCE_MS = 400;
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;
const MAX_PANE_ENTRIES = 200;

function normalizeViewport(value) {
  if (!value || typeof value !== "object") return null;
  const { x, y, zoom } = value;
  if (![x, y, zoom].every(Number.isFinite) || zoom <= 0) return null;
  return { x, y, zoom };
}

export function normalizeSplitView(value) {
  const safe = value && typeof value === "object" ? value : {};
  const panes = {};
  if (safe.panes && typeof safe.panes === "object") {
    for (const [key, pane] of Object.entries(safe.panes).slice(-MAX_PANE_ENTRIES)) {
      if (!pane || typeof pane !== "object") continue;
      panes[key] = {
        pageId: typeof pane.pageId === "string" ? pane.pageId : null,
        viewport: normalizeViewport(pane.viewport),
      };
    }
  }
  return {
    enabled: safe.enabled === true,
    ratio: Number.isFinite(safe.ratio) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, safe.ratio)) : 0.5,
    panes,
  };
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

// Moves dragged tiles from one page to another (a drop into the other split
// pane showing a different page). Dragged tiles shift by `delta`; tiles
// sitting inside a dragged rack travel with it unchanged. Edges and groups
// that reference a moved tile are dropped from the source page; tethers
// come along when both ends move, and are cut otherwise.
export function moveTilesBetweenPages(workspace, { sourcePageId, targetPageId, tileIds, delta }) {
  const pages = Array.isArray(workspace?.pages) ? workspace.pages : [];
  const sourcePage = pages.find((page) => page.id === sourcePageId);
  const targetPage = pages.find((page) => page.id === targetPageId);

  if (!sourcePage || !targetPage || sourcePageId === targetPageId || !tileIds?.length) {
    return workspace;
  }

  const draggedIds = new Set(tileIds.filter((id) => sourcePage.cards.some((card) => card.id === id)));
  if (draggedIds.size === 0) {
    return workspace;
  }

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
  const carriedTethers = sourceTethers.filter((link) => movedIds.has(link.a) && movedIds.has(link.b));

  const nextSource = {
    ...sourcePage,
    cards: sourcePage.cards.filter((card) => !movedIds.has(card.id)),
    edges: removeStructuredEntriesForTileIds(sourcePage.edges, movedIdList),
    groups: removeStructuredEntriesForTileIds(sourcePage.groups, movedIdList),
    tethers: sourceTethers.filter((link) => !movedIds.has(link.a) && !movedIds.has(link.b)),
  };
  const nextTarget = {
    ...targetPage,
    cards: [...targetPage.cards, ...movedCards],
    tethers: [...(targetPage.tethers ?? []), ...carriedTethers],
  };

  return {
    ...workspace,
    pages: pages.map((page) => {
      if (page.id === sourcePageId) return nextSource;
      if (page.id === targetPageId) return nextTarget;
      return page;
    }),
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
