import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Card from "./Card";
import { useAppContext } from "../context/useAppContext";
import { AppEmptyState } from "./ui/app";
import { filterTiles } from "../utils/searchTiles";

const COLUMN_WIDTH_MIN = 240;
const COLUMN_WIDTH_MAX = 320;
const GRID_GAP = 16;
const GRID_PADDING_X = 24;
const GRID_PADDING_Y = 20;
const GRID_CARD_HEIGHT_FALLBACK = 320;
const EMPTY_SET = new Set();
const EMPTY_ARRAY = [];

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
  searchQuery,
  setSearchQuery,
  openTileLink,
  updateTileFromMediaLoad,
  retryTilePreview,
}) {
  const { workspace, folderPath, folderLoading } = useAppContext();
  const [selectedIds, setSelectedIds] = useState([]);
  const [hoveredTileId, setHoveredTileId] = useState(null);
  const [focusedTileId, setFocusedTileId] = useState(null);

  useEffect(() => {
    setSelectedIds([]);
    setHoveredTileId(null);
    setFocusedTileId(null);
  }, [workspace?.cards]);

  const allTiles = workspace.cards ?? [];
  const filteredTiles = useMemo(
    () => filterTiles(allTiles, searchQuery.trim()),
    [allTiles, searchQuery],
  );
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

  const hasActiveSearch = searchQuery.trim().length > 0;
  const totalCount = allTiles.length;

  if (!folderPath && !folderLoading) {
    return (
      <div className="grid-workspace">
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
    <div className="grid-workspace">

      <div className="grid-workspace__scroll">
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
        ) : hasActiveSearch && filteredTiles.length === 0 ? (
          <AppEmptyState
            title={`No results for "${searchQuery.trim()}"`}
            description="Try title, URL, or tile type."
            actionLabel="Clear Search"
            onAction={() => {
              setSearchQuery("");
            }}
            icon={(
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
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
          />
        )}
      </div>
    </div>
  );
}
