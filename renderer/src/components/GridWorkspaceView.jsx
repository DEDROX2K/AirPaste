import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Card from "./Card";
import { useAppContext } from "../context/useAppContext";
import { AppEmptyState } from "./ui/app";

const COLUMN_WIDTH_MIN = 240;
const COLUMN_WIDTH_MAX = 320;
const GRID_GAP = 16;
const GRID_PADDING_X = 24;
const GRID_PADDING_Y = 20;
const GRID_CARD_HEIGHT_FALLBACK = 320;
const EMPTY_SET = new Set();
const EMPTY_ARRAY = [];
const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;
const MINIMAP_PADDING = 16;
const MINIMAP_WORLD_PADDING = 24;
const MINIMAP_MIN_VIEWPORT = 10;

function getColumnMetrics(containerWidth) {
  const usableWidth = Math.max(0, containerWidth - (GRID_PADDING_X * 2));

  if (usableWidth <= 0) {
    return {
      columnCount: 1,
      columnWidth: COLUMN_WIDTH_MIN,
      usableWidth,
    };
  }

  let columnCount = Math.max(1, Math.floor((usableWidth + GRID_GAP) / (COLUMN_WIDTH_MIN + GRID_GAP)));
  let columnWidth = Math.floor((usableWidth - (GRID_GAP * (columnCount - 1))) / columnCount);

  while (columnCount > 1 && columnWidth > COLUMN_WIDTH_MAX) {
    columnCount += 1;
    columnWidth = Math.floor((usableWidth - (GRID_GAP * (columnCount - 1))) / columnCount);
  }

  return {
    columnCount: Math.max(1, columnCount),
    columnWidth: Math.max(1, Math.min(COLUMN_WIDTH_MAX, columnWidth)),
    usableWidth,
  };
}

function estimateSurfaceHeight(tile, columnWidth) {
  const sourceWidth = Math.max(1, Number(tile?.width) || columnWidth);
  const sourceHeight = Math.max(1, Number(tile?.height) || GRID_CARD_HEIGHT_FALLBACK);
  return Math.max(1, Math.round((sourceHeight / sourceWidth) * columnWidth));
}

function computeMasonryLayout(tiles, columnWidth, columnCount) {
  if (!tiles.length || columnCount <= 0 || columnWidth <= 0) {
    return { positions: {}, totalHeight: 0 };
  }

  const columnHeights = Array.from({ length: columnCount }, () => GRID_PADDING_Y);
  const positions = {};

  for (const tile of tiles) {
    const shortestColumnHeight = Math.min(...columnHeights);
    const columnIndex = columnHeights.indexOf(shortestColumnHeight);
    const x = GRID_PADDING_X + (columnIndex * (columnWidth + GRID_GAP));
    const y = shortestColumnHeight;

    positions[tile.id] = {
      x,
      y,
      width: columnWidth,
      height: tile.measuredHeight,
      surfaceHeight: tile.surfaceHeight,
    };

    columnHeights[columnIndex] = y + tile.measuredHeight + GRID_GAP;
  }

  const totalHeight = Math.max(...columnHeights) - GRID_GAP + GRID_PADDING_Y;
  return { positions, totalHeight };
}

