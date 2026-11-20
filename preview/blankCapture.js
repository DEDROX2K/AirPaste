// Blank screenshots. A page behind a login (a private Jira issue, say) or
// one that never finished rendering captures as a flat white (or flat any
// colour) frame. That is not a preview: drop it, so the tile shows the
// failed-preview state instead of an empty image.
//
// Measured on 96px-wide thumbnails: a private Jira page is 0% "off" pixels;
// real pages are 5% (example.com) to 12%+ (Google results, Hacker News).

const THUMB_WIDTH = 96;
const OFF_DISTANCE = 24; // luminance steps from the frame's mean
const MAX_OFF_SHARE = 0.01; // under 1% of pixels differ -> blank

// bgra: a BGRA (or RGBA, the weights barely differ) pixel buffer.
function isBlankBitmap(bgra) {
  const pixelCount = Math.floor((bgra?.length ?? 0) / 4);
  if (pixelCount === 0) {
    return true;
  }

  const luminance = new Float32Array(pixelCount);
  let sum = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const i = pixel * 4;
    const value = 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2];
    luminance[pixel] = value;
    sum += value;
  }

  const mean = sum / pixelCount;
  let off = 0;

  for (const value of luminance) {
    if (Math.abs(value - mean) > OFF_DISTANCE) {
      off += 1;
    }
  }

  return off / pixelCount < MAX_OFF_SHARE;
}

// image: an Electron NativeImage (from webContents.capturePage()).
function isBlankCapture(image) {
  try {
    if (!image || image.isEmpty()) {
      return true;
    }

    return isBlankBitmap(image.resize({ width: THUMB_WIDTH, quality: "good" }).toBitmap());
  } catch {
    return false;
  }
}

module.exports = {
  isBlankBitmap,
  isBlankCapture,
};
