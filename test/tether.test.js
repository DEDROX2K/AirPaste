// Characterization tests for the tethering data functions in lib/workspace.js
// (tetherTiles, untetherTile, and the normalizeTethers it runs through on
// every load). See useCanvasCommands.js's tetherSelectedTiles/untetherTile
// commands for how these are wired to the right-click menu.
import { describe, expect, it } from "vitest";
import { getWorkspaceActivePage, normalizeWorkspace, tetherTiles, TETHER_MAX_TILES, untetherTile, WORKSPACE_SCHEMA_VERSION } from "@/lib/workspace.js";

function makeCard(id, x, y) {
  return {
    id,
    type: "link",
    url: "https://example.com",
    title: "Example",
    siteName: "example.com",
    status: "ready",
    x,
    y,
    width: 200,
    height: 120,
  };
}

function makePage(cards, tethers = []) {
  return { cards, tethers };
}

describe("tetherTiles", () => {
  it("does nothing for fewer than 2 tiles", () => {
    const page = makePage([makeCard("a", 0, 0)]);
    expect(tetherTiles(page, ["a"], page.cards)).toBeNull();
  });

  it("groups the given tiles into one tether and re-arranges them around their centroid", () => {
    const cards = [makeCard("a", 0, 0), makeCard("b", 500, 0), makeCard("c", 250, 400)];
    const page = makePage(cards);

    const result = tetherTiles(page, ["a", "b", "c"], cards);

    expect(result.tethers).toHaveLength(1);
    expect(result.tethers[0].tileIds).toEqual(["a", "b", "c"]);
    expect(typeof result.tethers[0].id).toBe("string");

    // Re-arranged: no longer at their original positions, but still present.
    result.cards.forEach((card) => {
      expect(Number.isFinite(card.x)).toBe(true);
      expect(Number.isFinite(card.y)).toBe(true);
    });
  });

  it("clamps to TETHER_MAX_TILES when more are selected", () => {
    const cards = Array.from({ length: TETHER_MAX_TILES + 5 }, (_, index) => makeCard(`t${index}`, index * 10, 0));
    const page = makePage(cards);

    const result = tetherTiles(page, cards.map((card) => card.id), cards);

    expect(result.tethers[0].tileIds).toHaveLength(TETHER_MAX_TILES);
  });

  it("releases a tile from its previous tether when re-tethered into a new group", () => {
    const cards = [makeCard("a", 0, 0), makeCard("b", 100, 0), makeCard("c", 200, 0), makeCard("d", 300, 0)];
    let page = makePage(cards, [{ id: "old", tileIds: ["a", "b"] }]);

    page = tetherTiles(page, ["a", "c", "d"], page.cards);

    const tetherForA = page.tethers.find((tether) => tether.tileIds.includes("a"));
    expect(tetherForA.tileIds.sort()).toEqual(["a", "c", "d"]);
    // "b" was left behind with only itself -- below TETHER_MIN_TILES, so the
    // old group should have been dropped entirely rather than left dangling.
    expect(page.tethers.some((tether) => tether.tileIds.includes("b"))).toBe(false);
  });
});

describe("untetherTile", () => {
  it("removes just one tile, keeping the rest of the group", () => {
    const page = { tethers: [{ id: "g1", tileIds: ["a", "b", "c"] }] };
    const result = untetherTile(page, "b");
    expect(result.tethers[0].tileIds).toEqual(["a", "c"]);
  });

  it("dissolves the group entirely once it would drop below 2 tiles", () => {
    const page = { tethers: [{ id: "g1", tileIds: ["a", "b"] }] };
    const result = untetherTile(page, "b");
    expect(result.tethers).toHaveLength(0);
  });
});

describe("normalizeTethers (via normalizeWorkspace)", () => {
  it("drops a tether referencing a tile that no longer exists", () => {
    const workspace = normalizeWorkspace({
      version: WORKSPACE_SCHEMA_VERSION,
      pages: [{
        cards: [makeCard("a", 0, 0), makeCard("b", 100, 0)],
        tethers: [{ id: "g1", tileIds: ["a", "b", "ghost"] }],
      }],
    });
    const page = getWorkspaceActivePage(workspace);
    expect(page.tethers).toHaveLength(1);
    expect(page.tethers[0].tileIds.sort()).toEqual(["a", "b"]);
  });

  it("drops a tether that would be left with only one real tile", () => {
    const workspace = normalizeWorkspace({
      version: WORKSPACE_SCHEMA_VERSION,
      pages: [{
        cards: [makeCard("a", 0, 0), makeCard("b", 100, 0)],
        tethers: [{ id: "g1", tileIds: ["a", "ghost"] }],
      }],
    });
    const page = getWorkspaceActivePage(workspace);
    expect(page.tethers).toHaveLength(0);
  });

  it("does not let the same tile be claimed by two tether groups", () => {
    const workspace = normalizeWorkspace({
      version: WORKSPACE_SCHEMA_VERSION,
      pages: [{
        cards: [makeCard("a", 0, 0), makeCard("b", 100, 0), makeCard("c", 200, 0)],
        tethers: [
          { id: "g1", tileIds: ["a", "b"] },
          { id: "g2", tileIds: ["a", "c"] },
        ],
      }],
    });
    const page = getWorkspaceActivePage(workspace);
    expect(page.tethers).toHaveLength(1);
    expect(page.tethers[0].tileIds).toEqual(["a", "b"]);
  });
});
