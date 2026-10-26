// FigJam-style sticky note: a flat pastel square whose text, padding,
// corner radius and author label all scale with its size (k = size / 240).
// A sticky is a canvas-text card (variant "sticky"); this is its `sticky`
// field -- colour and whole-note formatting.

export const STICKY_BASE_SIZE = 240;
export const STICKY_MIN_SIZE = 96;
export const STICKY_MAX_SIZE = 640;
// Gap between a sticky and one added next to it with a "+" button.
export const STICKY_ADJACENT_GAP = 24;

export const STICKY_COLORS = Object.freeze([
  { id: "yellow", name: "Yellow", hex: "#FFE27A" },
  { id: "orange", name: "Orange", hex: "#FFC48C" },
  { id: "red", name: "Red", hex: "#FF9A8B" },
  { id: "pink", name: "Pink", hex: "#FFB5D6" },
  { id: "violet", name: "Violet", hex: "#D4BBFF" },
  { id: "blue", name: "Blue", hex: "#A9D5FF" },
  { id: "teal", name: "Teal", hex: "#92E4DD" },
  { id: "green", name: "Green", hex: "#A9E8A0" },
  { id: "gray", name: "Gray", hex: "#E3E3E3" },
  { id: "white", name: "White", hex: "#FFFFFF" },
]);

// Text size at the base 240px note; it scales with the note.
export const STICKY_FONT_SIZES = Object.freeze({ s: 16, m: 24, l: 34 });
export const STICKY_FONT_SIZE_LABELS = Object.freeze({ s: "Small", m: "Medium", l: "Large" });
export const STICKY_ALIGNS = Object.freeze(["left", "center", "right"]);

const DEFAULT_COLOR = "yellow";
const LAST_COLOR_STORAGE_KEY = "airpaste:sticky-last-color";

export function getStickyColorHex(colorId) {
  return (STICKY_COLORS.find((color) => color.id === colorId) ?? STICKY_COLORS[0]).hex;
}

export function clampStickySize(size) {
  return Math.round(Math.max(STICKY_MIN_SIZE, Math.min(STICKY_MAX_SIZE, Number.isFinite(size) ? size : STICKY_BASE_SIZE)));
}

export function normalizeStickyStyle(sticky) {
  const source = sticky && typeof sticky === "object" ? sticky : {};

  return {
    color: STICKY_COLORS.some((color) => color.id === source.color) ? source.color : DEFAULT_COLOR,
    fontSize: Object.hasOwn(STICKY_FONT_SIZES, source.fontSize) ? source.fontSize : "m",
    align: STICKY_ALIGNS.includes(source.align) ? source.align : "left",
    bold: source.bold === true,
    italic: source.italic === true,
    strike: source.strike === true,
    author: typeof source.author === "string" ? source.author : "",
  };
}

// New stickies use the colour the user last picked. A per-person preference,
// so browser storage is fine; it may be unavailable, hence the try/catch.
export function getLastStickyColor() {
  try {
    const stored = window.localStorage.getItem(LAST_COLOR_STORAGE_KEY);
    return STICKY_COLORS.some((color) => color.id === stored) ? stored : DEFAULT_COLOR;
  } catch {
    return DEFAULT_COLOR;
  }
}

export function rememberStickyColor(colorId) {
  try {
    window.localStorage.setItem(LAST_COLOR_STORAGE_KEY, colorId);
  } catch {
    // Not remembered; new stickies fall back to yellow.
  }
}

// Where a sticky added with a "+" button goes: next to this one, same size,
// in that direction.
export function getAdjacentStickyPosition(card, direction) {
  const step = (Number.isFinite(card?.width) ? card.width : STICKY_BASE_SIZE) + STICKY_ADJACENT_GAP;

  return {
    x: card.x + (direction === "e" ? step : direction === "w" ? -step : 0),
    y: card.y + (direction === "s" ? step : direction === "n" ? -step : 0),
  };
}

// Stickies made before this design had a separate title; it reads as the
// first line of the text.
export function getStickyDisplayText(card) {
  const title = typeof card?.title === "string" ? card.title.trim() : "";
  const text = typeof card?.text === "string" ? card.text : "";

  if (!title) {
    return text;
  }

  return text ? `${title}\n${text}` : title;
}
