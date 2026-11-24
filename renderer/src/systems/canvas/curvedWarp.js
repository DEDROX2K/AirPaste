// Curved view: one continuous radial warp of the board, like looking across
// a shallow dome. Everything is in board-local screen px ("linear" = where a
// point would be with no curve: view.xy + world × zoom; "display" = where it
// is drawn).
//
// R = half the board's diagonal, r = |p − centre| / R. Inside r0 nothing
// moves. Outside, the display radius r′ solves
//   r = r′ + k·(r′ − r0)³ / (1 − r0)²
// so the rim is gently squeezed towards the centre. Display -> linear is that
// closed form; linear -> display takes a few Newton steps. Continuous and
// smooth at r0, never shows an edge.
//
// DOM elements (tiles, stacks, stroke tiles) are warped by pinning their 4
// corners: a projective matrix3d maps the element's box onto the 4 warped
// corners, so edges stay straight and neighbours never overlap.
export const CURVE = Object.freeze({ r0: 0.45, k: 0.42 });
// Edge blur rings: [start, full] as a fraction of the half-diagonal.
export const CURVE_BLUR_RINGS = Object.freeze([[0.62, 0.82], [0.74, 0.94], [0.86, 1.06]]);

const DEN = (1 - CURVE.r0) ** 2;

export function createWarp(width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.max(1, Math.hypot(cx, cy));
  const flatRadius = CURVE.r0 * R;

  // display -> linear
  function unwarp(px, py) {
    const dx = px - cx;
    const dy = py - cy;
    const rp = Math.hypot(dx, dy) / R;
    if (rp <= CURVE.r0) return [px, py];
    const t = rp - CURVE.r0;
    const s = (rp + CURVE.k * t * t * t / DEN) / rp;
    return [cx + dx * s, cy + dy * s];
  }

  // linear -> display
  function warp(px, py) {
    const dx = px - cx;
    const dy = py - cy;
    const r = Math.hypot(dx, dy) / R;
    if (r <= CURVE.r0) return [px, py];
    let rp = r;
    for (let i = 0; i < 4; i += 1) {
      const t = rp - CURVE.r0;
      rp -= (rp + CURVE.k * t * t * t / DEN - r) / (1 + 3 * CURVE.k * t * t / DEN);
      if (rp < CURVE.r0) rp = CURVE.r0;
    }
    const s = rp / r;
    return [cx + dx * s, cy + dy * s];
  }

  // True when a linear-space box is entirely inside the flat centre (no warp).
  function isFlat(x0, y0, x1, y1) {
    const fx = Math.max(Math.abs(x0 - cx), Math.abs(x1 - cx));
    const fy = Math.max(Math.abs(y0 - cy), Math.abs(y1 - cy));
    return Math.hypot(fx, fy) <= flatRadius;
  }

  return { width, height, cx, cy, R, warp, unwarp, isFlat };
}

// Projective matrix (CSS matrix3d) mapping the box (0,0)-(w,h) onto the quad
// p0 p1 p2 p3 (TL, TR, BR, BL).
export function quadMatrix(w, h, p0, p1, p2, p3) {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let h2 = 0;
  if (Math.abs(dx3) > 1e-6 || Math.abs(dy3) > 1e-6) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-12) {
      g = (dx3 * dy2 - dx2 * dy3) / den;
      h2 = (dx1 * dy3 - dx3 * dy1) / den;
    }
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h2 * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h2 * y3;
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, h2 / h, 0, 0, 1, 0, x0, y0, 0, 1];
}

export function matrixToCss(m) {
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(9))).join(",")})`;
}

// For an element whose own coordinates are world units (inside the
// view-transformed .canvas__content, transform-origin 0 0): the transform
// that draws the world box (x, y, w, h) on its warped corners. null when the
// box sits in the flat centre (no transform needed).
export function worldBoxTransform(warpField, viewport, x, y, w, h) {
  const z = viewport.zoom || 1;
  const lx0 = viewport.x + x * z;
  const ly0 = viewport.y + y * z;
  const lx1 = lx0 + w * z;
  const ly1 = ly0 + h * z;
  if (warpField.isFlat(lx0, ly0, lx1, ly1)) return null;
  const toWorld = ([px, py]) => [(px - viewport.x) / z - x, (py - viewport.y) / z - y];
  const q = [
    toWorld(warpField.warp(lx0, ly0)),
    toWorld(warpField.warp(lx1, ly0)),
    toWorld(warpField.warp(lx1, ly1)),
    toWorld(warpField.warp(lx0, ly1)),
  ];
  // box-local quad -> then shift the box itself to the origin
  const m = quadMatrix(w, h, q[0], q[1], q[2], q[3]);
  // M · translate(-x, -y), then the result lives in world coords again:
  // translate(x, y) · M · translate(-x, -y)
  return matrixToCss(conjugateTranslate(m, x, y));
}

// translate(tx, ty) · M · translate(-tx, -ty) for a column-major matrix3d.
function conjugateTranslate(m, tx, ty) {
  // M · translate(-tx,-ty): column 3 += -tx·col0 - ty·col1
  const out = m.slice();
  for (let r = 0; r < 4; r += 1) {
    out[12 + r] = m[12 + r] - tx * m[r] - ty * m[4 + r];
  }
  // translate(tx,ty) · out: row0 += tx·row3, row1 += ty·row3
  for (let c = 0; c < 4; c += 1) {
    out[c * 4] += tx * out[c * 4 + 3];
    out[c * 4 + 1] += ty * out[c * 4 + 3];
  }
  return out;
}
