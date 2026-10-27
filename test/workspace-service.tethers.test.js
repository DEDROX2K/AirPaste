// Regression: tethers were dropped by the main process on every save (its
// page normalizer only kept tiles, drawings, edges, groups...), so they
// vanished the next time the file was opened.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import workspaceService from "../workspace-service.js";

const { createCanvas, saveCanvas, loadCanvas } = workspaceService;

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-tethers-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("tethers on disk", () => {
  it("survive save -> close -> load, as the renderer's autosave sends them", async () => {
    const created = await createCanvas(root, "Test Canvas");
    const page = created.workspace.pages[0];
    const tiles = [
      { id: "a", type: "text", text: "A", x: 0, y: 0, width: 150, height: 150 },
      { id: "b", type: "text", text: "B", x: 400, y: 0, width: 150, height: 150 },
    ];

    await saveCanvas(created.filePath, {
      pages: [{ ...page, cards: tiles, tethers: [{ id: "t1", a: "a", b: "b" }] }],
    }, { partial: true, changedKeys: ["pages"] });

    const loaded = await loadCanvas(created.filePath);
    expect(loaded.workspace.pages[0].tethers).toEqual([{ id: "t1", a: "a", b: "b" }]);
  });
});
