import { CANVAS_GRID_SIZE } from "../canvas/canvasMath";

// `enabled` is the 32px grid snap; `magnetEnabled` the magnetic tile snap
// (systems/snapping/tileMagnetSnapping.js). Both start off.
export const DEFAULT_CANVAS_SNAP_SETTINGS = Object.freeze({
  enabled: false,
  gridSize: CANVAS_GRID_SIZE,
  magnetEnabled: false,
});

export function normalizeCanvasSnapGridSize(value, fallback = DEFAULT_CANVAS_SNAP_SETTINGS.gridSize) {
  return Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

export function normalizeCanvasSnapSettings(uiState) {
  const gridSize = normalizeCanvasSnapGridSize(
    uiState?.canvasSnapGridSize,
    normalizeCanvasSnapGridSize(uiState?.gridSize),
  );

  return {
    enabled: typeof uiState?.canvasSnapToGrid === "boolean"
      ? uiState.canvasSnapToGrid
      : typeof uiState?.enabled === "boolean"
        ? uiState.enabled
      : DEFAULT_CANVAS_SNAP_SETTINGS.enabled,
    gridSize,
    magnetEnabled: typeof uiState?.canvasMagnetSnap === "boolean"
      ? uiState.canvasMagnetSnap
      : typeof uiState?.magnetEnabled === "boolean"
        ? uiState.magnetEnabled
        : DEFAULT_CANVAS_SNAP_SETTINGS.magnetEnabled,
  };
}

export function buildCanvasSnapUiStatePatch(snapSettings) {
  const normalized = normalizeCanvasSnapSettings(snapSettings);

  return {
    canvasSnapToGrid: normalized.enabled,
    canvasSnapGridSize: normalized.gridSize,
    canvasMagnetSnap: normalized.magnetEnabled,
  };
}
