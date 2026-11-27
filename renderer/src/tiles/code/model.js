import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

// Code tile (type "code"): a black header with an editable title and a lime
// FILE TYPE badge, a blue frame, and a grey paper holding the code editor.
//
// Saved on the card:
//   code          string
//   title         string, default "Untitled"
//   language      "auto" (detected from the code at runtime) or a fixed key
//   codeFontSize  one of CODE_FONT_SIZES, default 14
//   codeHeight    null = the paper grows with the code (CODE_AUTO_HEIGHT),
//                 else the paper's height in px (CODE_USER_HEIGHT)
//   wrap / showLineNumbers are kept from the old tile but not shown.
export const CODE_CARD_TYPE = TILE_TYPES.CODE;

// The tile around the paper: header + gap above it, inset below it.
export const CODE_PAPER_TOP = 108.5;
export const CODE_PAPER_BOTTOM = 19;
export const CODE_AUTO_HEIGHT = Object.freeze({ min: 160, max: 440 });
export const CODE_USER_HEIGHT = Object.freeze({ min: 120, max: 1600 });

export const CODE_CARD_SIZE = Object.freeze({
  width: 532,
  height: Math.round(CODE_PAPER_TOP + 220 + CODE_PAPER_BOTTOM),
});

export const CODE_DEFAULT_TITLE = "Untitled";
export const CODE_LANGUAGE_AUTO = "auto";
export const CODE_DEFAULT_LANGUAGE = CODE_LANGUAGE_AUTO;
export const CODE_FONT_SIZES = Object.freeze([10, 11, 12, 13, 14, 16, 18, 20, 24]);
export const CODE_DEFAULT_FONT_SIZE = 14;

// Badge labels, in menu order.
export const CODE_LANGUAGES = Object.freeze({
  js: "JS",
  jsx: "JSX",
  ts: "TS",
  tsx: "TSX",
  py: "PYTHON",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  sql: "SQL",
  go: "GO",
  rust: "RUST",
  java: "JAVA",
  kotlin: "KOTLIN",
  swift: "SWIFT",
  c: "C",
  cpp: "C++",
  cs: "C#",
  php: "PHP",
  ruby: "RUBY",
  bash: "BASH",
  yaml: "YAML",
  md: "MARKDOWN",
  glsl: "GLSL",
  text: "TEXT",
});

// The old tile's language names.
const LEGACY_LANGUAGES = Object.freeze({
  plain: CODE_LANGUAGE_AUTO,
  javascript: "js",
  typescript: "ts",
  python: "py",
  markdown: "md",
  regex: "text",
});

export function normalizeCodeLanguage(language) {
  if (language === CODE_LANGUAGE_AUTO) return CODE_LANGUAGE_AUTO;
  if (typeof language !== "string") return CODE_LANGUAGE_AUTO;
  if (Object.hasOwn(CODE_LANGUAGES, language)) return language;
  if (Object.hasOwn(LEGACY_LANGUAGES, language)) return LEGACY_LANGUAGES[language];
  return CODE_LANGUAGE_AUTO;
}

export function normalizeCodeFontSize(size) {
  return CODE_FONT_SIZES.includes(size) ? size : CODE_DEFAULT_FONT_SIZE;
}

export function stepCodeFontSize(size, direction) {
  const index = CODE_FONT_SIZES.indexOf(normalizeCodeFontSize(size));
  return CODE_FONT_SIZES[Math.max(0, Math.min(CODE_FONT_SIZES.length - 1, index + direction))];
}

export function normalizeCodeHeight(height) {
  if (!Number.isFinite(height)) return null;
  return Math.round(Math.max(CODE_USER_HEIGHT.min, Math.min(CODE_USER_HEIGHT.max, height)));
}

// The whole tile's height for a paper height.
export function codeTileHeight(paperHeight) {
  return Math.round(CODE_PAPER_TOP + paperHeight + CODE_PAPER_BOTTOM);
}

export function createCodeCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CODE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CODE_CARD_TYPE,
    title: firstString(options?.title, CODE_DEFAULT_TITLE),
    language: normalizeCodeLanguage(options?.language ?? CODE_LANGUAGE_AUTO),
    code: typeof options?.code === "string" ? options.code : "",
    codeFontSize: normalizeCodeFontSize(options?.codeFontSize),
    codeHeight: normalizeCodeHeight(options?.codeHeight),
    wrap: false,
    showLineNumbers: false,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : CODE_CARD_SIZE.width,
    height: Number.isFinite(options?.height) ? options.height : CODE_CARD_SIZE.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
