// @vitest-environment jsdom
//
// Merging tiles (tiles/merge/model.js): drop one tile on another and they
// snap into a group in a yellow frame with a short note.
import { describe, expect, it } from "vitest";
import { normalizeCard, normalizeWorkspace } from "@/lib/workspace.js";
import {
  MERGE_LAYOUT,
  computeMergeLayout,
  getMergeDropTarget,
  getMergeGroupTileIds,
  getMergeRowCounts,
  mergeCards,
  settleMergeGroups,
  unmergeGroup,
} from "@/tiles/merge/model.js";
import { getTileRegistration } from "@/tiles/tileRegistry.js";
import MergeNoteTile from "@/components/tiles/MergeNoteTile";

const tile = (id, x = 0, y = 0, extra = {}) => normalizeCard({
  id,
  type: "checklist",
  x,
  y,
  width: 300,
  height: 200,
  ...extra,
});

// Deterministic "random" for the shuffled order.
const fixed = (value) => () => value;

describe("merge layout", () => {
  it("fills rows of up to three, fuller rows at the bottom", () => {
    expect(getMergeRowCounts(2)).toEqual([2]);
    expect(getMergeRowCounts(3)).toEqual([3]);
    expect(getMergeRowCounts(4)).toEqual([2, 2]);
    expect(getMergeRowCounts(5)).toEqual([2, 3]);
    expect(getMergeRowCounts(7)).toEqual([2, 2, 3]);
  });

  it("draws equal rows with straight sides: no notch at the row boundary", () => {
    const layout = computeMergeLayout(["a", "b", "c", "d"].map((id) => tile(id)));
    // Two rows of two, the same width: the outline is the frame's four
    // rounded corners plus the note tab's -- no arcs on the straight sides.
    const arcs = layout.shape.path.match(/A/g) ?? [];
    expect(arcs).toHaveLength(6);
  });

  it("centres a shorter row over a longer one, with the note tab below", () => {
    const members = ["a", "b", "c", "d", "e"].map((id) => tile(id));
    const layout = computeMergeLayout(members);
    const { pad, gap } = MERGE_LAYOUT;
    const bottomWidth = (300 * 3) + (gap * 2);

    expect(layout.width).toBe(bottomWidth + (pad * 2));
    // Top row (a, b) is centred: half a tile + half a gap in from the left.
    expect(layout.positions.a).toEqual({ x: pad + ((bottomWidth - 618) / 2), y: pad });
    expect(layout.positions.c).toEqual({ x: pad, y: pad + 200 + gap });
    expect(layout.shape.note.y).toBe(pad + 200 + gap + 200 + pad);
    expect(layout.height).toBe(layout.shape.note.y + MERGE_LAYOUT.noteMinHeight);
    expect(layout.shape.path).toMatch(/^M.*Z$/);
    expect(layout.shape.path).not.toContain("NaN");
  });
});

describe("merging", () => {
  it("drops one tile on another: a new group around where the target was", () => {
    const cards = [tile("a", 0, 0), tile("b", 1000, 1000)];
    const result = mergeCards(cards, "b", "a", { random: fixed(0.9), frameId: "merge-1" });
    const byId = Object.fromEntries(result.cards.map((card) => [card.id, card]));

    expect(result.frameId).toBe("merge-1");
    // The frame draws behind its tiles.
    expect(result.cards[0].id).toBe("merge-1");
    expect(byId["merge-1"].memberIds).toEqual(["b", "a"]);
    expect(byId.a.mergeId).toBe("merge-1");
    expect(byId.b.mergeId).toBe("merge-1");
    // Side by side, one gap apart, inside the frame's padding.
    expect(byId.b.y).toBe(byId.a.y);
    expect(byId.a.x - byId.b.x).toBe(300 + MERGE_LAYOUT.gap);
    expect(byId.b.x - byId["merge-1"].x).toBe(MERGE_LAYOUT.pad);
    // Centred where "a" was.
    expect(byId["merge-1"].x + (byId["merge-1"].width / 2)).toBeCloseTo(150, 0);
  });

  it("dropping on a grouped tile (or the frame) joins that group", () => {
    const first = mergeCards([tile("a"), tile("b", 400)], "b", "a", { random: fixed(0), frameId: "m" }).cards;
    const withC = [...first, tile("c", 2000, 2000)];

    expect(getMergeDropTarget(withC, "c", "a")).toBe("m");
    expect(getMergeDropTarget(withC, "c", "m")).toBe("m");
    expect(getMergeDropTarget(withC, "a", "b")).toBeNull();

    const joined = mergeCards(withC, "c", "a", { random: fixed(0.99) }).cards;
    const frame = joined.find((card) => card.id === "m");
    expect(frame.memberIds).toHaveLength(3);
    expect(frame.memberIds[2]).toBe("c");
    expect(joined.find((card) => card.id === "c").mergeId).toBe("m");
    const groupIds = getMergeGroupTileIds(joined, "c");
    expect(groupIds[0]).toBe("m");
    expect([...groupIds].sort()).toEqual(["a", "b", "c", "m"]);
  });

  it("won't merge racks, stacked tiles or tiles in a rack", () => {
    const cards = [tile("a"), normalizeCard({ id: "r", type: "rack", x: 0, y: 0 }), tile("s", 0, 0, { stack: { id: "pile" } }), tile("k", 0, 0, { parentRackId: "r" })];
    expect(getMergeDropTarget(cards, "a", "r")).toBeNull();
    expect(getMergeDropTarget(cards, "a", "s")).toBeNull();
    expect(getMergeDropTarget(cards, "k", "a")).toBeNull();
  });
});

describe("keeping groups tidy", () => {
  const group = () => mergeCards([tile("a"), tile("b", 400), tile("c", 800)], "b", "a", { random: fixed(0), frameId: "m" }).cards
    .concat([]);

  it("re-lays a group out when a tile grows", () => {
    const cards = group();
    const grown = settleMergeGroups(cards.map((card) => (card.id === "a" ? { ...card, width: 500 } : card)));
    const frame = grown.find((card) => card.id === "m");
    expect(frame.width).toBe(500 + 300 + MERGE_LAYOUT.gap + (MERGE_LAYOUT.pad * 2));
  });

  it("changes nothing when nothing changed", () => {
    const cards = group();
    expect(settleMergeGroups(cards)).toBe(cards);
  });

  it("dissolves a group left with one tile, and drops dangling members", () => {
    const cards = group().filter((card) => card.id !== "b");
    const settled = settleMergeGroups(cards);
    expect(settled.some((card) => card.id === "m")).toBe(false);
    expect(settled.find((card) => card.id === "a").mergeId).toBeNull();
    expect(settleMergeGroups([tile("x", 0, 0, { mergeId: "gone" })])[0].mergeId).toBeNull();
  });

  it("unmerges: the frame goes, tiles stay put", () => {
    const cards = group();
    const before = cards.find((card) => card.id === "a");
    const split = unmergeGroup(cards, "m");
    const after = split.find((card) => card.id === "a");
    expect(split.some((card) => card.id === "m")).toBe(false);
    expect(after.mergeId).toBeNull();
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });

  it("survives a workspace round trip and renders with its own tile", () => {
    const cards = group();
    const workspace = normalizeWorkspace({ cards });
    const frame = workspace.cards.find((card) => card.id === "m");
    expect(frame.memberIds).toEqual(["a", "b"]);
    expect(frame.mergeShape.path).toBeTruthy();
    expect(workspace.cards.find((card) => card.id === "b").mergeId).toBe("m");
    expect(getTileRegistration(frame).Component).toBe(MergeNoteTile);
  });
});
