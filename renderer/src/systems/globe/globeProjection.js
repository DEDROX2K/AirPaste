import * as THREE from "three";

const CAMERA_POSITION = new THREE.Vector3();
const PROJECT_VECTOR = new THREE.Vector3();

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - (2 * t));
}

export function rotatePointByYawPitch(point, yaw, pitch) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const x1 = (point.x * cosYaw) + (point.z * sinYaw);
  const z1 = (-point.x * sinYaw) + (point.z * cosYaw);
  const y2 = (point.y * cosPitch) - (z1 * sinPitch);
  const z2 = (point.y * sinPitch) + (z1 * cosPitch);

  return {
    x: x1,
    y: y2,
    z: z2,
  };
}

export function getTileVisibility(worldPoint, cameraDistance) {
  const radius = Math.max(1, Math.sqrt(
    (worldPoint.x * worldPoint.x)
    + (worldPoint.y * worldPoint.y)
    + (worldPoint.z * worldPoint.z),
  ));
  const normalX = worldPoint.x / radius;
  const normalY = worldPoint.y / radius;
  const normalZ = worldPoint.z / radius;

  CAMERA_POSITION.set(0, 0, cameraDistance);
  const toCameraX = CAMERA_POSITION.x - worldPoint.x;
  const toCameraY = CAMERA_POSITION.y - worldPoint.y;
  const toCameraZ = CAMERA_POSITION.z - worldPoint.z;
  const toCameraLength = Math.max(0.0001, Math.sqrt(
    (toCameraX * toCameraX)
    + (toCameraY * toCameraY)
    + (toCameraZ * toCameraZ),
  ));

  const facing = (
    (normalX * (toCameraX / toCameraLength))
    + (normalY * (toCameraY / toCameraLength))
    + (normalZ * (toCameraZ / toCameraLength))
  );
  const hemisphere = worldPoint.z / radius;
  const silhouetteFade = smoothstep(-0.1, 0.42, facing);
  const backsideFade = smoothstep(-0.28, 0.2, hemisphere);
  const opacity = silhouetteFade * backsideFade;

  return {
    facing,
    hemisphere,
    silhouetteFade,
    backsideFade,
    opacity,
    isVisible: opacity > 0.025,
  };
}

export function projectWorldPoint(worldPoint, camera, width, height) {
  PROJECT_VECTOR.set(worldPoint.x, worldPoint.y, worldPoint.z).project(camera);

  return {
    x: ((PROJECT_VECTOR.x + 1) * 0.5) * width,
    y: ((1 - PROJECT_VECTOR.y) * 0.5) * height,
    depth: PROJECT_VECTOR.z,
  };
}
