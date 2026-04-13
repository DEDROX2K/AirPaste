const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const MIN_GLOBE_RADIUS = 760;
export const MAX_GLOBE_RADIUS = 2200;
export const MIN_CAMERA_DISTANCE = 1320;
export const MAX_CAMERA_DISTANCE = 5200;
export const MAX_GLOBE_PITCH = Math.PI * 0.48;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashStringToUnit(value) {
  const text = String(value ?? "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 10000) / 10000;
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

function getHostnameFromUrl(url) {
  if (typeof url !== "string" || url.length < 4) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function getCardGlobeRegionKey(card) {
  const typeKey = typeof card?.type === "string" ? card.type : "tile";
  const hostname = getHostnameFromUrl(card?.url);

  if (hostname) {
    const pieces = hostname.split(".");

    if (pieces.length >= 2) {
      return `${typeKey}:${pieces.slice(-2).join(".")}`;
    }

    return `${typeKey}:${hostname}`;
  }

  const tag = typeof card?.tag === "string" ? card.tag.toLowerCase() : "";
  const title = typeof card?.title === "string" ? card.title.trim().toLowerCase() : "";

  if (tag) {
    return `${typeKey}:${tag}`;
  }

  if (title) {
    return `${typeKey}:${title.slice(0, 16)}`;
  }

  return `${typeKey}:general`;
}

function normalizedToSpherical(point) {
  return {
    theta: normalizeAngle(Math.atan2(point.z, point.x)),
    phi: Math.acos(clamp(point.y, -1, 1)),
  };
}

function sphericalToUnit(theta, phi) {
  const sinPhi = Math.sin(phi);

  return {
    x: sinPhi * Math.cos(theta),
    y: Math.cos(phi),
    z: sinPhi * Math.sin(theta),
  };
}

function normalizeVector(vector) {
  const length = Math.max(1e-6, Math.sqrt((vector.x * vector.x) + (vector.y * vector.y) + (vector.z * vector.z)));

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function cross(a, b) {
  return {
    x: (a.y * b.z) - (a.z * b.y),
    y: (a.z * b.x) - (a.x * b.z),
    z: (a.x * b.y) - (a.y * b.x),
  };
}

function scale(vector, scalar) {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

function add(a, b) {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

export function getRegionalClusteredAngles(cards) {
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];

  if (safeCards.length <= 1) {
    return new Map(safeCards.map((card, index) => [card.id, {
      ...getFibonacciSphereAngles(index, safeCards.length || 1),
      region: getCardGlobeRegionKey(card),
    }]));
  }

  const groups = new Map();

  safeCards.forEach((card) => {
    const key = getCardGlobeRegionKey(card);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(card);
  });

  const sortedGroupKeys = [...groups.keys()].sort();
  const groupCenters = new Map(
    sortedGroupKeys.map((key, index) => [key, getFibonacciSphereAngles(index, sortedGroupKeys.length)]),
  );

  const result = new Map();

  sortedGroupKeys.forEach((key) => {
    const cardsInGroup = [...(groups.get(key) ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const centerAngles = groupCenters.get(key);
    const centerNormal = sphericalToUnit(centerAngles.theta, centerAngles.phi);
    const tangentSeed = Math.abs(centerNormal.y) > 0.92
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 1, z: 0 };
    const tangent = normalizeVector(cross(tangentSeed, centerNormal));
    const bitangent = normalizeVector(cross(centerNormal, tangent));
    const groupSpread = clamp(0.13 + (Math.sqrt(cardsInGroup.length) * 0.018), 0.1, 0.42);

    cardsInGroup.forEach((card, index) => {
      const localCount = Math.max(1, cardsInGroup.length);
      const radial = groupSpread * Math.sqrt((index + 0.45) / localCount);
      const jitter = hashStringToUnit(card.id) * Math.PI * 2;
      const localAngle = (index * GOLDEN_ANGLE) + jitter;

      const localOffset = add(
        scale(tangent, Math.cos(localAngle) * radial),
        scale(bitangent, Math.sin(localAngle) * radial),
      );
      const biased = normalizeVector(add(centerNormal, localOffset));

      result.set(card.id, {
        ...normalizedToSpherical(biased),
        region: key,
      });
    });
  });

  return result;
}

export function buildRegionalClusters(cards) {
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  const groups = new Map();

  safeCards.forEach((card) => {
    const key = card?.layout?.globe?.region ?? getCardGlobeRegionKey(card);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(card);
  });

  return [...groups.entries()].map(([key, clusterCards], index) => {
    const normals = clusterCards
      .map((card) => card?.layout?.globe)
      .filter((globe) => Number.isFinite(globe?.theta) && Number.isFinite(globe?.phi))
      .map((globe) => sphericalToUnit(globe.theta, globe.phi));

    let centerNormal;

    if (normals.length === 0) {
      const fallbackAngles = getFibonacciSphereAngles(index, Math.max(1, groups.size));
      centerNormal = sphericalToUnit(fallbackAngles.theta, fallbackAngles.phi);
    } else {
      const summed = normals.reduce((acc, normal) => ({
        x: acc.x + normal.x,
        y: acc.y + normal.y,
        z: acc.z + normal.z,
      }), { x: 0, y: 0, z: 0 });

      centerNormal = normalizeVector(summed);
    }

    const centerAngles = normalizedToSpherical(centerNormal);

    return {
      id: `cluster:${key}`,
      key,
      count: clusterCards.length,
      theta: centerAngles.theta,
      phi: centerAngles.phi,
      sampleTileIds: clusterCards.slice(0, 4).map((card) => card.id),
    };
  });
}

export function createGlobeLayoutPatch(cards) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const clusteredAngles = getRegionalClusteredAngles(safeCards);

  return Object.fromEntries(
    safeCards
      .map((card) => {
        const globe = card?.layout?.globe;

        if (Number.isFinite(globe?.theta) && Number.isFinite(globe?.phi)) {
          return null;
        }

        const seeded = clusteredAngles.get(card.id) ?? getFibonacciSphereAngles(0, 1);

        return [
          card.id,
          {
            layout: {
              ...(card?.layout ?? {}),
              globe: {
                theta: seeded.theta,
                phi: seeded.phi,
                region: seeded.region,
              },
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
