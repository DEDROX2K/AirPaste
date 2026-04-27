export const MIN_VIEWPORT_ZOOM = 0.1;
export const MAX_VIEWPORT_ZOOM = 6;
export const CANVAS_GRID_SIZE = 32;
export const WHEEL_LINE_PIXELS = 16;
export const DEFAULT_FIT_PADDING = 72;
export const ZOOM_STOPS = Object.freeze([
  0.1,
  0.2,
  0.3,
  0.4,
  0.5,
  0.6,
  0.8,
  1,
  1.25,
  1.5,
  2,
  3,
  4,
  5,
  6,
]);

export function clampViewportZoom(zoom) {
  return Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, zoom));
}

export function zoomScaleToPercent(zoom) {
  return Math.round(clampViewportZoom(zoom) * 100);
}

export function zoomPercentToScale(percent) {
  const numericPercent = Number(percent);

  if (!Number.isFinite(numericPercent) || numericPercent <= 0) {
    return null;
  }

  return clampViewportZoom(numericPercent / 100);
}

export function formatZoomPercentLabel(zoom) {
  return `${zoomScaleToPercent(zoom)}%`;
}

export function getNextZoomStop(currentZoom) {
  const safeZoom = clampViewportZoom(currentZoom);
  return ZOOM_STOPS.find((stop) => stop > safeZoom) ?? ZOOM_STOPS[ZOOM_STOPS.length - 1];
}

export function getPreviousZoomStop(currentZoom) {
  const safeZoom = clampViewportZoom(currentZoom);

  for (let index = ZOOM_STOPS.length - 1; index >= 0; index -= 1) {
    if (ZOOM_STOPS[index] < safeZoom) {
      return ZOOM_STOPS[index];
    }
  }

  return ZOOM_STOPS[0];
}

export function normalizeWheelZoomDelta(delta, deltaMode, pageSize = 800) {
  if (deltaMode === 1) {
    return delta * WHEEL_LINE_PIXELS;
  }

  if (deltaMode === 2) {
    return delta * pageSize;
  }

  return delta;
}

export function getClientRect(element) {
  return element?.getBoundingClientRect?.() ?? null;
}

function normalizeClientRect(source) {
  if (!source) {
    return null;
  }

  if (typeof source.left === "number" && typeof source.top === "number") {
    return source;
  }

  return getClientRect(source);
}

export function clientToCanvasPoint(elementOrRect, clientX, clientY) {
  const rect = normalizeClientRect(elementOrRect);

  if (!rect) {
    return { x: 0, y: 0 };
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

export function clientToWorldPoint(elementOrRect, viewport, clientX, clientY) {
  const canvasPoint = clientToCanvasPoint(elementOrRect, clientX, clientY);

  return {
    x: (canvasPoint.x - viewport.x) / viewport.zoom,
    y: (canvasPoint.y - viewport.y) / viewport.zoom,
  };
}

export function getViewportCenterPoint(elementOrRect, viewport) {
  const rect = normalizeClientRect(elementOrRect);

  if (!rect) {
    return {
      x: Math.round((-viewport.x + 480) / viewport.zoom),
      y: Math.round((-viewport.y + 320) / viewport.zoom),
    };
  }

  return {
    x: Math.round((rect.width / 2 - viewport.x) / viewport.zoom),
    y: Math.round((rect.height / 2 - viewport.y) / viewport.zoom),
  };
}

export function getViewportForWorldPoint(canvasPoint, worldPoint, zoom) {
  const nextZoom = clampViewportZoom(zoom);

  return {
    x: canvasPoint.x - worldPoint.x * nextZoom,
    y: canvasPoint.y - worldPoint.y * nextZoom,
    zoom: nextZoom,
  };
}

export function interpolateViewport(currentViewport, targetViewport, alpha) {
  const weight = Math.max(0, Math.min(1, alpha));

  return {
    x: currentViewport.x + ((targetViewport.x - currentViewport.x) * weight),
    y: currentViewport.y + ((targetViewport.y - currentViewport.y) * weight),
    zoom: currentViewport.zoom + ((targetViewport.zoom - currentViewport.zoom) * weight),
  };
}

export function areViewportTransformsClose(
  leftViewport,
  rightViewport,
  positionTolerance = 0.25,
  zoomTolerance = 0.001,
) {
  if (!leftViewport || !rightViewport) {
    return false;
  }

  return Math.abs(leftViewport.x - rightViewport.x) <= positionTolerance
    && Math.abs(leftViewport.y - rightViewport.y) <= positionTolerance
    && Math.abs(leftViewport.zoom - rightViewport.zoom) <= zoomTolerance;
}

export function getViewportForWorldBounds(elementRect, worldRect, padding = DEFAULT_FIT_PADDING) {
  if (!elementRect || !worldRect) {
    return null;
  }

  const paddedX = Math.min(padding, Math.max(24, elementRect.width * 0.16));
  const paddedY = Math.min(padding, Math.max(24, elementRect.height * 0.16));
  const availableWidth = Math.max(1, elementRect.width - paddedX * 2);
  const availableHeight = Math.max(1, elementRect.height - paddedY * 2);
  const worldWidth = Math.max(1, worldRect.width);
  const worldHeight = Math.max(1, worldRect.height);
  const zoom = clampViewportZoom(Math.min(
    availableWidth / worldWidth,
    availableHeight / worldHeight,
  ));

  return {
    x: (elementRect.width - worldWidth * zoom) / 2 - worldRect.left * zoom,
    y: (elementRect.height - worldHeight * zoom) / 2 - worldRect.top * zoom,
    zoom,
  };
}

export function getCanvasGridStyleVars(viewport) {
  const transform = getWorldToScreenTransform(viewport);

  return {
    "--canvas-grid-size": `${CANVAS_GRID_SIZE * transform.zoom}px`,
    "--canvas-grid-offset-x": `${transform.x}px`,
    "--canvas-grid-offset-y": `${transform.y}px`,
  };
}

export function getCanvasContentStyleVars(viewport) {
  const transform = getWorldToScreenTransform(viewport);

  return {
    "--canvas-viewport-x": `${transform.x}px`,
    "--canvas-viewport-y": `${transform.y}px`,
    "--canvas-viewport-zoom": String(transform.zoom),
  };
}

export function getWorldToScreenTransform(viewport) {
  const x = Number.isFinite(viewport?.x) ? viewport.x : 0;
  const y = Number.isFinite(viewport?.y) ? viewport.y : 0;
  const zoom = Number.isFinite(viewport?.zoom) ? Math.max(0.01, viewport.zoom) : 1;

  return { x, y, zoom };
}
