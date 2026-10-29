import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildPaperNoteEditorExtensions } from "../lib/paperNoteLivePreview";
import { X } from "./ui/icons";

function stopPointer(event) {
  event.stopPropagation();
}

// The exclusive, immersive write mode for a Paper Note tile: a portal
// rendered straight into document.body (so it escapes the canvas's own
// pan/zoom transform) that FLIP-animates from the tile's on-canvas rect up
// to the full viewport, then back down again on close. Content fades in only
// once the box has (almost) finished growing, which sidesteps having to
// counter-scale text through a non-uniform width/height transition.
export default function PaperNoteFullscreenEditor({ card, startRect, onSave, onClosed }) {
  const [phase, setPhase] = useState("opening");
  const sheetRef = useRef(null);
  const editorHostRef = useRef(null);
  const editorViewRef = useRef(null);
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
  const positionVarsRef = useRef({
    "--pn-x": `${startRect?.left ?? 0}px`,
    "--pn-y": `${startRect?.top ?? 0}px`,
    "--pn-sx": String(Math.max(0.0001, (startRect?.width ?? window.innerWidth) / window.innerWidth)),
    "--pn-sy": String(Math.max(0.0001, (startRect?.height ?? window.innerHeight) / window.innerHeight)),
  });

  const requestClose = useCallback(() => {
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

  // The live-preview body editor only exists while expanded -- mounting it
  // during the grow/shrink transition would animate a focused, blinking
  // CodeMirror instance, which is both wasted work and visually noisy.
  useEffect(() => {
    if (phase !== "expanded" || !editorHostRef.current) {
      return undefined;
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: draftRef.current.text,
        extensions: buildPaperNoteEditorExtensions({
          onDocChange: (nextText) => {
            draftRef.current.text = nextText;
          },
          onClose: () => requestClose(),
        }),
      }),
      parent: editorHostRef.current,
    });
    editorViewRef.current = view;

    const focusTimer = requestAnimationFrame(() => {
      if (draftRef.current.title.trim().length === 0) {
        titleInputRef.current?.focus();
      } else {
        view.focus();
      }
    });

    return () => {
      cancelAnimationFrame(focusTimer);
      view.destroy();
      editorViewRef.current = null;
    };
  }, [phase, requestClose]);

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
      editorViewRef.current?.focus();
    }
  }, []);

  const isExpanded = phase === "expanded";

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
        className={`paper-note-fullscreen__sheet${isExpanded ? " paper-note-fullscreen__sheet--expanded" : ""}`}
        style={positionVarsRef.current}
        onTransitionEnd={handleSheetTransitionEnd}
      >
        <button
          type="button"
          className="paper-note-fullscreen__close"
          aria-label="Close paper note"
          onClick={requestClose}
        >
          <CloseIcon />
        </button>

        <div className="paper-note-fullscreen__content">
          <div className="paper-note-fullscreen__scroll">
            <input
              ref={titleInputRef}
              type="text"
              className="paper-note-fullscreen__title-input"
              placeholder="Untitled"
              value={titleValue}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
            />
            <input
              ref={subtitleInputRef}
              type="text"
              className="paper-note-fullscreen__subtitle-input"
              placeholder="Add a subtitle"
              value={subtitleValue}
              onChange={handleSubtitleChange}
              onKeyDown={handleSubtitleKeyDown}
            />
            <div ref={editorHostRef} className="paper-note-fullscreen__editor" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CloseIcon() {
  return <X size={18} aria-hidden="true" />;
}
