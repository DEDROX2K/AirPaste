import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const DEADLINE_CARD_TYPE = TILE_TYPES.DEADLINE;

export const DEADLINE_CARD_SIZE = Object.freeze({
  width: 480,
  height: 360,
});

export const DEADLINE_DEFAULT_TITLE = "Launch countdown";
export const DEADLINE_DEFAULT_TIMEZONE = "local";

export function normalizeDeadlineTargetAt(targetAt) {
  return typeof targetAt === "string" ? targetAt : "";
}

// Both branches of this ternary currently return the same constant, so no
// timezone value is ever actually respected -- see test/normalize-card.test.js
// and the spawned follow-up task for whether the Deadline tile's UI exposes a
// timezone picker that this silently ignores. Preserved as-is here; not this
// extraction's job to change behavior.
export function normalizeDeadlineTimezone(timezone) {
  return timezone === DEADLINE_DEFAULT_TIMEZONE ? DEADLINE_DEFAULT_TIMEZONE : DEADLINE_DEFAULT_TIMEZONE;
}

export function createDeadlineCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, DEADLINE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: DEADLINE_CARD_TYPE,
    title: firstString(options?.title, DEADLINE_DEFAULT_TITLE),
    targetAt: normalizeDeadlineTargetAt(options?.targetAt),
    timezone: normalizeDeadlineTimezone(options?.timezone),
    showSeconds: options?.showSeconds === true,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
