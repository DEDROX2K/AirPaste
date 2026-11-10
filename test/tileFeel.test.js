import { describe, expect, it } from "vitest";
import {
  FEEL,
  createFeel,
  getFeelStyle,
  getNeighbourPush,
  isFeelAtRest,
  stepFeel,
} from "../renderer/src/systems/feel/tileFeelPhysics";

function run(feel, input, seconds, dt = 1 / 120) {
  for (let t = 0; t < seconds; t += dt) {
    stepFeel(feel, input, dt);
  }
}

describe("tile feel", () => {
  it("lifts and tilts toward the grabbed corner while held, subtly", () => {
    const feel = createFeel("a");
    run(feel, { held: true, vx: 0, vy: 0, grabX: -1, grabY: -1 }, 1);

    expect(feel.lift.x).toBeCloseTo(1, 1);
    // Top-left grabbed: left edge toward the viewer (rotateY > 0), top edge too (rotateX < 0).
    expect(feel.ry.x).toBeGreaterThan(0);
    expect(feel.rx.x).toBeLessThan(0);
    expect(Math.abs(feel.ry.x)).toBeLessThanOrEqual(FEEL.TILT_GRAB_DEG + 0.01);
  });

  it("stretches along the drag direction and rolls with speed, within limits", () => {
    const feel = createFeel("a");
    run(feel, { held: true, vx: 3000, vy: 0, grabX: 0, grabY: 0 }, 1);

    expect(feel.stretch.x).toBeGreaterThan(0);
    expect(feel.stretch.x).toBeLessThanOrEqual(FEEL.STRETCH + 0.001);
    expect(feel.rot.x).toBeLessThanOrEqual(FEEL.ROLL_DEG + 0.01);
  });

  it("overshoots and settles to rest after release", () => {
    const feel = createFeel("a");
    run(feel, { held: true, vx: 800, vy: 0, grabX: 0.5, grabY: 0 }, 0.6);
    const minLift = { value: Infinity };
    let crossedRot = false;
    const startSign = Math.sign(feel.rot.x);

    for (let t = 0; t < 2; t += 1 / 120) {
      stepFeel(feel, { held: false, vx: 0, vy: 0 }, 1 / 120);
      minLift.value = Math.min(minLift.value, feel.lift.x);
      crossedRot ||= Math.sign(feel.rot.x) === -startSign;
    }

    // Lift dips below 0 (scale under 1) on the way home, then rests.
    expect(minLift.value).toBeLessThan(0);
    expect(crossedRot).toBe(true);
    expect(isFeelAtRest(feel)).toBe(true);
  });

  it("trails the pointer only for non-anchor tiles of a group", () => {
    const anchor = createFeel("anchor");
    const follower = createFeel("follower");
    run(anchor, { held: true, vx: 1000, vy: 0, grabX: 0, grabY: 0, trail: false }, 0.5);
    run(follower, { held: true, vx: 1000, vy: 0, grabX: 0, grabY: 0, trail: true }, 0.5);

    expect(anchor.ox.x).toBeCloseTo(0, 3);
    expect(follower.ox.x).toBeLessThan(-1);
    expect(Math.abs(follower.ox.x)).toBeLessThanOrEqual(FEEL.GROUP_MAX_PX + 0.5);
  });

  it("pushes neighbours away, fading with distance", () => {
    const held = [{ cx: 0, cy: 0, w: 100, h: 100 }];
    const near = getNeighbourPush({ cx: 180, cy: 0, w: 100, h: 100 }, held);
    const far = getNeighbourPush({ cx: 500, cy: 0, w: 100, h: 100 }, held);

    expect(near.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThanOrEqual(FEEL.NUDGE_PX);
    expect(far).toEqual({ x: 0, y: 0 });
  });

  it("writes a neutral-looking style when at rest", () => {
    const style = getFeelStyle(createFeel("a"));
    expect(style.x).toBe("0.00px");
    expect(style.transform).toContain("scale(1.0000)");
  });
});
