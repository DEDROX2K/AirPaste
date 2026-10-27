// The tether simulation: tiles linked pair by pair (like Obsidian's graph
// view) snap toward each other on springs, float for a couple of seconds,
// then calm down and stop completely. Untethered tiles only move when
// flicked: they keep their throw velocity and glide to a stop.
//
// Pure data + math, no DOM: useTetherSystem owns the loop and the drawing.
// Nodes are canvas tiles in world coordinates with x / y at the CENTRE.
//
//   node = { id, x, y, w, h, vx, vy, mode, asleep, t0, calm, restT, deg, ... }
//   mode = "rest"  (no tethers: flick and glide)
//        | "float" (at least one tether; "asleep" once settled)
//        | "held"  (being dragged)
//   link = { id, a: node, b: node }

export const PHYS = Object.freeze({
  GAP: 90,
  K: 22,
  C: 8,
  PAD: 22,
  REPULSE: 70,
  REPEL: 36,
  REPEL_R: 300,
  DAMP_AWAKE: 1.1,
  DAMP_SETTLED: 12,
  SETTLE_DELAY: 0.9,
  SETTLE_TIME: 1.6,
  SLEEP_SPEED: 6,
  SLEEP_TIME: 0.35,
  DAMP_REST: 9,
  CUT_IMPULSE: 60,
  THROW_MAX: 1000,
  STEP: 1 / 120,
  MAX_SUBSTEPS: 4,
});

export const NODE_MODE_REST = "rest";
export const NODE_MODE_FLOAT = "float";
export const NODE_MODE_HELD = "held";

export function createTetherWorld() {
  return {
    nodes: [],
    nodeById: new Map(),
    links: [],
    clock: 0,
  };
}

export function createNode(id, x, y, w, h) {
  return {
    id,
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    mode: NODE_MODE_REST,
    asleep: false,
    t0: 0,
    calm: 1,
    restT: 0,
    deg: 0,
    // Render-only state (see getNodeVisual).
    rot: 0,
    lift: 0,
    phi: Math.random() * Math.PI * 2,
  };
}

// Distance from a node's centre to its outline along the unit vector
// (ux, uy). Used ONLY for spacing, never for drawing lines. Tiles are
// spaced by their box for now; a tile with another shape can carry its own
// `reach` function.
export function reach(node, ux, uy) {
  if (typeof node.reach === "function") {
    return node.reach(ux, uy);
  }

  const tx = Math.abs(ux) < 1e-6 ? Infinity : (node.w / 2) / Math.abs(ux);
  const ty = Math.abs(uy) < 1e-6 ? Infinity : (node.h / 2) / Math.abs(uy);
  return Math.min(tx, ty);
}

export function findLink(world, a, b) {
  return world.links.find((link) => (
    (link.a === a && link.b === b) || (link.a === b && link.b === a)
  )) ?? null;
}

// The connected component of the link graph that `node` belongs to.
export function getComponent(world, node) {
  const seen = new Set([node]);
  const queue = [node];

  while (queue.length > 0) {
    const current = queue.pop();

    world.links.forEach((link) => {
      const other = link.a === current ? link.b : link.b === current ? link.a : null;

      if (other && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    });
  }

  return [...seen];
}

// A disturbance (tether made or cut, tile picked up or dropped, a bump)
// wakes the node's whole group and restarts its settle clock.
export function disturb(world, node) {
  getComponent(world, node).forEach((member) => {
    member.t0 = world.clock;
    member.asleep = false;
    member.restT = 0;
    member.calm = 0;
  });
}

export function recountDegrees(world) {
  world.nodes.forEach((node) => {
    node.deg = 0;
  });
  world.links.forEach((link) => {
    link.a.deg += 1;
    link.b.deg += 1;
  });
}

// A new tether: both tiles (and their whole group) wake up and float.
export function attachLink(world, link) {
  world.links.push(link);
  link.a.deg += 1;
  link.b.deg += 1;
  [link.a, link.b].forEach((node) => {
    if (node.mode !== NODE_MODE_HELD) {
      node.mode = NODE_MODE_FLOAT;
    }
  });
  disturb(world, link.a);
}

// A cut: the line goes, a tile left with no tethers gets a tiny nudge away
// from the other one and slides a few px with the untethered damping.
// Nothing falls; tiles stay where they are.
export function detachLink(world, link) {
  const index = world.links.indexOf(link);

  if (index < 0) {
    return false;
  }

  world.links.splice(index, 1);
  const dx = link.b.x - link.a.x;
  const dy = link.b.y - link.a.y;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;

  [[link.a, -1], [link.b, 1]].forEach(([node, sign]) => {
    node.deg = Math.max(0, node.deg - 1);

    if (node.mode !== NODE_MODE_HELD) {
      node.vx += sign * ux * PHYS.CUT_IMPULSE;
      node.vy += sign * uy * PHYS.CUT_IMPULSE;

      if (node.deg === 0) {
        node.mode = NODE_MODE_REST;
        node.asleep = false;
      }
    }
  });
  disturb(world, link.a);
  disturb(world, link.b);
  return true;
}

// Throw velocity from the last few drag samples ({ t ms, x, y }), clamped
// to THROW_MAX. A release that comes after a pause (> 80ms) throws nothing.
export function getThrowVelocity(samples, now) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return { vx: 0, vy: 0 };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];

  if (now - last.t >= 80) {
    return { vx: 0, vy: 0 };
  }

  const dt = Math.max(0.016, (last.t - first.t) / 1000);
  let vx = (last.x - first.x) / dt;
  let vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);

  if (speed > PHYS.THROW_MAX) {
    vx *= PHYS.THROW_MAX / speed;
    vy *= PHYS.THROW_MAX / speed;
  }

  return { vx, vy };
}

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function isFloating(node) {
  return node.mode === NODE_MODE_FLOAT;
}

