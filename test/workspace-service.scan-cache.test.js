// scanWorkspace() is called on nearly every home navigation and canvas open.
// It used to re-parse every canvas file's full JSON content on every single
// call. This verifies the per-root cache actually reuses the prior parsed
// item (by object identity) when a canvas file hasn't changed, and discards
// it the moment the file does change or disappears.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import workspaceService from "../workspace-service.js";

const { createCanvas, saveCanvas, scanWorkspace } = workspaceService;

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-scan-cache-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function findCanvasEntry(scan, filePath) {
  return scan.items.find((item) => path.join(root, item.path) === filePath);
}

describe("scanWorkspace canvas parse cache", () => {
  it("returns the exact same parsed item object when the canvas file hasn't changed", async () => {
    const created = await createCanvas(root, "Cached Canvas");

    const first = await scanWorkspace(root);
    const second = await scanWorkspace(root);

    const firstItem = findCanvasEntry(first, created.filePath);
    const secondItem = findCanvasEntry(second, created.filePath);

    expect(firstItem).toBeTruthy();
    // Object identity, not just equal content: this only holds if the
    // second scan reused the cached parse instead of re-reading and
    // re-parsing the file from disk.
    expect(secondItem).toBe(firstItem);
  });

  it("re-parses and returns a fresh item after the file is saved again", async () => {
    const created = await createCanvas(root, "Original Name");
    const before = findCanvasEntry(await scanWorkspace(root), created.filePath);

    await saveCanvas(created.filePath, { name: "Updated Name" });

    const after = findCanvasEntry(await scanWorkspace(root), created.filePath);
    expect(after).not.toBe(before);
    expect(after.name).toBe("Updated Name");
  });

  it("drops a deleted canvas from later scans instead of serving a stale cached entry", async () => {
    const created = await createCanvas(root, "Temporary Canvas");
    expect(findCanvasEntry(await scanWorkspace(root), created.filePath)).toBeTruthy();

    await fs.rm(created.filePath, { force: true });

    const after = await scanWorkspace(root);
    expect(findCanvasEntry(after, created.filePath)).toBeUndefined();
  });
});
