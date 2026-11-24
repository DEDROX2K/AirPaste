// Canvas drawings: Line, Ink pen and Highlighter strokes, stored per page as
// `page.drawings = { version, objects: [stroke] }` in world coordinates.
//
// v2 stroke: { id, type: "stroke", tool: "line" | "ink" | "hl", color, size,
//              points: [[x, y, f], ...] }   (f = ink width factor, 1 otherwise)
// v1 objects ({ type: "line", points: [x1, y1, x2, y2], style }) are migrated
// to v2 line strokes when read.
export const DRAWINGS_SCHEMA_VERSION = 2;
export const DRAWING_OBJECT_TYPE_STROKE = "stroke";
export const DRAWING_OBJECT_TYPE_LINE = "line";

export const DRAWING_TOOL_MODE_SELECT = "select";
export const DRAWING_TOOL_MODE_HAND = "hand";
export const DRAWING_TOOL_MODE_TEXT = "text";
export const DRAWING_TOOL_MODE_TETHER = "tether";
export const DRAWING_TOOL_MODE_LINE = "line";
export const DRAWING_TOOL_MODE_INK = "ink";
export const DRAWING_TOOL_MODE_HIGHLIGHTER = "hl";

export const STROKE_TOOLS = Object.freeze([
  DRAWING_TOOL_MODE_LINE,
  DRAWING_TOOL_MODE_INK,
  DRAWING_TOOL_MODE_HIGHLIGHTER,
]);

export function isStrokeTool(mode) {
  return STROKE_TOOLS.includes(mode);
}

const INK_PALETTE = Object.freeze(["#1E1E1E", "#F24822", "#0D99FF", "#14AE5C", "#9747FF", "#FFFFFF"]);

export const STROKE_TOOL_CONFIG = Object.freeze({
  line: Object.freeze({ name: "Line", palette: INK_PALETTE, sizes: Object.freeze([2, 4, 8]), color: "#1E1E1E", sizeIdx: 1 }),
  ink: Object.freeze({ name: "Ink pen", palette: INK_PALETTE, sizes: Object.freeze([6, 10, 16]), color: "#1E1E1E", sizeIdx: 1 }),
  hl: Object.freeze({
    name: "Highlighter",
    palette: Object.freeze(["#FFD400", "#66E07A", "#FF8AD8", "#5BC7FF", "#FFA24C"]),
    sizes: Object.freeze([14, 22, 34]),
    color: "#FFD400",
    sizeIdx: 1,
  }),
});

const MAX_STROKE_SIZE = 96;
const DEFAULT_COLOR = "#1E1E1E";

function createFallbackDrawingId(fallbackIndex = 0) {
  return `draw_${Date.now().toString(36)}_${Math.abs(fallbackIndex).toString(36)}`;
}

export function createDrawingId(fallbackIndex = 0) {
  const provider = typeof globalThis !== "undefined" ? globalThis.crypto : null;

  if (typeof provider?.randomUUID === "function") {
    return `draw_${provider.randomUUID().replaceAll("-", "")}`;
  }

  return createFallbackDrawingId(fallbackIndex);
}

export function createEmptyDrawings() {
  return {
    version: DRAWINGS_SCHEMA_VERSION,
    objects: [],
  };
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function isColor(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 64;
}

function isPoint(point) {
  return Array.isArray(point)
    && point.length === 3
    && Number.isFinite(point[0])
    && Number.isFinite(point[1])
    && Number.isFinite(point[2]);
}

// Already a valid v2 stroke: returned as-is, so unchanged strokes keep their
// identity through a normalize and the renderer can skip them by reference.
function isNormalizedStroke(object) {
  return object.type === DRAWING_OBJECT_TYPE_STROKE
    && typeof object.id === "string"
    && object.id.length > 0
    && isStrokeTool(object.tool)
    && isColor(object.color)
    && Number.isFinite(object.size)
    && object.size > 0
    && object.size <= MAX_STROKE_SIZE
    && Array.isArray(object.points)
    && object.points.length > 0
    && object.points.every(isPoint);
}

function normalizeStrokePoints(points) {
  if (!Array.isArray(points)) {
    return null;
  }

  const normalized = [];

  for (const point of points) {
    if (!Array.isArray(point)) continue;
    const x = Number(point[0]);
    const y = Number(point[1]);
    const f = Number.isFinite(Number(point[2])) ? Number(point[2]) : 1;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      normalized.push([x, y, clamp(f, 0.05, 4)]);
    }
  }

  return normalized.length > 0 ? normalized : null;
}

