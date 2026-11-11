import { useSyncExternalStore } from "react";

// Colour marks for cards and rows (home canvases, workspaces, lists), so
// things can be told apart at a glance. Four to start; add more here and the
// menu and the CSS pick them up (the CSS reads [data-card-color="<id>"]).
// Stored per machine for now: { [itemKey]: colorId }.

export const CARD_COLORS = Object.freeze([
  { id: "rose", label: "Rose", swatch: "#f3a9a0" },
  { id: "amber", label: "Amber", swatch: "#f1cf7a" },
  { id: "mint", label: "Mint", swatch: "#9fd8b0" },
  { id: "sky", label: "Sky", swatch: "#9cc4ee" },
]);

const STORAGE_KEY = "airpaste.cardColors";
const validIds = new Set(CARD_COLORS.map((color) => color.id));
const listeners = new Set();
let cache = null;

function load() {
  if (cache) {
    return cache;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    cache = Object.fromEntries(
      Object.entries(parsed && typeof parsed === "object" ? parsed : {}).filter(([, id]) => validIds.has(id)),
    );
  } catch {
    cache = {};
  }

  return cache;
}

export function setCardColor(key, colorId) {
  if (!key) {
    return;
  }

  const next = { ...load() };

  if (colorId && validIds.has(colorId)) {
    next[key] = colorId;
  } else {
    delete next[key];
  }

  cache = next;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the mark lasts until the app closes.
  }

  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The whole map; cheap to read, changes identity only when a mark changes.
export function useCardColors() {
  return useSyncExternalStore(subscribe, load, load);
}
