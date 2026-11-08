// Magnetic tile snapping. While tiles are dragged, the selection's edges pull
// to nearby tiles: aligned with them (left to left, top to top, centre to
// centre) or side by side with an even gap. Dropping tiles near each other
// therefore lines them up into a tidy grid. It is switched on from the
// canvas right-click menu (off by default); the 32px grid snap wins when both
// are on, and holding Alt while dragging turns it off for that drag.
//
// The tile doesn't jump into place: the drag shows the snap correction
// easing toward its target (easeSnapOffset), so it glides in like a magnet
// and glides back out when pulled away.
//
// Distances the user feels (how close before it pulls, how far it looks for
// neighbours) are screen pixels, divided by zoom to get world units.

// The gap between tiles placed side by side; matches the sticky "+" gap.
export const TILE_SNAP_GAP = 24;
export const TILE_SNAP_THRESHOLD_PX = 12;
const TILE_SNAP_NEIGHBOURHOOD_PX = 480;
// How fast the tile glides into (and out of) a snap: the gap left closes by
// ~63% every TILE_SNAP_EASE_MS, so it's ~95% there after three of them.
const TILE_SNAP_EASE_MS = 45;
const TILE_SNAP_SETTLE_DISTANCE = 0.1;

export function toSnapRect({ x, y, width, height }) {
  return {
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

export function getSnapRectsBounds(rects) {
  if (!rects || rects.length === 0) {
    return null;
  }

  return rects.reduce((bounds, rect) => ({
    left: Math.min(bounds.left, rect.left),
    top: Math.min(bounds.top, rect.top),
    right: Math.max(bounds.right, rect.right),
    bottom: Math.max(bounds.bottom, rect.bottom),
  }));
}

function offsetRect(rect, dx, dy) {
  return {
    left: rect.left + dx,
    top: rect.top + dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
  };
}

function rectDistance(a, b) {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}

function rangesOverlap(startA, endA, startB, endB, slack = 0) {
  return startA < endB + slack && startB < endA + slack;
}

// Each axis is described by the names of its edges, so one routine snaps
// both: x uses left/right, y uses top/bottom.
const AXES = {
  x: { start: "left", end: "right", crossStart: "top", crossEnd: "bottom" },
  y: { start: "top", end: "bottom", crossStart: "left", crossEnd: "right" },
};

function getAxisCandidates(moving, neighbour, axis) {
  const { start, end, crossStart, crossEnd } = AXES[axis];
  const movingCenter = (moving[start] + moving[end]) / 2;
  const neighbourCenter = (neighbour[start] + neighbour[end]) / 2;
  const candidates = [
    { kind: "align", source: moving[start], target: neighbour[start] },
    { kind: "align", source: moving[end], target: neighbour[end] },
    { kind: "align", source: movingCenter, target: neighbourCenter },
  ];

  // Side by side only makes sense for tiles in the same row (or column).
  if (rangesOverlap(moving[crossStart], moving[crossEnd], neighbour[crossStart], neighbour[crossEnd], TILE_SNAP_GAP)) {
    candidates.push(
      { kind: "gap", source: moving[start], target: neighbour[end] + TILE_SNAP_GAP },
      { kind: "gap", source: moving[end], target: neighbour[start] - TILE_SNAP_GAP },
    );
  }

  return candidates;
}

function findAxisSnap(moving, neighbours, axis, threshold) {
  let best = null;

  for (const neighbour of neighbours) {
    for (const candidate of getAxisCandidates(moving, neighbour, axis)) {
      const offset = candidate.target - candidate.source;
      const distance = Math.abs(offset);

      if (distance > threshold) {
        continue;
      }

      // Closest pull wins; on a tie, gaps beat alignment (they make the
      // grid) and nearer tiles beat farther ones.
      const score = distance
        + (candidate.kind === "gap" ? 0 : 0.01)
        + rectDistance(moving, neighbour) * 1e-6;

      if (!best || score < best.score) {
        best = { ...candidate, offset, score };
      }
    }
  }

  return best;
}

// `bounds` is the dragged selection at its starting position, `rawDelta` the
// pointer's movement in world units. Returns the snapped delta.
export function resolveTileMagnetSnap({ bounds, neighbours, rawDelta, zoom }) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  if (!bounds || !neighbours || neighbours.length === 0) {
    return rawDelta;
  }

  const moving = offsetRect(bounds, rawDelta.x, rawDelta.y);
  const reach = TILE_SNAP_NEIGHBOURHOOD_PX / safeZoom;
  const nearby = neighbours.filter((rect) => rectDistance(moving, rect) <= reach);

  if (nearby.length === 0) {
    return rawDelta;
  }

  const threshold = TILE_SNAP_THRESHOLD_PX / safeZoom;
  const snapX = findAxisSnap(moving, nearby, "x", threshold);
  const snapY = findAxisSnap(moving, nearby, "y", threshold);
  return {
    x: rawDelta.x + (snapX?.offset ?? 0),
    y: rawDelta.y + (snapY?.offset ?? 0),
  };
}

// One animation frame of the glide: moves the shown snap offset toward its
// target by frame time (not wall-clock time), so it eases out the same at
// any frame rate and lands exactly on the target.
export function easeSnapOffset(current, target, frameMs) {
  const progress = 1 - Math.exp(-Math.max(0, frameMs) / TILE_SNAP_EASE_MS);
  const next = {
    x: current.x + ((target.x - current.x) * progress),
    y: current.y + ((target.y - current.y) * progress),
  };

  return Math.hypot(target.x - next.x, target.y - next.y) < TILE_SNAP_SETTLE_DISTANCE
    ? { x: target.x, y: target.y }
    : next;
}
