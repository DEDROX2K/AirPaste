// Tab order rules: Home is always first, pinned tabs come next, then the
// rest. Positions are "insert before the tab at this index"; tabs.length
// means "at the end".

const HOME_TAB_ID = "home";

export function pinnedTabCount(tabs) {
  return tabs.filter((tab) => tab.pinned).length;
}

// Where `tab` may go, as an insert-before index (0..tabs.length).
function clampMoveIndex(tabs, tab, targetIndex) {
  const currentIndex = tabs.findIndex((entry) => entry.id === tab?.id);

  if (!tab || !Number.isFinite(targetIndex)) {
    return Math.max(0, currentIndex);
  }

  if (tab.id === HOME_TAB_ID) {
    return 0;
  }

  const normalizedTarget = Math.max(0, Math.min(tabs.length, targetIndex));
  const pinnedCount = pinnedTabCount(tabs);

  if (tab.pinned) {
    return Math.max(1, Math.min(pinnedCount, normalizedTarget));
  }

  // tabs.length is allowed: "after the last tab". (Clamping to
  // tabs.length - 1 used to drop a tab one place short of the end.)
  return Math.max(Math.max(1, pinnedCount), Math.min(tabs.length, normalizedTarget));
}

export function clampInsertIndex(tabs, tab, targetIndex) {
  const normalizedTarget = Math.max(0, Math.min(tabs.length, targetIndex));
  const pinnedCount = pinnedTabCount(tabs);

  if (tab?.pinned) {
    return Math.max(1, Math.min(pinnedCount, normalizedTarget));
  }

  return Math.max(Math.max(1, pinnedCount), Math.min(tabs.length, normalizedTarget));
}

// Moves tabId so it sits before the tab now at targetIndex (or at the end).
export function reorderTabs(tabs, tabId, targetIndex) {
  const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (currentIndex === -1) {
    return tabs;
  }

  const tab = tabs[currentIndex];
  const nextIndex = clampMoveIndex(tabs, tab, targetIndex);
  const insertIndex = currentIndex < nextIndex ? nextIndex - 1 : nextIndex;

  if (insertIndex === currentIndex) {
    return tabs;
  }

  const nextTabs = [...tabs];
  nextTabs.splice(currentIndex, 1);
  nextTabs.splice(insertIndex, 0, tab);
  return nextTabs;
}

// The strip slot a dragged tab is over, browser-style: it passes a
// neighbour once its leading edge (right edge going right, left edge going
// left) crosses that neighbour's middle. `others` are the other tabs'
// rects in strip order; returns how many of them end up before it.
export function getDragSlot(others, draggedLeft, draggedRight, movingRight) {
  const edge = movingRight ? draggedRight : draggedLeft;
  return others.filter((rect) => rect.left + rect.width / 2 < edge).length;
}
