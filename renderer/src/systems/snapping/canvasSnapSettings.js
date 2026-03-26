import { CANVAS_GRID_SIZE } from "../canvas/canvasMath";

export const DEFAULT_CANVAS_SNAP_SETTINGS = Object.freeze({
  enabled: false,
  gridSize: CANVAS_GRID_SIZE,
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
  };
}

export function buildCanvasSnapUiStatePatch(snapSettings) {
  const normalized = normalizeCanvasSnapSettings(snapSettings);

  return {
    canvasSnapToGrid: normalized.enabled,
    canvasSnapGridSize: normalized.gridSize,
  };
}
