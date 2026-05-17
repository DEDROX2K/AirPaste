export const CANVAS_TEXT_SOURCE_LOCAL = "local";
export const CANVAS_TEXT_SOURCE_FILE = "file";
export const CANVAS_TEXT_VARIANT_DEFAULT = "default";
export const CANVAS_TEXT_VARIANT_STICKY = "sticky";
export const CANVAS_TEXT_FORMAT_MARKDOWN = "markdown";
export const CANVAS_TEXT_TITLE_MODE_DERIVED = "derived";
export const CANVAS_TEXT_TITLE_MODE_CUSTOM = "custom";

export const CANVAS_TEXT_DEFAULT_SIZE = Object.freeze({
  width: 420,
  height: 220,
});

export const CANVAS_TEXT_STICKY_SIZE = Object.freeze({
  width: 240,
  height: 180,
});

export const CANVAS_TEXT_MIN_WIDTH = 180;
export const CANVAS_TEXT_MIN_HEIGHT = 80;

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

export function normalizeCanvasTextContent(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeCanvasTextSource(value) {
  return value === CANVAS_TEXT_SOURCE_FILE ? CANVAS_TEXT_SOURCE_FILE : CANVAS_TEXT_SOURCE_LOCAL;
}

export function normalizeCanvasTextVariant(value) {
  return value === CANVAS_TEXT_VARIANT_STICKY ? CANVAS_TEXT_VARIANT_STICKY : CANVAS_TEXT_VARIANT_DEFAULT;
}

export function normalizeCanvasTextTitleMode(value) {
  return value === CANVAS_TEXT_TITLE_MODE_CUSTOM ? CANVAS_TEXT_TITLE_MODE_CUSTOM : CANVAS_TEXT_TITLE_MODE_DERIVED;
}

export function stripMarkdownFormatting(line) {
  return String(line ?? "")
    .replace(/^\s{0,3}(#{1,6})\s+/, "")
    .replace(/^\s*[-*+]\s+\[(?: |x|X)\]\s+/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .trim();
}

export function extractMarkdownDisplayLines(markdown) {
  return normalizeCanvasTextContent(markdown)
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map(stripMarkdownFormatting)
    .filter(Boolean);
}

export function deriveCanvasTextTitle(card) {
  const titleMode = normalizeCanvasTextTitleMode(card?.titleMode);
  if (titleMode === CANVAS_TEXT_TITLE_MODE_CUSTOM) {
    return firstString(card?.title, card?.file?.fileName, "Untitled note");
  }

  if (normalizeCanvasTextSource(card?.source) === CANVAS_TEXT_SOURCE_FILE) {
    return firstString(card?.title, card?.file?.fileName, "Untitled note");
  }

  return firstString(
    ...extractMarkdownDisplayLines(card?.text).slice(0, 1),
    card?.title,
    "Untitled note",
  );
}

export function deriveCanvasTextSummary(markdown, maxLines = 4) {
  return extractMarkdownDisplayLines(markdown)
    .slice(0, Math.max(1, maxLines))
    .join("\n");
}

export function getCanvasTextLineCount(markdown) {
  return Math.max(1, normalizeCanvasTextContent(markdown).replaceAll("\r\n", "\n").split("\n").length);
}

export function isCanvasTextCard(card) {
  return card?.type === "canvas-text";
}
