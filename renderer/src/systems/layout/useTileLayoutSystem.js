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

function getRackAttachedStyleVars(tile, entry, zIndex) {
  const rackScale = Math.max(
    0.5,
    Math.min(
      0.74,
      164 / Math.max(1, tile.width),
      210 / Math.max(1, tile.height),
    ),
  );
  const rackHoverScale = Math.min(0.82, rackScale + 0.08);

  return getTileStyleVars(tile, zIndex, entry.x, entry.y, entry.width, entry.height, {
    "--rack-card-scale": String(rackScale),
    "--rack-hover-card-scale": String(rackHoverScale),
    "--rack-slot-index": String(entry.rackSlotIndex ?? 0),
  });
}

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
  const canvasEntries = renderableEntries;
  const visibleCanvasEntries = useMemo(() => {
    if (!visibleWorldRect) {
      return canvasEntries;
    }

    return canvasEntries.filter((entry) => rectsIntersect(visibleWorldRect, entry.rect));
  }, [canvasEntries, visibleWorldRect]);
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
        const isRackAttached = entry.containerType === "rack";
        const isRackDropTarget = rackDropPreview?.rackId === tile.id;
        const parentRackId = entry.rackId ?? null;
        const parentRackDragging = Boolean(parentRackId && draggingTileIdSet.has(parentRackId));
        const parentRackSelected = Boolean(parentRackId && selectedTileIdSet.has(parentRackId));
        const parentRackFocused = Boolean(parentRackId && focusedTileId === parentRackId);
        const flags = {
          isDragging: draggingTileIdSet.has(tile.id) || parentRackDragging,
          isSelected: selectedTileIdSet.has(tile.id) || parentRackSelected,
          isFocused: focusedTileId === tile.id || parentRackFocused,
          isHovered: hoveredTileId === tile.id,
          isMergeTarget: false,
          isRackAttached,
          isParentDragging: parentRackDragging,
          isParentSelected: parentRackSelected,
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
            rackId: entry.rackId ?? null,
            rackSlotIndex: entry.rackSlotIndex ?? null,
            renderWidth: entry.width,
            renderHeight: entry.height,
            interactionState,
            styleVars: isRackAttached
              ? getRackAttachedStyleVars(tile, {
                ...entry,
                rackSlotCount: rackTileChildrenByRackId[entry.rackId]?.length ?? 0,
              }, zIndex)
              : getCanvasEntryStyleVars(tile, entry, zIndex),
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
    rackTileChildrenByRackId,
    selectedTileIdSet,
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
