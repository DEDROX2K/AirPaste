import { useEffect, useRef } from "react";
import CubeTrailCanvas from "./CubeTrailCanvas";

const CONFIG = {
  cellSize: 12,
  trailLength: 14,
  interval: 16,
  color: "26, 34, 52",
  maxOpacity: 0.14,
};

export default function HomeCubeTrail({ containerRef }) {
  const pointRef = useRef({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return undefined;

    const handlePointerMove = (event) => {
      const rect = container.getBoundingClientRect();
      pointRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        active: true,
      };
    };

    const handlePointerLeave = () => {
      pointRef.current = { x: -1000, y: -1000, active: false };
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [containerRef]);

  return (
    <CubeTrailCanvas
      className="home-cube-trail"
      config={CONFIG}
      containerRef={containerRef}
      getPointerPosition={() => pointRef.current}
    />
  );
}
