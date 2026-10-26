import { useMemo } from "react";
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
  const rackTileChildrenByRackId = useMemo(() => Object.fromEntries(
    tiles
      .filter((tile) => tile.type === RACK_CARD_TYPE)
      .map((rackTile) => [
        rackTile.id,
        rackTile.tileIds
          .map((tileId) => tileById[tileId] ?? null)
          .filter(Boolean),
      ]),
  ), [tileById, tiles]);
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
          isMultiSelect: selectedTileIds.length > 1,
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
    const nextRackStateById = Object.fromEntries(
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
    );
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("layout:rackStateById", end - start, {
      tileCount: tiles.length,
    });
    return nextRackStateById;
  }, [rackDropPreview, tiles]);

  return {
    allTilesBounds,
    rackStateById,
    rackTileChildrenByRackId,
    rootTiles: visibleCanvasEntries.map((entry) => entry.tile),
    selectedTileIdSet,
    selectedTilesBounds,
    draggingTileIdSet,
    tileMetaById,
    visibleTileCount: visibleCanvasEntries.length,
  };
}
