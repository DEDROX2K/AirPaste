const IMAGE_CARD_PORTRAIT_MAX_HEIGHT = 540;
const IMAGE_CARD_FIXED_WIDTH = 240;
const STICKER_TILE_MAX_WIDTH = 188;
const STICKER_TILE_MAX_HEIGHT = 188;
const STICKER_TILE_MIN_SIDE = 92;

export function getImageTileSize(width, height, previewKind = "default") {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {
      width: 340,
      height: 280,
    };
  }

  if (previewKind === "music") {
    const side = Math.round(IMAGE_CARD_FIXED_WIDTH);

    return {
      width: side,
      height: side,
    };
  }

  const aspectRatio = width / height;
  let nextWidth = IMAGE_CARD_FIXED_WIDTH;
  let nextHeight = IMAGE_CARD_FIXED_WIDTH / aspectRatio;

  if (nextHeight > IMAGE_CARD_PORTRAIT_MAX_HEIGHT) {
    nextHeight = IMAGE_CARD_PORTRAIT_MAX_HEIGHT;
    nextWidth = nextHeight * aspectRatio;
  }

  return {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
  };
}

export function getStickerTileSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {
      width: STICKER_TILE_MAX_WIDTH,
      height: STICKER_TILE_MAX_HEIGHT,
    };
  }

  const scaleToFit = Math.min(
    STICKER_TILE_MAX_WIDTH / width,
    STICKER_TILE_MAX_HEIGHT / height,
  );
  let nextWidth = width * scaleToFit;
  let nextHeight = height * scaleToFit;

  const largestSide = Math.max(nextWidth, nextHeight);

  if (largestSide < STICKER_TILE_MIN_SIDE) {
    const upscale = STICKER_TILE_MIN_SIDE / Math.max(1, largestSide);
    nextWidth *= upscale;
    nextHeight *= upscale;
  }

  return {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
  };
}
