import TileShell from "./TileShell";
import { useTileGesture } from "../../systems/interactions/useTileGesture";

function resolveRackAssetPath(relativePath) {
  return `${import.meta.env.BASE_URL}${relativePath}`;
}

function formatRackCount(tileCount) {
  return `${tileCount} ${tileCount === 1 ? "tile" : "tiles"}`;
}

export default function RackTile({
  card,
  tileMeta,
  childTiles = [],
  rackState = null,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
}) {
  const slotCount = Math.max(
    3,
    rackState?.slotCount ?? 0,
    childTiles.length,
    Number.isFinite(rackState?.slotPreviewIndex) ? rackState.slotPreviewIndex + 1 : 0,
  );
  const tileCount = childTiles.length;
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isRackDropTarget ? "card__surface-frame--rack-drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const rackGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      toolbar={(
        <div className="card__toolbar" {...rackGesture}>
          <p className="card__label">{card.title || "Rack"}</p>
        </div>
      )}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...rackGesture}>
          <div
            className={`card__surface card__surface--rack${tileMeta?.isRackDropTarget ? " card__surface--rack-target" : ""}`}
            aria-label={`${card.title || "Rack"} with ${formatRackCount(tileCount)}`}
          >
            <div className="card__rack-copy">
              <p className="card__rack-kicker">Mounted rack</p>
              <div className="card__rack-meta">
                <h3 className="card__rack-title">{card.title || "Rack"}</h3>
                <p className="card__rack-count">{formatRackCount(tileCount)}</p>
              </div>
            </div>

            <div className="card__rack-slot-strip" aria-hidden="true">
              {Array.from({ length: slotCount }).map((_, index) => (
                <span
                  key={`${card.id}-slot-${index}`}
                  className={[
                    "card__rack-slot",
                    index < tileCount ? "card__rack-slot--occupied" : "",
                    rackState?.slotPreviewIndex === index ? "card__rack-slot--preview" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
            </div>

            <div className="card__rack-wood" aria-hidden="true">
              <img
                className="card__rack-slice card__rack-slice--left"
                src={resolveRackAssetPath("rack/rack-left.svg")}
                alt=""
                draggable={false}
              />
              <div className="card__rack-slice-center">
                <img
                  className="card__rack-slice card__rack-slice--center"
                  src={resolveRackAssetPath("rack/rack-center.svg")}
                  alt=""
                  draggable={false}
                />
              </div>
              <img
                className="card__rack-slice card__rack-slice--right"
                src={resolveRackAssetPath("rack/rack-right.svg")}
                alt=""
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
    </TileShell>
  );
}
