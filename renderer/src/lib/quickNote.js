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

// First-run intro: the very first time the app shows a quick note (on any
// Dome), it opens with two editable starter tasks. Remembered app-wide in
// localStorage so later Domes, and later launches, start empty.
export const QUICK_NOTE_WELCOME_STORAGE_KEY = "airpaste.quickNote.welcomed";
export const QUICK_NOTE_WELCOME_TEXTS = [
  "Welcome to AirPaste",
  "This is a quick checklist you can add things into and hide it quick!",
];

export function makeWelcomeQuickNote() {
  return {
    open: true,
    items: QUICK_NOTE_WELCOME_TEXTS.map((text) => makeQuickNoteItem({ text })),
  };
}

// Claims the one-time welcome: true only on the first call ever (per
// install), when the folder has no saved quick note yet.
export function claimQuickNoteWelcome(savedQuickNote, storage = globalThis.localStorage) {
  if (savedQuickNote && typeof savedQuickNote === "object") return false;
  try {
    if (!storage || storage.getItem(QUICK_NOTE_WELCOME_STORAGE_KEY) === "true") return false;
    storage.setItem(QUICK_NOTE_WELCOME_STORAGE_KEY, "true");
    return true;
  } catch {
    return false;
  }
}
