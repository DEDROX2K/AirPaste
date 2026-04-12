import { useMemo } from "react";
import {
  clampRadialMenuCenterToViewport,
  getRadialMenuBounds,
  getRadialMenuItemLayout,
} from "../systems/interactions/radialMenuMath";
import {
  RADIAL_MENU_NODE_COUNT,
  RADIAL_MENU_NODE_START_RATIO,
  RADIAL_MENU_ACTION_SIZE,
  RADIAL_MENU_INNER_RING_RADIUS,
  RADIAL_MENU_SNAP_PILL_HEIGHT,
  RADIAL_MENU_SNAP_PILL_MIN_WIDTH,
  RADIAL_MENU_SNAP_PILL_OFFSET,
  RADIAL_MENU_VIEWPORT_PADDING,
} from "../systems/interactions/radialMenuConstants";

export function useRadialMenu(menu, actionCount = RADIAL_MENU_NODE_COUNT) {
  return useMemo(() => {
    if (!menu) {
      return {
        isOpen: false,
        position: null,
        items: [],
        bounds: null,
      };
    }

    const ringItems = getRadialMenuItemLayout(
      actionCount || RADIAL_MENU_NODE_COUNT,
      RADIAL_MENU_INNER_RING_RADIUS,
      RADIAL_MENU_NODE_START_RATIO,
    );
    const showSnapPill = menu.kind === "canvas";
    const bounds = getRadialMenuBounds(ringItems, {
      actionSize: RADIAL_MENU_ACTION_SIZE,
      snapPillHeight: showSnapPill ? RADIAL_MENU_SNAP_PILL_HEIGHT : 0,
      snapPillWidth: showSnapPill ? RADIAL_MENU_SNAP_PILL_MIN_WIDTH : 0,
      snapPillOffset: RADIAL_MENU_SNAP_PILL_OFFSET,
    });

    return {
      isOpen: true,
      position: clampRadialMenuCenterToViewport(menu.x, menu.y, {
        padding: RADIAL_MENU_VIEWPORT_PADDING,
        bounds,
      }),
      items: ringItems,
      bounds,
    };
  }, [actionCount, menu]);
}
