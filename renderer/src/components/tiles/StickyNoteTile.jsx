import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import {
  CANVAS_TEXT_SOURCE_FILE,
  CANVAS_TEXT_SOURCE_LOCAL,
  CANVAS_TEXT_TITLE_MODE_CUSTOM,
  STICKY_NOTE_BODY_PLACEHOLDER,
  STICKY_NOTE_TITLE_PLACEHOLDER,
  composeStickyNoteFileContent,
  deriveStickyNoteDocument,
  deriveStickyNoteFileDocument,
  deriveStickyNoteViewModel,
  getStickyNoteNormalizationPatch,
  resolveStickyNoteLayoutMetrics,
} from "../../lib/canvasText";
import { desktop } from "../../lib/desktop";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { DRAWING_TOOL_MODE_SELECT } from "../../systems/drawing/drawingTypes";
import TileShell from "./TileShell";

function defaultSourceStatus(source) {
  return source === CANVAS_TEXT_SOURCE_FILE
    ? { status: "loading", error: "" }
    : { status: "ready", error: "" };
}

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function buildStickySurfaceStyle(layoutMetrics) {
  return {
    "--sticky-gap": `${layoutMetrics.gap}px`,
    "--sticky-chamfer": `${layoutMetrics.chamfer}px`,
    "--sticky-header-height": `${layoutMetrics.headerHeight}px`,
    "--sticky-footer-height": `${layoutMetrics.footerHeight}px`,
    "--sticky-header-padding-x": `${layoutMetrics.headerPaddingX}px`,
    "--sticky-header-padding-top": `${layoutMetrics.headerPaddingTop}px`,
    "--sticky-header-padding-bottom": `${layoutMetrics.headerPaddingBottom}px`,
    "--sticky-body-padding-x": `${layoutMetrics.bodyPaddingX}px`,
    "--sticky-body-padding-top": `${layoutMetrics.bodyPaddingTop}px`,
    "--sticky-body-padding-bottom": `${layoutMetrics.bodyPaddingBottom}px`,
    "--sticky-footer-padding-x": `${layoutMetrics.footerPaddingX}px`,
    "--sticky-footer-padding-top": `${layoutMetrics.footerPaddingTop}px`,
    "--sticky-footer-padding-bottom": `${layoutMetrics.footerPaddingBottom}px`,
    "--sticky-title-font-size": `${layoutMetrics.titleFontSize}px`,
    "--sticky-body-font-size": `${layoutMetrics.bodyFontSize}px`,
    "--sticky-footer-font-size": `${layoutMetrics.footerFontSize}px`,
    "--sticky-body-line-height": `${layoutMetrics.bodyLineHeight}px`,
    "--sticky-footer-line-height": `${layoutMetrics.footerLineHeight}px`,
    "--sticky-compact-bar-height": `${layoutMetrics.compactBarHeight}px`,
    "--sticky-compact-bar-gap": `${layoutMetrics.compactBarGap}px`,
  };
}

