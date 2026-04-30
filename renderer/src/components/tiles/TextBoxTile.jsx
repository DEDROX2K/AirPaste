import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import {
  getTextBoxFontFamily,
  normalizeTextBoxText,
  TEXT_BOX_DEFAULT_TEXT,
} from "../../lib/textBoxStyle";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

function getTextDecoration(style) {
  const decorations = [];

  if (style?.underline) {
    decorations.push("underline");
  }

  if (style?.strike) {
    decorations.push("line-through");
  }

  return decorations.length > 0 ? decorations.join(" ") : "none";
}

function TextBoxTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  textBoxEditorState,
  onRequestTextBoxEdit,
  onEndTextBoxEdit,
}) {
  const { updateExistingCard } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(card.text ?? TEXT_BOX_DEFAULT_TEXT);
  const textareaRef = useRef(null);
  const editRequestIdRef = useRef(null);
  const surfaceGesture = useTileGesture({
    card,
    canDrag: !isEditing,
    onDoubleActivate: () => {
      onRequestTextBoxEdit(card.id, { selectAll: false });
    },
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    "card__surface-frame--text-box",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
    isEditing ? "card__surface-frame--editing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const textStyle = useMemo(() => ({
    fontFamily: getTextBoxFontFamily(card.style?.preset),
    fontSize: `${card.style?.fontSize ?? 48}px`,
    fontWeight: card.style?.fontWeight ?? 500,
    fontStyle: card.style?.italic ? "italic" : "normal",
    textDecoration: getTextDecoration(card.style),
    textAlign: card.style?.align ?? "left",
    color: card.style?.color ?? "#1f1f1f",
    lineHeight: card.style?.lineHeight ?? 1.15,
    letterSpacing: `${card.style?.letterSpacing ?? 0}px`,
  }), [card.style]);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(card.text ?? TEXT_BOX_DEFAULT_TEXT);
    }
  }, [card.text, isEditing]);

  useEffect(() => {
    if (!textBoxEditorState || textBoxEditorState.requestId === editRequestIdRef.current) {
      return;
    }

    editRequestIdRef.current = textBoxEditorState.requestId;
    setDraftText(
      typeof textBoxEditorState.replacementText === "string"
        ? textBoxEditorState.replacementText
        : (card.text ?? TEXT_BOX_DEFAULT_TEXT),
    );
    setIsEditing(true);
  }, [card.text, textBoxEditorState]);

  useEffect(() => {
    if (!isEditing || !textareaRef.current) {
      return undefined;
    }

    const textarea = textareaRef.current;
    const frame = requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });

      if (textBoxEditorState?.selectAll) {
        textarea.setSelectionRange(0, textarea.value.length);
        return;
      }

      const nextCaret = textarea.value.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
    });

    return () => cancelAnimationFrame(frame);
  }, [isEditing, textBoxEditorState]);

  const commitDraft = () => {
    const nextText = normalizeTextBoxText(draftText);

    if (nextText !== card.text) {
      updateExistingCard(card.id, { text: nextText });
    }
  };

  const exitEditMode = ({ save = true } = {}) => {
    if (save) {
      commitDraft();
    }

    setIsEditing(false);
    onEndTextBoxEdit?.(card.id);
  };

  const handleEditorKeyDown = (event) => {
    stopInteractiveKey(event);

    if (event.key === "Escape") {
      event.preventDefault();
      exitEditMode({ save: true });
    }
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--text-box"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section className="card__surface card__surface--text-box" aria-label="Canvas text box">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                className="card__text-box-editor"
                value={draftText}
                aria-label="Canvas text box editor"
                spellCheck={false}
                rows={1}
                style={textStyle}
                onPointerDown={stopInteractivePointer}
                onKeyDown={handleEditorKeyDown}
                onBlur={() => exitEditMode({ save: true })}
                onChange={(event) => setDraftText(event.target.value)}
              />
            ) : (
              <div
                className={`card__text-box-display${card.text ? "" : " card__text-box-display--placeholder"}`}
                style={textStyle}
              >
                {card.text || TEXT_BOX_DEFAULT_TEXT}
              </div>
            )}
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(TextBoxTile);
