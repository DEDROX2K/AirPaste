import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasMotionContext } from "../../context/CanvasMotionContext";
import { useAppContext } from "../../context/useAppContext";
import { QUICK_TEXT_MIN_HEIGHT, QUICK_TEXT_MIN_WIDTH } from "../../lib/canvasText";
import {
  TEXT_BOX_COLORS,
  TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT,
  TEXT_BOX_MAX_FONT_SIZE,
  TEXT_BOX_MIN_FONT_SIZE,
  TEXT_BOX_SIZE_OPTIONS,
  getTextBoxFontFamily,
  normalizeTextBoxStyle,
  rememberTextBoxStyle,
} from "../../lib/textBoxStyle";
import { recordTextTileMeasurePass, recordTextTileSizeWrite } from "../../lib/perf";
import { DRAWING_TOOL_MODE_TEXT } from "../../systems/drawing/drawingTypes";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import FloatingFormatToolbar from "./FloatingFormatToolbar";
import TileShell from "./TileShell";
import "./TextBoxTile.css";

// Edges set a fixed width; corners scale the text around the opposite corner.
const RESIZE_HANDLES = [
  { key: "nw", dirX: -1, dirY: -1 },
  { key: "ne", dirX: 1, dirY: -1 },
  { key: "sw", dirX: -1, dirY: 1 },
  { key: "se", dirX: 1, dirY: 1 },
  { key: "w", dirX: -1, dirY: 0 },
  { key: "e", dirX: 1, dirY: 0 },
];
const SIZE_EPSILON = 0.5;

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
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

function getTextDecoration(style) {
  const decorations = [];

  if (style.underline) {
    decorations.push("underline");
  }

  if (style.strike) {
    decorations.push("line-through");
  }

  return decorations.length > 0 ? decorations.join(" ") : "none";
}

