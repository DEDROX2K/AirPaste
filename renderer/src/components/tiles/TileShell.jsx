function preventNativeDrag(event) {
  event.preventDefault();
}

export default function TileShell({
  card,
  tileMeta,
  className = "",
  toolbar = null,
  children,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
}) {
  const classNames = [
    "card",
    `card--${card.type}`,
    tileMeta?.isExpanded ? "card--note-folder-open" : "",
    tileMeta?.isSelected ? "card--selected" : "",
    tileMeta?.isHovered ? "card--hovered" : "",
    tileMeta?.isFocused ? "card--focused" : "",
    tileMeta?.isEditing ? "card--editing" : "",
    tileMeta?.isDragging ? "card--dragging" : "",
    tileMeta?.isMergeTarget ? "card--merge-target" : "",
    tileMeta?.isGroupingTarget ? "card--folder-group-target" : "",
    tileMeta?.isGroupingArmed ? "card--folder-group-armed" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classNames}
      data-interaction-state={tileMeta?.interactionState ?? "idle"}
      style={tileMeta?.styleVars}
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