// v1: { type: "line", points: [x1, y1, x2, y2], style: { stroke, strokeWidth } }
function migrateLegacyLine(object, fallbackIndex) {
  const flat = Array.isArray(object.points) ? object.points.slice(0, 4).map(Number) : [];

  if (flat.length < 4 || flat.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const style = object.style && typeof object.style === "object" ? object.style : {};

  return {
    id: typeof object.id === "string" && object.id.trim().length > 0 ? object.id : createDrawingId(fallbackIndex),
    type: DRAWING_OBJECT_TYPE_STROKE,
    tool: DRAWING_TOOL_MODE_LINE,
    color: isColor(style.stroke) ? style.stroke.trim() : DEFAULT_COLOR,
    size: clamp(Number.isFinite(style.strokeWidth) ? style.strokeWidth : 3, 0.5, MAX_STROKE_SIZE),
    points: [[flat[0], flat[1], 1], [flat[2], flat[3], 1]],
  };
}

export function normalizeDrawingObject(object, fallbackIndex = 0) {
  if (!object || typeof object !== "object") {
    return null;
  }

  if (isNormalizedStroke(object)) {
    return object;
  }

  if (object.type === DRAWING_OBJECT_TYPE_LINE || (!object.type && !object.tool)) {
    return migrateLegacyLine(object, fallbackIndex);
  }

  if (object.type !== DRAWING_OBJECT_TYPE_STROKE || !isStrokeTool(object.tool)) {
    return null;
  }

  const points = normalizeStrokePoints(object.points);

  if (!points) {
    return null;
  }

  return {
    id: typeof object.id === "string" && object.id.trim().length > 0 ? object.id : createDrawingId(fallbackIndex),
    type: DRAWING_OBJECT_TYPE_STROKE,
    tool: object.tool,
    color: isColor(object.color) ? object.color.trim() : DEFAULT_COLOR,
    size: clamp(Number.isFinite(object.size) ? object.size : STROKE_TOOL_CONFIG[object.tool].sizes[1], 0.5, MAX_STROKE_SIZE),
    points: object.tool === DRAWING_TOOL_MODE_LINE && points.length === 1
      ? [points[0], [points[0][0] + 1, points[0][1], 1]]
      : points,
  };
}

export function normalizeDrawings(drawings) {
  const safeDrawings = drawings && typeof drawings === "object"
    ? drawings
    : createEmptyDrawings();
  const sourceObjects = Array.isArray(safeDrawings.objects) ? safeDrawings.objects : [];
  const objects = sourceObjects
    .map((object, index) => normalizeDrawingObject(object, index))
    .filter(Boolean);

  // Nothing changed: hand back the same object, so memoised consumers
  // don't see a new drawings value.
  if (
    safeDrawings.version === DRAWINGS_SCHEMA_VERSION
    && objects.length === sourceObjects.length
    && objects.every((object, index) => object === sourceObjects[index])
  ) {
    return safeDrawings;
  }

  return {
    version: DRAWINGS_SCHEMA_VERSION,
    objects,
  };
}

function arePointsEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    const p = a[index];
    const q = b[index];
    if (p === q) continue;
    if (Array.isArray(p) && Array.isArray(q)) {
      if (p.length !== q.length) return false;
      for (let k = 0; k < p.length; k += 1) {
        if (p[k] !== q[k]) return false;
      }
    } else if (p !== q) {
      return false;
    }
  }

  return true;
}

export function areDrawingObjectsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  return a.id === b.id
    && a.type === b.type
    && a.tool === b.tool
    && a.color === b.color
    && a.size === b.size
    && arePointsEqual(a.points, b.points)
    && JSON.stringify(a.style ?? null) === JSON.stringify(b.style ?? null);
}
