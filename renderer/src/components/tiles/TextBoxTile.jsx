import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import {
  getTextBoxFontFamily,
  normalizeTextBoxStyle,
  TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT,
  TEXT_BOX_DEFAULT_TEXT,
} from "../../lib/textBoxStyle";
import {
  recordTextTileMeasurePass,
  recordTextTileRenderSample,
  recordTextTileSizeWrite,
} from "../../lib/perf";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { DRAWING_TOOL_MODE_SELECT, DRAWING_TOOL_MODE_TEXT } from "../../systems/drawing/drawingTypes";
import TileShell from "./TileShell";

const MIN_TEXT_BOX_WIDTH = 140;
const MAX_TEXT_BOX_WIDTH = 1600;
const MIN_TEXT_BOX_HEIGHT = 52;
const TEXT_BOX_VERTICAL_PADDING = 8;
const TEXT_BOX_HORIZONTAL_PADDING = 2;
const TEXT_BOX_HEIGHT_EPSILON = 1;
const TEXT_BOX_WIDTH_EPSILON = 0.5;
const TEXT_BOX_RESIZE_HANDLES = [
  { key: "top-left", side: "left" },
  { key: "bottom-left", side: "left" },
  { key: "top-right", side: "right" },
  { key: "bottom-right", side: "right" },
];

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function getMeasuredTextBoxHeight(measureElement) {
  if (!measureElement) {
    return MIN_TEXT_BOX_HEIGHT;
  }

  return Math.max(
    MIN_TEXT_BOX_HEIGHT,
    Math.ceil(measureElement.getBoundingClientRect().height + (TEXT_BOX_VERTICAL_PADDING * 2)),
  );
}

function getMeasuredTextBoxWidth(measureElement) {
  if (!measureElement) {
    return MIN_TEXT_BOX_WIDTH;
  }

  return Math.max(
    MIN_TEXT_BOX_WIDTH,
    Math.ceil(measureElement.scrollWidth + (TEXT_BOX_HORIZONTAL_PADDING * 2)),
  );
}

