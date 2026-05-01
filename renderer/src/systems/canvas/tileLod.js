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

const FAR_VISIBLE_THRESHOLD = 70;

export function resolveWorkspaceLodLevel({
  viewportZoom,
  visibleTileCount,
  previousLevel = WORKSPACE_LOD_LEVEL.NORMAL,
}) {
  void viewportZoom;
  void previousLevel;
  const safeVisibleCount = Number.isFinite(visibleTileCount) ? visibleTileCount : 0;
  return safeVisibleCount > FAR_VISIBLE_THRESHOLD
    ? WORKSPACE_LOD_LEVEL.FAR
    : WORKSPACE_LOD_LEVEL.NORMAL;
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
