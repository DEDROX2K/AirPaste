// Visual-only "weight" for canvas tiles, layered on top of the real drag.
// Nothing here moves a tile's saved position; it only produces a small extra
// transform (and a few px of offset) per tile, so the drag itself stays glued
// to the cursor. Pure math, no DOM: useTileFeel owns the loop and the writes.
//
// Everything is deliberately subtle. The numbers in FEEL are the tuning knobs.
//
//  held tile (being dragged):
//    - lift: eases up in scale and rises a couple of px;
//    - perspective tilt: the grabbed corner comes toward you, and the leading
//      edge leans into the motion;
//    - stretch: a hair of squash-and-stretch along the drag direction;
//    - roll: a fraction of a degree with sideways speed.
//  released: every channel springs back underdamped, so scale and rotation
//    overshoot and settle; scale also takes a small dip on landing.
//  group (several tiles held): non-anchor tiles trail the pointer by a few px
//    on springs of slightly different stiffness, so the group ripples.
//  neighbours: tiles near the dragged ones are pushed a few px away and spring
//    back.

export const FEEL = Object.freeze({
  LIFT_SCALE: 0.018,
  LIFT_RISE: 2.5,
  TILT_GRAB_DEG: 1.3,
  TILT_MOVE_DEG: 1.5,
  ROLL_DEG: 1.0,
  STRETCH: 0.014,
  SPEED_REF: 1400,
  K: 340,
  C: 19,
  LAND_DIP: 0.55,
  PERSPECTIVE: 900,
  NUDGE_PX: 4,
  NUDGE_RANGE: 220,
  NUDGE_K: 210,
  NUDGE_C: 17,
  GROUP_LAG_S: 0.024,
  GROUP_MAX_PX: 7,
  GROUP_K: 260,
  GROUP_C: 18,
  REST_EPS: 0.0004,
  REST_VEL: 0.02,
});

function spring() {
  return { x: 0, v: 0 };
}

export function createFeel(id) {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  return {
    id,
    held: false,
    lift: spring(),
    rx: spring(),
    ry: spring(),
    rot: spring(),
    stretch: spring(),
    ox: spring(),
    oy: spring(),
    angle: 0,
    // 0..1, stable per tile: spreads stiffness and trail across a group.
    variance: (hash % 1000) / 1000,
  };
}

function stepSpring(state, target, stiffness, damping, dt) {
  state.v += (stiffness * (target - state.x) - damping * state.v) * dt;
  state.x += state.v * dt;
}

function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

// One frame. `dt` in seconds (small steps only, the caller clamps it).
// input: {
//   held, vx, vy      pointer velocity in SCREEN px/s (held tiles),
//   grabX, grabY      grab point relative to the tile centre, -1..1,
//   trail             true for the non-anchor tiles of a multi-tile drag,
//   pushX, pushY      neighbour push target in px (tiles that are not held)
// }
export function stepFeel(feel, input, dt) {
  const wasHeld = feel.held;
  feel.held = Boolean(input.held);

  if (wasHeld && !feel.held) {
    // Landing: a small dip on top of the spring back to 1.
    feel.lift.v -= FEEL.LAND_DIP;
  }

  const speed = Math.hypot(input.vx ?? 0, input.vy ?? 0);
  const vxn = clamp((input.vx ?? 0) / FEEL.SPEED_REF, 1);
  const vyn = clamp((input.vy ?? 0) / FEEL.SPEED_REF, 1);
  const speedN = Math.min(1, speed / FEEL.SPEED_REF);
  const stiffness = FEEL.K * (0.9 + feel.variance * 0.2);

  if (feel.held && speed > 60) {
    feel.angle = Math.atan2(input.vy, input.vx);
  }

  const liftTarget = feel.held ? 1 : 0;
  const ryTarget = feel.held
    ? -(input.grabX ?? 0) * FEEL.TILT_GRAB_DEG - vxn * FEEL.TILT_MOVE_DEG
    : 0;
  const rxTarget = feel.held
    ? (input.grabY ?? 0) * FEEL.TILT_GRAB_DEG + vyn * FEEL.TILT_MOVE_DEG
    : 0;
  const rotTarget = feel.held ? vxn * FEEL.ROLL_DEG : 0;
  const stretchTarget = feel.held ? speedN * FEEL.STRETCH : 0;

  stepSpring(feel.lift, liftTarget, stiffness, FEEL.C, dt);
  stepSpring(feel.ry, ryTarget, stiffness, FEEL.C, dt);
  stepSpring(feel.rx, rxTarget, stiffness, FEEL.C, dt);
  stepSpring(feel.rot, rotTarget, stiffness, FEEL.C, dt);
  stepSpring(feel.stretch, stretchTarget, stiffness, FEEL.C, dt);

  let offsetTargetX = 0;
  let offsetTargetY = 0;
  let offsetK = FEEL.NUDGE_K;
  let offsetC = FEEL.NUDGE_C;

  if (feel.held && input.trail) {
    // The pointer's velocity, lagged by a per-tile amount: the farther a tile
    // trails, the more it ripples when the group stops.
    const lag = FEEL.GROUP_LAG_S * (0.4 + feel.variance * 0.9);
    const limit = FEEL.GROUP_MAX_PX;
    const scale = Math.min(1, limit / Math.max(1, speed * lag));
    offsetTargetX = -(input.vx ?? 0) * lag * scale;
    offsetTargetY = -(input.vy ?? 0) * lag * scale;
    offsetK = FEEL.GROUP_K * (0.85 + feel.variance * 0.3);
    offsetC = FEEL.GROUP_C;
  } else if (!feel.held) {
    offsetTargetX = input.pushX ?? 0;
    offsetTargetY = input.pushY ?? 0;
  }

  stepSpring(feel.ox, offsetTargetX, offsetK, offsetC, dt);
  stepSpring(feel.oy, offsetTargetY, offsetK, offsetC, dt);
}

