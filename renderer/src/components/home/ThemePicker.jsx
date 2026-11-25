import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_INTENSITY,
  INTENSITY_DETENTS,
  getTheme,
  setTheme,
  subscribeTheme,
  themeBaseCss,
} from "../../lib/appTheme";
import "./ThemePicker.css";

// Flower colour picker: 12 vivid outer petals, 6 pastel inner petals, a
// white centre for the default grey, and an arc slider for intensity.
// Petals gravitate toward the cursor; the slider has magnetic detents.

// Everything below is drawn at this scale (1 = the original 304px stage).
const S = 0.74;
const STAGE_W = Math.round(304 * S);
const STAGE_H = Math.round(260 * S);
const CX = 130 * S;
const CY = 130 * S;
const RING_R = 126 * S;
const ARC_R = 158 * S;
const ARC_SPAN = 40; // degrees either side of horizontal

const OUTER = Array.from({ length: 12 }, (_, i) => ({
  key: `v${i}`,
  hue: i * 30,
  tone: "vivid",
  size: 52 * S,
  r: 70 * S,
  angle: i * 30 - 90,
  color: `hsl(${i * 30} 88% 60%)`,
  label: `Hue ${i * 30}, vivid`,
}));

const INNER = Array.from({ length: 6 }, (_, i) => ({
  key: `p${i}`,
  hue: i * 60 + 15,
  tone: "pastel",
  size: 42 * S,
  r: 36 * S,
  angle: i * 60 + 15 - 90,
  color: `hsl(${i * 60 + 15} 80% 86%)`,
  label: `Hue ${i * 60 + 15}, pastel`,
}));

const CENTER = { key: "default", hue: null, tone: "vivid", size: 40 * S, r: 0, angle: 0, color: "#ffffff", label: "Default grey" };

const PETALS = [...OUTER, ...INNER, CENTER].map((petal) => {
  const rad = (petal.angle * Math.PI) / 180;
  return { ...petal, x: CX + Math.cos(rad) * petal.r, y: CY + Math.sin(rad) * petal.r };
});

const GRAVITY_RADIUS = 80 * S; // px: how far the pull reaches
const GRAVITY_PULL = 13 * S; // px: max drift toward the cursor
const HOVER_SCALE = 0.22;
const SPRING = 0.24;
const SNAP_RANGE = 0.05;

function petalMatches(petal, theme) {
  if (petal.hue == null) return theme.hue == null;
  return theme.hue === petal.hue && theme.tone === petal.tone;
}

function intensityToPoint(t) {
  const deg = -ARC_SPAN + t * ARC_SPAN * 2;
  const rad = (deg * Math.PI) / 180;
  return { x: CX + Math.cos(rad) * ARC_R, y: CY + Math.sin(rad) * ARC_R };
}

function arcPath() {
  const a = intensityToPoint(0);
  const b = intensityToPoint(1);
  return `M ${a.x} ${a.y} A ${ARC_R} ${ARC_R} 0 0 1 ${b.x} ${b.y}`;
}

function nearestDetent(t) {
  let best = INTENSITY_DETENTS[0];
  for (const detent of INTENSITY_DETENTS) {
    if (Math.abs(detent - t) < Math.abs(best - t)) best = detent;
  }
  return best;
}

function useAppTheme() {
  const [theme, setLocal] = useState(getTheme);
  useEffect(() => subscribeTheme(setLocal), []);
  return theme;
}

