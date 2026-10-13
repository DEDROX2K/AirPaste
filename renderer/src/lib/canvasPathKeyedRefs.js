// AppProvider.jsx tracks each canvas's pending-autosave bookkeeping
// (pendingCanvasSaveRef, pendingCanvasDirtyFieldsRef,
// lastSavedCanvasWorkspaceRef, lastObservedCanvasWorkspaceRef,
// skipCanvasSaveRef) in refs keyed by canvas file path. Renaming or deleting
// a canvas away from a path a save was still pending for must move (or drop)
// that path's entry in every one of these refs -- otherwise a later flush
// (dome switch, app quit, or just the per-path autosave effect) finds a
// stale "pending" flag whose workspace entry is gone, builds a save payload
// from an empty fallback workspace, and silently resurrects the
// deleted/old-named file on disk as a blank canvas.
export function migrateCanvasPathKeyedRefs(refs, oldPath, newPath) {
  for (const ref of refs) {
    if (!(oldPath in ref.current)) continue;
    ref.current[newPath] = ref.current[oldPath];
    delete ref.current[oldPath];
  }
}

export function clearCanvasPathKeyedRefs(refs, path) {
  for (const ref of refs) {
    delete ref.current[path];
  }
}