function buildGridTileMeta(tile, {
  isSelected,
  isHovered,
  isFocused,
  width,
  surfaceHeight,
}) {
  return {
    isSelected,
    isHovered,
    isFocused,
    interactionState: isSelected ? "selected" : isHovered ? "hovered" : isFocused ? "focused" : "idle",
    styleVars: {
      "--tile-width": `${width}px`,
      "--tile-height": `${surfaceHeight}px`,
      "--tile-x": "0px",
      "--tile-y": "0px",
      "--tile-z": isSelected ? 2 : 1,
    },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildMiniMapBounds(positions, totalHeight, viewportWidth) {
  const entries = Object.values(positions ?? {});

  if (!entries.length) {
    return null;
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  entries.forEach((entry) => {
    left = Math.min(left, entry.x);
    top = Math.min(top, entry.y);
    right = Math.max(right, entry.x + entry.width);
    bottom = Math.max(bottom, entry.y + entry.height);
  });

  right = Math.max(right, viewportWidth);
  bottom = Math.max(bottom, totalHeight);

  return {
    left: Math.max(0, left - MINIMAP_WORLD_PADDING),
    top: Math.max(0, top - MINIMAP_WORLD_PADDING),
    width: Math.max(1, right - Math.max(0, left - MINIMAP_WORLD_PADDING) + MINIMAP_WORLD_PADDING),
    height: Math.max(1, bottom - Math.max(0, top - MINIMAP_WORLD_PADDING) + MINIMAP_WORLD_PADDING),
  };
}

function GridMiniMap({ positions, scrollContainerRef, totalHeight, visible }) {
  const panelRef = useRef(null);
  const draggingRef = useRef(false);
  const [scrollState, setScrollState] = useState({
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 0,
    clientHeight: 0,
    scrollWidth: 0,
    scrollHeight: 0,
  });

  useEffect(() => {
    const element = scrollContainerRef.current;

    if (!element) {
      return undefined;
    }

    const updateState = () => {
      setScrollState({
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
      });
    };

    updateState();
    element.addEventListener("scroll", updateState, { passive: true });
    window.addEventListener("resize", updateState);

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateState);
      resizeObserver.observe(element);
    }

    return () => {
      element.removeEventListener("scroll", updateState);
      window.removeEventListener("resize", updateState);
      resizeObserver?.disconnect?.();
    };
  }, [scrollContainerRef, positions, totalHeight]);

  const bounds = useMemo(
    () => buildMiniMapBounds(positions, totalHeight, scrollState.clientWidth),
    [positions, totalHeight, scrollState.clientWidth],
  );

  const mapState = useMemo(() => {
    if (!bounds) {
      return null;
    }

    const innerWidth = MINIMAP_WIDTH - MINIMAP_PADDING * 2;
    const innerHeight = MINIMAP_HEIGHT - MINIMAP_PADDING * 2;
    const scale = Math.min(
      innerWidth / Math.max(1, bounds.width),
      innerHeight / Math.max(1, bounds.height),
    );
    const contentWidth = bounds.width * scale;
    const contentHeight = bounds.height * scale;
    const offsetX = (MINIMAP_WIDTH - contentWidth) / 2;
    const offsetY = (MINIMAP_HEIGHT - contentHeight) / 2;
    const projectX = (worldX) => offsetX + (worldX - bounds.left) * scale;
    const projectY = (worldY) => offsetY + (worldY - bounds.top) * scale;

    return {
      tiles: Object.entries(positions).map(([tileId, entry]) => ({
        id: tileId,
        x: projectX(entry.x),
        y: projectY(entry.y),
        width: Math.max(2, entry.width * scale),
        height: Math.max(2, entry.height * scale),
      })),
      viewportRect: {
        x: projectX(scrollState.scrollLeft),
        y: projectY(scrollState.scrollTop),
        width: Math.max(MINIMAP_MIN_VIEWPORT, scrollState.clientWidth * scale),
        height: Math.max(MINIMAP_MIN_VIEWPORT, scrollState.clientHeight * scale),
      },
      toScrollPosition(clientX, clientY, panelRect) {
        const mapX = clamp(clientX - panelRect.left, 0, MINIMAP_WIDTH);
        const mapY = clamp(clientY - panelRect.top, 0, MINIMAP_HEIGHT);
        return {
          left: bounds.left + ((mapX - offsetX) / scale) - (scrollState.clientWidth / 2),
          top: bounds.top + ((mapY - offsetY) / scale) - (scrollState.clientHeight / 2),
        };
      },
    };
  }, [bounds, positions, scrollState]);

  const panToPoint = useCallback((clientX, clientY) => {
    const element = scrollContainerRef.current;

    if (!element || !panelRef.current || !mapState) {
      return;
    }

    const panelRect = panelRef.current.getBoundingClientRect();
    const nextScroll = mapState.toScrollPosition(clientX, clientY, panelRect);
    const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);

    element.scrollTo({
      left: clamp(nextScroll.left, 0, maxLeft),
      top: clamp(nextScroll.top, 0, maxTop),
      behavior: "auto",
    });
  }, [mapState, scrollContainerRef]);

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
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

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panToPoint(event.clientX, event.clientY);
  }, [panToPoint]);

  const handlePointerMove = useCallback((event) => {
    if (!draggingRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    panToPoint(event.clientX, event.clientY);
  }, [panToPoint]);

  const handlePointerUp = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  if (!visible || !mapState || mapState.tiles.length === 0) {
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

function MasonryGrid({
  tiles,
  selectedIds,
  hoveredTileId,
  focusedTileId,
  onSelect,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onOpenLink,
  onMediaLoad,
  onPressStart,
  onRetry,
  onLayoutChange,
}) {
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const rafRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState({});

  useLayoutEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(nextWidth);
    });

    resizeObserver.observe(element);
    setContainerWidth(element.clientWidth);

    return () => resizeObserver.disconnect();
  }, []);

  const { columnCount, columnWidth } = useMemo(
    () => getColumnMetrics(containerWidth),
    [containerWidth],
  );

  const measureItems = useCallback(() => {
    setMeasuredHeights((current) => {
      const next = {};
      let changed = false;

      for (const [tileId, element] of Object.entries(itemRefs.current)) {
        if (!element) {
          continue;
        }

        const nextHeight = Math.ceil(element.offsetHeight);
        next[tileId] = nextHeight;

        if (current[tileId] !== nextHeight) {
          changed = true;
        }
      }

      if (!changed && Object.keys(current).length === Object.keys(next).length) {
        return current;
      }

      return next;
    });
  }, []);

  useLayoutEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(measureItems);
    return () => cancelAnimationFrame(rafRef.current);
  }, [measureItems, tiles, columnCount, columnWidth, selectedIds, hoveredTileId, focusedTileId]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const tileMeasurements = useMemo(
    () => tiles.map((tile) => {
      const surfaceHeight = estimateSurfaceHeight(tile, columnWidth);
      return {
        ...tile,
        surfaceHeight,
        measuredHeight: measuredHeights[tile.id] ?? surfaceHeight + 34,
      };
    }),
    [tiles, measuredHeights, columnWidth],
  );

  const { positions, totalHeight } = useMemo(
    () => computeMasonryLayout(tileMeasurements, columnWidth, columnCount),
    [tileMeasurements, columnWidth, columnCount],
  );

  useEffect(() => {
    onLayoutChange?.({
      positions,
      totalHeight,
      columnWidth,
      columnCount,
    });
  }, [columnCount, columnWidth, onLayoutChange, positions, totalHeight]);

  return (
    <div
      ref={containerRef}
      className="masonry-grid"
      style={{ minHeight: totalHeight || "auto" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onSelect(null, event);
        }
      }}
    >
      {tiles.map((tile) => {
        const position = positions[tile.id];

        if (!position) {
          return null;
        }

        const tileMeta = buildGridTileMeta(tile, {
          isSelected: selectedIdSet.has(tile.id),
          isHovered: hoveredTileId === tile.id,
          isFocused: focusedTileId === tile.id,
          width: position.width,
          surfaceHeight: position.surfaceHeight,
        });

        return (
          <div
            key={tile.id}
            ref={(element) => {
              if (element) {
                itemRefs.current[tile.id] = element;
              } else {
                delete itemRefs.current[tile.id];
              }
            }}
            className="masonry-grid__item"
            style={{
              left: position.x,
              top: position.y,
              width: position.width,
            }}
          >
            <Card
              card={tile}
              tileMeta={tileMeta}
              dragVisualDelta={null}
              dragVisualTileIdSet={EMPTY_SET}
              childTiles={EMPTY_ARRAY}
              rackState={null}
              performanceMode={false}
              onBeginDrag={undefined}
              onContextMenu={onContextMenu}
              onHoverChange={onHoverChange}
              onFocusIn={onFocusIn}
              onFocusOut={onFocusOut}
              onOpenLink={onOpenLink}
              onMediaLoad={onMediaLoad}
              onPressStart={onPressStart}
              onRetry={onRetry}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function GridWorkspaceView({
  dropImport = null,
  isDropTarget = false,
  openTileLink,
  updateTileFromMediaLoad,
  retryTilePreview,
}) {
  const { workspace, folderPath, folderLoading } = useAppContext();
  const scrollRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [hoveredTileId, setHoveredTileId] = useState(null);
  const [focusedTileId, setFocusedTileId] = useState(null);
  const [layoutState, setLayoutState] = useState({
    positions: {},
    totalHeight: 0,
    columnWidth: 0,
    columnCount: 1,
  });

  useEffect(() => {
    setSelectedIds([]);
    setHoveredTileId(null);
    setFocusedTileId(null);
  }, [workspace?.cards]);

  const allTiles = workspace.cards ?? [];
  const filteredTiles = allTiles;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectTile = useCallback((tileId, event, { toggle = false, forceSingle = false } = {}) => {
    if (!tileId) {
      setSelectedIds([]);
      return;
    }

    const hasModifier = Boolean(event?.metaKey || event?.ctrlKey);
    const shouldToggle = toggle || hasModifier;

    setSelectedIds((current) => {
      if (shouldToggle) {
        return current.includes(tileId)
          ? current.filter((id) => id !== tileId)
          : [...current, tileId];
      }

      if (forceSingle) {
        return [tileId];
      }

      return current.length === 1 && current[0] === tileId ? [] : [tileId];
    });
  }, []);

  const handleTilePressStart = useCallback((tile, event) => {
    if (event?.metaKey || event?.ctrlKey) {
      selectTile(tile.id, event, { toggle: true });
      return true;
    }

    selectTile(tile.id, event, { forceSingle: !selectedIdSet.has(tile.id) });
    return false;
  }, [selectTile, selectedIdSet]);

  const handleTileContextMenu = useCallback((tile, event) => {
    event.preventDefault();
    event.stopPropagation();
    selectTile(tile.id, event, { forceSingle: !selectedIdSet.has(tile.id) });
  }, [selectTile, selectedIdSet]);

  const handleTileHoverChange = useCallback((tileId, isHovered) => {
    setHoveredTileId((current) => {
      if (isHovered) {
        return tileId;
      }
      return current === tileId ? null : current;
    });
  }, []);

  const handleTileFocusIn = useCallback((tileId) => {
    setFocusedTileId(tileId);
  }, []);

  const handleTileFocusOut = useCallback((tileId, event) => {
    const nextFocused = event?.relatedTarget;

    if (nextFocused instanceof Node && event?.currentTarget?.contains?.(nextFocused)) {
      return;
    }

    setFocusedTileId((current) => (current === tileId ? null : current));
  }, []);

  const totalCount = allTiles.length;

  if (!folderPath && !folderLoading) {
    return (
      <div
        className={`grid-workspace${isDropTarget ? " canvas--drop-target" : ""}`}
        onDragEnter={dropImport?.handleDragEnter}
        onDragOver={dropImport?.handleDragOver}
        onDragLeave={dropImport?.handleDragLeave}
        onDrop={(event) => { void dropImport?.handleDrop?.(event); }}
      >
        <AppEmptyState
          title="No workspace open"
          description="Open local folder to start saving links and media."
          icon={(
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={`grid-workspace${isDropTarget ? " canvas--drop-target" : ""}`}
      onDragEnter={dropImport?.handleDragEnter}
      onDragOver={dropImport?.handleDragOver}
      onDragLeave={dropImport?.handleDragLeave}
      onDrop={(event) => { void dropImport?.handleDrop?.(event); }}
    >
      <GridMiniMap
        positions={layoutState.positions}
        scrollContainerRef={scrollRef}
        totalHeight={layoutState.totalHeight}
        visible={totalCount > 0}
      />
      <div ref={scrollRef} className="grid-workspace__scroll">
        {totalCount === 0 ? (
          <AppEmptyState
            title="Canvas is empty"
            description="Use Add button to create tiles. Paste URL or image to import directly."
            icon={(
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          />
        ) : (
          <MasonryGrid
            tiles={filteredTiles}
            selectedIds={selectedIds}
            hoveredTileId={hoveredTileId}
            focusedTileId={focusedTileId}
            onSelect={selectTile}
            onContextMenu={handleTileContextMenu}
            onHoverChange={handleTileHoverChange}
            onFocusIn={handleTileFocusIn}
            onFocusOut={handleTileFocusOut}
            onOpenLink={openTileLink}
            onMediaLoad={updateTileFromMediaLoad}
            onPressStart={handleTilePressStart}
            onRetry={retryTilePreview}
            onLayoutChange={setLayoutState}
          />
        )}
      </div>
    </div>
  );
}
