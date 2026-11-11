import { useEffect, useRef } from "react";
import { isLiteGraphics } from "../../lib/graphicsMode";

// The night sky behind Constellation: one 2D canvas that lives for the whole
// time the view is open (so there is never a "different sky" swapping in when
// the 3D scene starts). Three depths of stars with their own twinkle, soft
// nebula glows, and the odd shooting star. It moves with the blanket -- the
// scene writes its pan into `panRef` every frame -- the nearer stars faster,
// so the sky has depth. On the way in (and out) it rushes sideways, the stars
// stretching into streaks: the "woosh" that goes with the screen transition.
//
// Cheap on purpose: the sky and nebulae are painted once (per resize) into a
// backdrop that is just blitted each frame, stars are drawn in runs of one
// colour, streaks are one path per layer and colour, and the halos are
// pre-drawn sprites. The canvas is capped at ~4MP, so a large or HiDPI full
// screen doesn't multiply the cost.

// Where the scene's pan starts (the blanket slides in from the left).
const START_PAN_X = 3.5;
const LAYERS = [
  // count, size range (px), alpha range, parallax (share of the blanket's pan)
  { count: 520, size: [0.6, 1.1], alpha: [0.22, 0.55], parallax: 0.05 },
  { count: 260, size: [0.9, 1.6], alpha: [0.4, 0.8], parallax: 0.11 },
  { count: 70, size: [1.4, 2.4], alpha: [0.65, 1], parallax: 0.22 },
];
const WOOSH_SECONDS = 1.9;
const WOOSH_SPEED = 7;
const EXIT_SECONDS = 0.7;
const NEBULAE = [
  { x: 0.22, y: 0.28, r: 0.55, color: "74, 84, 190", alpha: 0.1, parallax: 0.02 },
  { x: 0.78, y: 0.7, r: 0.6, color: "120, 70, 170", alpha: 0.085, parallax: 0.03 },
  { x: 0.55, y: 0.1, r: 0.45, color: "40, 120, 170", alpha: 0.06, parallax: 0.015 },
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function mod(value, size) {
  return ((value % size) + size) % size;
}

const TINTS = ["255, 226, 190", "190, 210, 255", "232, 238, 255"];
const MAX_SKY_PIXELS = 4_200_000;
const NEBULA_PARALLAX = 0.02;
const HALO_SIZE = 28;

function makeStars() {
  return LAYERS.map((layer) => Array.from({ length: layer.count }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: layer.size[0] + Math.random() * (layer.size[1] - layer.size[0]),
    alpha: layer.alpha[0] + Math.random() * (layer.alpha[1] - layer.alpha[0]),
    phase: Math.random() * Math.PI * 2,
    rate: 0.6 + Math.random() * 1.6,
    tint: Math.random() < 0.18 ? 0 : Math.random() < 0.3 ? 1 : 2,
  }))
    // Grouped by colour so a layer is drawn with three fillStyle changes.
    .sort((a, b) => a.tint - b.tint));
}

function getSkyDpr(width, height) {
  const wanted = isLiteGraphics() ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  const budget = Math.sqrt(MAX_SKY_PIXELS / Math.max(1, width * height));
  return Math.max(0.75, Math.min(wanted, budget));
}

