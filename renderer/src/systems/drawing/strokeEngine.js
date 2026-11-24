// Drawing engine for canvas strokes (Line, Ink pen, Highlighter).
//
// Per-frame cost does not grow with the number of strokes:
// - pan / zoom      -> CSS transform on cached 256px tile bitmaps (no raster)
// - drawing         -> only the new segments are painted on a live canvas
// - moving strokes  -> painted once into a bitmap the size of the selection,
//                      then moved with a CSS transform
// - commits / edits -> only the tiles they touch are re-rasterised, inside a
//                      per-frame budget; old pixels stay up until new ones are
//                      ready, so nothing flickers
// - hit tests       -> uniform spatial grid
//
// Plain DOM + canvas, no React: the React wrapper (DrawingCanvas.jsx) feeds it
// strokes, the viewport and the active tool, and it reports commits back.
// Stroke objects are treated as immutable: every edit makes new objects, so
// the app's undo history can hold them as-is.
import {
  areDrawingObjectsEqual,
  createDrawingId,
  DRAWING_OBJECT_TYPE_STROKE,
  isStrokeTool,
  STROKE_TOOL_CONFIG,
} from "./drawingTypes";
import { createWarp, matrixToCss, quadMatrix } from "../canvas/curvedWarp";

const NIB_ANGLE = -40 * Math.PI / 180;
const NX = Math.cos(NIB_ANGLE);
const NY = Math.sin(NIB_ANGLE);
const HL_OPACITY = 0.4;
const ACCENT = "#0D99FF";
const HANDLE = 8;
const SNAP = Math.PI / 4;
const MIN_DIST = 2.5; // screen px between captured points
const STREAMLINE = 0.45; // input smoothing
const SIMPLIFY_TOL = 0.6; // screen px, RDP on pointerup
const LOD_ZOOM = 0.35; // below: ink as a plain polyline
const TS = 256; // tile size, css px at its own level
const BUDGET = 5; // ms of tile rasterising per frame (background)
const URGENT_BUDGET = 12; // ms per frame for tiles that block a handoff
const SETTLE = 140; // ms after zoom stops before re-rasterising
const GRID = 256; // world units per spatial index cell
const MAX_TILES = 220; // LRU cap
const OUTLINE_MAX = 40;
const MAX_DPR = 2;
const DRAG_SLOP = 3;

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const overlaps = (a, b) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.y1 >= b.y0 && a.y0 <= b.y1;
const levelFor = (z) => Math.max(-6, Math.min(6, Math.round(Math.log2(z) * 2) / 2));

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function snapAngle(ax, ay, bx, by) {
  const a = Math.round(Math.atan2(by - ay, bx - ax) / SNAP) * SNAP;
  const d = Math.hypot(bx - ax, by - ay);
  return [ax + Math.cos(a) * d, ay + Math.sin(a) * d];
}

function unionBox(list, getBox) {
  let b = null;
  for (const s of list) {
    const k = getBox(s);
    b = b
      ? { x0: Math.min(b.x0, k.x0), y0: Math.min(b.y0, k.y0), x1: Math.max(b.x1, k.x1), y1: Math.max(b.y1, k.y1) }
      : { ...k };
  }
  return b;
}

