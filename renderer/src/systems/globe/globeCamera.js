export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - (2 * t));
}

export function createOrbitInertia() {
  return {
    yawVelocity: 0,
    pitchVelocity: 0,
  };
}

export function applyOrbitInertia(targetView, inertia, deltaSeconds, damping = 7.8) {
  const decay = Math.exp(-damping * deltaSeconds);

  targetView.yaw += inertia.yawVelocity * deltaSeconds;
  targetView.pitch += inertia.pitchVelocity * deltaSeconds;

  inertia.yawVelocity *= decay;
  inertia.pitchVelocity *= decay;
}

export function addOrbitImpulse(inertia, deltaYaw, deltaPitch, deltaSeconds) {
  const safeDelta = Math.max(1 / 240, Number.isFinite(deltaSeconds) ? deltaSeconds : 1 / 120);
  const impulseWeight = Math.min(1, safeDelta * 32);

  inertia.yawVelocity = ((1 - impulseWeight) * inertia.yawVelocity) + ((deltaYaw / safeDelta) * impulseWeight);
  inertia.pitchVelocity = ((1 - impulseWeight) * inertia.pitchVelocity) + ((deltaPitch / safeDelta) * impulseWeight);
}

export function dampMotionState(current, target, deltaSeconds) {
  const rotationSmooth = 1 - Math.exp(-7.2 * deltaSeconds);
  const zoomSmooth = 1 - Math.exp(-5.4 * deltaSeconds);

  current.yaw += (target.yaw - current.yaw) * rotationSmooth;
  current.pitch += (target.pitch - current.pitch) * rotationSmooth;
  current.cameraDistance += (target.cameraDistance - current.cameraDistance) * zoomSmooth;

  return current;
}

export function getCinematicFocusDistance(radius, minimumDistance, maximumDistance) {
  const desired = (radius * 1.96) + 150;
  return Math.min(maximumDistance, Math.max(minimumDistance, desired));
}
