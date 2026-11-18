import { describe, expect, it } from "vitest";
import { withActivePageMirror } from "../renderer/src/lib/workspace";
import {
  applyInPageScope,
  clampFloatPosition,
  clampSplitRatio,
  closeSplitFor,
  findFilePair,
  getDetachZone,
  getFloatSize,
  moveTilesBetweenFiles,
  openFilePair,
  openFloating,
  openPageSplit,
  snapFloatPosition,
  isSplitToggleShortcut,
  movePageTilesBy,
  moveTilesBetweenPages,
  normalizeSplitView,
} from "../renderer/src/systems/canvas/splitView";
import { normalizeQuickNote } from "../renderer/src/lib/quickNote";

function twoPageWorkspace() {
  return withActivePageMirror({
    activePageId: "a",
    pages: [
      { id: "a", name: "A", cards: [], viewport: { x: 0, y: 0, zoom: 1 } },
      { id: "b", name: "B", cards: [], viewport: { x: 50, y: 50, zoom: 2 } },
    ],
  });
}

const addMarker = (current) => ({
  ...current,
  pages: current.pages.map((page) => (
    page.id === current.activePageId ? { ...page, name: `${page.name}!` } : page
  )),
});

describe("applyInPageScope", () => {
  it("edits the scoped page and keeps the real active page", () => {
    const next = applyInPageScope(twoPageWorkspace(), "b", addMarker);
    expect(next.activePageId).toBe("a");
    expect(next.pages.map((page) => page.name)).toEqual(["A", "B!"]);
    expect(next.activePage.id).toBe("a");
  });

  it("passes straight through when scoped to the active page", () => {
    const next = applyInPageScope(twoPageWorkspace(), "a", addMarker);
    expect(next.pages.map((page) => page.name)).toEqual(["A!", "B"]);
  });

  it("returns the original workspace when the updater changes nothing", () => {
    const workspace = twoPageWorkspace();
    expect(applyInPageScope(workspace, "b", (current) => current)).toBe(workspace);
  });

  it("keeps an active-page change the updater made itself", () => {
    const next = applyInPageScope(twoPageWorkspace(), "b", (current) => ({ ...current, activePageId: "a" }));
    expect(next.activePageId).toBe("a");
    const moved = applyInPageScope(twoPageWorkspace(), "b", (current) => ({
      ...current,
      pages: [...current.pages, { id: "c", name: "C", cards: [] }],
      activePageId: "c",
    }));
    expect(moved.activePageId).toBe("c");
  });

  it("falls back to the active page for an unknown page id", () => {
    const next = applyInPageScope(twoPageWorkspace(), "missing", addMarker);
    expect(next.pages.map((page) => page.name)).toEqual(["A!", "B"]);
  });
});

describe("split view state", () => {
  it("keeps the stacked layout flag", () => {
    expect(normalizeSplitView({ stacked: true }).stacked).toBe(true);
    expect(normalizeSplitView({ stacked: "yes" }).stacked).toBe(false);
  });

  it("normalizes junk into a closed 50/50 split", () => {
    expect(normalizeSplitView(null)).toEqual({ ratio: 0.5, stacked: false, panes: {}, floating: null });
    // The old global `enabled` flag is dropped; panes keep their page.
    expect(normalizeSplitView({ enabled: true, ratio: 3, panes: { f: { pageId: 1, viewport: { x: 1 } }, g: { enabled: true, pageId: "p", filePath: "g" } } }))
      .toEqual({
        ratio: 0.85,
        stacked: false,
        panes: {
          f: { enabled: false, filePath: null, pageId: null, viewport: null },
          g: { enabled: true, filePath: null, pageId: "p", viewport: null },
        },
        floating: null,
      });
    expect(normalizeSplitView({ floating: { filePath: "x", orientation: "sideways", snap: "middle", x: 4 } }).floating)
      .toEqual({ filePath: "x", x: 4, y: null, orientation: "portrait", snap: null });
  });

  it("keeps both panes at least 320px wide", () => {
    expect(clampSplitRatio(0.05, 1008)).toBeCloseTo(320 / 1000);
    expect(clampSplitRatio(0.95, 1008)).toBeCloseTo(1 - 320 / 1000);
    expect(clampSplitRatio(0.3, 500)).toBe(0.5);
  });

  it("toggles on Ctrl/Cmd+backslash only", () => {
    expect(isSplitToggleShortcut({ ctrlKey: true, key: "\\" })).toBe(true);
    expect(isSplitToggleShortcut({ metaKey: true, code: "Backslash", key: "" })).toBe(true);
    expect(isSplitToggleShortcut({ ctrlKey: true, shiftKey: true, key: "\\" })).toBe(false);
    expect(isSplitToggleShortcut({ key: "\\" })).toBe(false);
  });
});

