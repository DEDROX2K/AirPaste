import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const CHECKLIST_CARD_TYPE = TILE_TYPES.CHECKLIST;

// Height is only the starting value: the tile measures its rendered content
// and writes the real height back, so it grows with every task added.
export const CHECKLIST_CARD_SIZE = Object.freeze({
  width: 400,
  height: 198,
});

export const CHECKLIST_DEFAULT_TITLE = "Things to do today";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

// "Thu, 2 May 2024"
export function formatChecklistDate(value) {
  const date = toValidDate(value);
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// "15:30"
export function formatChecklistTime(value) {
  const date = toValidDate(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function makeChecklistItem(item = {}) {
  return {
    id: typeof item?.id === "string" && item.id.trim().length > 0
      ? item.id.trim()
      : crypto.randomUUID(),
    text: typeof item?.text === "string" ? item.text : "",
    checked: item?.checked === true,
  };
}

// A checklist ships empty, so an empty list stays empty.
export function normalizeChecklistItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => makeChecklistItem({
    ...item,
    id: typeof item?.id === "string" && item.id.trim().length > 0 ? item.id : `item-${index + 1}`,
  }));
}

// The date/time pill are free text the user can edit, so they're stored as
// labels. Tiles saved before the labels existed fall back to their creation
// moment rather than "now", so they don't change every time they load.
export function normalizeChecklistDateLabel(value, fallbackTimestamp) {
  return typeof value === "string" ? value : formatChecklistDate(fallbackTimestamp);
}

export function normalizeChecklistTimeLabel(value, fallbackTimestamp) {
  return typeof value === "string" ? value : formatChecklistTime(fallbackTimestamp);
}

export function createChecklistCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CHECKLIST_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CHECKLIST_CARD_TYPE,
    title: firstString(options?.title, CHECKLIST_DEFAULT_TITLE),
    dateLabel: formatChecklistDate(timestamp),
    timeLabel: formatChecklistTime(timestamp),
    items: normalizeChecklistItems(options?.items),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
