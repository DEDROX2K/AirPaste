import { describe, expect, it, vi } from "vitest";
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
    "migrates a v12 workspace all the way to current through explicit v13-17 branches, " +
      "not just a forced version stamp (regression test for the former v13-17 gap, Phase 1B)",
    () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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

      expect(normalized.version).toBe(WORKSPACE_SCHEMA_VERSION);
      expect(normalized.cards).toHaveLength(1);

      // migrateWorkspace logs a dev warning if its explicit ladder doesn't
      // reach WORKSPACE_SCHEMA_VERSION on its own (see the gap it's guarding
      // against above). Asserting this was never called proves the v13-17
      // branches actually ran, rather than the version merely being forced
      // by normalizeWorkspace's own stamping regardless of what migrateWorkspace
      // returned -- which is exactly how the old gap stayed invisible.
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    },
  );
});
