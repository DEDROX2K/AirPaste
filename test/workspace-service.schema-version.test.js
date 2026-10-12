import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import workspaceService from "../workspace-service.js";
import workspaceSchema from "../shared/workspace-schema.json";

const { WORKSPACE_SCHEMA_VERSION } = workspaceSchema;
const { createCanvas, saveCanvas, loadCanvas } = workspaceService;

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-schema-version-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("workspace schema version is kept current on disk", () => {
  it("stamps a brand new canvas with the current schema version, not a stale default", async () => {
    const created = await createCanvas(root, "Test Canvas");

    expect(created.workspace.version).toBe(WORKSPACE_SCHEMA_VERSION);

    const raw = JSON.parse(await fs.readFile(created.filePath, "utf8"));
    expect(raw.airpaste.workspaceVersion).toBe(WORKSPACE_SCHEMA_VERSION);
  });

  it(
    "advances a stale on-disk version to current on save, even for a partial save that " +
      "doesn't include `version` in its payload (the actual autosave shape the renderer sends)",
    async () => {
      const created = await createCanvas(root, "Test Canvas");

      // Simulate an old file that was last saved under a much older schema
      // version, as any canvas created before this fix would have been
      // (saveCanvas used to always re-write a stale/frozen version number).
      const stalePath = created.filePath;
      const staleRaw = JSON.parse(await fs.readFile(stalePath, "utf8"));
      staleRaw.airpaste.workspaceVersion = 9;
      await fs.writeFile(stalePath, JSON.stringify(staleRaw, null, 2));

      // A realistic partial autosave: only `name` changed, `version` is not
      // part of the payload at all (see AppProvider.jsx's buildCanvasSavePayload,
      // which only ever includes dirty fields -- never `version`).
      await saveCanvas(stalePath, { name: "Renamed Canvas" });

      const reloaded = await loadCanvas(stalePath);
      expect(reloaded.workspace.version).toBe(WORKSPACE_SCHEMA_VERSION);

      const rawAfterSave = JSON.parse(await fs.readFile(stalePath, "utf8"));
      expect(rawAfterSave.airpaste.workspaceVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    },
  );

  it("never regresses the on-disk version even across many incremental saves", async () => {
    const created = await createCanvas(root, "Test Canvas");

    for (let i = 0; i < 5; i += 1) {
      await saveCanvas(created.filePath, { name: `Renamed ${i}` });
    }

    const raw = JSON.parse(await fs.readFile(created.filePath, "utf8"));
    expect(raw.airpaste.workspaceVersion).toBe(WORKSPACE_SCHEMA_VERSION);
  });
});
