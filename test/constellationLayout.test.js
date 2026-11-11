import { describe, expect, it } from "vitest";
import {
  BLANKET,
  BLANKET_HEIGHT,
  BLANKET_WIDTH,
  clampAspect,
  getAdjacentSlot,
  getSlotCount,
  layoutBlanket,
  warpPoint,
  wrapCoordinate,
} from "../renderer/src/systems/constellation/constellationLayout";

describe("constellation blanket layout", () => {
  it("always lays out the same full grid, inside one wrap of the cloth", () => {
    const slots = layoutBlanket([]);

    expect(slots).toHaveLength(getSlotCount());
    expect(new Set(slots.map((slot) => slot.index)).size).toBe(slots.length);
    slots.forEach((slot) => {
      expect(Math.abs(slot.x)).toBeLessThanOrEqual(BLANKET_WIDTH / 2 + 1e-9);
      expect(Math.abs(slot.y)).toBeLessThanOrEqual(BLANKET_HEIGHT / 2 + 1e-9);
    });
  });

  it("keeps each tile's own shape, upright, inside its cell", () => {
    const slots = layoutBlanket(Array.from({ length: getSlotCount() }, (_, index) => (index % 3 === 0 ? 1.5 : 0.6)));

    slots.forEach((slot, index) => {
      expect(Math.abs(slot.width / slot.height - (index % 3 === 0 ? 1.5 : 0.6))).toBeLessThan(1e-6);
      expect(slot.width).toBeLessThanOrEqual(BLANKET.CELL_W);
    });
  });

  it("wraps coordinates so the cloth never ends", () => {
    expect(wrapCoordinate(0, 8)).toBe(0);
    expect(wrapCoordinate(4.5, 8)).toBeCloseTo(-3.5, 9);
    expect(wrapCoordinate(-4.5, 8)).toBeCloseTo(3.5, 9);
    expect(wrapCoordinate(8, 8)).toBeCloseTo(0, 9);
  });

  it("warps: full size in the middle, shrinking and bunching toward the edges, never past the horizon", () => {
    expect(warpPoint(0, 0)).toEqual({ x: 0, y: 0, scale: 1 });
    expect(warpPoint(0.05, 0).scale).toBeGreaterThan(0.99);

    const near = warpPoint(1, 0);
    const far = warpPoint(2.5, 0);
    const farther = warpPoint(5, 0);

    expect(near.scale).toBeGreaterThan(far.scale);
    expect(far.scale).toBeGreaterThan(farther.scale);
    expect(farther.scale).toBeGreaterThanOrEqual(0.1);
    expect(farther.x).toBeLessThan(BLANKET.HORIZON);
    expect(farther.x).toBeGreaterThan(far.x);
    // Diagonals warp the same as straight lines of equal distance.
    const diagonal = warpPoint(Math.SQRT1_2 * 2, Math.SQRT1_2 * 2);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(warpPoint(2, 0).x, 9);
  });

  it("clamps odd aspect ratios", () => {
    expect(clampAspect(100, 1000)).toBe(BLANKET.MIN_ASPECT);
    expect(clampAspect(1000, 100)).toBe(BLANKET.MAX_ASPECT);
    expect(clampAspect(undefined, undefined)).toBe(0.8);
  });

  it("finds grid neighbours with wrap-around, skipping hidden slots", () => {
    const start = 3 * BLANKET.COLS + 5;

    expect(getAdjacentSlot(start, "right")).toBe(start + 1);
    expect(getAdjacentSlot(start, "left")).toBe(start - 1);
    expect(getAdjacentSlot(start, "up")).toBe(start + BLANKET.COLS);
    expect(getAdjacentSlot(start, "down")).toBe(start - BLANKET.COLS);
    expect(getAdjacentSlot(BLANKET.COLS - 1, "right")).toBe(0);
    expect(getAdjacentSlot(0, "down")).toBe((BLANKET.ROWS - 1) * BLANKET.COLS);
    expect(getAdjacentSlot(start, "right", new Set([start + 1]))).toBe(start + 2);
  });
});
