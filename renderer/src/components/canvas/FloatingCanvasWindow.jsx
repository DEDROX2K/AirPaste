import { Suspense, createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasPaneContext } from "../../context/CanvasPaneContext";
import { useAppContext } from "../../context/useAppContext";
import { useSplitView } from "../../context/SplitViewContext";
import { useTabs } from "../../context/useTabs";
import {
  clampFloatPosition,
  defaultFloatPosition,
  getFloatSize,
  snapFloatPosition,
} from "../../systems/canvas/splitView";
import { Check, ChevronDown, RefreshCw, SplitColumns, X } from "../ui/icons";
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from "../ui/app";
import { CanvasFileScope } from "./CanvasPane";
import { useCanvasPaneRegistry } from "./canvasPaneRegistry";
import "./FloatingCanvasWindow.css";

const DRAG_THRESHOLD = 3;
const SETTLE_MS = 220;

// The area the card lives in: the window under the tab bar.
function measureBounds() {
  const rect = document.querySelector(".app-shell__view-container")?.getBoundingClientRect();
  if (!rect || rect.width < 1 || rect.height < 1) {
    return { left: 0, top: 44, width: window.innerWidth, height: Math.max(1, window.innerHeight - 44) };
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

// Where the card sits: its saved spot (pushed back to its snapped edge, so
// it stays on that edge as the window resizes), kept inside the window.
function resolvePosition(floating, size, bounds) {
  if (!Number.isFinite(floating.x) || !Number.isFinite(floating.y)) {
    return defaultFloatPosition(size, bounds);
  }
  let { x, y } = floating;
  if (floating.snap === "left") x = -Infinity;
  if (floating.snap === "right") x = Infinity;
  if (floating.snap === "top") y = -Infinity;
  if (floating.snap === "bottom") y = Infinity;
  return clampFloatPosition({ x, y, ...size }, bounds);
}

function FloatHeader({ onDragStart, onRotate, onDock, onClose, orientation }) {
  const { workspace, currentEditor, setActiveCanvasPage } = useAppContext();
  const pages = Array.isArray(workspace.pages) ? workspace.pages : [];
  const currentPage = pages.find((page) => page.id === workspace.activePageId) ?? pages[0];

  return (
    <div className="floating-canvas__header" onPointerDown={onDragStart}>
      <div className="floating-canvas__title">
        <span className="floating-canvas__name" title={currentEditor.name}>{currentEditor.name || "Canvas"}</span>
        {pages.length > 1 ? (
          <AppDropdownMenu modal={false}>
            <AppDropdownMenuTrigger asChild>
              <button
                type="button"
                className="floating-canvas__page"
                aria-label="Page shown in the floating view"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span>{currentPage?.name || "Page"}</span>
                <ChevronDown size={11} aria-hidden="true" />
              </button>
            </AppDropdownMenuTrigger>
            {/* Above the floating card (z-index 900). */}
            <AppDropdownMenuContent align="start" className="floating-canvas__page-menu" style={{ zIndex: 1000 }}>
              {pages.map((page, index) => (
                <AppDropdownMenuItem key={page.id} onSelect={() => setActiveCanvasPage(page.id)}>
                  <span className="floating-canvas__page-check">
                    {page.id === currentPage?.id ? <Check size={12} aria-hidden="true" /> : null}
                  </span>
                  <span className="floating-canvas__page-label">{page.name || `Page ${index + 1}`}</span>
                </AppDropdownMenuItem>
              ))}
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        ) : null}
      </div>
      <div className="floating-canvas__actions" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="floating-canvas__button"
          onClick={onRotate}
          aria-label={orientation === "portrait" ? "Turn to landscape" : "Turn to portrait"}
          title={orientation === "portrait" ? "Turn to landscape" : "Turn to portrait"}
        >
          <RefreshCw size={12} aria-hidden="true" />
        </button>
        <button type="button" className="floating-canvas__button" onClick={onDock} aria-label="Open in split screen" title="Open in split screen">
          <SplitColumns size={13} aria-hidden="true" />
        </button>
        <button type="button" className="floating-canvas__button" onClick={onClose} aria-label="Close floating view" title="Close floating view">
          <X size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function FloatingCard({ floating, CanvasView }) {
  const { updateFloat, closeFloat, dockFloat, floatFocused, setFloatFocused } = useSplitView();
  const { tabs } = useTabs();
  const registry = useCanvasPaneRegistry();
  const cardRef = useRef(null);
  const [bounds, setBounds] = useState(measureBounds);
  const [isDragging, setIsDragging] = useState(false);
  const size = getFloatSize(floating.orientation, bounds);
  const position = resolvePosition(floating, size, bounds);
  const name = tabs.find((tab) => tab.type === "canvas" && tab.entityId === floating.filePath)?.title ?? "";

  useLayoutEffect(() => {
    const handleResize = () => {
      const next = measureBounds();
      setBounds((current) => (
        current.left === next.left && current.top === next.top && current.width === next.width && current.height === next.height
          ? current
          : next
      ));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard shortcuts go to the floating view while the last press was in
  // it, and back to the main canvas after a press anywhere else.
  useEffect(() => {
    const handlePointerDown = (event) => {
      setFloatFocused(Boolean(cardRef.current?.contains(event.target)));
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      setFloatFocused(false);
    };
  }, [setFloatFocused]);

  // Dragging by the header: the card follows the pointer through direct
  // style writes, then snaps to a nearby edge and saves its spot.
  const beginDrag = useCallback((event) => {
    if (event.button !== 0) return;
    const node = cardRef.current;
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: position.x, y: position.y };
    const currentBounds = measureBounds();
    let moved = false;
    let last = origin;
    try {
      handle.setPointerCapture?.(pointerId);
    } catch {
      // The pointer is already gone.
    }

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved = true;
        setIsDragging(true);
        node.style.transition = "none";
      }
      last = clampFloatPosition({ x: origin.x + dx, y: origin.y + dy, ...size }, currentBounds);
      node.style.transform = `translate3d(${last.x}px, ${last.y}px, 0)`;
    };

    const finish = (endEvent) => {
      if (endEvent && endEvent.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      handle.removeEventListener("lostpointercapture", finish);
      if (!moved) return;
      setIsDragging(false);
      const settled = snapFloatPosition({ ...last, ...size }, currentBounds);
      node.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      node.style.transform = `translate3d(${settled.x}px, ${settled.y}px, 0)`;
      updateFloat(settled);
    };

    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
  }, [position.x, position.y, size, updateFloat]);

  const rotate = useCallback(() => {
    const orientation = floating.orientation === "portrait" ? "landscape" : "portrait";
    const nextSize = getFloatSize(orientation, bounds);
    // Turn around the card's centre, then keep it in the window.
    const centre = { x: position.x + size.width / 2, y: position.y + size.height / 2 };
    const settled = snapFloatPosition({
      x: centre.x - nextSize.width / 2,
      y: centre.y - nextSize.height / 2,
      ...nextSize,
    }, bounds);
    if (cardRef.current) {
      cardRef.current.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), width ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), height ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    }
    updateFloat({ orientation, ...settled });
  }, [bounds, floating.orientation, position.x, position.y, size.height, size.width, updateFloat]);

  const paneContext = useMemo(() => ({
    paneId: "float",
    isActive: floatFocused,
    isSecondary: true,
    splitEnabled: false,
    compact: true,
    toggleSplit: null,
    ...registry.paneApi,
  }), [floatFocused, registry.paneApi]);

  const loading = <div className="floating-canvas__loading">Loading canvas…</div>;
  // The same element across renders: moving, rotating or resizing the card
  // re-renders the card, not the canvas inside it.
  const canvasElement = useMemo(
    () => createElement(CanvasView, { key: `float:${floating.filePath}` }),
    [CanvasView, floating.filePath],
  );

  return (
    <div
      ref={cardRef}
      className={`floating-canvas floating-canvas--${floating.orientation}${isDragging ? " floating-canvas--dragging" : ""}${floatFocused ? " floating-canvas--focused" : ""}`}
      style={{
        width: `${size.width}px`,
        height: `${size.height}px`,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
      role="dialog"
      aria-label={`Floating view: ${name || "canvas"}`}
      data-snap={floating.snap ?? undefined}
    >
      <CanvasFileScope
        filePath={floating.filePath}
        name={name}
        fallback={(
          <>
            <div className="floating-canvas__header" onPointerDown={beginDrag}>
              <span className="floating-canvas__name">{name || "Canvas"}</span>
              <div className="floating-canvas__actions" onPointerDown={(event) => event.stopPropagation()}>
                <button type="button" className="floating-canvas__button" onClick={closeFloat} aria-label="Close floating view">
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
            {loading}
          </>
        )}
      >
        <FloatHeader
          onDragStart={beginDrag}
          onRotate={rotate}
          onDock={dockFloat}
          onClose={closeFloat}
          orientation={floating.orientation}
        />
        <div className="floating-canvas__screen" ref={registry.paneElementRef("float")}>
          <CanvasPaneContext.Provider value={paneContext}>
            <Suspense fallback={loading}>
              {canvasElement}
            </Suspense>
          </CanvasPaneContext.Provider>
          <div ref={registry.dropGhostRef("float")} className="canvas-split__drop-ghost" style={{ display: "none" }} aria-hidden="true" />
        </div>
      </CanvasFileScope>
    </div>
  );
}

// A canvas file floating over the app in a small phone-shaped card: live
// and editable, moved by its header, sticking to the window edges, turned
// between portrait and landscape. Opened by dropping a tab on the middle
// drop box (TopTabBar / TabDetachOverlay).
export default function FloatingCanvasWindow({ CanvasView }) {
  const { floating, ready } = useSplitView();
  const { folderPath } = useAppContext();
  if (!ready || !floating || !folderPath) return null;
  return <FloatingCard key={floating.filePath} floating={floating} CanvasView={CanvasView} />;
}
