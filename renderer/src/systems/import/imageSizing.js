const IMAGE_CARD_PORTRAIT_MAX_WIDTH = 320;
const IMAGE_CARD_PORTRAIT_MAX_HEIGHT = 540;
const IMAGE_CARD_SQUARE_MAX_WIDTH = 340;
const IMAGE_CARD_SQUARE_MAX_HEIGHT = 380;
const IMAGE_CARD_LANDSCAPE_MAX_WIDTH = 420;
const IMAGE_CARD_LANDSCAPE_MAX_HEIGHT = 320;
const IMAGE_CARD_MIN_WIDTH = 180;
const IMAGE_CARD_MIN_HEIGHT = 140;
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
    const side = Math.max(
      IMAGE_CARD_MIN_WIDTH,
      Math.min(IMAGE_CARD_SQUARE_MAX_WIDTH, Math.round(Math.min(width, height))),
    );

    return {
      width: side,
      height: side,
    };
  }

  const aspectRatio = width / height;
  const bounds = aspectRatio < 0.9
    ? {
      maxWidth: IMAGE_CARD_PORTRAIT_MAX_WIDTH,
      maxHeight: IMAGE_CARD_PORTRAIT_MAX_HEIGHT,
    }
    : aspectRatio > 1.18
      ? {
        maxWidth: IMAGE_CARD_LANDSCAPE_MAX_WIDTH,
        maxHeight: IMAGE_CARD_LANDSCAPE_MAX_HEIGHT,
      }
      : {
        maxWidth: IMAGE_CARD_SQUARE_MAX_WIDTH,
        maxHeight: IMAGE_CARD_SQUARE_MAX_HEIGHT,
      };

  let scale = Math.min(
    bounds.maxWidth / width,
    bounds.maxHeight / height,
    1,
  );
  let nextWidth = width * scale;
  let nextHeight = height * scale;

  if (nextWidth < IMAGE_CARD_MIN_WIDTH && nextHeight < IMAGE_CARD_MIN_HEIGHT) {
    const upscale = Math.max(
      IMAGE_CARD_MIN_WIDTH / nextWidth,
      IMAGE_CARD_MIN_HEIGHT / nextHeight,
    );

    nextWidth *= upscale;
    nextHeight *= upscale;
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
