import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { useAppContext } from "../../context/useAppContext";
import {
  CANVAS_TEXT_MIN_HEIGHT,
  CANVAS_TEXT_MIN_WIDTH,
  CANVAS_TEXT_SOURCE_FILE,
  CANVAS_TEXT_SOURCE_LOCAL,
  CANVAS_TEXT_TITLE_MODE_DERIVED,
  CANVAS_TEXT_VARIANT_STICKY,
  deriveCanvasTextTitle,
} from "../../lib/canvasText";
import { desktop } from "../../lib/desktop";
import { renderSimpleMarkdown } from "../../lib/renderSimpleMarkdown";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { DRAWING_TOOL_MODE_SELECT } from "../../systems/drawing/drawingTypes";
import TileShell from "./TileShell";

const RESIZE_HANDLE_KEYS = [
  { key: "top-left", side: "left" },
  { key: "bottom-left", side: "left" },
  { key: "top-right", side: "right" },
  { key: "bottom-right", side: "right" },
];

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function defaultSourceStatus(source) {
  return source === CANVAS_TEXT_SOURCE_FILE
    ? { status: "loading", error: "" }
    : { status: "ready", error: "" };
}

function buildEditorExtensions({ onDocChange, onExit }) {
  return [
    history(),
    drawSelection(),
    closeBrackets(),
    markdown(),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: "true",
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
      "data-canvas-text-editor": "true",
    }),
    EditorView.domEventHandlers({
      keydown: (event) => {
        event.stopPropagation();
        return false;
      },
      pointerdown: (event) => {
        event.stopPropagation();
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChange(update.state.doc.toString(), update.view.contentHeight);
      }
    }),
    keymap.of([
      {
        key: "Escape",
        run: () => {
          onExit();
          return true;
        },
      },
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
  ];
}

