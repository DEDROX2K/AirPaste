import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const CODE_CARD_TYPE = TILE_TYPES.CODE;

export const CODE_CARD_SIZE = Object.freeze({
  width: 520,
  height: 360,
});

export const CODE_DEFAULT_TITLE = "Untitled snippet";
export const CODE_DEFAULT_LANGUAGE = "plain";

export const CODE_SUPPORTED_LANGUAGES = Object.freeze([
  "plain",
  "bash",
  "javascript",
  "typescript",
  "json",
  "css",
  "html",
  "sql",
  "regex",
  "python",
  "markdown",
  "yaml",
]);

export function normalizeCodeLanguage(language) {
  return CODE_SUPPORTED_LANGUAGES.includes(language) ? language : CODE_DEFAULT_LANGUAGE;
}

export function createCodeCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CODE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CODE_CARD_TYPE,
    title: firstString(options?.title, CODE_DEFAULT_TITLE),
    language: normalizeCodeLanguage(options?.language),
    code: typeof options?.code === "string" ? options.code : "",
    wrap: options?.wrap !== false,
    showLineNumbers: options?.showLineNumbers !== false,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
