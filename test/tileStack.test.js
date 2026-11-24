import { describe, expect, it } from "vitest";
import { normalizeCard } from "../renderer/src/lib/workspace";
import { buildRadialMenuActions } from "../renderer/src/systems/interactions/radialMenuActions";
import { STACK, groupStacks, moveStackCards, stackCards, unstackCards } from "../renderer/src/systems/stack/tileStack";

const tile = (id, x, y, width = 200, height = 220) => ({ id, type: "link", x, y, width, height });
const board = () => [
  tile("a", 0, 0),
  tile("other", 2000, 2000),
  tile("b", 300, 120),
  tile("c", 600, 260),
];

describe("tile stacks", () => {
  it("moves a pile and where its tiles go back to, together", () => {
    const stacked = stackCards(board(), ["a", "b"], { stackId: "s1" }).cards;
    const moved = moveStackCards(stacked, "s1", 40, -10);
    const before = stacked.find((card) => card.id === "a");
    const after = moved.find((card) => card.id === "a");

    expect(after.x - before.x).toBe(40);
    expect(after.y - before.y).toBe(-10);
    expect(after.stack.homeX - before.stack.homeX).toBe(40);
    expect(after.stack.homeY - before.stack.homeY).toBe(-10);
    expect(moved.find((card) => card.id === "c")).toBe(stacked.find((card) => card.id === "c"));
    expect(moveStackCards(stacked, "s1", 0, 0)).toBe(stacked);
  });

  it("groups each pile bottom to top", () => {
    const stacked = stackCards(board(), ["a", "b", "c"], { stackId: "s1" }).cards;
    const piles = groupStacks(stacked);

    expect([...piles.keys()]).toEqual(["s1"]);
    expect(piles.get("s1").map((card) => card.stack.order)).toEqual([0, 1, 2]);
  });

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

});
