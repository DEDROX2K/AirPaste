// Cropping a webclip from the bottom. A webclip tile is sized to the whole
// captured page (width / webclipAspectRatio), which can be very tall. The
// handle on its bottom edge drags the tile shorter: the image stays pinned
// to the top, so the page is cut off below, behind a progressive blur.
//
// The crop is stored as a fraction of the full height (webclipCropRatio,
// null = uncropped) so it survives switching preview modes and resizing.

// The shortest a crop can make the tile, in canvas px (or the full height,
// if the page itself is shorter).
export const WEBCLIP_MIN_CROP_HEIGHT = 160;

export function normalizeWebclipCropRatio(value) {
  return Number.isFinite(value) && value > 0 && value < 1 ? Number(value) : null;
}

// The tile's height with nothing cropped, or null when the page's
// proportions aren't known yet.
export function getWebclipFullHeight(card) {
  const aspect = card?.webclipAspectRatio;

  if (!(aspect > 0) || !(card?.width > 0)) {
    return null;
  }

  return card.width / aspect;
}

// The tile's height for a webclip of this width, with its crop applied.
export function getWebclipHeight(width, aspect, cropRatio = null) {
  const full = width / aspect;
  const ratio = normalizeWebclipCropRatio(cropRatio);

  return Math.round(ratio === null ? full : Math.max(Math.min(WEBCLIP_MIN_CROP_HEIGHT, full), full * ratio));
}

// The card patch for dragging the bottom handle to `height` (canvas px):
// clamped between the minimum and the whole page; dragging back to the
// bottom clears the crop.
export function getWebclipCropPatch(card, height) {
  const full = getWebclipFullHeight(card);

  if (full === null || !Number.isFinite(height)) {
    return null;
  }

  const min = Math.min(WEBCLIP_MIN_CROP_HEIGHT, full);
  const nextHeight = Math.round(Math.min(full, Math.max(min, height)));
  const ratio = nextHeight / full;

  return {
    height: nextHeight,
    webclipCropRatio: ratio >= 0.999 ? null : ratio,
  };
}
