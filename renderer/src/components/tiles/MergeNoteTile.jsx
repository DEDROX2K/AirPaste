import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { MERGE_LAYOUT } from "../../tiles/merge/model";
import { NoteTextEditor, NoteTextView } from "../noteText/NoteText";
import TileShell from "./TileShell";
import "./MergeNoteTile.css";

// The frame of a merged group (tiles/merge/model.js): a yellow outline
// drawn behind the group's tiles, and a short note in the tab hanging off
// its bottom. Only the yellow takes the pointer: the tiles sit on top, and
// the empty corners of the frame's box let clicks through to the canvas.
// Dragging the yellow (or any tile in the group) moves the whole group.
// Click the note once the frame is selected, or double-click it, to write.

const NOTE_PLACEHOLDER = "Write a note…";

function normalizeBody(text) {
  return (text ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function MergeNoteTile({
  card,
  tileMeta,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  renderHint,
}) {
  const { setCanvasInteractionState, updateExistingCard } = useTileAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const noteTextRef = useRef(null);
  const draftRef = useRef(null);
  const wasSelectedAtPressRef = useRef(false);
  const pressedNoteRef = useRef(false);
  const cardRef = useRef(card);
  cardRef.current = card;
  const shape = card.mergeShape;
  const note = shape?.note ?? { x: 0, y: 0, width: 0, height: MERGE_LAYOUT.noteMinHeight };
  const body = card.body ?? "";
  const isStaticPreview = renderHint?.isStaticPreview === true;

  // The tab grows with the note: its text's height goes back to the frame,
  // which lays the group out again around it.
  useLayoutEffect(() => {
    const element = noteTextRef.current;

    if (!element || isStaticPreview || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const measured = Math.ceil(element.offsetHeight);
      const current = cardRef.current;
      const next = Math.max(MERGE_LAYOUT.noteMinHeight, measured);

      if (Math.abs(next - (current.noteHeight ?? MERGE_LAYOUT.noteMinHeight)) > 1) {
        updateExistingCard(current.id, { noteHeight: next });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isStaticPreview, updateExistingCard]);

  useEffect(() => {
    if (!isEditing) {
      return undefined;
    }

    setCanvasInteractionState?.(true);
    return () => setCanvasInteractionState?.(false);
  }, [isEditing, setCanvasInteractionState]);

  // Deselecting the frame ends writing.
  useEffect(() => {
    if (!tileMeta?.isSelected && isEditing) {
      document.activeElement?.blur?.();
    }
  }, [isEditing, tileMeta?.isSelected]);

  const startWriting = () => {
    draftRef.current = body;
    setIsEditing(true);
  };

  const finishWriting = () => {
    const next = normalizeBody(draftRef.current ?? body);

    if (next !== body) {
      updateExistingCard(card.id, { body: next });
    }

    setIsEditing(false);
  };

  const gesture = useTileGesture({
    card,
    canDrag: !isEditing,
    onDragStart: onBeginDrag,
    onPressStart: (pressedCard, event) => {
      wasSelectedAtPressRef.current = tileMeta?.isSelected === true;
      pressedNoteRef.current = Boolean(event.target?.closest?.(".merge-note__note"));
      return onPressStart?.(pressedCard, event);
    },
    onActivate: () => {
      if (wasSelectedAtPressRef.current && pressedNoteRef.current && !isEditing) {
        startWriting();
      }
    },
    onDoubleActivate: () => {
      if (pressedNoteRef.current && !isEditing) {
        startWriting();
      }
    },
  });

  // While writing, a press in the note moves the caret instead of dragging.
  const handlePointerDown = (event) => {
    if (isEditing && event.target?.closest?.(".merge-note__note")) {
      event.stopPropagation();
      return;
    }

    gesture.onPointerDown(event);
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className="card--merge-note"
      renderHint={renderHint}
      tileState={isEditing ? "editing" : ""}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div
        className={`merge-note${isEditing ? " merge-note--editing" : ""}`}
        aria-label="Merged tiles"
        {...gesture}
        onPointerDown={handlePointerDown}
      >
        {shape ? (
          <svg
            className="merge-note__frame"
            width={card.width}
            height={card.height}
            viewBox={`0 0 ${card.width} ${card.height}`}
            aria-hidden="true"
          >
            <path className="merge-note__fill" d={shape.path} />
            <path className="merge-note__ring" d={shape.path} />
          </svg>
        ) : null}

        <div
          className="merge-note__note"
          style={{ left: note.x, top: note.y, width: note.width, minHeight: note.height }}
        >
          <div ref={noteTextRef} className="merge-note__text">
            <div className="merge-note__box">
              {isEditing ? (
                <NoteTextEditor
                  initialText={body}
                  initialSelection="end"
                  autoFocus
                  placeholder={NOTE_PLACEHOLDER}
                  onChange={(nextText) => { draftRef.current = nextText; }}
                  onExit={finishWriting}
                />
              ) : (
                <NoteTextView text={body} placeholder={NOTE_PLACEHOLDER} />
              )}
            </div>
          </div>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(MergeNoteTile);
