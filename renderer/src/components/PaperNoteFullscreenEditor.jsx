import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatPaperNoteLongDate } from "../tiles/paperNote/model";
import NoteTextEditorImpl from "./noteText/NoteTextEditorImpl";
import { ArrowLeft } from "./ui/icons";

function stopPointer(event) {
  event.stopPropagation();
}

// The exclusive, immersive write mode for a Paper Note tile: a portal
// rendered straight into document.body (so it escapes the canvas's own
// pan/zoom transform) that FLIP-animates from the tile's on-canvas rect up
// to the full viewport, then back down again on close. Content fades in only
// once the box has (almost) finished growing, which sidesteps having to
// counter-scale text through a non-uniform width/height transition.
//
// The body is the shared note editor (NoteTextEditor) like every other note;
// this component only adds the sheet, the title/subtitle fields and the
// expand/collapse. This file is itself lazy-loaded by PaperNoteTile, so it
// imports the editor implementation directly.
export default function PaperNoteFullscreenEditor({ card, startRect, onSave, onClosed }) {
  const [phase, setPhase] = useState("opening");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const sheetRef = useRef(null);
  const editorRef = useRef(null);
  const titleInputRef = useRef(null);
  const subtitleInputRef = useRef(null);
  const hasSavedRef = useRef(false);
  const draftRef = useRef({
    title: typeof card.title === "string" ? card.title : "",
    subtitle: typeof card.subtitle === "string" ? card.subtitle : "",
    text: typeof card.text === "string" ? card.text : "",
  });
  const [titleValue, setTitleValue] = useState(draftRef.current.title);
  const [subtitleValue, setSubtitleValue] = useState(draftRef.current.subtitle);
  // Spellcheck squiggles only while that field is being written in.
  const [focusedField, setFocusedField] = useState(null);
  const clearFocusedField = useCallback(() => setFocusedField(null), []);
  const positionVarsRef = useRef({
    "--pn-x": `${startRect?.left ?? 0}px`,
    "--pn-y": `${startRect?.top ?? 0}px`,
    "--pn-sx": String(Math.max(0.0001, (startRect?.width ?? window.innerWidth) / window.innerWidth)),
    "--pn-sy": String(Math.max(0.0001, (startRect?.height ?? window.innerHeight) / window.innerHeight)),
  });

  const requestClose = useCallback(() => {
    setMenuOpen(false);
    setPhase((current) => (current === "opening" || current === "expanded" ? "closing" : current));
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Flip to the expanded transform on the frame after mount, so the browser
  // paints the start position first and the transition actually animates.
  useLayoutEffect(() => {
    if (phase !== "opening") {
      return undefined;
    }

    const frame = requestAnimationFrame(() => setPhase("expanded"));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing" || hasSavedRef.current) {
      return;
    }

    hasSavedRef.current = true;
    onSave?.({
      title: draftRef.current.title,
      subtitle: draftRef.current.subtitle,
      text: draftRef.current.text,
    });
  }, [phase, onSave]);

  // An untitled note starts on its title; otherwise straight in the body.
  useEffect(() => {
    if (phase !== "expanded" || draftRef.current.title.trim().length > 0) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => titleInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const handleSheetTransitionEnd = useCallback((event) => {
    if (event.target !== sheetRef.current || event.propertyName !== "transform") {
      return;
    }

    if (phase === "closing") {
      onClosed?.();
    }
  }, [phase, onClosed]);

  const handleKeyDown = useCallback((event) => {
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
    }
  }, [requestClose]);

  const handleTitleChange = useCallback((event) => {
    draftRef.current.title = event.target.value;
    setTitleValue(event.target.value);
  }, []);

  const handleSubtitleChange = useCallback((event) => {
    draftRef.current.subtitle = event.target.value;
    setSubtitleValue(event.target.value);
  }, []);

  const handleTitleKeyDown = useCallback((event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      subtitleInputRef.current?.focus();
    }
  }, []);

  const handleSubtitleKeyDown = useCallback((event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      editorRef.current?.focus("start");
    }
  }, []);

  const handleBodyChange = useCallback((nextText) => {
    draftRef.current.text = nextText;
  }, []);

  // Esc / Mod+Enter in the body closes the sheet; blurring it (e.g. to the
  // title) doesn't.
  const handleBodyExit = useCallback(({ reason }) => {
    if (reason === "escape") {
      requestClose();
    }
  }, [requestClose]);

  const handleUiStateChange = useCallback((ui) => {
    setMenuOpen(Boolean(ui.slash));
    setSourceMode(ui.sourceMode);
  }, []);

  const isExpanded = phase === "expanded";
  const dateLabel = formatPaperNoteLongDate(card.updatedAt || card.createdAt);

  return createPortal(
    <div
      className={`paper-note-fullscreen${isExpanded ? " paper-note-fullscreen--expanded" : ""}`}
      onPointerDown={stopPointer}
      onClick={stopPointer}
      onKeyDown={handleKeyDown}
    >
      <div className="paper-note-fullscreen__backdrop" />
      <div
        ref={sheetRef}
        className={`paper-note-fullscreen__sheet${isExpanded ? " paper-note-fullscreen__sheet--expanded" : ""}${isExpanded && menuOpen ? " paper-note-fullscreen__sheet--menu-open" : ""}`}
        style={positionVarsRef.current}
        onTransitionEnd={handleSheetTransitionEnd}
      >
        <button
          type="button"
          className="paper-note-fullscreen__close"
          aria-label="Back to canvas"
          onClick={requestClose}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>

        <div className="paper-note-fullscreen__content">
          <div className="paper-note-fullscreen__scroll">
            {dateLabel ? (
              <div className="paper-note-fullscreen__date">
                {dateLabel}
                {sourceMode ? <span className="paper-note-fullscreen__mode">Source</span> : null}
              </div>
            ) : null}
            <input
              ref={titleInputRef}
              type="text"
              className="paper-note-fullscreen__title-input"
              placeholder="Untitled"
              value={titleValue}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
              spellCheck={focusedField === "title"}
              onFocus={() => setFocusedField("title")}
              onBlur={clearFocusedField}
            />
            <input
              ref={subtitleInputRef}
              type="text"
              className="paper-note-fullscreen__subtitle-input"
              placeholder="Add a subtitle"
              value={subtitleValue}
              onChange={handleSubtitleChange}
              onKeyDown={handleSubtitleKeyDown}
              spellCheck={focusedField === "subtitle"}
              onFocus={() => setFocusedField("subtitle")}
              onBlur={clearFocusedField}
            />
            <div className="paper-note-fullscreen__editor">
              {/* Mounted only once expanded: animating a focused, blinking
                  CodeMirror through the grow/shrink is wasted work. */}
              {isExpanded ? (
                <NoteTextEditorImpl
                  ref={editorRef}
                  initialText={draftRef.current.text}
                  initialSelection="end"
                  autoFocus={draftRef.current.title.trim().length > 0}
                  onChange={handleBodyChange}
                  onExit={handleBodyExit}
                  onUiStateChange={handleUiStateChange}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
