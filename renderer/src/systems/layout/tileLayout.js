import {
  getRackSize,
  getRackTileWorldPosition,
  RACK_CARD_TYPE,
} from "../../lib/workspace";

export const MARQUEE_DRAG_THRESHOLD = 6;
export const RACK_DROP_REACH = 520;
export const RACK_DROP_SIDE_PADDING = 28;
export const RACK_DROP_BOTTOM_PADDING = 36;

export function normalizeRect(startX, startY, endX, endY) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const right = Math.max(startX, endX);
  const bottom = Math.max(startY, endY);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function getTileRect(tile, width = tile.width, height = tile.height) {
  return {
    left: tile.x,
    top: tile.y,
    right: tile.x + width,
    bottom: tile.y + height,
    width,
    height,
  };
}

export function rectsIntersect(leftRect, rightRect) {
  return !(
    leftRect.right < rightRect.left
    || leftRect.left > rightRect.right
    || leftRect.bottom < rightRect.top
    || leftRect.top > rightRect.bottom
  );
}

export function pointInsideRect(point, rect) {
  return point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom;
}

export function getIntersectionArea(leftRect, rightRect) {
  const width = Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
  const height = Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);

  if (width <= 0 || height <= 0) {
    return 0;
  }

  return width * height;
}

export function getTilesBounds(tiles) {
  if (!tiles.length) {
    return null;
  }

  const bounds = tiles.reduce((currentBounds, tile) => {
    const tileRect = {
      left: tile.x,
      top: tile.y,
      right: tile.x + tile.width,
      bottom: tile.y + tile.height,
      width: tile.width,
      height: tile.height,
    };

    if (!currentBounds) {
      return { ...tileRect };
    }

    return {
      left: Math.min(currentBounds.left, tileRect.left),
      top: Math.min(currentBounds.top, tileRect.top),
      right: Math.max(currentBounds.right, tileRect.right),
      bottom: Math.max(currentBounds.bottom, tileRect.bottom),
      width: 0,
      height: 0,
    };
  }, null);

  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

export function getRackAttachedIdSet(tiles) {
  return new Set(
    tiles
      .filter((tile) => tile.type === RACK_CARD_TYPE)
      .flatMap((tile) => tile.tileIds),
  );
}

export function getTileByIdMap(tiles) {
  return Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
}

export function getRootTiles(tiles, metrics = null) {
  const rackAttachedIdSet = getRackAttachedIdSet(tiles);

  if (metrics) {
    metrics.totalTileCount = tiles.length;
    metrics.getRootTilesPasses = 2;
    metrics.rackAttachedCount = rackAttachedIdSet.size;
  }

  return tiles.filter((tile) => !rackAttachedIdSet.has(tile.id));
}

export function getRackRect(rackTile) {
  const size = getRackSize(rackTile);

  return {
    left: rackTile.x,
    top: rackTile.y,
    right: rackTile.x + size.width,
    bottom: rackTile.y + size.height,
    width: size.width,
    height: size.height,
  };
}

export function getRackDropRect(rackTile) {
  const rackRect = getRackRect(rackTile);

  return {
    left: rackRect.left - RACK_DROP_SIDE_PADDING,
    top: rackRect.top - RACK_DROP_REACH,
    right: rackRect.right + RACK_DROP_SIDE_PADDING,
    bottom: rackRect.bottom + RACK_DROP_BOTTOM_PADDING,
    width: rackRect.width + (RACK_DROP_SIDE_PADDING * 2),
    height: RACK_DROP_REACH + rackRect.height + RACK_DROP_BOTTOM_PADDING,
  };
}

export function getRackAttachedTileEntry(rackTile, childTile, index) {
  const worldPosition = getRackTileWorldPosition(rackTile, childTile, index);

  return {
    tile: childTile,
    containerType: "rack",
    folderId: null,
    rackId: rackTile.id,
    localX: worldPosition.x - rackTile.x,
    localY: worldPosition.y - rackTile.y,
    x: worldPosition.x,
    y: worldPosition.y,
    width: childTile.width,
    height: childTile.height,
    rackSlotIndex: index,
    rect: {
      left: worldPosition.x,
      top: worldPosition.y,
      right: worldPosition.x + childTile.width,
      bottom: worldPosition.y + childTile.height,
      width: childTile.width,
      height: childTile.height,
    },
  };
}

export function getRenderableTileEntries(tiles, tileById = getTileByIdMap(tiles)) {
  const rootTiles = getRootTiles(tiles);
  const entries = [];

  rootTiles.forEach((tile) => {
    if (tile.type === RACK_CARD_TYPE) {
      const rackRect = getRackRect(tile);

      entries.push({
        tile,
        containerType: "canvas",
        folderId: null,
        rackId: null,
        localX: tile.x,
        localY: tile.y,
        x: tile.x,
        y: tile.y,
        width: rackRect.width,
        height: rackRect.height,
        rect: rackRect,
      });

      tile.tileIds
        .map((childId) => tileById[childId] ?? null)
        .filter(Boolean)
        .forEach((childTile, index) => {
          entries.push(getRackAttachedTileEntry(tile, childTile, index));
        });

      return;
    }

    entries.push({
      tile,
      containerType: "canvas",
      folderId: null,
      rackId: null,
      localX: tile.x,
      localY: tile.y,
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
      rect: getTileRect(tile),
    });
  });

  return entries;
}

export function getRenderableTileEntryById(tiles, tileId, tileById = getTileByIdMap(tiles)) {
  return getRenderableTileEntries(tiles, tileById).find((entry) => entry.tile.id === tileId) ?? null;
}

export function getSelectedTileIdsInRect(tiles, selectionRect, tileById = getTileByIdMap(tiles)) {
  return getRenderableTileEntries(tiles, tileById)
    .filter((entry) => rectsIntersect(selectionRect, entry.rect))
    .map((entry) => entry.tile.id);
}

export function getTileInteractionState({
  isDragging,
  isSelected,
  isFocused,
  isHovered,
}) {
  if (isDragging) {
    return "dragging";
  }

  if (isSelected) {
    return "selected";
  }

  if (isFocused) {
    return "focused";
  }

  if (isHovered) {
    return "hover";
  }

  return "idle";
}

export function getTileLayer(orderIndex, {
  isDragging,
  isSelected,
  isFocused,
  isNested = false,
  isRackAttached = false,
  isParentDragging = false,
  isParentSelected = false,
}) {
  let layer = orderIndex + 1;

  if (isNested) {
    layer += 1500;
  }

  if (isRackAttached) {
    layer += 180;
  }

  if (isParentSelected) {
    layer += 220;
  }

  if (isSelected) {
    layer += 200;
  }

  if (isFocused) {
    layer += 300;
  }

  if (isDragging) {
    layer += 1200;
  }

  if (isParentDragging) {
    layer += 1400;
  }

  return layer;
}

export function getTileStyleVars(tile, zIndex, x = tile.x, y = tile.y, width = tile.width, height = tile.height, extraVars = null) {
  return {
    "--tile-width": `${width}px`,
    "--tile-height": `${height}px`,
    "--tile-x": `${x}px`,
    "--tile-y": `${y}px`,
    "--tile-z": String(zIndex),
    ...(extraVars ?? {}),
  };
}

export function getBoxStyleVars(box) {
  if (!box) {
    return null;
  }

  return {
    "--box-x": `${box.x}px`,
    "--box-y": `${box.y}px`,
    "--box-width": `${box.width}px`,
    "--box-height": `${box.height}px`,
  };
}

function getDraggedRect(dragOrigins, dragTileId, dragDelta) {
  const origin = dragOrigins[dragTileId];

  if (!origin) {
    return null;
  }

  return {
    left: origin.x + dragDelta.x,
    top: origin.y + dragDelta.y,
    right: origin.x + dragDelta.x + origin.width,
    bottom: origin.y + dragDelta.y + origin.height,
    width: origin.width,
    height: origin.height,
  };
}

function getDraggedBounds(dragOrigins, dragTileIds, dragDelta) {
  return dragTileIds.reduce((bounds, dragTileId) => {
    const draggedRect = getDraggedRect(dragOrigins, dragTileId, dragDelta);

    if (!draggedRect) {
      return bounds;
    }

    if (!bounds) {
      return draggedRect;
    }

    return {
      left: Math.min(bounds.left, draggedRect.left),
      top: Math.min(bounds.top, draggedRect.top),
      right: Math.max(bounds.right, draggedRect.right),
      bottom: Math.max(bounds.bottom, draggedRect.bottom),
      width: 0,
      height: 0,
    };
  }, null);
}

export function findRackDropTarget({
  tiles,
  dragTileIds,
  dragOrigins,
  dragDelta,
  clientToWorldPoint,
  pointerClientX,
  pointerClientY,
  rootTiles = null,
  dragTileIdSet = null,
  metrics = null,
}) {
  const draggedBounds = getDraggedBounds(dragOrigins, dragTileIds, dragDelta);
  const pointerWorldPoint = clientToWorldPoint(pointerClientX, pointerClientY);
  const candidateRootTiles = rootTiles ?? getRootTiles(tiles, metrics);
  const candidateDragTileIdSet = dragTileIdSet ?? new Set(dragTileIds);
  let bestTarget = null;
  let bestScore = 0;

  if (metrics) {
    metrics.pointerChecks = 0;
    metrics.intersectionChecks = 0;
    metrics.rootLoopCount = 0;
  }

  if (!draggedBounds) {
    return null;
  }

  for (const tile of candidateRootTiles) {
    if (metrics) {
      metrics.rootLoopCount += 1;
    }

    if (tile.type !== RACK_CARD_TYPE || candidateDragTileIdSet.has(tile.id)) {
      continue;
    }

    const rackDropRect = getRackDropRect(tile);
    if (metrics) {
      metrics.intersectionChecks += 1;
      metrics.pointerChecks += 1;
    }
    const intersectionArea = getIntersectionArea(draggedBounds, rackDropRect);
    const overlapScore = intersectionArea / Math.min(
      Math.max(1, draggedBounds.width * draggedBounds.height),
      Math.max(1, rackDropRect.width * rackDropRect.height),
    );
    const pointerInsideTarget = pointInsideRect(pointerWorldPoint, rackDropRect);
    const score = pointerInsideTarget ? overlapScore + 1 : overlapScore;

    if ((pointerInsideTarget || overlapScore >= 0.08) && score > bestScore) {
      bestTarget = {
        rackId: tile.id,
        targetTileId: tile.id,
        slotIndex: tile.tileIds.length,
        dropRect: rackDropRect,
      };
      bestScore = score;
    }
  }

  return bestTarget;
}
