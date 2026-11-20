// Rack geometry, in world px. Pure and import-free on purpose: lib/workspace,
// the layout system, the interaction system and RackTile all read it, and
// lib/workspace <-> tiles/rack/model already import each other.
//
// The rack is a shelf (public/rack/rack_edge.svg, scaled by SHELF_SCALE: the
// right cap as drawn, the left cap mirrored, the middle stretched) with the
// racked tiles standing on it side by side, all SLOT_IMAGE_HEIGHT tall, each
// in a dark frame with a caption strip. Their feet sink SLOT_SINK into the
// shelf's top surface. Full rules: docs/rules/rack-rules.md.

export const SHELF_SCALE = 2.4;
// rack_edge.svg is 114 x 30.3645; its sloped cap starts 37.873 in.
export const SHELF_SVG_HEIGHT = 30.3645;
export const SHELF_HEIGHT = SHELF_SVG_HEIGHT * SHELF_SCALE;
export const SHELF_CAP_INSET = 37.873 * SHELF_SCALE;
// Shelf's outer edge to the first tile's frame.
export const SHELF_SIDE = SHELF_CAP_INSET + 44;

export const SLOT_IMAGE_HEIGHT = 250;
export const SLOT_FRAME_PADDING = 6;
export const SLOT_CAPTION_HEIGHT = 30;
export const SLOT_GAP = 30;
export const SLOT_FRAME_HEIGHT = SLOT_IMAGE_HEIGHT + SLOT_FRAME_PADDING + SLOT_CAPTION_HEIGHT;
export const SLOT_SINK = SHELF_HEIGHT * 0.36;
// A tile keeps its own shape in the rack, within these proportions; past
// them it is cropped (covered, top-aligned) so one panorama can't take over.
export const SLOT_MIN_ASPECT = 0.56;
export const SLOT_MAX_ASPECT = 1.9;
// Width of a slot whose tile isn't known (legacy data, a missing child).
export const SLOT_DEFAULT_FRAME_WIDTH = Math.round(SLOT_IMAGE_HEIGHT * 0.8) + (SLOT_FRAME_PADDING * 2);

export const RACK_HEIGHT = 360;
export const RACK_MIN_WIDTH = (SHELF_SIDE * 2) + 220;
// Top of the shelf and of every frame, from the rack's top edge.
export const RACK_SHELF_TOP = RACK_HEIGHT - SHELF_HEIGHT;
export const RACK_FRAME_TOP = RACK_SHELF_TOP + SLOT_SINK - SLOT_FRAME_HEIGHT;

// Drop zone around the rack (see findRackDropTarget): the shelf plus this
// much each side, from ZONE_ABOVE over the frames to ZONE_BELOW under the
// shelf, and ZONE_HYSTERESIS more once a drag is inside it.
export const RACK_ZONE_SIDE = 30;
export const RACK_ZONE_ABOVE = 150;
export const RACK_ZONE_BELOW = 60;
export const RACK_ZONE_HYSTERESIS = 40;
// Within this distance of the zone a dragged tile starts shrinking toward
// its rack size (up to RACK_APPROACH_MAX of the way), before it is in.
export const RACK_APPROACH_REACH = 220;
export const RACK_APPROACH_MAX = 0.3;
// Release velocity is projected this far ahead (s) to decide where a throw
// lands: a tile flung at a rack docks even if the pointer never reached it.
export const RACK_FLING_PROJECTION = 0.12;
// A racked tile rubber-bands until it is pulled this far, then tears off.
export const RACK_TEAR_DISTANCE = 56;
export const RACK_RUBBER_RANGE = 110;

function finiteOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// The size a tile takes in the rack: image box, the scale its real content
// is drawn at (cover, top-aligned) and the frame around it.
export function getRackSlotMetrics(tile) {
  const width = finiteOr(tile?.width, SLOT_IMAGE_HEIGHT * 0.8);
  const height = finiteOr(tile?.height, SLOT_IMAGE_HEIGHT);
  const aspect = Math.min(SLOT_MAX_ASPECT, Math.max(SLOT_MIN_ASPECT, width / height));
  const imageWidth = Math.round(SLOT_IMAGE_HEIGHT * aspect);
  const scale = Math.max(imageWidth / width, SLOT_IMAGE_HEIGHT / height);

  return {
    imageWidth,
    imageHeight: SLOT_IMAGE_HEIGHT,
    scale,
    frameWidth: imageWidth + (SLOT_FRAME_PADDING * 2),
    frameHeight: SLOT_FRAME_HEIGHT,
    // The scale a dragged tile shrinks to over the rack, so it reads as the
    // size it will take. Height-led, like the slot itself.
    approachScale: SLOT_IMAGE_HEIGHT / height,
  };
}

export function getRackFrameWidth(tile) {
  return getRackSlotMetrics(tile).frameWidth;
}

export function normalizeRackSlotWidths(slotWidths, count) {
  const source = Array.isArray(slotWidths) ? slotWidths : [];
  return Array.from({ length: Math.max(0, count) }, (_, index) => (
    Number.isFinite(source[index]) && source[index] > 0 ? source[index] : SLOT_DEFAULT_FRAME_WIDTH
  ));
}

export function getRackRowWidth(slotWidths) {
  const widths = Array.isArray(slotWidths) ? slotWidths : [];
  return widths.reduce((total, width) => total + width, 0) + (SLOT_GAP * Math.max(0, widths.length - 1));
}

export function getRackWidthForSlots(slotWidths) {
  return Math.max(RACK_MIN_WIDTH, getRackRowWidth(slotWidths) + (SHELF_SIDE * 2));
}

// Left edge and centre of each frame, from the rack's horizontal centre,
// with an optional gap (the width of what is about to go in) at gapIndex.
export function getRackRowLayout(slotWidths, { gapIndex = null, gapWidth = 0 } = {}) {
  const widths = Array.isArray(slotWidths) ? [...slotWidths] : [];
  const hasGap = Number.isFinite(gapIndex) && gapWidth > 0;
  const gapAt = hasGap ? Math.max(0, Math.min(widths.length, Math.round(gapIndex))) : -1;
  const entries = widths.map((width, index) => ({ index, width, gap: false }));

  if (hasGap) {
    entries.splice(gapAt, 0, { index: -1, width: gapWidth, gap: true });
  }

  const rowWidth = getRackRowWidth(entries.map((entry) => entry.width));
  let left = -rowWidth / 2;

  const placed = entries.map((entry) => {
    const next = { ...entry, left, center: left + (entry.width / 2) };
    left += entry.width + SLOT_GAP;
    return next;
  });

  return {
    slots: placed.filter((entry) => !entry.gap),
    gap: placed.find((entry) => entry.gap) ?? null,
    width: Math.max(RACK_MIN_WIDTH, rowWidth + (SHELF_SIDE * 2)),
  };
}

// Where a tile dropped with its centre at centerX (from the rack's centre)
// goes: after every frame whose centre is left of it.
export function getRackInsertionIndex(slotWidths, centerX) {
  return getRackRowLayout(slotWidths).slots.filter((slot) => slot.center < centerX).length;
}

// The shelf outline at a given width in SVG units (world width / SHELF_SCALE):
// rack_edge.svg's right cap, mirrored for the left, joined by the top edge.
export function getShelfPath(svgWidth) {
  const d = svgWidth - 114;
  const f = (value) => value.toFixed(3);

  return `M37.873 0H${f(d + 76.127)}C${f(d + 77.6372)} 0 ${f(d + 79.0924)} .5695 ${f(d + 80.2012)} 1.5949L${f(d + 111.804)} 19.9588C${f(d + 115.812)} 23.6654 ${f(d + 113.189)} 30.3641 ${f(d + 107.729)} 30.3641H6.271C.811 30.3641 -1.812 23.6654 2.196 19.9588L33.7988 1.5949C34.9076 .5695 36.3628 0 37.873 0Z`;
}

// Apple's rubber band: (1 - 1 / (x * 0.55 / d + 1)) * d.
export function rubberBand(offset, range = RACK_RUBBER_RANGE) {
  return Math.sign(offset) * (1 - (1 / ((Math.abs(offset) * 0.55 / range) + 1))) * range;
}
