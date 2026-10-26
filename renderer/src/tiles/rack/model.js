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
export const RACK_NAME_MAX_LENGTH = 32;

// The rack's plastic: a flat tint plus a deep shade of it (RGB triplets for
// the --pl / --pl-deep CSS variables). Picked once when a rack is created
// and stored as an index, never re-rolled.
export const RACK_PLASTICS = Object.freeze([
  { name: "Tangerine", tint: "252 156 37", deep: "190 90 0" },
  { name: "Lemon", tint: "251 210 45", deep: "170 130 0" },
  { name: "Lime", tint: "129 210 60", deep: "50 120 10" },
  { name: "Mint", tint: "49 199 156", deep: "0 110 85" },
  { name: "Sky", tint: "65 178 242", deep: "0 95 160" },
  { name: "Cobalt", tint: "76 111 247", deep: "20 40 170" },
  { name: "Violet", tint: "143 100 245", deep: "70 30 160" },
  { name: "Bubblegum", tint: "247 95 165", deep: "160 20 90" },
  { name: "Coral", tint: "246 88 73", deep: "150 28 20" },
  { name: "Smoke", tint: "95 101 115", deep: "30 34 44" },
]);

export function normalizeRackPlasticColor(value) {
  return Number.isInteger(value) && value >= 0 && value < RACK_PLASTICS.length ? value : 0;
}

// Any colour except the most recently created rack's, so two racks made in
// a row never match.
export function pickRackPlasticColor(cards, random = Math.random) {
  const latestRack = (Array.isArray(cards) ? cards : [])
    .filter((card) => card?.type === RACK_CARD_TYPE)
    .reduce((latest, card) => (
      !latest || String(card.createdAt ?? "") >= String(latest.createdAt ?? "") ? card : latest
    ), null);
  const excluded = latestRack ? normalizeRackPlasticColor(latestRack.plasticColor) : -1;
  const pool = RACK_PLASTICS.map((_, index) => index).filter((index) => index !== excluded);

  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

// Rack names are single-line plain text, at most 32 characters.
export function normalizeRackName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, RACK_NAME_MAX_LENGTH);
}

export function normalizeRackTileIds(tileIds) {
  return Array.isArray(tileIds)
    ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
    : [];
}

export function createRackCard(cards, viewport, preferredCenter = null, options = {}) {
  const title = firstString(normalizeRackName(options?.title), RACK_DEFAULT_TITLE);
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
    plasticColor: Number.isInteger(options?.plasticColor) ? options.plasticColor : pickRackPlasticColor(cards),
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
