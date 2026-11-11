import { useMemo, useRef } from "react";
import { AppContext } from "../../context/AppContext";
import { useAppContext } from "../../context/useAppContext";
import { withActivePageMirror } from "../../lib/workspace";

// Functions that must keep acting on the real active page / file even from
// the second pane.
const UNSCOPED_ACTIONS = new Set([
  "runInPageScope",
  "setActiveCanvasPage",
  "createCanvasPage",
  "renameCanvasPage",
  "reorderCanvasPages",
  "deleteCanvasPage",
  "commitWorkspaceChangeForPath",
]);

// Re-provides the app context to the second split pane, projected onto
// `pageId` with its own `viewport`:
// - `workspace` mirrors that page (cards, drawings, tethers...) and the
//   pane's viewport, so the canvas renders it unchanged;
// - every action runs inside runInPageScope(pageId), so edits land on that
//   page while the pages panel keeps its own active page;
// - setViewport goes to the pane (ui-state.json), never into the page doc,
//   so panning one pane never moves the other.
export function CanvasPageScope({ pageId, viewport, onViewportChange, children }) {
  const base = useAppContext();
  const wrapperCacheRef = useRef({ pageId: null, map: new Map() });

  const value = useMemo(() => {
    const { workspace, runInPageScope } = base;
    const pages = Array.isArray(workspace?.pages) ? workspace.pages : [];
    const effectivePageId = pages.some((page) => page.id === pageId) ? pageId : workspace.activePageId;
    const mirrored = withActivePageMirror({ ...workspace, activePageId: effectivePageId });
    const paneViewport = viewport ?? mirrored.viewport;
    const projectedWorkspace = {
      ...mirrored,
      viewport: paneViewport,
      activePage: { ...mirrored.activePage, viewport: paneViewport },
    };

    if (wrapperCacheRef.current.pageId !== effectivePageId) {
      wrapperCacheRef.current = { pageId: effectivePageId, map: new Map() };
    }
    const cache = wrapperCacheRef.current.map;
    const wrap = (fn) => {
      let wrapped = cache.get(fn);
      if (!wrapped) {
        wrapped = (...args) => runInPageScope(effectivePageId, () => fn(...args));
        cache.set(fn, wrapped);
      }
      return wrapped;
    };

    const next = {};
    for (const [key, entry] of Object.entries(base)) {
      next[key] = typeof entry === "function" && !UNSCOPED_ACTIONS.has(key) ? wrap(entry) : entry;
    }

    next.workspace = projectedWorkspace;
    next.setViewport = onViewportChange;
    return next;
  }, [base, onViewportChange, pageId, viewport]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
