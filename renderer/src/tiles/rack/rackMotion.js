// Rack motion: the spring model every rack animation uses, plus two small
// runtime stores that carry motion across the boundary between a canvas
// tile and a racked one. Nothing here is saved; only rack membership and
// order are (tileIds / rackIndex). Rules: docs/rules/rack-rules.md.

// Final tuning from the prototype: every response is multiplied by this
// (the "speed" slider at 130 -> 100/130), damping is used as written.
export const RACK_SPRING_SPEED = 100 / 130;

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Apple-style spring: response (s) and damping fraction. mass 1,
// stiffness (2pi/response)^2, damping 4pi*fraction/response.
export class Spring {
  constructor(value, response = 0.4, damping = 0.85) {
    this.v = value;
    this.t = value;
    this.vel = 0;
    this.response = response;
    this.damping = damping;
  }

  set(target, response, damping) {
    this.t = target;
    if (response) this.response = response;
    if (damping != null) this.damping = damping;
  }

  snap(value) {
    this.v = value;
    this.t = value;
    this.vel = 0;
  }

  step(dt, reduced = false) {
    if (reduced) {
      this.v = this.t;
      this.vel = 0;
      return;
    }

    const response = this.response * RACK_SPRING_SPEED;
    const damping = Math.min(1.3, this.damping);
    const stiffness = (2 * Math.PI / response) ** 2;
    const friction = 4 * Math.PI * damping / response;
    this.vel += ((-stiffness * (this.v - this.t)) - (friction * this.vel)) * dt;
    this.v += this.vel * dt;
  }

  isAtRest(epsilon = 0.01) {
    return Math.abs(this.v - this.t) < epsilon && Math.abs(this.vel) < epsilon * 10;
  }
}

export function isRackReducedMotion() {
  return prefersReducedMotion();
}

/* ---------- dock hints: canvas tile -> racked tile ---------- */

// Written by the drop (useCanvasInteractionSystem) just before a tile goes
// into a rack: where it was on screen (world px, its visual top-left and
// width after any approach scale) and how fast it was moving. The rack picks
// it up when the racked tile first renders and flies it in from there.
const DOCK_HINT_TTL_MS = 1200;
const dockHints = new Map();

export function setRackDockHint(tileId, hint) {
  dockHints.set(tileId, { ...hint, at: Date.now() });
}

export function takeRackDockHint(tileId) {
  const hint = dockHints.get(tileId);
  dockHints.delete(tileId);
  return hint && Date.now() - hint.at < DOCK_HINT_TTL_MS ? hint : null;
}

/* ---------- approach: how a dragged canvas tile is drawn near a rack ---------- */

// tileId -> { scale, grabX, grabY, instant }. grabX/Y is the grab point
// from the tile's centre (world px), so the tile shrinks around the exact
// point under the pointer. TileShell subscribes while its tile is dragged.
const approach = new Map();
const approachListeners = new Map();

export function setRackApproach(tileId, value) {
  const previous = approach.get(tileId);

  if (
    previous
    && value
    && previous.scale === value.scale
    && previous.grabX === value.grabX
    && previous.grabY === value.grabY
    && !value.instant
  ) {
    return;
  }

  if (value) {
    approach.set(tileId, value);
  } else if (previous) {
    approach.delete(tileId);
  } else {
    return;
  }

  approachListeners.get(tileId)?.forEach((listener) => listener(value ?? null));
}

export function getRackApproach(tileId) {
  return approach.get(tileId) ?? null;
}

export function subscribeRackApproach(tileId, listener) {
  let set = approachListeners.get(tileId);

  if (!set) {
    set = new Set();
    approachListeners.set(tileId, set);
  }

  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0 && approachListeners.get(tileId) === set) {
      approachListeners.delete(tileId);
    }
  };
}
