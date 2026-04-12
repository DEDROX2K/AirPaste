import {
  RADIAL_MENU_ACTION_SIZE,
  RADIAL_MENU_NODE_COUNT,
  RADIAL_MENU_NODE_START_RATIO,
  RADIAL_MENU_INNER_RING_RADIUS,
  RADIAL_MENU_ITEMS_PER_RING,
  RADIAL_MENU_RING_GAP,
  RADIAL_MENU_SNAP_PILL_HEIGHT,
  RADIAL_MENU_SNAP_PILL_OFFSET,
  RADIAL_MENU_VIEWPORT_PADDING,
} from "./radialMenuConstants";

export function clampRadialMenuCenterToViewport(x, y, options = {}) {
  const viewportWidth = options.viewportWidth ?? window.innerWidth;
  const viewportHeight = options.viewportHeight ?? window.innerHeight;
  const padding = options.padding ?? RADIAL_MENU_VIEWPORT_PADDING;
  const bounds = options.bounds ?? {
    left: -((options.footprintRadius ?? 0)),
    right: options.footprintRadius ?? 0,
    top: -((options.footprintRadius ?? 0)),
    bottom: options.footprintRadius ?? 0,
  };
  const minX = padding - bounds.left;
  const maxX = viewportWidth - padding - bounds.right;
  const minY = padding - bounds.top;
  const maxY = viewportHeight - padding - bounds.bottom;

  return {
    x: clamp(x, minX, Math.max(minX, maxX)),
    y: clamp(y, minY, Math.max(minY, maxY)),
  };
}

export function getRadialMenuItemLayout(
  nodeCount = RADIAL_MENU_NODE_COUNT,
  ringRadius = RADIAL_MENU_INNER_RING_RADIUS,
  startRatio = RADIAL_MENU_NODE_START_RATIO,
) {
  if (nodeCount <= 0) {
    return [];
  }

  const itemsPerRing = Math.max(3, RADIAL_MENU_ITEMS_PER_RING);
  const ringCount = Math.max(1, Math.ceil(nodeCount / itemsPerRing));

  return Array.from({ length: nodeCount }, (_, index) => {
    const ringIndex = Math.floor(index / itemsPerRing);
    const indexInRing = index % itemsPerRing;
    const nodesInRing = Math.min(itemsPerRing, nodeCount - (ringIndex * itemsPerRing));
    const angleStep = (Math.PI * 2) / nodesInRing;
    const angleOffset = ringIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + (angleStep / 2);
    const angle = angleOffset + (angleStep * indexInRing);
    const currentRingRadius = ringRadius + (ringIndex * RADIAL_MENU_RING_GAP);
    const unitX = Math.cos(angle);
    const unitY = Math.sin(angle);

    return {
      index,
      angle,
      ringIndex,
      ringCount,
      unitX,
      unitY,
      x: unitX * currentRingRadius,
      y: unitY * currentRingRadius,
      introX: unitX * currentRingRadius * startRatio,
      introY: unitY * currentRingRadius * startRatio,
      size: RADIAL_MENU_ACTION_SIZE,
    };
  });
}

export function getRadialMenuBounds(items, options = {}) {
  const actionHalfSize = (options.actionSize ?? RADIAL_MENU_ACTION_SIZE) / 2;
  const snapPillHeight = options.snapPillHeight ?? 0;
  const snapPillWidth = options.snapPillWidth ?? 0;
  const snapPillOffset = options.snapPillOffset ?? RADIAL_MENU_SNAP_PILL_OFFSET;

  const itemBounds = items.reduce((currentBounds, item) => ({
    left: Math.min(currentBounds.left, item.x - actionHalfSize),
    right: Math.max(currentBounds.right, item.x + actionHalfSize),
    top: Math.min(currentBounds.top, item.y - actionHalfSize),
    bottom: Math.max(currentBounds.bottom, item.y + actionHalfSize),
  }), {
    left: -actionHalfSize,
    right: actionHalfSize,
    top: -actionHalfSize,
    bottom: actionHalfSize,
  });

  if (!snapPillWidth || !snapPillHeight) {
    return itemBounds;
  }

  const snapHalfWidth = snapPillWidth / 2;
  const snapBottom = itemBounds.top - snapPillOffset;
  const snapTop = snapBottom - snapPillHeight;

  return {
    left: Math.min(itemBounds.left, -snapHalfWidth),
    right: Math.max(itemBounds.right, snapHalfWidth),
    top: Math.min(itemBounds.top, snapTop),
    bottom: itemBounds.bottom,
  };
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
