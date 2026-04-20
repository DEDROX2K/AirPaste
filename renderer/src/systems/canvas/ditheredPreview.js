const DITHER_VERSION = "dither-v1";
const DEFAULT_DITHER_SIZE = 24;
const DEFAULT_POSTERIZE_LEVELS = 4;

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const ditherPreviewCache = new Map();
const ditherPendingCache = new Map();

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function scheduleIdleWork(task) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => {
      task();
    }, { timeout: 120 });
    return;
  }

  window.setTimeout(task, 0);
}

function drawImageCover(ctx, image, targetWidth, targetHeight) {
  const sourceWidth = Math.max(1, image?.naturalWidth ?? image?.width ?? 1);
  const sourceHeight = Math.max(1, image?.naturalHeight ?? image?.height ?? 1);
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    cropX = (sourceWidth - cropWidth) * 0.5;
  } else if (sourceAspect < targetAspect) {
    cropHeight = sourceWidth / targetAspect;
    cropY = (sourceHeight - cropHeight) * 0.5;
  }

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
}

function applyOrderedDither(imageData, levels) {
  const safeLevels = Math.max(2, levels);
  const step = 255 / (safeLevels - 1);
  const thresholdScale = step * 0.5;
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];

      if (alpha <= 0) {
        continue;
      }

      const matrixValue = BAYER_4X4[y % 4][x % 4];
      const threshold = ((matrixValue / 16) - 0.5) * thresholdScale;

      for (let channelOffset = 0; channelOffset < 3; channelOffset += 1) {
        const original = data[index + channelOffset];
        const adjusted = clampByte(original + threshold);
        const quantized = Math.round(adjusted / step) * step;
        data[index + channelOffset] = clampByte(quantized);
      }
    }
  }
}

function buildDitherPreviewCanvas(image, size, posterizeLevels) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return canvas;
  }

  context.imageSmoothingEnabled = true;
  drawImageCover(context, image, size, size);

  try {
    const imageData = context.getImageData(0, 0, size, size);
    applyOrderedDither(imageData, posterizeLevels);
    context.putImageData(imageData, 0, 0);
  } catch {
    // Cross-origin images can taint canvas; keep pixelated thumbnail fallback.
  }

  return canvas;
}

export function getDitheredPreviewCacheKey(imageSrc, size = DEFAULT_DITHER_SIZE) {
  if (typeof imageSrc !== "string" || !imageSrc) {
    return "";
  }

  return `${imageSrc}|${DITHER_VERSION}|${size}`;
}

export function getCachedDitheredPreview(imageSrc, size = DEFAULT_DITHER_SIZE) {
  const cacheKey = getDitheredPreviewCacheKey(imageSrc, size);
  if (!cacheKey) {
    return null;
  }

  return ditherPreviewCache.get(cacheKey) ?? null;
}

export function ensureDitheredPreview({
  imageSrc,
  image,
  size = DEFAULT_DITHER_SIZE,
  posterizeLevels = DEFAULT_POSTERIZE_LEVELS,
}) {
  if (!image || typeof imageSrc !== "string" || !imageSrc) {
    return null;
  }

  const cacheKey = getDitheredPreviewCacheKey(imageSrc, size);
  if (!cacheKey) {
    return null;
  }

  if (ditherPreviewCache.has(cacheKey)) {
    return null;
  }

  if (ditherPendingCache.has(cacheKey)) {
    return ditherPendingCache.get(cacheKey);
  }

  const pending = new Promise((resolve) => {
    scheduleIdleWork(() => {
      const previewCanvas = buildDitherPreviewCanvas(image, size, posterizeLevels);
      ditherPreviewCache.set(cacheKey, previewCanvas);
      ditherPendingCache.delete(cacheKey);
      resolve(previewCanvas);
    });
  });

  ditherPendingCache.set(cacheKey, pending);
  return pending;
}
