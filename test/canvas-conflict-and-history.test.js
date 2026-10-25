// Covers the two data-safety features added alongside the Dome sync-race
// fix: saveCanvas refusing to blindly overwrite a canvas that changed on
// disk since the caller last synced with it (CANVAS_CONFLICT), and the
// automatic version-history snapshots saveCanvas/restoreCanvasHistoryEntry
// keep so an overwrite (conflict or otherwise) is never a one-way door.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import workspaceService from "../workspace-service.js";

const { createCanvas, saveCanvas, loadCanvas, listCanvasHistory, restoreCanvasHistoryEntry } = workspaceService;

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-conflict-history-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("saveCanvas conflict detection", () => {
  it("saves normally when no expectedUpdatedAt is given (back-compat / first save)", async () => {
    const created = await createCanvas(root, "Test Canvas");
    await expect(saveCanvas(created.filePath, { name: "Renamed" })).resolves.toBeTruthy();
  });

  it("saves normally when expectedUpdatedAt matches the file's actual on-disk state", async () => {
    const created = await createCanvas(root, "Test Canvas");
    const loaded = await loadCanvas(created.filePath);
    await expect(
      saveCanvas(created.filePath, { name: "Renamed" }, { expectedUpdatedAt: loaded.updatedAt }),
    ).resolves.toBeTruthy();
  });

  it("refuses to save when the file changed on disk since expectedUpdatedAt, instead of silently overwriting", async () => {
    const created = await createCanvas(root, "Test Canvas");
    const loaded = await loadCanvas(created.filePath);

    // Simulate another PC's edit (or a cloud sync pulling one in) landing on
    // this file after this session loaded it but before it saves.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await saveCanvas(created.filePath, { name: "Changed Elsewhere" });

    let caught = null;
    try {
      await saveCanvas(created.filePath, { name: "My Local Edit" }, { expectedUpdatedAt: loaded.updatedAt });
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(caught.code).toBe("CANVAS_CONFLICT");
    expect(typeof caught.updatedAt).toBe("string");

    // Most importantly: the "elsewhere" edit must still be intact on disk.
    const stillOnDisk = await loadCanvas(created.filePath);
    expect(stillOnDisk.name).toBe("Changed Elsewhere");
  });

  it("lets the caller override a conflict by re-sending the conflict's reported updatedAt", async () => {
    const created = await createCanvas(root, "Test Canvas");
    const loaded = await loadCanvas(created.filePath);
    await saveCanvas(created.filePath, { name: "Changed Elsewhere" });

    let conflict = null;
    try {
      await saveCanvas(created.filePath, { name: "My Local Edit" }, { expectedUpdatedAt: loaded.updatedAt });
    } catch (error) {
      conflict = error;
    }
    expect(conflict?.code).toBe("CANVAS_CONFLICT");

    // The override: retry using the conflict's own updatedAt as the new
    // baseline, exactly as AppProvider.jsx's resolveCanvasConflictKeepMine does.
    await saveCanvas(created.filePath, { name: "My Local Edit" }, {
      expectedUpdatedAt: conflict.updatedAt,
      forceHistorySnapshot: true,
    });

    const final = await loadCanvas(created.filePath);
    expect(final.name).toBe("My Local Edit");
  });
});

describe("canvas version history", () => {
  it("snapshots on the very first save, then throttles rapid subsequent saves", async () => {
    const created = await createCanvas(root, "Test Canvas");

    await saveCanvas(created.filePath, { name: "Edit 1" });
    const afterFirst = await listCanvasHistory(created.filePath);
    expect(afterFirst.length).toBe(1); // nothing was snapshotted before, so the first save always checkpoints

    await saveCanvas(created.filePath, { name: "Edit 2" });
    const afterSecond = await listCanvasHistory(created.filePath);
    expect(afterSecond.length).toBe(1); // too soon since the last snapshot -- throttled
  });

  it("always snapshots on a forced write, even within the throttle window", async () => {
    const created = await createCanvas(root, "Test Canvas");
    await saveCanvas(created.filePath, { name: "Edit 1" });
    await saveCanvas(created.filePath, { name: "Edit 2" }, { forceHistorySnapshot: true });
    const history = await listCanvasHistory(created.filePath);
    expect(history.length).toBe(2);
  });

  it("restoring a version brings back its content and itself snapshots what it replaced", async () => {
    const created = await createCanvas(root, "Test Canvas");

    await saveCanvas(created.filePath, { name: "Version A" }, { forceHistorySnapshot: true });
    const afterA = await listCanvasHistory(created.filePath);
    expect(afterA.length).toBe(1); // snapshot of the pristine "Test Canvas" state, taken before writing "Version A"

    await saveCanvas(created.filePath, { name: "Version B" }, { forceHistorySnapshot: true });
    const afterB = await listCanvasHistory(created.filePath);
    expect(afterB.length).toBe(2); // + snapshot of "Version A", taken before writing "Version B"

    // Restore the oldest entry (the pristine pre-"Version A" state).
    const oldestEntry = afterB[afterB.length - 1];
    const restored = await restoreCanvasHistoryEntry(created.filePath, oldestEntry.id);
    expect(restored.name).toBe("Test Canvas");

    // "Version B" (what the restore just overwrote) must itself now be
    // recoverable -- restoring is never a one-way door.
    const afterRestore = await listCanvasHistory(created.filePath);
    expect(afterRestore.length).toBe(3);

    const current = await loadCanvas(created.filePath);
    expect(current.name).toBe("Test Canvas");
  });

  it("prunes history beyond the retention cap", async () => {
    const created = await createCanvas(root, "Test Canvas");
    for (let i = 0; i < 25; i += 1) {
      await saveCanvas(created.filePath, { name: `Edit ${i}` }, { forceHistorySnapshot: true });
    }
    const history = await listCanvasHistory(created.filePath);
    expect(history.length).toBe(20);
  });

  it("rejects a restore entry id that tries to escape the history directory", async () => {
    const created = await createCanvas(root, "Test Canvas");
    await saveCanvas(created.filePath, { name: "Version A" }, { forceHistorySnapshot: true });
    await expect(
      restoreCanvasHistoryEntry(created.filePath, "../../../../etc/passwd"),
    ).rejects.toThrow();
  });
});
