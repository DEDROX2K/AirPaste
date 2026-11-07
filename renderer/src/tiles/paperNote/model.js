import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const PAPER_NOTE_CARD_TYPE = TILE_TYPES.PAPER_NOTE;

export const PAPER_NOTE_CARD_SIZE = Object.freeze({
  width: 300,
  height: 400,
});

export const PAPER_NOTE_DEFAULT_TITLE = "";
export const PAPER_NOTE_DEFAULT_SUBTITLE = "";
export const PAPER_NOTE_DEFAULT_TEXT = "";

export function normalizePaperNoteTitle(value) {
  return typeof value === "string" ? value : PAPER_NOTE_DEFAULT_TITLE;
}

export function normalizePaperNoteSubtitle(value) {
  return typeof value === "string" ? value : PAPER_NOTE_DEFAULT_SUBTITLE;
}

export function normalizePaperNoteText(value) {
  return typeof value === "string" ? value : PAPER_NOTE_DEFAULT_TEXT;
}

export function createPaperNoteCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, PAPER_NOTE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: PAPER_NOTE_CARD_TYPE,
    title: firstString(options?.title),
    subtitle: firstString(options?.subtitle),
    text: typeof options?.text === "string" ? options.text : "",
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// The short caption over a paper note tile: "Today", "Yesterday", "Nov 4",
// or "Nov 4, 2025" outside the current year.
export function formatPaperNoteShortDate(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (dayDelta === 0) {
    return "Today";
  }
  if (dayDelta === 1) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

// The full timestamp centred over the fullscreen editor, Notes-style.
export function formatPaperNoteLongDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}
