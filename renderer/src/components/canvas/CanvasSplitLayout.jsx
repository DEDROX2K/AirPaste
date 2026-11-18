import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useSplitView } from "../../context/SplitViewContext";
import { useTabs } from "../../context/useTabs";
import { SPLIT_DIVIDER_WIDTH, SPLIT_MIN_PANE_HEIGHT, SPLIT_MIN_PANE_WIDTH, clampSplitRatio } from "../../systems/canvas/splitView";
import EdgeConnector from "../ui/app/icons/EdgeConnector";
import { SplitPanePagesPanel } from "../LeftPagesPanel";
import { CanvasPaneContext } from "../../context/CanvasPaneContext";
import { CanvasFileScope, CanvasPageScope } from "./CanvasPane";
import { useCanvasPaneRegistry } from "./canvasPaneRegistry";
import "./CanvasSplitLayout.css";

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const rect = node.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// Right pane showing another file: that file's own pages (from the scoped
// context), in the same panel as the main one.
function FilePanePages({ onClose }) {
  const {
    workspace,
    currentEditor,
    setActiveCanvasPage,
    createCanvasPage,
    renameCanvasPage,
    reorderCanvasPages,
  } = useAppContext();
  return (
    <SplitPanePagesPanel
      workspacePages={workspace.pages}
      activePageId={workspace.activePageId}
      onSelectPage={setActiveCanvasPage}
      createCanvasPage={createCanvasPage}
      renameCanvasPage={renameCanvasPage}
      reorderCanvasPages={reorderCanvasPages}
      title={currentEditor.name || "Pages"}
      onClose={onClose}
    />
  );
}

// The left pane's width for a ratio. Set on the pane itself, never as an
// inherited CSS variable: changing one of those restyles every tile in
// both canvases (~40 ms a frame), this re-lays out just the two panes.
function leftPaneBasis(ratio) {
  return `calc((100% - ${SPLIT_DIVIDER_WIDTH}px) * ${ratio})`;
}

function PaneLoading() {
  return <div className="canvas-split__pane-loading" aria-live="polite">Loading canvas…</div>;
}

