import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  const contentRef = useRef(null);
  const containerRectRef = useRef(null);
  const panStateRef = useRef(null);
  const viewportRef = useRef(viewport);
  const [isPanning, setIsPanning] = useState(false);

  const measureContainerRect = useCallback(() => {
    containerRectRef.current = getClientRect(containerRef.current);
    return containerRectRef.current;
  }, []);

  const applyViewportStyleVars = useCallback((nextViewport) => {
    const gridStyleVars = getCanvasGridStyleVars(nextViewport);
    const contentStyleVars = getCanvasContentStyleVars(nextViewport);

    Object.entries(gridStyleVars).forEach(([name, value]) => {
      gridRef.current?.style?.setProperty(name, value);
    });

    Object.entries(contentStyleVars).forEach(([name, value]) => {
      contentRef.current?.style?.setProperty(name, value);
    });
  }, []);

  useEffect(() => {
    viewportRef.current = viewport;

    if (!panStateRef.current) {
      applyViewportStyleVars(viewport);
    }
  }, [applyViewportStyleVars, viewport]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
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
  }, [measureContainerRect]);

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
    onViewportChange(getViewportForWorldPoint(canvasPoint, worldPoint, nextZoom));
  }, [onViewportChange]);

  const zoomAtCanvasPoint = useCallback((canvasPoint, nextZoom) => {
    const vp = viewportRef.current;
    const worldPoint = {
      x: (canvasPoint.x - vp.x) / vp.zoom,
      y: (canvasPoint.y - vp.y) / vp.zoom,
    };

    zoomToWorldPoint(canvasPoint, worldPoint, nextZoom);
  }, [zoomToWorldPoint]);

  const zoomAtViewportCenter = useCallback((nextZoom) => {
    const rect = getClientRect(containerRef.current);
    const canvasPoint = rect
      ? { x: rect.width / 2, y: rect.height / 2 }
      : { x: 0, y: 0 };

    zoomAtCanvasPoint(canvasPoint, nextZoom);
  }, [zoomAtCanvasPoint]);

  const setZoom = useCallback((nextZoom) => {
    zoomAtViewportCenter(nextZoom);
  }, [zoomAtViewportCenter]);

  const zoomByStep = useCallback((direction) => {
    const step = direction > 0 ? 1.2 : 1 / 1.2;
    setZoom(viewportRef.current.zoom * step);
  }, [setZoom]);

  const zoomToBounds = useCallback((worldBounds) => {
    const rect = getClientRect(containerRef.current);
    const nextViewport = getViewportForWorldBounds(rect, worldBounds);

    if (!nextViewport) {
      return false;
    }

    onViewportChange(nextViewport);
    return true;
  }, [onViewportChange]);

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
    const container = containerRef.current;
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

      zoomToWorldPoint(canvasPoint, worldPoint, nextZoom);
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [onViewportChange, toCanvasPoint, zoomToWorldPoint]);

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

  const gridStyleVars = useMemo(() => getCanvasGridStyleVars(viewport), [viewport]);
  const contentStyleVars = useMemo(() => getCanvasContentStyleVars(viewport), [viewport]);

  return {
    containerRef,
    gridRef,
    contentRef,
    isPanning,
    viewport,
    containerRect: containerRectRef.current,
    gridStyleVars,
    contentStyleVars,
    clientToCanvasPoint: toCanvasPoint,
    clientToWorldPoint: toWorldPoint,
    getViewportCenter,
    getVisibleWorldRect,
    beginCanvasPan,
    setZoom,
    zoomIn: () => zoomByStep(1),
    zoomOut: () => zoomByStep(-1),
    zoomToBounds,
  };
}
