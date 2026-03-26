import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordInteractionCommit, recordPointerMoveSample } from "../../lib/perf";
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
  const containerRectRef = useRef(null);
  const panStateRef = useRef(null);
  const viewportRef = useRef(viewport);
  const [liveViewport, setLiveViewport] = useState(null);
  const [isPanning, setIsPanning] = useState(false);

  const effectiveViewport = liveViewport ?? viewport;

  useEffect(() => {
    if (!panStateRef.current) {
      setLiveViewport(null);
    }
  }, [viewport]);

  viewportRef.current = effectiveViewport;

  const measureContainerRect = useCallback(() => {
    containerRectRef.current = getClientRect(containerRef.current);
    return containerRectRef.current;
  }, []);

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

      const moveStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const deltaX = event.clientX - panStateRef.current.startX;
      const deltaY = event.clientY - panStateRef.current.startY;

      const nextViewport = {
        ...viewportRef.current,
        x: panStateRef.current.startViewportX + deltaX,
        y: panStateRef.current.startViewportY + deltaY,
      };

      panStateRef.current.lastViewport = nextViewport;
      setLiveViewport(nextViewport);
      const moveEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      recordPointerMoveSample(moveEnd - moveStart);
    }

    function stopPanning() {
      if (!panStateRef.current) {
        return;
      }

      const commitStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const { lastViewport } = panStateRef.current;

      panStateRef.current = null;
      setLiveViewport(null);
      setIsPanning(false);

      if (lastViewport) {
        onViewportChange(lastViewport);
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
  }, [onViewportChange]);

  const gridStyleVars = useMemo(() => getCanvasGridStyleVars(effectiveViewport), [effectiveViewport]);
  const contentStyleVars = useMemo(() => getCanvasContentStyleVars(effectiveViewport), [effectiveViewport]);

  return {
    containerRef,
    isPanning,
    viewport: effectiveViewport,
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
