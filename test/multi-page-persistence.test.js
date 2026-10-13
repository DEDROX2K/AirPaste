// End-to-end regression test for a real, reported data-loss bug: create a
// canvas, add a second page, edit it, close the app, reopen -- the second
// page (and its contents) was silently and permanently gone. This exercises
// the real createCanvas/saveCanvas/loadCanvas IPC-layer functions (not just
// the json-canvas.js serialization unit covered by test/json-canvas.test.js)
// against a real temp dome on disk, to confirm the fix holds all the way
// through the actual save/load path the app uses.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import workspaceService from "../workspace-service.js";

const { createCanvas, saveCanvas, loadCanvas } = workspaceService;

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-multipage-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("multi-page canvas persistence (regression)", () => {
  it("keeps a second page after creating it, editing it, and reopening the file", async () => {
    const created = await createCanvas(root, "Test Canvas");
    const canvasPath = created.filePath;

    // Simulate the app creating a second page and editing a tile on it, then
    // saving (AppProvider sends the full current `pages` array once the
    // `pages` field is dirty -- see buildCanvasSavePayload).
    const pageOne = created.workspace.pages[0];
    const pageTwo = {
      id: "page-2",
      name: "Page 2",
      viewport: { x: 0, y: 0, zoom: 1 },
      drawings: { version: 1, objects: [] },
      view: null,
      cards: [
        { id: "card-1", type: "canvas-text", text: "Important notes", x: 10, y: 10, width: 200, height: 100 },
      ],
      groups: [],
      edges: [],
    };

    await saveCanvas(canvasPath, {
      pages: [pageOne, pageTwo],
      activePageId: "page-2",
    });

    // "Close and reopen."
    const reopened = await loadCanvas(canvasPath);
    expect(reopened.workspace.pages).toHaveLength(2);
    expect(reopened.workspace.activePageId).toBe("page-2");

    const recoveredPageTwo = reopened.workspace.pages.find((page) => page.id === "page-2");
    expect(recoveredPageTwo).toBeTruthy();
    const recoveredTiles = recoveredPageTwo.tiles ?? recoveredPageTwo.cards;
    expect(recoveredTiles).toContainEqual(
      expect.objectContaining({ id: "card-1", text: "Important notes" }),
    );
  });

  it("keeps the second page even after switching back to page 1 and saving again", async () => {
    const created = await createCanvas(root, "Test Canvas");
    const canvasPath = created.filePath;
    const pageOne = created.workspace.pages[0];
    const pageTwo = {
      id: "page-2",
      name: "Page 2",
      viewport: { x: 0, y: 0, zoom: 1 },
      drawings: { version: 1, objects: [] },
      view: null,
      cards: [{ id: "card-1", type: "canvas-text", text: "Important notes", x: 10, y: 10, width: 200, height: 100 }],
      groups: [],
      edges: [],
    };

    await saveCanvas(canvasPath, { pages: [pageOne, pageTwo], activePageId: "page-2" });
    const afterFirstSave = await loadCanvas(canvasPath);

    // Switch the active page back to page 1 -- an entirely ordinary action --
    // and save again. This is the exact step that used to erase page 2.
    await saveCanvas(canvasPath, {
      pages: afterFirstSave.workspace.pages,
      activePageId: "page-1",
    });

    const final = await loadCanvas(canvasPath);
    expect(final.workspace.pages.map((page) => page.id).sort()).toEqual(["page-1", "page-2"]);
  });
});