// Lays out one canvas pane, or two with a draggable divider between them.
// The left pane is always the same element, so toggling the split never
// remounts it (its pan, selection and LOD state carry on). The right pane
// shows another page of this file, or another file (a linked pair).
export default function CanvasSplitLayout({ CanvasView }) {
  const { currentEditor, workspace, renameCanvasPage, reorderCanvasPages } = useAppContext();
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const { tabs } = useTabs();
  const {
    ratio: savedRatio,
    rightPane,
    preferredPane,
    setPreferredPane,
    toggleSplit,
    closeSplit,
    updatePagePane,
    setRatio,
    floatFocused,
    stacked,
  } = useSplitView();
  const filePath = currentEditor.kind === "canvas" ? currentEditor.filePath : null;
  const splitEnabled = Boolean(rightPane && filePath);
  const [activePane, setActivePaneState] = useState(() => (splitEnabled ? preferredPane : "left"));
  const setActivePane = useCallback((pane) => {
    setActivePaneState(pane);
    setPreferredPane(pane);
  }, [setPreferredPane]);
  const registry = useCanvasPaneRegistry();
  const containerRef = useRef(null);
  const leftPaneRef = useRef(null);
  const setLeftPaneNode = useCallback((node) => {
    leftPaneRef.current = node;
    registry.paneElementRef("left")(node);
  }, [registry]);
  const containerSize = useElementSize(containerRef);
  // Side by side splits along the width, stacked along the height.
  const containerLength = stacked ? containerSize.height : containerSize.width;
  const minPane = stacked ? SPLIT_MIN_PANE_HEIGHT : SPLIT_MIN_PANE_WIDTH;

  useEffect(() => {
    if (!splitEnabled) setActivePaneState("left");
  }, [splitEnabled]);

  const ratio = clampSplitRatio(savedRatio, containerLength, minPane);
  // Each page keeps its own camera: open it where it was saved.
  const handleRightPageSelect = useCallback((pageId) => {
    const page = workspaceRef.current.pages?.find((entry) => entry.id === pageId);
    updatePagePane({ pageId, viewport: page?.viewport ?? null });
  }, [updatePagePane]);
  const handleRightViewportChange = useCallback((viewport) => {
    updatePagePane({ viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } });
  }, [updatePagePane]);

  // Dragging the divider writes the ratio straight to the DOM (a CSS
  // variable) and commits it once on release, so neither canvas re-renders
  // while it moves; each canvas only re-measures its own box.
  const beginResize = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const node = containerRef.current;
    if (!node) return;
    const handle = event.currentTarget;
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch {
      // The pointer is already gone; the release still ends the drag.
    }
    node.classList.add("canvas-split--resizing");
    const rect = node.getBoundingClientRect();
    let nextRatio = null;
    let frame = 0;

    const handleMove = (moveEvent) => {
      nextRatio = stacked
        ? clampSplitRatio((moveEvent.clientY - rect.top) / rect.height, rect.height, minPane)
        : clampSplitRatio((moveEvent.clientX - rect.left) / rect.width, rect.width, minPane);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (leftPaneRef.current) leftPaneRef.current.style.flexBasis = leftPaneBasis(nextRatio);
        handle.setAttribute("aria-valuenow", String(Math.round(nextRatio * 100)));
      });
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      node.classList.remove("canvas-split--resizing");
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      if (nextRatio !== null) {
        if (leftPaneRef.current) leftPaneRef.current.style.flexBasis = leftPaneBasis(nextRatio);
        setRatio(nextRatio);
      }
    };
    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }, [minPane, setRatio, stacked]);

  const handleDividerKeyDown = useCallback((event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const back = stacked ? "ArrowUp" : "ArrowLeft";
    const forward = stacked ? "ArrowDown" : "ArrowRight";
    if (event.key !== back && event.key !== forward) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.key === back ? -step : step;
    setRatio((current) => clampSplitRatio(current + delta, containerLength, minPane));
  }, [containerLength, minPane, setRatio, stacked]);

  const leftPaneContext = useMemo(() => ({
    paneId: "left",
    isActive: !floatFocused && (!splitEnabled || activePane === "left"),
    isSecondary: false,
    splitEnabled,
    toggleSplit: filePath ? toggleSplit : null,
    ...registry.paneApi,
  }), [activePane, filePath, floatFocused, registry.paneApi, splitEnabled, toggleSplit]);

  const rightPaneContext = useMemo(() => ({
    paneId: "right",
    isActive: !floatFocused && activePane === "right",
    isSecondary: true,
    splitEnabled,
    toggleSplit,
    ...registry.paneApi,
  }), [activePane, floatFocused, registry.paneApi, splitEnabled, toggleSplit]);

  // The same element objects across renders, so committing a new ratio (or
  // any layout-only change here) doesn't re-render either canvas.
  const rightFilePath = rightPane?.kind === "file" ? rightPane.filePath : null;
  const leftView = useMemo(() => createElement(CanvasView), [CanvasView]);
  const rightFileView = useMemo(
    () => (rightFilePath ? createElement(CanvasView, { key: `right-file:${rightFilePath}` }) : null),
    [CanvasView, rightFilePath],
  );
  const rightPageView = useMemo(() => createElement(CanvasView, { key: `right:${filePath}` }), [CanvasView, filePath]);

  const pages = Array.isArray(workspace.pages) ? workspace.pages : [];
  const rightFileName = rightPane?.kind === "file"
    ? tabs.find((tab) => tab.entityId === rightPane.filePath)?.title ?? ""
    : "";

  return (
    <div
      ref={containerRef}
      className={`canvas-split${splitEnabled ? " canvas-split--on" : ""}${splitEnabled && stacked ? " canvas-split--stacked" : ""}`}
    >
      <div
        className="canvas-split__pane canvas-split__pane--left"
        ref={setLeftPaneNode}
        style={splitEnabled ? { flexBasis: leftPaneBasis(ratio) } : undefined}
        data-active-pane={splitEnabled && activePane === "left" ? "" : undefined}
        onPointerDownCapture={() => { if (splitEnabled) setActivePane("left"); }}
      >
        <CanvasPaneContext.Provider value={leftPaneContext}>
          {leftView}
        </CanvasPaneContext.Provider>
        <div ref={registry.dropGhostRef("left")} className="canvas-split__drop-ghost" style={{ display: "none" }} aria-hidden="true" />
      </div>

      {splitEnabled ? (
        <>
          <div
            className="canvas-split__divider"
            role="separator"
            aria-orientation={stacked ? "horizontal" : "vertical"}
            aria-label="Resize split panes"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onPointerDown={beginResize}
            onKeyDown={handleDividerKeyDown}
            onDoubleClick={() => setRatio(0.5)}
          >
            {/* Fillets where the divider meets the card's edges, so each
                pane reads as its own rounded card. Named for the pane
                corner each one rounds. */}
            {stacked ? (
              <>
                <EdgeConnector corner="bottom-left" className="canvas-split__fillet canvas-split__fillet--s-tl" />
                <EdgeConnector corner="bottom-right" className="canvas-split__fillet canvas-split__fillet--s-tr" />
                <EdgeConnector corner="top-left" className="canvas-split__fillet canvas-split__fillet--s-bl" />
                <EdgeConnector corner="top-right" className="canvas-split__fillet canvas-split__fillet--s-br" />
              </>
            ) : (
              <>
                <EdgeConnector corner="top-right" className="canvas-split__fillet canvas-split__fillet--tl" />
                <EdgeConnector corner="top-left" className="canvas-split__fillet canvas-split__fillet--tr" />
                <EdgeConnector corner="bottom-right" className="canvas-split__fillet canvas-split__fillet--bl" />
                <EdgeConnector corner="bottom-left" className="canvas-split__fillet canvas-split__fillet--br" />
              </>
            )}
            <span className="canvas-split__grip" aria-hidden="true" />
          </div>
          <div
            className="canvas-split__pane canvas-split__pane--right"
            ref={registry.paneElementRef("right")}
            data-active-pane={activePane === "right" ? "" : undefined}
            onPointerDownCapture={() => setActivePane("right")}
          >
            <CanvasPaneContext.Provider value={rightPaneContext}>
              {rightPane.kind === "file" ? (
                <CanvasFileScope filePath={rightPane.filePath} name={rightFileName} fallback={<PaneLoading />}>
                  {rightFileView}
                  <FilePanePages onClose={closeSplit} />
                </CanvasFileScope>
              ) : (
                <>
                  <CanvasPageScope
                    pageId={rightPane.pageId}
                    viewport={rightPane.viewport}
                    onViewportChange={handleRightViewportChange}
                  >
                    {rightPageView}
                  </CanvasPageScope>
                  <SplitPanePagesPanel
                    workspacePages={pages}
                    activePageId={rightPane.pageId ?? workspace.activePageId}
                    onSelectPage={handleRightPageSelect}
                    renameCanvasPage={renameCanvasPage}
                    reorderCanvasPages={reorderCanvasPages}
                    onClose={closeSplit}
                  />
                </>
              )}
            </CanvasPaneContext.Provider>
            <div ref={registry.dropGhostRef("right")} className="canvas-split__drop-ghost" style={{ display: "none" }} aria-hidden="true" />
          </div>
        </>
      ) : null}
    </div>
  );
}
