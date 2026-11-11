// Constellation layout: a blanket of tiles. A grid of upright tiles that wraps
// round on itself (so it never ends in any direction) and is seen through a
// warp: tiles in the middle of the screen are full size and the cloth
// stretches away toward the edges, tiles shrinking and bunching up as they go.
// Pure math, no three.js.
//
// Units are screen heights: the screen's vertical half-extent is 1, so a point
// at (0, 1) is the middle of the top edge. The grid ("blanket space") is
// panned under the warp.

export const BLANKET = Object.freeze({
  COLS: 20,
  ROWS: 16,
  CELL_W: 0.4,
  CELL_H: 0.5,
  // A tile's height before it is squeezed to fit its cell width.
  TILE_H: 0.41,
  FILL_W: 0.9,
  // The warp's horizon: how far (in blanket space) the cloth reaches before it
  // flattens out. Smaller bunches the edges up harder.
  HORIZON: 2.3,
  MIN_ASPECT: 0.55,
  MAX_ASPECT: 1.7,
});

export const BLANKET_WIDTH = BLANKET.COLS * BLANKET.CELL_W;
export const BLANKET_HEIGHT = BLANKET.ROWS * BLANKET.CELL_H;

export function clampAspect(width, height) {
  const aspect = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? width / height
    : 0.8;

  return Math.max(BLANKET.MIN_ASPECT, Math.min(BLANKET.MAX_ASPECT, aspect));
}

// How many tile slots the blanket has. Always the same, whatever the
// workspace holds: it is filled from the workspace's tiles, repeating them.
export function getSlotCount() {
  return BLANKET.COLS * BLANKET.ROWS;
}

// Wraps a coordinate into [-size / 2, size / 2): the cloth repeats forever.
export function wrapCoordinate(value, size) {
  return value - size * Math.floor(value / size + 0.5);
}

// `aspects`: width / height of the tile shown in each slot, in slot order
// (missing entries are 0.8). Returns getSlotCount() slots:
// [{ index, col, row, x, y, width, height }] in blanket space, centred on 0.
// Every second row is shifted half a cell (a brick pattern breaks up the
// straight columns the warp would exaggerate).
export function layoutBlanket(aspects = []) {
  const slots = [];

  for (let row = 0; row < BLANKET.ROWS; row += 1) {
    for (let col = 0; col < BLANKET.COLS; col += 1) {
      const index = row * BLANKET.COLS + col;
      const aspect = aspects[index] ?? 0.8;
      let height = BLANKET.TILE_H;
      let width = height * aspect;

      if (width > BLANKET.CELL_W * BLANKET.FILL_W) {
        width = BLANKET.CELL_W * BLANKET.FILL_W;
        height = width / aspect;
      }

      slots.push({
        index,
        col,
        row,
        x: wrapCoordinate((col + 0.5 + (row % 2) * 0.5) * BLANKET.CELL_W, BLANKET_WIDTH),
        y: wrapCoordinate((row + 0.5) * BLANKET.CELL_H, BLANKET_HEIGHT),
        width,
        height,
      });
    }
  }

  return slots;
}

// The warp: a point of the blanket (x, y, relative to the middle of the
// screen) becomes a screen point, and `scale` is how much a tile there is
// shrunk. The radius is squeezed with tanh, so the cloth flattens toward a
// horizon instead of running off to infinity.
export function warpPoint(x, y, horizon = BLANKET.HORIZON) {
  const radius = Math.hypot(x, y);

  if (radius < 1e-6) {
    return { x, y, scale: 1 };
  }

  const squeezed = horizon * Math.tanh(radius / horizon);
  const along = squeezed / radius;
  const slope = 1 / Math.cosh(radius / horizon) ** 2;
  // Between the radial squeeze and its slope: tiles shrink gradually, not
  // abruptly, and never vanish.
  return { x: x * along, y: y * along, scale: Math.max(0.1, 0.5 * along + 0.5 * slope) };
}

// Arrow-key neighbour of a slot on the (wrapping) grid. `hidden` is a set of
// slot indices to skip (deleted tiles). Rows count upward.
export function getAdjacentSlot(index, direction, hidden = null) {
  const { COLS, ROWS } = BLANKET;
  const step = { left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] }[direction];

  if (!step) {
    return null;
  }

  let col = index % COLS;
  let row = Math.floor(index / COLS);

  for (let tries = 0; tries < Math.max(COLS, ROWS); tries += 1) {
    col = (col + step[0] + COLS) % COLS;
    row = (row + step[1] + ROWS) % ROWS;
    const candidate = row * COLS + col;

    if (!hidden?.has(candidate)) {
      return candidate === index ? null : candidate;
    }
  }

  return null;
}
