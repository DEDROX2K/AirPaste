import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
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
import { NoteTextEditor, NoteTextView } from "../noteText/NoteText";
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
  const { folderPath, setCanvasInteractionState, updateExistingCard } = useTileAppContext();
  const source = card.source === CANVAS_TEXT_SOURCE_FILE ? CANVAS_TEXT_SOURCE_FILE : CANVAS_TEXT_SOURCE_LOCAL;
  const isEditing = textBoxEditorState?.tileId === card.id;
  const isSelectToolActive = canvasToolMode === DRAWING_TOOL_MODE_SELECT;
  // Compact (zoomed-out-too-far) rendering is disabled for now -- the
  // sticky note always shows its normal "detail" look regardless of zoom,
  // per explicit request, rather than collapsing into skeleton bars.
  const renderState = "detail";
  const isCompact = false;
  const normalizedStickyDocument = useMemo(() => deriveStickyNoteDocument(card), [card]);
  const [draftTitle, setDraftTitle] = useState(() => normalizedStickyDocument.title);
  const [draftBody, setDraftBody] = useState(() => normalizedStickyDocument.bodyText);
  const [sourceStatus, setSourceStatus] = useState(defaultSourceStatus(source));
  const titleInputRef = useRef(null);
  const bodyEditorRef = useRef(null);
  // Spellcheck squiggles only while the title is being written in.
  const [isTitleFocused, setTitleFocused] = useState(false);
  const saveInFlightRef = useRef(false);
  const lastEditorSelectionRef = useRef({
    target: "body",
    titleStart: null,
    titleEnd: null,
    bodyStart: null,
    bodyEnd: null,
    bodyScrollTop: 0,
  });
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
  const footerText = viewModel.detailFooterLines.join(" ");
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

  // Where an edit session starts: the title when the note is empty (or the
  // title was being edited last time), otherwise the body.
  const startsOnTitle = isEditing && typeof textBoxEditorState?.replacementText !== "string" && (
    lastEditorSelectionRef.current.target === "title"
    || (normalizedStickyDocument.title.trim().length === 0 && normalizedStickyDocument.bodyText.trim().length === 0)
  );
  const bodyInitialSelection = (() => {
    if (textBoxEditorState?.selectAll === true) {
      return "all";
    }
    const { bodyStart, bodyEnd } = lastEditorSelectionRef.current;
    return Number.isInteger(bodyStart) && Number.isInteger(bodyEnd)
      ? { anchor: bodyStart, head: bodyEnd }
      : "end";
  })();

  // Restore the title's selection when a session starts there. (The body
  // editor restores its own on mount.)
  useEffect(() => {
    if (!isEditing || !startsOnTitle) {
      return undefined;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const target = titleInputRef.current;
      target?.focus?.({ preventScroll: true });

      if (typeof target?.setSelectionRange !== "function") {
        return;
      }

      if (textBoxEditorState?.selectAll === true) {
        target.setSelectionRange(0, target.value.length);
        return;
      }

      const start = lastEditorSelectionRef.current.titleStart;
      const end = lastEditorSelectionRef.current.titleEnd;
      if (Number.isInteger(start) && Number.isInteger(end)) {
        target.setSelectionRange(
          Math.max(0, Math.min(start, target.value.length)),
          Math.max(0, Math.min(end, target.value.length)),
        );
        return;
      }

      target.setSelectionRange(target.value.length, target.value.length);
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, isEditing, textBoxEditorState?.requestId, textBoxEditorState?.selectAll]);

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

  const focusLeavesNote = (nextFocusTarget) => !(
    nextFocusTarget instanceof Element
    && (
      nextFocusTarget.closest("[data-sticky-note-editor-root='true']")
      || nextFocusTarget.closest("[data-sticky-note-action-root='true']")
    )
  );

  // Esc / Mod+Enter in the body, or focus leaving the note.
  const handleBodyExit = ({ reason, relatedTarget }) => {
    const selection = bodyEditorRef.current?.view?.state.selection.main;
    if (selection) {
      lastEditorSelectionRef.current = {
        ...lastEditorSelectionRef.current,
        target: "body",
        bodyStart: selection.anchor,
        bodyEnd: selection.head,
      };
    }

    if (reason === "escape") {
      void exitEditMode({ restoreCanvasFocus: true });
    } else if (focusLeavesNote(relatedTarget)) {
      void exitEditMode();
    }
  };

  const handleEditorBlur = (event) => {
    setTitleFocused(false);
    const target = event.currentTarget;
    lastEditorSelectionRef.current = {
      ...lastEditorSelectionRef.current,
      target: "title",
      titleStart: target.selectionStart,
      titleEnd: target.selectionEnd,
    };

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

    // Titles are one line: Enter moves on to the body.
    if (event.key === "Enter" && !(event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      bodyEditorRef.current?.focus("start");
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
                  spellCheck={isTitleFocused}
                  onFocus={() => setTitleFocused(true)}
                  onPointerDown={stopInteractivePointer}
                  onClick={stopInteractivePointer}
                  onDoubleClick={stopInteractivePointer}
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
                <div
                  className="card__sticky-note-text"
                  onPointerDown={stopInteractivePointer}
                  onClick={stopInteractivePointer}
                  onDoubleClick={stopInteractivePointer}
                >
                  <NoteTextEditor
                    ref={bodyEditorRef}
                    key={textBoxEditorState?.requestId ?? "edit"}
                    initialText={draftBody}
                    initialSelection={bodyInitialSelection}
                    autoFocus={!startsOnTitle}
                    placeholder={STICKY_NOTE_BODY_PLACEHOLDER}
                    onChange={(nextText) => setDraftBody(nextText)}
                    onExit={handleBodyExit}
                  />
                </div>
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
                <NoteTextView
                  className="card__sticky-note-text"
                  text={viewModel.bodyText}
                  placeholder={STICKY_NOTE_BODY_PLACEHOLDER}
                />
              )}
            </div>

            <footer className="card__sticky-note-footer">
              {/* Only a real preview of text cut off below earns its place
                  here -- showing the same placeholder a second time, under
                  an already-empty body, just reads as a rendering glitch. */}
              {!isCompact && hasFooterCopy ? (
                <div className="card__sticky-note-footer-copy">
                  {footerText}
                </div>
              ) : null}
            </footer>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(StickyNoteTile);
