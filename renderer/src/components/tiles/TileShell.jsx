import { memo, useMemo } from "react";

function preventNativeDrag(event) {
  event.preventDefault();
}

// A stacked tile (systems/stack/tileStack.js) is inert: a left press, click
// or double-click is swallowed here, before the tile's own handlers or the
// canvas see it, so nothing selects, drags, edits or opens. Right-click still
// goes through (its menu offers Ungroup), and so does a middle-button pan.
function swallowPrimary(event) {
  if (event.button === 0) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function TileShell({
  card,
  tileMeta,
  renderHint = null,
  dragVisualDelta = null,
  className = "",
  toolbar = null,
  actionStrip = null,
  tileState = "",
  children,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
}) {
  const isStacked = Boolean(card.stack?.id);
  const classNames = useMemo(() => [
    "card",
    `card--${card.type}`,
    isStacked ? "card--stacked" : "",
    tileMeta?.isSelected ? "card--selected" : "",
    tileMeta?.isHovered ? "card--hovered" : "",
    tileMeta?.isFocused ? "card--focused" : "",
    tileMeta?.isDragging ? "card--dragging" : "",
    tileMeta?.isClipboardCutSource ? "card--clipboard-cut-source" : "",
    tileMeta?.isMergeTarget ? "card--merge-target" : "",
    tileMeta?.isRackDropTarget ? "card--rack-drop-target" : "",
    tileMeta?.isStickerPlacementAnimating ? "card--sticker-drop" : "",
    renderHint?.simplify ? "card--simplified" : "",
    renderHint?.previewTier ? `card--lod-${renderHint.previewTier}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" "), [card.type, className, isStacked, renderHint?.previewTier, renderHint?.simplify, tileMeta]);

  const style = useMemo(() => ({
    ...(tileMeta?.styleVars ?? {}),
    "--tile-drag-x": dragVisualDelta ? `${dragVisualDelta.x}px` : "0px",
    "--tile-drag-y": dragVisualDelta ? `${dragVisualDelta.y}px` : "0px",
    "--tile-clipboard-opacity": tileMeta?.styleVars?.["--tile-clipboard-opacity"] ?? "1",
    ...(card.stack ? { "--stack-tilt": `${card.stack.tilt ?? 0}deg` } : null),
  }), [card.stack, dragVisualDelta, tileMeta]);
  const resolvedTileState = tileState || (
    tileMeta?.isDragging ? "dragging" : tileMeta?.isFocused ? "focused" : tileMeta?.isSelected ? "selected" : tileMeta?.isHovered ? "hovered" : "passive"
  );
  const renderState = renderHint?.renderState ?? "detail";

  return (
    <article
      className={classNames}
      data-interaction-state={tileMeta?.interactionState ?? "idle"}
      data-tile-state={resolvedTileState}
      data-render-state={renderState}
      data-preview-tier={renderHint?.previewTier ?? "original"}
      style={style}
      onContextMenu={(event) => onContextMenu(card, event)}
      onPointerDownCapture={isStacked ? swallowPrimary : undefined}
      onClickCapture={isStacked ? swallowPrimary : undefined}
      onDoubleClickCapture={isStacked ? swallowPrimary : undefined}
      onPointerEnter={isStacked ? undefined : () => onHoverChange(card.id, true)}
      onPointerLeave={isStacked ? undefined : () => onHoverChange(card.id, false)}
      onFocusCapture={(event) => onFocusIn(card.id, event)}
      onBlurCapture={(event) => onFocusOut(card.id, event)}
      onDragStart={preventNativeDrag}
    >
      {toolbar}
      {actionStrip}
      {children}
    </article>
  );
}

export default memo(TileShell);
