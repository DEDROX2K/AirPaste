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

const FAR_ZOOM_ENTER = 0.34;
const FAR_ZOOM_EXIT = 0.41;
const FAR_VISIBLE_ENTER = 64;
const FAR_VISIBLE_EXIT = 48;

export function resolveWorkspaceLodLevel({
  viewportZoom,
  visibleTileCount,
  previousLevel = WORKSPACE_LOD_LEVEL.NORMAL,
}) {
  const safeZoom = Number.isFinite(viewportZoom) ? viewportZoom : 1;
  const safeVisibleCount = Number.isFinite(visibleTileCount) ? visibleTileCount : 0;
  const wasFar = previousLevel === WORKSPACE_LOD_LEVEL.FAR;

  if (wasFar) {
    const shouldRemainFar = safeZoom < FAR_ZOOM_EXIT || safeVisibleCount > FAR_VISIBLE_EXIT;
    return shouldRemainFar ? WORKSPACE_LOD_LEVEL.FAR : WORKSPACE_LOD_LEVEL.NORMAL;
  }

  const shouldEnterFar = safeZoom <= FAR_ZOOM_ENTER || safeVisibleCount >= FAR_VISIBLE_ENTER;
  return shouldEnterFar ? WORKSPACE_LOD_LEVEL.FAR : WORKSPACE_LOD_LEVEL.NORMAL;
}

export function buildTileRenderHint({
  lodLevel = WORKSPACE_LOD_LEVEL.NORMAL,
  forceFullFidelity = false,
}) {
  const effectiveLodLevel = forceFullFidelity ? WORKSPACE_LOD_LEVEL.NORMAL : lodLevel;
  const isFarLod = effectiveLodLevel === WORKSPACE_LOD_LEVEL.FAR;

  return {
    lodLevel: effectiveLodLevel,
    previewTier: isFarLod ? PREVIEW_TIER.MEDIUM : PREVIEW_TIER.ORIGINAL,
    simplify: false,
    imageEnabled: !isFarLod,
    showToolbar: true,
    showActions: true,
    disableImageReveal: false,
    usePreviewColorBlock: isFarLod,
  };
}

export function normalizePreviewTier(value) {
  return PREVIEW_TIERS.has(value) ? value : PREVIEW_TIER.ORIGINAL;
}
