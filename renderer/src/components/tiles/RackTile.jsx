import { memo } from "react";
import TileShell from "./TileShell";
import { useTileGesture } from "../../systems/interactions/useTileGesture";

function formatRackCount(tileCount) {
  return `${tileCount} ${tileCount === 1 ? "tile" : "tiles"}`;
}

function RackTile({
  card,
  tileMeta,
  rackState = null,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
}) {
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
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...rackGesture}>
          <div
            className={`card__surface card__surface--rack${tileMeta?.isRackDropTarget ? " card__surface--rack-target" : ""}`}
            aria-label={`${card.title || "Rack"} with ${formatRackCount(card.tileIds?.length ?? 0)}`}
          >
            <div className="card__rack-slot-strip" aria-hidden="true">
              {Array.from({ length: Math.max(3, rackState?.slotCount ?? 0) }).map((_, index) => (
                <span
                  key={`${card.id}-slot-${index}`}
                  className={[
                    "card__rack-slot",
                    index < (card.tileIds?.length ?? 0) ? "card__rack-slot--occupied" : "",
                    rackState?.slotPreviewIndex === index ? "card__rack-slot--preview" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
            </div>
            <div className="card__rack-rect" aria-hidden="true" />
          </div>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(RackTile);
