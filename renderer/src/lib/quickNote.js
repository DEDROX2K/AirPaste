// Quick note: a small always-there checklist that lives outside the canvas.
// It is UI state, not a tile: it persists in .airpaste/ui-state.json under
// `quickNote`, never in a canvas page, the undo history or the tile registry.

export const QUICK_NOTE_SAVE_DEBOUNCE_MS = 400;
export const QUICK_NOTE_MAX_ITEMS = 200;
export const QUICK_NOTE_MAX_TEXT = 500;

function makeId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `qn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeQuickNoteItem(item = {}) {
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id : makeId(),
    text: typeof item.text === "string" ? item.text.slice(0, QUICK_NOTE_MAX_TEXT) : "",
    checked: item.checked === true,
  };
}

export function normalizeQuickNote(value) {
  const safe = value && typeof value === "object" ? value : {};
  const items = Array.isArray(safe.items)
    ? safe.items.slice(0, QUICK_NOTE_MAX_ITEMS).map((item) => makeQuickNoteItem(item))
    : [];
  return {
    open: safe.open !== false,
    items,
  };
}
