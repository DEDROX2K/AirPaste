import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const PROGRESS_CARD_TYPE = TILE_TYPES.PROGRESS;

export const PROGRESS_CARD_SIZE = Object.freeze({
  width: 400,
  height: 280,
});

export const PROGRESS_DEFAULT_TITLE = "Feature progress";
export const PROGRESS_DEFAULT_MODE = "manual";
export const PROGRESS_DEFAULT_VALUE = 0;
export const PROGRESS_DEFAULT_MAX = 100;

export function normalizeProgressMode(mode) {
  return mode === "linked" ? "linked" : PROGRESS_DEFAULT_MODE;
}

export function normalizeProgressValue(value) {
  return Number.isFinite(value) ? Number(value) : PROGRESS_DEFAULT_VALUE;
}

export function normalizeProgressMax(max) {
  return Number.isFinite(max) && Number(max) > 0 ? Number(max) : PROGRESS_DEFAULT_MAX;
}

export function normalizeProgressLinkedTileId(linkedTileId) {
  return typeof linkedTileId === "string" && linkedTileId.trim().length > 0
    ? linkedTileId.trim()
    : null;
}

export function createProgressCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, PROGRESS_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: PROGRESS_CARD_TYPE,
    title: firstString(options?.title, PROGRESS_DEFAULT_TITLE),
    mode: normalizeProgressMode(options?.mode),
    value: normalizeProgressValue(options?.value),
    max: normalizeProgressMax(options?.max),
    linkedTileId: normalizeProgressLinkedTileId(options?.linkedTileId),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