describe("quick note state", () => {
  it("defaults open and empty, and caps text", () => {
    expect(normalizeQuickNote(undefined)).toEqual({ open: true, items: [] });
    const note = normalizeQuickNote({ open: false, items: [{ text: "x".repeat(900), checked: true }] });
    expect(note.open).toBe(false);
    expect(note.items[0].text).toHaveLength(500);
    expect(note.items[0].checked).toBe(true);
    expect(typeof note.items[0].id).toBe("string");
  });
});

describe("cross-pane drop", () => {
  function workspaceWithTiles() {
    return withActivePageMirror({
      activePageId: "a",
      pages: [
        {
          id: "a",
          name: "A",
          cards: [
            { id: "t1", x: 10, y: 20 },
            { id: "rack", x: 100, y: 100 },
            { id: "inside", x: 0, y: 0, parentRackId: "rack" },
            { id: "stay", x: 5, y: 5 },
          ],
          tethers: [
            { id: "l1", a: "t1", b: "rack" },
            { id: "l2", a: "t1", b: "stay" },
          ],
          edges: [],
          groups: [],
        },
        { id: "b", name: "B", cards: [{ id: "other", x: 0, y: 0 }], tethers: [], edges: [], groups: [] },
      ],
    });
  }

  it("moves dragged tiles (and a rack's tiles) to the target page", () => {
    const next = moveTilesBetweenPages(workspaceWithTiles(), {
      sourcePageId: "a",
      targetPageId: "b",
      tileIds: ["t1", "rack"],
      delta: { x: 5, y: -10 },
    });
    const [a, b] = next.pages;
    expect(a.cards.map((card) => card.id)).toEqual(["stay"]);
    expect(b.cards.map((card) => card.id)).toEqual(["other", "t1", "rack", "inside"]);
    expect(b.cards.find((card) => card.id === "t1")).toMatchObject({ x: 15, y: 10 });
    expect(b.cards.find((card) => card.id === "inside")).toMatchObject({ x: 0, y: 0 });
    // l1 links two moved tiles, so it travels; l2 is cut.
    expect(b.tethers.map((link) => link.id)).toEqual(["l1"]);
    expect(a.tethers).toEqual([]);
    expect(next.activePageId).toBe("a");
  });

  it("is a no-op for the same page or unknown tiles", () => {
    const workspace = workspaceWithTiles();
    expect(moveTilesBetweenPages(workspace, { sourcePageId: "a", targetPageId: "a", tileIds: ["t1"], delta: { x: 1, y: 1 } })).toBe(workspace);
    expect(moveTilesBetweenPages(workspace, { sourcePageId: "a", targetPageId: "b", tileIds: ["nope"], delta: { x: 1, y: 1 } })).toBe(workspace);
  });

  it("shifts tiles in place for a same-page drop", () => {
    const next = movePageTilesBy(workspaceWithTiles(), "a", ["t1"], { x: 3, y: 4 });
    expect(next.pages[0].cards[0]).toMatchObject({ id: "t1", x: 13, y: 24 });
    expect(next.pages[0].cards[3]).toMatchObject({ id: "stay", x: 5, y: 5 });
  });
});

describe("file pairs and floating view", () => {
  const empty = () => normalizeSplitView(null);

  it("links two files and finds the pair from either half", () => {
    const state = openFilePair(empty(), "A", "B");
    expect(findFilePair(state, "A")).toEqual({ leftPath: "A", rightPath: "B" });
    expect(findFilePair(state, "B")).toEqual({ leftPath: "A", rightPath: "B" });
    expect(findFilePair(state, "C")).toBeNull();
    expect(closeSplitFor(state, "B").panes.A.enabled).toBe(false);
  });

  it("keeps a file in one place at a time", () => {
    let state = openFilePair(empty(), "A", "B");
    state = openFilePair(state, "C", "B");
    expect(findFilePair(state, "A")).toBeNull();
    expect(findFilePair(state, "B")).toEqual({ leftPath: "C", rightPath: "B" });
    state = openFloating(state, "C");
    expect(findFilePair(state, "B")).toBeNull();
    expect(state.floating.filePath).toBe("C");
    state = openFilePair(state, "C", "D");
    expect(state.floating).toBeNull();
  });

  it("a page split replaces the file's pair", () => {
    let state = openFilePair(empty(), "A", "B");
    state = openPageSplit(state, "A", "p2");
    expect(findFilePair(state, "B")).toBeNull();
    expect(state.panes.A).toMatchObject({ enabled: true, filePath: null, pageId: "p2" });
  });

  it("refloating keeps the card's last spot and shape", () => {
    let state = openFloating(empty(), "A");
    state = { ...state, floating: { ...state.floating, x: 10, y: 20, orientation: "landscape", snap: "left" } };
    state = openFloating(state, "B");
    expect(state.floating).toEqual({ filePath: "B", x: 10, y: 20, orientation: "landscape", snap: "left" });
  });
});

