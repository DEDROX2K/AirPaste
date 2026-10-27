// A pan or zoom only changes a page's viewport, but pages carry every tile --
// embedded base64 images included -- so autosave sends just
// { pageViewports } for those changes instead of resending every page. These
// tests pin down both halves: the renderer only takes that path when nothing
// but viewports changed, and the main process patches viewports onto the
// pages on disk without losing any tiles.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import workspaceService from "../workspace-service.js";
import { getViewportOnlyPageChanges } from "@/lib/workspace.js";

const { createCanvas, saveCanvas, loadCanvas } = workspaceService;

describe("getViewportOnlyPageChanges", () => {
  const tiles = [{ id: "card-1" }];
  const pageOne = { id: "page-1", name: "Page 1", viewport: { x: 0, y: 0, zoom: 1 }, cards: tiles };
  const pageTwo = { id: "page-2", name: "Page 2", viewport: { x: 0, y: 0, zoom: 1 }, cards: [] };

  it("returns the changed viewports when only viewports differ", () => {
    const panned = { ...pageOne, viewport: { x: 40, y: -12, zoom: 0.5 } };

    expect(getViewportOnlyPageChanges([pageOne, pageTwo], [panned, pageTwo])).toEqual({
      "page-1": { x: 40, y: -12, zoom: 0.5 },
    });
  });

  it("returns null when anything besides a viewport changed", () => {
    const movedTile = { ...pageOne, viewport: { x: 40, y: 0, zoom: 1 }, cards: [{ id: "card-1", x: 5 }] };
    const renamed = { ...pageOne, name: "Renamed" };

    expect(getViewportOnlyPageChanges([pageOne, pageTwo], [movedTile, pageTwo])).toBeNull();
    expect(getViewportOnlyPageChanges([pageOne, pageTwo], [renamed, pageTwo])).toBeNull();
  });

  it("returns null when pages were added, removed, or reordered", () => {
    expect(getViewportOnlyPageChanges([pageOne], [pageOne, pageTwo])).toBeNull();
    expect(getViewportOnlyPageChanges([pageOne, pageTwo], [pageTwo, pageOne])).toBeNull();
  });

  it("returns null when nothing changed or there is no saved baseline", () => {
    expect(getViewportOnlyPageChanges([pageOne], [pageOne])).toBeNull();
    expect(getViewportOnlyPageChanges(undefined, [pageOne])).toBeNull();
  });
});

describe("saveCanvas with pageViewports", () => {
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-viewport-save-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("updates only the viewport of the named page and keeps every tile", async () => {
    const created = await createCanvas(root, "Viewport Canvas");
    const canvasPath = created.filePath;
    const pageOne = created.workspace.pages[0];
    const pageTwo = {
      id: "page-2",
      name: "Page 2",
      viewport: { x: 0, y: 0, zoom: 1 },
      drawings: { version: 1, objects: [] },
      view: null,
      cards: [{ id: "card-1", type: "canvas-text", text: "Keep me", x: 10, y: 10, width: 200, height: 100 }],
      groups: [],
      edges: [],
    };

    await saveCanvas(canvasPath, { pages: [pageOne, pageTwo], activePageId: "page-2" });
    await saveCanvas(canvasPath, { pageViewports: { "page-2": { x: 120, y: -40, zoom: 0.75 } } }, {
      partial: true,
      returnWorkspace: false,
      changedKeys: ["pageViewports"],
    });

    const reopened = await loadCanvas(canvasPath);
    const recoveredPageOne = reopened.workspace.pages.find((page) => page.id === "page-1");
    const recoveredPageTwo = reopened.workspace.pages.find((page) => page.id === "page-2");

    expect(reopened.workspace.pages).toHaveLength(2);
    expect(recoveredPageTwo.viewport).toEqual({ x: 120, y: -40, zoom: 0.75 });
    expect(recoveredPageOne.viewport).toEqual(pageOne.viewport);
    expect(recoveredPageTwo.tiles ?? recoveredPageTwo.cards).toContainEqual(
      expect.objectContaining({ id: "card-1", text: "Keep me" }),
    );
  });
});
