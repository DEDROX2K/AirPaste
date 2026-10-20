import { useCanvasDensityZones } from "../../systems/layout/useCanvasDensityZones";

// Renders the "thicker dots" halo for each dense tile cluster. Lives inside
// .canvas__content (same world-space coordinate system and pan/zoom
// transform as the tiles themselves), well below every tile's own z-index
// (see tileLayout.js getTileLayer -- the lowest a tile ever sits is 1).
export default function CanvasDensityZones({ tiles }) {
  const zones = useCanvasDensityZones(tiles);

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
