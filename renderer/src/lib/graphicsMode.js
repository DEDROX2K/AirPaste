// "lite" when main says the GPU cannot keep up (software compositing, or the
// GPU process crashed this session; see main/graphics.js). Heavy visuals
// (Constellation resolution, antialiasing) scale down when it is.
export function isLiteGraphics() {
  return typeof document !== "undefined" && document.documentElement?.dataset?.graphics === "lite";
}
