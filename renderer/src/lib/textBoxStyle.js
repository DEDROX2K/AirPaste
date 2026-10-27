export const TEXT_BOX_DEFAULT_TEXT = "Add text";
export const TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT = TEXT_BOX_DEFAULT_TEXT;
// Quick text: plain text straight on the canvas, Figma text-tool style.
export const TEXT_BOX_DEFAULT_STYLE = Object.freeze({
  preset: "simple",
  fontSize: 24,
  fontWeight: 400,
  italic: false,
  underline: false,
  strike: false,
  align: "left",
  color: "#1E1E1E",
  lineHeight: 1.25,
  letterSpacing: 0,
});
export const TEXT_BOX_MIN_FONT_SIZE = 8;
export const TEXT_BOX_MAX_FONT_SIZE = 600;

export const TEXT_BOX_COLORS = Object.freeze([
  { id: "#1E1E1E", name: "Black", hex: "#1E1E1E" },
  { id: "#8A8A8A", name: "Gray", hex: "#8A8A8A" },
  { id: "#F24822", name: "Red", hex: "#F24822" },
  { id: "#FFA629", name: "Orange", hex: "#FFA629" },
  { id: "#14AE5C", name: "Green", hex: "#14AE5C" },
  { id: "#1E6FFF", name: "Blue", hex: "#1E6FFF" },
  { id: "#9747FF", name: "Violet", hex: "#9747FF" },
  { id: "#FF4D94", name: "Pink", hex: "#FF4D94" },
]);

export const TEXT_BOX_SIZE_OPTIONS = Object.freeze([
  { id: 16, label: "Small", hint: "16" },
  { id: 24, label: "Medium", hint: "24" },
  { id: 40, label: "Large", hint: "40" },
  { id: 64, label: "Huge", hint: "64" },
]);

const LAST_STYLE_STORAGE_KEY = "airpaste:quick-text-last-style";

export const TEXT_BOX_PRESET_OPTIONS = Object.freeze([
  {
    id: "simple",
    label: "Simple",
    fontFamily: 'var(--ap-font-body)',
  },
  {
    id: "bookish",
    label: "Bookish",
    fontFamily: 'var(--ap-font-display)',
  },
  {
    id: "technical",
    label: "Technical",
    fontFamily: 'var(--ap-font-body)',
  },
  {
    id: "scribbled",
    label: "Scribbled",
    fontFamily: 'var(--ap-font-body)',
  },
]);

const TEXT_BOX_ALIGN_OPTIONS = new Set(["left", "center", "right"]);
const TEXT_BOX_PRESET_IDS = new Set(TEXT_BOX_PRESET_OPTIONS.map((preset) => preset.id));
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function clampNumber(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeTextBoxText(text) {
  return typeof text === "string" && text.length > 0 ? text : TEXT_BOX_DEFAULT_TEXT;
}

export function normalizeTextBoxStyle(style) {
  const safeStyle = style && typeof style === "object" ? style : {};
  const preset = TEXT_BOX_PRESET_IDS.has(safeStyle.preset) ? safeStyle.preset : TEXT_BOX_DEFAULT_STYLE.preset;
  const color = typeof safeStyle.color === "string" && HEX_COLOR_PATTERN.test(safeStyle.color.trim())
    ? safeStyle.color.trim()
    : TEXT_BOX_DEFAULT_STYLE.color;

  return {
    preset,
    fontSize: Number(clampNumber(safeStyle.fontSize, TEXT_BOX_MIN_FONT_SIZE, TEXT_BOX_MAX_FONT_SIZE, TEXT_BOX_DEFAULT_STYLE.fontSize).toFixed(2)),
    fontWeight: Math.round(clampNumber(safeStyle.fontWeight, 100, 900, TEXT_BOX_DEFAULT_STYLE.fontWeight) / 100) * 100,
    italic: safeStyle.italic === true,
    underline: safeStyle.underline === true,
    strike: safeStyle.strike === true,
    align: TEXT_BOX_ALIGN_OPTIONS.has(safeStyle.align) ? safeStyle.align : TEXT_BOX_DEFAULT_STYLE.align,
    color,
    lineHeight: Number(clampNumber(safeStyle.lineHeight, 0.9, 2.4, TEXT_BOX_DEFAULT_STYLE.lineHeight).toFixed(2)),
    letterSpacing: Number(clampNumber(safeStyle.letterSpacing, -4, 24, TEXT_BOX_DEFAULT_STYLE.letterSpacing).toFixed(2)),
  };
}

export function getTextBoxFontFamily(preset) {
  return TEXT_BOX_PRESET_OPTIONS.find((entry) => entry.id === preset)?.fontFamily
    ?? TEXT_BOX_PRESET_OPTIONS[0].fontFamily;
}

export function getTextBoxLineCount(text) {
  return String(text ?? "").split(/\r?\n/).length;
}

// New quick text starts with the style used last (size, weight, italic,
// alignment, colour). A per-person preference, so browser storage is fine;
// it may be unavailable, hence the try/catch.
export function getLastTextBoxStyle() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(LAST_STYLE_STORAGE_KEY) ?? "null");
    return normalizeTextBoxStyle(stored);
  } catch {
    return normalizeTextBoxStyle(null);
  }
}

export function rememberTextBoxStyle(style) {
  try {
    const { fontSize, fontWeight, italic, align, color } = normalizeTextBoxStyle(style);
    window.localStorage.setItem(LAST_STYLE_STORAGE_KEY, JSON.stringify({ fontSize, fontWeight, italic, align, color }));
  } catch {
    // Not remembered; new text falls back to the defaults.
  }
}
