import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
import { CANVAS_TEXT_TITLE_MODE_CUSTOM } from "../../lib/canvasText";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  STICKY_BASE_SIZE,
  STICKY_COLORS,
  STICKY_FONT_SIZE_LABELS,
  STICKY_FONT_SIZES,
  clampStickySize,
  getStickyColorHex,
  getStickyDisplayText,
  normalizeStickyStyle,
  rememberStickyColor,
} from "../../tiles/sticky/model";
import { NoteTextEditor, NoteTextView } from "../noteText/NoteText";
import FloatingFormatToolbar from "./FloatingFormatToolbar";
import TileShell from "./TileShell";
import { Plus } from "../ui/icons";
import "./StickyTile.css";

const STICKY_SIZE_OPTIONS = Object.entries(STICKY_FONT_SIZE_LABELS).map(([id, label]) => ({ id, label }));
// Screen px between the note and its toolbar (clears the "+" button).
const STICKY_TOOLBAR_GAP = 44;

const RESIZE_HANDLES = [
  { key: "nw", dirX: -1, dirY: -1 },
  { key: "ne", dirX: 1, dirY: -1 },
  { key: "sw", dirX: -1, dirY: 1 },
  { key: "se", dirX: 1, dirY: 1 },
];
const ADD_BUTTONS = [
  { key: "n", label: "Add a sticky above" },
  { key: "e", label: "Add a sticky to the right" },
  { key: "s", label: "Add a sticky below" },
  { key: "w", label: "Add a sticky to the left" },
];

function stopPointer(event) {
  event.stopPropagation();
}

function PlusIcon() {
  return <Plus size={12} aria-hidden="true" />;
}

