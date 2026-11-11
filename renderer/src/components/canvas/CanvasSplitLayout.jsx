import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { desktop } from "../../lib/desktop";
import {
  SPLIT_SAVE_DEBOUNCE_MS,
  clampSplitRatio,
  isSplitToggleShortcut,
  normalizeSplitView,
} from "../../systems/canvas/splitView";
import EdgeConnector from "../ui/app/icons/EdgeConnector";
import { ChevronDown, X } from "../ui/icons";
import { CanvasPaneContext } from "../../context/CanvasPaneContext";
import { CanvasPageScope } from "./CanvasPane";
import "./CanvasSplitLayout.css";

const EMPTY_PANE = Object.freeze({ pageId: null, viewport: null });

function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function SplitPaneBar({ pages, pageId, onPageChange, onClose }) {
  const currentPage = pages.find((page) => page.id === pageId) ?? pages[0];
  return (
    <div
      className="canvas-split__pane-bar"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <label className="canvas-split__page-picker">
        <span className="canvas-split__page-name">{currentPage?.name || "Page"}</span>
        <ChevronDown size={12} aria-hidden="true" />
        <select
          aria-label="Page shown in this pane"
          value={currentPage?.id ?? ""}
          onChange={(event) => onPageChange(event.target.value)}
        >
          {pages.map((page, index) => (
            <option key={page.id} value={page.id}>{page.name || `Page ${index + 1}`}</option>
          ))}
        </select>
      </label>
      <button type="button" className="canvas-split__close" aria-label="Close split screen" title="Close split screen" onClick={onClose}>
        <X size={12} />
      </button>
    </div>
  );
}

