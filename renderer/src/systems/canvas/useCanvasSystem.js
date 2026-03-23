import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampViewportZoom,
  clientToCanvasPoint,
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
  const panStateRef = useRef(null);
  const viewportRef = useRef(viewport);
  const [isPanning, setIsPanning] = useState(false);

  viewportRef.current = viewport;

  const toCanvasPoint = useCallback((clientX, clientY) => (
    clientToCanvasPoint(containerRef.current, clientX, clientY)
  ), []);

  const toWorldPoint = useCallback((clientX, clientY) => (
    clientToWorldPoint(containerRef.current, viewportRef.current, clientX, clientY)
  ), []);

  const getViewportCenter = useCallback(() => (
    getViewportCenterPoint(containerRef.current, viewportRef.current)
  ), []);

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

      onViewportChange({
        ...viewportRef.current,
        x: panStateRef.current.startViewportX + deltaX,
        y: panStateRef.current.startViewportY + deltaY,
      });
    }

    function stopPanning() {
      if (!panStateRef.current) {
        return;
      }

      panStateRef.current = null;
      setIsPanning(false);
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

  const gridStyleVars = useMemo(() => getCanvasGridStyleVars(viewport), [viewport]);
  const contentStyleVars = useMemo(() => getCanvasContentStyleVars(viewport), [viewport]);

  return {
    containerRef,
    isPanning,
    gridStyleVars,
    contentStyleVars,
    clientToCanvasPoint: toCanvasPoint,
    clientToWorldPoint: toWorldPoint,
    getViewportCenter,
    beginCanvasPan,
    setZoom,
    zoomIn: () => zoomByStep(1),
    zoomOut: () => zoomByStep(-1),
    zoomToBounds,
  };
}
