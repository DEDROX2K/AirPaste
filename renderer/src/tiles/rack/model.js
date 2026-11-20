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

// Shelf materials: the shelf gradient (rack_edge.svg's five stops), the
// post / rail colours and the ink of the name pressed into the lip.
export const RACK_MATERIALS = Object.freeze({
  steel: {
    label: "Brushed steel",
    stops: ["#5F5F5F", "#656363", "#7F7F7F", "#A6A6A6", "#868686"],
    rail: ["#9a9a9a", "#5d5d5d"],
    ink: "rgb(0 0 0 / 0.52)",
    highlight: "rgb(255 255 255 / 0.28)",
  },
  oak: {
    label: "Oak",
    stops: ["#7A5530", "#8F6639", "#B0814A", "#D7AA6E", "#A87A45"],
    rail: ["#c49461", "#7a5530"],
    ink: "rgb(70 40 12 / 0.62)",
    highlight: "rgb(255 236 200 / 0.35)",
  },
  walnut: {
    label: "Walnut",
    stops: ["#2B1A10", "#382215", "#4E3220", "#7A5640", "#4A2F1E"],
    rail: ["#6e4c36", "#2b1a10"],
    ink: "rgb(255 236 214 / 0.58)",
    highlight: "rgb(0 0 0 / 0.35)",
  },
  acrylic: {
    label: "Acrylic",
    // Faintly blue-green glass, so it still reads on a light canvas.
    stops: ["rgb(150 185 195 / 0.32)", "rgb(160 195 205 / 0.36)", "rgb(175 205 214 / 0.46)", "rgb(240 250 252 / 0.9)", "rgb(150 185 195 / 0.5)"],
    rail: ["rgb(220 238 242 / 0.85)", "rgb(140 175 185 / 0.55)"],
    ink: "rgb(20 50 60 / 0.5)",
    highlight: "rgb(255 255 255 / 0.6)",
    edge: "rgb(110 150 162 / 0.55)",
  },
  concrete: {
    label: "Concrete",
    stops: ["#86837E", "#8F8C87", "#A29F99", "#C2BFB8", "#9C9993"],
    rail: ["#b3b0aa", "#76736e"],
    ink: "rgb(0 0 0 / 0.45)",
    highlight: "rgb(255 255 255 / 0.25)",
  },
});
export const RACK_MATERIAL_IDS = Object.freeze(Object.keys(RACK_MATERIALS));
export const RACK_DEFAULT_MATERIAL = "steel";

// How racked tiles are framed. Same geometry for all three; only the look
// changes.
export const RACK_FRAME_STYLES = Object.freeze({
  dark: { label: "Dark frame" },
  mat: { label: "Gallery mat" },
  polaroid: { label: "Polaroid" },
});
export const RACK_FRAME_STYLE_IDS = Object.freeze(Object.keys(RACK_FRAME_STYLES));
export const RACK_DEFAULT_FRAME_STYLE = "dark";

export function normalizeRackMaterial(value) {
  return RACK_MATERIAL_IDS.includes(value) ? value : RACK_DEFAULT_MATERIAL;
}

export function normalizeRackFrameStyle(value) {
  return RACK_FRAME_STYLE_IDS.includes(value) ? value : RACK_DEFAULT_FRAME_STYLE;
}

// Right-click "Rack style" opens the rack's own style panel (RackTile).
export const OPEN_RACK_STYLE_EVENT = "airpaste:open-rack-style";

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
