import { useCallback, useEffect, useRef } from "react";

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;

function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function useCanvas({ viewport, onViewportChange }) {
  const containerRef = useRef(null);
  const panStateRef = useRef(null);

  const toWorldPoint = useCallback((clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  }, [viewport]);

  const handleCanvasPointerDown = useCallback((event) => {
    const isCanvasBackground = event.target === event.currentTarget
      || event.target.classList?.contains("canvas__content");

    if (event.button !== 0 || !isCanvasBackground) {
      return;
    }

    panStateRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      viewport,
    };
  }, [viewport]);

  const handleCanvasWheel = useCallback((event) => {
    event.preventDefault();

    if (!containerRef.current) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const anchor = toWorldPoint(event.clientX, event.clientY);
      const nextZoom = clampZoom(viewport.zoom - event.deltaY * 0.0015);
      const rect = containerRef.current.getBoundingClientRect();

      onViewportChange({
        x: event.clientX - rect.left - anchor.x * nextZoom,
        y: event.clientY - rect.top - anchor.y * nextZoom,
        zoom: nextZoom,
      });

      return;
    }

    onViewportChange({
      ...viewport,
      x: viewport.x - event.deltaX,
      y: viewport.y - event.deltaY,
    });
  }, [onViewportChange, toWorldPoint, viewport]);

  const getViewportCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return {
        x: Math.round((-viewport.x + 480) / viewport.zoom),
        y: Math.round((-viewport.y + 320) / viewport.zoom),
      };
    }

    return {
      x: Math.round((rect.width / 2 - viewport.x) / viewport.zoom),
      y: Math.round((rect.height / 2 - viewport.y) / viewport.zoom),
    };
  }, [viewport]);

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
      panStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPanning);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPanning);
    };
  }, [onViewportChange]);

  return {
    containerRef,
    getViewportCenter,
    handleCanvasPointerDown,
    handleCanvasWheel,
  };
}
