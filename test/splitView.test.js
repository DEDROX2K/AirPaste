import { describe, expect, it } from "vitest";
import { withActivePageMirror } from "../renderer/src/lib/workspace";
import {
  applyInPageScope,
  clampSplitRatio,
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
  it("normalizes junk into a disabled 50/50 split", () => {
    expect(normalizeSplitView(null)).toEqual({ enabled: false, ratio: 0.5, panes: {} });
    expect(normalizeSplitView({ enabled: true, ratio: 3, panes: { f: { pageId: 1, viewport: { x: 1 } } } }))
      .toEqual({ enabled: true, ratio: 0.85, panes: { f: { pageId: null, viewport: null } } });
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
