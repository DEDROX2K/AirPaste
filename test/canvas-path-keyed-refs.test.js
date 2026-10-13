// Regression coverage for a resurrection bug: pendingCanvasSaveRef and its
// sibling refs (pendingCanvasDirtyFieldsRef, lastSavedCanvasWorkspaceRef,
// lastObservedCanvasWorkspaceRef, skipCanvasSaveRef) are keyed by canvas file
// path. Renaming or deleting a canvas used to leave a stale "pending save"
// entry behind under the old path -- so a later flush (dome switch, app
// quit, or just the per-path autosave effect) would find a "pending" flag
// whose workspace entry no longer exists, fall back to an empty workspace,
// and silently recreate the deleted/old-named file on disk as a blank
// canvas. migrateCanvasPathKeyedRefs/clearCanvasPathKeyedRefs (used by
// AppProvider.jsx's renameItemEntry/deleteItemEntry) are the fix: rename
// migrates every ref's entry to the new path, delete drops it outright.
import { describe, expect, it } from "vitest";
import { clearCanvasPathKeyedRefs, migrateCanvasPathKeyedRefs } from "../renderer/src/lib/canvasPathKeyedRefs.js";

function makeRef(initial = {}) {
  return { current: initial };
}

describe("migrateCanvasPathKeyedRefs", () => {
  it("moves a path's entry in every ref to the new path", () => {
    const pendingSave = makeRef({ "/old.canvas": true });
    const dirtyFields = makeRef({ "/old.canvas": { pages: true, activePageId: false, name: false, airpaste: false } });
    const refs = [pendingSave, dirtyFields];

    migrateCanvasPathKeyedRefs(refs, "/old.canvas", "/new.canvas");

    expect(pendingSave.current).toEqual({ "/new.canvas": true });
    expect(dirtyFields.current).toEqual({
      "/new.canvas": { pages: true, activePageId: false, name: false, airpaste: false },
    });
  });

  it("does nothing when the old path has no entry in a given ref", () => {
    const ref = makeRef({ "/unrelated.canvas": true });
    migrateCanvasPathKeyedRefs([ref], "/old.canvas", "/new.canvas");
    expect(ref.current).toEqual({ "/unrelated.canvas": true });
  });

  it("leaves other paths' entries untouched", () => {
    const ref = makeRef({ "/old.canvas": true, "/other.canvas": true });
    migrateCanvasPathKeyedRefs([ref], "/old.canvas", "/new.canvas");
    expect(ref.current).toEqual({ "/new.canvas": true, "/other.canvas": true });
  });
});

describe("clearCanvasPathKeyedRefs", () => {
  it("drops a path's entry from every ref, preventing a later flush from resurrecting it", () => {
    const pendingSave = makeRef({ "/deleted.canvas": true, "/kept.canvas": true });
    const dirtyFields = makeRef({ "/deleted.canvas": { pages: true } });
    const refs = [pendingSave, dirtyFields];

    clearCanvasPathKeyedRefs(refs, "/deleted.canvas");

    expect(pendingSave.current).toEqual({ "/kept.canvas": true });
    expect(dirtyFields.current).toEqual({});
  });

  it("is a no-op when the path has no entry", () => {
    const ref = makeRef({ "/kept.canvas": true });
    clearCanvasPathKeyedRefs([ref], "/not-there.canvas");
    expect(ref.current).toEqual({ "/kept.canvas": true });
  });
});