// Soft box collisions: overlap on both axes -> push apart along the axis
// of least overlap. Rest and held tiles are immovable obstacles. An awake
// tile bumping a sleeping one wakes that one's group.
function collide(world, a, b) {
  const movableA = isFloating(a);
  const movableB = isFloating(b);

  if (!movableA && !movableB) {
    return;
  }

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const overlapX = (a.w + b.w) / 2 + PHYS.PAD - Math.abs(dx);
  const overlapY = (a.h + b.h) / 2 + PHYS.PAD - Math.abs(dy);

  if (overlapX <= 0 || overlapY <= 0) {
    return;
  }

  if (movableA && movableB && a.asleep !== b.asleep) {
    disturb(world, a.asleep ? a : b);
  }

  let nx = 0;
  let ny = 0;
  let penetration;

  if (overlapX < overlapY) {
    nx = dx >= 0 ? 1 : -1;
    penetration = overlapX;
  } else {
    ny = dy >= 0 ? 1 : -1;
    penetration = overlapY;
  }

  const shareA = movableA && movableB ? 0.5 : movableA ? 1 : 0;
  const shareB = movableA && movableB ? 0.5 : movableB ? 1 : 0;
  const acceleration = PHYS.REPULSE * penetration;

  if (movableA) {
    a.ax -= nx * acceleration;
    a.ay -= ny * acceleration;
    a.x -= nx * penetration * 0.25 * shareA;
    a.y -= ny * penetration * 0.25 * shareA;
  }

  if (movableB) {
    b.ax += nx * acceleration;
    b.ay += ny * acceleration;
    b.x += nx * penetration * 0.25 * shareB;
    b.y += ny * penetration * 0.25 * shareB;
  }
}

// Weak short-range push between floating tiles (keeps the clump tight but
// not overlapping); rest and held tiles act as obstacles.
function repel(a, b) {
  const floatingA = isFloating(a);
  const floatingB = isFloating(b);

  if (!floatingA && !floatingB) {
    return;
  }

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 0.001;

  if (distance >= PHYS.REPEL_R) {
    return;
  }

  const force = PHYS.REPEL * (1 - distance / PHYS.REPEL_R);
  const ux = dx / distance;
  const uy = dy / distance;

  if (floatingA) {
    a.ax -= force * ux;
    a.ay -= force * uy;
  }

  if (floatingB) {
    b.ax += force * ux;
    b.ay += force * uy;
  }
}

export function getLinkRestLength(link) {
  const dx = link.b.x - link.a.x;
  const dy = link.b.y - link.a.y;
  const distance = Math.hypot(dx, dy) || 0.001;
  const ux = dx / distance;
  const uy = dy / distance;
  return { distance, rest: reach(link.a, ux, uy) + reach(link.b, ux, uy) + PHYS.GAP };
}

