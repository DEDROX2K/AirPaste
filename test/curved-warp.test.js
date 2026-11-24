import { describe, expect, it } from "vitest";
import { createWarp, quadMatrix, worldBoxTransform } from "../renderer/src/systems/canvas/curvedWarp.js";

function apply(m, x, y) {
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const Wh = m[3] * x + m[7] * y + m[15];
  return [X / Wh, Y / Wh];
}

describe("curved view warp", () => {
  const field = createWarp(1200, 800);

  it("leaves the centre flat and pulls the rim inwards", () => {
    expect(field.warp(600, 400)).toEqual([600, 400]);
    const [x] = field.warp(1200, 400);
    expect(x).toBeLessThan(1200);
    expect(x).toBeGreaterThan(600);
  });

  it("unwarp undoes warp", () => {
    for (const [px, py] of [[10, 20], [1190, 790], [900, 100]]) {
      const [wx, wy] = field.warp(px, py);
      const [ux, uy] = field.unwarp(wx, wy);
      expect(ux).toBeCloseTo(px, 3);
      expect(uy).toBeCloseTo(py, 3);
    }
  });

  it("maps a box exactly onto its quad", () => {
    const quad = [[3, 4], [110, 0], [120, 90], [-5, 80]];
    const m = quadMatrix(100, 80, ...quad);
    [[0, 0], [100, 0], [100, 80], [0, 80]].forEach(([x, y], i) => {
      const [qx, qy] = apply(m, x, y);
      expect(qx).toBeCloseTo(quad[i][0], 6);
      expect(qy).toBeCloseTo(quad[i][1], 6);
    });
  });

  it("pins a world box's corners to their warped spots", () => {
    const viewport = { x: 50, y: 30, zoom: 0.8 };
    const box = { x: 1200, y: 700, w: 240, h: 200 };
    const css = worldBoxTransform(field, viewport, box.x, box.y, box.w, box.h);
    const m = css.slice("matrix3d(".length, -1).split(",").map(Number);
    [[box.x, box.y], [box.x + box.w, box.y + box.h]].forEach(([wx, wy]) => {
      const [ex, ey] = apply(m, wx, wy);
      const [sx, sy] = field.warp(viewport.x + wx * viewport.zoom, viewport.y + wy * viewport.zoom);
      expect(viewport.x + ex * viewport.zoom).toBeCloseTo(sx, 2);
      expect(viewport.y + ey * viewport.zoom).toBeCloseTo(sy, 2);
    });
    expect(worldBoxTransform(field, viewport, 600, 400, 10, 10)).toBeNull();
  });
});
