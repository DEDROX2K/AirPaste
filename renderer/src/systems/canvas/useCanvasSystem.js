import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordInteractionCommit } from "../../lib/perf";
import {
  areViewportTransformsClose,
  clampViewportZoom,
  getNextZoomStop,
  getPreviousZoomStop,
  interpolateViewport,
  clientToWorldPoint,
  getCanvasContentTransform,
  getCanvasGridStyleVars,
  getClientRect,
  getViewportForWorldBounds,
  getViewportForWorldPoint,
  getViewportCenterPoint,
  normalizeWheelZoomDelta,
} from "./canvasMath";

const ZOOM_INTERPOLATION_RATE = 28;
// How long the wheel must be still before a wheel zoom or pan counts as
// over and the viewport is committed to React state (and so to the save).
// Each commit re-renders the board, so mid-gesture pauses must not commit.
const VIEWPORT_COMMIT_DELAY_MS = 200;
// --canvas-zoom is inherited by every node under the canvas, so writing it
// restyles the whole canvas (~9 ms for 14 tiles, measured). Mid zoom gesture
// it's only rewritten once the zoom has moved this far from the written
// value (screen-constant chrome is at most this far off for a moment); the
// exact value is written as the zoom settles.
const ZOOM_VAR_STEP = 0.04;
// A real trackpad pinch (or Ctrl+trackpad-scroll, the common substitute on
// laptops without pinch support) reports much smaller per-event deltas than
// a two-finger pan does, so the previous sensitivity -- tuned for pan-sized
// deltas -- made pinch-zoom barely perceptible. Boosting it alone would
// overshoot on a physical mouse wheel's much larger per-notch delta, so the
// delta is also capped before being applied: small (pinch) deltas now land
// a clearly visible zoom step, while a single big notch is bounded to one
// reasonable step instead of jumping wildly.
// 30% gentler than the original 0.012: one mouse-wheel notch zoomed too far.
const ZOOM_WHEEL_SENSITIVITY = 0.0084;
const ZOOM_WHEEL_MAX_DELTA = 40;

// A notched mouse wheel, as opposed to a trackpad scroll. Mice report whole
// lines (deltaMode 1, Firefox-style) or, in Chromium, vertical-only steps in
// multiples of 120 on the legacy wheelDelta; a precision trackpad sends
// small, uneven pixel deltas, usually with some horizontal component.
export function isMouseWheelEvent(event) {
  if (event.deltaMode === 1 || event.deltaMode === 2) {
    return true;
  }

  if (event.deltaX !== 0) {
    return false;
  }

  const legacy = Math.abs(event.wheelDeltaY ?? event.wheelDelta ?? 0);
  return legacy >= 120 && legacy % 120 === 0;
}

