// A cheap, deterministic string -> [0, 1) hash. Used to give each tethered
// tile its own stable-but-varied float animation phase (delay/drift) without
// storing anything extra -- the same tile id always lands on the same
// phase, so tiles don't visually "jump" between renders.
export function hashStringToUnitInterval(value) {
  const text = String(value ?? "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }

  return (hash >>> 0) / 0xffffffff;
}
