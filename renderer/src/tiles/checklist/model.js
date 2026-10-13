import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const CHECKLIST_CARD_TYPE = TILE_TYPES.CHECKLIST;

export const CHECKLIST_CARD_SIZE = Object.freeze({
  width: 380,
  height: 360,
});

export const CHECKLIST_DEFAULT_TITLE = "Checklist";

export const CHECKLIST_DEFAULT_ITEMS = Object.freeze([
  Object.freeze({
    id: "item-1",
    text: "",
    checked: false,
  }),
]);

export function normalizeChecklistItems(items) {
  const normalizedItems = Array.isArray(items)
    ? items
      .map((item, index) => {
        const text = typeof item?.text === "string" ? item.text : "";
        const checked = item?.checked === true;
        const itemId = typeof item?.id === "string" && item.id.trim().length > 0
          ? item.id.trim()
          : `item-${index + 1}`;

        return {
          id: itemId,
          text,
          checked,
        };
      })
      .filter((item) => item.id.length > 0)
    : [];

  return normalizedItems.length > 0
    ? normalizedItems
    : CHECKLIST_DEFAULT_ITEMS.map((item) => ({ ...item }));
}

export function createChecklistCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, CHECKLIST_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: CHECKLIST_CARD_TYPE,
    title: firstString(options?.title, CHECKLIST_DEFAULT_TITLE),
    items: normalizeChecklistItems(options?.items),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
