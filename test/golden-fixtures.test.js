import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import workspaceService from "../workspace-service.js";
import { normalizeWorkspace, WORKSPACE_SCHEMA_VERSION as RENDERER_WORKSPACE_SCHEMA_VERSION } from "@/lib/workspace.js";
import workspaceSchema from "../shared/workspace-schema.json";

const { WORKSPACE_SCHEMA_VERSION } = workspaceSchema;
const { createDome, loadCanvas, saveCanvas } = workspaceService;

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "workspace-versions");

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-golden-fixtures-"));
  await createDome(root);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function copyFixtureIntoDome(fixtureName) {
  const destPath = path.join(root, fixtureName);
  await fs.copyFile(path.join(FIXTURES_DIR, fixtureName), destPath);
  return destPath;
}

describe("golden fixtures (real on-disk data from committed QA domes)", () => {
  it("loads and renormalizes a real v2 legacy flat-cards file without throwing or losing data", async () => {
    const destPath = await copyFixtureIntoDome("v2-legacy-flat-cards.airpaste.json");

    const loaded = await loadCanvas(destPath);
    expect(loaded.workspace.version).toBe(2);

    const normalized = normalizeWorkspace(loaded.workspace);
    expect(normalized.version).toBe(RENDERER_WORKSPACE_SCHEMA_VERSION);
    expect(normalized.pages).toHaveLength(1);
    expect(Array.isArray(normalized.cards)).toBe(true);

    // Saving it back through the real save path must advance the on-disk
    // version to current (this is exactly the bug fixed in Phase 1A).
    await saveCanvas(destPath, { pages: normalized.pages, activePageId: normalized.activePageId });
    const reloaded = await loadCanvas(destPath);
    expect(reloaded.workspace.version).toBe(WORKSPACE_SCHEMA_VERSION);
  });

  it("loads and renormalizes a real v9 JSON Canvas file with a populated text-box tile", async () => {
    const destPath = await copyFixtureIntoDome("v9-json-canvas-text-box.canvas");

    const loaded = await loadCanvas(destPath);
    expect(loaded.workspace.version).toBe(9);
    expect(loaded.workspace.pages[0].tiles).toHaveLength(1);

    const normalized = normalizeWorkspace(loaded.workspace);
    expect(normalized.version).toBe(RENDERER_WORKSPACE_SCHEMA_VERSION);
    expect(normalized.cards).toHaveLength(1);

    // The real persisted tile content (including nested style fields) must
    // survive the full load -> migrate -> normalize pipeline. Note: "text-box"
    // is intentionally consolidated into "canvas-text" by getCardType() (see
    // lib/workspace.js) as part of the note/text-box tile family merge -- this
    // is expected normalization, not data loss.
    expect(normalized.cards[0]).toMatchObject({
      id: "tile-1",
      type: "canvas-text",
      text: "Saved edit",
      style: expect.objectContaining({ preset: "simple", fontSize: 24, color: "#111111" }),
    });

    await saveCanvas(destPath, { pages: normalized.pages, activePageId: normalized.activePageId });
    const reloaded = await loadCanvas(destPath);
    expect(reloaded.workspace.version).toBe(WORKSPACE_SCHEMA_VERSION);

    const rawAfterSave = JSON.parse(await fs.readFile(destPath, "utf8"));
    expect(rawAfterSave.airpaste.workspaceVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(rawAfterSave.nodes[0].airpaste.card.text).toBe("Saved edit");
  });
});
