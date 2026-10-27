import { describe, expect, it } from "vitest";
import {
  parseJsonCanvasDocument,
  serializeJsonCanvasDocument,
} from "../json-canvas.js";

function buildWorkspaceDocument() {
  return {
    id: "page-1",
    name: "My Dome",
    version: 17,
    activePageId: "page-1",
    airpaste: { pageOrder: ["page-1"] },
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        viewport: { x: 42, y: 7, zoom: 1.5 },
        drawings: { version: 1, objects: [{ id: "stroke-1", points: [0, 0, 10, 10] }] },
        view: null,
        tiles: [
          {
            id: "card-link-1",
            type: "link",
            url: "https://example.com/article",
            title: "Example Article",
            siteName: "example.com",
            status: "ready",
            customAirpasteOnlyField: "preserve-me",
            x: 100,
            y: 150,
            width: 340,
            height: 280,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            airpaste: null,
          },
        ],
        groups: [
          {
            id: "group-1",
            label: "My Group",
            color: "#ff0000",
            x: 0,
            y: 0,
            width: 480,
            height: 320,
            airpaste: null,
          },
        ],
        edges: [
          {
            id: "edge-1",
            fromNode: "card-link-1",
            fromSide: "right",
            toNode: "group-1",
            toSide: "left",
            label: "relates to",
            color: "",
            airpaste: null,
          },
        ],
      },
    ],
  };
}

describe("json-canvas round trip", () => {
  it("preserves tile, group, and edge data through serialize -> parse", () => {
    const original = buildWorkspaceDocument();

    const serialized = serializeJsonCanvasDocument(original);
    expect(serialized.nodes).toHaveLength(2);
    expect(serialized.edges).toHaveLength(1);

    const parsed = parseJsonCanvasDocument(serialized, "fallback");
    const page = parsed.pages[0];

    expect(parsed.version).toBe(17);
    expect(page.tiles).toHaveLength(1);
    expect(page.tiles[0]).toMatchObject({
      id: "card-link-1",
      type: "link",
      url: "https://example.com/article",
      title: "Example Article",
      customAirpasteOnlyField: "preserve-me",
      x: 100,
      y: 150,
      width: 340,
      height: 280,
    });

    expect(page.groups).toHaveLength(1);
    expect(page.groups[0]).toMatchObject({
      id: "group-1",
      label: "My Group",
      color: "#ff0000",
    });

    expect(page.edges).toHaveLength(1);
    expect(page.edges[0]).toMatchObject({
      id: "edge-1",
      fromNode: "card-link-1",
      toNode: "group-1",
      label: "relates to",
    });

    expect(page.viewport).toEqual({ x: 42, y: 7, zoom: 1.5 });
    expect(page.drawings.objects).toHaveLength(1);
  });

  it("is idempotent across a second round trip", () => {
    const original = buildWorkspaceDocument();
    const firstParse = parseJsonCanvasDocument(serializeJsonCanvasDocument(original));
    const secondParse = parseJsonCanvasDocument(serializeJsonCanvasDocument({
      ...firstParse,
      pages: firstParse.pages,
    }));

    expect(secondParse.pages[0].tiles[0]).toMatchObject({
      id: "card-link-1",
      url: "https://example.com/article",
      customAirpasteOnlyField: "preserve-me",
    });
  });

  it("keeps tethers through save -> load (regression: they were dropped on save)", () => {
    const original = buildWorkspaceDocument();
    original.pages[0].tethers = [{ id: "t1", a: "card-link-1", b: "card-2" }];

    const parsed = parseJsonCanvasDocument(serializeJsonCanvasDocument(original));
    expect(parsed.pages[0].tethers).toEqual([{ id: "t1", a: "card-link-1", b: "card-2" }]);
    expect(parsed.airpaste?.tethers).toBeUndefined();
  });

  it("drops edges with a missing endpoint instead of emitting a dangling edge", () => {
    const original = buildWorkspaceDocument();
    original.pages[0].edges[0].toNode = "";

    const serialized = serializeJsonCanvasDocument(original);
    expect(serialized.edges).toHaveLength(0);
  });
});