function StickyNoteTile({
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
  const { folderPath, setCanvasInteractionState, updateExistingCard } = useAppContext();
  const source = card.source === CANVAS_TEXT_SOURCE_FILE ? CANVAS_TEXT_SOURCE_FILE : CANVAS_TEXT_SOURCE_LOCAL;
  const isEditing = textBoxEditorState?.tileId === card.id;
  const isSelectToolActive = canvasToolMode === DRAWING_TOOL_MODE_SELECT;
  const renderState = isEditing ? "detail" : (renderHint?.renderState ?? "detail");
  const isCompact = renderState === "compact";
  const normalizedStickyDocument = useMemo(() => deriveStickyNoteDocument(card), [card]);
  const [draftTitle, setDraftTitle] = useState(() => normalizedStickyDocument.title);
  const [draftBody, setDraftBody] = useState(() => normalizedStickyDocument.bodyText);
  const [sourceStatus, setSourceStatus] = useState(defaultSourceStatus(source));
  const titleInputRef = useRef(null);
  const bodyTextareaRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const viewModel = useMemo(() => (
    deriveStickyNoteViewModel(isEditing
      ? {
        ...card,
        title: draftTitle,
        text: draftBody,
        titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM,
      }
      : card)
  ), [card, draftBody, draftTitle, isEditing]);
  const surfaceLayout = useMemo(
    () => resolveStickyNoteLayoutMetrics(card.width, card.height, renderState),
    [card.height, card.width, renderState],
  );
  const surfaceStyle = useMemo(() => buildStickySurfaceStyle(surfaceLayout), [surfaceLayout]);
  const hasTitle = viewModel.title.trim().length > 0;
  const hasFooterCopy = viewModel.detailFooterLines.length > 0;
  const footerText = hasFooterCopy ? viewModel.detailFooterLines.join(" ") : STICKY_NOTE_BODY_PLACEHOLDER;
  const surfaceGesture = useTileGesture({
    card,
    canDrag: !isEditing && isSelectToolActive,
    onDoubleActivate: () => {
      onRequestTextBoxEdit?.(card.id, { selectAll: false });
    },
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    "card__surface-frame--sticky-note",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
    isEditing ? "card__surface-frame--editing" : "",
  ].filter(Boolean).join(" ");

  const applySourcePayload = useCallback((fileRecord) => {
    if (!fileRecord) {
      return;
    }

    const stickyDocument = deriveStickyNoteFileDocument(
      fileRecord.content,
      typeof card.title === "string" ? card.title : "",
    );
    const nextPatch = {
      title: stickyDocument.title,
      text: stickyDocument.bodyText,
      titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM,
      file: fileRecord,
    };

    if (
      stickyDocument.title !== (typeof card.title === "string" ? card.title : "")
      || stickyDocument.bodyText !== (card.text ?? "")
      || card.titleMode !== CANVAS_TEXT_TITLE_MODE_CUSTOM
      || fileRecord.fileName !== card.file?.fileName
      || fileRecord.relativePath !== card.file?.relativePath
      || fileRecord.updatedAt !== card.file?.updatedAt
    ) {
      updateExistingCard(card.id, nextPatch);
    }

    setDraftTitle(stickyDocument.title);
    setDraftBody(stickyDocument.bodyText);
  }, [card.file?.fileName, card.file?.relativePath, card.file?.updatedAt, card.id, card.text, card.title, card.titleMode, updateExistingCard]);

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
        error: error?.message || "Unable to load this sticky note.",
      });
    }
  }, [applySourcePayload, card.file?.filePath, card.file?.relativePath, folderPath, isEditing, source]);

  useEffect(() => {
    if (isEditing) {
      return;
    }

    const normalizationPatch = getStickyNoteNormalizationPatch(card);
    if (normalizationPatch) {
      updateExistingCard(card.id, normalizationPatch);
    }
  }, [card, isEditing, updateExistingCard]);

  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(normalizedStickyDocument.title);
      setDraftBody(normalizedStickyDocument.bodyText);
    }
  }, [isEditing, normalizedStickyDocument.bodyText, normalizedStickyDocument.title]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    setDraftTitle(normalizedStickyDocument.title);
    setDraftBody(
      typeof textBoxEditorState?.replacementText === "string"
        ? textBoxEditorState.replacementText
        : normalizedStickyDocument.bodyText,
    );
  }, [card.id, isEditing, normalizedStickyDocument.bodyText, normalizedStickyDocument.title, textBoxEditorState?.replacementText, textBoxEditorState?.requestId]);

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

  useEffect(() => {
    if (!isEditing) {
      return undefined;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const shouldFocusTitle = typeof textBoxEditorState?.replacementText !== "string"
        && normalizedStickyDocument.title.trim().length === 0
        && normalizedStickyDocument.bodyText.trim().length === 0;
      const target = shouldFocusTitle ? titleInputRef.current : bodyTextareaRef.current;
      target?.focus?.({ preventScroll: true });

      if (typeof target?.setSelectionRange !== "function") {
        return;
      }

      if (textBoxEditorState?.selectAll === true) {
        target.setSelectionRange(0, target.value.length);
        return;
      }

      const caret = target.value.length;
      target.setSelectionRange(caret, caret);
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [isEditing, normalizedStickyDocument.bodyText, normalizedStickyDocument.title, textBoxEditorState?.replacementText, textBoxEditorState?.selectAll]);

  const exitEditMode = useCallback(async ({ restoreCanvasFocus = false } = {}) => {
    if (saveInFlightRef.current) {
      return;
    }

    saveInFlightRef.current = true;
    const nextTitle = typeof draftTitle === "string" ? draftTitle.trim() : "";
    const nextBody = typeof draftBody === "string" ? draftBody.replaceAll("\r\n", "\n") : "";

    try {
      if (source === CANVAS_TEXT_SOURCE_FILE && folderPath && card.file?.relativePath) {
        const fileRecord = await desktop.workspace.writeMarkdownFile(
          folderPath,
          card.file.filePath || card.file.relativePath,
          composeStickyNoteFileContent(nextTitle, nextBody),
        );
        applySourcePayload(fileRecord);
        setSourceStatus({ status: "ready", error: "" });
      } else {
        const nextPatch = {};

        if (nextTitle !== (typeof card.title === "string" ? card.title : "")) {
          nextPatch.title = nextTitle;
        }

        if (nextBody !== (card.text ?? "")) {
          nextPatch.text = nextBody;
        }

        if (card.titleMode !== CANVAS_TEXT_TITLE_MODE_CUSTOM) {
          nextPatch.titleMode = CANVAS_TEXT_TITLE_MODE_CUSTOM;
        }

        if (Object.keys(nextPatch).length > 0) {
          updateExistingCard(card.id, nextPatch);
        }
      }
    } catch (error) {
      setSourceStatus({
        status: "error",
        error: error?.message || "Unable to save this sticky note.",
      });
    } finally {
      saveInFlightRef.current = false;
      onEndTextBoxEdit?.(card.id, { restoreCanvasFocus });
    }
  }, [applySourcePayload, card.file?.filePath, card.file?.relativePath, card.id, card.text, card.title, card.titleMode, draftBody, draftTitle, folderPath, onEndTextBoxEdit, source, updateExistingCard]);

  const handleEditorBlur = (event) => {
    const nextFocusTarget = event.relatedTarget;

    if (
      nextFocusTarget instanceof Element
      && (
        nextFocusTarget.closest("[data-sticky-note-editor-root='true']")
        || nextFocusTarget.closest("[data-sticky-note-action-root='true']")
      )
    ) {
      return;
    }

    void exitEditMode();
  };

  const handleEditorKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void exitEditMode({ restoreCanvasFocus: true });
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void exitEditMode({ restoreCanvasFocus: true });
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

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--sticky-note"
      renderHint={renderHint}
      tileState={isEditing ? "editing" : ""}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section
            className={`card__surface card__surface--sticky-note${isCompact ? " card__surface--sticky-note-compact" : ""}${isEditing ? " card__surface--sticky-note-editing" : ""}`}
            aria-label="Sticky note"
            data-sticky-note-editor-root="true"
            style={surfaceStyle}
          >
            <header className="card__sticky-note-header">
              {isCompact ? (
                <div className="card__sticky-note-title-spacer" aria-hidden="true" />
              ) : isEditing ? (
                <input
                  ref={titleInputRef}
                  className={`card__sticky-note-title card__sticky-note-title-input${draftTitle.trim().length > 0 ? "" : " card__sticky-note-title--placeholder"}`}
                  value={draftTitle}
                  type="text"
                  placeholder={STICKY_NOTE_TITLE_PLACEHOLDER}
                  aria-label="Sticky note title"
                  autoComplete="off"
                  spellCheck={false}
                  onPointerDown={stopInteractivePointer}
                  onClick={stopInteractivePointer}
                  onBlur={handleEditorBlur}
                  onKeyDown={handleEditorKeyDown}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
              ) : (
                <div className={`card__sticky-note-title${hasTitle ? "" : " card__sticky-note-title--placeholder"}`}>
                  {hasTitle ? viewModel.title : STICKY_NOTE_TITLE_PLACEHOLDER}
                </div>
              )}
            </header>

            <div className="card__sticky-note-body">
              {isEditing ? (
                <textarea
                  ref={bodyTextareaRef}
                  className="card__sticky-note-editor"
                  value={draftBody}
                  aria-label="Sticky note body"
                  placeholder={STICKY_NOTE_BODY_PLACEHOLDER}
                  spellCheck={false}
                  onPointerDown={stopInteractivePointer}
                  onClick={stopInteractivePointer}
                  onBlur={handleEditorBlur}
                  onKeyDown={handleEditorKeyDown}
                  onChange={(event) => setDraftBody(event.target.value)}
                />
              ) : sourceStatus.status === "error" ? (
                <div className="card__sticky-note-error">
                  <p>{sourceStatus.error}</p>
                  <div className="card__sticky-note-actions" data-sticky-note-action-root="true" onPointerDown={stopInteractivePointer}>
                    <button type="button" className="card__sticky-note-action" onClick={() => void loadSourceFile()}>
                      Retry
                    </button>
                    {source === CANVAS_TEXT_SOURCE_FILE ? (
                      <button type="button" className="card__sticky-note-action" onClick={handleOpenSource}>
                        Open file
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : isCompact ? (
                <div className="card__sticky-note-compact-lines" aria-hidden="true">
                  {surfaceLayout.compactBarWidths.map((ratio, index) => (
                    <div
                      key={`compact-bar-${index}`}
                      className={`card__sticky-note-compact-line${viewModel.compactLines[index] ? "" : " card__sticky-note-compact-line--placeholder"}`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  ))}
                </div>
              ) : (
                <div className="card__sticky-note-detail-lines">
                  {viewModel.detailBodyLines.length > 0 ? (
                    viewModel.detailBodyLines.map((line, index) => (
                      <p key={`detail-line-${index}`} className="card__sticky-note-line">
                        {line}
                      </p>
                    ))
                  ) : (
                    <p className="card__sticky-note-line card__sticky-note-line--placeholder">{STICKY_NOTE_BODY_PLACEHOLDER}</p>
                  )}
                </div>
              )}
            </div>

            <footer className="card__sticky-note-footer">
              {isCompact ? null : (
                <div className={`card__sticky-note-footer-copy${hasFooterCopy ? "" : " card__sticky-note-footer-copy--placeholder"}`}>
                  {footerText}
                </div>
              )}
            </footer>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(StickyNoteTile);
