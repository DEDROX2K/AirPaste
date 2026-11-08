// Magnetic tile snapping (systems/snapping/tileMagnetSnapping.js): dragged
// tiles pull to their neighbours' edges or sit beside them with an even gap,
// gliding in rather than jumping; it's an off-by-default canvas setting.
import { describe, expect, it } from "vitest";
import {
  TILE_SNAP_GAP,
  TILE_SNAP_THRESHOLD_PX,
  easeSnapOffset,
  getSnapRectsBounds,
  resolveTileMagnetSnap,
  toSnapRect,
} from "@/systems/snapping/tileMagnetSnapping.js";
import {
  buildCanvasSnapUiStatePatch,
  normalizeCanvasSnapSettings,
} from "@/systems/snapping/canvasSnapSettings.js";

const neighbour = toSnapRect({ x: 0, y: 0, width: 200, height: 200 });
const dragged = toSnapRect({ x: 600, y: 600, width: 200, height: 200 });

function snap(rawDelta, zoom = 1, neighbours = [neighbour]) {
  return resolveTileMagnetSnap({ bounds: dragged, neighbours, rawDelta, zoom });
}

describe("tile magnet snapping", () => {
  it("places a tile beside its neighbour with the standard gap", () => {
    // Dropped 5px further right than the gap and 3px low: snaps to the gap
    // and aligns the tops.
    expect(snap({ x: -600 + 200 + TILE_SNAP_GAP + 5, y: -600 + 3 }))
      .toEqual({ x: -600 + 200 + TILE_SNAP_GAP, y: -600 });
  });

  it("stacks a tile under its neighbour with the gap", () => {
    expect(snap({ x: -600 - 4, y: -600 + 200 + TILE_SNAP_GAP - 6 }))
      .toEqual({ x: -600, y: -600 + 200 + TILE_SNAP_GAP });
  });

  it("leaves the drag alone outside the pull distance", () => {
    const rawDelta = { x: -600 + 200 + TILE_SNAP_GAP + TILE_SNAP_THRESHOLD_PX + 20, y: -600 + 50 };

    expect(snap(rawDelta)).toEqual(rawDelta);
  });

  it("measures the pull distance in screen pixels", () => {
    // Just outside the pull at 100% is inside it at 50%.
    const rawDelta = { x: -600 + 200 + TILE_SNAP_GAP + TILE_SNAP_THRESHOLD_PX + 4, y: -600 };

    expect(snap(rawDelta, 1).x).toBe(rawDelta.x);
    expect(snap(rawDelta, 0.5).x).toBe(-600 + 200 + TILE_SNAP_GAP);
  });

  it("ignores tiles far away", () => {
    const farAway = toSnapRect({ x: 5000, y: 5000, width: 200, height: 200 });
    const rawDelta = { x: 3, y: 3 };

    expect(snap(rawDelta, 1, [farAway])).toEqual(rawDelta);
  });

  it("snaps a multi-tile selection by its bounds", () => {
    const bounds = getSnapRectsBounds([
      toSnapRect({ x: 600, y: 600, width: 100, height: 100 }),
      toSnapRect({ x: 750, y: 650, width: 100, height: 100 }),
    ]);

    expect(bounds).toEqual({ left: 600, top: 600, right: 850, bottom: 750 });
  });
});

describe("magnet glide", () => {
  const target = { x: 10, y: -6 };

  it("eases toward the snap, fast at first and slower near the end", () => {
    let shown = { x: 0, y: 0 };
    const steps = [];

    for (let frame = 0; frame < 4; frame += 1) {
      const next = easeSnapOffset(shown, target, 16);
      steps.push(next.x - shown.x);
      shown = next;
    }

    expect(shown.x).toBeGreaterThan(0);
    expect(shown.x).toBeLessThan(target.x);
    expect(steps[0]).toBeGreaterThan(steps[1]);
    expect(steps[1]).toBeGreaterThan(steps[2]);
  });

  it("lands exactly on the snap within a few frames", () => {
    let shown = { x: 0, y: 0 };

    for (let frame = 0; frame < 30; frame += 1) {
      shown = easeSnapOffset(shown, target, 16);
    }

    expect(shown).toEqual(target);
  });

  it("eases by frame time, so a long frame covers more ground", () => {
    expect(easeSnapOffset({ x: 0, y: 0 }, target, 32).x)
      .toBeGreaterThan(easeSnapOffset({ x: 0, y: 0 }, target, 16).x);
  });
});

describe("magnetic snap setting", () => {
  it("is off by default and saved with the grid setting", () => {
    expect(normalizeCanvasSnapSettings({}).magnetEnabled).toBe(false);
    expect(normalizeCanvasSnapSettings({ canvasMagnetSnap: true }).magnetEnabled).toBe(true);
    expect(buildCanvasSnapUiStatePatch({ enabled: false, magnetEnabled: true }))
      .toMatchObject({ canvasSnapToGrid: false, canvasMagnetSnap: true });
  });
});
