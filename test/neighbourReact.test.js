import { describe, expect, it } from "vitest";
import { NEIGHBOUR, getNeighbourOffsets } from "../renderer/src/systems/feel/neighbourReact";

const box = (left, top, width = 100, height = 100) => ({ left, top, width, height });

describe("neighbour hover offsets", () => {
  it("pushes cards away from the hovered one, never the hovered one itself", () => {
    const rects = [box(0, 0), box(120, 0), box(-120, 0), box(0, 120)];
    const offsets = getNeighbourOffsets(rects, 0);

    expect(offsets[0]).toEqual({ x: 0, y: 0 });
    expect(offsets[1].x).toBeGreaterThan(0);
    expect(offsets[2].x).toBeLessThan(0);
    expect(offsets[3].y).toBeGreaterThan(0);
  });

  it("stays subtle and fades out with distance", () => {
    const rects = [box(0, 0), box(105, 0), box(260, 0), box(900, 0)];
    const offsets = getNeighbourOffsets(rects, 0);

    expect(Math.hypot(offsets[1].x, offsets[1].y)).toBeLessThanOrEqual(NEIGHBOUR.PUSH_PX);
    expect(offsets[1].x).toBeGreaterThan(offsets[2].x);
    expect(offsets[3]).toEqual({ x: 0, y: 0 });
  });
});