function CanvasTextTile({
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
  viewportZoom,
  canvasToolMode,
  textBoxEditorState,
  onRequestTextBoxEdit,
  onEndTextBoxEdit,
}) {
  const { folderPath, setCanvasInteractionState, updateExistingCard } = useAppContext();
  const source = card.source === CANVAS_TEXT_SOURCE_FILE ? CANVAS_TEXT_SOURCE_FILE : CANVAS_TEXT_SOURCE_LOCAL;
  const variant = card.variant === CANVAS_TEXT_VARIANT_STICKY ? CANVAS_TEXT_VARIANT_STICKY : "default";
  const isSticky = variant === CANVAS_TEXT_VARIANT_STICKY;
  const isSelectToolActive = canvasToolMode === DRAWING_TOOL_MODE_SELECT;
  const isEditing = textBoxEditorState?.tileId === card.id;
  const [draftText, setDraftText] = useState(card.text ?? "");
  const [sourceStatus, setSourceStatus] = useState(defaultSourceStatus(source));
  const editorHostRef = useRef(null);
  const editorViewRef = useRef(null);
  const measureRef = useRef(null);
  const resizeStateRef = useRef(null);
  const actionInFlightRef = useRef(false);
  const title = useMemo(() => deriveCanvasTextTitle(card), [card]);
  const markdownPreview = useMemo(() => renderSimpleMarkdown(card.text ?? ""), [card.text]);
  const surfaceGesture = useTileGesture({
    card,
    canDrag: !isEditing && isSelectToolActive,
    onDoubleActivate: () => {
      onRequestTextBoxEdit?.(card.id, { selectAll: false });
    },
    onDragStart: onBeginDrag,
    onPressStart,
  });

  const refreshCardHeight = useCallback((measuredHeight = 0) => {
    const nextHeight = Math.max(
      CANVAS_TEXT_MIN_HEIGHT,
      Math.ceil(measuredHeight || measureRef.current?.getBoundingClientRect?.().height || 0) + 34,
    );

    if (Math.abs(nextHeight - (card.height ?? CANVAS_TEXT_MIN_HEIGHT)) > 1) {
      updateExistingCard(card.id, { height: nextHeight });
    }
  }, [card.height, card.id, updateExistingCard]);

  const applySourcePayload = useCallback((fileRecord) => {
    if (!fileRecord) {
      return;
    }

    const nextPatch = {
      text: fileRecord.content,
      file: fileRecord,
    };

    if (
      fileRecord.content !== card.text
      || fileRecord.fileName !== card.file?.fileName
      || fileRecord.relativePath !== card.file?.relativePath
      || fileRecord.updatedAt !== card.file?.updatedAt
    ) {
      updateExistingCard(card.id, nextPatch);
    }

    setDraftText(fileRecord.content);
  }, [card.file?.fileName, card.file?.relativePath, card.file?.updatedAt, card.id, card.text, updateExistingCard]);

  const loadSourceFile = useCallback(async () => {
    if (source !== CANVAS_TEXT_SOURCE_FILE || !folderPath || !card.file?.relativePath) {
      return;
    }

    setSourceStatus({ status: "loading", error: "" });

    try {
      const fileRecord = await desktop.workspace.readMarkdownFile(
        folderPath,
        card.file.filePath || card.file.relativePath,
      );
      setSourceStatus({ status: "ready", error: "" });
      if (!isEditing) {
        applySourcePayload(fileRecord);
      }
    } catch (error) {
      setSourceStatus({
        status: "error",
        error: error?.message || "Unable to load this Markdown file.",
      });
    }
  }, [applySourcePayload, card.file?.filePath, card.file?.relativePath, folderPath, isEditing, source]);

  useEffect(() => {
    setDraftText(card.text ?? "");
  }, [card.text, isEditing]);

  useEffect(() => {
    setSourceStatus(defaultSourceStatus(source));
  }, [source, card.id]);

  useEffect(() => {
    if (source === CANVAS_TEXT_SOURCE_FILE && !isEditing) {
      void loadSourceFile();
    }
  }, [isEditing, loadSourceFile, source]);

  useEffect(() => {
    if (source !== CANVAS_TEXT_SOURCE_FILE || !card.file?.filePath) {
      return undefined;
    }

    void desktop.workspace.watchMarkdownFile(card.file.filePath).catch(() => {});
    const unsubscribe = desktop.workspace.onMarkdownFileChanged((payload) => {
      if (!payload?.filePath || payload.filePath !== card.file.filePath || isEditing) {
        return;
      }

      void loadSourceFile();
    });

    return () => {
      unsubscribe?.();
      void desktop.workspace.unwatchMarkdownFile(card.file.filePath).catch(() => {});
    };
  }, [card.file?.filePath, isEditing, loadSourceFile, source]);

  useEffect(() => {
    setCanvasInteractionState?.(isEditing);
    return () => {
      setCanvasInteractionState?.(false);
    };
  }, [isEditing, setCanvasInteractionState]);

  useLayoutEffect(() => {
    if (!measureRef.current || isEditing) {
      return;
    }

    refreshCardHeight();
  }, [card.text, card.width, isEditing, markdownPreview, refreshCardHeight, title]);

  const exitEditMode = useCallback(async ({ restoreCanvasFocus = false } = {}) => {
    if (actionInFlightRef.current) {
      return;
    }

    actionInFlightRef.current = true;
    const nextText = draftText;

    try {
      if (source === CANVAS_TEXT_SOURCE_FILE && folderPath && card.file?.relativePath) {
        const fileRecord = await desktop.workspace.writeMarkdownFile(
          folderPath,
          card.file.filePath || card.file.relativePath,
          nextText,
        );
        applySourcePayload(fileRecord);
        setSourceStatus({ status: "ready", error: "" });
      } else if (nextText !== card.text) {
        updateExistingCard(card.id, { text: nextText });
      }
    } catch (error) {
      setSourceStatus({
        status: "error",
        error: error?.message || "Unable to save this Markdown note.",
      });
    } finally {
      actionInFlightRef.current = false;
      onEndTextBoxEdit?.(card.id, { restoreCanvasFocus });
    }
  }, [applySourcePayload, card.file?.filePath, card.file?.relativePath, card.id, card.text, draftText, folderPath, onEndTextBoxEdit, source, updateExistingCard]);

  useEffect(() => {
    if (!isEditing || !editorHostRef.current) {
      editorViewRef.current?.destroy?.();
      editorViewRef.current = null;
      return undefined;
    }

    const initialText = typeof textBoxEditorState?.replacementText === "string"
      ? textBoxEditorState.replacementText
      : (card.text ?? "");
    setDraftText(initialText);

    const view = new EditorView({
      state: EditorState.create({
        doc: initialText,
        extensions: buildEditorExtensions({
          onDocChange: (nextText, contentHeight) => {
            setDraftText(nextText);
            refreshCardHeight(contentHeight);
          },
          onExit: () => {
            void exitEditMode({ restoreCanvasFocus: true });
          },
        }),
      }),
      parent: editorHostRef.current,
    });

    const focusTimer = window.requestAnimationFrame(() => {
      view.focus();
      const selectionRange = textBoxEditorState?.selectAll === true
        ? { anchor: 0, head: view.state.doc.length }
        : { anchor: view.state.doc.length };
      view.dispatch({ selection: selectionRange });
      refreshCardHeight(view.contentHeight);
    });

    const handleFocusOut = (event) => {
      const nextFocusTarget = event.relatedTarget;
      if (nextFocusTarget instanceof Element && nextFocusTarget.closest("[data-canvas-text-action-root='true']")) {
        return;
      }

      void exitEditMode();
    };

    view.dom.addEventListener("focusout", handleFocusOut);
    editorViewRef.current = view;

    return () => {
      window.cancelAnimationFrame(focusTimer);
      view.dom.removeEventListener("focusout", handleFocusOut);
      view.destroy();
      editorViewRef.current = null;
    };
  }, [card.text, exitEditMode, isEditing, refreshCardHeight, textBoxEditorState?.replacementText, textBoxEditorState?.selectAll]);

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
      const nextWidth = clamp(Math.round(resizeState.startWidth + widthDelta), CANVAS_TEXT_MIN_WIDTH, 1600);
      const nextX = resizeState.side === "left"
        ? Math.round(resizeState.startX + (resizeState.startWidth - nextWidth))
        : resizeState.startX;

      updateExistingCard(card.id, resizeState.side === "left"
        ? { x: nextX, width: nextWidth }
        : { width: nextWidth });
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

  const handleConvertToFile = async () => {
    if (!folderPath) {
      return;
    }

    try {
      const fileRecord = await desktop.workspace.createMarkdownFile(
        folderPath,
        title,
        card.text ?? "",
        "",
      );
      updateExistingCard(card.id, {
        source: CANVAS_TEXT_SOURCE_FILE,
        file: fileRecord,
        text: fileRecord.content,
        titleMode: card.titleMode || CANVAS_TEXT_TITLE_MODE_DERIVED,
      });
      setSourceStatus({ status: "ready", error: "" });
    } catch (error) {
      setSourceStatus({
        status: "error",
        error: error?.message || "Unable to convert this card to a Markdown file.",
      });
    }
  };

  const handleSwapSource = async () => {
    const selectedPaths = await desktop.workspace.openFiles();
    const markdownPath = selectedPaths.find((candidate) => /\.md$/i.test(candidate));

    if (!markdownPath || !folderPath) {
      return;
    }

    try {
      const existingItem = await desktop.workspace.getItemForFilePath(folderPath, markdownPath).catch(() => null);
      const sourcePath = existingItem?.filePath || markdownPath;
      const fileRecord = existingItem?.filePath
        ? await desktop.workspace.readMarkdownFile(folderPath, sourcePath)
        : await desktop.workspace.readMarkdownFile(
          folderPath,
          (await desktop.workspace.importFiles(folderPath, [markdownPath], ""))?.[0]?.filePath ?? "",
        );
      updateExistingCard(card.id, {
        source: CANVAS_TEXT_SOURCE_FILE,
        file: fileRecord,
        text: fileRecord.content,
      });
      setSourceStatus({ status: "ready", error: "" });
    } catch (error) {
      setSourceStatus({
        status: "error",
        error: error?.message || "Unable to swap the note source.",
      });
    }
  };

  const handleOpenSource = async () => {
    if (!folderPath || !card.file?.relativePath) {
      return;
    }

    const item = await desktop.workspace.getItemForFilePath(folderPath, card.file.relativePath).catch(() => null);
    if (item?.filePath) {
      await desktop.workspace.openFile(item.filePath);
    }
  };

  const showActionRow = tileMeta?.isSelected && !isEditing;
  const showResizeHandles = tileMeta?.isSelected && !isEditing;
  const actionStrip = showActionRow ? (
    <div className="card__quick-actions" data-canvas-text-action-root="true" onPointerDown={stopInteractivePointer}>
      <button
        type="button"
        className="card__quick-action"
        onClick={() => onRequestTextBoxEdit?.(card.id, { selectAll: false })}
      >
        Edit
      </button>
      {source === CANVAS_TEXT_SOURCE_FILE ? (
        <>
          <button type="button" className="card__quick-action" onClick={handleOpenSource}>Open</button>
          <button type="button" className="card__quick-action" onClick={handleSwapSource}>Swap</button>
        </>
      ) : (
        <button type="button" className="card__quick-action" onClick={handleConvertToFile}>Convert</button>
      )}
    </div>
  ) : null;
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    "card__surface-frame--canvas-text",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
    isEditing ? "card__surface-frame--editing" : "",
  ].filter(Boolean).join(" ");

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--canvas-text"
      actionStrip={actionStrip}
      tileState={isEditing ? "editing" : ""}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section
            className={`card__surface card__surface--canvas-text${isSticky ? " card__surface--canvas-text-sticky" : ""}`}
            aria-label={isSticky ? "Sticky note" : "Canvas text card"}
          >
            <header className="card__canvas-text-header" data-canvas-text-action-root="true">
              <div className="card__canvas-text-heading">
                <div className="card__canvas-text-title">{title}</div>
                <div className="card__canvas-text-meta">
                  {source === CANVAS_TEXT_SOURCE_FILE ? "Markdown file" : isSticky ? "Sticky note" : "Markdown card"}
                </div>
              </div>
            </header>

            <div className="card__canvas-text-body-shell" onPointerDown={stopInteractivePointer}>
              {isEditing ? (
                <div ref={editorHostRef} className="card__canvas-text-editor" />
              ) : sourceStatus.status === "error" ? (
                <div className="card__canvas-text-error">
                  <p>{sourceStatus.error}</p>
                  <div className="card__canvas-text-error-actions">
                    <button type="button" className="card__canvas-text-action" onClick={() => void loadSourceFile()}>
                      Retry
                    </button>
                    {source === CANVAS_TEXT_SOURCE_FILE ? (
                      <button type="button" className="card__canvas-text-action" onClick={handleOpenSource}>
                        Open file
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={`card__canvas-text-preview${isSticky ? " card__canvas-text-preview--sticky" : ""}`}>
                  {String(card.text ?? "").trim().length > 0 ? (
                    markdownPreview
                  ) : (
                    <p className="card__canvas-text-empty">Double click to start writing Markdown.</p>
                  )}
                </div>
              )}
            </div>

            <div ref={measureRef} className="card__canvas-text-measure" aria-hidden="true">
              <div className="card__canvas-text-header">
                <div className="card__canvas-text-heading">
                  <div className="card__canvas-text-title">{title}</div>
                </div>
              </div>
              <div className={`card__canvas-text-preview${isSticky ? " card__canvas-text-preview--sticky" : ""}`}>
                {String(card.text ?? "").trim().length > 0 ? markdownPreview : <p>Double click to start writing Markdown.</p>}
              </div>
            </div>
          </section>
          {showResizeHandles ? (
            RESIZE_HANDLE_KEYS.map((handle) => (
              <button
                key={handle.key}
                type="button"
                className={`card__text-box-resize-handle card__text-box-resize-handle--${handle.key}`}
                aria-label={`Resize text card from ${handle.key}`}
                onPointerDown={(event) => handleResizePointerDown(handle.side, event)}
              />
            ))
          ) : null}
        </div>
      </div>
    </TileShell>
  );
}

export default memo(CanvasTextTile);
