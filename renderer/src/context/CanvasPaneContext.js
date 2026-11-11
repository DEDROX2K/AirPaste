import { createContext, useContext } from "react";

// Which canvas pane a CanvasWorkspaceView is rendering in. With split screen
// off there is one pane ("main") and it is always active. With it on, only
// the active pane (the one last pressed in) answers window-level keyboard
// shortcuts and paste, so a shortcut never runs twice.
const DEFAULT_PANE = Object.freeze({
  paneId: "main",
  isActive: true,
  isSecondary: false,
  splitEnabled: false,
  toggleSplit: null,
});

export const CanvasPaneContext = createContext(DEFAULT_PANE);

export function useCanvasPane() {
  return useContext(CanvasPaneContext);
}
