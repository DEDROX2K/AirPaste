// Unchanged cards must keep their object identity across store updates:
// memo(Card) relies on it, and without it one tile writing its measured size
// re-rendered (and re-measured) every tile on the canvas, the amplifier
// behind the occasional "Maximum update depth exceeded".
import { describe, expect, it } from "vitest";
import {
  createChecklistCard,
  createCounterCard,
  isSameJsonValue,
  normalizeWorkspace,
  reuseUnchangedCards,
  updateCard,
} from "../renderer/src/lib/workspace.js";

const viewport = { x: 0, y: 0, zoom: 1 };

function buildWorkspace() {
  const cards = [];
  cards.push(createChecklistCard(cards, viewport, { x: 0, y: 0 }));
  cards.push(createCounterCard(cards, viewport, { x: 600, y: 0 }));
  return normalizeWorkspace({ version: 1, viewport, cards });
}

describe("reuseUnchangedCards", () => {
  it("keeps every card object when re-normalizing changes nothing", () => {
    const previous = buildWorkspace();
    const next = reuseUnchangedCards(previous, normalizeWorkspace(previous));

    expect(next.cards).toBe(previous.cards);
    next.cards.forEach((card, index) => expect(card).toBe(previous.cards[index]));
    expect(next.activePage.cards).toBe(next.cards);
  });

  it("replaces only the card that changed", () => {
    const previous = buildWorkspace();
    const [checklist, counter] = previous.cards;
    const edited = normalizeWorkspace({
      ...previous,
      pages: previous.pages.map((page) => ({
        ...page,
        cards: updateCard(page.cards, counter.id, { x: counter.x + 40 }),
      })),
    });
    const next = reuseUnchangedCards(previous, edited);

    expect(next.cards[0]).toBe(checklist);
    expect(next.cards[1]).not.toBe(counter);
    expect(next.cards[1].x).toBe(counter.x + 40);
    expect(next.activePage.cards).toBe(next.cards);
  });
});

describe("updateCard", () => {
  it("leaves a card alone when the patch changes nothing", () => {
    const { cards } = buildWorkspace();
    const [checklist] = cards;

    expect(updateCard(cards, checklist.id, { height: checklist.height })[0]).toBe(checklist);
  });

  it("stamps updatedAt on a real change", () => {
    const { cards } = buildWorkspace();
    const [checklist] = cards;
    const [updated] = updateCard(cards, checklist.id, { height: checklist.height + 10 });

    expect(updated.height).toBe(checklist.height + 10);
    expect(updated).not.toBe(checklist);
  });
});

describe("isSameJsonValue", () => {
  it("compares nested plain data", () => {
    expect(isSameJsonValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(isSameJsonValue({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(isSameJsonValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(isSameJsonValue([1], { 0: 1 })).toBe(false);
  });
});