/* ---------- simplification ---------- */
function rdp(pts, tol, wScale) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = pts[a];
    const B = pts[b];
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i += 1) {
      const P = pts[i];
      const t = (i - a) / (b - a);
      const d = Math.max(
        distSeg(P[0], P[1], A[0], A[1], B[0], B[1]),
        Math.abs(P[2] - (A[2] + (B[2] - A[2]) * t)) * wScale,
      );
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* ---------- path builders ---------- */
function smoothPath(c, pts) {
  c.moveTo(pts[0][0], pts[0][1]);
  if (pts.length < 3) {
    for (let i = 1; i < pts.length; i += 1) c.lineTo(pts[i][0], pts[i][1]);
    return;
  }
  for (let i = 1; i < pts.length - 1; i += 1) {
    c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  const l = pts[pts.length - 1];
  c.lineTo(l[0], l[1]);
}

function smoothPts(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = pts[i + 1];
    out.push([(a[0] + 2 * b[0] + d[0]) / 4, (a[1] + 2 * b[1] + d[1]) / 4, (a[2] + 2 * b[2] + d[2]) / 4]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function inkWidth(half, f, Li, total, size, live) {
  const tin = size * 1.2;
  const tout = size * 1.8;
  const a = Math.min(1, Li / tin);
  const b = live ? 1 : Math.min(1, (total - Li) / tout);
  const t = Math.max(0.12, Math.min(a, b));
  return half * f * (0.35 + 0.65 * Math.sin(t * Math.PI / 2));
}

function buildInk(s) {
  const pts = smoothPts(s.points);
  const half = s.size / 2;
  const fill = new Path2D();
  if (pts.length === 1) {
    const p = pts[0];
    fill.ellipse(p[0], p[1], half * p[2], half * 0.32 * p[2], NIB_ANGLE, 0, Math.PI * 2);
    return { fill };
  }
  const L = [0];
  for (let i = 1; i < pts.length; i += 1) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1];
  const w = pts.map((p, i) => inkWidth(half, p[2], L[i], total, s.size, false));
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p = pts[i];
    const q = pts[i + 1];
    const wp = w[i];
    const wq = w[i + 1];
    fill.moveTo(p[0] + NX * wp, p[1] + NY * wp);
    fill.lineTo(q[0] + NX * wq, q[1] + NY * wq);
    fill.lineTo(q[0] - NX * wq, q[1] - NY * wq);
    fill.lineTo(p[0] - NX * wp, p[1] - NY * wp);
    fill.closePath();
  }
  const spine = new Path2D();
  smoothPath(spine, pts);
  return { fill, spine };
}

function buildPath(s) {
  if (s.tool === "ink") return buildInk(s);
  if (s.tool === "hl" && s.points.length === 1) {
    const q = s.points[0];
    const f = new Path2D();
    f.rect(q[0] - s.size * 0.18, q[1] - s.size / 2, s.size * 0.36, s.size);
    return { fill: f };
  }
  const p = new Path2D();
  smoothPath(p, s.points);
  return { stroke: p };
}

/* ---------- pixel cursors (pixelarticons feather / brush, white outline) ---------- */
const FEATHER_PATH = "M2 20h2v2H2zm6-2h6v2H8zm-2-2h2v2H6zm-2 2h2v2H4zm4-4h2v2H8zm2-2h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm0 8h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2-6h2v6h-2zm-2-2h2v2h-2zM4 10h2v6H4zm2-2h2v2H6zm2-2h2v2H8zm2-2h2v2h-2zm2-2h6v2h-6z";
const BRUSH_PATH = "M7 2h10v2H7zM5 4h2v10H5zm12-2h2v12h-2zM13 2h2v6h-2zM9 2h2v4H9zm-4 8h14v2H5zm2 4h10v2H7zm2 2h2v4H9zm4 0h2v4h-2zm-4 4h6v2H9z";

function pixelCursor(path, hx, hy, transform = "") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" shape-rendering="crispEdges"><g${transform ? ` transform="${transform}"` : ""}><path d="${path}" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="miter"/><path d="${path}" fill="#111"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, crosshair`;
}

const CURSORS = {
  ink: pixelCursor(FEATHER_PATH, 2, 22),
  // brush tip points down; flip it so the bristles sit at the hotspot
  hl: pixelCursor(BRUSH_PATH, 11, 23),
  line: "crosshair",
};

/* =========================================================================
   engine
   ========================================================================= */
export function createStrokeEngine({ root, container, callbacks }) {
  const cb = callbacks; // { current: { onCommit, onSelectionChange, onRequestTool, onClearTileSelection, isBackgroundTarget } }

  /* ---------- DOM ---------- */
  const strokeLayer = document.createElement("div");
  strokeLayer.className = "canvas-strokes__tiles";
  const moveCv = document.createElement("canvas");
  moveCv.className = "canvas-strokes__move";
  const liveCv = document.createElement("canvas");
  liveCv.className = "canvas-strokes__live";
  const ovCv = document.createElement("canvas");
  ovCv.className = "canvas-strokes__overlay";
  const measureEl = document.createElement("div");
  measureEl.className = "canvas-strokes__measure";
  root.append(strokeLayer, moveCv, liveCv, ovCv, measureEl);

  const lctx = liveCv.getContext("2d", { desynchronized: true });
  const octx = ovCv.getContext("2d");
  const mctx = moveCv.getContext("2d");

  /* ---------- state ---------- */
  let rdpr = 1;
  let W = 1;
  let H = 1;
  let rect = { left: 0, top: 0 };
  const view = { x: 0, y: 0, z: 1 };
  let tool = "select";
  const toolConfig = {
    line: { color: STROKE_TOOL_CONFIG.line.color, size: STROKE_TOOL_CONFIG.line.sizes[1] },
    ink: { color: STROKE_TOOL_CONFIG.ink.color, size: STROKE_TOOL_CONFIG.ink.sizes[1] },
    hl: { color: STROKE_TOOL_CONFIG.hl.color, size: STROKE_TOOL_CONFIG.hl.sizes[1] },
  };
  let strokes = [];
  let byId = new Map();
  let sel = new Set();
  let hoverId = null;
  let gesture = null;
  let destroyed = false;
  const lastPointer = { x: 0, y: 0 };

  // Curved view (systems/canvas/curvedWarp.js): screen points go through
  // the board's warp; null when the view is flat.
  let curve = null;
  let curveOn = false;
  const toWorld = (sx, sy) => {
    const [lx, ly] = curve ? curve.unwarp(sx, sy) : [sx, sy];
    return { x: (lx - view.x) / view.z, y: (ly - view.y) / view.z };
  };
  const toScreen = (wx, wy) => {
    const lx = wx * view.z + view.x;
    const ly = wy * view.z + view.y;
    if (!curve) return { x: lx, y: ly };
    const [x, y] = curve.warp(lx, ly);
    return { x, y };
  };
  const localOf = (e) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  const measureRect = () => {
    const r = container.getBoundingClientRect();
    rect = { left: r.left, top: r.top };
    return r;
  };

  /* ---------- geometry cache ---------- */
  const geo = new WeakMap();
  function G(s) {
    let g = geo.get(s);
    if (!g) { g = {}; geo.set(s, g); }
    return g;
  }
  function bbox(s) {
    const g = G(s);
    if (g.bb) return g.bb;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const p of s.points) {
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    }
    const pad = s.size / 2 + 1;
    g.bb = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
    return g.bb;
  }
  function hit(s, wx, wy) {
    const tol = s.size / 2 + 3 / view.z;
    const b = bbox(s);
    if (wx < b.x0 - tol || wx > b.x1 + tol || wy < b.y0 - tol || wy > b.y1 + tol) return false;
    const p = s.points;
    if (p.length === 1) return Math.hypot(wx - p[0][0], wy - p[0][1]) <= tol;
    for (let i = 0; i < p.length - 1; i += 1) {
      if (distSeg(wx, wy, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) <= tol) return true;
    }
    return false;
  }

  /* ---------- spatial index + z-order ---------- */
  const grid = new Map();
  const cellsOf = new WeakMap();
  const order = new Map();
  function reorder() {
    order.clear();
    byId = new Map();
    strokes.forEach((s, i) => { order.set(s, i); byId.set(s.id, s); });
  }
  function gridAdd(s) {
    const b = bbox(s);
    const keys = [];
    for (let cx = Math.floor(b.x0 / GRID); cx <= Math.floor(b.x1 / GRID); cx += 1) {
      for (let cy = Math.floor(b.y0 / GRID); cy <= Math.floor(b.y1 / GRID); cy += 1) {
        const k = `${cx},${cy}`;
        let set = grid.get(k);
        if (!set) grid.set(k, (set = new Set()));
        set.add(s);
        keys.push(k);
      }
    }
    cellsOf.set(s, keys);
  }
  function gridRemove(s) {
    const keys = cellsOf.get(s);
    if (!keys) return;
    for (const k of keys) {
      const set = grid.get(k);
      if (set) { set.delete(s); if (!set.size) grid.delete(k); }
    }
    cellsOf.delete(s);
  }
  function gridQuery(r) {
    const out = new Set();
    for (let cx = Math.floor(r.x0 / GRID); cx <= Math.floor(r.x1 / GRID); cx += 1) {
      for (let cy = Math.floor(r.y0 / GRID); cy <= Math.floor(r.y1 / GRID); cy += 1) {
        const set = grid.get(`${cx},${cy}`);
        if (set) for (const s of set) out.add(s);
      }
    }
    return out;
  }
  function topHit(wx, wy) {
    const r = 12 / view.z;
    const cand = [...gridQuery({ x0: wx - r, y0: wy - r, x1: wx + r, y1: wy + r })]
      .sort((a, b) => order.get(b) - order.get(a));
    for (const s of cand) if (hit(s, wx, wy)) return s;
    return null;
  }

  /* ---------- painting one stroke ---------- */
  function renderStroke(c, s, scale) {
    const g = G(s);
    const lod = s.tool === "ink" && scale < LOD_ZOOM && s.points.length > 1;
    let path;
    if (lod) {
      if (!g.lod) { const p = new Path2D(); smoothPath(p, s.points); g.lod = { stroke: p }; }
      path = g.lod;
    } else {
      path = g.path || (g.path = buildPath(s));
    }
    c.fillStyle = s.color;
    c.strokeStyle = s.color;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (s.tool === "hl") {
      // normal blend at 40%: one path = one composite, so it never darkens over itself
      c.globalAlpha = HL_OPACITY;
      if (path.fill) c.fill(path.fill);
      else { c.lineWidth = s.size; c.lineCap = "butt"; c.stroke(path.stroke); }
      c.globalAlpha = 1;
      return;
    }
    if (s.tool === "line") { c.lineWidth = s.size; c.stroke(path.stroke); return; }
    if (lod) { c.lineWidth = s.size * 0.6; c.stroke(path.stroke); return; }
    c.fill(path.fill);
    if (path.spine) { c.lineWidth = Math.max(0.8, s.size * 0.13); c.stroke(path.spine); }
  }

  /* =========================================================================
     tile cache
     ========================================================================= */
  const levels = new Map();
  let curL = 0;
  let frameNo = 0;
  const hidden = new Set(); // stroke ids drawn elsewhere right now

  function getLevel(L) {
    let lv = levels.get(L);
    if (!lv) {
      const el = document.createElement("div");
      el.className = "canvas-strokes__level";
      strokeLayer.appendChild(el);
      lv = { L, s: 2 ** L, el, tiles: new Map() };
      levels.set(L, lv);
      placeLevel(lv);
    }
    return lv;
  }
  function placeLevel(lv) {
    lv.el.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z / lv.s})`;
  }
  function placeLevels() {
    for (const lv of levels.values()) placeLevel(lv);
    warpAllTiles();
  }
  // Curved view: each 256px tile is pinned to its 4 warped corners, so the
  // strokes bend with the board and neighbouring tiles meet exactly.
  function warpTile(lv, t) {
    if (!curve) {
      if (t.warped) { t.cv.style.transform = ""; t.warped = false; }
      return;
    }
    const k = view.z / lv.s;
    const bx = t.tx * TS;
    const by = t.ty * TS;
    const lx0 = view.x + bx * k;
    const ly0 = view.y + by * k;
    const lx1 = lx0 + TS * k;
    const ly1 = ly0 + TS * k;
    if (curve.isFlat(lx0, ly0, lx1, ly1)) {
      if (t.warped) { t.cv.style.transform = ""; t.warped = false; }
      return;
    }
    const local = ([px, py]) => [(px - view.x) / k - bx, (py - view.y) / k - by];
    t.cv.style.transform = matrixToCss(quadMatrix(
      TS, TS,
      local(curve.warp(lx0, ly0)),
      local(curve.warp(lx1, ly0)),
      local(curve.warp(lx1, ly1)),
      local(curve.warp(lx0, ly1)),
    ));
    t.warped = true;
  }
  function warpAllTiles() {
    if (!curve && !curveWasOn) return;
    for (const lv of levels.values()) for (const t of lv.tiles.values()) warpTile(lv, t);
    curveWasOn = Boolean(curve);
  }
  let curveWasOn = false;
  function tileRect(lv, tx, ty) {
    const k = TS / lv.s;
    return { x0: tx * k, y0: ty * k, x1: (tx + 1) * k, y1: (ty + 1) * k };
  }
  function visibleRange(lv) {
    const a = toWorld(0, 0);
    const b = toWorld(W, H);
    const k = TS / lv.s;
    return {
      tx0: Math.floor(a.x / k) - 1,
      ty0: Math.floor(a.y / k) - 1,
      tx1: Math.floor(b.x / k) + 1,
      ty1: Math.floor(b.y / k) + 1,
    };
  }
  function makeTile(lv, tx, ty) {
    const cv = document.createElement("canvas");
    cv.width = Math.round(TS * rdpr);
    cv.height = cv.width;
    cv.style.width = `${TS}px`;
    cv.style.height = `${TS}px`;
    cv.style.left = `${tx * TS}px`;
    cv.style.top = `${ty * TS}px`;
    cv.className = "pending";
    lv.el.appendChild(cv);
    const t = { tx, ty, cv, ctx: cv.getContext("2d"), ready: false, dirty: true, urgent: false, used: frameNo };
    lv.tiles.set(`${tx},${ty}`, t);
    if (curve) warpTile(lv, t);
    return t;
  }
  function renderTile(lv, t) {
    const c = t.ctx;
    const r = tileRect(lv, t.tx, t.ty);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, t.cv.width, t.cv.height);
    const k = rdpr * lv.s;
    c.setTransform(k, 0, 0, k, -t.tx * TS * rdpr, -t.ty * TS * rdpr);
    const list = [...gridQuery(r)]
      .filter((s) => !hidden.has(s.id) && overlaps(bbox(s), r))
      .sort((a, b) => order.get(a) - order.get(b));
    for (const s of list) renderStroke(c, s, lv.s);
    if (!t.ready) { t.ready = true; t.cv.className = ""; }
    t.dirty = false;
    t.urgent = false;
  }
  function invalidate(r, urgent) {
    for (const lv of levels.values()) {
      const k = TS / lv.s;
      const tx0 = Math.floor(r.x0 / k);
      const tx1 = Math.floor(r.x1 / k);
      const ty0 = Math.floor(r.y0 / k);
      const ty1 = Math.floor(r.y1 / k);
      for (const [key, t] of lv.tiles) {
        if (t.tx < tx0 || t.tx > tx1 || t.ty < ty0 || t.ty > ty1) continue;
        if (lv.L === curL) { t.dirty = true; if (urgent) t.urgent = true; }
        else { t.cv.remove(); lv.tiles.delete(key); }
      }
    }
    kick();
  }
  function dropAllTiles() {
    for (const lv of levels.values()) lv.el.remove();
    levels.clear();
    getLevel(curL);
  }
  function pumpTiles() {
    const lv = getLevel(curL);
    const r = visibleRange(lv);
    const cx = (r.tx0 + r.tx1) / 2;
    const cy = (r.ty0 + r.ty1) / 2;
    const need = [];
    // nothing drawn yet: no tiles to make
    if (strokes.length || lv.tiles.size) {
      for (let tx = r.tx0; tx <= r.tx1; tx += 1) {
        for (let ty = r.ty0; ty <= r.ty1; ty += 1) {
          const t = lv.tiles.get(`${tx},${ty}`) || makeTile(lv, tx, ty);
          t.used = frameNo;
          if (t.dirty) need.push(t);
        }
      }
    }
    need.sort((a, b) => (b.urgent - a.urgent) || (Math.hypot(a.tx - cx, a.ty - cy) - Math.hypot(b.tx - cx, b.ty - cy)));
    const t0 = performance.now();
    let left = 0;
    let urgentLeft = 0;
    for (const t of need) {
      const spent = performance.now() - t0;
      if (spent < (t.urgent ? URGENT_BUDGET : BUDGET)) renderTile(lv, t);
      else { left += 1; if (t.urgent) urgentLeft += 1; }
    }
    // current level covers the screen -> retire older levels
    if (!left && levels.size > 1) {
      let complete = true;
      for (let tx = r.tx0 + 1; tx < r.tx1 && complete; tx += 1) {
        for (let ty = r.ty0 + 1; ty < r.ty1; ty += 1) {
          const t = lv.tiles.get(`${tx},${ty}`);
          if (!t || !t.ready) { complete = false; break; }
        }
      }
      if (complete) for (const [L, o] of levels) if (L !== curL) { o.el.remove(); levels.delete(L); }
    }
    // LRU eviction
    let count = 0;
    for (const o of levels.values()) count += o.tiles.size;
    if (count > MAX_TILES) {
      const all = [];
      for (const o of levels.values()) for (const [key, t] of o.tiles) if (t.used !== frameNo) all.push([o, key, t]);
      all.sort((a, b) => a[2].used - b[2].used);
      for (let i = 0; i < all.length && count > MAX_TILES; i += 1, count -= 1) {
        all[i][2].cv.remove();
        all[i][0].tiles.delete(all[i][1]);
      }
    }
    return { left, urgentLeft };
  }

  /* =========================================================================
     live layer: paints only what's new
     ========================================================================= */
  let live = null; // { s, drawn, L[], full, straight }
  function sizeScreenCanvas(cv) {
    cv.width = Math.max(1, Math.round(W * rdpr));
    cv.height = Math.max(1, Math.round(H * rdpr));
  }
  function liveClear() {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, liveCv.width, liveCv.height);
  }
  function liveBegin(s) {
    live = { s, drawn: 0, L: [0], full: false, straight: false };
    liveCv.style.opacity = s.tool === "hl" ? String(HL_OPACITY) : "1"; // highlighter: opaque on a faded layer
    liveClear();
  }
  function liveFullRender() {
    // Curved: draw a copy already in screen px, each point through the warp.
    const s = curve
      ? {
        ...live.s,
        size: live.s.size * view.z,
        points: live.s.points.map((p) => { const q = toScreen(p[0], p[1]); return [q.x, q.y, p[2]]; }),
      }
      : live.s;
    liveClear();
    if (curve) lctx.setTransform(rdpr, 0, 0, rdpr, 0, 0);
    else lctx.setTransform(rdpr * view.z, 0, 0, rdpr * view.z, rdpr * view.x, rdpr * view.y);
    geo.delete(s);
    if (s.tool === "hl") {
      const path = buildPath(s);
      lctx.strokeStyle = s.color;
      lctx.fillStyle = s.color;
      lctx.lineWidth = s.size;
      lctx.lineCap = "round";
      lctx.lineJoin = "round";
      if (path.fill) lctx.fill(path.fill); else lctx.stroke(path.stroke);
    } else {
      renderStroke(lctx, s, view.z);
    }
    geo.delete(s);
    live.drawn = live.s.points.length - 1;
  }
  function liveIncrement() {
    const s = live.s;
    const P = s.points;
    const n = P.length;
    while (live.L.length < n) {
      const i = live.L.length;
      live.L.push(live.L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    }
    // a segment is final once it has a point after it (smoothing looks one ahead)
    const upto = n - 2;
    if (upto <= live.drawn) return;
    const c = lctx;
    c.setTransform(rdpr * view.z, 0, 0, rdpr * view.z, rdpr * view.x, rdpr * view.y);
    c.fillStyle = s.color;
    c.strokeStyle = s.color;
    c.lineCap = "round";
    c.lineJoin = "round";
    const sm = (i) => {
      if (i <= 0 || i >= n - 1) return P[Math.max(0, Math.min(n - 1, i))];
      const a = P[i - 1];
      const b = P[i];
      const d = P[i + 1];
      return [(a[0] + 2 * b[0] + d[0]) / 4, (a[1] + 2 * b[1] + d[1]) / 4, (a[2] + 2 * b[2] + d[2]) / 4];
    };
    if (s.tool === "ink") {
      const half = s.size / 2;
      c.beginPath();
      const spine = new Path2D();
      // start one segment back so the seam between batches sits inside one fill
      for (let i = Math.max(0, live.drawn - 1); i < upto; i += 1) {
        const p = sm(i);
        const q = sm(i + 1);
        const wp = inkWidth(half, p[2], live.L[i], 0, s.size, true);
        const wq = inkWidth(half, q[2], live.L[i + 1], 0, s.size, true);
        c.moveTo(p[0] + NX * wp, p[1] + NY * wp);
        c.lineTo(q[0] + NX * wq, q[1] + NY * wq);
        c.lineTo(q[0] - NX * wq, q[1] - NY * wq);
        c.lineTo(p[0] - NX * wp, p[1] - NY * wp);
        c.closePath();
        spine.moveTo(p[0], p[1]);
        spine.lineTo(q[0], q[1]);
      }
      c.fill();
      c.lineWidth = Math.max(0.8, s.size * 0.13);
      c.stroke(spine);
    } else {
      c.lineWidth = s.size;
      c.beginPath();
      const from = Math.max(0, live.drawn - 1);
      const p0 = sm(from);
      c.moveTo(p0[0], p0[1]);
      for (let i = from + 1; i <= upto; i += 1) { const q = sm(i); c.lineTo(q[0], q[1]); }
      c.stroke();
    }
    live.drawn = upto;
  }

  /* =========================================================================
     moving a selection: one bitmap, CSS transform per pointermove
     ========================================================================= */
  let moving = null; // { ids, list, dx, dy, ox, oy, bdx, bdy, rerender }
  function renderMoving() {
    if (moving.rerender) {
      const b = unionBox(moving.list, bbox);
      const a = toScreen(b.x0 + moving.dx, b.y0 + moving.dy);
      const c = toScreen(b.x1 + moving.dx, b.y1 + moving.dy);
      // clamp to viewport + margin so a huge selection never makes a huge bitmap
      const mx = W / 2;
      const my = H / 2;
      const x0 = Math.max(a.x, -mx);
      const y0 = Math.max(a.y, -my);
      const x1 = Math.min(c.x, W + mx);
      const y1 = Math.min(c.y, H + my);
      const w = Math.max(1, Math.ceil(x1 - x0));
      const h = Math.max(1, Math.ceil(y1 - y0));
      moveCv.width = Math.round(w * rdpr);
      moveCv.height = Math.round(h * rdpr);
      moveCv.style.width = `${w}px`;
      moveCv.style.height = `${h}px`;
      mctx.setTransform(
        rdpr * view.z, 0, 0, rdpr * view.z,
        rdpr * (view.x + moving.dx * view.z - x0),
        rdpr * (view.y + moving.dy * view.z - y0),
      );
      for (const s of moving.list) renderStroke(mctx, s, view.z);
      moving.ox = x0;
      moving.oy = y0;
      moving.bdx = moving.dx;
      moving.bdy = moving.dy;
      moveCv.style.display = "block";
      moving.rerender = false;
    }
    moveCv.style.transform = `translate(${moving.ox + (moving.dx - moving.bdx) * view.z}px, ${moving.oy + (moving.dy - moving.bdy) * view.z}px)`;
  }

  /* =========================================================================
     overlay (selection chrome), redrawn only when it changes
     ========================================================================= */
  const offOf = (s) => (moving && moving.ids.has(s.id) ? moving : { dx: 0, dy: 0 });
  function polyScreen(s) {
    const o = offOf(s);
    return s.points.map((p) => toScreen(p[0] + o.dx, p[1] + o.dy));
  }
  function drawOutline(s, width) {
    const ps = polyScreen(s);
    const c = octx;
    c.strokeStyle = ACCENT;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    ps.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    if (ps.length === 1) c.lineTo(ps[0].x + 0.1, ps[0].y);
    c.stroke();
  }
  function drawHandle(x, y) {
    octx.fillStyle = "#fff";
    octx.strokeStyle = ACCENT;
    octx.lineWidth = 1;
    octx.beginPath();
    octx.rect(Math.round(x - HANDLE / 2) + 0.5, Math.round(y - HANDLE / 2) + 0.5, HANDLE, HANDLE);
    octx.fill();
    octx.stroke();
  }
  function selectedStrokes() { return strokes.filter((s) => sel.has(s.id)); }
  function selBox() {
    const list = selectedStrokes();
    if (!list.length) return null;
    const b = unionBox(list, bbox);
    if (moving) { b.x0 += moving.dx; b.x1 += moving.dx; b.y0 += moving.dy; b.y1 += moving.dy; }
    return b;
  }
  function singleLine() {
    const l = selectedStrokes();
    return l.length === 1 && l[0].tool === "line" ? l[0] : null;
  }
  function drawOverlay() {
    const c = octx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ovCv.width, ovCv.height);
    c.setTransform(rdpr, 0, 0, rdpr, 0, 0);
    if (gesture && gesture.kind === "draw") return;
    if (hoverId && !sel.has(hoverId) && tool === "select" && !gesture) {
      const s = byId.get(hoverId);
      if (s) drawOutline(s, 1.5);
    }
    const line = gesture && gesture.kind === "endpoint" ? gesture.s : singleLine();
    if (line) {
      drawOutline(line, 1);
      const [a, b] = polyScreen(line);
      drawHandle(a.x, a.y);
      drawHandle(b.x, b.y);
      return;
    }
    if (!moving && sel.size <= OUTLINE_MAX) for (const s of selectedStrokes()) drawOutline(s, 1);
    const b = selBox();
    if (b) {
      const p0 = toScreen(b.x0, b.y0);
      const p1 = toScreen(b.x1, b.y1);
      c.strokeStyle = ACCENT;
      c.lineWidth = 1;
      c.strokeRect(Math.round(p0.x) + 0.5, Math.round(p0.y) + 0.5, Math.round(p1.x - p0.x), Math.round(p1.y - p0.y));
      [[p0.x, p0.y], [p1.x, p0.y], [p0.x, p1.y], [p1.x, p1.y]].forEach(([x, y]) => drawHandle(x, y));
    }
  }

  /* =========================================================================
     frame loop
     ========================================================================= */
  let rafId = 0;
  let viewDirty = true;
  let ovDirty = true;
  let settleTimer = 0;
  let handoff = null; // keep transient pixels until tiles are ready
  function kick() {
    if (rafId || destroyed) return;
    rafId = requestAnimationFrame(frame);
  }
  function overlayChanged() { ovDirty = true; kick(); }

  function frame() {
    rafId = 0;
    frameNo += 1;
    if (viewDirty) {
      placeLevels();
      if (live) live.full = true;
      if (moving) moving.rerender = true;
      viewDirty = false;
    }
    if (live) {
      if (curve || live.full || live.s.tool === "line" || live.straight) { liveFullRender(); live.full = false; }
      else liveIncrement();
    }
    if (moving) renderMoving();
    const { left, urgentLeft } = pumpTiles();
    if (handoff && !urgentLeft) {
      if (handoff.kind === "live") liveClear();
      if (handoff.kind === "move") { moveCv.style.display = "none"; moveCv.width = 1; moveCv.height = 1; }
      handoff = null;
    }
    if (ovDirty) { drawOverlay(); ovDirty = false; }
    if (left || handoff || live || moving) kick();
  }

  /* =========================================================================
     model edits: strokes are immutable, edits replace them
     ========================================================================= */
  function commit() {
    cb.current.onCommit?.(strokes.slice());
  }
  function emitSelection() {
    const list = selectedStrokes();
    let summary = null;
    if (list.length) {
      const sameKind = list.every((s) => (s.tool === "hl") === (list[0].tool === "hl"));
      summary = {
        count: list.length,
        tool: sameKind ? list[0].tool : null,
        color: list[0].color,
        size: list[0].size,
      };
    }
    cb.current.onSelectionChange?.(summary);
  }
  function setSelection(next) {
    sel = next;
    emitSelection();
    overlayChanged();
  }
  function addStrokes(list, urgent) {
    for (const s of list) { strokes.push(s); gridAdd(s); }
    reorder();
    for (const s of list) invalidate(bbox(s), urgent);
  }
  function removeStrokes(ids) {
    const gone = strokes.filter((s) => ids.has(s.id));
    strokes = strokes.filter((s) => !ids.has(s.id));
    for (const s of gone) { gridRemove(s); invalidate(bbox(s), true); }
    reorder();
  }
  // mapFn returns the replacement for each stroke in `list`
  function replaceStrokes(list, mapFn, urgent = true) {
    const swaps = new Map();
    for (const s of list) {
      const next = mapFn(s);
      if (next && next !== s) swaps.set(s, next);
    }
    if (!swaps.size) return;
    for (const [s, n] of swaps) {
      invalidate(bbox(s), urgent);
      gridRemove(s);
      gridAdd(n);
      invalidate(bbox(n), urgent);
    }
    strokes = strokes.map((s) => swaps.get(s) || s);
    reorder();
  }
  const translated = (s, dx, dy) => ({
    ...s,
    points: s.points.map((p) => [round1(p[0] + dx), round1(p[1] + dy), p[2]]),
  });

  function finalize(s) {
    const tol = SIMPLIFY_TOL / view.z;
    s.points = rdp(s.points, tol, s.tool === "ink" ? s.size / 2 : 0)
      .map((p) => [round1(p[0]), round1(p[1]), round2(p[2])]);
  }

  /* =========================================================================
     cursor + pointer routing
     ========================================================================= */
  function applyToolChrome() {
    const drawing = isStrokeTool(tool);
    ovCv.style.pointerEvents = drawing ? "auto" : "none";
    ovCv.style.cursor = drawing ? CURSORS[tool] : "";
  }

  function speedFactor(prev, x, y, t) {
    const v = Math.hypot(x - prev.sx, y - prev.sy) / Math.max(1, t - prev.t);
    return prev.f * 0.72 + Math.max(0.45, Math.min(1.15, 1.15 - v * 0.35)) * 0.28;
  }

  function showMeasure(s, sx, sy) {
    const [a, b] = s.points;
    measureEl.textContent = `${Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]))} · ${Math.round(-Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI)}°`;
    measureEl.style.transform = `translate(${sx + 14}px, ${sy + 18}px)`;
    measureEl.style.display = "block";
  }

  // window listeners while a select-mode gesture (move / endpoint / marquee) runs
  function trackWindow() {
    window.addEventListener("pointermove", onGesturePointerMove);
    window.addEventListener("pointerup", onGesturePointerUp);
    window.addEventListener("pointercancel", onGesturePointerUp);
  }
  function untrackWindow() {
    window.removeEventListener("pointermove", onGesturePointerMove);
    window.removeEventListener("pointerup", onGesturePointerUp);
    window.removeEventListener("pointercancel", onGesturePointerUp);
  }

  /* ---------- drawing tools: pointer on the overlay ---------- */
  function onOverlayPointerDown(e) {
    if (!isStrokeTool(tool) || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    measureRect();
    ovCv.setPointerCapture?.(e.pointerId);
    const l = localOf(e);
    const w = toWorld(l.x, l.y);
    const cfg = toolConfig[tool];
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? 0.35 + e.pressure * 0.9 : 1;
    const s = {
      id: createDrawingId(strokes.length),
      type: DRAWING_OBJECT_TYPE_STROKE,
      tool,
      color: cfg.color,
      size: cfg.size,
      points: [[w.x, w.y, pressure]],
    };
    if (tool === "line") s.points.push([w.x, w.y, 1]);
    if (handoff && handoff.kind === "live") handoff = null;
    if (sel.size) setSelection(new Set());
    gesture = {
      kind: "draw",
      s,
      origin: [w.x, w.y],
      smooth: [w.x, w.y],
      prev: { sx: l.x, sy: l.y, t: e.timeStamp, f: pressure },
      pen: e.pointerType === "pen",
    };
    lastPointer.x = l.x;
    lastPointer.y = l.y;
    liveBegin(s);
    overlayChanged();
  }

  function onOverlayPointerMove(e) {
    if (!gesture || gesture.kind !== "draw") return;
    const l = localOf(e);
    lastPointer.x = l.x;
    lastPointer.y = l.y;
    const s = gesture.s;
    if (s.tool === "line") {
      const w = toWorld(l.x, l.y);
      const [ox, oy] = gesture.origin;
      let x = w.x;
      let y = w.y;
      if (e.shiftKey) [x, y] = snapAngle(ox, oy, x, y);
      s.points[0] = e.altKey ? [ox - (x - ox), oy - (y - oy), 1] : [ox, oy, 1];
      s.points[1] = [x, y, 1];
      showMeasure(s, l.x, l.y);
      kick();
      return;
    }
    if (e.shiftKey) {
      const w = toWorld(l.x, l.y);
      const [ox, oy] = gesture.origin;
      const [x, y] = snapAngle(ox, oy, w.x, w.y);
      s.points = [[ox, oy, 1], [x, y, 1]];
      live.straight = true;
      kick();
      return;
    }
    if (live.straight) {
      live.straight = false;
      s.points = [s.points[0]];
      live.L = [0];
      live.drawn = 0;
      live.full = true;
    }
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const ql = localOf(ev);
      const q = toWorld(ql.x, ql.y);
      const sm = gesture.smooth;
      sm[0] += (q.x - sm[0]) * (1 - STREAMLINE);
      sm[1] += (q.y - sm[1]) * (1 - STREAMLINE);
      const last = s.points[s.points.length - 1];
      if (Math.hypot(sm[0] - last[0], sm[1] - last[1]) * view.z < MIN_DIST) continue;
      const f = gesture.pen
        ? (ev.pressure > 0 ? 0.35 + ev.pressure * 0.9 : gesture.prev.f)
        : speedFactor(gesture.prev, ql.x, ql.y, ev.timeStamp);
      gesture.prev = { sx: ql.x, sy: ql.y, t: ev.timeStamp, f };
      s.points.push([sm[0], sm[1], s.tool === "hl" ? 1 : f]);
    }
    kick();
  }

  function endDraw(cancelled) {
    const g = gesture;
    gesture = null;
    measureEl.style.display = "none";
    const s = g.s;
    if (cancelled) {
      live = null;
      liveClear();
      overlayChanged();
      return;
    }
    if (s.tool !== "line") {
      const tip = toWorld(lastPointer.x, lastPointer.y);
      const lp = s.points[s.points.length - 1];
      if (!live.straight && s.points.length > 1 && Math.hypot(tip.x - lp[0], tip.y - lp[1]) > 0.5 / view.z) {
        s.points.push([tip.x, tip.y, lp[2]]);
      }
      finalize(s);
    } else {
      const [a, b] = s.points;
      // a click makes a 100px line
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) * view.z < 3) s.points = [[a[0], a[1], 1], [a[0] + 100, a[1], 1]];
      s.points = s.points.map((p) => [round1(p[0]), round1(p[1]), 1]);
    }
    addStrokes([s], true);
    live = null;
    handoff = { kind: "live" }; // live pixels stay until the tiles under them are painted
    commit();
    if (s.tool === "line") {
      cb.current.onRequestTool?.("select");
      setSelection(new Set([s.id]));
    }
    overlayChanged();
  }

  function onOverlayPointerUp(e) {
    if (!gesture || gesture.kind !== "draw") return;
    const l = localOf(e);
    lastPointer.x = l.x;
    lastPointer.y = l.y;
    endDraw(false);
  }
  function onOverlayPointerCancel() {
    if (gesture && gesture.kind === "draw") endDraw(true);
  }

  /* ---------- select mode: strokes alongside tiles ---------- */
  function onContainerPointerDownCapture(e) {
    if (tool !== "select" || e.button !== 0 || gesture) return;
    if (!strokes.length) return;
    measureRect();
    const l = localOf(e);
    const w = toWorld(l.x, l.y);
    const pierce = e.ctrlKey || e.metaKey;

    // endpoint handles of a selected line sit above everything
    const line = singleLine();
    if (line) {
      for (let i = 0; i < 2; i += 1) {
        const p = toScreen(line.points[i][0], line.points[i][1]);
        if (Math.abs(l.x - p.x) <= HANDLE && Math.abs(l.y - p.y) <= HANDLE) {
          e.preventDefault();
          e.stopPropagation();
          const draft = { ...line, points: line.points.map((q) => q.slice()) };
          gesture = { kind: "endpoint", orig: line, s: draft, i };
          hidden.add(line.id);
          invalidate(bbox(line), true);
          liveBegin(draft);
          live.full = true;
          trackWindow();
          kick();
          return;
        }
      }
    }

    const background = cb.current.isBackgroundTarget?.(e.target) ?? false;
    if (!background && !pierce) {
      // a tile wins: plain clicks select tiles, never strokes under them
      if (!e.shiftKey && sel.size) setSelection(new Set());
      return;
    }

    const sb = sel.size && !e.shiftKey ? selBox() : null;
    if (sb && w.x >= sb.x0 && w.x <= sb.x1 && w.y >= sb.y0 && w.y <= sb.y1) {
      e.preventDefault();
      e.stopPropagation();
      cb.current.onClearTileSelection?.();
      gesture = { kind: "move", sx: l.x, sy: l.y, wx: w.x, wy: w.y, moved: false, dup: e.altKey };
      trackWindow();
      return;
    }

    const h = topHit(w.x, w.y);
    if (h) {
      e.preventDefault();
      e.stopPropagation();
      cb.current.onClearTileSelection?.();
      if (e.shiftKey) {
        const next = new Set(sel);
        if (next.has(h.id)) next.delete(h.id); else next.add(h.id);
        setSelection(next);
      } else if (!sel.has(h.id)) {
        setSelection(new Set([h.id]));
      }
      hoverId = null;
      gesture = { kind: "move", sx: l.x, sy: l.y, wx: w.x, wy: w.y, moved: false, dup: e.altKey };
      trackWindow();
      return;
    }

    if (!background) return;
    // empty canvas: the app runs its marquee for tiles; select strokes in the same box
    const base = e.shiftKey ? new Set(sel) : new Set();
    if (!e.shiftKey && sel.size) setSelection(new Set());
    gesture = { kind: "marquee", sx0: l.x, sy0: l.y, base };
    trackWindow();
  }

  function onGesturePointerMove(e) {
    if (!gesture) return;
    const l = localOf(e);
    const w = toWorld(l.x, l.y);
    if (gesture.kind === "endpoint") {
      const other = gesture.s.points[1 - gesture.i];
      let x = w.x;
      let y = w.y;
      if (e.shiftKey) [x, y] = snapAngle(other[0], other[1], x, y);
      gesture.s.points[gesture.i] = [x, y, 1];
      showMeasure(gesture.s, l.x, l.y);
      live.full = true;
      overlayChanged();
      return;
    }
    if (gesture.kind === "move") {
      let dx = w.x - gesture.wx;
      let dy = w.y - gesture.wy;
      if (!gesture.moved) {
        if (Math.hypot(l.x - gesture.sx, l.y - gesture.sy) < DRAG_SLOP) return;
        gesture.moved = true;
        if (gesture.dup) {
          const copies = selectedStrokes().map((s) => ({ ...s, id: createDrawingId(strokes.length), points: s.points.map((p) => p.slice()) }));
          addStrokes(copies, false);
          sel = new Set(copies.map((s) => s.id));
          emitSelection();
        }
        const list = selectedStrokes();
        moving = { ids: new Set(sel), list, dx: 0, dy: 0, rerender: true };
        list.forEach((s) => hidden.add(s.id));
        list.forEach((s) => invalidate(bbox(s), true)); // tiles redraw without them, under the bitmap
      }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      moving.dx = dx;
      moving.dy = dy;
      renderMoving(); // just a transform write
      overlayChanged();
      return;
    }
    if (gesture.kind === "marquee") {
      if (Math.hypot(l.x - gesture.sx0, l.y - gesture.sy0) < DRAG_SLOP && !gesture.active) return;
      gesture.active = true;
      const a = toWorld(Math.min(gesture.sx0, l.x), Math.min(gesture.sy0, l.y));
      const b = toWorld(Math.max(gesture.sx0, l.x), Math.max(gesture.sy0, l.y));
      const r = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
      const next = new Set(gesture.base);
      for (const s of gridQuery(r)) if (overlaps(bbox(s), r)) next.add(s.id);
      if (next.size !== sel.size || [...next].some((id) => !sel.has(id))) setSelection(next);
    }
  }

  function onGesturePointerUp() {
    untrackWindow();
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    measureEl.style.display = "none";
    if (g.kind === "move" && moving) {
      const { dx, dy, list } = moving;
      list.forEach((s) => hidden.delete(s.id));
      if (dx || dy) replaceStrokes(list, (s) => translated(s, dx, dy));
      else list.forEach((s) => invalidate(bbox(s), true));
      moving = null;
      handoff = { kind: "move" }; // bitmap stays up until the new tiles are painted
      commit();
    } else if (g.kind === "move" && g.dup) {
      commit();
    }
    if (g.kind === "endpoint") {
      hidden.delete(g.orig.id);
      const next = { ...g.s, points: g.s.points.map((p) => [round1(p[0]), round1(p[1]), 1]) };
      invalidate(bbox(g.orig), true);
      replaceStrokes([g.orig], () => next);
      live = null;
      handoff = { kind: "live" };
      commit();
    }
    overlayChanged();
  }

  // hover outline in select mode, at most once per frame
  let hoverQ = null;
  let hoverRaf = 0;
  function runHover() {
    hoverRaf = 0;
    if (!hoverQ || gesture || tool !== "select") return;
    const h = hoverQ.ok ? topHit(hoverQ.x, hoverQ.y) : null;
    const id = h ? h.id : null;
    if (id !== hoverId) { hoverId = id; overlayChanged(); }
  }
  function onContainerPointerMove(e) {
    if (tool !== "select" || gesture || e.buttons || !strokes.length) {
      if (hoverId && !gesture) { hoverId = null; overlayChanged(); }
      return;
    }
    const l = localOf(e);
    const w = toWorld(l.x, l.y);
    const ok = (cb.current.isBackgroundTarget?.(e.target) ?? false) || e.ctrlKey || e.metaKey;
    hoverQ = { x: w.x, y: w.y, ok };
    if (!hoverRaf) hoverRaf = requestAnimationFrame(runHover);
  }
  function onContainerPointerLeave() {
    if (!gesture && hoverId) { hoverId = null; overlayChanged(); }
  }

  ovCv.addEventListener("pointerdown", onOverlayPointerDown);
  ovCv.addEventListener("pointermove", onOverlayPointerMove);
  ovCv.addEventListener("pointerup", onOverlayPointerUp);
  ovCv.addEventListener("pointercancel", onOverlayPointerCancel);
  ovCv.addEventListener("contextmenu", (e) => { if (isStrokeTool(tool)) e.preventDefault(); });
  container.addEventListener("pointerdown", onContainerPointerDownCapture, true);
  container.addEventListener("pointermove", onContainerPointerMove, { passive: true });
  container.addEventListener("pointerleave", onContainerPointerLeave);

  /* ---------- sizing ---------- */
  function resize() {
    const r = measureRect();
    const nextDpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const dprChanged = nextDpr !== rdpr;
    rdpr = nextDpr;
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    sizeScreenCanvas(liveCv);
    sizeScreenCanvas(ovCv);
    if (live) live.full = true;
    if (dprChanged) dropAllTiles();
    curve = curveOn ? createWarp(W, H) : null;
    placeLevels();
    viewDirty = true;
    ovDirty = true;
    kick();
  }
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  window.addEventListener("resize", resize);
  getLevel(curL);
  resize();
  applyToolChrome();

  /* =========================================================================
     public API
     ========================================================================= */
  return {
    setCurved(on) {
      curveOn = Boolean(on);
      curve = curveOn ? createWarp(W, H) : null;
      placeLevels();
      if (live) live.full = true;
      viewDirty = true;
      overlayChanged();
    },

    setView(viewport) {
      if (!viewport) return;
      const z = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
      if (view.x === viewport.x && view.y === viewport.y && view.z === z) return;
      const zoomChanged = view.z !== z;
      view.x = viewport.x;
      view.y = viewport.y;
      view.z = z;
      // one style write per level container now; repaint in the frame
      placeLevels();
      viewDirty = true;
      ovDirty = true;
      if (zoomChanged) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          const L = levelFor(view.z);
          if (L !== curL) {
            curL = L;
            const lv = getLevel(L);
            strokeLayer.appendChild(lv.el);
            placeLevel(lv);
          }
          kick();
        }, SETTLE);
      }
      kick();
    },

    // Sync from the store (load, undo/redo, page switch). Unchanged strokes
    // are kept by reference so their tiles and geometry stay cached.
    setStrokes(objects) {
      const incoming = Array.isArray(objects) ? objects : [];
      const prev = byId;
      const seen = new Set();
      let changed = false;
      const next = incoming.map((n) => {
        seen.add(n.id);
        const o = prev.get(n.id);
        if (o === n) return o;
        if (o && areDrawingObjectsEqual(o, n)) return o;
        changed = true;
        if (o) { gridRemove(o); invalidate(bbox(o), true); }
        gridAdd(n);
        invalidate(bbox(n), true);
        return n;
      });
      for (const [id, o] of prev) {
        if (!seen.has(id)) { changed = true; gridRemove(o); invalidate(bbox(o), true); }
      }
      if (!changed && next.length === strokes.length && next.every((s, i) => s === strokes[i])) return;
      strokes = next;
      reorder();
      const pruned = new Set([...sel].filter((id) => byId.has(id)));
      if (pruned.size !== sel.size) setSelection(pruned);
      else overlayChanged();
    },

    setTool(nextTool) {
      if (nextTool === tool) return;
      if (gesture && gesture.kind === "draw") endDraw(false);
      tool = nextTool;
      hoverId = null;
      if (isStrokeTool(tool) && sel.size) setSelection(new Set());
      applyToolChrome();
      overlayChanged();
    },

    setToolConfig(nextTool, config) {
      if (!toolConfig[nextTool] || !config) return;
      toolConfig[nextTool] = { color: config.color, size: config.size };
    },

    hasSelection() { return sel.size > 0; },
    isDrawing() { return Boolean(gesture); },

    clearSelection() {
      if (!sel.size) return false;
      setSelection(new Set());
      return true;
    },

    deleteSelection() {
      if (!sel.size || gesture) return false;
      removeStrokes(new Set(sel));
      setSelection(new Set());
      commit();
      return true;
    },

    // { color } or { sizeIdx } or { sizeStep: ±1 }
    applyToSelection(change) {
      const list = selectedStrokes();
      if (!list.length || gesture) return false;
      replaceStrokes(list, (s) => {
        const sizes = STROKE_TOOL_CONFIG[s.tool].sizes;
        let size = s.size;
        if (Number.isInteger(change.sizeIdx)) size = sizes[Math.max(0, Math.min(sizes.length - 1, change.sizeIdx))];
        if (Number.isInteger(change.sizeStep)) {
          const at = sizes.indexOf(s.size);
          const idx = at < 0 ? 1 : at;
          size = sizes[Math.max(0, Math.min(sizes.length - 1, idx + change.sizeStep))];
        }
        const color = change.color ?? s.color;
        return color === s.color && size === s.size ? s : { ...s, color, size };
      });
      commit();
      emitSelection();
      overlayChanged();
      return true;
    },

    nudgeSelection(dx, dy) {
      const list = selectedStrokes();
      if (!list.length || gesture) return false;
      replaceStrokes(list, (s) => translated(s, dx, dy));
      commit();
      overlayChanged();
      return true;
    },

    duplicateSelection() {
      const list = selectedStrokes();
      if (!list.length || gesture) return false;
      const copies = list.map((s, i) => ({
        ...s,
        id: createDrawingId(strokes.length + i),
        points: s.points.map((p) => [round1(p[0] + 10), round1(p[1] + 10), p[2]]),
      }));
      addStrokes(copies, true);
      setSelection(new Set(copies.map((s) => s.id)));
      commit();
      return true;
    },

    destroy() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      clearTimeout(settleTimer);
      untrackWindow();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      container.removeEventListener("pointerdown", onContainerPointerDownCapture, true);
      container.removeEventListener("pointermove", onContainerPointerMove);
      container.removeEventListener("pointerleave", onContainerPointerLeave);
      root.replaceChildren();
    },
  };
}
