export const DEFAULT_IDLE_ROTATION = Object.freeze({
  delayMs: 1100,
  fadeInPerSecond: 1.6,
  speedRadPerSecond: 0.028,
});

export function createIdleRotationState(now = performance.now()) {
  return {
    isInteracting: false,
    lastInteractionAt: now,
    blend: 0,
  };
}

export function markIdleInteractionStart(state, now = performance.now()) {
  if (!state) return;
  state.isInteracting = true;
  state.lastInteractionAt = now;
}

export function markIdleInteractionEnd(state, now = performance.now()) {
  if (!state) return;
  state.isInteracting = false;
  state.lastInteractionAt = now;
}

export function touchIdleInteraction(state, now = performance.now()) {
  if (!state) return;
  state.lastInteractionAt = now;
}

export function applyIdleAutoRotation({
  state,
  targetView,
  deltaSeconds,
  now = performance.now(),
  config = DEFAULT_IDLE_ROTATION,
}) {
  if (!state || !targetView) {
    return 0;
  }

  const idleElapsed = Math.max(0, now - state.lastInteractionAt);
  const shouldAutoRotate = !state.isInteracting && idleElapsed >= config.delayMs;
  const targetBlend = shouldAutoRotate ? 1 : 0;
  const blendFactor = 1 - Math.exp(-Math.max(0.001, config.fadeInPerSecond) * Math.max(0, deltaSeconds));

  state.blend += (targetBlend - state.blend) * blendFactor;

  if (state.blend > 1e-4) {
    targetView.yaw += config.speedRadPerSecond * state.blend * Math.max(0, deltaSeconds);
  }

  return state.blend;
}
