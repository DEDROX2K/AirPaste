import { useMemo } from "react";

function getTileCenter(tile) {
  return {
    x: (tile?.x ?? 0) + (tile?.width ?? 0) / 2,
    y: (tile?.y ?? 0) + (tile?.height ?? 0) / 2,
  };
}

// The "strings" for tethered tiles: a hub-and-spoke bundle of soft curved
// lines from each member's center to the group's shared centroid, like a
// handful of balloons on one knot. Lives inside .canvas__content (same
// world-space coordinates and pan/zoom transform as the tiles), one small
// SVG per group sized to its own bounding box rather than one giant SVG
// covering the whole canvas.
//
// dragVisualDelta/draggingTileIdSet are the same live-drag offset the tiles
// themselves render with (see TileShell's --tile-drag-x/y) -- without
// folding that into each member's center here too, the string stays pinned
// to the tile's pre-drag position and only catches up once the drag
// commits, which reads as "not really tethered" while dragging.
export default function CanvasTetherLines({ tethers, tiles, dragVisualDelta, draggingTileIdSet }) {
  const groups = useMemo(() => {
    if (!Array.isArray(tethers) || tethers.length === 0) {
      return [];
    }

    const tileById = Object.fromEntries((Array.isArray(tiles) ? tiles : []).map((tile) => [tile.id, tile]));

    return tethers
      .map((tether) => {
        const members = tether.tileIds
          .map((tileId) => tileById[tileId])
          .filter(Boolean)
          .map((tile) => {
            const center = getTileCenter(tile);
            const isDragging = dragVisualDelta && draggingTileIdSet?.has?.(tile.id);
            return {
              tile,
              center: isDragging
                ? { x: center.x + dragVisualDelta.x, y: center.y + dragVisualDelta.y }
                : center,
            };
          });

        if (members.length < 2) {
          return null;
        }

        const hub = members.reduce(
          (acc, member) => ({
            x: acc.x + member.center.x / members.length,
            y: acc.y + member.center.y / members.length,
          }),
          { x: 0, y: 0 },
        );

        const PADDING = 32;
        const minX = Math.min(hub.x, ...members.map((member) => member.center.x)) - PADDING;
        const minY = Math.min(hub.y, ...members.map((member) => member.center.y)) - PADDING;
        const maxX = Math.max(hub.x, ...members.map((member) => member.center.x)) + PADDING;
        const maxY = Math.max(hub.y, ...members.map((member) => member.center.y)) + PADDING;

        return {
          id: tether.id,
          left: minX,
          top: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          hub: { x: hub.x - minX, y: hub.y - minY },
          spokes: members.map((member) => ({
            tileId: member.tile.id,
            x: member.center.x - minX,
            y: member.center.y - minY,
          })),
        };
      })
      .filter(Boolean);
  }, [tethers, tiles, dragVisualDelta, draggingTileIdSet]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="canvas__tether-lines" aria-hidden="true">
      {groups.map((group) => (
        <svg
          key={group.id}
          className="canvas__tether-svg"
          style={{ left: `${group.left}px`, top: `${group.top}px` }}
          width={group.width}
          height={group.height}
          viewBox={`0 0 ${group.width} ${group.height}`}
        >
          <defs>
            <radialGradient id={`tether-knot-${group.id}`} cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="rgba(80, 80, 86, 0.95)" />
              <stop offset="55%" stopColor="rgba(40, 40, 44, 0.9)" />
              <stop offset="100%" stopColor="rgba(20, 20, 22, 0.85)" />
            </radialGradient>
          </defs>
          {group.spokes.map((spoke) => {
            const midX = (spoke.x + group.hub.x) / 2;
            const midY = (spoke.y + group.hub.y) / 2 - 10;
            const path = `M ${spoke.x} ${spoke.y} Q ${midX} ${midY} ${group.hub.x} ${group.hub.y}`;
            return (
              <g key={spoke.tileId} className="canvas__tether-spoke">
                <path className="canvas__tether-string canvas__tether-string--shadow" d={path} fill="none" />
                <path className="canvas__tether-string" d={path} fill="none" />
                <path className="canvas__tether-string canvas__tether-string--sheen" d={path} fill="none" />
                <circle className="canvas__tether-anchor" cx={spoke.x} cy={spoke.y} r="3.2" />
              </g>
            );
          })}
          <circle className="canvas__tether-knot-halo" cx={group.hub.x} cy={group.hub.y} r="10" />
          <circle
            className="canvas__tether-knot"
            cx={group.hub.x}
            cy={group.hub.y}
            r="5.5"
            fill={`url(#tether-knot-${group.id})`}
          />
        </svg>
      ))}
    </div>
  );
}
