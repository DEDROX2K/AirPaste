import { describe, expect, it } from "vitest";
import { getDragSlot, reorderTabs } from "../renderer/src/context/tabOrder";

const tabs = ["home", "a", "b", "c", "d"].map((id) => ({ id, pinned: id === "home" }));
const ids = (list) => list.map((tab) => tab.id);

describe("tab order", () => {
  it("moves a tab to the very end (it used to stop one short)", () => {
    expect(ids(reorderTabs(tabs, "a", tabs.length))).toEqual(["home", "b", "c", "d", "a"]);
  });

  it("moves left to right and right to left by any distance", () => {
    expect(ids(reorderTabs(tabs, "a", 4))).toEqual(["home", "b", "c", "a", "d"]);
    expect(ids(reorderTabs(tabs, "d", 1))).toEqual(["home", "d", "a", "b", "c"]);
  });

  it("keeps Home first", () => {
    expect(ids(reorderTabs(tabs, "c", 0))).toEqual(["home", "c", "a", "b", "d"]);
    expect(reorderTabs(tabs, "home", 3)).toBe(tabs);
  });

  it("swaps when the dragged tab's leading edge crosses a neighbour's middle", () => {
    // Others: a narrow tab at 100..190 and a wide one at 196..376.
    const others = [{ left: 100, width: 90 }, { left: 196, width: 180 }];
    // Going right with a wide tab whose right edge has passed 286 (the wide
    // neighbour's middle): it goes after both.
    expect(getDragSlot(others, 120, 300, true)).toBe(2);
    // Going right, right edge short of 286: after the first only.
    expect(getDragSlot(others, 100, 280, true)).toBe(1);
    // Going left, left edge past 145 (the narrow tab's middle): first.
    expect(getDragSlot(others, 140, 320, false)).toBe(0);
  });
});
