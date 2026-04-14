export const PREVIEW_TIER = Object.freeze({
  THUMBNAIL: "thumbnail",
  MEDIUM: "medium",
  HIGH: "high",
  ORIGINAL: "original",
});

const PREVIEW_TIERS = Object.freeze([
  PREVIEW_TIER.THUMBNAIL,
  PREVIEW_TIER.MEDIUM,
  PREVIEW_TIER.HIGH,
  PREVIEW_TIER.ORIGINAL,
]);

const PREVIEW_TIER_BOUNDARIES = Object.freeze([
  170,
  460,
  1120,
]);
const TIER_HYSTERESIS_UP = 1.16;
const TIER_HYSTERESIS_DOWN = 0.84;

function getRackAttachedScale(tile) {
  return Math.max(
    0.5,
    Math.min(
      0.74,
      164 / Math.max(1, tile.width),
      210 / Math.max(1, tile.height),
    ),
  );
}

function getScreenSpace(tile, tileMeta, viewportZoom) {
  const worldWidth = Number.isFinite(tileMeta?.renderWidth)
    ? tileMeta.renderWidth
    : Number.isFinite(tile?.width)
      ? tile.width
      : 1;
  const worldHeight = Number.isFinite(tileMeta?.renderHeight)
    ? tileMeta.renderHeight
    : Number.isFinite(tile?.height)
      ? tile.height
      : 1;
  const rackScale = tileMeta?.isRackAttached && !Number.isFinite(tileMeta?.renderWidth)
    ? getRackAttachedScale(tile)
    : 1;
  const width = Math.max(1, worldWidth * viewportZoom * rackScale);
  const height = Math.max(1, worldHeight * viewportZoom * rackScale);
  const effectiveDimension = Math.max(
    width,
    height,
    Math.sqrt(Math.max(1, width * height)) * 0.9,
  );

  return {
    width,
    height,
    maxDimension: Math.max(width, height),
    area: width * height,
    effectiveDimension,
  };
}

export function getPreviewTierFromScreenSpace({
  effectiveDimension,
  devicePixelRatio = 1,
}) {
  const dprFactor = Math.max(1, Math.min(2, devicePixelRatio));
  const normalizedDimension = effectiveDimension * Math.sqrt(dprFactor);
  const [thumbnailBoundary, mediumBoundary, highBoundary] = PREVIEW_TIER_BOUNDARIES;

  if (normalizedDimension <= thumbnailBoundary) {
    return PREVIEW_TIER.THUMBNAIL;
  }

  if (normalizedDimension <= mediumBoundary) {
    return PREVIEW_TIER.MEDIUM;
  }

  if (normalizedDimension <= highBoundary) {
    return PREVIEW_TIER.HIGH;
  }

  return PREVIEW_TIER.ORIGINAL;
}

function applyPreviewTierHysteresis({
  nextTier,
  previousTier,
  effectiveDimension,
  devicePixelRatio = 1,
}) {
  const previousIndex = PREVIEW_TIERS.indexOf(previousTier);
  const nextIndex = PREVIEW_TIERS.indexOf(nextTier);

  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) {
    return nextTier;
  }

  const dprFactor = Math.max(1, Math.min(2, devicePixelRatio));
  const normalizedDimension = effectiveDimension * Math.sqrt(dprFactor);

  if (nextIndex > previousIndex) {
    const boundary = PREVIEW_TIER_BOUNDARIES[Math.max(0, previousIndex)] ?? PREVIEW_TIER_BOUNDARIES[0];
    if (normalizedDimension < boundary * TIER_HYSTERESIS_UP) {
      return previousTier;
    }
    return nextTier;
  }

  const boundary = PREVIEW_TIER_BOUNDARIES[Math.max(0, nextIndex)] ?? PREVIEW_TIER_BOUNDARIES[0];
  if (normalizedDimension > boundary * TIER_HYSTERESIS_DOWN) {
    return previousTier;
  }

  return nextTier;
}

export function buildTileRenderHint({
  tile,
  tileMeta,
  viewportZoom,
  isCanvasMoving,
  devicePixelRatio = 1,
  previousHint = null,
}) {
  const screen = getScreenSpace(tile, tileMeta, viewportZoom);
  const basePreviewTier = getPreviewTierFromScreenSpace({
    effectiveDimension: screen.effectiveDimension,
    devicePixelRatio,
  });
  let previewTier = applyPreviewTierHysteresis({
    nextTier: basePreviewTier,
    previousTier: previousHint?.previewTier ?? null,
    effectiveDimension: screen.effectiveDimension,
    devicePixelRatio,
  });
  if (isCanvasMoving && previousHint?.previewTier) {
    previewTier = previousHint.previewTier;
  }

  const simplifyForZoom = viewportZoom < 0.46 || screen.maxDimension < 120;
  const simplifyForMotion = isCanvasMoving && screen.maxDimension < 520;
  const simplify = simplifyForZoom || simplifyForMotion;
  const imageEnabled = previewTier !== PREVIEW_TIER.THUMBNAIL && (!isCanvasMoving || screen.maxDimension >= 220);
  const showToolbar = !simplify || tileMeta?.isSelected || tileMeta?.isFocused;
  const showActions = !simplify && !isCanvasMoving && screen.maxDimension >= 260;
  const disableImageReveal = isCanvasMoving || simplify;

  return {
    previewTier,
    simplify,
    imageEnabled,
    showToolbar,
    showActions,
    disableImageReveal,
  };
}

export function normalizePreviewTier(value) {
  return PREVIEW_TIERS.includes(value) ? value : PREVIEW_TIER.ORIGINAL;
}