describe("floating card placement", () => {
  const bounds = { left: 0, top: 40, width: 1200, height: 800 };

  it("fits the card inside a small window", () => {
    expect(getFloatSize("portrait", bounds)).toEqual({ width: 300, height: 540 });
    expect(getFloatSize("landscape", { width: 400, height: 300 })).toEqual({ width: 376, height: 276 });
  });

  it("keeps the card inside the window", () => {
    expect(clampFloatPosition({ x: -50, y: 2000, width: 300, height: 540 }, bounds)).toEqual({ x: 12, y: 40 + 800 - 540 - 12 });
  });

  it("snaps to a nearby edge and stays free in the middle", () => {
    expect(snapFloatPosition({ x: 30, y: 200, width: 300, height: 540 }, bounds)).toEqual({ x: 12, y: 200, snap: "left" });
    expect(snapFloatPosition({ x: 870, y: 200, width: 300, height: 540 }, bounds)).toEqual({ x: 888, y: 200, snap: "right" });
    expect(snapFloatPosition({ x: 400, y: 60, width: 300, height: 540 }, bounds)).toEqual({ x: 400, y: 52, snap: "top" });
    expect(snapFloatPosition({ x: 400, y: 120, width: 300, height: 540 }, bounds)).toEqual({ x: 400, y: 120, snap: null });
  });
});

describe("cross-file drop", () => {
  const source = () => withActivePageMirror({
    activePageId: "a",
    pages: [{
      id: "a",
      name: "A",
      cards: [{ id: "t1", x: 0, y: 0 }, { id: "t2", x: 5, y: 5 }, { id: "keep", x: 1, y: 1 }],
      tethers: [{ id: "l", a: "t1", b: "t2" }],
      edges: [],
      groups: [],
    }],
  });
  const target = () => withActivePageMirror({
    activePageId: "z",
    pages: [{ id: "z", name: "Z", cards: [{ id: "t2", x: 9, y: 9 }], tethers: [], edges: [], groups: [] }],
  });

  it("moves tiles to the other file, renaming clashing ids", () => {
    const result = moveTilesBetweenFiles(source(), target(), {
      sourcePageId: "a",
      targetPageId: "z",
      tileIds: ["t1", "t2"],
      delta: { x: 10, y: 0 },
    });
    expect(result.source.pages[0].cards.map((card) => card.id)).toEqual(["keep"]);
    expect(result.source.pages[0].tethers).toEqual([]);
    const cards = result.target.pages[0].cards;
    expect(cards).toHaveLength(3);
    expect(cards[1]).toMatchObject({ id: "t1", x: 10 });
    expect(cards[2].id).not.toBe("t2");
    expect(cards[2].id.startsWith("t2-")).toBe(true);
    expect(result.target.pages[0].tethers[0]).toMatchObject({ a: "t1", b: cards[2].id });
  });

  it("returns null when nothing moves", () => {
    expect(moveTilesBetweenFiles(source(), target(), { sourcePageId: "a", targetPageId: "z", tileIds: ["nope"] })).toBeNull();
  });
});

describe("tab detach drop boxes", () => {
  const area = { left: 100, top: 50, width: 900, height: 600 };

  it("splits the area in thirds: left, float, right", () => {
    expect(getDetachZone(area, 150, 300, true)).toBe("left");
    expect(getDetachZone(area, 550, 300, true)).toBe("float");
    expect(getDetachZone(area, 950, 300, true)).toBe("right");
    expect(getDetachZone(area, 550, 20, true)).toBeNull();
  });

  it("offers only the float box without a file to split with", () => {
    expect(getDetachZone(area, 150, 300, false)).toBeNull();
    expect(getDetachZone(area, 550, 300, false)).toBe("float");
  });
});
