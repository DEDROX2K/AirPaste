// Inverse fillet ("edge connector"): a quarter square with a concave arc cut
// out of it. Sitting in the corner where two surfaces meet, it rounds the
// join so a panel looks like it grows out of the frame (the quick note's
// X tab, the split divider meeting the top bar).
//
// As drawn, the solid corner points bottom-right. `corner` mirrors it so the
// solid corner points at whichever side it is joining. Colour follows
// `currentColor`; size follows `--edge-connector-size` (default 14px), and
// a connector placed on the zoomed canvas can scale it with
// calc(14px / var(--canvas-zoom, 1)).
const CORNER_TRANSFORMS = {
  "bottom-right": undefined,
  "bottom-left": "scaleX(-1)",
  "top-right": "scaleY(-1)",
  "top-left": "scale(-1, -1)",
};

export default function EdgeConnector({ corner = "bottom-right", className = "", style, ...props }) {
  return (
    <svg
      className={`edge-connector${className ? ` ${className}` : ""}`}
      viewBox="0 0 105 105"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{
        width: "var(--edge-connector-size, 14px)",
        height: "var(--edge-connector-size, 14px)",
        display: "block",
        pointerEvents: "none",
        transform: CORNER_TRANSFORMS[corner],
        ...style,
      }}
      {...props}
    >
      <path d="M0 104.572H104.572V0C104.572 57.7537 57.7537 104.572 0 104.572Z" fill="currentColor" />
    </svg>
  );
}
