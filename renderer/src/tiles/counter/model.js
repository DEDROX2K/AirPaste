import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const COUNTER_CARD_TYPE = TILE_TYPES.COUNTER;

export const COUNTER_CARD_SIZE = Object.freeze({
  width: 360,
  height: 300,
});

export const COUNTER_DEFAULT_TITLE = "Counter";
export const COUNTER_DEFAULT_VALUE = 0;
export const COUNTER_DEFAULT_STEP = 1;
export const COUNTER_DEFAULT_UNIT = "";

export function normalizeCounterValue(value) {
  return Number.isFinite(value) ? Number(value) : COUNTER_DEFAULT_VALUE;
}

export function normalizeCounterStep(step) {
  return Number.isFinite(step) && Number(step) > 0 ? Number(step) : COUNTER_DEFAULT_STEP;
}

export function normalizeCounterUnit(unit) {
  return typeof unit === "string" ? unit : COUNTER_DEFAULT_UNIT;
}

export function createCounterCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, COUNTER_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: COUNTER_CARD_TYPE,
    title: firstString(options?.title, COUNTER_DEFAULT_TITLE),
    value: normalizeCounterValue(options?.value),
    step: normalizeCounterStep(options?.step),
    unit: normalizeCounterUnit(options?.unit),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
