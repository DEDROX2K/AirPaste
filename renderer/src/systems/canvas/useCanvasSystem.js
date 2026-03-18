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
  const [isPanning, setIsPanning] = useState(false);

  const toCanvasPoint = useCallback((clientX, clientY) => (
    clientToCanvasPoint(containerRef.current, clientX, clientY)
  ), []);

  const toWorldPoint = useCallback((clientX, clientY) => (
    clientToWorldPoint(containerRef.current, viewport, clientX, clientY)
  ), [viewport]);

  const getViewportCenter = useCallback(() => (
    getViewportCenterPoint(containerRef.current, viewport)
  ), [viewport]);

  const zoomToWorldPoint = useCallback((canvasPoint, worldPoint, nextZoom) => {
    onViewportChange(getViewportForWorldPoint(canvasPoint, worldPoint, nextZoom));
  }, [onViewportChange]);

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
      pointerX: event.clientX,
      pointerY: event.clientY,
      viewport,
    };
    setIsPanning(true);
    return true;
  }, [viewport]);

  const handleCanvasWheel = useCallback((event) => {
    event.preventDefault();

    const canvasPoint = toCanvasPoint(event.clientX, event.clientY);
    const worldPoint = toWorldPoint(event.clientX, event.clientY);
    const rect = getClientRect(containerRef.current);
    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    const normalizedDelta = normalizeWheelZoomDelta(
      dominantDelta,
      event.deltaMode,
      rect?.height ?? 800,
    );
    const nextZoom = clampViewportZoom(viewport.zoom * Math.exp(-normalizedDelta * 0.0015));

    if (Math.abs(nextZoom - viewport.zoom) < 0.0001) {
      return;
    }

    zoomToWorldPoint(canvasPoint, worldPoint, nextZoom);
  }, [toCanvasPoint, toWorldPoint, viewport.zoom, zoomToWorldPoint]);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!panStateRef.current) {
        return;
      }

      const deltaX = event.clientX - panStateRef.current.pointerX;
      const deltaY = event.clientY - panStateRef.current.pointerY;

      onViewportChange({
        ...panStateRef.current.viewport,
        x: panStateRef.current.viewport.x + deltaX,
        y: panStateRef.current.viewport.y + deltaY,
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
    handleCanvasWheel,
    zoomToBounds,
  };
}