// One fixed step (semi-implicit Euler). Ported as-is from the reference.
export function step(world, dt) {
  const { nodes, links } = world;
  world.clock += dt;
  const time = world.clock;

  nodes.forEach((node) => {
    node.ax = 0;
    node.ay = 0;
  });

  // Springs: rest length = both reaches + GAP.
  links.forEach((link) => {
    const { a, b } = link;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 0.001;
    const ux = dx / distance;
    const uy = dy / distance;
    const rest = reach(a, ux, uy) + reach(b, ux, uy) + PHYS.GAP;
    const relativeSpeed = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
    const force = PHYS.K * (distance - rest) + PHYS.C * relativeSpeed;
    a.ax += force * ux;
    a.ay += force * uy;
    b.ax -= force * ux;
    b.ay -= force * uy;
    link.stretch = (distance - rest) / rest;
  });

  // Collisions + repulsion. Only pairs with an awake floating tile can
  // change anything, so the outer loop skips everything else (a big board
  // is mostly resting tiles).
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    const aActive = isFloating(a) && !a.asleep;

    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];

      if (!aActive && !(isFloating(b) && !b.asleep)) {
        continue;
      }

      collide(world, a, b);
      repel(a, b);
    }
  }

  nodes.forEach((node) => {
    if (node.mode === NODE_MODE_HELD) {
      return;
    }

    let damping;

    if (node.mode === NODE_MODE_FLOAT) {
      if (node.asleep) {
        return;
      }

      node.calm = smoothstep((time - node.t0 - PHYS.SETTLE_DELAY) / PHYS.SETTLE_TIME);
      damping = PHYS.DAMP_AWAKE + (PHYS.DAMP_SETTLED - PHYS.DAMP_AWAKE) * node.calm * node.calm;
      node.vx += node.ax * dt;
      node.vy += node.ay * dt;
    } else {
      if (node.vx === 0 && node.vy === 0) {
        return;
      }

      damping = PHYS.DAMP_REST;
    }

    const decay = Math.exp(-damping * dt);
    node.vx *= decay;
    node.vy *= decay;
    node.x += node.vx * dt;
    node.y += node.vy * dt;

    const speed = Math.hypot(node.vx, node.vy);

    if (node.mode === NODE_MODE_FLOAT) {
      if (node.calm > 0.5 && speed < PHYS.SLEEP_SPEED) {
        node.restT += dt;

        if (node.restT > PHYS.SLEEP_TIME) {
          node.asleep = true;
          node.vx = 0;
          node.vy = 0;
          node.calm = 1;
        }
      } else {
        node.restT = 0;
      }
    } else if (speed < 4) {
      node.vx = 0;
      node.vy = 0;
    }
  });
}

// Advances by real time `dtReal` (seconds) scaled by `timeScale`, in fixed
// sub-steps. `accumulator` carries the remainder between frames.
export function advance(world, dtReal, timeScale, accumulator) {
  let remaining = accumulator + dtReal * timeScale;
  let steps = 0;

  while (remaining >= PHYS.STEP && steps < PHYS.MAX_SUBSTEPS) {
    step(world, PHYS.STEP);
    remaining -= PHYS.STEP;
    steps += 1;
  }

  return steps === PHYS.MAX_SUBSTEPS ? 0 : remaining;
}

export function isNodeMoving(node) {
  if (node.mode === NODE_MODE_HELD) {
    return true;
  }

  if (node.mode === NODE_MODE_FLOAT) {
    return !node.asleep;
  }

  return node.vx !== 0 || node.vy !== 0;
}

export function isWorldMoving(world) {
  return world.nodes.some(isNodeMoving);
}

// How a node looks this frame (eased toward its target, so call once per
// rendered frame with the real frame time).
//  - Awake floating tiles lift (-6px, 1.03), bob 3px and tilt with their
//    sideways speed (0.025 deg per px/s, max 7); it all fades out as the
//    group calms down, and the tile lands flat.
//  - A flicked untethered tile is a sheet of paper: a slight lean into the
//    throw (max 4 deg) and a hair of lift that both fall away as it slows.
// Reduced motion: no bob and no tilt.
export function getNodeVisual(node, dtReal, time, reduceMotion) {
  const awake = node.mode === NODE_MODE_FLOAT && !node.asleep;
  const gliding = node.mode === NODE_MODE_REST && (node.vx !== 0 || node.vy !== 0);
  const speed = Math.hypot(node.vx, node.vy);
  let liftTarget = 0;
  let rotTarget = 0;
  let bob = 0;

  if (awake) {
    liftTarget = 1 - node.calm;
    rotTarget = Math.max(-7, Math.min(7, node.vx * 0.025)) * (1 - node.calm);
    bob = Math.sin(time * 1.3 + node.phi) * 3 * (1 - node.calm);
  } else if (gliding) {
    liftTarget = Math.min(1, speed / 500) * 0.6;
    rotTarget = Math.max(-4, Math.min(4, node.vx * 0.012));
  }

  if (reduceMotion) {
    rotTarget = 0;
    bob = 0;
  }

  const frameTime = Number.isFinite(dtReal) ? dtReal : 0.016;
  const ease = Math.min(1, frameTime * 8);
  node.rot += (rotTarget - node.rot) * ease;
  node.lift += (liftTarget - node.lift) * Math.min(1, frameTime * 10);

  if (Math.abs(node.rot) < 0.01 && rotTarget === 0) {
    node.rot = 0;
  }

  if (node.lift < 0.004 && liftTarget === 0) {
    node.lift = 0;
  }

  return {
    rise: node.lift * -6 + bob * node.lift,
    rot: node.rot,
    scale: 1 + node.lift * 0.03,
    lift: node.lift,
  };
}
