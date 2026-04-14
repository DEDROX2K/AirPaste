import { memo, useMemo } from "react";

function preventNativeDrag(event) {
  event.preventDefault();
}

function TileShell({
  card,
  tileMeta,
  renderHint = null,
  dragVisualDelta = null,
  className = "",
  toolbar = null,
  children,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
}) {
  const classNames = useMemo(() => [
    "card",
    `card--${card.type}`,
    tileMeta?.isSelected ? "card--selected" : "",
    tileMeta?.isHovered ? "card--hovered" : "",
    tileMeta?.isFocused ? "card--focused" : "",
    tileMeta?.isDragging ? "card--dragging" : "",
    tileMeta?.isMergeTarget ? "card--merge-target" : "",
    tileMeta?.isRackAttached ? "card--rack-attached" : "",
    tileMeta?.isRackDropTarget ? "card--rack-drop-target" : "",
    renderHint?.simplify ? "card--simplified" : "",
    renderHint?.previewTier ? `card--lod-${renderHint.previewTier}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" "), [card.type, className, renderHint?.previewTier, renderHint?.simplify, tileMeta]);

  const style = useMemo(() => ({
    ...(tileMeta?.styleVars ?? {}),
    "--tile-drag-x": dragVisualDelta ? `${dragVisualDelta.x}px` : "0px",
    "--tile-drag-y": dragVisualDelta ? `${dragVisualDelta.y}px` : "0px",
  }), [dragVisualDelta, tileMeta]);

  return (
    <article
      className={classNames}
      data-interaction-state={tileMeta?.interactionState ?? "idle"}
      data-preview-tier={renderHint?.previewTier ?? "original"}
      style={style}
      onContextMenu={(event) => onContextMenu(card, event)}
      onPointerEnter={() => onHoverChange(card.id, true)}
      onPointerLeave={() => onHoverChange(card.id, false)}
      onFocusCapture={(event) => onFocusIn(card.id, event)}
      onBlurCapture={(event) => onFocusOut(card.id, event)}
      onDragStart={preventNativeDrag}
    >
      {toolbar}
      {children}
    </article>
  );
}

export default memo(TileShell);