function StickyTile({
  card,
  tileMeta,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  renderHint,
  textBoxEditorState,
  onRequestTextBoxEdit,
  onEndTextBoxEdit,
  onCreateAdjacentSticky,
}) {
  const { setCanvasInteractionState, updateExistingCard } = useTileAppContext();
  const style = normalizeStickyStyle(card.sticky);
  const size = Number.isFinite(card.width) ? card.width : STICKY_BASE_SIZE;
  const isEditing = textBoxEditorState?.tileId === card.id;
  const isStaticPreview = renderHint?.isStaticPreview === true;
  const [resizeLabel, setResizeLabel] = useState("");
  const isResizing = resizeLabel !== "";
  const textRef = useRef(null);
  // The editor is uncontrolled; this holds what's been typed this session.
  const draftRef = useRef(null);
  const exitedRef = useRef(false);
  const wasSelectedAtPressRef = useRef(false);
  const displayText = getStickyDisplayText(card);
  const showChrome = tileMeta?.isSelected === true && !tileMeta?.isDragging && !isResizing && !isStaticPreview;
  const showToolbar = showChrome && tileMeta?.isMultiSelect !== true;

  const startEditing = useCallback(() => {
    onRequestTextBoxEdit?.(card.id, { selectAll: false });
  }, [card.id, onRequestTextBoxEdit]);

  const gesture = useTileGesture({
    card,
    canDrag: !isEditing,
    onDragStart: onBeginDrag,
    // Remember whether the note was already selected: clicking a selected
    // note (again) starts typing, the first click only selects it.
    onPressStart: (pressedCard, event) => {
      wasSelectedAtPressRef.current = tileMeta?.isSelected === true;
      return onPressStart?.(pressedCard, event);
    },
    onActivate: () => {
      if (wasSelectedAtPressRef.current && !isEditing) {
        startEditing();
      }
    },
    onDoubleActivate: startEditing,
  });

  // Each edit session starts from the saved text (or the key that started it).
  useLayoutEffect(() => {
    if (isEditing) {
      draftRef.current = typeof textBoxEditorState?.replacementText === "string"
        ? textBoxEditorState.replacementText
        : displayText;
      exitedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, textBoxEditorState?.requestId]);

  useEffect(() => {
    if (!isEditing) {
      return undefined;
    }

    setCanvasInteractionState?.(true);
    return () => setCanvasInteractionState?.(false);
  }, [isEditing, setCanvasInteractionState]);

  const updateStyle = useCallback((patch) => {
    if (patch.color) {
      rememberStickyColor(patch.color);
    }
    updateExistingCard(card.id, { sticky: { ...normalizeStickyStyle(card.sticky), ...patch } });
  }, [card.id, card.sticky, updateExistingCard]);

  const commitText = () => {
    const nextText = (draftRef.current ?? displayText).replace(/\r\n/g, "\n").replace(/\n$/, "");

    // A title from the older sticky design folds into the text for good.
    if (nextText !== displayText || card.title) {
      updateExistingCard(card.id, { text: nextText, title: "", titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM });
    }
  };

  // Esc / Mod+Enter or clicking away: save and leave edit mode (once).
  const handleEditorExit = ({ reason }) => {
    if (exitedRef.current) {
      return;
    }
    exitedRef.current = true;
    commitText();
    onEndTextBoxEdit?.(card.id, { restoreCanvasFocus: reason === "escape" });
  };

  // While typing, a press in the text moves the caret instead of dragging.
  const handlePointerDown = (event) => {
    if (isEditing && textRef.current?.contains(event.target)) {
      event.stopPropagation();
      return;
    }

    gesture.onPointerDown(event);
  };

  // Corner handles resize, always square: delta = (dirX*dx + dirY*dy) / 2;
  // a west/north handle also shifts the note so the opposite corner stays.
  const handleResizePointerDown = (handle, event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    // On-screen width over canvas width: the zoom right now.
    const zoom = Math.max(0.1, (event.currentTarget.parentElement?.getBoundingClientRect().width ?? size) / size);
    const start = { x: card.x, y: card.y, size, clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    setCanvasInteractionState?.(true);
    setResizeLabel(`${Math.round(size)} × ${Math.round(size)}`);

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== start.pointerId) {
        return;
      }

      const dx = (moveEvent.clientX - start.clientX) / zoom;
      const dy = (moveEvent.clientY - start.clientY) / zoom;
      const nextSize = clampStickySize(start.size + ((handle.dirX * dx) + (handle.dirY * dy)) / 2);
      const grow = nextSize - start.size;
      updateExistingCard(card.id, {
        width: nextSize,
        height: nextSize,
        x: handle.dirX < 0 ? start.x - grow : start.x,
        y: handle.dirY < 0 ? start.y - grow : start.y,
      });
      setResizeLabel(`${nextSize} × ${nextSize}`);
    };

    const finish = (finishEvent) => {
      if (finishEvent && finishEvent.pointerId !== undefined && finishEvent.pointerId !== start.pointerId) {
        return;
      }

      setResizeLabel("");
      setCanvasInteractionState?.(false);
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", finish);
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    window.addEventListener("blur", finish);
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className="card--figjam-sticky"
      renderHint={renderHint}
      tileState={isEditing ? "editing" : ""}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <article
        className={[
          "sticky",
          isEditing ? "sticky--editing" : "",
          isResizing ? "sticky--resizing" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Sticky note"
        data-align={style.align}
        data-bold={style.bold}
        data-italic={style.italic}
        data-strike={style.strike}
        style={{
          "--sticky-k": size / STICKY_BASE_SIZE,
          "--sticky-paper": getStickyColorHex(style.color),
          "--sticky-font-size": `${STICKY_FONT_SIZES[style.fontSize]}px`,
        }}
        {...gesture}
        onPointerDown={handlePointerDown}
      >
        <div ref={textRef} className="sticky__text" aria-label="Sticky note text">
          {isEditing ? (
            <NoteTextEditor
              key={textBoxEditorState?.requestId ?? "edit"}
              initialText={displayText}
              replacementText={textBoxEditorState?.replacementText}
              initialSelection={textBoxEditorState?.selectAll === true ? "all" : "end"}
              onChange={(nextText) => { draftRef.current = nextText; }}
              onExit={handleEditorExit}
            />
          ) : (
            <NoteTextView text={displayText} />
          )}
        </div>
        {style.author ? <span className="sticky__author">{style.author}</span> : null}

        {showChrome ? (
          <>
            {RESIZE_HANDLES.map((handle) => (
              <span
                key={handle.key}
                className={`sticky__handle sticky__handle--${handle.key}`}
                aria-hidden="true"
                onPointerDown={(event) => handleResizePointerDown(handle, event)}
              />
            ))}
            {ADD_BUTTONS.map((button) => (
              <button
                key={button.key}
                type="button"
                className={`sticky__add sticky__add--${button.key}`}
                aria-label={button.label}
                onPointerDown={stopPointer}
                onDoubleClick={stopPointer}
                onClick={(event) => {
                  event.stopPropagation();
                  onCreateAdjacentSticky?.(card, button.key);
                }}
              >
                <PlusIcon />
              </button>
            ))}
          </>
        ) : null}

        {isResizing ? <div className="sticky__size-label">{resizeLabel}</div> : null}

        {showToolbar ? (
          <FloatingFormatToolbar
            label="Sticky note options"
            colors={STICKY_COLORS}
            color={style.color}
            sizes={STICKY_SIZE_OPTIONS}
            size={style.fontSize}
            align={style.align}
            bold={style.bold}
            italic={style.italic}
            strike={style.strike}
            gap={STICKY_TOOLBAR_GAP}
            onChange={({ size: fontSize, ...patch }) => updateStyle(fontSize ? { ...patch, fontSize } : patch)}
          />
        ) : null}
      </article>
    </TileShell>
  );
}

export default memo(StickyTile);
