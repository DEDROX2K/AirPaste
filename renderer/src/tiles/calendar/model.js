import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const CALENDAR_CARD_TYPE = TILE_TYPES.CALENDAR;

export const CALENDAR_CARD_SIZE = Object.freeze({
  width: 920,
  height: 468,
});

export const CALENDAR_DEFAULT_TITLE = "Calendar";
export const CALENDAR_DEFAULT_MONTH = new Date().getMonth();
export const CALENDAR_DEFAULT_YEAR = new Date().getFullYear();
export const CALENDAR_DEFAULT_VIEW = "month";
export const CALENDAR_DEFAULT_THEME_ID = "mist";
export const CALENDAR_DEFAULT_HEIGHT_PRESET = "compact";

export function normalizeCalendarMonth(month) {
  return Number.isFinite(month)
    ? Math.max(0, Math.min(11, Math.round(month)))
    : CALENDAR_DEFAULT_MONTH;
}

export function normalizeCalendarYear(year) {
  return Number.isFinite(year)
    ? Math.max(1970, Math.min(9999, Math.round(year)))
    : CALENDAR_DEFAULT_YEAR;
}

export function normalizeCalendarView(view) {
  return view === "week" ? "week" : CALENDAR_DEFAULT_VIEW;
}

export function normalizeCalendarThemeId(themeId) {
  return typeof themeId === "string" && themeId.trim().length > 0
    ? themeId.trim()
    : CALENDAR_DEFAULT_THEME_ID;
}

export function normalizeCalendarHeightPreset(heightPreset) {
  return heightPreset === "tall" ? "tall" : CALENDAR_DEFAULT_HEIGHT_PRESET;
}

export function createCalendarCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CALENDAR_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CALENDAR_CARD_TYPE,
    title: firstString(options?.title, CALENDAR_DEFAULT_TITLE),
    month: normalizeCalendarMonth(options?.month),
    year: normalizeCalendarYear(options?.year),
    view: normalizeCalendarView(options?.view),
    themeId: normalizeCalendarThemeId(options?.themeId),
    heightPreset: normalizeCalendarHeightPreset(options?.heightPreset),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
