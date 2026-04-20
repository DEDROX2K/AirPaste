export const DRAWINGS_SCHEMA_VERSION = 1;
export const DRAWING_OBJECT_TYPE_LINE = "line";
export const DRAWING_TOOL_MODE_SELECT = "select";
export const DRAWING_TOOL_MODE_LINE = "line";

export const DEFAULT_DRAWING_STYLE = Object.freeze({
  stroke: "#111111",
  strokeWidth: 3,
  opacity: 1,
});

const MIN_LINE_POINT_COUNT = 4;
const MAX_STROKE_WIDTH = 96;

function nowTimestampSeconds() {
  return Math.floor(Date.now() / 1000);
}

function createFallbackDrawingId(fallbackIndex = 0) {
  return `draw_${Date.now().toString(36)}_${Math.abs(fallbackIndex).toString(36)}`;
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function toFiniteNumber(value, fallbackValue) {
  return Number.isFinite(value) ? value : fallbackValue;
}

function normalizeStroke(stroke) {
  return typeof stroke === "string" && stroke.trim().length > 0
    ? stroke.trim()
    : DEFAULT_DRAWING_STYLE.stroke;
}

function normalizeTimestamp(value, fallbackValue) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallbackValue;
}

function getCryptoProvider() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const { crypto } = globalThis;
  return crypto ?? null;
}

export function createDrawingId(fallbackIndex = 0) {
  const provider = getCryptoProvider();

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

export function normalizeDrawingStyle(style) {
  const safeStyle = style && typeof style === "object" ? style : {};

  return {
    stroke: normalizeStroke(safeStyle.stroke),
    strokeWidth: clamp(toFiniteNumber(safeStyle.strokeWidth, DEFAULT_DRAWING_STYLE.strokeWidth), 0.5, MAX_STROKE_WIDTH),
    opacity: clamp(toFiniteNumber(safeStyle.opacity, DEFAULT_DRAWING_STYLE.opacity), 0, 1),
  };
}

export function normalizeDrawingMeta(meta, fallbackCreatedAt = nowTimestampSeconds()) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  const createdAt = normalizeTimestamp(safeMeta.createdAt, fallbackCreatedAt);

  return {
    createdAt,
    updatedAt: normalizeTimestamp(safeMeta.updatedAt, createdAt),
  };
}

function normalizeLinePoints(points) {
  const safePoints = Array.isArray(points) ? points : [];

  if (safePoints.length < MIN_LINE_POINT_COUNT) {
    return null;
  }

  const normalizedPoints = safePoints
    .slice(0, MIN_LINE_POINT_COUNT)
    .map((value) => toFiniteNumber(value, 0));

  if (normalizedPoints.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return normalizedPoints;
}

export function normalizeDrawingObject(object, fallbackIndex = 0) {
  const safeObject = object && typeof object === "object" ? object : null;

  if (!safeObject || safeObject.type !== DRAWING_OBJECT_TYPE_LINE) {
    return null;
  }

  const points = normalizeLinePoints(safeObject.points);

  if (!points) {
    return null;
  }

  const createdAt = normalizeTimestamp(safeObject?.meta?.createdAt, nowTimestampSeconds());

  return {
    id: typeof safeObject.id === "string" && safeObject.id.trim().length > 0
      ? safeObject.id
      : createDrawingId(fallbackIndex),
    type: DRAWING_OBJECT_TYPE_LINE,
    points,
    style: normalizeDrawingStyle(safeObject.style),
    meta: normalizeDrawingMeta(safeObject.meta, createdAt),
  };
}

export function normalizeDrawings(drawings) {
  const safeDrawings = drawings && typeof drawings === "object"
    ? drawings
    : createEmptyDrawings();
  const objects = Array.isArray(safeDrawings.objects)
    ? safeDrawings.objects
      .map((object, index) => normalizeDrawingObject(object, index))
      .filter(Boolean)
    : [];

  return {
    version: DRAWINGS_SCHEMA_VERSION,
    objects,
  };
}

export function createLineDrawingObject({ points, style, id, meta } = {}) {
  const timestamp = nowTimestampSeconds();

  return normalizeDrawingObject({
    id: typeof id === "string" && id.trim().length > 0 ? id : createDrawingId(0),
    type: DRAWING_OBJECT_TYPE_LINE,
    points: Array.isArray(points) ? points : null,
    style: normalizeDrawingStyle(style),
    meta: normalizeDrawingMeta(meta, timestamp),
  });
}
