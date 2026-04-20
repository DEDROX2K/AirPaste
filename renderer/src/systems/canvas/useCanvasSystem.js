import { useCallback, useEffect, useRef, useState } from "react";
import { recordInteractionCommit } from "../../lib/perf";
import {
  clampViewportZoom,
  clientToWorldPoint,
  getCanvasContentStyleVars,
  getCanvasGridStyleVars,
  getClientRect,
  getViewportForWorldBounds,
  getViewportForWorldPoint,
  getViewportCenterPoint,
  normalizeWheelZoomDelta,
} from "./canvasMath";

export function useCanvasSystem({ viewport, onViewportChange }) {
  const [containerElement, setContainerElement] = useState(null);
  const [gridElement, setGridElement] = useState(null);
  const [contentElement, setContentElement] = useState(null);
  const containerRectRef = useRef(null);
  const panStateRef = useRef(null);
  const viewportRef = useRef(viewport);
  const pendingViewportRef = useRef(null);
  const viewportListenerSetRef = useRef(new Set());
  const wheelStopTimeoutRef = useRef(0);
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
    onViewportChange(pendingViewport);
  }, [onViewportChange]);

  const scheduleViewportCommit = useCallback((nextViewport, options = {}) => {
    pendingViewportRef.current = nextViewport;

    if (options.immediate) {
      commitPendingViewport();
    }
  }, [commitPendingViewport]);

  const markZoomActive = useCallback(() => {
    setIsZooming(true);

    if (wheelStopTimeoutRef.current) {
      window.clearTimeout(wheelStopTimeoutRef.current);
    }

    wheelStopTimeoutRef.current = window.setTimeout(() => {
      wheelStopTimeoutRef.current = 0;
      commitPendingViewport();
      setIsZooming(false);
    }, 120);
  }, [commitPendingViewport]);

  useEffect(() => {
    viewportRef.current = viewport;
    pendingViewportRef.current = null;

    if (!panStateRef.current) {
      applyViewportStyleVars(viewport);
    }
  }, [applyViewportStyleVars, viewport]);

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
    viewportRef.current = nextViewport;
    applyViewportStyleVars(nextViewport);
    scheduleViewportCommit(nextViewport, { immediate: true });
  }, [applyViewportStyleVars, scheduleViewportCommit]);

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
    const step = direction > 0 ? 1.2 : 1 / 1.2;
    setZoom(viewportRef.current.zoom * step);
  }, [setZoom]);

  const zoomToBounds = useCallback((worldBounds) => {
    const rect = getClientRect(containerElement);
    const nextViewport = getViewportForWorldBounds(rect, worldBounds);

    if (!nextViewport) {
      return false;
    }

    viewportRef.current = nextViewport;
    applyViewportStyleVars(nextViewport);
    onViewportChange(nextViewport);
    return true;
  }, [applyViewportStyleVars, containerElement, onViewportChange]);

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

      viewportRef.current = nextViewport;
      applyViewportStyleVars(nextViewport);
      markZoomActive();
      scheduleViewportCommit(nextViewport, { immediate: false });
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [applyViewportStyleVars, containerElement, markZoomActive, scheduleViewportCommit, toCanvasPoint]);

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
      viewportRef.current = nextViewport;
      applyViewportStyleVars(nextViewport);
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
  }, [applyViewportStyleVars, onViewportChange]);

  useEffect(() => () => {
    if (wheelStopTimeoutRef.current) {
      window.clearTimeout(wheelStopTimeoutRef.current);
    }
  }, []);

  return {
    containerRef,
    gridRef,
    contentRef,
    isPanning,
    isZooming,
    viewport,
    getViewportSnapshot: () => viewportRef.current,
    containerRect: containerRectRef.current,
    clientToCanvasPoint: toCanvasPoint,
    clientToWorldPoint: toWorldPoint,
    getViewportCenter,
    getVisibleWorldRect,
    beginCanvasPan,
    subscribeViewportTransform,
    setZoom,
    zoomIn: () => zoomByStep(1),
    zoomOut: () => zoomByStep(-1),
    zoomToBounds,
  };
}
