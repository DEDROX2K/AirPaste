import {
  firstString,
  getNextCardPosition,
  nowIso,
  normalizeCard,
  RACK_MIN_SLOTS,
} from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const RACK_CARD_TYPE = TILE_TYPES.RACK;

// RACK_CARD_SIZE itself (not re-exported here) is defined and exported
// directly from lib/workspace.js, not here -- see the comment there for why
// (it's computed from geometry constants at module top level, which can't
// safely happen on this side of the circular import).

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
