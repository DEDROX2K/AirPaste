// The rack: tiles stand inside it as cards (they aren't rendered,
// selected or moved on the canvas), it widens one card pitch per tile past
// three, and its plastic colour is picked once at creation.
import { describe, expect, it } from "vitest";
import {
  addTileToRack,
  getRackCardCenterX,
  getRackTileWorldPosition,
  normalizeCard,
  removeTileFromRack,
} from "@/lib/workspace.js";
import {
  createRackCard,
  normalizeRackName,
  pickRackPlasticColor,
} from "@/tiles/rack/model.js";
import {
  getRenderableTileEntries,
  getSelectedTileIdsInRect,
} from "@/systems/layout/tileLayout.js";

function makeTile(id, overrides = {}) {
  return normalizeCard({ id, type: "checklist", x: 1000, y: 1000, width: 400, height: 200, ...overrides });
}

function makeRack(overrides = {}) {
  return normalizeCard({ id: "rack", type: "rack", x: 0, y: 0, tileIds: [], plasticColor: 4, ...overrides });
}

describe("rack geometry", () => {
  it("is 640 x 360 for up to three tiles and widens 206px per extra tile", () => {
    expect(makeRack()).toMatchObject({ width: 640, height: 360 });
    expect(makeRack({ tileIds: ["a", "b", "c"] }).width).toBe(640);
    expect(makeRack({ tileIds: ["a", "b", "c", "d"] }).width).toBe(846);
    expect(makeRack({ tileIds: ["a", "b", "c", "d", "e"] }).width).toBe(1052);
  });

  it("centres the cards as a group, 206px apart", () => {
    const rack = makeRack({ tileIds: ["a", "b", "c"] });
    expect([0, 1, 2].map((index) => getRackCardCenterX(rack, index))).toEqual([114, 320, 526]);

    const single = makeRack({ tileIds: ["a"] });
    expect(getRackCardCenterX(single, 0)).toBe(320);
  });

  it("lands a pulled-out tile full size, centred on its card", () => {
    const rack = makeRack({ x: 100, y: 50, tileIds: ["a", "b", "c"] });
    const tile = makeTile("b");
    expect(getRackTileWorldPosition(rack, tile, 1)).toEqual({ x: 100 + 320 - 200, y: 50 + 26 });
  });
});

describe("rack contents", () => {
  it("keeps racked tiles off the canvas: not rendered as canvas entries and not marquee-selectable", () => {
    const tile = makeTile("a");
    const loose = makeTile("loose", { x: 10, y: 400 });
    const { cards } = addTileToRack([makeRack(), tile, loose], "a", "rack");
    const entries = getRenderableTileEntries(cards);

    expect(entries.find((entry) => entry.tile.id === "a")).toMatchObject({ containerType: "rack", rackId: "rack", width: 400, height: 200 });
    expect(entries.filter((entry) => entry.containerType === "canvas").map((entry) => entry.tile.id)).toEqual(["rack", "loose"]);
    expect(getSelectedTileIdsInRect(cards, { left: -1000, top: -1000, right: 5000, bottom: 5000 })).toEqual(["rack", "loose"]);
  });

  it("grows when a fourth tile goes in and gives the tile back on removal", () => {
    let cards = [makeRack(), makeTile("a"), makeTile("b"), makeTile("c"), makeTile("d")];
    ["a", "b", "c", "d"].forEach((tileId) => {
      cards = addTileToRack(cards, tileId, "rack").cards;
    });
    const rack = cards.find((card) => card.id === "rack");
    expect(rack.tileIds).toEqual(["a", "b", "c", "d"]);
    expect(rack.width).toBe(846);

    const result = removeTileFromRack(cards, "b", "rack", { x: 5, y: 6 });
    expect(result.tile).toMatchObject({ id: "b", parentRackId: null, rackIndex: null, x: 5, y: 6 });
    expect(result.rackCard.tileIds).toEqual(["a", "c", "d"]);
  });

});

describe("rack plastic and name", () => {
  it("stores the plastic colour, defaulting legacy racks to Tangerine", () => {
    expect(makeRack({ plasticColor: 7 }).plasticColor).toBe(7);
    expect(normalizeCard({ type: "rack" }).plasticColor).toBe(0);
    expect(normalizeCard({ type: "rack", plasticColor: 12 }).plasticColor).toBe(0);
  });

  it("never picks the most recently created rack's colour", () => {
    const cards = [
      makeRack({ id: "old", plasticColor: 2, createdAt: "2026-01-01T00:00:00Z" }),
      makeRack({ id: "new", plasticColor: 5, createdAt: "2026-06-01T00:00:00Z" }),
    ];

    for (let step = 0; step < 10; step += 1) {
      expect(pickRackPlasticColor(cards, () => step / 10)).not.toBe(5);
    }
    expect(pickRackPlasticColor([], () => 0)).toBe(0);
    expect(createRackCard(cards, { x: 0, y: 0, zoom: 1 }).plasticColor).not.toBe(5);
  });

  it("keeps rack names to one plain line of at most 32 characters", () => {
    expect(normalizeRackName("  Planning \n board  ")).toBe("Planning board");
    expect(normalizeRackName("x".repeat(40))).toHaveLength(32);
    expect(normalizeRackName("   ")).toBe("");
  });
});
