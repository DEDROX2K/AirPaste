import { memo } from "react";
import { recordCardRender } from "../lib/perf";
import { PREVIEW_TIER, TILE_RENDER_STATE, WORKSPACE_LOD_LEVEL } from "../systems/canvas/tileLod";
import { getTileStyleVars } from "../systems/layout/tileLayout";
import { getTileRegistration } from "../tiles/tileRegistry";

const EMPTY_SET = new Set();
const EMPTY_ARRAY = [];
const noop = () => {};

// A tile drawn somewhere other than its own spot on the canvas -- a rack's
// cards -- so it looks exactly like the real tile: full detail, its own
// image, no hover state, toolbar or actions, and nothing that animates
// for attention (isStaticPreview).
const STATIC_PREVIEW_RENDER_HINT = Object.freeze({
  lodLevel: WORKSPACE_LOD_LEVEL.NORMAL,
  previewTier: PREVIEW_TIER.MEDIUM,
  renderState: TILE_RENDER_STATE.DETAIL,
  simplify: false,
  imageEnabled: true,
  showToolbar: false,
  showActions: false,
  disableImageReveal: true,
  usePreviewColorBlock: false,
  isStaticPreview: true,
});

function Card(props) {
  recordCardRender(props.card?.id, props.card?.type);

  const registration = getTileRegistration(props.card);
  const TileComponent = registration.Component;

  return <TileComponent {...props} renderTilePreview={renderStaticTilePreview} />;
}

const MemoCard = memo(Card, areCardPropsEqual);

// Module-level (so it's one stable reference) and handed to every tile:
// the rack renders its tiles through this rather than importing Card,
// which would be an import cycle through the tile registry.
function renderStaticTilePreview(tile) {
  return (
    <MemoCard
      card={tile}
      tileMeta={{ styleVars: getTileStyleVars(tile, 1, 0, 0) }}
      renderHint={STATIC_PREVIEW_RENDER_HINT}
      dragVisualDelta={null}
      dragVisualTileIdSet={EMPTY_SET}
      childTiles={EMPTY_ARRAY}
      rackState={null}
      performanceMode={false}
      onContextMenu={noop}
      onHoverChange={noop}
      onFocusIn={noop}
      onFocusOut={noop}
    />
  );
}

function areCardPropsEqual(previousProps, nextProps) {
  const cardId = nextProps.card?.id ?? previousProps.card?.id ?? null;
  const wasDragAffected = Boolean(cardId && previousProps.dragVisualTileIdSet?.has(cardId));
  const isDragAffected = Boolean(cardId && nextProps.dragVisualTileIdSet?.has(cardId));
  const dragVisualDeltaEqual = (!wasDragAffected && !isDragAffected)
    || previousProps.dragVisualDelta === nextProps.dragVisualDelta;

  return previousProps.card === nextProps.card
    && previousProps.tileMeta === nextProps.tileMeta
    && dragVisualDeltaEqual
    && previousProps.dragVisualTileIdSet === nextProps.dragVisualTileIdSet
    && previousProps.childTiles === nextProps.childTiles
    && previousProps.rackState === nextProps.rackState
    && previousProps.renderHint === nextProps.renderHint
    && previousProps.performanceMode === nextProps.performanceMode
    && previousProps.onBeginDrag === nextProps.onBeginDrag
    && previousProps.onContextMenu === nextProps.onContextMenu
    && previousProps.onHoverChange === nextProps.onHoverChange
    && previousProps.onFocusIn === nextProps.onFocusIn
    && previousProps.onFocusOut === nextProps.onFocusOut
    && previousProps.onOpenLink === nextProps.onOpenLink
    && previousProps.onMediaLoad === nextProps.onMediaLoad
    && previousProps.onPressStart === nextProps.onPressStart
    && previousProps.onPullFromRack === nextProps.onPullFromRack
    && previousProps.onCreateAdjacentSticky === nextProps.onCreateAdjacentSticky
    && previousProps.onRetry === nextProps.onRetry
    && previousProps.canvasToolMode === nextProps.canvasToolMode
    && previousProps.textBoxEditorState === nextProps.textBoxEditorState
    && previousProps.onRequestTextBoxEdit === nextProps.onRequestTextBoxEdit
    && previousProps.onEndTextBoxEdit === nextProps.onEndTextBoxEdit;
}

export default MemoCard;
