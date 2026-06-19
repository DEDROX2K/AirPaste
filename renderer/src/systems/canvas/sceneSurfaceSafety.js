const SCENE_SAFE_TEXT_TILE_TYPES = new Set([
  "canvas-text",
  "checklist",
  "code",
  "note",
  "table",
  "text-box",
]);

function getNormalizedType(tile) {
  return String(tile?.type || "").toLowerCase();
}

function hasUsableSceneImage(tile) {
  const directImage = typeof tile?.image === "string" ? tile.image.trim() : "";
  if (directImage) {
    return true;
  }

  const assetPath = typeof tile?.asset?.relativePath === "string"
    ? tile.asset.relativePath.trim()
    : "";

  return Boolean(
    assetPath
    && String(tile?.contentKind || "").toLowerCase() === "image"
  );
}

export function isSceneSafeTile(tile) {
  const type = getNormalizedType(tile);

  if (SCENE_SAFE_TEXT_TILE_TYPES.has(type)) {
    return true;
  }

  if (type === "link" || type === "amazon-product") {
    return hasUsableSceneImage(tile);
  }

  return false;
}

