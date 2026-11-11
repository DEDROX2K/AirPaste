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

function getCanvasEntryStyleVars(tile, entry) {
  return getTileStyleVars(tile, null, entry.x, entry.y, entry.width, entry.height);
}

// Each tile's base stacking layer, kept from render to render: a tile keeps
// its layer for as long as it still sits above the tile before it in the
// page order, and only a tile that no longer does gets a new one. Bringing
// a tile to the front (every drop) then changes that one tile's layer
// instead of shifting every tile above its old place -- --tile-z is
// inherited, and rewriting it on N wrappers restyled N whole tiles.
// Layers only grow, so they are renumbered from scratch once they run far
// past the tile count (the selected / dragged offsets in getTileLayer
// assume layers in the low hundreds).
export function getStableBaseLayers(entries, previousLayers) {
  const layers = new Map();
  let floor = 0;

  for (const entry of entries) {
    const previous = previousLayers.get(entry.tile.id);
    const layer = previous !== undefined && previous > floor ? previous : floor + 1;
    layers.set(entry.tile.id, layer);
    floor = layer;
  }

  if (floor > entries.length * 2 + 100) {
    return new Map(entries.map((entry, index) => [entry.tile.id, index + 1]));
  }

  return layers;
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

  // Stacking order, kept out of tileMeta (a layer change there re-rendered
  // the tile): the board writes it on each tile's wrapper, which the card
  // inherits. It follows the whole page's order, not the culled one, so
  // panning tiles in and out of view changes nothing, and it is stable
  // (getStableBaseLayers), so a reorder restyles only the tiles it moved.
  const baseLayersRef = useRef(new Map());
  const baseLayerById = useMemo(() => {
    const layers = getStableBaseLayers(canvasEntries, baseLayersRef.current);
    baseLayersRef.current = layers;
    return layers;
  }, [canvasEntries]);
  const tileLayerById = useMemo(() => {
    return Object.fromEntries(visibleCanvasEntries.map((entry) => [
      entry.tile.id,
      getTileLayer((baseLayerById.get(entry.tile.id) ?? 1) - 1, {
        isDragging: draggingTileIdSet.has(entry.tile.id),
        isSelected: selectedTileIdSet.has(entry.tile.id),
        isFocused: focusedTileId === entry.tile.id,
      }),
    ]));
  }, [baseLayerById, draggingTileIdSet, focusedTileId, selectedTileIdSet, visibleCanvasEntries]);

  const tileMetaById = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextTileMetaById = Object.fromEntries(
      visibleCanvasEntries.map((entry) => {
        const tile = entry.tile;
        const isRackDropTarget = rackDropPreview?.rackId === tile.id;
        const flags = {
          isDragging: draggingTileIdSet.has(tile.id),
          isSelected: selectedTileIdSet.has(tile.id),
          // Tiles use this to suppress description/detail text once more
          // than one tile is selected at once -- rendering every selected
          // tile's full detail text simultaneously is the expensive case,
          // not showing it for exactly one.
          // Only selected tiles carry it, so selecting a second tile doesn't
          // re-render every unselected tile on the board.
          isMultiSelect: selectedTileIds.length > 1 && selectedTileIdSet.has(tile.id),
          isFocused: focusedTileId === tile.id,
          isHovered: hoveredTileId === tile.id,
          isMergeTarget: false,
        };
        const interactionState = getTileInteractionState(flags);

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
            styleVars: getCanvasEntryStyleVars(tile, entry),
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
    tileLayerById,
    tileMetaById,
    visibleTileCount: visibleCanvasEntries.length,
  };
}
