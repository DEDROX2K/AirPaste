import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;
const MINIMAP_PADDING = 16;
const WORLD_PADDING_MIN = 120;
const WORLD_PADDING_RATIO = 0.08;
const MIN_VIEWPORT_SIZE = 10;

function isFiniteRectTile(tile) {
  return Number.isFinite(tile?.x)
    && Number.isFinite(tile?.y)
    && Number.isFinite(tile?.width)
    && Number.isFinite(tile?.height);
}

function buildWorldBounds(tiles) {
  if (!tiles.length) {
    return null;
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  tiles.forEach((tile) => {
    left = Math.min(left, tile.x);
    top = Math.min(top, tile.y);
    right = Math.max(right, tile.x + Math.max(1, tile.width));
    bottom = Math.max(bottom, tile.y + Math.max(1, tile.height));
  });

  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const paddingX = Math.max(WORLD_PADDING_MIN, width * WORLD_PADDING_RATIO);
  const paddingY = Math.max(WORLD_PADDING_MIN, height * WORLD_PADDING_RATIO);

  return {
    left: left - paddingX,
    top: top - paddingY,
    width: width + paddingX * 2,
    height: height + paddingY * 2,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function CanvasMiniMap({ canvas, tiles, hidden = false }) {
  const panelRef = useRef(null);
  const draggingRef = useRef(false);
  const [viewport, setViewport] = useState(() => canvas.getViewportSnapshot());
  const [containerRect, setContainerRect] = useState(() => canvas.getContainerRectSnapshot());

  useEffect(() => canvas.subscribeViewportTransform((nextViewport) => {
    setViewport(nextViewport);
  }), [canvas]);

  useEffect(() => {
    const nextRect = canvas.getContainerRectSnapshot();
    setContainerRect((currentRect) => {
      if (
        currentRect?.width === nextRect?.width
        && currentRect?.height === nextRect?.height
        && currentRect?.left === nextRect?.left
        && currentRect?.top === nextRect?.top
      ) {
        return currentRect;
      }

      return nextRect;
    });
  }, [canvas, viewport]);

  useEffect(() => {
    function updateContainerRect() {
      setContainerRect(canvas.getContainerRectSnapshot());
    }

    updateContainerRect();
    window.addEventListener("resize", updateContainerRect);
    window.addEventListener("scroll", updateContainerRect, true);

    return () => {
      window.removeEventListener("resize", updateContainerRect);
      window.removeEventListener("scroll", updateContainerRect, true);
    };
  }, [canvas]);

  const tileRects = useMemo(() => tiles.filter(isFiniteRectTile), [tiles]);
  const worldBounds = useMemo(() => buildWorldBounds(tileRects), [tileRects]);

  const mapState = useMemo(() => {
    if (!worldBounds || !containerRect) {
      return null;
    }

    const innerWidth = MINIMAP_WIDTH - MINIMAP_PADDING * 2;
    const innerHeight = MINIMAP_HEIGHT - MINIMAP_PADDING * 2;
    const scale = Math.min(
      innerWidth / Math.max(1, worldBounds.width),
      innerHeight / Math.max(1, worldBounds.height),
    );
    const contentWidth = worldBounds.width * scale;
    const contentHeight = worldBounds.height * scale;
    const offsetX = (MINIMAP_WIDTH - contentWidth) / 2;
    const offsetY = (MINIMAP_HEIGHT - contentHeight) / 2;

    const projectX = (worldX) => offsetX + (worldX - worldBounds.left) * scale;
    const projectY = (worldY) => offsetY + (worldY - worldBounds.top) * scale;

    const visibleLeft = (-viewport.x) / viewport.zoom;
    const visibleTop = (-viewport.y) / viewport.zoom;
    const visibleWidth = containerRect.width / viewport.zoom;
    const visibleHeight = containerRect.height / viewport.zoom;

    return {
      tiles: tileRects.map((tile) => ({
        id: tile.id,
        x: projectX(tile.x),
        y: projectY(tile.y),
        width: Math.max(2, tile.width * scale),
        height: Math.max(2, tile.height * scale),
      })),
      viewportRect: {
        x: projectX(visibleLeft),
        y: projectY(visibleTop),
        width: Math.max(MIN_VIEWPORT_SIZE, visibleWidth * scale),
        height: Math.max(MIN_VIEWPORT_SIZE, visibleHeight * scale),
      },
      projectBack(clientX, clientY, panelRect) {
        const x = clamp(clientX - panelRect.left, 0, MINIMAP_WIDTH);
        const y = clamp(clientY - panelRect.top, 0, MINIMAP_HEIGHT);
        return {
          x: worldBounds.left + ((x - offsetX) / scale),
          y: worldBounds.top + ((y - offsetY) / scale),
        };
      },
    };
  }, [containerRect, tileRects, viewport, worldBounds]);

  const panToMinimapPoint = useCallback((clientX, clientY) => {
    if (!mapState || !panelRef.current) {
      return;
    }

    const panelRect = panelRef.current.getBoundingClientRect();
    const worldPoint = mapState.projectBack(clientX, clientY, panelRect);
    canvas.centerOnWorldPoint(worldPoint);
  }, [canvas, mapState]);

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panToMinimapPoint(event.clientX, event.clientY);
  }, [panToMinimapPoint]);

  const handlePointerMove = useCallback((event) => {
    if (!draggingRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    panToMinimapPoint(event.clientX, event.clientY);
  }, [panToMinimapPoint]);

  const handlePointerUp = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  useEffect(() => {
    window.addEventListener("pointerup", stopDragging, true);
    window.addEventListener("pointercancel", stopDragging, true);
    window.addEventListener("blur", stopDragging);

    return () => {
      window.removeEventListener("pointerup", stopDragging, true);
      window.removeEventListener("pointercancel", stopDragging, true);
      window.removeEventListener("blur", stopDragging);
    };
  }, [stopDragging]);

  if (hidden || !mapState || tileRects.length === 0) {
    return null;
  }

  return (
    <div className="canvas-minimap" aria-hidden="true">
      <div
        ref={panelRef}
        className="canvas-minimap__panel"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <svg
          className="canvas-minimap__svg"
          width={MINIMAP_WIDTH}
          height={MINIMAP_HEIGHT}
          viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
          role="presentation"
        >
          {mapState.tiles.map((tile) => (
            <rect
              key={tile.id}
              className="canvas-minimap__tile"
              x={tile.x}
              y={tile.y}
              width={tile.width}
              height={tile.height}
              rx="2.5"
              ry="2.5"
            />
          ))}
          <rect
            className="canvas-minimap__viewport"
            x={mapState.viewportRect.x}
            y={mapState.viewportRect.y}
            width={mapState.viewportRect.width}
            height={mapState.viewportRect.height}
            rx="4"
            ry="4"
          />
        </svg>
      </div>
    </div>
  );
}
