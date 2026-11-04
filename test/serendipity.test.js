// Serendipity: which tiles resurface, how the deck is weighted, and that
// "let go" + undo round-trips a tile (with its tethers and rack slot).
import { describe, expect, it } from "vitest";
import {
  collectSerendipityEntries,
  isSerendipityCard,
  pickSerendipityDeck,
  removeSerendipityCard,
  restoreSerendipityCard,
} from "@/lib/serendipity.js";
import { normalizeCard, normalizeWorkspace, WORKSPACE_SCHEMA_VERSION } from "@/lib/workspace.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-04T12:00:00.000Z");

function link(id, extra = {}) {
  return { id, type: "link", url: `https://example.com/${id}`, title: id, x: 0, y: 0, ...extra };
}

function workspaceWith(cards, extraPage = {}) {
  return normalizeWorkspace({
    version: WORKSPACE_SCHEMA_VERSION,
    activePageId: "p1",
    pages: [{ id: "p1", name: "Page 1", cards, ...extraPage }],
  });
}

describe("isSerendipityCard", () => {
  it("keeps saves and skips widgets and empty tiles", () => {
    expect(isSerendipityCard(normalizeCard(link("a")))).toBe(true);
    expect(isSerendipityCard(normalizeCard({ id: "n", type: "paper-note", title: "Idea", text: "" }))).toBe(true);
    expect(isSerendipityCard(normalizeCard({ id: "e", type: "paper-note", title: "", text: "  " }))).toBe(false);
    expect(isSerendipityCard(normalizeCard({ id: "c", type: "counter" }))).toBe(false);
    expect(isSerendipityCard(normalizeCard({ id: "w", type: "weather" }))).toBe(false);
    expect(isSerendipityCard(normalizeCard({ id: "k", type: "checklist", items: [] }))).toBe(false);
    expect(isSerendipityCard(normalizeCard({ id: "k2", type: "checklist", items: [{ text: "buy milk" }] }))).toBe(true);
  });
});

describe("collectSerendipityEntries", () => {
  it("flattens every page of every canvas", () => {
    const entries = collectSerendipityEntries([
      {
        filePath: "/dome/a.canvas",
        name: "Moodboard",
        workspace: {
          version: WORKSPACE_SCHEMA_VERSION,
          activePageId: "p1",
          pages: [
            { id: "p1", name: "One", cards: [link("a"), { id: "c", type: "counter" }] },
            { id: "p2", name: "Two", cards: [link("b")] },
          ],
        },
      },
      { filePath: "/dome/b.canvas", name: "Reading", workspace: { cards: [link("c")] } },
    ]);

    expect(entries.map((entry) => entry.key)).toEqual([
      "/dome/a.canvas::a",
      "/dome/a.canvas::b",
      "/dome/b.canvas::c",
    ]);
    expect(entries[1]).toMatchObject({ canvasName: "Moodboard", pageId: "p2", pageName: "Two" });
    // Single-page canvases don't bother naming the page.
    expect(entries[2].pageName).toBe("");
  });
});

describe("pickSerendipityDeck", () => {
  const entries = Array.from({ length: 40 }, (_, index) => ({
    key: `k${index}`,
    savedAt: new Date(NOW - index * 20 * DAY).toISOString(),
  }));

  it("returns each entry at most once, up to the limit", () => {
    const deck = pickSerendipityDeck(entries, { limit: 24, now: NOW });
    expect(deck).toHaveLength(24);
    expect(new Set(deck.map((entry) => entry.key)).size).toBe(24);
  });

  // Seeded so these odds checks never flake.
  function seededRandom(seed = 7) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  function countFirstPicks(pair, key, options = {}) {
    const random = seededRandom();
    let wins = 0;
    for (let run = 0; run < 1000; run += 1) {
      const [first] = pickSerendipityDeck(pair, { limit: 1, now: NOW, random, ...options });
      if (first.key === key) wins += 1;
    }
    return wins;
  }

  it("leans toward older saves", () => {
    // ~2 years old vs saved today: weights of ~12 vs 1.
    expect(countFirstPicks([entries[0], entries[39]], "k39")).toBeGreaterThan(800);
  });

  it("holds back tiles shown in the last few days", () => {
    // Same age, one shown yesterday.
    const twin = { key: "twin", savedAt: entries[20].savedAt };
    const wins = countFirstPicks([entries[20], twin], "k20", { shownAt: { k20: NOW - DAY } });
    expect(wins).toBeLessThan(150);
    // ...but not once the hold-back window has passed.
    const later = countFirstPicks([entries[20], twin], "k20", { shownAt: { k20: NOW - 10 * DAY } });
    expect(later).toBeGreaterThan(400);
  });
});

describe("removeSerendipityCard / restoreSerendipityCard", () => {
  it("removes a tile with its tethers, and undo puts both back", () => {
    const workspace = workspaceWith(
      [link("a"), link("b"), link("c")],
      { tethers: [{ id: "t1", a: "a", b: "b" }, { id: "t2", a: "b", b: "c" }] },
    );

    const result = removeSerendipityCard(workspace, "p1", "b");
    const page = result.workspace.pages[0];
    expect(page.cards.map((card) => card.id)).toEqual(["a", "c"]);
    expect(page.tethers).toEqual([]);

    const restored = normalizeWorkspace(restoreSerendipityCard(result.workspace, result.removed));
    expect(restored.pages[0].cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
    expect(restored.pages[0].tethers.map((tether) => tether.id).sort()).toEqual(["t1", "t2"]);
  });

  it("returns null when the tile is already gone", () => {
    const workspace = workspaceWith([link("a")]);
    expect(removeSerendipityCard(workspace, "p1", "missing")).toBeNull();
  });

  it("finds the tile even if it moved to another page", () => {
    const workspace = normalizeWorkspace({
      version: WORKSPACE_SCHEMA_VERSION,
      activePageId: "p1",
      pages: [
        { id: "p1", cards: [link("a")] },
        { id: "p2", cards: [link("b")] },
      ],
    });
    const result = removeSerendipityCard(workspace, "p1", "b");
    expect(result.removed.pageId).toBe("p2");
    expect(result.workspace.pages[1].cards).toEqual([]);
  });

  it("restores a racked tile into its rack slot", () => {
    const workspace = workspaceWith([
      { id: "rack", type: "rack", tileIds: ["a", "b"], x: 0, y: 0 },
      link("a", { parentRackId: "rack", rackIndex: 0 }),
      link("b", { parentRackId: "rack", rackIndex: 1 }),
    ]);

    const result = removeSerendipityCard(workspace, "p1", "a");
    const rackAfterRemove = result.workspace.pages[0].cards.find((card) => card.id === "rack");
    expect(rackAfterRemove.tileIds).toEqual(["b"]);

    const restored = restoreSerendipityCard(result.workspace, result.removed);
    const rack = restored.pages[0].cards.find((card) => card.id === "rack");
    expect(rack.tileIds).toEqual(["a", "b"]);
  });
});
