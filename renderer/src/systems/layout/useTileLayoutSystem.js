import { useMemo } from "react";
import {
  FOLDER_CARD_TYPE,
} from "../../lib/workspace";
import {
  getBoxStyleVars,
  getFolderZoneRect,
  getRenderableTileEntries,
  getTilesBounds,
  getTileInteractionState,
  getTileLayer,
  getTileStyleVars,
} from "./tileLayout";

export function useTileLayoutSystem({
  tiles,
  openFolderId,
  folderGroupingPreview,
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
  const rootTileEntries = useMemo(
    () => renderableEntries.filter((entry) => entry.containerType === "canvas"),
    [renderableEntries],
  );
  const openFolderChildEntries = useMemo(
    () => renderableEntries.filter((entry) => entry.containerType === "folder"),
    [renderableEntries],
  );
  const allTilesBounds = useMemo(() => getTilesBounds(
    renderableEntries.map((entry) => ({
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
    })),
  ), [renderableEntries]);
  const selectedTilesBounds = useMemo(() => getTilesBounds(
    renderableEntries
      .filter((entry) => selectedTileIdSet.has(entry.tile.id))
      .map((entry) => ({
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
      })),
  ), [renderableEntries, selectedTileIdSet]);

  const tileMetaById = useMemo(() => Object.fromEntries(
    rootTileEntries.map((entry, index) => {
      const tile = entry.tile;
      const isGroupingTarget = folderGroupingPreview?.targetTileId === tile.id || mergeTargetTileId === tile.id;
      const isGroupingArmed = isGroupingTarget && folderGroupingPreview?.isArmed;
      const flags = {
        isDragging: draggingTileIdSet.has(tile.id),
        isEditing: editingTileId === tile.id,
        isSelected: selectedTileIdSet.has(tile.id),
        isFocused: focusedTileId === tile.id,
        isHovered: hoveredTileId === tile.id,
        isMergeTarget: isGroupingTarget,
        isExpanded: openFolderId === tile.id,
      };
      const interactionState = getTileInteractionState(flags);
      const zIndex = getTileLayer(index, flags);

      return [
        tile.id,
        {
          ...flags,
          isGroupingTarget,
          isGroupingArmed,
          isFolderOpen: openFolderId === tile.id,
          isFolderZoneTarget: folderGroupingPreview?.folderId === tile.id,
          interactionState,
          styleVars: getTileStyleVars(tile, zIndex, entry.x, entry.y),
        },
      ];
    }),
  ), [
    draggingTileIdSet,
    editingTileId,
    folderGroupingPreview,
    focusedTileId,
    hoveredTileId,
    mergeTargetTileId,
    openFolderId,
    rootTileEntries,
    selectedTileIdSet,
  ]);

  const openFolderState = useMemo(() => {
    if (!openFolderId) {
      return null;
    }

    const openFolderTile = rootTileEntries.find((entry) => entry.tile.id === openFolderId)?.tile;

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
    draggingTileIdSet,
    editingTileId,
    focusedTileId,
    folderGroupingPreview,
    hoveredTileId,
    openFolderChildEntries,
    openFolderId,
    rootTileEntries,
    selectedTileIdSet,
  ]);

  return {
    allTilesBounds,
    openFolderState,
    rootTiles: rootTileEntries.map((entry) => entry.tile),
    selectedTileIdSet,
    selectedTilesBounds,
    draggingTileIdSet,
    tileMetaById,
  };
}