function Flower({ theme, onPick }) {
  const stageRef = useRef(null);
  const petalRefs = useRef([]);
  const state = useRef({
    pointer: null,
    frame: 0,
    live: PETALS.map(() => ({ dx: 0, dy: 0, s: 1 })),
  });

  const tick = useCallback(() => {
    const st = state.current;
    let moving = false;
    PETALS.forEach((petal, i) => {
      let tx = 0;
      let ty = 0;
      let ts = 1;
      if (st.pointer) {
        const vx = st.pointer.x - petal.x;
        const vy = st.pointer.y - petal.y;
        const dist = Math.hypot(vx, vy);
        const pull = Math.exp(-(dist * dist) / (2 * GRAVITY_RADIUS * GRAVITY_RADIUS * 0.6));
        const drift = Math.min(GRAVITY_PULL * pull, dist * 0.4);
        if (dist > 0.01) {
          tx = (vx / dist) * drift;
          ty = (vy / dist) * drift;
        }
        ts = 1 + HOVER_SCALE * Math.exp(-(dist * dist) / (2 * (petal.size * 0.45) ** 2));
      }
      const live = st.live[i];
      live.dx += (tx - live.dx) * SPRING;
      live.dy += (ty - live.dy) * SPRING;
      live.s += (ts - live.s) * SPRING;
      if (Math.abs(tx - live.dx) > 0.05 || Math.abs(ty - live.dy) > 0.05 || Math.abs(ts - live.s) > 0.002) {
        moving = true;
      }
      const el = petalRefs.current[i];
      if (el) {
        el.style.transform = `translate(${live.dx.toFixed(2)}px, ${live.dy.toFixed(2)}px) scale(${live.s.toFixed(3)})`;
        el.style.zIndex = live.s > 1.05 ? "3" : "";
      }
    });
    st.frame = moving || st.pointer ? requestAnimationFrame(tick) : 0;
  }, []);

  const kick = useCallback(() => {
    if (!state.current.frame) state.current.frame = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => () => cancelAnimationFrame(state.current.frame), []);

  const onPointerMove = (event) => {
    const rect = stageRef.current.getBoundingClientRect();
    state.current.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    kick();
  };

  const onPointerLeave = () => {
    state.current.pointer = null;
    kick();
  };

  return (
    <div
      ref={stageRef}
      className="ap-theme-flower"
      style={{ width: CX * 2, height: CY * 2, clipPath: `circle(${RING_R}px at ${CX}px ${CY}px)` }}
      role="radiogroup"
      aria-label="Theme colour"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {PETALS.map((petal, i) => {
        const selected = petalMatches(petal, theme);
        return (
          <div
            key={petal.key}
            className="ap-theme-petal-slot"
            style={{ left: petal.x, top: petal.y, width: petal.size, height: petal.size }}
          >
            <div
              ref={(el) => { petalRefs.current[i] = el; }}
              role="radio"
              aria-checked={selected}
              aria-label={petal.label}
              title={petal.hue == null ? "Default grey" : undefined}
              tabIndex={selected ? 0 : -1}
              className={`ap-theme-petal${petal.hue == null ? " ap-theme-petal--center" : ""}${selected ? " is-selected" : ""}`}
              style={{ "--petal": petal.color }}
              onClick={() => onPick(petal)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPick(petal);
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function IntensityArc({ theme }) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const lastDetent = useRef(null);
  const t = theme.intensity;
  const thumb = intensityToPoint(t);
  const hue = theme.hue;
  const top = hue == null ? "hsl(0 0% 90%)" : `hsl(${hue} 60% 86%)`;
  const mid = hue == null ? "hsl(0 0% 60%)" : `hsl(${hue} 85% 50%)`;
  const bottom = hue == null ? "hsl(0 0% 18%)" : `hsl(${hue} 100% 18%)`;

  const update = (next, persist) => {
    const detent = nearestDetent(next);
    const snapped = Math.abs(detent - next) <= SNAP_RANGE ? detent : next;
    if (Math.abs(detent - next) <= SNAP_RANGE && lastDetent.current !== detent) {
      lastDetent.current = detent;
      setPopKey((k) => k + 1);
    } else if (Math.abs(detent - next) > SNAP_RANGE) {
      lastDetent.current = null;
    }
    setTheme({ ...getTheme(), intensity: Math.round(snapped * 1000) / 1000 }, { persist });
  };

  const fromEvent = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left - CX;
    const y = event.clientY - rect.top - CY;
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return Math.min(1, Math.max(0, (deg + ARC_SPAN) / (ARC_SPAN * 2)));
  };

  const onPointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    update(fromEvent(event), false);
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    update(fromEvent(event), false);
  };

  const onPointerUp = (event) => {
    if (!dragging) return;
    setDragging(false);
    // Release snaps to a detent when close, so levels feel stepped.
    const raw = fromEvent(event);
    const detent = nearestDetent(raw);
    update(Math.abs(detent - raw) <= SNAP_RANGE * 1.6 ? detent : raw, true);
  };

  const onKeyDown = (event) => {
    const index = INTENSITY_DETENTS.indexOf(nearestDetent(t));
    let next = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = INTENSITY_DETENTS[Math.min(INTENSITY_DETENTS.length - 1, index + 1)];
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = INTENSITY_DETENTS[Math.max(0, index - 1)];
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = 1;
    if (next == null) return;
    event.preventDefault();
    lastDetent.current = null;
    update(next, true);
  };

  return (
    <svg
      ref={svgRef}
      className={`ap-theme-arc${dragging ? " is-dragging" : ""}`}
      width={STAGE_W}
      height={STAGE_H}
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
    >
      <defs>
        <linearGradient id="ap-theme-arc-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={top} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={bottom} />
        </linearGradient>
      </defs>
      <g
        className="ap-theme-arc__hit"
        role="slider"
        tabIndex={0}
        aria-label="Colour intensity"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(t * 100)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => update(DEFAULT_INTENSITY, true)}
      >
        <path d={arcPath()} className="ap-theme-arc__shadow" />
        <path d={arcPath()} className="ap-theme-arc__track" stroke="url(#ap-theme-arc-grad)" />
        <path d={arcPath()} className="ap-theme-arc__grab" />
        {INTENSITY_DETENTS.map((detent) => {
          const p = intensityToPoint(detent);
          return <circle key={detent} cx={p.x} cy={p.y} r={1.8} className={`ap-theme-arc__tick${Math.abs(detent - t) < 0.001 ? " is-on" : ""}`} />;
        })}
        <g className="ap-theme-arc__thumb-pos" style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}>
          <g key={popKey} className="ap-theme-arc__thumb">
            <circle r={9} className="ap-theme-arc__thumb-ring" />
            <circle r={5} className="ap-theme-arc__thumb-fill" style={{ fill: themeBaseCss(theme) }} />
          </g>
        </g>
      </g>
    </svg>
  );
}

export function ThemePickerPopover({ anchorRef, open, onClose, placement = "right" }) {
  const theme = useAppTheme();
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const rect = anchorRef.current.getBoundingClientRect();
      const width = STAGE_W + 20;
      const height = STAGE_H + 20;
      // "below": hangs under the anchor, its left edge on the anchor's (the
      // top bar's theme chip); "right": beside it, bottoms aligned.
      const left = placement === "below"
        ? Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))
        : Math.min(window.innerWidth - width - 8, rect.right + 12);
      const top = placement === "below"
        ? Math.min(window.innerHeight - height - 8, rect.bottom + 8)
        : Math.max(8, Math.min(window.innerHeight - height - 8, rect.bottom - height));
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef, placement]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (popRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  const pick = (petal) => {
    setTheme({ ...getTheme(), hue: petal.hue, tone: petal.tone });
  };

  return createPortal(
    <div
      ref={popRef}
      className="ap-theme-pop"
      role="dialog"
      aria-label="App theme"
      style={{ left: pos.left, top: pos.top, "--ap-theme-ring": themeBaseCss(theme) }}
    >
      <div className="ap-theme-stage" style={{ width: STAGE_W, height: STAGE_H }}>
        <div className="ap-theme-ring" style={{ left: CX - RING_R, top: CY - RING_R, width: RING_R * 2, height: RING_R * 2 }} />
        <Flower theme={theme} onPick={pick} />
        <IntensityArc theme={theme} />
      </div>
    </div>,
    document.body,
  );
}
