import { useMemo } from "react";

const PIXEL_SIZE = 44;

function pseudoRandom(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function PixelScreenTransition({
  active = false,
  transitionId = 0,
  origin = null,
  fromLabel = "screen",
  toLabel = "screen",
}) {
  const { tiles, columns, rows } = useMemo(() => {
    const viewportWidth = Math.max(window.innerWidth || 1, 1);
    const viewportHeight = Math.max(window.innerHeight || 1, 1);
    const columns = Math.ceil(viewportWidth / PIXEL_SIZE);
    const rows = Math.ceil(viewportHeight / PIXEL_SIZE);
    const normalizedOrigin = {
      x: clamp((origin?.x ?? viewportWidth / 2) / viewportWidth, 0, 1),
      y: clamp((origin?.y ?? viewportHeight / 2) / viewportHeight, 0, 1),
    };

    const nextTiles = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const centerX = (column + 0.5) / columns;
        const centerY = (row + 0.5) / rows;
        const distance = Math.hypot(centerX - normalizedOrigin.x, centerY - normalizedOrigin.y);
        const normalizedDistance = clamp(distance / 1.35, 0, 1);
        const jitter = pseudoRandom((transitionId + 1) * 1000 + row * columns + column);
        const delay = normalizedDistance * 320 + jitter * 90;
        const duration = 640 + jitter * 180;

        nextTiles.push({
          key: `${row}-${column}`,
          style: {
            "--pixel-delay": `${Math.round(delay)}ms`,
            "--pixel-duration": `${Math.round(duration)}ms`,
          },
        });
      }
    }

    return {
      tiles: nextTiles,
      columns,
      rows,
    };
  }, [origin?.x, origin?.y, transitionId]);

  return (
    <div
      className={`pixel-screen-transition${active ? " is-active" : ""}`}
      aria-hidden="true"
      data-from-view={fromLabel}
      data-to-view={toLabel}
    >
      <div className="pixel-screen-transition__scrim" />
      <div
        className="pixel-screen-transition__grid"
        style={{
          gridTemplateColumns: `repeat(${columns}, ${PIXEL_SIZE}px)`,
          gridTemplateRows: `repeat(${rows}, ${PIXEL_SIZE}px)`,
        }}
      >
        {tiles.map((tile) => (
          <span key={tile.key} className="pixel-screen-transition__tile" style={tile.style} />
        ))}
      </div>
      <div className="pixel-screen-transition__scanlines" />
    </div>
  );
}
