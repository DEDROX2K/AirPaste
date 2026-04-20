import {
  createEmptyDrawings,
  createLineDrawingObject,
  normalizeDrawings,
} from "./drawingTypes";

const MIN_LINE_LENGTH = 0.5;

export function toLinePoints(startPoint, endPoint) {
  const startX = Number.isFinite(startPoint?.x) ? startPoint.x : 0;
  const startY = Number.isFinite(startPoint?.y) ? startPoint.y : 0;
  const endX = Number.isFinite(endPoint?.x) ? endPoint.x : startX;
  const endY = Number.isFinite(endPoint?.y) ? endPoint.y : startY;

  return [startX, startY, endX, endY];
}

export function createDraftLine(startPoint, style) {
  return {
    type: "line",
    points: toLinePoints(startPoint, startPoint),
    style: { ...style },
  };
}

export function updateDraftLine(draftLine, endPoint) {
  if (!draftLine || draftLine.type !== "line") {
    return null;
  }

  return {
    ...draftLine,
    points: toLinePoints(
      { x: draftLine.points[0], y: draftLine.points[1] },
      endPoint,
    ),
  };
}

export function getLineLength(points) {
  if (!Array.isArray(points) || points.length < 4) {
    return 0;
  }

  return Math.hypot(points[2] - points[0], points[3] - points[1]);
}

export function shouldCommitDraftLine(draftLine, minimumLength = MIN_LINE_LENGTH) {
  return getLineLength(draftLine?.points) >= minimumLength;
}

export function buildCommittedLineFromDraft(draftLine) {
  if (!draftLine || draftLine.type !== "line") {
    return null;
  }

  return createLineDrawingObject({
    points: draftLine.points,
    style: draftLine.style,
  });
}

export function appendDrawingObject(drawings, drawingObject) {
  const normalizedDrawings = normalizeDrawings(drawings ?? createEmptyDrawings());

  if (!drawingObject) {
    return normalizedDrawings;
  }

  return {
    ...normalizedDrawings,
    objects: [...normalizedDrawings.objects, drawingObject],
  };
}

export function removeDrawingObjectById(drawings, drawingId) {
  const normalizedDrawings = normalizeDrawings(drawings ?? createEmptyDrawings());

  if (!drawingId) {
    return normalizedDrawings;
  }

  return {
    ...normalizedDrawings,
    objects: normalizedDrawings.objects.filter((drawingObject) => drawingObject.id !== drawingId),
  };
}

export function worldPointFromStageEvent(stageEvent, clientToWorldPoint, viewport = null) {
  const nativeEvent = stageEvent?.evt ?? null;

  if (
    typeof clientToWorldPoint === "function"
    && Number.isFinite(nativeEvent?.clientX)
    && Number.isFinite(nativeEvent?.clientY)
  ) {
    return clientToWorldPoint(nativeEvent.clientX, nativeEvent.clientY);
  }

  const stage = stageEvent?.target?.getStage?.() ?? null;
  const pointer = stage?.getPointerPosition?.() ?? null;
  const zoom = Number.isFinite(viewport?.zoom) ? Math.max(0.01, viewport.zoom) : 1;

  if (!pointer) {
    return null;
  }

  return {
    x: (pointer.x - (viewport?.x ?? 0)) / zoom,
    y: (pointer.y - (viewport?.y ?? 0)) / zoom,
  };
}