export function isFeelAtRest(feel) {
  if (feel.held) {
    return false;
  }

  return ["lift", "rx", "ry", "rot", "stretch", "ox", "oy"].every((key) => (
    Math.abs(feel[key].x) < (key === "ox" || key === "oy" ? 0.02 : FEEL.REST_EPS * (key === "rx" || key === "ry" || key === "rot" ? 10 : 1))
    && Math.abs(feel[key].v) < FEEL.REST_VEL * (key === "ox" || key === "oy" ? 20 : 1)
  ));
}

// The CSS the card consumes: --feel-x / --feel-y (px offset, in the card's
// own translate) and --feel-transform (perspective tilt, stretch along the
// drag direction, lift scale and roll).
export function getFeelStyle(feel) {
  const lift = feel.lift.x;
  const scale = 1 + lift * FEEL.LIFT_SCALE;
  const stretch = feel.stretch.x;
  const angleDeg = (feel.angle * 180) / Math.PI;
  const parts = [`perspective(${FEEL.PERSPECTIVE}px)`];

  if (Math.abs(feel.rx.x) > 0.001 || Math.abs(feel.ry.x) > 0.001) {
    parts.push(`rotateX(${feel.rx.x.toFixed(3)}deg)`, `rotateY(${feel.ry.x.toFixed(3)}deg)`);
  }

  if (Math.abs(feel.rot.x) > 0.001) {
    parts.push(`rotate(${feel.rot.x.toFixed(3)}deg)`);
  }

  parts.push(`scale(${scale.toFixed(4)})`);

  if (stretch > 0.0003) {
    parts.push(
      `rotate(${angleDeg.toFixed(1)}deg)`,
      `scale(${(1 + stretch).toFixed(4)}, ${(1 - stretch * 0.6).toFixed(4)})`,
      `rotate(${(-angleDeg).toFixed(1)}deg)`,
    );
  }

  return {
    x: `${feel.ox.x.toFixed(2)}px`,
    y: `${(feel.oy.x - lift * FEEL.LIFT_RISE).toFixed(2)}px`,
    transform: parts.join(" "),
  };
}

// Neighbour push for a tile at `rect` ({ cx, cy, w, h }) away from the held
// rects: up to NUDGE_PX, fading to nothing at NUDGE_RANGE (world px) of gap.
// Returns { x, y } in px (0, 0 when out of range).
export function getNeighbourPush(rect, heldRects, range = FEEL.NUDGE_RANGE) {
  let pushX = 0;
  let pushY = 0;

  for (const held of heldRects) {
    const dx = rect.cx - held.cx;
    const dy = rect.cy - held.cy;
    const gapX = Math.max(0, Math.abs(dx) - (rect.w + held.w) / 2);
    const gapY = Math.max(0, Math.abs(dy) - (rect.h + held.h) / 2);
    const gap = Math.hypot(gapX, gapY);

    if (gap >= range) {
      continue;
    }

    const distance = Math.hypot(dx, dy) || 1;
    const strength = (1 - gap / range) ** 2 * FEEL.NUDGE_PX;
    pushX += (dx / distance) * strength;
    pushY += (dy / distance) * strength;
  }

  const magnitude = Math.hypot(pushX, pushY);

  if (magnitude > FEEL.NUDGE_PX) {
    pushX *= FEEL.NUDGE_PX / magnitude;
    pushY *= FEEL.NUDGE_PX / magnitude;
  }

  return { x: pushX, y: pushY };
}