function stopInteractivePointer(event) {
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
  performanceMode,
  viewportZoom,
  canvasToolMode,
  textBoxEditorState,
  onRequestTextBoxEdit,
  onEndTextBoxEdit,
}) {
  const { setCanvasInteractionState, updateExistingCard } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const placeholderText = typeof card.placeholderText === "string" && card.placeholderText.length > 0
    ? card.placeholderText
    : TEXT_BOX_DEFAULT_PLACEHOLDER_TEXT;
  const appearance = card.appearance === "sticky" ? "sticky" : "plain";
  const [draftText, setDraftText] = useState(card.text ?? placeholderText);
  const textareaRef = useRef(null);
  const measureRef = useRef(null);
  const editRequestIdRef = useRef(null);
  const resizeStateRef = useRef(null);
  const pendingHeightWriteRef = useRef(null);
  const pendingHeightRafRef = useRef(0);
  const latestAppliedSizeRef = useRef({ width: card.width, height: card.height });
  const deferredMeasurePendingRef = useRef(false);
  const isMoving = performanceMode?.simplifyDuringMotion === true;
  const isPassiveTextDisplay = !isEditing;
  const normalizedStyle = useMemo(() => normalizeTextBoxStyle(card.style), [card.style]);
  const isPlainTextLayer = appearance !== "sticky";
  const isSelectToolActive = canvasToolMode === DRAWING_TOOL_MODE_SELECT;
  const isTextToolActive = canvasToolMode === DRAWING_TOOL_MODE_TEXT;
  const isAutoWidth = isPlainTextLayer && card.autoWidth !== false;
  const isPlaceholderText = card.placeholder === true && !isEditing;
  const displayText = isPlaceholderText ? placeholderText : (card.text ?? "");
  const measuredText = isEditing ? draftText : displayText;

  function syncEditorHeight(textarea) {
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  const growTextBoxHeight = useCallback((nextHeight) => {
    const currentHeight = Number.isFinite(card.height) ? card.height : MIN_TEXT_BOX_HEIGHT;
    if (nextHeight <= currentHeight + TEXT_BOX_HEIGHT_EPSILON) {
      return;
    }

    pendingHeightWriteRef.current = nextHeight;
    if (pendingHeightRafRef.current) {
      return;
    }

    pendingHeightRafRef.current = requestAnimationFrame(() => {
      pendingHeightRafRef.current = 0;
      const queuedHeight = pendingHeightWriteRef.current;
      pendingHeightWriteRef.current = null;
      if (!Number.isFinite(queuedHeight)) {
        return;
      }
      recordTextTileSizeWrite();
      updateExistingCard(card.id, { height: queuedHeight });
    });
  }, [card.height, card.id, updateExistingCard]);

  const surfaceGesture = useTileGesture({
    card,
    canDrag: !isEditing && isSelectToolActive,
    onActivate: () => {
      if (isTextToolActive) {
        onRequestTextBoxEdit(card.id, { selectAll: false });
      }
    },
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
    appearance === "sticky" ? "card__surface-frame--text-box-sticky" : "",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
    isEditing ? "card__surface-frame--editing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const textStyle = useMemo(() => ({
    fontFamily: getTextBoxFontFamily(normalizedStyle.preset),
    fontSize: `${normalizedStyle.fontSize}px`,
    fontWeight: normalizedStyle.fontWeight,
    fontStyle: normalizedStyle.italic ? "italic" : "normal",
    textDecoration: getTextDecoration(normalizedStyle),
    textAlign: normalizedStyle.align,
    color: normalizedStyle.color,
    lineHeight: normalizedStyle.lineHeight,
    letterSpacing: `${normalizedStyle.letterSpacing}px`,
    opacity: isPlaceholderText ? 0.5 : 1,
  }), [isPlaceholderText, normalizedStyle]);

  useLayoutEffect(() => {
    syncEditorHeight(textareaRef.current);
  }, [draftText, normalizedStyle, card.width]);

  useLayoutEffect(() => {
    if (!measureRef.current || (appearance === "sticky" && isEditing)) {
      return;
    }
    if (isMoving) {
      deferredMeasurePendingRef.current = true;
      return;
    }

    recordTextTileMeasurePass();
    const nextPatch = {};
    const nextHeight = getMeasuredTextBoxHeight(measureRef.current);
    const currentHeight = Number.isFinite(card.height) ? card.height : MIN_TEXT_BOX_HEIGHT;
    const lastAppliedSize = latestAppliedSizeRef.current;

    if (
      Math.abs(nextHeight - currentHeight) > TEXT_BOX_HEIGHT_EPSILON
      && Math.abs(nextHeight - (lastAppliedSize.height ?? currentHeight)) > TEXT_BOX_HEIGHT_EPSILON
    ) {
      nextPatch.height = nextHeight;
    }

    if (isAutoWidth) {
      const nextWidth = clamp(getMeasuredTextBoxWidth(measureRef.current), MIN_TEXT_BOX_WIDTH, MAX_TEXT_BOX_WIDTH);

      if (
        Math.abs(nextWidth - card.width) > TEXT_BOX_WIDTH_EPSILON
        && Math.abs(nextWidth - (lastAppliedSize.width ?? card.width)) > TEXT_BOX_WIDTH_EPSILON
      ) {
        nextPatch.width = nextWidth;
      }
    }

    if (Object.keys(nextPatch).length > 0) {
      latestAppliedSizeRef.current = {
        width: Number.isFinite(nextPatch.width) ? nextPatch.width : card.width,
        height: Number.isFinite(nextPatch.height) ? nextPatch.height : currentHeight,
      };
      recordTextTileSizeWrite();
      updateExistingCard(card.id, nextPatch);
    }
  }, [appearance, card.height, card.id, card.width, isAutoWidth, isEditing, isMoving, measuredText, normalizedStyle, updateExistingCard]);

  useEffect(() => {
    if (isMoving || !deferredMeasurePendingRef.current) {
      return;
    }
    deferredMeasurePendingRef.current = false;
    if (!measureRef.current || (appearance === "sticky" && isEditing)) {
      return;
    }
    recordTextTileMeasurePass();
    const nextPatch = {};
    const nextHeight = getMeasuredTextBoxHeight(measureRef.current);
    const currentHeight = Number.isFinite(card.height) ? card.height : MIN_TEXT_BOX_HEIGHT;
    if (Math.abs(nextHeight - currentHeight) > TEXT_BOX_HEIGHT_EPSILON) {
      nextPatch.height = nextHeight;
    }
    if (isAutoWidth) {
      const nextWidth = clamp(getMeasuredTextBoxWidth(measureRef.current), MIN_TEXT_BOX_WIDTH, MAX_TEXT_BOX_WIDTH);
      if (Math.abs(nextWidth - card.width) > TEXT_BOX_WIDTH_EPSILON) {
        nextPatch.width = nextWidth;
      }
    }
    if (Object.keys(nextPatch).length > 0) {
      latestAppliedSizeRef.current = {
        width: Number.isFinite(nextPatch.width) ? nextPatch.width : card.width,
        height: Number.isFinite(nextPatch.height) ? nextPatch.height : currentHeight,
      };
      recordTextTileSizeWrite();
      updateExistingCard(card.id, nextPatch);
    }
  }, [appearance, card.height, card.id, card.width, isAutoWidth, isEditing, isMoving, updateExistingCard]);

  useEffect(() => {
    recordTextTileRenderSample({ isMoving });
  }, [card.id, isMoving, measuredText, isEditing, card.width, card.height]);

  useEffect(() => {
    return () => {
      if (pendingHeightRafRef.current) {
        cancelAnimationFrame(pendingHeightRafRef.current);
        pendingHeightRafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(card.text ?? placeholderText);
    }
  }, [card.text, isEditing, placeholderText]);

  useEffect(() => {
    if (!textBoxEditorState || textBoxEditorState.requestId === editRequestIdRef.current) {
      return;
    }

    editRequestIdRef.current = textBoxEditorState.requestId;
    setDraftText(
      typeof textBoxEditorState.replacementText === "string"
        ? textBoxEditorState.replacementText
        : (card.placeholder === true ? "" : (card.text ?? placeholderText)),
    );
    setIsEditing(true);
  }, [card.placeholder, card.text, placeholderText, textBoxEditorState]);

  useEffect(() => {
    if (!isEditing || !textareaRef.current) {
      return undefined;
    }

    const textarea = textareaRef.current;
    const frame = requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      syncEditorHeight(textarea);

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
    const trimmedDraftText = typeof draftText === "string" ? draftText.trim() : "";
    const nextPlaceholder = trimmedDraftText.length === 0
      || (card.placeholder === true && draftText === placeholderText);
    const nextText = nextPlaceholder
      ? placeholderText
      : (typeof draftText === "string" && draftText.length > 0 ? draftText : TEXT_BOX_DEFAULT_TEXT);

    if (
      nextText !== card.text
      || nextPlaceholder !== (card.placeholder === true)
      || placeholderText !== card.placeholderText
    ) {
      updateExistingCard(card.id, {
        text: nextText,
        placeholder: nextPlaceholder,
        placeholderText,
      });
    }
  };

  const exitEditMode = ({ save = true, restoreCanvasFocus = false } = {}) => {
    if (save) {
      commitDraft();
    }

    setIsEditing(false);
    onEndTextBoxEdit?.(card.id, { restoreCanvasFocus });
  };

  const handleEditorBlur = (event) => {
    const nextFocusTarget = event.relatedTarget;

    if (nextFocusTarget instanceof Element && nextFocusTarget.closest("[data-text-toolbar-root='true']")) {
      return;
    }

    exitEditMode({ save: true });
  };

  const handleEditorKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      exitEditMode({ save: true, restoreCanvasFocus: true });
    }
  };

  const handleResizePointerDown = (side, event) => {
    if (!tileMeta?.isSelected || isEditing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const zoom = Math.max(0.2, viewportZoom ?? 1);
    resizeStateRef.current = {
      side,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startX: card.x,
      startWidth: card.width,
    };
    setCanvasInteractionState?.(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const handlePointerMove = (moveEvent) => {
      const resizeState = resizeStateRef.current;

      if (!resizeState || resizeState.pointerId !== moveEvent.pointerId) {
        return;
      }

      const deltaX = (moveEvent.clientX - resizeState.startClientX) / zoom;
      const widthDelta = resizeState.side === "left" ? -deltaX : deltaX;
      const nextWidth = clamp(Math.round(resizeState.startWidth + widthDelta), MIN_TEXT_BOX_WIDTH, MAX_TEXT_BOX_WIDTH);
      const nextX = resizeState.side === "left"
        ? Math.round(resizeState.startX + (resizeState.startWidth - nextWidth))
        : resizeState.startX;

      if (
        Math.abs(nextWidth - card.width) > TEXT_BOX_WIDTH_EPSILON
        || (resizeState.side === "left" && nextX !== card.x)
      ) {
        updateExistingCard(card.id, resizeState.side === "left"
          ? { x: nextX, width: nextWidth, autoWidth: false }
          : { width: nextWidth, autoWidth: false });
      }
    };

    const finishResize = (finishEvent) => {
      const resizeState = resizeStateRef.current;

      if (!resizeState || (finishEvent && resizeState.pointerId !== finishEvent.pointerId)) {
        return;
      }

      resizeStateRef.current = null;
      setCanvasInteractionState?.(false);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", finishResize, true);
      window.removeEventListener("pointercancel", finishResize, true);
      window.removeEventListener("blur", finishResize);
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", finishResize, true);
    window.addEventListener("pointercancel", finishResize, true);
    window.addEventListener("blur", finishResize);
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
          <section className={`card__surface card__surface--text-box${appearance === "sticky" ? " card__surface--text-box-sticky" : ""}${isPassiveTextDisplay ? " card__surface--text-box-passive" : ""}${isMoving && isPassiveTextDisplay ? " card__surface--text-box-passive-moving" : ""}`} aria-label={appearance === "sticky" ? "Sticky note" : "Canvas text box"}>
            {isEditing ? (
              <textarea
                ref={textareaRef}
                className={`card__text-box-editor${appearance === "sticky" ? " card__text-box-editor--sticky" : ""}${isAutoWidth ? " card__text-box-editor--auto-width" : ""}`}
                value={draftText}
                aria-label="Canvas text box editor"
                spellCheck={false}
                rows={1}
                style={textStyle}
                onPointerDown={stopInteractivePointer}
                onClick={stopInteractivePointer}
                onKeyDown={handleEditorKeyDown}
                onBlur={handleEditorBlur}
                onChange={(event) => {
                  setDraftText(event.target.value);
                  syncEditorHeight(event.target);
                  if (!isPlainTextLayer) {
                    growTextBoxHeight(Math.max(MIN_TEXT_BOX_HEIGHT, event.target.scrollHeight + TEXT_BOX_VERTICAL_PADDING));
                  }
                }}
              />
            ) : (
              <div
                className={`card__text-box-display${isPlaceholderText ? " card__text-box-display--placeholder" : ""}${appearance === "sticky" ? " card__text-box-display--sticky" : ""}${isAutoWidth ? " card__text-box-display--auto-width" : ""}`}
                style={textStyle}
              >
                {displayText}
              </div>
            )}
            {!isMoving ? (
              <div
                ref={measureRef}
                className={`card__text-box-measure${appearance === "sticky" ? " card__text-box-measure--sticky" : ""}`}
                aria-hidden="true"
                style={textStyle}
              >
                {measuredText}
              </div>
            ) : null}
          </section>
          {tileMeta?.isSelected && !isEditing && isPlainTextLayer ? (
            TEXT_BOX_RESIZE_HANDLES.map((handle) => (
              <button
                key={handle.key}
                type="button"
                className={`card__text-box-resize-handle card__text-box-resize-handle--${handle.key}`}
                aria-label={`Resize text box from ${handle.key}`}
                onPointerDown={(event) => handleResizePointerDown(handle.side, event)}
              />
            ))
          ) : null}
        </div>
      </div>
    </TileShell>
  );
}

export default memo(TextBoxTile);
