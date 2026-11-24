import { useEffect, useRef } from "react";

// Pixel trail on the window's grey base layer (.app-window): moving the
// pointer over the bare grey (the top bar, Home's sidebar, the gaps round the
// card) leaves a short trail of squares that shrink and fade. It's drawn
// beneath everything, so the opaque Home card and the canvas card simply
// cover it; only the grey shows it.
const CELL = 12;
const GAP = 2;
const LIFE_MS = 520;
const PEAK_ALPHA = 0.32;
// Where the pointer counts as "over the grey".
const GREY_SELECTOR = ".titlebar-root, .ap-home-sidebar, .app-window, .app-shell__view-container, .ap-home";
const CARD_SELECTOR = ".ap-home-main, .app-shell__workspace-layout, [role='dialog'], [role='menu']";

export default function ShellPixelTrail() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const cells = new Map();
    let last = null;
    let frame = 0;
    let width = 0;
    let height = 0;
    let ink = "#1c1c1e";

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    const light = (x, y, t) => {
      const cx = Math.floor(x / CELL);
      const cy = Math.floor(y / CELL);
      cells.set(`${cx},${cy}`, { cx, cy, t });
    };

    const loop = (now) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = ink;
      for (const [key, cell] of cells) {
        const age = (now - cell.t) / LIFE_MS;
        if (age >= 1) {
          cells.delete(key);
          continue;
        }
        const s = (CELL - GAP) * (1 - age * 0.5);
        ctx.globalAlpha = PEAK_ALPHA * (1 - age) * (1 - age);
        ctx.fillRect(cell.cx * CELL + (CELL - s) / 2, cell.cy * CELL + (CELL - s) / 2, s, s);
      }
      ctx.globalAlpha = 1;
      frame = cells.size ? requestAnimationFrame(loop) : 0;
    };

    const onMove = (event) => {
      if (reduceMotion?.matches || event.pointerType === "touch" || event.buttons) {
        last = null;
        return;
      }
      const target = event.target;
      const overGrey = target?.closest?.(GREY_SELECTOR) && !target.closest(CARD_SELECTOR);
      if (!overGrey) {
        last = null;
        return;
      }
      if (!last) {
        // Light trail on a dark window base, dark on a light one.
        ink = document.documentElement.dataset.shellTone === "dark" ? "#ffffff" : "#1c1c1e";
      }
      const t = performance.now();
      if (last) {
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        const steps = Math.ceil(Math.hypot(dx, dy) / (CELL / 2));
        for (let i = 1; i <= steps; i += 1) light(last.x + (dx * i) / steps, last.y + (dy * i) / steps, t);
      } else {
        light(event.clientX, event.clientY, t);
      }
      last = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const onLeave = () => { last = null; };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", size);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", size);
    };
  }, []);

  return <canvas ref={canvasRef} className="ap-shell-trail" aria-hidden="true" />;
}
