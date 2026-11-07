// Magnetic tile snapping. While tiles are dragged, the selection's edges pull
// to nearby tiles: aligned with them (left to left, top to top, centre to
// centre) or side by side with an even gap. Dropping tiles near each other
// therefore lines them up into a tidy grid. It is on unless the 32px grid
// snap is on, and holding Alt while dragging turns it off.
//
// Distances the user feels (how close before it pulls, how far it looks for
// neighbours) are screen pixels, divided by zoom to get world units.

// The gap between tiles placed side by side; matches the sticky "+" gap.
export const TILE_SNAP_GAP = 24;
export const TILE_SNAP_THRESHOLD_PX = 8;
const TILE_SNAP_NEIGHBOURHOOD_PX = 480;

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
      { kind: "gap", source: moving[start], target: neighbour[end] + TILE_SNAP_GAP, gapFrom: neighbour[end] },
      { kind: "gap", source: moving[end], target: neighbour[start] - TILE_SNAP_GAP, gapFrom: neighbour[start] },
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
        best = { ...candidate, offset, score, neighbour };
      }
    }
  }

  return best;
}

// Guides show what the selection snapped to: a line through every tile that
// shares the aligned edge, or a short bar across the gap.
function buildAxisGuides(snapped, neighbours, axis, snap) {
  if (!snap) {
    return [];
  }

  const { start, end, crossStart, crossEnd } = AXES[axis];
  const orientation = axis === "x" ? "vertical" : "horizontal";

  if (snap.kind === "gap") {
    const neighbour = snap.neighbour;
    const crossFrom = Math.max(snapped[crossStart], neighbour[crossStart]);
    const crossTo = Math.min(snapped[crossEnd], neighbour[crossEnd]);
    const cross = crossTo > crossFrom
      ? (crossFrom + crossTo) / 2
      : (snapped[crossStart] + snapped[crossEnd]) / 2;
    const from = Math.min(snap.gapFrom, snap.target);
    const to = Math.max(snap.gapFrom, snap.target);

    return [{ kind: "gap", orientation: axis === "x" ? "horizontal" : "vertical", position: cross, from, to }];
  }

  const line = snap.target;
  const edgeOf = (rect) => [rect[start], rect[end], (rect[start] + rect[end]) / 2];
  const sharing = neighbours.filter((rect) => edgeOf(rect).some((edge) => Math.abs(edge - line) < 0.5));
  const spanRects = [snapped, ...sharing];

  return [{
    kind: "align",
    orientation,
    position: line,
    from: Math.min(...spanRects.map((rect) => rect[crossStart])),
    to: Math.max(...spanRects.map((rect) => rect[crossEnd])),
  }];
}

// `bounds` is the dragged selection at its starting position, `rawDelta` the
// pointer's movement in world units. Returns the delta to apply and the
// guides to draw.
export function resolveTileMagnetSnap({ bounds, neighbours, rawDelta, zoom }) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  if (!bounds || !neighbours || neighbours.length === 0) {
    return { delta: rawDelta, guides: [] };
  }

  const moving = offsetRect(bounds, rawDelta.x, rawDelta.y);
  const reach = TILE_SNAP_NEIGHBOURHOOD_PX / safeZoom;
  const nearby = neighbours.filter((rect) => rectDistance(moving, rect) <= reach);

  if (nearby.length === 0) {
    return { delta: rawDelta, guides: [] };
  }

  const threshold = TILE_SNAP_THRESHOLD_PX / safeZoom;
  const snapX = findAxisSnap(moving, nearby, "x", threshold);
  const snapY = findAxisSnap(moving, nearby, "y", threshold);
  const delta = {
    x: rawDelta.x + (snapX?.offset ?? 0),
    y: rawDelta.y + (snapY?.offset ?? 0),
  };
  const snapped = offsetRect(bounds, delta.x, delta.y);

  return {
    delta,
    guides: [
      ...buildAxisGuides(snapped, nearby, "x", snapX),
      ...buildAxisGuides(snapped, nearby, "y", snapY),
    ],
  };
}

export function isSameSnapGuides(a, b) {
  if (a === b) {
    return true;
  }

  if (!a || !b || a.length !== b.length) {
    return false;
  }

  return a.every((guide, index) => {
    const other = b[index];
    return guide.kind === other.kind
      && guide.orientation === other.orientation
      && guide.position === other.position
      && guide.from === other.from
      && guide.to === other.to;
  });
}
