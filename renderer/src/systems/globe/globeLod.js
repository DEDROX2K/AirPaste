import { clamp } from "./globeLayout";
import { smoothstep } from "./globeCamera";

export function getGlobeLodState(cameraDistance, minimumDistance, maximumDistance) {
  const span = Math.max(1, maximumDistance - minimumDistance);
  const farRatio = clamp((cameraDistance - minimumDistance) / span, 0, 1);
  const nearRatio = 1 - farRatio;

  const farBlend = smoothstep(0.38, 0.92, farRatio);
  const closeBlend = smoothstep(0.5, 0.98, nearRatio);
  const midBlend = Math.min(1, smoothstep(0.14, 0.5, nearRatio) * smoothstep(0.16, 0.62, farRatio));

  let tier = "mid";

  if (farRatio > 0.64) {
    tier = "far";
  } else if (nearRatio > 0.72) {
    tier = "close";
  }

  return {
    tier,
    farRatio,
    nearRatio,
    farBlend,
    midBlend,
    closeBlend,
  };
}

export function getMaxReadableTilesForLod(lod) {
  if (lod.tier === "far") {
    return 40;
  }

  if (lod.tier === "close") {
    return 260;
  }

  return 140;
}
