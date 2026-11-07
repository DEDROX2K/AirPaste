// Magnetic tile snapping (systems/snapping/tileMagnetSnapping.js): dragged
// tiles pull to their neighbours' edges or sit beside them with an even gap.
import { describe, expect, it } from "vitest";
import {
  TILE_SNAP_GAP,
  TILE_SNAP_THRESHOLD_PX,
  getSnapRectsBounds,
  resolveTileMagnetSnap,
  toSnapRect,
} from "@/systems/snapping/tileMagnetSnapping.js";

const neighbour = toSnapRect({ x: 0, y: 0, width: 200, height: 200 });
const dragged = toSnapRect({ x: 600, y: 600, width: 200, height: 200 });

function snap(rawDelta, zoom = 1, neighbours = [neighbour]) {
  return resolveTileMagnetSnap({ bounds: dragged, neighbours, rawDelta, zoom });
}

describe("tile magnet snapping", () => {
  it("places a tile beside its neighbour with the standard gap", () => {
    // Dropped 5px further right than the gap and 3px low: snaps to the gap
    // and aligns the tops.
    const result = snap({ x: -600 + 200 + TILE_SNAP_GAP + 5, y: -600 + 3 });

    expect(result.delta).toEqual({ x: -600 + 200 + TILE_SNAP_GAP, y: -600 });
    expect(result.guides.map((guide) => guide.kind).sort()).toEqual(["align", "gap"]);
  });

  it("stacks a tile under its neighbour with the gap", () => {
    const result = snap({ x: -600 - 4, y: -600 + 200 + TILE_SNAP_GAP - 6 });

    expect(result.delta).toEqual({ x: -600, y: -600 + 200 + TILE_SNAP_GAP });
  });

  it("leaves the drag alone outside the pull distance", () => {
    const rawDelta = { x: -600 + 200 + TILE_SNAP_GAP + TILE_SNAP_THRESHOLD_PX + 20, y: -600 + 50 };

    expect(snap(rawDelta)).toEqual({ delta: rawDelta, guides: [] });
  });

  it("measures the pull distance in screen pixels", () => {
    // 12 world px is outside the 8px pull at 100% but inside it at 50%.
    const rawDelta = { x: -600 + 200 + TILE_SNAP_GAP + 12, y: -600 };

    expect(snap(rawDelta, 1).delta.x).toBe(rawDelta.x);
    expect(snap(rawDelta, 0.5).delta.x).toBe(-600 + 200 + TILE_SNAP_GAP);
  });

  it("ignores tiles far away", () => {
    const farAway = toSnapRect({ x: 5000, y: 5000, width: 200, height: 200 });
    const rawDelta = { x: 3, y: 3 };

    expect(snap(rawDelta, 1, [farAway])).toEqual({ delta: rawDelta, guides: [] });
  });

  it("snaps a multi-tile selection by its bounds", () => {
    const bounds = getSnapRectsBounds([
      toSnapRect({ x: 600, y: 600, width: 100, height: 100 }),
      toSnapRect({ x: 750, y: 650, width: 100, height: 100 }),
    ]);

    expect(bounds).toEqual({ left: 600, top: 600, right: 850, bottom: 750 });
  });
});
