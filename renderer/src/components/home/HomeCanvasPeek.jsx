import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import HomeTileCard from "./HomeTileCard";

// Hovering a canvas on Home for a few seconds: some of its tiles pop in from
// the edges of the window, fanned and tilted, peeking over the list, and slide
// back out when the pointer moves on. Purely visual (no pointer events), so it
// never gets in the way of the list underneath.
const EXIT_MS = 520;

// Where each card peeks in from: the edge, its spot along that edge, a tilt.
const SLOTS = [
  { edge: "bottom", at: "9%", tilt: -9 },
  { edge: "bottom", at: "31%", tilt: 4 },
  { edge: "right", at: "26%", tilt: 10 },
  { edge: "bottom", at: "54%", tilt: -4 },
  { edge: "left", at: "34%", tilt: -11 },
  { edge: "bottom", at: "76%", tilt: 8 },
];

export default function HomeCanvasPeek({ peek, folderPath }) {
  // Keeps the last peek on screen while it slides out.
  const [shown, setShown] = useState(null);
  const [phase, setPhase] = useState("out");

  useEffect(() => {
    if (peek?.entries?.length) {
      setShown(peek);
      const frame = requestAnimationFrame(() => setPhase("in"));
      return () => cancelAnimationFrame(frame);
    }

    setPhase("out");
    const timeout = window.setTimeout(() => setShown(null), EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [peek]);

  if (!shown || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={`ap-home-peek is-${phase}`} aria-hidden="true">
      {shown.entries.slice(0, SLOTS.length).map((entry, index) => {
        const slot = SLOTS[index];
        return (
          <div
            key={entry.key}
            className={`ap-home-peek__slot ap-home-peek__slot--${slot.edge}`}
            style={{
              "--ap-peek-at": slot.at,
              "--ap-peek-tilt": `${slot.tilt}deg`,
              "--ap-peek-delay": `${index * 55}ms`,
            }}
          >
            <HomeTileCard entry={entry} folderPath={folderPath} width={slot.edge === "bottom" ? 210 : 190} />
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
