import { memo } from "react";
import { recordCardRender } from "../lib/perf";
import { getTileRegistration } from "./tiles/tileRegistry";

function Card(props) {
  recordCardRender(props.card?.id, props.card?.type);

  const registration = getTileRegistration(props.card.type);
  const TileComponent = registration.Component;

  return <TileComponent {...props} />;
}

function areCardPropsEqual(previousProps, nextProps) {
  const cardId = nextProps.card?.id ?? previousProps.card?.id ?? null;
  const wasDragAffected = Boolean(cardId && previousProps.dragVisualTileIdSet?.has(cardId));
  const isDragAffected = Boolean(cardId && nextProps.dragVisualTileIdSet?.has(cardId));
  const dragVisualDeltaEqual = (!wasDragAffected && !isDragAffected)
    || previousProps.dragVisualDelta === nextProps.dragVisualDelta;
  const expandedTileIdEqual = nextProps.card?.type !== "folder"
    ? true
    : previousProps.expandedTileId === nextProps.expandedTileId;

  return previousProps.card === nextProps.card
    && previousProps.tileMeta === nextProps.tileMeta
    && previousProps.viewportZoom === nextProps.viewportZoom
    && previousProps.isExpanded === nextProps.isExpanded
    && expandedTileIdEqual
    && dragVisualDeltaEqual
    && previousProps.dragVisualTileIdSet === nextProps.dragVisualTileIdSet
    && previousProps.childTiles === nextProps.childTiles
    && previousProps.folderState === nextProps.folderState
    && previousProps.rackState === nextProps.rackState
    && previousProps.performanceMode === nextProps.performanceMode
    && previousProps.onBeginDrag === nextProps.onBeginDrag
    && previousProps.onContextMenu === nextProps.onContextMenu
    && previousProps.onHoverChange === nextProps.onHoverChange
    && previousProps.onFocusIn === nextProps.onFocusIn
    && previousProps.onFocusOut === nextProps.onFocusOut
    && previousProps.onEditingChange === nextProps.onEditingChange
    && previousProps.onOpenLink === nextProps.onOpenLink
    && previousProps.onMediaLoad === nextProps.onMediaLoad
    && previousProps.onPressStart === nextProps.onPressStart
    && previousProps.onRequestTextNoteMagnify === nextProps.onRequestTextNoteMagnify
    && previousProps.onRetry === nextProps.onRetry
    && previousProps.onTextChange === nextProps.onTextChange
    && previousProps.onToggleExpanded === nextProps.onToggleExpanded
    && previousProps.onToggleFolderOpen === nextProps.onToggleFolderOpen;
}

export default memo(Card, areCardPropsEqual);
