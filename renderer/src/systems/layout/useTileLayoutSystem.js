import { useMemo } from "react";
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
}) {
  const selectedTileIdSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);
  const draggingTileIdSet = useMemo(() => new Set(draggingTileIds), [draggingTileIds]);
  const renderableEntries = useMemo(
    () => getRenderableTileEntries(tiles, openFolderId),
    [openFolderId, tiles],
  );
  const canvasEntries = useMemo(
    () => renderableEntries.filter((entry) => entry.containerType !== "folder"),
    [renderableEntries],
  );
  const folderChildTilesByFolderId = useMemo(() => Object.fromEntries(
    tiles
      .filter((tile) => tile.type === FOLDER_CARD_TYPE)
      .map((folderTile) => [
        folderTile.id,
        folderTile.childIds
          .map((childId) => tiles.find((tile) => tile.id === childId))
          .filter(Boolean),
      ]),
  ), [tiles]);
  const rackTileChildrenByRackId = useMemo(() => Object.fromEntries(
    tiles
      .filter((tile) => tile.type === RACK_CARD_TYPE)
      .map((rackTile) => [
        rackTile.id,
        rackTile.tileIds
          .map((tileId) => tiles.find((tile) => tile.id === tileId))
          .filter(Boolean),
      ]),
  ), [tiles]);
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

  const tileMetaById = useMemo(() => Object.fromEntries(
    canvasEntries.map((entry, index) => {
      const tile = entry.tile;
      const isRackAttached = entry.containerType === "rack";
      const isGroupingTarget = folderGroupingPreview?.targetTileId === tile.id || mergeTargetTileId === tile.id;
      const isRackDropTarget = rackDropPreview?.rackId === tile.id;
      const flags = {
        isDragging: draggingTileIdSet.has(tile.id),
        isEditing: editingTileId === tile.id,
        isSelected: selectedTileIdSet.has(tile.id),
        isFocused: focusedTileId === tile.id,
        isHovered: hoveredTileId === tile.id,
        isMergeTarget: isGroupingTarget,
        isExpanded: openFolderId === tile.id,
        isRackAttached,
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
  ), [
    canvasEntries,
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
    if (!openFolderId) {
      return null;
    }

    const openFolderEntry = canvasEntries.find((entry) => entry.tile.id === openFolderId);
    const openFolderTile = openFolderEntry?.tile;

    if (!openFolderTile || openFolderTile.type !== FOLDER_CARD_TYPE) {
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

    return {
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

  const rackStateById = useMemo(() => Object.fromEntries(
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
  ), [rackDropPreview, tiles]);

  return {
    allTilesBounds,
    folderChildTilesByFolderId,
    rackStateById,
    rackTileChildrenByRackId,
    openFolderState,
    rootTiles: canvasEntries.map((entry) => entry.tile),
    selectedTileIdSet,
    selectedTilesBounds,
    draggingTileIdSet,
    tileMetaById,
  };
}
