import { useEffect, useRef, useState } from "react";
import CubeTrailCanvas from "./CubeTrailCanvas";

const LAST_POINTER_POSITION_KEY = "__airpasteLastPointerPosition";
const TRAIL_CONFIG = {
  cellSize: 10,
  trailLength: 18,
  interval: 16,
  color: "26, 34, 52",
  maxOpacity: 0.28,
};

function createInactivePoint() {
  return { x: -1000, y: -1000, active: false };
}

export default function GlobalLoadingCursor() {
  const viewportRef = useRef(null);
  const pointRef = useRef(createInactivePoint());
  const [cursorPosition, setCursorPosition] = useState({ x: -1000, y: -1000, visible: false });

  useEffect(() => {
    const initialPointerPosition = window[LAST_POINTER_POSITION_KEY];
    if (
      initialPointerPosition
      && Number.isFinite(initialPointerPosition.x)
      && Number.isFinite(initialPointerPosition.y)
    ) {
      pointRef.current = {
        x: initialPointerPosition.x,
        y: initialPointerPosition.y,
        active: true,
      };
      setCursorPosition({
        x: initialPointerPosition.x,
        y: initialPointerPosition.y,
        visible: true,
      });
    }

    const updatePosition = (clientX, clientY) => {
      pointRef.current = { x: clientX, y: clientY, active: true };
      setCursorPosition({ x: clientX, y: clientY, visible: true });
    };

    const handlePointerMove = (event) => {
      updatePosition(event.clientX, event.clientY);
    };

    const handlePointerLeave = () => {
      pointRef.current = createInactivePoint();
      setCursorPosition((current) => ({ ...current, visible: false }));
    };

    const handlePointerDown = (event) => {
      updatePosition(event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("blur", handlePointerLeave);
    document.addEventListener("mouseleave", handlePointerLeave);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("blur", handlePointerLeave);
      document.removeEventListener("mouseleave", handlePointerLeave);
    };
  }, []);

  return (
    <div ref={viewportRef} className="global-loading-cursor" aria-hidden="true">
      <CubeTrailCanvas
        className="global-loading-cursor__trail"
        config={TRAIL_CONFIG}
        containerRef={viewportRef}
        getPointerPosition={() => pointRef.current}
      />

      <div
        className={`global-loading-cursor__glyph ${cursorPosition.visible ? "global-loading-cursor__glyph--visible" : ""}`}
        style={{
          transform: `translate(${cursorPosition.x}px, ${cursorPosition.y}px)`,
        }}
      >
        <span className="global-loading-cursor__cube" />
      </div>
    </div>
  );
}
