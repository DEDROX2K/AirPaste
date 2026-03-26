function roundToGrid(value, gridSize) {
  return Math.round(value / gridSize) * gridSize;
}

export function snapWorldPositionToGrid(position, gridSize) {
  if (!Number.isFinite(gridSize) || gridSize <= 0) {
    return position;
  }

  return {
    x: roundToGrid(position.x, gridSize),
    y: roundToGrid(position.y, gridSize),
  };
}

export function shouldSnapDrag(dragOrigins, snapSettings) {
  if (!snapSettings?.enabled) {
    return false;
  }

  const origins = Object.values(dragOrigins ?? {});

  if (origins.length === 0) {
    return false;
  }

  return origins.every((origin) => origin?.containerType === "canvas");
}

export function resolveSnappedDragDelta({
  dragOrigins,
  anchorTileId,
  rawDelta,
  snapSettings,
}) {
  const anchorOrigin = dragOrigins?.[anchorTileId] ?? null;
  const origin = anchorOrigin
    ? {
      x: anchorOrigin.x,
      y: anchorOrigin.y,
    }
    : null;
  const candidate = origin
    ? {
      x: origin.x + rawDelta.x,
      y: origin.y + rawDelta.y,
    }
    : null;
  const snapEnabled = shouldSnapDrag(dragOrigins, snapSettings);

  if (!snapEnabled || !origin || !candidate) {
    return {
      snapEnabled,
      gridSize: snapSettings?.gridSize ?? null,
      origin,
      candidate,
      snapped: candidate,
      appliedDelta: rawDelta,
    };
  }

  const snapped = snapWorldPositionToGrid(candidate, snapSettings.gridSize);

  return {
    snapEnabled,
    gridSize: snapSettings.gridSize,
    origin,
    candidate,
    snapped,
    appliedDelta: {
      x: snapped.x - origin.x,
      y: snapped.y - origin.y,
    },
  };
}

export function getSnappedDragDelta({
  dragOrigins,
  anchorTileId,
  rawDelta,
  snapSettings,
}) {
  return resolveSnappedDragDelta({
    dragOrigins,
    anchorTileId,
    rawDelta,
    snapSettings,
  }).appliedDelta;
}

export function getSnappedDragDebugState({
  dragOrigins,
  anchorTileId,
  rawDelta,
  snapSettings,
}) {
  return resolveSnappedDragDelta({
    dragOrigins,
    anchorTileId,
    rawDelta,
    snapSettings,
  });
}
