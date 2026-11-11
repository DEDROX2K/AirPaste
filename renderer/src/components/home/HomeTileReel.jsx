import { useMemo } from "react";
import HomeTileCard from "./HomeTileCard";

// The strip along the top of Home: random tiles from your recent canvases
// drifting past in a slow loop (the track is drawn twice so the loop has no
// seam). Hovering holds it still; clicking a tile opens its canvas.
const REEL_SECONDS_PER_TILE = 4.5;

function tiltFor(key) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return ((Math.abs(hash) % 7) - 3) * 0.6;
}

export default function HomeTileReel({ entries, folderPath, onOpenEntry }) {
  const tilts = useMemo(() => entries.map((entry) => tiltFor(entry.key)), [entries]);

  if (entries.length < 3) {
    return null;
  }

  const renderTrack = (copy) => entries.map((entry, index) => (
    <HomeTileCard
      key={`${copy}-${entry.key}`}
      entry={entry}
      folderPath={folderPath}
      width={140}
      className="ap-home-reel__tile"
      style={{ "--ap-tilt": `${tilts[index]}deg` }}
      tabIndex={copy === "b" ? -1 : undefined}
      onClick={() => onOpenEntry(entry)}
    />
  ));

  return (
    <section className="ap-home-reel" aria-label="From your canvases">
      <div
        className="ap-home-reel__track"
        style={{ "--ap-reel-duration": `${entries.length * REEL_SECONDS_PER_TILE}s` }}
      >
        <div className="ap-home-reel__run">{renderTrack("a")}</div>
        <div className="ap-home-reel__run" aria-hidden="true">{renderTrack("b")}</div>
      </div>
    </section>
  );
}
