import { describe, expect, it } from "vitest";
import {
  WORKSPACE_SCHEMA_VERSION,
  createEmptyWorkspace,
  normalizeWorkspace,
} from "@/lib/workspace.js";

describe("normalizeWorkspace / migrateWorkspace", () => {
  it("stamps a brand new workspace at the current schema version", () => {
    const empty = createEmptyWorkspace();
    expect(empty.version).toBe(WORKSPACE_SCHEMA_VERSION);

    const normalized = normalizeWorkspace(undefined);
    expect(normalized.version).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(normalized.pages).toHaveLength(1);
    expect(normalized.cards).toEqual([]);
  });

  it("migrates a legacy v1 flat-cards workspace up to the page-based v9+ shape", () => {
    const legacy = {
      version: 1,
      name: "Old Dome",
      viewport: { x: 10, y: 20, zoom: 1 },
      cards: [
        {
          id: "card-1",
          type: "link",
          url: "https://example.com",
          title: "Example",
          x: 10,
          y: 10,
          width: 320,
          height: 240,
        },
      ],
    };

    const normalized = normalizeWorkspace(legacy);

    expect(normalized.version).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(normalized.pages).toHaveLength(1);
    expect(normalized.cards).toHaveLength(1);
    expect(normalized.cards[0]).toMatchObject({ id: "card-1", type: "link", url: "https://example.com" });
  });

  it("round trips an already-current workspace without data loss", () => {
    const current = normalizeWorkspace({
      version: WORKSPACE_SCHEMA_VERSION,
      name: "Current Dome",
      activePageId: "page-1",
      pages: [
        {
          id: "page-1",
          name: "Page 1",
          viewport: { x: 0, y: 0, zoom: 1 },
          cards: [{ id: "card-1", type: "canvas-text", text: "hello", x: 0, y: 0, width: 200, height: 100 }],
          drawings: { version: 1, objects: [] },
          edges: [],
          groups: [],
          view: null,
        },
      ],
    });

    const renormalized = normalizeWorkspace(current);
    expect(renormalized).toEqual(current);
  });

  it(
    "documents the known v13-v17 migration gap: a workspace stuck at v12 is stamped " +
      "to the current version with no explicit transform applied (see rewrite plan Phase 1B)",
    () => {
      const v12Workspace = {
        version: 12,
        name: "Pre-gap Dome",
        activePageId: "page-1",
        pages: [
          {
            id: "page-1",
            name: "Page 1",
            viewport: { x: 0, y: 0, zoom: 1 },
            cards: [{ id: "card-1", type: "canvas-text", text: "hello", x: 0, y: 0, width: 200, height: 100 }],
            drawings: { version: 1, objects: [] },
            edges: [],
            groups: [],
            view: null,
          },
        ],
      };

      const normalized = normalizeWorkspace(v12Workspace);

      // This is a CHARACTERIZATION test, not an endorsement: it locks in
      // today's behavior (version is forced to WORKSPACE_SCHEMA_VERSION purely
      // by normalizer defaults) so that Phase 1B's explicit v13->17 migration
      // steps have a clear "before" baseline to change. If this test starts
      // failing because migrateWorkspace now has real v13-17 branches, that is
      // expected -- update this test to assert the new explicit transform
      // instead of deleting it.
      expect(normalized.version).toBe(WORKSPACE_SCHEMA_VERSION);
      expect(normalized.cards).toHaveLength(1);
    },
  );
});
