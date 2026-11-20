// Rack shelves (five a shelf, a full one passes tiles down) and per-rack
// style.
import { describe, expect, it } from "vitest";
import {
  addTileToRack,
  normalizeCard,
  removeTileFromRack,
} from "@/lib/workspace.js";
import {
  RACK_TIER_CAPACITY,
  RACK_TIER_PITCH,
  getRackDropSlot,
  getRackLayout,
  insertIntoRackTiers,
  normalizeRackTiers,
  removeFromRackTiers,
} from "@/tiles/rack/layout.js";
import { RACK_HEIGHT } from "@/tiles/rack/geometry.js";

function makeTile(id) {
  return normalizeCard({ id, type: "checklist", x: 0, y: 0, width: 300, height: 300 });
}

function rackWith(count, overrides = {}) {
  let cards = [normalizeCard({ id: "rack", type: "rack", x: 0, y: 0, tileIds: [], ...overrides })];
  for (let index = 0; index < count; index += 1) {
    cards.push(makeTile(`t${index}`));
    cards = addTileToRack(cards, `t${index}`, "rack").cards;
  }
  return cards;
}

describe("rack tiers", () => {
  it("chunks legacy racks into shelves of five", () => {
    expect(RACK_TIER_CAPACITY).toBe(5);
    expect(normalizeRackTiers(undefined, 12)).toEqual([5, 5, 2]);
    expect(normalizeRackTiers([2, 3], 5)).toEqual([2, 3]);
    expect(normalizeRackTiers([6], 6)).toEqual([5, 1]);
  });

  it("a full shelf refuses: the tile goes to the next shelf down, made if needed", () => {
    expect(insertIntoRackTiers([5], { tier: 0, index: 2 })).toMatchObject({ tiers: [5, 1], tier: 1, flatIndex: 5, refused: true });
    expect(insertIntoRackTiers([5, 5, 1], { tier: 0, index: 4 })).toMatchObject({ tiers: [5, 5, 2], tier: 2, refused: true });
    expect(insertIntoRackTiers([3, 2], { tier: 1, index: 0 })).toMatchObject({ tiers: [3, 3], flatIndex: 3, refused: false });
  });

  it("appending fills the last shelf, then opens a new one", () => {
    const cards = rackWith(7);
    const rack = cards.find((card) => card.id === "rack");
    expect(rack.tiers).toEqual([5, 2]);
    expect(rack.height).toBe((2 * RACK_HEIGHT) + (RACK_TIER_PITCH - RACK_HEIGHT));
  });

  it("taking a tile off empties and removes its shelf", () => {
    let cards = rackWith(6);
    cards = removeTileFromRack(cards, "t5", "rack", { x: 0, y: 0 }).cards;
    expect(cards.find((card) => card.id === "rack").tiers).toEqual([5]);
    expect(removeFromRackTiers([5, 1], 2)).toEqual([4, 1]);
  });

  it("dropping on a full shelf targets the next one and reports the refusal", () => {
    const cards = rackWith(5);
    const rack = cards.find((card) => card.id === "rack");
    const spec = { slotWidths: rack.slotWidths, tiers: rack.tiers };
    expect(getRackDropSlot(spec, { x: 0, y: 200 })).toMatchObject({ tier: 1, index: 0, refusedTier: 0 });

    const two = { slotWidths: [262, 262, 262, 262, 262, 262], tiers: [5, 1] };
    expect(getRackDropSlot(two, { x: 1000, y: RACK_TIER_PITCH + 200 })).toMatchObject({ tier: 1, index: 1, refusedTier: null });
  });

  it("draws posts only when there is more than one shelf", () => {
    expect(getRackLayout({ slotWidths: [262], tiers: [1] }).supports.map((s) => s.kind)).toEqual(["shelf"]);
    expect(getRackLayout({ slotWidths: Array(6).fill(262), tiers: [5, 1] }).supports.map((s) => s.kind))
      .toEqual(["shelf", "shelf", "post", "post"]);
  });
});

describe("rack style", () => {
  it("normalizes style fields", () => {
    const rack = normalizeCard({ type: "rack", material: "oak", frameStyle: "polaroid", orientation: "vertical", collapsed: true });
    expect(rack).toMatchObject({ material: "oak", frameStyle: "polaroid" });
    // The removed wall-rail / spine modes are dropped from old racks.
    expect(rack).not.toHaveProperty("orientation");
    expect(rack).not.toHaveProperty("collapsed");
    expect(normalizeCard({ type: "rack", material: "gold" }).material).toBe("steel");
  });
});
