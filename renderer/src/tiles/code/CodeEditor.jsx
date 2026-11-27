import { useEffect, useRef } from "react";
import { Compartment, EditorSelection, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess } from "@codemirror/commands";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { loadCodeLanguage } from "./codeLanguages";

// The code tile's editor (loaded lazily by CodeTile). The host owns the
// paper, the tools and the height; this owns the CodeMirror view inside the
// paper's scroller. Colours: CodeTile.css (.ct-tk-*) uses the same palette.

const BLUE = "#212AB7";

const codeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier, t.self, t.null, t.bool, t.atom], color: BLUE, fontWeight: "700" },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: "#4D6E00" },
  { tag: [t.number, t.integer, t.float], color: "#B4380E" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#7D7D7D", fontStyle: "italic" },
  { tag: [t.tagName, t.heading], color: BLUE },
  { tag: [t.attributeName, t.propertyName, t.typeName, t.className], color: "#6A3AB0" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: "#000", fontWeight: "700" },
  { tag: [t.punctuation, t.bracket, t.angleBracket, t.separator, t.operator], color: "#555" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.link, color: BLUE, textDecoration: "underline" },
]);

const selectedLine = Decoration.line({ class: "ct-band ct-band--sel" });
const caretLine = Decoration.line({ class: "ct-band ct-band--cur" });

// Selected lines get one band each (never a block); with just a caret, the
// caret's line gets a faint band while focused. A selection that ends at the
// start of a line doesn't mark that line.
function lineBands(view) {
  const { state } = view;
  const marks = new Map();
  for (const range of state.selection.ranges) {
    if (range.empty) {
      if (view.hasFocus) {
        const line = state.doc.lineAt(range.head).number;
        if (!marks.has(line)) marks.set(line, caretLine);
      }
      continue;
    }
    const first = state.doc.lineAt(range.from).number;
    const end = state.doc.lineAt(range.to);
    const last = range.to === end.from && end.number > first ? end.number - 1 : end.number;
    for (let line = first; line <= last; line += 1) marks.set(line, selectedLine);
  }
  const builder = new RangeSetBuilder();
  for (const line of [...marks.keys()].sort((a, b) => a - b)) {
    builder.add(state.doc.line(line).from, state.doc.line(line).from, marks.get(line));
  }
  return builder.finish();
}

const lineBandPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = lineBands(view);
  }

  update(update) {
    if (update.docChanged || update.selectionSet || update.focusChanged) {
      this.decorations = lineBands(update.view);
    }
  }
}, { decorations: (plugin) => plugin.decorations });

const insertTwoSpaces = (view) => {
  view.dispatch(view.state.replaceSelection("  "), { scrollIntoView: true, userEvent: "input" });
  return true;
};

export default function CodeEditor({
  value,
  language,
  placeholder,
  focusAt,
  onChange,
  onFocusChange,
  onExit,
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const languageRef = useRef(new Compartment());
  const callbacksRef = useRef({ onChange, onFocusChange, onExit });
  callbacksRef.current = { onChange, onFocusChange, onExit };

  // Mount once; later value changes from outside are applied below.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const exit = (view) => {
      view.contentDOM.blur();
      callbacksRef.current.onExit?.();
      return true;
    };

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          indentOnInput(),
          bracketMatching(),
          EditorState.tabSize.of(2),
          syntaxHighlighting(codeHighlight),
          languageRef.current.of([]),
          lineBandPlugin,
          keymap.of([
            { key: "Tab", run: insertTwoSpaces, shift: indentLess },
            { key: "Escape", run: exit },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.contentAttributes.of({
            "aria-label": "Code",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
          placeholder ? cmPlaceholder(placeholder) : [],
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const paste = update.transactions.some((tr) => tr.isUserEvent("input.paste") || tr.isUserEvent("input.drop"));
              callbacksRef.current.onChange?.(update.state.doc.toString(), { paste });
            }
            if (update.focusChanged) {
              callbacksRef.current.onFocusChange?.(update.view.hasFocus);
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    // Put the caret where the paper was pressed (the static text has the
    // same layout, so the position matches what was under the pointer).
    view.scrollDOM.scrollTop = focusAt?.scrollTop ?? 0;
    view.scrollDOM.scrollLeft = focusAt?.scrollLeft ?? 0;
    const frame = window.requestAnimationFrame(() => {
      const pos = focusAt ? view.posAtCoords(focusAt, false) : view.state.doc.length;
      view.dispatch({ selection: EditorSelection.cursor(pos ?? view.state.doc.length) });
      view.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    loadCodeLanguage(language).then((extension) => {
      if (!cancelled && viewRef.current) {
        viewRef.current.dispatch({ effects: languageRef.current.reconfigure(extension) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  return <div ref={hostRef} className="ct-cm" />;
}
