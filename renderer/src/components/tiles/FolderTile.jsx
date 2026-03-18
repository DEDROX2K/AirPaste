import Card from "../Card";
import { formatCardSubtitle } from "../../lib/workspace";
import TileShell from "./TileShell";
import { useTileGesture } from "../../systems/interactions/useTileGesture";

function getPreviewLabel(tile) {
  if (!tile) {
    return "";
  }

  if (tile.type === "text") {
    return tile.text.trim().split(/\r?\n/).find(Boolean) ?? "Text note";
  }

  return tile.title?.trim() || formatCardSubtitle(tile);
}

export default function FolderTile({
  card,
  tileMeta,
  childTiles = [],
  folderState = null,
  expandedTileId,
  viewportZoom,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onOpenLink,
  onPressStart,
  onMediaLoad,
  onRequestTextNoteMagnify,
  onRetry,
  onTextChange,
  onToggleExpanded,
  onToggleFolderOpen,
}) {
  const previewTiles = childTiles.slice(0, 3);
  const folderCountLabel = `${card.childIds.length} ${card.childIds.length === 1 ? "tile" : "tiles"}`;
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isGroupingTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const surfaceGesture = useTileGesture({
    card,
    onActivate: () => onToggleFolderOpen?.(card.id),
    onDragStart: onBeginDrag,
    onPressStart,
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className={folderState ? "card--folder-open" : ""}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <div className="card__surface card__surface--canvas-folder">
            <div className="card__canvas-folder-stack" aria-hidden="true">
              {previewTiles.map((tile, index) => (
                <div
                  key={tile.id}
                  className={`card__canvas-folder-peek card__canvas-folder-peek--${index + 1}`}
                >
                  {tile.image ? (
                    <img
                      className="card__canvas-folder-peek-image"
                      src={tile.image}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <span className="card__canvas-folder-peek-label">{getPreviewLabel(tile).slice(0, 26)}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="card__canvas-folder-body">
              <div className="card__canvas-folder-tab" />
              <div className="card__canvas-folder-front">
                <div>
                  <p className="card__canvas-folder-kicker">Folder</p>
                  <h3 className="card__canvas-folder-title">{card.title || "Folder"}</h3>
                  <p className="card__canvas-folder-subtitle">{card.description || "Grouped tiles"}</p>
                </div>
                <p className="card__canvas-folder-count">{folderCountLabel}</p>
              </div>
            </div>
          </div>
        </div>

        {folderState ? (
          <div
            className={[
              "card__folder-zone",
              folderState.isGroupingTarget ? "card__folder-zone--target" : "",
              folderState.isGroupingArmed ? "card__folder-zone--armed" : "",
            ].filter(Boolean).join(" ")}
            style={folderState.zoneStyleVars}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="card__folder-zone-header">
              <div>
                <p className="card__folder-zone-kicker">Open folder</p>
                <h4 className="card__folder-zone-title">{card.title || "Folder"}</h4>
              </div>
              <button
                className="card__folder-zone-close"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleFolderOpen?.(card.id);
                }}
              >
                Close
              </button>
            </div>

            <div className="card__folder-zone-canvas">
              {folderState.childTiles.map((childTile) => (
                <Card
                  key={childTile.id}
                  card={childTile}
                  tileMeta={folderState.childTileMetaById[childTile.id]}
                  viewportZoom={viewportZoom}
                  isExpanded={expandedTileId === childTile.id}
                  onBeginDrag={onBeginDrag}
                  onContextMenu={onContextMenu}
                  onHoverChange={onHoverChange}
                  onFocusIn={onFocusIn}
                  onFocusOut={onFocusOut}
                  onOpenLink={onOpenLink}
                  onMediaLoad={onMediaLoad}
                  onPressStart={onPressStart}
                  onRequestTextNoteMagnify={onRequestTextNoteMagnify}
                  onRetry={onRetry}
                  onTextChange={onTextChange}
                  onToggleExpanded={onToggleExpanded}
                  onToggleFolderOpen={onToggleFolderOpen}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </TileShell>
  );
}
