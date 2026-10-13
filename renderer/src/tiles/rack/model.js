import {
  firstString,
  getNextCardPosition,
  nowIso,
  normalizeCard,
  RACK_HEIGHT,
  RACK_LEFT_CAP_WIDTH,
  RACK_MIN_SLOTS,
  RACK_RIGHT_CAP_WIDTH,
  RACK_SLOT_WIDTH,
} from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const RACK_CARD_TYPE = TILE_TYPES.RACK;

export const RACK_CARD_SIZE = Object.freeze({
  width: RACK_LEFT_CAP_WIDTH + RACK_RIGHT_CAP_WIDTH + (RACK_SLOT_WIDTH * RACK_MIN_SLOTS),
  height: RACK_HEIGHT,
});

export const RACK_DEFAULT_TITLE = "Rack";
export const RACK_DEFAULT_DESCRIPTION = "Mounted display rack";

export function normalizeRackTileIds(tileIds) {
  return Array.isArray(tileIds)
    ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
    : [];
}

export function createRackCard(cards, viewport, preferredCenter = null, options = {}) {
  const title = firstString(options?.title, RACK_DEFAULT_TITLE);
  const description = firstString(options?.description, RACK_DEFAULT_DESCRIPTION);
  const tileIds = normalizeRackTileIds(options?.tileIds);
  const minSlots = Math.max(
    RACK_MIN_SLOTS,
    Number.isFinite(options?.minSlots) ? options.minSlots : RACK_MIN_SLOTS,
  );
  const position = getNextCardPosition(cards, viewport, RACK_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: RACK_CARD_TYPE,
    title,
    description,
    tileIds,
    minSlots,
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
