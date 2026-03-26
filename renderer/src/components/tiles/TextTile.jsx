import { memo, useMemo, useRef } from "react";
import NoteSurface from "../notes/NoteSurface";
import { getTextNoteInteraction } from "../notes/noteInteraction";
import { formatNoteTimestamp, getTextNoteVariant } from "../notes/noteUtils";
import { TEXT_CONTENT_MODEL_RICH } from "../../lib/workspace";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import FloatingTextToolbar from "./text/FloatingTextToolbar";
import { useTextTileEditor } from "./text/useTextTileEditor";
import TileShell from "./TileShell";

function LegacyNoteTile({
  card,
  tileMeta,
  viewportZoom,
  dragVisualDelta,
  dragVisualTileIdSet,
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
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
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

function RichTextTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  onBeginDrag,
  onTextChange,
  onEditingChange,
}) {
  const tileRef = useRef(null);
  const headerGesture = useTileGesture({
    card,
    canDrag: !tileMeta?.isEditing,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const surfaceFrameClassName = useMemo(() => [
    "card__surface-frame",
    "card__surface-frame--text-editor",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ].filter(Boolean).join(" "), [tileMeta?.isMergeTarget, tileMeta?.isSelected]);
  const {
    previewHtml,
    editorContent,
    stylePresetOptions,
    fontSizeOptions,
    alignmentOptions,
    activeStylePreset,
    activeFontSize,
    activeAlignment,
    isBoldActive,
    isStrikeActive,
    isBulletListActive,
    canToggleBulletList,
    setStylePreset,
    setFontSize,
    toggleBold,
    toggleStrike,
    toggleBulletList,
    setAlignment,
    editLink,
    focusEditor,
  } = useTextTileEditor({
    card,
    isEditing: Boolean(tileMeta?.isEditing),
    onTextChange,
    onEditingChange,
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
      <FloatingTextToolbar
        tileId={card.id}
        anchorRef={tileRef}
        isOpen={Boolean(tileMeta?.isEditing)}
        stylePresetOptions={stylePresetOptions}
        fontSizeOptions={fontSizeOptions}
        alignmentOptions={alignmentOptions}
        activeStylePreset={activeStylePreset}
        activeFontSize={activeFontSize}
        activeAlignment={activeAlignment}
        isBoldActive={isBoldActive}
        isStrikeActive={isStrikeActive}
        isBulletListActive={isBulletListActive}
        canToggleBulletList={canToggleBulletList}
        onStylePresetChange={setStylePreset}
        onFontSizeChange={setFontSize}
        onToggleBold={toggleBold}
        onToggleStrike={toggleStrike}
        onToggleLink={editLink}
        onToggleBulletList={toggleBulletList}
        onAlignmentChange={setAlignment}
      />
      <div className={surfaceFrameClassName} ref={tileRef}>
        <div className="card__toolbar card__toolbar--text-editor" {...headerGesture}>
          <span className="card__label">{card.textStylePreset || "Text"}</span>
        </div>
        <section
          className={`card__surface card__surface--text-editor${tileMeta?.isEditing ? " card__surface--text-editor-editing" : ""}`}
          data-text-style-preset={card.textStylePreset || "simple"}
          style={{
            "--text-tile-font-size": `${Number(card.fontSize || 16)}px`,
          }}
          onClick={() => {
            if (!tileMeta?.isEditing) {
              onEditingChange?.(card.id, true);
              queueMicrotask(() => {
                focusEditor();
              });
            }
          }}
        >
          {tileMeta?.isEditing ? editorContent : null}
          {!tileMeta?.isEditing ? (
            <div
              className="card__text-preview"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : null}
        </section>
      </div>
    </TileShell>
  );
}

function TextTile(props) {
  if (props.card.contentModel === TEXT_CONTENT_MODEL_RICH) {
    return <RichTextTile {...props} />;
  }

  return <LegacyNoteTile {...props} />;
}

export default memo(TextTile);
