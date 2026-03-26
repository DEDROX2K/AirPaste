import {
  RADIAL_MENU_FOOTPRINT_RADIUS,
  RADIAL_MENU_NODE_COUNT,
  RADIAL_MENU_NODE_START_RATIO,
  RADIAL_MENU_RING_RADIUS,
  RADIAL_MENU_VIEWPORT_PADDING,
} from "./radialMenuConstants";

export function clampRadialMenuCenterToViewport(x, y, options = {}) {
  const viewportWidth = options.viewportWidth ?? window.innerWidth;
  const viewportHeight = options.viewportHeight ?? window.innerHeight;
  const padding = options.padding ?? RADIAL_MENU_VIEWPORT_PADDING;
  const footprintRadius = options.footprintRadius ?? RADIAL_MENU_FOOTPRINT_RADIUS;
  const minX = padding + footprintRadius;
  const maxX = viewportWidth - padding - footprintRadius;
  const minY = padding + footprintRadius;
  const maxY = viewportHeight - padding - footprintRadius;

  return {
    x: clamp(x, minX, Math.max(minX, maxX)),
    y: clamp(y, minY, Math.max(minY, maxY)),
  };
}

export function getRadialMenuItemLayout(
  nodeCount = RADIAL_MENU_NODE_COUNT,
  ringRadius = RADIAL_MENU_RING_RADIUS,
  startRatio = RADIAL_MENU_NODE_START_RATIO,
) {
  const angleStep = (Math.PI * 2) / nodeCount;
  const startAngle = -Math.PI / 2;

  return Array.from({ length: nodeCount }, (_, index) => {
    const angle = startAngle + (angleStep * index);
    const unitX = Math.cos(angle);
    const unitY = Math.sin(angle);

    return {
      index,
      angle,
      unitX,
      unitY,
      x: unitX * ringRadius,
      y: unitY * ringRadius,
      introX: unitX * ringRadius * startRatio,
      introY: unitY * ringRadius * startRatio,
    };
  });
}

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}
