import { describe, expect, it } from "vitest";
import { getCanvasGridSpacing } from "../renderer/src/systems/canvas/canvasMath";

describe("canvas dot grid spacing", () => {
  it("keeps the on-screen gap in a steady band at every zoom", () => {
    for (const zoom of [0.02, 0.1, 0.25, 0.5, 1, 1.7, 3, 8]) {
      const spacing = getCanvasGridSpacing(zoom);
      expect(spacing).toBeGreaterThanOrEqual(22);
      expect(spacing).toBeLessThan(44);
    }
  });

  it("stays on the 32px world lattice (power-of-two steps)", () => {
    const ratio = getCanvasGridSpacing(0.1) / (32 * 0.1);
    expect(Math.log2(ratio) % 1).toBeCloseTo(0, 6);
  });
});
