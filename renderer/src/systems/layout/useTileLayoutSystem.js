import { useMemo, useRef } from "react";
import { recordDerivedMetric } from "../../lib/perf";
import {
  getRackSlotCount,
  RACK_CARD_TYPE,
} from "../../lib/workspace";
import {
  getRackRect,
  getRenderableTileEntries,
  getTileByIdMap,
  rectsIntersect,
  getTilesBounds,
  getTileInteractionState,
  getTileLayer,
  getTileStyleVars,
} from "./tileLayout";

function getCanvasEntryStyleVars(tile, entry, zIndex) {
  return getTileStyleVars(tile, zIndex, entry.x, entry.y, entry.width, entry.height);
}

function areArraysShallowEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function areRackStatesEqual(left, right) {
  return left.tileCount === right.tileCount
    && left.slotCount === right.slotCount
    && left.slotPreviewIndex === right.slotPreviewIndex
    && left.dropTargetRect === right.dropTargetRect
    && left.rackRect.left === right.rackRect.left
    && left.rackRect.top === right.rackRect.top
    && left.rackRect.width === right.rackRect.width
    && left.rackRect.height === right.rackRect.height;
}

// Keeps each rack's previous value when it's equal, so editing one tile
// doesn't hand every rack a new array/object and re-render it.
function reuseEqualValues(previousById, nextById, isEqual) {
  return Object.fromEntries(Object.entries(nextById).map(([id, nextValue]) => {
    const previousValue = previousById?.[id];
    return [id, previousValue && isEqual(previousValue, nextValue) ? previousValue : nextValue];
  }));
}

export function useTileLayoutSystem({
  tiles,
  rackDropPreview,
  selectedTileIds,
  hoveredTileId,
  focusedTileId,
  draggingTileIds,
  visibleWorldRect = null,
}) {
  const selectedTileIdSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);
  const draggingTileIdSet = useMemo(() => new Set(draggingTileIds), [draggingTileIds]);
  const tileById = useMemo(() => getTileByIdMap(tiles), [tiles]);
  const renderableEntries = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextEntries = getRenderableTileEntries(tiles, tileById);
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("layout:renderableEntries", end - start, {
      tileCount: tiles.length,
      entryCount: nextEntries.length,
    });
    return nextEntries;
  }, [tileById, tiles]);
  // Tiles in a rack are shown by the rack itself (as snapshot cards), never
  // as live tiles on the canvas: they don't render, select or move here.
  const canvasEntries = useMemo(
    () => renderableEntries.filter((entry) => entry.containerType === "canvas"),
    [renderableEntries],
  );
  const visibleCanvasEntries = useMemo(() => {
    if (!visibleWorldRect) {
      return canvasEntries;
    }

    return canvasEntries.filter((entry) => {
      return draggingTileIdSet.has(entry.tile.id) || rectsIntersect(visibleWorldRect, entry.rect);
    });
  }, [canvasEntries, draggingTileIdSet, visibleWorldRect]);
  const rackChildrenCacheRef = useRef(null);
  const rackStateCacheRef = useRef(null);
  const rackTileChildrenByRackId = useMemo(() => {
    const nextChildrenByRackId = reuseEqualValues(rackChildrenCacheRef.current, Object.fromEntries(
      tiles
        .filter((tile) => tile.type === RACK_CARD_TYPE)
        .map((rackTile) => [
          rackTile.id,
          rackTile.tileIds
            .map((tileId) => tileById[tileId] ?? null)
            .filter(Boolean),
        ]),
    ), areArraysShallowEqual);
    rackChildrenCacheRef.current = nextChildrenByRackId;
    return nextChildrenByRackId;
  }, [tileById, tiles]);
  const allTilesBounds = useMemo(() => getTilesBounds(
    canvasEntries.map((entry) => ({
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
    })),
  ), [canvasEntries]);
  const selectedTilesBounds = useMemo(() => getTilesBounds(
    canvasEntries
      .filter((entry) => selectedTileIdSet.has(entry.tile.id))
      .map((entry) => ({
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
      })),
  ), [canvasEntries, selectedTileIdSet]);

  const tileMetaById = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextTileMetaById = Object.fromEntries(
      visibleCanvasEntries.map((entry, index) => {
        const tile = entry.tile;
        const isRackDropTarget = rackDropPreview?.rackId === tile.id;
        const flags = {
          isDragging: draggingTileIdSet.has(tile.id),
          isSelected: selectedTileIdSet.has(tile.id),
          // Tiles use this to suppress description/detail text once more
          // than one tile is selected at once -- rendering every selected
          // tile's full detail text simultaneously is the expensive case,
          // not showing it for exactly one.
          // Only selected tiles get it, so a second selection doesn't
          // re-render every other tile on the canvas.
          isMultiSelect: selectedTileIds.length > 1 && selectedTileIdSet.has(tile.id),
          isFocused: focusedTileId === tile.id,
          isHovered: hoveredTileId === tile.id,
          isMergeTarget: false,
        };
        const interactionState = getTileInteractionState(flags);
        const zIndex = getTileLayer(index, flags);

        return [
          tile.id,
          {
            ...flags,
            isGroupingTarget: false,
            isGroupingArmed: false,
            isFolderZoneTarget: false,
            isRackDropTarget,
            renderWidth: entry.width,
            renderHeight: entry.height,
            interactionState,
            styleVars: getCanvasEntryStyleVars(tile, entry, zIndex),
          },
        ];
      }),
    );
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("layout:tileMetaById", end - start, {
      canvasEntryCount: canvasEntries.length,
      visibleCanvasEntryCount: visibleCanvasEntries.length,
    });
    return nextTileMetaById;
  }, [
    visibleCanvasEntries,
    canvasEntries.length,
    draggingTileIdSet,
    focusedTileId,
    hoveredTileId,
    rackDropPreview,
    selectedTileIdSet,
    selectedTileIds.length,
  ]);

  const rackStateById = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextRackStateById = reuseEqualValues(rackStateCacheRef.current, Object.fromEntries(
      tiles
      .filter((tile) => tile.type === RACK_CARD_TYPE)
      .map((rackTile) => {
        const rackRect = getRackRect(rackTile);
        const tileCount = rackTile.tileIds.length;
        const slotCount = getRackSlotCount(rackTile);
        const slotPreviewIndex = rackDropPreview?.rackId === rackTile.id ? rackDropPreview.slotIndex : null;

        return [
          rackTile.id,
          {
            rackRect,
            tileCount,
            slotCount,
            slotPreviewIndex,
            dropTargetRect: rackDropPreview?.rackId === rackTile.id ? rackDropPreview.dropRect : null,
          },
        ];
      }),
    ), areRackStatesEqual);
    rackStateCacheRef.current = nextRackStateById;
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("layout:rackStateById", end - start, {
      tileCount: tiles.length,
    });
    return nextRackStateById;
  }, [rackDropPreview, tiles]);

  const rootTiles = useMemo(
    () => visibleCanvasEntries.map((entry) => entry.tile),
    [visibleCanvasEntries],
  );

  return {
    allTilesBounds,
    canvasEntries,
    rackStateById,
    rackTileChildrenByRackId,
    rootTiles,
    selectedTileIdSet,
    selectedTilesBounds,
    draggingTileIdSet,
    tileMetaById,
    visibleTileCount: visibleCanvasEntries.length,
  };
}
