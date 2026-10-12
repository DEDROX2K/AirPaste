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

  it("drops edges with a missing endpoint instead of emitting a dangling edge", () => {
    const original = buildWorkspaceDocument();
    original.pages[0].edges[0].toNode = "";

    const serialized = serializeJsonCanvasDocument(original);
    expect(serialized.edges).toHaveLength(0);
  });
});
