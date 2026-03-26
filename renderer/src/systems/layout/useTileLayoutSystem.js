import { useMemo } from "react";
import { recordDerivedMetric } from "../../lib/perf";
import {
  FOLDER_CARD_TYPE,
  getRackSlotCount,
  RACK_CARD_TYPE,
} from "../../lib/workspace";
import {
  getBoxStyleVars,
  getFolderZoneRect,
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
  openFolderId,
  folderGroupingPreview,
  rackDropPreview,
  selectedTileIds,
  hoveredTileId,
  focusedTileId,
  editingTileId,
  draggingTileIds,
  mergeTargetTileId,
  visibleWorldRect = null,
}) {
  const selectedTileIdSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);
  const draggingTileIdSet = useMemo(() => new Set(draggingTileIds), [draggingTileIds]);
  const tileById = useMemo(() => getTileByIdMap(tiles), [tiles]);
  const renderableEntries = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextEntries = getRenderableTileEntries(tiles, openFolderId, tileById);
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("layout:renderableEntries", end - start, {
      tileCount: tiles.length,
      openFolderId,
      entryCount: nextEntries.length,
    });
    return nextEntries;
  }, [openFolderId, tileById, tiles]);
  const canvasEntries = useMemo(
    () => renderableEntries.filter((entry) => entry.containerType !== "folder"),
    [renderableEntries],
  );
  const visibleCanvasEntries = useMemo(() => {
    if (!visibleWorldRect) {
      return canvasEntries;
    }

    return canvasEntries.filter((entry) => rectsIntersect(visibleWorldRect, entry.rect));
  }, [canvasEntries, visibleWorldRect]);
  const folderChildTilesByFolderId = useMemo(() => Object.fromEntries(
    tiles
      .filter((tile) => tile.type === FOLDER_CARD_TYPE)
      .map((folderTile) => [
        folderTile.id,
        folderTile.childIds
          .map((childId) => tileById[childId] ?? null)
          .filter(Boolean),
      ]),
  ), [tileById, tiles]);
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
  const openFolderChildEntries = useMemo(
    () => renderableEntries.filter((entry) => entry.containerType === "folder"),
    [renderableEntries],
  );
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
      const isGroupingTarget = folderGroupingPreview?.targetTileId === tile.id || mergeTargetTileId === tile.id;
      const isRackDropTarget = rackDropPreview?.rackId === tile.id;
      const parentRackId = entry.rackId ?? null;
      const parentRackDragging = Boolean(parentRackId && draggingTileIdSet.has(parentRackId));
      const parentRackSelected = Boolean(parentRackId && selectedTileIdSet.has(parentRackId));
      const parentRackFocused = Boolean(parentRackId && focusedTileId === parentRackId);
      const flags = {
        isDragging: draggingTileIdSet.has(tile.id) || parentRackDragging,
        isEditing: editingTileId === tile.id,
        isSelected: selectedTileIdSet.has(tile.id) || parentRackSelected,
        isFocused: focusedTileId === tile.id || parentRackFocused,
        isHovered: hoveredTileId === tile.id,
        isMergeTarget: isGroupingTarget,
        isExpanded: openFolderId === tile.id,
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
          isGroupingTarget,
          isGroupingArmed: isGroupingTarget && folderGroupingPreview?.isArmed,
          isFolderOpen: openFolderId === tile.id,
          isFolderZoneTarget: folderGroupingPreview?.folderId === tile.id,
          isRackDropTarget,
          rackId: entry.rackId ?? null,
          rackSlotIndex: entry.rackSlotIndex ?? null,
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
    editingTileId,
    focusedTileId,
    folderGroupingPreview,
    hoveredTileId,
    mergeTargetTileId,
    openFolderId,
    rackDropPreview,
    rackTileChildrenByRackId,
    selectedTileIdSet,
  ]);

  const openFolderState = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!openFolderId) {
      const end = typeof performance !== "undefined" ? performance.now() : Date.now();
      recordDerivedMetric("layout:openFolderState", end - start, {
        openFolderId: null,
        childEntryCount: 0,
      });
      return null;
    }

    const openFolderEntry = canvasEntries.find((entry) => entry.tile.id === openFolderId);
    const openFolderTile = openFolderEntry?.tile;

    if (!openFolderTile || openFolderTile.type !== FOLDER_CARD_TYPE) {
      const end = typeof performance !== "undefined" ? performance.now() : Date.now();
      recordDerivedMetric("layout:openFolderState", end - start, {
        openFolderId,
        childEntryCount: 0,
      });
      return null;
    }

    const zoneRect = getFolderZoneRect(openFolderTile);
    const childTileMetaById = Object.fromEntries(
      openFolderChildEntries.map((entry, index) => {
        const tile = entry.tile;
        const isGroupingTarget = folderGroupingPreview?.targetTileId === tile.id;
        const flags = {
          isDragging: draggingTileIdSet.has(tile.id),
          isEditing: editingTileId === tile.id,
          isSelected: selectedTileIdSet.has(tile.id),
          isFocused: focusedTileId === tile.id,
          isHovered: hoveredTileId === tile.id,
          isMergeTarget: isGroupingTarget,
          isExpanded: false,
          isNested: true,
        };

        return [
          tile.id,
          {
            ...flags,
            isGroupingTarget,
            isGroupingArmed: isGroupingTarget && folderGroupingPreview?.isArmed,
            interactionState: getTileInteractionState(flags),
            styleVars: getTileStyleVars(
              tile,
              getTileLayer(index, flags),
              entry.localX,
              entry.localY,
              entry.width,
              entry.height,
            ),
          },
        ];
      }),
    );

    const nextOpenFolderState = {
      folderId: openFolderTile.id,
      card: openFolderTile,
      zoneRect,
      zoneStyleVars: getBoxStyleVars({
        x: 0,
        y: openFolderTile.height + 24,
        width: zoneRect.width,
        height: zoneRect.height,
      }),
      isGroupingTarget: folderGroupingPreview?.folderId === openFolderTile.id,
      isGroupingArmed: folderGroupingPreview?.folderId === openFolderTile.id && folderGroupingPreview?.isArmed,
      childTiles: openFolderChildEntries.map((entry) => entry.tile),
      childTileMetaById,
    };
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("layout:openFolderState", end - start, {
      openFolderId,
      childEntryCount: openFolderChildEntries.length,
    });
    return nextOpenFolderState;
  }, [
    canvasEntries,
    draggingTileIdSet,
    editingTileId,
    focusedTileId,
    folderGroupingPreview,
    hoveredTileId,
    openFolderChildEntries,
    openFolderId,
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
    folderChildTilesByFolderId,
    rackStateById,
    rackTileChildrenByRackId,
    openFolderState,
    rootTiles: visibleCanvasEntries.map((entry) => entry.tile),
    selectedTileIdSet,
    selectedTilesBounds,
    draggingTileIdSet,
    tileMetaById,
    visibleTileCount: visibleCanvasEntries.length,
  };
}
