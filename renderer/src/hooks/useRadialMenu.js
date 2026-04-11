import { useMemo } from "react";
import { clampRadialMenuCenterToViewport, getRadialMenuItemLayout } from "../systems/interactions/radialMenuMath";
import {
  RADIAL_MENU_FOOTPRINT_RADIUS,
  RADIAL_MENU_NODE_COUNT,
  RADIAL_MENU_NODE_START_RATIO,
  RADIAL_MENU_RING_RADIUS,
  RADIAL_MENU_VIEWPORT_PADDING,
} from "../systems/interactions/radialMenuConstants";

export function useRadialMenu(menu, actionCount = RADIAL_MENU_NODE_COUNT) {
  return useMemo(() => {
    if (!menu) {
      return {
        isOpen: false,
        position: null,
        items: [],
      };
    }

    return {
      isOpen: true,
      position: clampRadialMenuCenterToViewport(menu.x, menu.y, {
        padding: RADIAL_MENU_VIEWPORT_PADDING,
        footprintRadius: RADIAL_MENU_FOOTPRINT_RADIUS,
      }),
      items: getRadialMenuItemLayout(
        actionCount || RADIAL_MENU_NODE_COUNT,
        RADIAL_MENU_RING_RADIUS,
        RADIAL_MENU_NODE_START_RATIO,
      ),
    };
  }, [actionCount, menu]);
}
