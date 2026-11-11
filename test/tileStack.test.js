import { describe, expect, it } from "vitest";
import { normalizeCard } from "../renderer/src/lib/workspace";
import { buildRadialMenuActions } from "../renderer/src/systems/interactions/radialMenuActions";
import { STACK, getStackBands, stackCards, unstackCards } from "../renderer/src/systems/stack/tileStack";

const tile = (id, x, y, width = 200, height = 220) => ({ id, type: "link", x, y, width, height });
const board = () => [
  tile("a", 0, 0),
  tile("other", 2000, 2000),
  tile("b", 300, 120),
  tile("c", 600, 260),
];

describe("tile stacks", () => {
  it("piles the selected tiles on the centre of their bounds, top one straight", () => {
    const result = stackCards(board(), ["a", "b", "c"], { stackId: "s1" });
    const piled = result.cards.filter((card) => card.stack);

    expect(piled.map((card) => card.id)).toEqual(["a", "b", "c"]);
    expect(result.cards.at(-1).id).toBe("c");
    expect(result.cards.find((card) => card.id === "other")).toEqual(tile("other", 2000, 2000));

    // Bounds 0..800 x 0..480: centre (400, 240).
    piled.forEach((card) => {
      expect(Math.abs(card.x + card.width / 2 - 400)).toBeLessThanOrEqual(STACK.MAX_OFFSET_PX + 1);
      expect(Math.abs(card.y + card.height / 2 - 240)).toBeLessThanOrEqual(STACK.MAX_OFFSET_PX + 1);
      expect(Math.abs(card.stack.tilt)).toBeLessThanOrEqual(STACK.MAX_TILT_DEG);
    });
    expect(piled.at(-1)).toMatchObject({ x: 300, y: 130, stack: { tilt: 0, order: 2 } });
  });

  it("needs at least two tiles", () => {
    expect(stackCards(board(), ["a"])).toBeNull();
  });

  it("ungroups back to where every tile was", () => {
    const stacked = stackCards(board(), ["a", "b", "c"], { stackId: "s1" }).cards;
    const restored = unstackCards(stacked, "s1");

    expect(restored.find((card) => card.id === "a")).toMatchObject({ x: 0, y: 0, stack: null });
    expect(restored.find((card) => card.id === "b")).toMatchObject({ x: 300, y: 120, stack: null });
    expect(restored.find((card) => card.id === "c")).toMatchObject({ x: 600, y: 260, stack: null });
  });

  it("keeps each tile's original home when it joins another stack", () => {
    const first = stackCards(board(), ["a", "b"], { stackId: "s1" }).cards;
    const second = stackCards(first, ["a", "b", "c"], { stackId: "s2" }).cards;
    const restored = unstackCards(second, "s2");

    expect(restored.find((card) => card.id === "a")).toMatchObject({ x: 0, y: 0 });
    expect(restored.find((card) => card.id === "b")).toMatchObject({ x: 300, y: 120 });
  });

  it("survives card normalisation (saved with the canvas)", () => {
    const [stacked] = stackCards(board(), ["a", "b"], { stackId: "s1" }).cards.filter((card) => card.id === "a");
    const normalized = normalizeCard({ ...stacked, url: "https://example.com" });
    expect(normalized.stack).toEqual(stacked.stack);
  });

  it("offers only Ungroup on a stacked tile, and Group for a multi-selection", () => {
    const handlers = new Proxy({}, { get: () => () => true });
    const stackedMenu = buildRadialMenuActions({ menu: { kind: "tile", selectionIds: ["a"] }, stackState: "stacked", handlers });
    expect(stackedMenu.map((action) => action.id)).toEqual(["unstack"]);

    const selectionMenu = buildRadialMenuActions({ menu: { kind: "tile", selectionIds: ["a", "b", "c"] }, stackState: "can-stack", handlers })
      .filter(Boolean);
    expect(selectionMenu.find((action) => action.id === "stack")?.label).toBe("Group 3 tiles");
  });

  it("wraps one rubber band round the whole pile, layered just over it", () => {
    const stacked = stackCards(board(), ["a", "b", "c"], { stackId: "s1" }).cards;
    const bands = getStackBands(stacked);
    const members = stacked.filter((card) => card.stack);
    const left = Math.min(...members.map((card) => card.x));
    const right = Math.max(...members.map((card) => card.x + card.width));

    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ stackId: "s1", layer: stacked.length });
    // At least as wide as every tile in the pile, centred on it.
    expect(bands[0].width).toBeGreaterThanOrEqual(right - left + 10);
    expect(Math.abs(bands[0].x - (left + right) / 2)).toBeLessThan(STACK.MAX_OFFSET_PX + 10);
    expect(Math.abs(bands[0].angle)).toBeLessThanOrEqual(5);
    expect(getStackBands(unstackCards(stacked, "s1"))).toEqual([]);
  });

});
