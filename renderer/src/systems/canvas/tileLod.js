export const PREVIEW_TIER = Object.freeze({
  THUMBNAIL: "thumbnail",
  MEDIUM: "medium",
  HIGH: "high",
  ORIGINAL: "original",
});

const PREVIEW_TIERS = new Set([
  PREVIEW_TIER.THUMBNAIL,
  PREVIEW_TIER.MEDIUM,
  PREVIEW_TIER.HIGH,
  PREVIEW_TIER.ORIGINAL,
]);

export const WORKSPACE_LOD_LEVEL = Object.freeze({
  NORMAL: "lod0",
  FAR: "lod1",
});

const FAR_VISIBLE_THRESHOLD = 28;
const FAR_VISIBLE_THRESHOLD_EXIT = 18;
const FAR_ZOOM_THRESHOLD = 0.42;
const FAR_ZOOM_THRESHOLD_EXIT = 0.5;
const ENABLE_WORKSPACE_LOD = false;

export const ZOOM_PREVIEW_BANDS = Object.freeze([
  Object.freeze({ minZoom: 0.9, previewTier: PREVIEW_TIER.ORIGINAL }),
  Object.freeze({ minZoom: 0.65, previewTier: PREVIEW_TIER.HIGH }),
  Object.freeze({ minZoom: 0.45, previewTier: PREVIEW_TIER.MEDIUM }),
  Object.freeze({ minZoom: 0, previewTier: PREVIEW_TIER.MEDIUM }),
]);

export function resolveZoomPreviewTier(viewportZoom) {
  const safeZoom = Number.isFinite(viewportZoom) ? viewportZoom : 1;
  const band = ZOOM_PREVIEW_BANDS.find((entry) => safeZoom >= entry.minZoom);
  return band?.previewTier ?? PREVIEW_TIER.ORIGINAL;
}

export function resolveWorkspaceLodLevel({
  viewportZoom,
  visibleTileCount,
  previousLevel = WORKSPACE_LOD_LEVEL.NORMAL,
}) {
  if (!ENABLE_WORKSPACE_LOD) {
    return WORKSPACE_LOD_LEVEL.NORMAL;
  }

  const safeZoom = Number.isFinite(viewportZoom) ? viewportZoom : 1;
  const safeVisibleCount = Number.isFinite(visibleTileCount) ? visibleTileCount : 0;

  if (previousLevel === WORKSPACE_LOD_LEVEL.FAR) {
    return safeVisibleCount >= FAR_VISIBLE_THRESHOLD_EXIT || safeZoom <= FAR_ZOOM_THRESHOLD_EXIT
      ? WORKSPACE_LOD_LEVEL.FAR
      : WORKSPACE_LOD_LEVEL.NORMAL;
  }

  return safeVisibleCount >= FAR_VISIBLE_THRESHOLD || safeZoom <= FAR_ZOOM_THRESHOLD
    ? WORKSPACE_LOD_LEVEL.FAR
    : WORKSPACE_LOD_LEVEL.NORMAL;
}

export function buildTileRenderHint({
  lodLevel = WORKSPACE_LOD_LEVEL.NORMAL,
  forceFullFidelity = false,
  preferSpeed = false,
  viewportZoom = 1,
}) {
  const zoomPreviewTier = resolveZoomPreviewTier(viewportZoom);

  if (!ENABLE_WORKSPACE_LOD) {
    return {
      lodLevel: WORKSPACE_LOD_LEVEL.NORMAL,
      previewTier: forceFullFidelity ? PREVIEW_TIER.ORIGINAL : zoomPreviewTier,
      simplify: !forceFullFidelity && preferSpeed,
      imageEnabled: true,
      showToolbar: true,
      showActions: !(!forceFullFidelity && preferSpeed),
      disableImageReveal: !forceFullFidelity && preferSpeed,
      usePreviewColorBlock: false,
    };
  }

  const effectiveLodLevel = forceFullFidelity ? WORKSPACE_LOD_LEVEL.NORMAL : lodLevel;
  const isFarLod = effectiveLodLevel === WORKSPACE_LOD_LEVEL.FAR;
  const shouldSimplify = !forceFullFidelity && (isFarLod || preferSpeed);
  const shouldUseOptimizedImage = !forceFullFidelity && !isFarLod;

  return {
    lodLevel: effectiveLodLevel,
    previewTier: isFarLod
      ? PREVIEW_TIER.THUMBNAIL
      : (shouldUseOptimizedImage ? zoomPreviewTier : PREVIEW_TIER.ORIGINAL),
    simplify: shouldSimplify,
    imageEnabled: true,
    showToolbar: !isFarLod,
    showActions: !shouldSimplify,
    disableImageReveal: shouldSimplify,
    usePreviewColorBlock: isFarLod,
  };
}

export function normalizePreviewTier(value) {
  return PREVIEW_TIERS.has(value) ? value : PREVIEW_TIER.ORIGINAL;
}
