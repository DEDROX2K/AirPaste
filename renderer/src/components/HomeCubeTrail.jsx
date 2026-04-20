import { useEffect, useRef } from "react";

const CONFIG = {
  cellSize: 12,
  trailLength: 14,
  interval: 16,
  color: "26, 34, 52",
  maxOpacity: 0.14,
};

function clampDpr(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(value, 2);
}

export default function HomeCubeTrail({ containerRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef?.current;
    if (!canvas || !container) return undefined;

    const context = canvas.getContext("2d");
    if (!context) return undefined;

    let rafId = 0;
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let grid = [];
    let devicePixelRatio = clampDpr(window.devicePixelRatio);
    let mouseX = -1000;
    let mouseY = -1000;
    let lastMouseX = null;
    let lastMouseY = null;
    let lastTime = 0;

    const getIndex = (x, y) => {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return -1;
      return y * cols + x;
    };

    const paintAt = (x, y) => {
      const gridX = Math.floor(x / CONFIG.cellSize);
      const gridY = Math.floor(y / CONFIG.cellSize);
      const index = getIndex(gridX, gridY);
      if (index !== -1) grid[index] = 1;
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      cols = Math.ceil(width / CONFIG.cellSize);
      rows = Math.ceil(height / CONFIG.cellSize);
      grid = new Array(cols * rows).fill(0);

      devicePixelRatio = clampDpr(window.devicePixelRatio);
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };

    const update = () => {
      for (let index = 0; index < grid.length; index += 1) {
        if (grid[index] > 0) {
          grid[index] += 1;
          if (grid[index] > CONFIG.trailLength) grid[index] = 0;
        }
      }
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < cols; column += 1) {
          const age = grid[row * cols + column];
          if (!age) continue;

          const opacity = Math.max(0, (1 - age / CONFIG.trailLength) * CONFIG.maxOpacity);
          context.fillStyle = `rgba(${CONFIG.color}, ${opacity})`;
          context.fillRect(column * CONFIG.cellSize, row * CONFIG.cellSize, CONFIG.cellSize - 1, CONFIG.cellSize - 1);
        }
      }
    };

    const animate = (now) => {
      if (now - lastTime >= CONFIG.interval) {
        paintAt(mouseX, mouseY);
        update();
        lastTime = now;
      }

      draw();
      rafId = window.requestAnimationFrame(animate);
    };

    const handlePointerMove = (event) => {
      const rect = container.getBoundingClientRect();
      mouseX = event.clientX - rect.left;
      mouseY = event.clientY - rect.top;

      if (lastMouseX !== null && lastMouseY !== null) {
        const distance = Math.hypot(mouseX - lastMouseX, mouseY - lastMouseY);
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, CONFIG.cellSize / 2)));

        for (let step = 0; step <= steps; step += 1) {
          const progress = step / steps;
          paintAt(
            lastMouseX + (mouseX - lastMouseX) * progress,
            lastMouseY + (mouseY - lastMouseY) * progress,
          );
        }
      } else {
        paintAt(mouseX, mouseY);
      }

      lastMouseX = mouseX;
      lastMouseY = mouseY;
    };

    const handlePointerLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
      lastMouseX = null;
      lastMouseY = null;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("resize", resize);

    resize();
    rafId = window.requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(rafId);
    };
  }, [containerRef]);

  return <canvas ref={canvasRef} className="home-cube-trail" aria-hidden="true" />;
}
