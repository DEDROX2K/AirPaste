export const TEXT_BOX_DEFAULT_TEXT = "Double click to edit";
export const TEXT_BOX_DEFAULT_STYLE = Object.freeze({
  preset: "simple",
  fontSize: 48,
  fontWeight: 500,
  italic: false,
  underline: false,
  strike: false,
  align: "left",
  color: "#1f1f1f",
  lineHeight: 1.15,
  letterSpacing: 0,
});

export const TEXT_BOX_PRESET_OPTIONS = Object.freeze([
  {
    id: "simple",
    label: "Simple",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
  },
  {
    id: "bookish",
    label: "Bookish",
    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  },
  {
    id: "technical",
    label: "Technical",
    fontFamily: 'ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas, monospace',
  },
  {
    id: "scribbled",
    label: "Scribbled",
    fontFamily: '"Bradley Hand", "Segoe Print", "Comic Sans MS", "Snell Roundhand", cursive',
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
    fontSize: Math.round(clampNumber(safeStyle.fontSize, 8, 240, TEXT_BOX_DEFAULT_STYLE.fontSize)),
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
