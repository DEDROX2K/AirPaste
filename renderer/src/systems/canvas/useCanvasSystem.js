import { useCallback, useEffect, useRef, useState } from "react";
import { recordInteractionCommit } from "../../lib/perf";
import {
  areViewportTransformsClose,
  clampViewportZoom,
  getNextZoomStop,
  getPreviousZoomStop,
  interpolateViewport,
  clientToWorldPoint,
  getCanvasContentStyleVars,
  getCanvasGridStyleVars,
  getClientRect,
  getViewportForWorldBounds,
  getViewportForWorldPoint,
  getViewportCenterPoint,
  normalizeWheelZoomDelta,
} from "./canvasMath";

const ZOOM_INTERPOLATION_RATE = 18;
const ZOOM_SETTLE_DELAY_MS = 120;

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
  const zoomAnimationFrameRef = useRef(0);
  const zoomLastFrameTimeRef = useRef(0);
  const zoomCommitWhenSettledRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);

  const containerRef = useCallback((node) => {
    setContainerElement(node);
  }, []);

  const gridRef = useCallback((node) => {
    setGridElement(node);
  }, []);

  const contentRef = useCallback((node) => {
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
    const contentStyleVars = getCanvasContentStyleVars(nextViewport);

    Object.entries(gridStyleVars).forEach(([name, value]) => {
      gridElement?.style?.setProperty(name, value);
    });

    Object.entries(contentStyleVars).forEach(([name, value]) => {
      contentElement?.style?.setProperty(name, value);
    });
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

  const finalizeAnimatedZoom = useCallback(() => {
    const pendingViewport = pendingViewportRef.current;

    if (!pendingViewport) {
      zoomCommitWhenSettledRef.current = false;
      setIsZooming(false);
      return;
    }

    stopZoomAnimation();
    applyRenderedViewport(pendingViewport);
    commitPendingViewport();
    setIsZooming(false);
  }, [applyRenderedViewport, commitPendingViewport, stopZoomAnimation]);

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

    if (wheelStopTimeoutRef.current) {
      window.clearTimeout(wheelStopTimeoutRef.current);
    }

    wheelStopTimeoutRef.current = window.setTimeout(() => {
      wheelStopTimeoutRef.current = 0;
      zoomCommitWhenSettledRef.current = true;

      if (!zoomAnimationFrameRef.current || areViewportTransformsClose(viewportRef.current, targetViewportRef.current)) {
        finalizeAnimatedZoom();
      }
    }, ZOOM_SETTLE_DELAY_MS);
  }, [finalizeAnimatedZoom]);

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

  const zoomToBounds = useCallback((worldBounds) => {
    const rect = getClientRect(containerElement);
    const nextViewport = getViewportForWorldBounds(rect, worldBounds);

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
  }, [applyRenderedViewport, containerElement, onViewportChange, stopZoomAnimation]);

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

      const vp = viewportRef.current;
      const canvasPoint = toCanvasPoint(event.clientX, event.clientY);
      const worldPoint = {
        x: (canvasPoint.x - vp.x) / vp.zoom,
        y: (canvasPoint.y - vp.y) / vp.zoom,
      };
      const rect = getClientRect(container);
      const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const normalizedDelta = normalizeWheelZoomDelta(
        dominantDelta,
        event.deltaMode,
        rect?.height ?? 800,
      );
      const nextZoom = clampViewportZoom(vp.zoom * Math.exp(-normalizedDelta * 0.0015));
      const nextViewport = getViewportForWorldPoint(canvasPoint, worldPoint, nextZoom);

      targetViewportRef.current = nextViewport;
      markZoomActive();
      ensureZoomAnimation();
      scheduleViewportCommit(nextViewport, { immediate: false });
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [containerElement, ensureZoomAnimation, markZoomActive, scheduleViewportCommit, toCanvasPoint]);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!panStateRef.current) {
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

    function stopPanning() {
      if (!panStateRef.current) {
        return;
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
    stopZoomAnimation();
  }, [stopZoomAnimation]);

  return {
    containerRef,
    gridRef,
    contentRef,
    isPanning,
    isZooming,
    viewport,
    getViewportSnapshot: () => viewportRef.current,
    getContainerRectSnapshot,
    containerRect: containerRectRef.current,
    clientToCanvasPoint: toCanvasPoint,
    clientToWorldPoint: toWorldPoint,
    getViewportCenter,
    getVisibleWorldRect,
    beginCanvasPan,
    subscribeViewportTransform,
    centerOnWorldPoint,
    setZoom,
    zoomIn: () => zoomByStep(1),
    zoomOut: () => zoomByStep(-1),
    zoomToBounds,
  };
}