// Quick text: plain text written straight onto the canvas, like Figma's text
// tool -- no box, a blue outline only on hover, selection and editing.
// Click selects, clicking again (or double-click / Enter) types, and text
// that ends up empty deletes itself.
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
  renderHint,
  canvasToolMode,
  textBoxEditorState,
  onRequestTextBoxEdit,
  onEndTextBoxEdit,
}) {
  const { deleteExistingCard, setCanvasInteractionState, updateExistingCard } = useAppContext();
  const isMoving = useContext(CanvasMotionContext);
  const rootRef = useRef(null);
  const textRef = useRef(null);
  const wasSelectedAtPressRef = useRef(false);
  const [resizing, setResizing] = useState(false);
  const isEditing = textBoxEditorState?.tileId === card.id;
  const isStaticPreview = renderHint?.isStaticPreview === true;
  // Keyed off a stable string, not the card.style object reference -- that
  // reference gets rebuilt by workspace normalization on every unrelated
  // card update (e.g. a drag-drop committing a new x/y).
  const styleKey = JSON.stringify(card.style ?? null);
  const style = useMemo(() => normalizeTextBoxStyle(card.style), [styleKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const isAutoWidth = card.autoWidth !== false;
  // Older quick text could be left empty showing a faint "Add text"; it
  // still shows that until it's edited (and then deleted if left empty).
  const isLegacyPlaceholder = card.placeholder === true && !isEditing;
  const displayText = isLegacyPlaceholder
    ? (card.placeholderText || TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT)
    : (card.text ?? "");
  const isBold = style.fontWeight >= 600;
  const showChrome = tileMeta?.isSelected === true && !tileMeta?.isDragging && !resizing && !isStaticPreview;
  const showHandles = showChrome && !isEditing;
  const showToolbar = showChrome && tileMeta?.isMultiSelect !== true;

  const startEditing = useCallback(() => {
    onRequestTextBoxEdit?.(card.id, { selectAll: false });
  }, [card.id, onRequestTextBoxEdit]);

  const gesture = useTileGesture({
    card,
    canDrag: !isEditing && canvasToolMode !== DRAWING_TOOL_MODE_TEXT,
    onDragStart: onBeginDrag,
    onPressStart: (pressedCard, event) => {
      // With the text tool armed, clicking existing text edits it.
      if (canvasToolMode === DRAWING_TOOL_MODE_TEXT) {
        startEditing();
        return true;
      }

      wasSelectedAtPressRef.current = tileMeta?.isSelected === true;
      return onPressStart?.(pressedCard, event);
    },
    // A click on already-selected text types into it; the first only selects.
    onActivate: () => {
      if (wasSelectedAtPressRef.current && !isEditing) {
        startEditing();
      }
    },
    onDoubleActivate: startEditing,
  });

  // Uncontrolled text: React never writes it while the user types.
  useLayoutEffect(() => {
    if (!isEditing && textRef.current && textRef.current.textContent !== displayText) {
      textRef.current.textContent = displayText;
    }
  }, [displayText, isEditing]);

  // The card's width/height follow the rendered text (selection, hit-testing
  // and layout use them). Written once editing ends rather than on every
  // keystroke, and deferred while the canvas moves.
  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root || isEditing || isMoving || resizing || isStaticPreview) {
      return;
    }

    recordTextTileMeasurePass();
    const patch = {};
    // Same floors the card model enforces, or the two would fight forever.
    const measuredHeight = Math.max(QUICK_TEXT_MIN_HEIGHT, Math.ceil(root.offsetHeight));

    if (Math.abs(measuredHeight - card.height) > SIZE_EPSILON) {
      patch.height = measuredHeight;
    }

    if (isAutoWidth) {
      const measuredWidth = Math.max(QUICK_TEXT_MIN_WIDTH, Math.ceil(root.offsetWidth));
      if (Math.abs(measuredWidth - card.width) > SIZE_EPSILON) {
        patch.width = measuredWidth;
      }
    }

    if (Object.keys(patch).length > 0) {
      recordTextTileSizeWrite();
      updateExistingCard(card.id, patch);
    }
  });

  // Entering edit mode: optionally replace the text with the key that
  // started it, then put the caret at the end (or select everything).
  useEffect(() => {
    const element = textRef.current;

    if (!isEditing || !element) {
      return undefined;
    }

    if (typeof textBoxEditorState?.replacementText === "string") {
      element.textContent = textBoxEditorState.replacementText;
    } else if (card.placeholder === true) {
      element.textContent = "";
    }

    const frame = window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      placeCaret(element, textBoxEditorState?.selectAll === true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isEditing, textBoxEditorState?.replacementText, textBoxEditorState?.requestId, textBoxEditorState?.selectAll]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isEditing) {
      return undefined;
    }

    setCanvasInteractionState?.(true);
    return () => setCanvasInteractionState?.(false);
  }, [isEditing, setCanvasInteractionState]);

  const updateStyle = useCallback((patch) => {
    const nextStyle = normalizeTextBoxStyle({ ...style, ...patch });
    rememberTextBoxStyle(nextStyle);
    updateExistingCard(card.id, { style: nextStyle });
  }, [card.id, style, updateExistingCard]);

  // Ends editing. Empty (or whitespace-only) text removes the tile: nothing
  // is ever left behind.
  const finishEditing = ({ restoreCanvasFocus = false } = {}) => {
    const nextText = (textRef.current?.innerText ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");
    window.getSelection()?.removeAllRanges();
    onEndTextBoxEdit?.(card.id, { restoreCanvasFocus });

    if (!nextText.trim()) {
      deleteExistingCard?.(card.id);
      return;
    }

    if (nextText !== card.text || card.placeholder === true) {
      updateExistingCard(card.id, { text: nextText, placeholder: false });
    }
  };

  const handleTextKeyDown = (event) => {
    const isModifier = event.metaKey || event.ctrlKey;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.blur();
    } else if (isModifier && event.key.toLowerCase() === "b") {
      event.preventDefault();
      updateStyle({ fontWeight: isBold ? 400 : 700 });
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

  const handleToolbarChange = ({ color, size, bold, ...patch }) => {
    updateStyle({
      ...patch,
      ...(color ? { color } : null),
      ...(size ? { fontSize: size } : null),
      ...(typeof bold === "boolean" ? { fontWeight: bold ? 700 : 400 } : null),
    });
  };

  // Edge handles set a fixed width (min 24). Corner handles scale the text
  // (and a fixed width) around the opposite corner:
  //   f = 1 + (sx*dx*W + sy*dy*H) / (W*W + H*H)
  const handleResizePointerDown = (handle, event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const root = rootRef.current;
    const W = Math.max(1, root?.offsetWidth ?? card.width);
    const H = Math.max(1, root?.offsetHeight ?? card.height);
    // On-screen width over layout width: the canvas zoom right now.
    const zoom = Math.max(0.05, (root?.getBoundingClientRect().width ?? W) / W);
    const start = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: card.x,
      y: card.y,
      fontSize: style.fontSize,
      fixedWidth: isAutoWidth ? null : card.width,
    };
    setCanvasInteractionState?.(true);
    // Handles hide only once the pointer actually moves: a plain press
    // keeps them, so double-clicking an edge handle can still land.
    let hasMoved = false;

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== start.pointerId) {
        return;
      }

      const dx = (moveEvent.clientX - start.clientX) / zoom;
      const dy = (moveEvent.clientY - start.clientY) / zoom;

      if (!hasMoved) {
        if (dx === 0 && dy === 0) {
          return;
        }
        hasMoved = true;
        setResizing(true);
      }

      if (handle.dirY === 0) {
        const nextWidth = Math.round(Math.max(QUICK_TEXT_MIN_WIDTH, W + (handle.dirX * dx)));
        updateExistingCard(card.id, {
          autoWidth: false,
          width: nextWidth,
          x: handle.dirX < 0 ? Math.round(start.x + (W - nextWidth)) : start.x,
        });
        return;
      }

      const rawFactor = 1 + (((handle.dirX * dx * W) + (handle.dirY * dy * H)) / ((W * W) + (H * H)));
      const factor = clamp(rawFactor, TEXT_BOX_MIN_FONT_SIZE / start.fontSize, TEXT_BOX_MAX_FONT_SIZE / start.fontSize);
      updateExistingCard(card.id, {
        style: normalizeTextBoxStyle({ ...style, fontSize: start.fontSize * factor }),
        ...(start.fixedWidth ? { width: Math.round(start.fixedWidth * factor) } : null),
        x: handle.dirX < 0 ? Math.round(start.x + (W * (1 - factor))) : start.x,
        y: handle.dirY < 0 ? Math.round(start.y + (H * (1 - factor))) : start.y,
      });
    };

    const finish = (finishEvent) => {
      if (finishEvent?.pointerId !== undefined && finishEvent.pointerId !== start.pointerId) {
        return;
      }

      setResizing(false);
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
      className="card--text-box"
      renderHint={renderHint}
      tileState={isEditing ? "editing" : ""}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div
        ref={rootRef}
        className={[
          "quick-text",
          isEditing ? "quick-text--editing" : "",
          isAutoWidth ? "" : "quick-text--fixed",
          canvasToolMode === DRAWING_TOOL_MODE_TEXT ? "quick-text--text-tool" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Quick text"
        style={{
          width: isAutoWidth ? undefined : `${card.width}px`,
          "--quick-text-size": `${style.fontSize}px`,
        }}
        {...gesture}
        onPointerDown={handlePointerDown}
      >
        <div
          ref={textRef}
          className={`quick-text__text${isLegacyPlaceholder ? " quick-text__text--placeholder" : ""}`}
          role="textbox"
          aria-multiline="true"
          aria-label="Text"
          spellCheck={false}
          // Editable only while editing, so a click never drops a stray
          // caret and text can't be selected while dragging.
          contentEditable={isEditing ? "plaintext-only" : "false"}
          suppressContentEditableWarning
          style={{
            fontFamily: style.preset === "simple"
              ? `"Inter", ${getTextBoxFontFamily(style.preset)}`
              : getTextBoxFontFamily(style.preset),
            fontWeight: style.fontWeight,
            fontStyle: style.italic ? "italic" : "normal",
            textDecoration: getTextDecoration(style),
            textAlign: style.align,
            color: style.color,
            caretColor: style.color,
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing ? `calc(-0.005em + ${style.letterSpacing}px)` : "-0.005em",
          }}
          onKeyDown={isEditing ? handleTextKeyDown : undefined}
          onBlur={isEditing ? () => finishEditing() : undefined}
        />

        {showHandles ? RESIZE_HANDLES.map((handle) => (
          <span
            key={handle.key}
            className={`quick-text__handle quick-text__handle--${handle.key}`}
            aria-hidden="true"
            onPointerDown={(event) => handleResizePointerDown(handle, event)}
            // Double-clicking an edge handle goes back to auto-width.
            onDoubleClick={handle.dirY === 0 ? (event) => {
              event.stopPropagation();
              updateExistingCard(card.id, { autoWidth: true });
            } : undefined}
          />
        )) : null}

        {showToolbar ? (
          <FloatingFormatToolbar
            label="Text options"
            colors={TEXT_BOX_COLORS}
            colorColumns={4}
            color={style.color.toUpperCase()}
            sizes={TEXT_BOX_SIZE_OPTIONS}
            size={TEXT_BOX_SIZE_OPTIONS.some((option) => option.id === style.fontSize) ? style.fontSize : null}
            align={style.align}
            bold={isBold}
            italic={style.italic}
            onChange={handleToolbarChange}
          />
        ) : null}
      </div>
    </TileShell>
  );
}

export default memo(TextBoxTile);
