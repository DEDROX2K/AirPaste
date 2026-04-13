import * as THREE from "three";
import { sphericalToCartesian } from "./globeLayout";

function createLatitudeLoopPoints(radius, latitude, segmentCount = 180) {
  const points = [];

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const theta = t * Math.PI * 2;
    const point = sphericalToCartesian(radius, theta, latitude);
    points.push(new THREE.Vector3(point.x, point.y, point.z));
  }

  return points;
}

export function createBandTubeGeometry({
  radius,
  latitude,
  tubeRadius,
  pathSegments = 180,
  radialSegments = 10,
}) {
  const points = createLatitudeLoopPoints(radius, latitude, pathSegments);
  const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);

  return new THREE.TubeGeometry(
    curve,
    pathSegments,
    Math.max(0.6, tubeRadius),
    Math.max(6, radialSegments),
    true,
  );
}

export function createGuideRingGeometry(radius, latitude, segmentCount = 160) {
  return new THREE.BufferGeometry().setFromPoints(createLatitudeLoopPoints(radius, latitude, segmentCount));
}

export const BAND_MOTION = Object.freeze({
  primary: {
    yawSpeed: 0.013,
    pitchSpeed: 0.003,
  },
  secondary: {
    yawSpeed: -0.009,
    pitchSpeed: -0.002,
  },
  guide: {
    yawSpeed: 0.004,
    pitchSpeed: 0,
  },
});

export function animateBandGroup(group, motion, deltaSeconds) {
  if (!group || !motion) {
    return;
  }

  group.rotation.y += motion.yawSpeed * deltaSeconds;
  group.rotation.x += motion.pitchSpeed * deltaSeconds;
}
