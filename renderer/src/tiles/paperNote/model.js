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