// Lays out one canvas pane, or two with a draggable divider between them.
// The left pane is always the same element, so toggling the split never
// remounts it (its pan, selection and LOD state carry on).
export default function CanvasSplitLayout({ CanvasView }) {
  const { currentEditor, folderPath, workspace } = useAppContext();
  const filePath = currentEditor.kind === "canvas" ? currentEditor.filePath : null;
  const [split, setSplit] = useState(null);
  const [activePane, setActivePane] = useState("left");
  const [isResizing, setIsResizing] = useState(false);
  const paneRegistryRef = useRef(new Map());
  const paneElementsRef = useRef({ left: null, right: null });
  const dropGhostsRef = useRef({ left: null, right: null });

  // A tile from one pane is being dragged over the other: highlight that
  // pane and draw the tiles' outline where they'd land. Written straight to
  // the DOM, so a drag never re-renders either canvas.
  const setDropTargetPane = useCallback((paneId, info) => {
    for (const [id, node] of Object.entries(paneElementsRef.current)) {
      if (!node) continue;
      if (id === paneId) node.setAttribute("data-drop-target", "");
      else node.removeAttribute("data-drop-target");
    }

    for (const [id, node] of Object.entries(dropGhostsRef.current)) {
      if (node && id !== paneId) node.style.display = "none";
    }
    const ghost = paneId ? dropGhostsRef.current[paneId] : null;
    const target = paneId ? paneRegistryRef.current.get(paneId) : null;
    const paneNode = paneId ? paneElementsRef.current[paneId] : null;
    if (!ghost) return;
    if (!target || !paneNode || !info?.bounds) {
      ghost.style.display = "none";
      return;
    }
    const zoom = target.getZoom();
    const paneRect = paneNode.getBoundingClientRect();
    ghost.style.display = "block";
    ghost.style.left = `${info.clientX - paneRect.left + info.bounds.left * zoom}px`;
    ghost.style.top = `${info.clientY - paneRect.top + info.bounds.top * zoom}px`;
    ghost.style.width = `${info.bounds.width * zoom}px`;
    ghost.style.height = `${info.bounds.height * zoom}px`;
  }, []);

  const registerPane = useCallback((paneId, api) => {
    paneRegistryRef.current.set(paneId, api);
    return () => {
      if (paneRegistryRef.current.get(paneId) === api) {
        paneRegistryRef.current.delete(paneId);
      }
    };
  }, []);

  // The pane (other than `fromPaneId`) whose canvas is under the pointer.
  const findDropPane = useCallback((clientX, clientY, fromPaneId) => {
    for (const [paneId, api] of paneRegistryRef.current) {
      if (paneId === fromPaneId) continue;
      const rect = api.getElement()?.getBoundingClientRect();
      if (rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return { paneId, ...api };
      }
    }
    return null;
  }, []);
  const containerRef = useRef(null);
  const containerWidth = useElementWidth(containerRef);
  const saveTimeoutRef = useRef(0);
  const pendingSaveRef = useRef(null);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  useEffect(() => {
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
      if (next === current) return current;
      if (folderPath) {
        pendingSaveRef.current = { folderPath, splitView: next };
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(flushSave, SPLIT_SAVE_DEBOUNCE_MS);
      }
      return next;
    });
  }, [flushSave, folderPath]);

  const updateRightPane = useCallback((patch) => {
    if (!filePath) return;
    updateSplit((current) => {
      const previous = current.panes[filePath] ?? EMPTY_PANE;
      const nextPane = { ...previous, ...patch };
      if (nextPane.pageId === previous.pageId && nextPane.viewport === previous.viewport) {
        return current;
      }
      return { ...current, panes: { ...current.panes, [filePath]: nextPane } };
    });
  }, [filePath, updateSplit]);

  const toggleSplit = useCallback(() => {
    updateSplit((current) => {
      const enabled = !current.enabled;
      if (!enabled || !filePath || current.panes[filePath]?.pageId) {
        return { ...current, enabled };
      }
      // First split on this canvas: start the right pane where the left is.
      const ws = workspaceRef.current;
      return {
        ...current,
        enabled,
        panes: {
          ...current.panes,
          [filePath]: { pageId: ws.activePageId ?? null, viewport: ws.viewport ?? null },
        },
      };
    });
    setActivePane("left");
  }, [filePath, updateSplit]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isSplitToggleShortcut(event)) return;
      event.preventDefault();
      toggleSplit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSplit]);

  const splitEnabled = Boolean(split?.enabled && filePath);
  const ratio = clampSplitRatio(split?.ratio ?? 0.5, containerWidth);
  const rightPane = (filePath && split?.panes[filePath]) || EMPTY_PANE;
  const handleRightViewportChange = useCallback((viewport) => {
    updateRightPane({ viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } });
  }, [updateRightPane]);

  const beginResize = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const node = containerRef.current;
    if (!node) return;
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    setIsResizing(true);

    const handleMove = (moveEvent) => {
      const rect = node.getBoundingClientRect();
      const nextRatio = clampSplitRatio((moveEvent.clientX - rect.left) / rect.width, rect.width);
      updateSplit((current) => (Math.abs(current.ratio - nextRatio) < 0.001 ? current : { ...current, ratio: nextRatio }));
    };
    const finish = () => {
      setIsResizing(false);
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
    };
    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }, [updateSplit]);

  const handleDividerKeyDown = useCallback((event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.key === "ArrowLeft" ? -step : step;
    updateSplit((current) => ({ ...current, ratio: clampSplitRatio(current.ratio + delta, containerWidth) }));
  }, [containerWidth, updateSplit]);

  const leftPaneContext = useMemo(() => ({
    paneId: "left",
    isActive: !splitEnabled || activePane === "left",
    isSecondary: false,
    splitEnabled,
    toggleSplit: filePath ? toggleSplit : null,
    registerPane,
    findDropPane,
    setDropTargetPane,
  }), [activePane, filePath, findDropPane, registerPane, setDropTargetPane, splitEnabled, toggleSplit]);

  const rightPaneContext = useMemo(() => ({
    paneId: "right",
    isActive: activePane === "right",
    isSecondary: true,
    splitEnabled,
    toggleSplit,
    registerPane,
    findDropPane,
    setDropTargetPane,
  }), [activePane, findDropPane, registerPane, setDropTargetPane, splitEnabled, toggleSplit]);

  const pages = Array.isArray(workspace.pages) ? workspace.pages : [];

  return (
    <div
      ref={containerRef}
      className={`canvas-split${splitEnabled ? " canvas-split--on" : ""}${isResizing ? " canvas-split--resizing" : ""}`}
      style={splitEnabled ? { "--canvas-split-ratio": ratio } : undefined}
    >
      <div
        className="canvas-split__pane canvas-split__pane--left"
        ref={(node) => { paneElementsRef.current.left = node; }}
        data-active-pane={splitEnabled && activePane === "left" ? "" : undefined}
        onPointerDownCapture={() => setActivePane("left")}
      >
        <CanvasPaneContext.Provider value={leftPaneContext}>
          <CanvasView />
        </CanvasPaneContext.Provider>
        <div ref={(node) => { dropGhostsRef.current.left = node; }} className="canvas-split__drop-ghost" style={{ display: "none" }} aria-hidden="true" />
      </div>

      {splitEnabled ? (
        <>
          <div
            className="canvas-split__divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize split panes"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onPointerDown={beginResize}
            onKeyDown={handleDividerKeyDown}
            onDoubleClick={() => updateSplit((current) => ({ ...current, ratio: 0.5 }))}
          >
            {/* Fillets where the divider meets the top bar and the bottom
                edge, so each pane reads as its own rounded card. */}
            <EdgeConnector corner="top-right" className="canvas-split__fillet canvas-split__fillet--tl" />
            <EdgeConnector corner="top-left" className="canvas-split__fillet canvas-split__fillet--tr" />
            <EdgeConnector corner="bottom-right" className="canvas-split__fillet canvas-split__fillet--bl" />
            <EdgeConnector corner="bottom-left" className="canvas-split__fillet canvas-split__fillet--br" />
            <span className="canvas-split__grip" aria-hidden="true" />
          </div>
          <div
            className="canvas-split__pane canvas-split__pane--right"
            ref={(node) => { paneElementsRef.current.right = node; }}
            data-active-pane={activePane === "right" ? "" : undefined}
            onPointerDownCapture={() => setActivePane("right")}
          >
            <CanvasPaneContext.Provider value={rightPaneContext}>
              <CanvasPageScope
                pageId={rightPane.pageId}
                viewport={rightPane.viewport}
                onViewportChange={handleRightViewportChange}
              >
                <CanvasView key={`right:${filePath}`} />
              </CanvasPageScope>
            </CanvasPaneContext.Provider>
            <SplitPaneBar
              pages={pages}
              pageId={rightPane.pageId}
              onPageChange={(pageId) => {
                // Each page keeps its own camera: open it where it was saved.
                const page = pages.find((entry) => entry.id === pageId);
                updateRightPane({ pageId, viewport: page?.viewport ?? null });
              }}
              onClose={toggleSplit}
            />
            <div ref={(node) => { dropGhostsRef.current.right = node; }} className="canvas-split__drop-ghost" style={{ display: "none" }} aria-hidden="true" />
          </div>
        </>
      ) : null}
    </div>
  );
}
