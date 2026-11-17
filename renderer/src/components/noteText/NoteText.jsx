import { forwardRef, lazy, memo, Suspense, useMemo } from "react";
import { renderNoteMarkdown } from "../../lib/noteText/render";
import "./NoteText.css";

// The two building blocks every note tile uses for its body text -- see
// docs/rules/text-editing-rules.md before adding or changing a text tile.
//
//   <NoteTextView text=... />      read-only render (tile not being edited)
//   <NoteTextEditor initialText=... onChange onExit />   live editor
//
// The editor pulls in CodeMirror, one of the heaviest dependencies in the
// canvas bundle, so it loads on first use; until then it shows the read-only
// render of the same text, which looks identical with no caret.

const NoteTextEditorImpl = lazy(() => import("./NoteTextEditorImpl"));

export const NoteTextView = memo(function NoteTextView({ text, placeholder = "", className = "", style }) {
  const rendered = useMemo(() => renderNoteMarkdown(text), [text]);
  const isEmpty = rendered === null;

  return (
    <div className={`note-text note-text--view${className ? ` ${className}` : ""}`} style={style}>
      {isEmpty
        ? (placeholder ? <div className="nt-placeholder">{placeholder}</div> : null)
        : rendered}
    </div>
  );
});

export const NoteTextEditor = forwardRef(function NoteTextEditor(props, ref) {
  const fallbackText = typeof props.replacementText === "string" ? props.replacementText : props.initialText;
  return (
    <Suspense fallback={<NoteTextView text={fallbackText} placeholder={props.placeholder} className={props.className} style={props.style} />}>
      <NoteTextEditorImpl ref={ref} {...props} />
    </Suspense>
  );
});
