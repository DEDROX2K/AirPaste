import { createContext } from "react";

/**
 * CanvasMotionContext
 * value: boolean -- true while the canvas is panning, zooming or dragging.
 *
 * A context rather than a tile prop: motion starts and stops on every
 * gesture, and as a prop it re-rendered every memoized tile each time. Only
 * tiles that actually change behavior while moving read it.
 */
export const CanvasMotionContext = createContext(false);