// The deep-night gradient and the nebula glows, painted once. Tiles
// seamlessly side to side (each glow is drawn at both edges too), so the
// frame loop slides it with two drawImage calls.
function paintBackdrop(width, height, dpr) {
  const backdrop = document.createElement("canvas");
  backdrop.width = Math.max(1, Math.round(width * dpr));
  backdrop.height = Math.max(1, Math.round(height * dpr));
  const ctx = backdrop.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#04050b");
  sky.addColorStop(0.6, "#070914");
  sky.addColorStop(1, "#0b0f1f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  NEBULAE.forEach((nebula) => {
    const radius = nebula.r * Math.max(width, height);
    const cy = nebula.y * height;
    [-width, 0, width].forEach((shift) => {
      const cx = nebula.x * width + shift;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      glow.addColorStop(0, `rgba(${nebula.color}, ${nebula.alpha})`);
      glow.addColorStop(1, `rgba(${nebula.color}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    });
  });

  return backdrop;
}

// A soft halo per star colour, drawn with globalAlpha for its pulse.
function paintHalos(dpr) {
  return TINTS.map((tint) => {
    const sprite = document.createElement("canvas");
    sprite.width = Math.ceil(HALO_SIZE * dpr);
    sprite.height = Math.ceil(HALO_SIZE * dpr);
    const ctx = sprite.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const half = HALO_SIZE / 2;
    const halo = ctx.createRadialGradient(half, half, 0, half, half, half);
    halo.addColorStop(0, `rgba(${tint}, 0.35)`);
    halo.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, HALO_SIZE, HALO_SIZE);
    return sprite;
  });
}

// `panRef.current` is { x, y } in screen heights (the blanket's pan);
// `modeRef.current` is { mode: "enter" | "idle" | "exit", since: ms }.
export default function ConstellationSky({ panRef, modeRef, reducedMotion }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) {
      return undefined;
    }

    const stars = makeStars();
    const tintStyles = TINTS.map((tint) => `rgb(${tint})`);
    // Mean size / alpha per layer, for the batched streaks.
    const layerMeans = stars.map((layerStars) => ({
      size: layerStars.reduce((sum, star) => sum + star.size, 0) / layerStars.length,
      alpha: layerStars.reduce((sum, star) => sum + star.alpha, 0) / layerStars.length,
    }));
    let dpr = 1;
    let backdrop = null;
    let halos = [];
    let width = 0;
    let height = 0;
    let rafId = 0;
    let last = performance.now();
    const start = last;
    // The sideways rush (screen heights) on top of the blanket's pan.
    let rush = 0;
    let lastPan = { ...(panRef?.current ?? { x: START_PAN_X, y: 0 }) };
    let velocityX = 0;
    let velocityY = 0;
    let shooting = null;
    let nextShot = last + 3500 + Math.random() * 5000;

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      dpr = getSkyDpr(width, height);
      backdrop = paintBackdrop(width, height, dpr);
      halos = paintHalos(dpr);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const mode = modeRef?.current ?? { mode: "idle", since: start };
      const pan = panRef?.current ?? lastPan;

      // The rush: fast at the start of the entry, fading out as the blanket
      // settles; the opposite way, building up, as the view closes.
      let rushSpeed = 0;

      if (mode.mode === "enter" && !reducedMotion) {
        const progress = clamp01((now - start) / 1000 / WOOSH_SECONDS);
        rushSpeed = WOOSH_SPEED * (1 - progress) ** 2;
      } else if (mode.mode === "exit" && !reducedMotion) {
        const progress = clamp01((now - mode.since) / 1000 / EXIT_SECONDS);
        rushSpeed = WOOSH_SPEED * 1.2 * progress * progress;
      }

      rush += rushSpeed * dt;

      // Screen-height units per second of the sky's own motion (the pan's
      // change plus the rush), to stretch the stars into streaks.
      const instantX = (-(pan.x - lastPan.x) + rushSpeed * dt) / dt;
      const instantY = (-(pan.y - lastPan.y)) / dt;
      velocityX += (instantX - velocityX) * Math.min(1, dt * 10);
      velocityY += (instantY - velocityY) * Math.min(1, dt * 10);
      lastPan = { x: pan.x, y: pan.y };

      const unit = height / 2;
      const drift = -pan.x + rush;

      // Sky and nebulae: the pre-painted backdrop, slid with the pan.
      const offset = mod(drift * NEBULA_PARALLAX * unit, width);
      ctx.drawImage(backdrop, offset - width, 0, width, height);
      ctx.drawImage(backdrop, offset, 0, width, height);

      const time = now / 1000;

      LAYERS.forEach((layer, layerIndex) => {
        const layerStars = stars[layerIndex];
        const shiftX = drift * layer.parallax * unit;
        const shiftY = pan.y * layer.parallax * unit;
        // The streak length only depends on the layer's parallax.
        const trailX = velocityX * layer.parallax * unit * 0.05;
        const trailY = velocityY * layer.parallax * unit * 0.05;

        if (Math.hypot(trailX, trailY) > 1.5) {
          // Moving fast: every star a streak behind it, along its motion,
          // one path per colour.
          ctx.globalAlpha = layerMeans[layerIndex].alpha * 0.85;
          ctx.lineWidth = layerMeans[layerIndex].size;
          let tint = -1;

          layerStars.forEach((star) => {
            if (star.tint !== tint) {
              if (tint !== -1) {
                ctx.stroke();
              }
              tint = star.tint;
              ctx.strokeStyle = tintStyles[tint];
              ctx.beginPath();
            }

            const x = mod(star.x * width + shiftX, width);
            const y = mod(star.y * height + shiftY, height);
            ctx.moveTo(x, y);
            ctx.lineTo(x - trailX, y - trailY);
          });

          if (tint !== -1) {
            ctx.stroke();
          }
          return;
        }

        let tint = -1;

        layerStars.forEach((star) => {
          if (star.tint !== tint) {
            tint = star.tint;
            ctx.fillStyle = tintStyles[tint];
          }

          ctx.globalAlpha = star.alpha * (0.7 + 0.3 * Math.sin(time * star.rate + star.phase));
          ctx.fillRect(mod(star.x * width + shiftX, width), mod(star.y * height + shiftY, height), star.size, star.size);
        });
      });

      // The brightest stars get a soft halo.
      stars[2].forEach((star, index) => {
        if (index % 3 !== 0) {
          return;
        }

        const x = mod(star.x * width + drift * LAYERS[2].parallax * unit, width);
        const y = mod(star.y * height + pan.y * LAYERS[2].parallax * unit, height);
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * star.rate * 0.8 + star.phase);
        ctx.drawImage(halos[star.tint], x - HALO_SIZE / 2, y - HALO_SIZE / 2, HALO_SIZE, HALO_SIZE);
      });
      ctx.globalAlpha = 1;

      // A shooting star now and then.
      if (!reducedMotion) {
        if (!shooting && now > nextShot && mode.mode === "idle") {
          const fromLeft = Math.random() < 0.5;
          shooting = {
            x: width * (0.15 + Math.random() * 0.7),
            y: height * (0.05 + Math.random() * 0.35),
            vx: (fromLeft ? 1 : -1) * (width * 0.55),
            vy: height * 0.32,
            life: 0,
          };
          nextShot = now + 7000 + Math.random() * 7000;
        }

        if (shooting) {
          shooting.life += dt;
          shooting.x += shooting.vx * dt;
          shooting.y += shooting.vy * dt;
          const fade = Math.sin(clamp01(shooting.life / 0.9) * Math.PI);
          const gradient = ctx.createLinearGradient(
            shooting.x,
            shooting.y,
            shooting.x - shooting.vx * 0.12,
            shooting.y - shooting.vy * 0.12,
          );
          gradient.addColorStop(0, `rgba(255, 255, 255, ${0.9 * fade})`);
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(shooting.x, shooting.y);
          ctx.lineTo(shooting.x - shooting.vx * 0.12, shooting.y - shooting.vy * 0.12);
          ctx.stroke();

          if (shooting.life > 0.9) {
            shooting = null;
          }
        }
      }

      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [panRef, modeRef, reducedMotion]);

  return <canvas ref={canvasRef} className="ap-const__sky" aria-hidden="true" />;
}
