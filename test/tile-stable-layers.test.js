import { describe, expect, it } from "vitest";
import { getStableBaseLayers } from "@/systems/layout/useTileLayoutSystem.js";

const entries = (ids) => ids.map((id) => ({ tile: { id } }));
const layersOf = (map, ids) => ids.map((id) => map.get(id));

describe("getStableBaseLayers", () => {
  it("numbers a fresh page in order", () => {
    const layers = getStableBaseLayers(entries(["a", "b", "c"]), new Map());
    expect(layersOf(layers, ["a", "b", "c"])).toEqual([1, 2, 3]);
  });

  it("bringing a tile to the front changes only that tile's layer", () => {
    const first = getStableBaseLayers(entries(["a", "b", "c", "d"]), new Map());
    const next = getStableBaseLayers(entries(["a", "c", "d", "b"]), first);

    expect(layersOf(next, ["a", "c", "d"])).toEqual(layersOf(first, ["a", "c", "d"]));
    expect(next.get("b")).toBeGreaterThan(next.get("d"));
  });

  it("always stacks in page order", () => {
    let layers = new Map();
    let order = ["a", "b", "c", "d", "e"];

    for (const moved of ["a", "c", "a", "e", "b", "d"]) {
      order = [...order.filter((id) => id !== moved), moved];
      layers = getStableBaseLayers(entries(order), layers);
      const values = layersOf(layers, order);
      expect(values).toEqual([...values].sort((x, y) => x - y));
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("renumbers once the layers run far past the tile count", () => {
    let layers = new Map();
    let order = ["a", "b"];

    for (let index = 0; index < 200; index += 1) {
      order = [order[1], order[0]];
      layers = getStableBaseLayers(entries(order), layers);
    }

    expect(Math.max(...layers.values())).toBeLessThanOrEqual(2 * 2 + 100);
    expect(layersOf(layers, order)[0]).toBeLessThan(layersOf(layers, order)[1]);
  });
});
