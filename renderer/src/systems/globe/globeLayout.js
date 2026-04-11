const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const MIN_GLOBE_RADIUS = 760;
export const MAX_GLOBE_RADIUS = 2200;
export const MIN_CAMERA_DISTANCE = 1320;
export const MAX_CAMERA_DISTANCE = 5200;
export const MAX_GLOBE_PITCH = Math.PI * 0.48;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAngle(angle) {
  const turn = Math.PI * 2;

  if (!Number.isFinite(angle)) {
    return 0;
  }

  let nextAngle = angle % turn;

  if (nextAngle <= -Math.PI) {
    nextAngle += turn;
  }

  if (nextAngle > Math.PI) {
    nextAngle -= turn;
  }

  return nextAngle;
}

export function clampGlobePitch(pitch) {
  return clamp(pitch, -MAX_GLOBE_PITCH, MAX_GLOBE_PITCH);
}

export function getSoftGlobeRadius(tileCount) {
  const safeTileCount = Math.max(0, Number.isFinite(tileCount) ? tileCount : 0);

  // A sqrt curve keeps dense boards readable without exploding radius linearly.
  return clamp(
    Math.round(MIN_GLOBE_RADIUS + (Math.sqrt(safeTileCount) * 118)),
    MIN_GLOBE_RADIUS,
    MAX_GLOBE_RADIUS,
  );
}

export function getDefaultCameraDistance(radius) {
  const safeRadius = Math.max(MIN_GLOBE_RADIUS, Number.isFinite(radius) ? radius : MIN_GLOBE_RADIUS);

  return clamp(
    Math.round((safeRadius * 2.45) + 180),
    Math.max(MIN_CAMERA_DISTANCE, safeRadius + 360),
    MAX_CAMERA_DISTANCE,
  );
}

export function getDefaultWorkspaceView(tileCount = 0) {
  const globeRadius = getSoftGlobeRadius(tileCount);

  return {
    mode: "flat",
    globeRadius,
    yaw: 0,
    pitch: 0,
    cameraDistance: getDefaultCameraDistance(globeRadius),
    focusedTileId: null,
  };
}

export function getFibonacciSphereAngles(index, total) {
  const safeTotal = Math.max(1, Number.isFinite(total) ? Math.round(total) : 1);
  const safeIndex = clamp(Math.round(index), 0, safeTotal - 1);
  const offsetIndex = safeIndex + 0.5;
  const y = 1 - ((offsetIndex / safeTotal) * 2);
  const radialDistance = Math.sqrt(Math.max(0, 1 - (y * y)));
  const azimuth = normalizeAngle(offsetIndex * GOLDEN_ANGLE);
  const x = Math.cos(azimuth) * radialDistance;
  const z = Math.sin(azimuth) * radialDistance;

  return {
    theta: normalizeAngle(Math.atan2(z, x)),
    phi: Math.acos(clamp(y, -1, 1)),
  };
}

export function createGlobeLayoutPatch(cards) {
  const safeCards = Array.isArray(cards) ? cards : [];

  // Existing globe coordinates stay stable; only legacy/missing tiles get seeded.
  return Object.fromEntries(
    safeCards
      .map((card, index) => {
        const globe = card?.layout?.globe;

        if (Number.isFinite(globe?.theta) && Number.isFinite(globe?.phi)) {
          return null;
        }

        return [
          card.id,
          {
            layout: {
              ...(card?.layout ?? {}),
              globe: getFibonacciSphereAngles(index, safeCards.length),
            },
          },
        ];
      })
      .filter(Boolean),
  );
}

export function sphericalToCartesian(radius, theta, phi) {
  const safeRadius = Number.isFinite(radius) ? radius : MIN_GLOBE_RADIUS;
  const sinPhi = Math.sin(phi);

  return {
    x: safeRadius * sinPhi * Math.cos(theta),
    y: safeRadius * Math.cos(phi),
    z: safeRadius * sinPhi * Math.sin(theta),
  };
}

export function getFocusAnglesForGlobePoint(point) {
  const x = Number.isFinite(point?.x) ? point.x : 0;
  const y = Number.isFinite(point?.y) ? point.y : 0;
  const z = Number.isFinite(point?.z) ? point.z : 1;
  const yaw = normalizeAngle(-Math.atan2(x, z));
  const horizontalDistance = Math.sqrt((x * x) + (z * z));
  const pitch = clampGlobePitch(Math.atan2(y, Math.max(0.0001, horizontalDistance)));

  return { yaw, pitch };
}
