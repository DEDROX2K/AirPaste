import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { desktop } from "../lib/desktop";
import {
  SPLIT_SAVE_DEBOUNCE_MS,
  closeSplitFor,
  detachFile,
  findFilePair,
  isSplitToggleShortcut,
  normalizeSplitView,
  openFilePair,
  openFloating,
  openPageSplit,
} from "../systems/canvas/splitView";
import { SplitViewContext } from "./SplitViewContext";
import { useAppContext } from "./useAppContext";
import { useTabs } from "./useTabs";

const isCanvasTab = (tab) => tab?.type === "canvas" && Boolean(tab.entityId);

// Owns the split screen and floating view state (systems/canvas/splitView.js)
// for the open folder: loads and saves it in ui-state.json, keeps the files
// shown outside the active tab loaded and autosaving, and turns tab drags,
// pages-panel clicks and Ctrl+\ into split changes.
export function SplitViewProvider({ children }) {
  const {
    currentEditor,
    ensureCanvasLoaded,
    folderPath,
    setAuxCanvasPaths,
    workspace,
  } = useAppContext();
  const { tabs, activeTab, setActiveTab, moveTab, getRecentTab } = useTabs();
  const [split, setSplit] = useState(null);
  // Which pane takes keyboard focus next time a split layout mounts (the
  // right one after clicking the right half's tab).
  const [preferredPane, setPreferredPane] = useState("left");
  // The floating view was pressed last: it takes keyboard shortcuts.
  const [floatFocused, setFloatFocused] = useState(false);
  const saveTimeoutRef = useRef(0);
  const pendingSaveRef = useRef(null);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activePath = currentEditor.kind === "canvas" ? currentEditor.filePath : null;
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  useEffect(() => {
    setSplit(null);
    if (!folderPath) return undefined;
    let cancelled = false;
    void Promise.resolve(desktop.workspace.loadUiState(folderPath))
      .catch(() => null)
      .then((uiState) => {
        if (!cancelled) setSplit(normalizeSplitView(uiState?.splitView));
      });
    return () => {
      cancelled = true;
    };
  }, [folderPath]);

  const flushSave = useCallback(() => {
    window.clearTimeout(saveTimeoutRef.current);
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) {
      void Promise.resolve(desktop.workspace.saveUiState(pending.folderPath, { splitView: pending.splitView }))
        .catch(() => {});
    }
  }, []);

  useEffect(() => () => flushSave(), [flushSave]);

  const updateSplit = useCallback((updater) => {
    setSplit((current) => {
      if (!current) return current;
      const next = updater(current);
      if (!next || next === current) return current;
      if (folderPath) {
        pendingSaveRef.current = { folderPath, splitView: next };
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(flushSave, SPLIT_SAVE_DEBOUNCE_MS);
      }
      return next;
    });
  }, [flushSave, folderPath]);

  const tabForPath = useCallback(
    (filePath) => tabsRef.current.find((tab) => tab.type === "canvas" && tab.entityId === filePath) ?? null,
    [],
  );

  // Puts the right half's tab straight after the left half's.
  const placeTabsSideBySide = useCallback((leftPath, rightPath) => {
    const leftTab = tabForPath(leftPath);
    const rightTab = tabForPath(rightPath);
    if (!leftTab || !rightTab) return;
    const leftIndex = tabsRef.current.findIndex((tab) => tab.id === leftTab.id);
    moveTab(rightTab.id, leftIndex + 1);
  }, [moveTab, tabForPath]);

  const pair = split ? findFilePair(split, activePath) : null;

  // Clicking the right half's tab shows the pair: the left half's tab is
  // the one the layout is built around, so it becomes the active tab.
  useEffect(() => {
    if (!pair || pair.rightPath !== activePath) return;
    const leftTab = tabForPath(pair.leftPath);
    if (!leftTab) return;
    setPreferredPane("right");
    setActiveTab(leftTab.id);
  }, [activePath, pair, setActiveTab, tabForPath]);

  // Opening the floated file's tab brings it back into the main view.
  useEffect(() => {
    if (activePath && split?.floating?.filePath === activePath) {
      updateSplit((current) => ({ ...current, floating: null }));
    }
  }, [activePath, split?.floating?.filePath, updateSplit]);

  // Closing a file's tab ends its pair and its floating view.
  useEffect(() => {
    if (!split) return;
    const open = new Set(tabs.filter(isCanvasTab).map((tab) => tab.entityId));
    const shown = new Set();
    for (const [leftPath, pane] of Object.entries(split.panes)) {
      if (pane.enabled && pane.filePath) {
        shown.add(leftPath);
        shown.add(pane.filePath);
      }
    }
    if (split.floating) shown.add(split.floating.filePath);
    const gone = [...shown].filter((path) => !open.has(path));
    if (gone.length > 0) {
      updateSplit((current) => gone.reduce((next, path) => detachFile(next, path), current));
    }
  }, [split, tabs, updateSplit]);

  const rightFilePath = pair && pair.leftPath === activePath ? pair.rightPath : null;
  const floatingFilePath = split?.floating?.filePath ?? null;

  // Files on screen besides the active tab: load them and autosave them.
  useEffect(() => {
    const paths = [rightFilePath, floatingFilePath].filter(Boolean);
    setAuxCanvasPaths?.(paths);
    paths.forEach((path) => {
      void Promise.resolve(ensureCanvasLoaded?.(path)).catch(() => {});
    });
  }, [ensureCanvasLoaded, floatingFilePath, rightFilePath, setAuxCanvasPaths]);

  const activePane = activePath && split ? split.panes[activePath] : null;
  const rightPane = useMemo(() => {
    if (rightFilePath) return { kind: "file", filePath: rightFilePath };
    if (activePane?.enabled && !activePane.filePath) {
      return { kind: "page", pageId: activePane.pageId, viewport: activePane.viewport };
    }
    return null;
  }, [activePane, rightFilePath]);

  const toggleSplit = useCallback(() => {
    const path = activePathRef.current;
    if (!path) return;
    updateSplit((current) => {
      if (findFilePair(current, path) || current.panes[path]?.enabled) {
        return closeSplitFor(current, path);
      }
      // Reopen where it was last, or start on the left pane's page.
      const saved = current.panes[path];
      const ws = workspaceRef.current;
      const pageId = saved?.pageId && ws.pages?.some((page) => page.id === saved.pageId) ? saved.pageId : ws.activePageId;
      return openPageSplit(current, path, pageId ?? null, saved?.pageId ? saved.viewport : ws.viewport ?? null);
    });
    setPreferredPane("left");
  }, [updateSplit]);

  const openPageSplitFor = useCallback((pageId) => {
    const path = activePathRef.current;
    if (!path) return;
    const page = workspaceRef.current.pages?.find((entry) => entry.id === pageId);
    updateSplit((current) => openPageSplit(current, path, pageId, page?.viewport ?? null));
  }, [updateSplit]);

  // Unlinks the two-file pair `filePath` belongs to (tab context menu).
  const separatePair = useCallback((filePath) => {
    updateSplit((current) => (findFilePair(current, filePath) ? closeSplitFor(current, filePath) : current));
    setPreferredPane("left");
  }, [updateSplit]);

  const closeSplit = useCallback(() => {
    const path = activePathRef.current;
    if (!path) return;
    updateSplit((current) => closeSplitFor(current, path));
    setPreferredPane("left");
  }, [updateSplit]);

  // Same-file split: page / viewport of the right pane.
  const updatePagePane = useCallback((patch) => {
    const path = activePathRef.current;
    if (!path) return;
    updateSplit((current) => {
      const previous = current.panes[path];
      if (!previous) return current;
      const nextPane = { ...previous, ...patch };
      if (nextPane.pageId === previous.pageId && nextPane.viewport === previous.viewport) return current;
      return { ...current, panes: { ...current.panes, [path]: nextPane } };
    });
  }, [updateSplit]);

  const setRatio = useCallback((ratioOrUpdater) => {
    updateSplit((current) => {
      const ratio = typeof ratioOrUpdater === "function" ? ratioOrUpdater(current.ratio) : ratioOrUpdater;
      return Math.abs(current.ratio - ratio) < 0.001 ? current : { ...current, ratio };
    });
  }, [updateSplit]);

  // The file a dragged tab would be split with: the active canvas, or (when
  // the dragged tab is the active one) the canvas tab used before it.
  const getSplitPartner = useCallback((tab) => {
    if (!isCanvasTab(tab) || !activePathRef.current) return null;
    if (tab.entityId !== activePathRef.current) return tabForPath(activePathRef.current);
    return getRecentTab([tab.id], (entry) => isCanvasTab(entry) && entry.entityId !== tab.entityId);
  }, [getRecentTab, tabForPath]);

  // A tab dropped on the left or right drop box.
  const splitWithTab = useCallback((tab, side) => {
    const partner = getSplitPartner(tab);
    if (!partner) return false;
    const leftTab = side === "left" ? tab : partner;
    const rightTab = side === "left" ? partner : tab;
    updateSplit((current) => openFilePair(current, leftTab.entityId, rightTab.entityId));
    placeTabsSideBySide(leftTab.entityId, rightTab.entityId);
    setPreferredPane(side === "left" ? "left" : "right");
    setActiveTab(leftTab.id);
    return true;
  }, [getSplitPartner, placeTabsSideBySide, setActiveTab, updateSplit]);

  // A tab dropped on the middle drop box.
  const floatTab = useCallback((tab) => {
    if (!isCanvasTab(tab)) return false;
    if (tab.entityId === activePathRef.current) {
      // It can't float over itself: show what was open before it.
      const previous = getRecentTab([tab.id]);
      setActiveTab(previous?.id ?? "home");
    }
    updateSplit((current) => openFloating(current, tab.entityId));
    return true;
  }, [getRecentTab, setActiveTab, updateSplit]);

  const updateFloat = useCallback((patch) => {
    updateSplit((current) => {
      if (!current.floating) return current;
      const next = { ...current.floating, ...patch };
      const same = Object.keys(next).every((key) => next[key] === current.floating[key]);
      return same ? current : { ...current, floating: next };
    });
  }, [updateSplit]);

  const closeFloat = useCallback(() => {
    updateSplit((current) => (current.floating ? { ...current, floating: null } : current));
  }, [updateSplit]);

  // Floating view -> right half of a split with the active canvas, or its
  // own tab when there's nothing to split with.
  const dockFloat = useCallback(() => {
    const floatPath = split?.floating?.filePath;
    if (!floatPath) return;
    const path = activePathRef.current;
    if (path && path !== floatPath) {
      updateSplit((current) => openFilePair({ ...current, floating: null }, path, floatPath));
      placeTabsSideBySide(path, floatPath);
      setPreferredPane("right");
      return;
    }
    const tab = tabForPath(floatPath);
    updateSplit((current) => ({ ...current, floating: null }));
    if (tab) setActiveTab(tab.id);
  }, [placeTabsSideBySide, setActiveTab, split?.floating?.filePath, tabForPath, updateSplit]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isSplitToggleShortcut(event) || !activePathRef.current) return;
      event.preventDefault();
      toggleSplit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSplit]);

  const pairedPaths = useMemo(() => {
    const map = new Map();
    if (!split) return map;
    for (const [leftPath, pane] of Object.entries(split.panes)) {
      if (pane.enabled && pane.filePath) {
        map.set(leftPath, { side: "left", leftPath, rightPath: pane.filePath });
        map.set(pane.filePath, { side: "right", leftPath, rightPath: pane.filePath });
      }
    }
    return map;
  }, [split]);

  const value = useMemo(() => ({
    ready: Boolean(split),
    activeTabPath: activePath,
    ratio: split?.ratio ?? 0.5,
    rightPane,
    floating: split?.floating ?? null,
    pairedPaths,
    preferredPane,
    setPreferredPane,
    floatFocused,
    setFloatFocused,
    toggleSplit,
    openPageSplitFor,
    closeSplit,
    separatePair,
    updatePagePane,
    setRatio,
    getSplitPartner,
    splitWithTab,
    floatTab,
    updateFloat,
    closeFloat,
    dockFloat,
    activeTab,
  }), [
    activePath,
    activeTab,
    closeFloat,
    closeSplit,
    dockFloat,
    floatFocused,
    floatTab,
    getSplitPartner,
    openPageSplitFor,
    pairedPaths,
    preferredPane,
    rightPane,
    separatePair,
    setRatio,
    split,
    splitWithTab,
    toggleSplit,
    updateFloat,
    updatePagePane,
  ]);

  return <SplitViewContext.Provider value={value}>{children}</SplitViewContext.Provider>;
}
