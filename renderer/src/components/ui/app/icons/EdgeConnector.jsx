// Inverse fillet ("edge connector"): a quarter square with a concave arc cut
// out of it. Sitting in the corner where two surfaces meet, it rounds the
// join so a panel looks like it grows out of the frame (the quick note's
// X tab, the pages panel, the split divider meeting the top bar).
//
// As drawn, the solid corner points bottom-right. `corner` mirrors it so the
// solid corner points at whichever side it is joining. Colour follows
// `currentColor`; size follows `--edge-connector-size` (default 14px), and
// a connector placed on the zoomed canvas can scale it with
// calc(14px / var(--canvas-zoom, 1)).
//
// The viewBox is the arc's own box, so the solid edges land exactly on the
// element's edges, and the solid part bleeds a little past them (overflow
// visible) into the two surfaces it joins. Without the bleed, anti-aliasing
// left a hairline seam where it met them.
const CORNER_TRANSFORMS = {
  "bottom-right": undefined,
  "bottom-left": "scaleX(-1)",
  "top-right": "scaleY(-1)",
  "top-left": "scale(-1, -1)",
};

const SIZE = 104.572;
const BLEED = 10;
const PATH = `M0 ${SIZE}C57.7537 ${SIZE} ${SIZE} 57.7537 ${SIZE} 0H${SIZE + BLEED}V${SIZE + BLEED}H0Z`;

export default function EdgeConnector({ corner = "bottom-right", className = "", style, ...props }) {
  return (
    <svg
      className={`edge-connector${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      overflow="visible"
      style={{
        width: "var(--edge-connector-size, 14px)",
        height: "var(--edge-connector-size, 14px)",
        display: "block",
        overflow: "visible",
        pointerEvents: "none",
        transform: CORNER_TRANSFORMS[corner],
        ...style,
      }}
      {...props}
    >
      <path d={PATH} fill="currentColor" />
    </svg>
  );
}
