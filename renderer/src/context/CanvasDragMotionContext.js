import { createContext } from "react";

/**
 * CanvasDragMotionContext
 * value: the canvas's drag motion store (systems/interactions/dragMotion.js),
 * or null outside a canvas.
 *
 * The store itself never changes, so reading it re-renders nothing; dragged
 * tiles subscribe to it for their live offset instead of taking it as a prop.
 */
export const CanvasDragMotionContext = createContext(null);
