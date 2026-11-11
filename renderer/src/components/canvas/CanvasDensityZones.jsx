import { memo, useDeferredValue } from "react";
import { useCanvasDensityZones } from "../../systems/layout/useCanvasDensityZones";

// Renders the "thicker dots" halo for each dense tile cluster. Lives inside
// .canvas__content (same world-space coordinate system and pan/zoom
// transform as the tiles themselves), well below every tile's own z-index
// (see tileLayout.js getTileLayer -- the lowest a tile ever sits is 1).
// The halos are decoration and the clustering is O(n^2), so they follow the
// tiles one deferred render behind: a drop's commit keeps the old halos and
// React redraws them right after, off the frame the tile lands in.
function CanvasDensityZones({ tiles }) {
  const deferredTiles = useDeferredValue(tiles);
  const zones = useCanvasDensityZones(deferredTiles);

  if (zones.length === 0) {
    return null;
  }

  return (
    <div className="canvas__density-zones" aria-hidden="true">
      {zones.map((zone) => (
        <div
          key={zone.id}
          className="canvas__density-zone"
          style={{
            left: `${zone.x}px`,
            top: `${zone.y}px`,
            width: `${zone.radius * 2}px`,
            height: `${zone.radius * 2}px`,
            marginLeft: `${-zone.radius}px`,
            marginTop: `${-zone.radius}px`,
          }}
        />
      ))}
    </div>
  );
}

export default memo(CanvasDensityZones);
