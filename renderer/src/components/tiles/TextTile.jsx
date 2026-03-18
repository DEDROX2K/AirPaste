import NoteSurface from "../notes/NoteSurface";
import { getTextNoteInteraction } from "../notes/noteInteraction";
import { formatNoteTimestamp, getTextNoteVariant } from "../notes/noteUtils";
import TileShell from "./TileShell";
import { useTileGesture } from "../../systems/interactions/useTileGesture";

export default function TextTile({
  card,
  tileMeta,
  viewportZoom,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  onBeginDrag,
  onRequestTextNoteMagnify,
  onTextChange,
}) {
  const noteVariant = getTextNoteVariant(card);
  const noteTimestamp = formatNoteTimestamp(card.updatedAt || card.createdAt);
  const textInteraction = getTextNoteInteraction(viewportZoom);
  const surfaceGesture = useTileGesture({
    card,
    canDrag: textInteraction.dragMode === "surface",
    onDoubleActivate: textInteraction.canMagnify ? () => onRequestTextNoteMagnify?.(card.id) : null,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const headerGesture = useTileGesture({
    card,
    canDrag: textInteraction.dragMode === "header",
    onDragStart: onBeginDrag,
    onPressStart,
  });

  const surfaceFrameClassName = [
    "card__surface-frame",
    textInteraction.dragMode === "surface" ? "card__surface-frame--interactive" : "",
    noteVariant === "note1" ? "card__surface-frame--note1" : "",
    noteVariant === "note2" ? "card__surface-frame--note2" : "",
    noteVariant === "note3" ? "card__surface-frame--note3" : "",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className={surfaceFrameClassName}>
        <NoteSurface
          card={card}
          mode={textInteraction.mode}
          noteTimestamp={noteTimestamp}
          onTextChange={onTextChange}
          surfaceProps={textInteraction.dragMode === "surface" ? surfaceGesture : {
            onDoubleClick: textInteraction.canMagnify
              ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onRequestTextNoteMagnify?.(card.id);
              }
              : undefined,
          }}
          headerProps={textInteraction.dragMode === "header" ? headerGesture : null}
          onRequestMagnify={onRequestTextNoteMagnify}
        />
      </div>
    </TileShell>
  );
}
