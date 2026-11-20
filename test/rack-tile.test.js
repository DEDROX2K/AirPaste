// The rack: tiles stand on a shelf in frames sized by their own shape (they
// aren't rendered, selected or moved on the canvas), the rack grows about
// its centre to fit them, and its plastic colour is picked once at creation.
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
  RACK_FRAME_TOP,
  RACK_MIN_WIDTH,
  SHELF_SIDE,
  SLOT_GAP,
  getRackInsertionIndex,
  getRackRowLayout,
  getRackSlotMetrics,
  rubberBand,
} from "@/tiles/rack/geometry.js";
import {
  findRackDropTarget,
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
  it("frames each tile 250px tall, keeping its shape within 0.56-1.9", () => {
    expect(getRackSlotMetrics({ width: 300, height: 300 })).toMatchObject({ imageWidth: 250, frameWidth: 262, frameHeight: 286 });
    // Too wide: capped at 1.9 and cropped (cover).
    const wide = getRackSlotMetrics({ width: 400, height: 100 });
    expect(wide.imageWidth).toBe(475);
    expect(wide.scale).toBe(2.5);
    // Too tall: floored at 0.56.
    expect(getRackSlotMetrics({ width: 100, height: 1000 }).imageWidth).toBe(140);
  });

  it("is never narrower than its minimum and grows to fit its frames plus the shelf caps", () => {
    expect(makeRack()).toMatchObject({ width: RACK_MIN_WIDTH, height: 360 });
    const rack = makeRack({ tileIds: ["a", "b"], slotWidths: [262, 300] });
    expect(rack.width).toBeCloseTo(262 + 300 + SLOT_GAP + (SHELF_SIDE * 2));
  });

  it("centres the frames as a group, SLOT_GAP apart", () => {
    const rack = makeRack({ tileIds: ["a", "b", "c"], slotWidths: [200, 200, 200] });
    const centre = rack.width / 2;
    [-230, 0, 230].forEach((offset, index) => expect(getRackCardCenterX(rack, index) - centre).toBeCloseTo(offset));
  });

  it("opens a gap at the insertion index and picks the slot by centre x", () => {
    const widths = [200, 200, 200];
    const { slots, gap } = getRackRowLayout(widths, { gapIndex: 1, gapWidth: 100 });
    expect(gap.left).toBe(slots[0].left + 200 + SLOT_GAP);
    expect(slots[1].left).toBe(gap.left + 100 + SLOT_GAP);
    expect(getRackInsertionIndex(widths, -1000)).toBe(0);
    expect(getRackInsertionIndex(widths, 1)).toBe(2);
    expect(getRackInsertionIndex(widths, 1000)).toBe(3);
  });

  it("lands a pulled-out tile full size, centred on its frame, top on the frame top", () => {
    const rack = makeRack({ x: 100, y: 50, tileIds: ["a", "b", "c"], slotWidths: [200, 200, 200] });
    const tile = makeTile("b");
    expect(getRackTileWorldPosition(rack, tile, 1)).toEqual({ x: 100 + (rack.width / 2) - 200, y: 50 + RACK_FRAME_TOP });
  });

  it("rubber-bands a pull toward the 110px range", () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(56)).toBeLessThan(56);
    expect(rubberBand(10000)).toBeLessThan(110);
    expect(rubberBand(-40)).toBe(-rubberBand(40));
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

  it("sizes frames from the tiles, grows about its centre and gives the tile back on removal", () => {
    let cards = [makeRack({ x: 0 }), makeTile("a"), makeTile("b", { width: 300, height: 300 })];
    const startCentre = cards[0].x + (cards[0].width / 2);
    cards = addTileToRack(cards, "a", "rack").cards;
    cards = addTileToRack(cards, "b", "rack", 0).cards;
    const rack = cards.find((card) => card.id === "rack");

    expect(rack.tileIds).toEqual(["b", "a"]);
    expect(rack.slotWidths).toEqual([262, 487]);
    expect(rack.x + (rack.width / 2)).toBeCloseTo(startCentre);

    const result = removeTileFromRack(cards, "b", "rack", { x: 5, y: 6 });
    expect(result.tile).toMatchObject({ id: "b", parentRackId: null, rackIndex: null, x: 5, y: 6 });
    expect(result.rackCard.tileIds).toEqual(["a"]);
    expect(result.rackCard.slotWidths).toEqual([487]);
    expect(result.rackCard.x + (result.rackCard.width / 2)).toBeCloseTo(startCentre);
  });

  it("targets a rack only while the pointer is in its zone, with the slot under the dragged tile", () => {
    const rack = makeRack({ x: 0, y: 0, tileIds: ["a", "b"], slotWidths: [262, 262] });
    const dragged = makeTile("d", { width: 300, height: 300 });
    const tiles = { rack, d: dragged };
    const find = (point, previousRackId = null) => findRackDropTarget({
      tiles,
      dragTileIds: ["d"],
      dragOrigins: { d: { x: 0, y: 0, width: 300, height: 300 } },
      rootTiles: [rack],
      worldPoint: point,
      previousRackId,
    });
    const centre = rack.width / 2;

    expect(find({ x: centre - 400, y: 200 })).toMatchObject({ rackId: "rack", slotIndex: 0, gapWidth: 262 });
    expect(find({ x: centre + 1, y: 200 })).toMatchObject({ slotIndex: 1 });
    expect(find({ x: centre + 400, y: 200 })).toMatchObject({ slotIndex: 2 });
    // Just outside the zone: nothing, unless already inside (hysteresis).
    const outside = { x: centre, y: 360 + 60 + 20 };
    expect(find(outside)).toBeNull();
    expect(find(outside, "rack")).toMatchObject({ rackId: "rack" });
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