export function useCanvasSystem({ viewport, onViewportChange }) {
  const [containerElement, setContainerElement] = useState(null);
  const [gridElement, setGridElement] = useState(null);
  const [contentElement, setContentElement] = useState(null);
  const containerRectRef = useRef(null);
  const panStateRef = useRef(null);
  const viewportRef = useRef(viewport);
  const committedViewportRef = useRef(viewport);
  const targetViewportRef = useRef(viewport);
  const pendingViewportRef = useRef(null);
  const viewportListenerSetRef = useRef(new Set());
  const wheelStopTimeoutRef = useRef(0);
  const wheelPanSettleTimeoutRef = useRef(0);
  const zoomAnimationFrameRef = useRef(0);
  const zoomLastFrameTimeRef = useRef(0);
  const zoomCommitWhenSettledRef = useRef(false);
  const zoomGestureActiveRef = useRef(false);
  const writtenZoomRef = useRef(null);
  const panFrameRef = useRef(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);

  // Callback refs that also keep `.current`, so callers can read the
  // element like an object ref (canvas.containerRef.current).
  const containerRef = useCallback(function setContainerRef(node) {
    setContainerRef.current = node;
    setContainerElement(node);
  }, []);

  const gridRef = useCallback(function setGridRef(node) {
    setGridRef.current = node;
    setGridElement(node);
  }, []);

  const contentRef = useCallback(function setContentRef(node) {
    setContentRef.current = node;
    setContentElement(node);
  }, []);

  const measureContainerRect = useCallback(() => {
    containerRectRef.current = getClientRect(containerElement);
    return containerRectRef.current;
  }, [containerElement]);

  const notifyViewportListeners = useCallback((nextViewport) => {
    viewportListenerSetRef.current.forEach((listener) => {
      try {
        listener(nextViewport);
      } catch {
        // Keep listener failures isolated from camera updates.
      }
    });
  }, []);

  const applyViewportStyleVars = useCallback((nextViewport) => {
    const gridStyleVars = getCanvasGridStyleVars(nextViewport);

    Object.entries(gridStyleVars).forEach(([name, value]) => {
      gridElement?.style?.setProperty(name, value);
    });

    if (contentElement?.style) {
      contentElement.style.transform = getCanvasContentTransform(nextViewport);
      // For screen-constant tile chrome (e.g. a sticky's toolbar), which
      // divides by it in CSS instead of re-rendering on every zoom step.
      const writtenZoom = writtenZoomRef.current;

      if (
        !zoomGestureActiveRef.current
        || !writtenZoom
        || Math.abs(nextViewport.zoom / writtenZoom - 1) >= ZOOM_VAR_STEP
      ) {
        if (writtenZoom !== nextViewport.zoom) {
          contentElement.style.setProperty("--canvas-zoom", String(nextViewport.zoom));
          writtenZoomRef.current = nextViewport.zoom;
        }
      }
    }
    notifyViewportListeners(nextViewport);
  }, [contentElement, gridElement, notifyViewportListeners]);

  const applyRenderedViewport = useCallback((nextViewport) => {
    viewportRef.current = nextViewport;
    applyViewportStyleVars(nextViewport);
  }, [applyViewportStyleVars]);

  const subscribeViewportTransform = useCallback((listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    viewportListenerSetRef.current.add(listener);

    try {
      listener(viewportRef.current);
    } catch {
      // Ignore immediate listener failures.
    }

    return () => {
      viewportListenerSetRef.current.delete(listener);
    };
  }, []);

  const commitPendingViewport = useCallback(() => {
    const pendingViewport = pendingViewportRef.current;

    if (!pendingViewport) {
      return;
    }

    pendingViewportRef.current = null;
    viewportRef.current = pendingViewport;
    committedViewportRef.current = pendingViewport;
    targetViewportRef.current = pendingViewport;
    zoomCommitWhenSettledRef.current = false;
    onViewportChange(pendingViewport);
  }, [onViewportChange]);

  const scheduleViewportCommit = useCallback((nextViewport, options = {}) => {
    pendingViewportRef.current = nextViewport;
    targetViewportRef.current = nextViewport;

    if (options.immediate) {
      commitPendingViewport();
    }
  }, [commitPendingViewport]);

  const stopZoomAnimation = useCallback(() => {
    if (zoomAnimationFrameRef.current) {
      window.cancelAnimationFrame(zoomAnimationFrameRef.current);
      zoomAnimationFrameRef.current = 0;
    }
    zoomLastFrameTimeRef.current = 0;
  }, []);

  const endZoomGesture = useCallback(() => {
    zoomGestureActiveRef.current = false;

    if (containerElement) {
      delete containerElement.dataset.zooming;
    }
  }, [containerElement]);

  const finalizeAnimatedZoom = useCallback(() => {
    const pendingViewport = pendingViewportRef.current;
    endZoomGesture();

    if (!pendingViewport) {
      zoomCommitWhenSettledRef.current = false;
      // The gesture skipped small --canvas-zoom steps: land the exact one.
      applyRenderedViewport(viewportRef.current);
      setIsZooming(false);
      return;
    }

    stopZoomAnimation();
    applyRenderedViewport(pendingViewport);
    commitPendingViewport();
    setIsZooming(false);
  }, [applyRenderedViewport, commitPendingViewport, endZoomGesture, stopZoomAnimation]);

  const animateZoomFrame = useCallback((now) => {
    const targetViewport = targetViewportRef.current;
    const currentViewport = viewportRef.current;

    if (!targetViewport) {
      stopZoomAnimation();
      return;
    }

    const previousFrameTime = zoomLastFrameTimeRef.current || now;
    const deltaTimeMs = Math.min(64, Math.max(1, now - previousFrameTime));
    zoomLastFrameTimeRef.current = now;
    const alpha = 1 - Math.exp(-(deltaTimeMs / 1000) * ZOOM_INTERPOLATION_RATE);
    const nextViewport = interpolateViewport(currentViewport, targetViewport, alpha);
    const isCloseToTarget = areViewportTransformsClose(nextViewport, targetViewport);

    if (isCloseToTarget) {
      applyRenderedViewport(targetViewport);
      stopZoomAnimation();

      if (zoomCommitWhenSettledRef.current) {
        finalizeAnimatedZoom();
      }
      return;
    }

    applyRenderedViewport(nextViewport);
    zoomAnimationFrameRef.current = window.requestAnimationFrame(animateZoomFrame);
  }, [applyRenderedViewport, finalizeAnimatedZoom, stopZoomAnimation]);

  const ensureZoomAnimation = useCallback(() => {
    if (zoomAnimationFrameRef.current) {
      return;
    }

    zoomLastFrameTimeRef.current = 0;
    zoomAnimationFrameRef.current = window.requestAnimationFrame(animateZoomFrame);
  }, [animateZoomFrame]);

  const markZoomActive = useCallback(() => {
    setIsZooming(true);
    zoomCommitWhenSettledRef.current = false;
    zoomGestureActiveRef.current = true;

    // A data attribute rather than a class: React owns the container's
    // className and would drop a class added here on its next render.
    if (containerElement) {
      containerElement.dataset.zooming = "";
    }

    if (wheelStopTimeoutRef.current) {
      window.clearTimeout(wheelStopTimeoutRef.current);
    }

    wheelStopTimeoutRef.current = window.setTimeout(() => {
      wheelStopTimeoutRef.current = 0;
      zoomCommitWhenSettledRef.current = true;

      if (!zoomAnimationFrameRef.current || areViewportTransformsClose(viewportRef.current, targetViewportRef.current)) {
        finalizeAnimatedZoom();
      }
    }, VIEWPORT_COMMIT_DELAY_MS);
  }, [containerElement, finalizeAnimatedZoom]);

  useEffect(() => {
    const hasAnimatedViewportInFlight = Boolean(pendingViewportRef.current)
      && areViewportTransformsClose(viewport, committedViewportRef.current);

    if (hasAnimatedViewportInFlight) {
      return;
    }

    stopZoomAnimation();
    viewportRef.current = viewport;
    committedViewportRef.current = viewport;
    targetViewportRef.current = viewport;
    pendingViewportRef.current = null;
    zoomCommitWhenSettledRef.current = false;

    if (!panStateRef.current) {
      applyViewportStyleVars(viewport);
    }
  }, [applyViewportStyleVars, stopZoomAnimation, viewport]);

  useEffect(() => {
    if (!gridElement && !contentElement) {
      return;
    }

    applyViewportStyleVars(viewportRef.current);
  }, [applyViewportStyleVars, contentElement, gridElement]);

  useEffect(() => {
    const container = containerElement;

    if (!container) {
      containerRectRef.current = null;
      return undefined;
    }

    measureContainerRect();

    let resizeObserver = null;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        measureContainerRect();
      });
      resizeObserver.observe(container);
    }

    function handleWindowResize() {
      measureContainerRect();
    }

    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("scroll", handleWindowResize, true);

    return () => {
      resizeObserver?.disconnect?.();
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("scroll", handleWindowResize, true);
    };
  }, [containerElement, measureContainerRect]);

  const toCanvasPoint = useCallback((clientX, clientY) => {
    const rect = containerRectRef.current ?? measureContainerRect();

    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, [measureContainerRect]);

  const toWorldPoint = useCallback((clientX, clientY) => {
    const rect = containerRectRef.current ?? measureContainerRect();

    return clientToWorldPoint(rect, viewportRef.current, clientX, clientY);
  }, [measureContainerRect]);

  const getViewportCenter = useCallback(() => (
    getViewportCenterPoint(containerRectRef.current ?? measureContainerRect(), viewportRef.current)
  ), [measureContainerRect]);

  const getContainerRectSnapshot = useCallback(() => (
    containerRectRef.current ?? measureContainerRect()
  ), [measureContainerRect]);

  const getVisibleWorldRect = useCallback((padding = 0) => {
    const rect = containerRectRef.current ?? measureContainerRect();

    if (!rect) {
      return null;
    }

    return {
      left: (-viewportRef.current.x - padding) / viewportRef.current.zoom,
      top: (-viewportRef.current.y - padding) / viewportRef.current.zoom,
      right: (rect.width - viewportRef.current.x + padding) / viewportRef.current.zoom,
      bottom: (rect.height - viewportRef.current.y + padding) / viewportRef.current.zoom,
    };
  }, [measureContainerRect]);

  const zoomToWorldPoint = useCallback((canvasPoint, worldPoint, nextZoom) => {
    const nextViewport = getViewportForWorldPoint(canvasPoint, worldPoint, nextZoom);
    stopZoomAnimation();
    applyRenderedViewport(nextViewport);
    scheduleViewportCommit(nextViewport, { immediate: true });
  }, [applyRenderedViewport, scheduleViewportCommit, stopZoomAnimation]);

  const centerOnWorldPoint = useCallback((worldPoint) => {
    const rect = containerRectRef.current ?? measureContainerRect();

    if (!rect || !worldPoint) {
      return false;
    }

    const nextViewport = getViewportForWorldPoint(
      { x: rect.width / 2, y: rect.height / 2 },
      worldPoint,
      viewportRef.current.zoom,
    );

    stopZoomAnimation();
    applyRenderedViewport(nextViewport);
    scheduleViewportCommit(nextViewport, { immediate: true });
    return true;
  }, [applyRenderedViewport, measureContainerRect, scheduleViewportCommit, stopZoomAnimation]);

  const zoomAtCanvasPoint = useCallback((canvasPoint, nextZoom) => {
    const vp = viewportRef.current;
    const worldPoint = {
      x: (canvasPoint.x - vp.x) / vp.zoom,
      y: (canvasPoint.y - vp.y) / vp.zoom,
    };

    zoomToWorldPoint(canvasPoint, worldPoint, nextZoom);
  }, [zoomToWorldPoint]);

  const zoomAtViewportCenter = useCallback((nextZoom) => {
    const rect = getClientRect(containerElement);
    const canvasPoint = rect
      ? { x: rect.width / 2, y: rect.height / 2 }
      : { x: 0, y: 0 };

    zoomAtCanvasPoint(canvasPoint, nextZoom);
  }, [containerElement, zoomAtCanvasPoint]);

  const setZoom = useCallback((nextZoom) => {
    zoomAtViewportCenter(nextZoom);
  }, [zoomAtViewportCenter]);

  const zoomByStep = useCallback((direction) => {
    const currentZoom = viewportRef.current.zoom;
    const nextZoom = direction > 0
      ? getNextZoomStop(currentZoom)
      : getPreviousZoomStop(currentZoom);
    setZoom(nextZoom);
  }, [setZoom]);

  // Jumps straight to a viewport (no easing) and commits it.
  const setViewportImmediate = useCallback((nextViewport) => {
    if (!nextViewport) {
      return false;
    }

    stopZoomAnimation();
    applyRenderedViewport(nextViewport);
    pendingViewportRef.current = null;
    committedViewportRef.current = nextViewport;
    targetViewportRef.current = nextViewport;
    onViewportChange(nextViewport);
    return true;
  }, [applyRenderedViewport, onViewportChange, stopZoomAnimation]);

  const zoomToBounds = useCallback((worldBounds) => {
    const rect = getClientRect(containerElement);
    return setViewportImmediate(getViewportForWorldBounds(rect, worldBounds));
  }, [containerElement, setViewportImmediate]);

  const beginCanvasPan = useCallback((event) => {
    if (event.button !== 0 && event.button !== 1) {
      return false;
    }

    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startViewportX: viewportRef.current.x,
      startViewportY: viewportRef.current.y,
    };
    setIsPanning(true);
    return true;
  }, []);

  useEffect(() => {
    const container = containerElement;
    if (!container) return;

    function handleWheel(event) {
      event.preventDefault();

      // While a drag-pan (middle button or hand tool) is under way the wheel
      // does nothing: a wheel nudged by accident mid-pan used to jolt the
      // view.
      if (panStateRef.current) {
        return;
      }

      const vp = viewportRef.current;
      const rect = getClientRect(container);

      // Zoom around the pointer on: a mouse wheel (no modifier needed), a
      // trackpad pinch (reported as a wheel event with ctrlKey set), or
      // Ctrl/Cmd + any wheel. A two-finger trackpad scroll pans, and
      // Shift + mouse wheel pans sideways.
      if (event.ctrlKey || event.metaKey || (!event.shiftKey && isMouseWheelEvent(event))) {
        const canvasPoint = toCanvasPoint(event.clientX, event.clientY);
        const worldPoint = {
          x: (canvasPoint.x - vp.x) / vp.zoom,
          y: (canvasPoint.y - vp.y) / vp.zoom,
        };
        const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        const normalizedDelta = normalizeWheelZoomDelta(
          dominantDelta,
          event.deltaMode,
          rect?.height ?? 800,
        );
        const cappedDelta = Math.max(-ZOOM_WHEEL_MAX_DELTA, Math.min(ZOOM_WHEEL_MAX_DELTA, normalizedDelta));
        const nextZoom = clampViewportZoom(vp.zoom * Math.exp(-cappedDelta * ZOOM_WHEEL_SENSITIVITY));
        const nextViewport = getViewportForWorldPoint(canvasPoint, worldPoint, nextZoom);

        targetViewportRef.current = nextViewport;
        markZoomActive();
        ensureZoomAnimation();
        scheduleViewportCommit(nextViewport, { immediate: false });
        return;
      }

      let panDeltaX = normalizeWheelZoomDelta(event.deltaX, event.deltaMode, rect?.width ?? 800);
      let panDeltaY = normalizeWheelZoomDelta(event.deltaY, event.deltaMode, rect?.height ?? 800);

      // A plain mouse wheel reports only a vertical delta; Shift+wheel is
      // the standard way to pan horizontally with one, matching Figma.
      if (event.shiftKey && panDeltaX === 0 && panDeltaY !== 0) {
        panDeltaX = panDeltaY;
        panDeltaY = 0;
      }

      const nextViewport = {
        ...vp,
        x: vp.x - panDeltaX,
        y: vp.y - panDeltaY,
      };

      // Pan tracks the trackpad 1:1, same as a pointer-drag pan -- no
      // eased/animated interpolation, which would feel laggy here. The
      // viewport is still only committed (persisted) once scrolling settles,
      // so a fast scroll gesture doesn't flood state updates.
      stopZoomAnimation();
      applyRenderedViewport(nextViewport);
      scheduleViewportCommit(nextViewport, { immediate: false });

      if (wheelPanSettleTimeoutRef.current) {
        window.clearTimeout(wheelPanSettleTimeoutRef.current);
      }
      wheelPanSettleTimeoutRef.current = window.setTimeout(() => {
        wheelPanSettleTimeoutRef.current = 0;
        commitPendingViewport();
      }, VIEWPORT_COMMIT_DELAY_MS);
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [
    applyRenderedViewport,
    commitPendingViewport,
    containerElement,
    ensureZoomAnimation,
    markZoomActive,
    scheduleViewportCommit,
    stopZoomAnimation,
    toCanvasPoint,
  ]);

  useEffect(() => {
    // A pointer can report moves several times per frame: keep only the
    // latest and apply it once per animation frame.
    let pendingEvent = null;

    function applyPendingPan() {
      panFrameRef.current = 0;
      const event = pendingEvent;
      pendingEvent = null;

      if (!event || !panStateRef.current) {
        return;
      }

      const deltaX = event.clientX - panStateRef.current.startX;
      const deltaY = event.clientY - panStateRef.current.startY;

      const nextViewport = {
        ...viewportRef.current,
        x: panStateRef.current.startViewportX + deltaX,
        y: panStateRef.current.startViewportY + deltaY,
      };

      panStateRef.current.lastViewport = nextViewport;
      targetViewportRef.current = nextViewport;
      applyRenderedViewport(nextViewport);
    }

    function handlePointerMove(event) {
      if (!panStateRef.current) {
        return;
      }

      pendingEvent = event;

      if (!panFrameRef.current) {
        panFrameRef.current = window.requestAnimationFrame(applyPendingPan);
      }
    }

    function stopPanning() {
      if (!panStateRef.current) {
        return;
      }

      // Land exactly where the pointer let go, not a frame behind it.
      if (panFrameRef.current) {
        window.cancelAnimationFrame(panFrameRef.current);
        applyPendingPan();
      }

      const commitStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const { lastViewport } = panStateRef.current;

      panStateRef.current = null;
      setIsPanning(false);

      if (lastViewport) {
        committedViewportRef.current = lastViewport;
        targetViewportRef.current = lastViewport;
        onViewportChange(lastViewport);
      } else {
        applyViewportStyleVars(viewportRef.current);
      }

      const commitEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      recordInteractionCommit("pan", commitEnd - commitStart, {
        committed: Boolean(lastViewport),
      });
    }

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", stopPanning, true);
    window.addEventListener("pointercancel", stopPanning, true);
    window.addEventListener("blur", stopPanning);

    return () => {
      window.cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = 0;
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", stopPanning, true);
      window.removeEventListener("pointercancel", stopPanning, true);
      window.removeEventListener("blur", stopPanning);
    };
  }, [applyRenderedViewport, applyViewportStyleVars, onViewportChange]);

  useEffect(() => () => {
    if (wheelStopTimeoutRef.current) {
      window.clearTimeout(wheelStopTimeoutRef.current);
    }
    if (wheelPanSettleTimeoutRef.current) {
      window.clearTimeout(wheelPanSettleTimeoutRef.current);
    }
    stopZoomAnimation();
  }, [stopZoomAnimation]);

  const getViewportSnapshot = useCallback(() => viewportRef.current, []);
  const zoomIn = useCallback(() => zoomByStep(1), [zoomByStep]);
  const zoomOut = useCallback(() => zoomByStep(-1), [zoomByStep]);

  // One object for as long as its parts are the same: many effects depend
  // on `canvas`, and a fresh object each render re-ran (re-subscribed) all
  // of them on every board render.
  return useMemo(() => ({
    containerRef,
    gridRef,
    contentRef,
    isPanning,
    isZooming,
    viewport,
    getViewportSnapshot,
    getContainerRectSnapshot,
    clientToCanvasPoint: toCanvasPoint,
    clientToWorldPoint: toWorldPoint,
    getViewportCenter,
    getVisibleWorldRect,
    beginCanvasPan,
    subscribeViewportTransform,
    centerOnWorldPoint,
    setZoom,
    zoomIn,
    zoomOut,
    zoomToBounds,
    setViewportImmediate,
  }), [
    beginCanvasPan,
    centerOnWorldPoint,
    containerRef,
    contentRef,
    getContainerRectSnapshot,
    getViewportCenter,
    getViewportSnapshot,
    getVisibleWorldRect,
    gridRef,
    isPanning,
    isZooming,
    setViewportImmediate,
    setZoom,
    subscribeViewportTransform,
    toCanvasPoint,
    toWorldPoint,
    viewport,
    zoomIn,
    zoomOut,
    zoomToBounds,
  ]);
}
