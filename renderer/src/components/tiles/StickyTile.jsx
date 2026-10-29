import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
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

function placeCaret(element, selectAll) {
  const range = document.createRange();
  range.selectNodeContents(element);
  if (!selectAll) {
    range.collapse(false);
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function PlusIcon() {
  return <Plus size={12} aria-hidden="true" />;
}

function StickyTile({
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
  renderHint,
  textBoxEditorState,
  onRequestTextBoxEdit,
  onEndTextBoxEdit,
  onCreateAdjacentSticky,
}) {
  const { setCanvasInteractionState, updateExistingCard } = useAppContext();
  const style = normalizeStickyStyle(card.sticky);
  const size = Number.isFinite(card.width) ? card.width : STICKY_BASE_SIZE;
  const isEditing = textBoxEditorState?.tileId === card.id;
  const isStaticPreview = renderHint?.isStaticPreview === true;
  const [resizeLabel, setResizeLabel] = useState("");
  const isResizing = resizeLabel !== "";
  const textRef = useRef(null);
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

  // The text is uncontrolled: React never writes it while the user types.
  useLayoutEffect(() => {
    if (!isEditing && textRef.current && textRef.current.innerText !== displayText) {
      textRef.current.textContent = displayText;
    }
  }, [displayText, isEditing]);

  // Entering edit mode: optionally replace the text with the key that
  // started it, then put the caret at the end (or select everything).
  useEffect(() => {
    const element = textRef.current;

    if (!isEditing || !element) {
      return undefined;
    }

    if (typeof textBoxEditorState?.replacementText === "string") {
      element.textContent = textBoxEditorState.replacementText;
    }

    const frame = window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      placeCaret(element, textBoxEditorState?.selectAll === true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isEditing, textBoxEditorState?.replacementText, textBoxEditorState?.requestId, textBoxEditorState?.selectAll]);

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
    const element = textRef.current;
    const nextText = (element?.innerText ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");

    // A title from the older sticky design folds into the text for good.
    if (nextText !== displayText || card.title) {
      updateExistingCard(card.id, { text: nextText, title: "", titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM });
    }
  };

  const finishEditing = ({ restoreCanvasFocus = false } = {}) => {
    commitText();
    window.getSelection()?.removeAllRanges();
    onEndTextBoxEdit?.(card.id, { restoreCanvasFocus });
  };

  const handleTextKeyDown = (event) => {
    const isModifier = event.metaKey || event.ctrlKey;

    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      onEndTextBoxEdit?.(card.id, { restoreCanvasFocus: true });
    } else if (isModifier && event.key.toLowerCase() === "b") {
      event.preventDefault();
      updateStyle({ bold: !style.bold });
    } else if (isModifier && event.key.toLowerCase() === "i") {
      event.preventDefault();
      updateStyle({ italic: !style.italic });
    }
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
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
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
        <div
          ref={textRef}
          className="sticky__text"
          role="textbox"
          aria-multiline="true"
          aria-label="Sticky note text"
          spellCheck={false}
          // Editable only while editing, so a click never drops a caret
          // by accident and text isn't selectable while dragging.
          contentEditable={isEditing ? "plaintext-only" : "false"}
          suppressContentEditableWarning
          onKeyDown={isEditing ? handleTextKeyDown : undefined}
          onBlur={isEditing ? () => finishEditing() : undefined}
        />
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