describe("json-canvas multi-page round trip (regression: a second page used to be " +
  "silently discarded on the very next save, unrecoverable after closing the app)", () => {
  function buildTwoPageWorkspace(activePageId = "page-2") {
    const original = buildWorkspaceDocument();
    const pageTwo = {
      id: "page-2",
      name: "Page 2",
      viewport: { x: 0, y: 0, zoom: 1 },
      drawings: { version: 1, objects: [] },
      view: null,
      cards: [
        {
          id: "card-note-1",
          type: "canvas-text",
          text: "Notes on page two",
          x: 10,
          y: 10,
          width: 200,
          height: 100,
          airpaste: null,
        },
      ],
      groups: [],
      edges: [],
    };

    return {
      ...original,
      activePageId,
      pages: [...original.pages, pageTwo],
    };
  }

  it("keeps the second page after a single save -> load cycle, whichever page is active", () => {
    const withPageTwoActive = buildTwoPageWorkspace("page-2");

    const serialized = serializeJsonCanvasDocument(withPageTwoActive);
    const parsed = parseJsonCanvasDocument(serialized);

    expect(parsed.pages).toHaveLength(2);
    expect(parsed.activePageId).toBe("page-2");

    const pageOne = parsed.pages.find((page) => page.id === "page-1");
    const pageTwo = parsed.pages.find((page) => page.id === "page-2");
    expect(pageOne.tiles[0]).toMatchObject({ id: "card-link-1" });
    expect(pageTwo.tiles[0] ?? pageTwo.cards?.[0]).toMatchObject({ id: "card-note-1", text: "Notes on page two" });
  });

  it(
    "survives the exact reported scenario: create page 2, edit it, close (save with page 2 " +
      "active), reopen, switch back to page 1, save again, reopen once more",
    () => {
      const afterCreatingAndEditingPageTwo = buildTwoPageWorkspace("page-2");

      // "Close and reopen" -- one save/load cycle while page 2 is still active.
      const afterFirstReopen = parseJsonCanvasDocument(
        serializeJsonCanvasDocument(afterCreatingAndEditingPageTwo),
      );
      expect(afterFirstReopen.pages.map((page) => page.id).sort()).toEqual(["page-1", "page-2"]);

      // Switch the active page back to page 1 (a very ordinary thing to do)
      // and save again -- this is exactly the step that used to make page 2
      // vanish, because the old serializer only ever wrote the *active*
      // page's content into nodes/edges and had nowhere else to put the rest.
      const withPageOneActive = { ...afterFirstReopen, activePageId: "page-1" };
      const afterSecondReopen = parseJsonCanvasDocument(
        serializeJsonCanvasDocument(withPageOneActive),
      );

      expect(afterSecondReopen.pages.map((page) => page.id).sort()).toEqual(["page-1", "page-2"]);
      const recoveredPageTwo = afterSecondReopen.pages.find((page) => page.id === "page-2");
      expect(recoveredPageTwo.cards ?? recoveredPageTwo.tiles).toContainEqual(
        expect.objectContaining({ id: "card-note-1", text: "Notes on page two" }),
      );
    },
  );

  it("still loads a genuinely old single-page file with no airpaste.pages stash at all", () => {
    const legacySingleActivePage = buildWorkspaceDocument();
    const serialized = serializeJsonCanvasDocument(legacySingleActivePage);
    delete serialized.airpaste.pages; // simulate a file saved before this fix existed

    const parsed = parseJsonCanvasDocument(serialized);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0].tiles[0]).toMatchObject({ id: "card-link-1" });
  });

  it("always rebuilds the active page from nodes/edges, never from its own entry in the stash", () => {
    const withPageTwoActive = buildTwoPageWorkspace("page-2");
    const serialized = serializeJsonCanvasDocument(withPageTwoActive);

    // Make the active page's entry in the airpaste.pages stash stale/wrong,
    // the way it would be if an external tool (or a future bug) only ever
    // updated nodes/edges without keeping the stash in sync. The active
    // page's reconstruction must still come from nodes/edges, exactly as it
    // did before this fix -- the stash is only ever consulted for pages that
    // have no representation in nodes/edges at all.
    serialized.airpaste.pages = serialized.airpaste.pages.map((page) => (
      page.id === "page-2" ? { ...page, cards: [{ id: "card-note-1", type: "canvas-text", text: "STALE" }] } : page
    ));

    const parsed = parseJsonCanvasDocument(serialized);
    const activePage = parsed.pages.find((page) => page.id === parsed.activePageId);
    expect(activePage.tiles[0].text).toBe("Notes on page two");
  });

  it(
    "preserves page order (user-controlled via reorderCanvasPages) across a save/load cycle, " +
      "regardless of which page happens to be active",
    () => {
      const withThreePages = buildTwoPageWorkspace("page-1");
      const pageThree = {
        id: "page-3",
        name: "Page 3",
        viewport: { x: 0, y: 0, zoom: 1 },
        drawings: { version: 1, objects: [] },
        view: null,
        cards: [],
        groups: [],
        edges: [],
      };
      // User-reordered: page-3, page-1, page-2 -- deliberately not the order
      // they were created in, and not "active page first" either.
      withThreePages.pages = [pageThree, withThreePages.pages[0], withThreePages.pages[1]];
      withThreePages.activePageId = "page-2";

      const parsed = parseJsonCanvasDocument(serializeJsonCanvasDocument(withThreePages));

      expect(parsed.pages.map((page) => page.id)).toEqual(["page-3", "page-1", "page-2"]);
    },
  );
});
