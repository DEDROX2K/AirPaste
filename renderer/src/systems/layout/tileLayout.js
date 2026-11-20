import {
  getRackLayoutSpec,
  getRackSize,
  getRackTileWorldPosition,
  RACK_CARD_TYPE,
} from "../../lib/workspace";
import {
  RACK_FRAME_TOP,
  RACK_ZONE_ABOVE,
  RACK_ZONE_BELOW,
  RACK_ZONE_HYSTERESIS,
  RACK_ZONE_SIDE,
  SLOT_GAP,
  getRackFrameWidth,
} from "../../tiles/rack/geometry";
import {
  getRackDropSlot,
  removeFromRackTiers,
} from "../../tiles/rack/layout";

export const MARQUEE_DRAG_THRESHOLD = 6;

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

// The rack's drop zone: the shelf plus RACK_ZONE_SIDE each side, from
// RACK_ZONE_ABOVE over the top of the frames to RACK_ZONE_BELOW under the
// shelf; `pad` grows it (the hysteresis once a drag is already inside).
export function getRackDropRect(rackTile, pad = 0) {
  const rackRect = getRackRect(rackTile);
  const left = rackRect.left - RACK_ZONE_SIDE - pad;
  const right = rackRect.right + RACK_ZONE_SIDE + pad;
  const top = rackRect.top + RACK_FRAME_TOP - RACK_ZONE_ABOVE - pad;
  const bottom = rackRect.bottom + RACK_ZONE_BELOW + pad;

  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function getRackZoneDistance(rackTile, point) {
  const zone = getRackDropRect(rackTile);
  const dx = Math.max(zone.left - point.x, 0, point.x - zone.right);
  const dy = Math.max(zone.top - point.y, 0, point.y - zone.bottom);
  return Math.hypot(dx, dy);
}

// Closest rack zone to a point (0 = inside), for the approach shrink.
export function findNearestRackZone(rootTiles, point, excludeIdSet = null) {
  let nearest = null;

  for (const tile of rootTiles ?? []) {
    if (tile.type !== RACK_CARD_TYPE || excludeIdSet?.has(tile.id)) {
      continue;
    }

    const distance = getRackZoneDistance(tile, point);

    if (!nearest || distance < nearest.distance) {
      nearest = { rackId: tile.id, rack: tile, distance };
    }
  }

  return nearest;
}

// A tile in a rack isn't on the canvas -- the rack draws its snapshot. This
// entry is where the tile lands, full size, when it's pulled out.
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
    .filter((entry) => entry.containerType === "canvas" && rectsIntersect(selectionRect, entry.rect))
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
}) {
  let layer = orderIndex + 1;

  if (isNested) {
    layer += 1500;
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

  return layer;
}

// zIndex null leaves --tile-z out: canvas tiles inherit it from their
// wrapper instead (see useTileLayoutSystem's tileLayerById).
export function getTileStyleVars(tile, zIndex, x = tile.x, y = tile.y, width = tile.width, height = tile.height, extraVars = null) {
  return {
    "--tile-width": `${width}px`,
    "--tile-height": `${height}px`,
    "--tile-x": `${x}px`,
    "--tile-y": `${y}px`,
    ...(zIndex === null ? null : { "--tile-z": String(zIndex) }),
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

export function findRackDropTarget({
  tiles,
  dragTileIds,
  dragOrigins,
  clientToWorldPoint,
  pointerClientX,
  pointerClientY,
  rootTiles = null,
  dragTileIdSet = null,
  metrics = null,
  // The rack the drag is already over: its zone gets the hysteresis.
  previousRackId = null,
  // Overrides the pointer (the projected point of a throw).
  worldPoint = null,
  // The dragged tile's centre x on screen (world), which picks the slot.
  // Defaults to the pointer.
  centerX = null,
}) {
  const pointerWorldPoint = worldPoint ?? clientToWorldPoint(pointerClientX, pointerClientY);
  const candidateRootTiles = rootTiles ?? getRootTiles(tiles, metrics);
  const candidateDragTileIdSet = dragTileIdSet ?? new Set(dragTileIds);
  let bestTarget = null;
  let bestDistance = Infinity;

  if (metrics) {
    metrics.pointerChecks = 0;
    metrics.intersectionChecks = 0;
    metrics.rootLoopCount = 0;
  }

  if (!pointerWorldPoint || dragTileIds.length === 0) {
    return null;
  }

  for (const tile of candidateRootTiles) {
    if (metrics) {
      metrics.rootLoopCount += 1;
    }

    if (tile.type !== RACK_CARD_TYPE || candidateDragTileIdSet.has(tile.id)) {
      continue;
    }

    const rackDropRect = getRackDropRect(tile, tile.id === previousRackId ? RACK_ZONE_HYSTERESIS : 0);
    if (metrics) {
      metrics.pointerChecks += 1;
    }

    if (!pointInsideRect(pointerWorldPoint, rackDropRect)) {
      continue;
    }

    // Overlapping zones: the rack whose centre is nearest wins.
    const rackRect = getRackRect(tile);
    const rackCenterX = rackRect.left + (rackRect.width / 2);
    const distance = Math.hypot(pointerWorldPoint.x - rackCenterX, pointerWorldPoint.y - (rackRect.top + rackRect.height / 2));

    if (distance < bestDistance) {
      const drop = getRackDropSlot(getDropSpec(tile, candidateDragTileIdSet), {
        x: (Number.isFinite(centerX) ? centerX : pointerWorldPoint.x) - rackCenterX,
        y: pointerWorldPoint.y - rackRect.top,
      });
      bestTarget = {
        rackId: tile.id,
        targetTileId: tile.id,
        slotIndex: drop.index,
        tier: drop.tier,
        refusedTier: drop.refusedTier,
        dropRect: rackDropRect,
        gapWidth: getDraggedFramesWidth(dragTileIds, dragOrigins, tiles),
      };
      bestDistance = distance;
    }
  }

  return bestTarget;
}

// The rack as a drop sees it. A tile just torn off may still be listed for
// a frame: it is not a slot.
function getDropSpec(rackTile, dragTileIdSet) {
  const spec = getRackLayoutSpec(rackTile);
  const listed = (rackTile.tileIds ?? []).map((tileId, index) => (dragTileIdSet.has(tileId) ? index : -1)).filter((index) => index >= 0);

  if (listed.length === 0) {
    return spec;
  }

  let tiers = spec.tiers;
  for (let position = listed.length - 1; position >= 0; position -= 1) {
    tiers = removeFromRackTiers(tiers, listed[position]);
  }

  const keep = (_, index) => !listed.includes(index);
  return { ...spec, tiers, slotWidths: spec.slotWidths.filter(keep) };
}

// Width the dragged tiles take in a rack, side by side: the gap that opens.
function getDraggedFramesWidth(dragTileIds, dragOrigins, tiles) {
  const tileById = Array.isArray(tiles) ? null : tiles;
  const widths = dragTileIds.map((tileId) => {
    const origin = dragOrigins?.[tileId];
    const tile = tileById?.[tileId] ?? (Array.isArray(tiles) ? tiles.find((entry) => entry.id === tileId) : null);
    return getRackFrameWidth({
      width: origin?.width ?? tile?.width,
      height: origin?.height ?? tile?.height,
    });
  });

  return widths.reduce((total, width) => total + width, 0) + (SLOT_GAP * Math.max(0, widths.length - 1));
}

// findRackDropTarget returns a fresh object every time it finds a match, even
// when the match is the same rack/slot as the previous call (the common case
// while a pointer lingers over one rack) -- useTileLayoutSystem's tileMetaById
// memo depends on this value, so a merely-equal-but-not-identical object was
// busting that memo and rebuilding every visible tile's layout on every one
// of those pointermoves. Callers should route a new result through this
// before calling their state setter, keeping the previous reference when
// nothing meaningful changed.
export function isSameRackDropPreview(a, b) {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return a.rackId === b.rackId
    && a.targetTileId === b.targetTileId
    && a.slotIndex === b.slotIndex
    && a.gapWidth === b.gapWidth
    && a.tier === b.tier
    && a.refusedTier === b.refusedTier
    && a.dropRect?.left === b.dropRect?.left
    && a.dropRect?.top === b.dropRect?.top
    && a.dropRect?.right === b.dropRect?.right
    && a.dropRect?.bottom === b.dropRect?.bottom;
}
