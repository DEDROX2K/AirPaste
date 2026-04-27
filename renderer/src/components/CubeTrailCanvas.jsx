import { useEffect, useRef } from "react";

const DEFAULT_CONFIG = {
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

export default function CubeTrailCanvas({
  className = "home-cube-trail",
  config = DEFAULT_CONFIG,
  containerRef,
  getPointerPosition,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef?.current;
    if (!canvas || !container || typeof getPointerPosition !== "function") {
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) return undefined;

    let rafId = 0;
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let grid = [];
    let devicePixelRatio = clampDpr(window.devicePixelRatio);
    let lastPoint = null;
    let lastTime = 0;

    const getIndex = (x, y) => {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return -1;
      return y * cols + x;
    };

    const paintAt = (x, y) => {
      const gridX = Math.floor(x / config.cellSize);
      const gridY = Math.floor(y / config.cellSize);
      const index = getIndex(gridX, gridY);
      if (index !== -1) grid[index] = 1;
    };

    const paintSegment = (point) => {
      if (!point || point.active === false) {
        lastPoint = null;
        return;
      }

      if (lastPoint) {
        const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, config.cellSize / 2)));

        for (let step = 0; step <= steps; step += 1) {
          const progress = step / steps;
          paintAt(
            lastPoint.x + (point.x - lastPoint.x) * progress,
            lastPoint.y + (point.y - lastPoint.y) * progress,
          );
        }
      } else {
        paintAt(point.x, point.y);
      }

      lastPoint = point;
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      cols = Math.ceil(width / config.cellSize);
      rows = Math.ceil(height / config.cellSize);
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
          if (grid[index] > config.trailLength) grid[index] = 0;
        }
      }
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < cols; column += 1) {
          const age = grid[row * cols + column];
          if (!age) continue;

          const opacity = Math.max(0, (1 - age / config.trailLength) * config.maxOpacity);
          context.fillStyle = `rgba(${config.color}, ${opacity})`;
          context.fillRect(column * config.cellSize, row * config.cellSize, config.cellSize - 1, config.cellSize - 1);
        }
      }
    };

    const animate = (now) => {
      if (now - lastTime >= config.interval) {
        paintSegment(getPointerPosition({ width, height, now }));
        update();
        lastTime = now;
      }

      draw();
      rafId = window.requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener("resize", resize);

    resize();
    rafId = window.requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(rafId);
    };
  }, [config, containerRef, getPointerPosition]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
