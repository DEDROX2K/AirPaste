import * as THREE from "three";

function randomBetween(min, max) {
  return min + (Math.random() * (max - min));
}

function randomUnitVectorWithEquatorBias(equatorBias = 0) {
  const u = Math.random();
  const v = Math.random();
  const theta = u * Math.PI * 2;

  let y = (v * 2) - 1;
  if (equatorBias > 0) {
    const strength = Math.min(0.98, Math.max(0, equatorBias));
    y *= (1 - strength);
  }

  const radial = Math.sqrt(Math.max(0, 1 - (y * y)));
  return {
    x: radial * Math.cos(theta),
    y,
    z: radial * Math.sin(theta),
  };
}

export function createStarFieldGeometry({
  count,
  minRadius,
  maxRadius,
  equatorBias = 0,
}) {
  const safeCount = Math.max(1, Math.round(count));
  const positions = new Float32Array(safeCount * 3);

  for (let index = 0; index < safeCount; index += 1) {
    const dir = randomUnitVectorWithEquatorBias(equatorBias);
    const distance = randomBetween(minRadius, maxRadius);
    const offset = index * 3;
    positions[offset] = dir.x * distance;
    positions[offset + 1] = dir.y * distance;
    positions[offset + 2] = dir.z * distance;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export const STAR_LAYER_MOTION = Object.freeze({
  far: {
    yawSpeed: 0.0025,
    pitchSpeed: -0.0012,
  },
  mid: {
    yawSpeed: -0.0068,
    pitchSpeed: 0.0031,
  },
  near: {
    yawSpeed: 0.015,
    pitchSpeed: -0.009,
  },
});

export function animateStarLayer(group, motion, deltaSeconds) {
  if (!group || !motion) {
    return;
  }

  group.rotation.y += motion.yawSpeed * deltaSeconds;
  group.rotation.x += motion.pitchSpeed * deltaSeconds;
}
