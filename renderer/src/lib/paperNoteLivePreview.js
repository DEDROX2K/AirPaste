import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { Decoration, EditorView, ViewPlugin, drawSelection, keymap } from "@codemirror/view";

// A hand-rolled "live preview" decorator for CodeMirror 6, in the spirit of
// Obsidian's editor: markdown markup (##, **, *, `, [..](..)) renders styled
// and hidden on every line except the one the cursor is currently on, where
// the raw source is revealed so it stays editable. Built on plain regex
// scanning of each line's text (mirroring lib/renderSimpleMarkdown.jsx)
// rather than the markdown language's syntax tree, so it doesn't depend on
// the exact Lezer node names @lezer/markdown happens to use internally.
const HEADING_RE = /^(#{1,6})\s+/;
const QUOTE_RE = /^>\s?/;

function hide(decorations, from, to) {
  if (to > from) {
    decorations.push(Decoration.replace({}).range(from, to));
  }
}

function mark(decorations, from, to, className) {
  if (to > from) {
    decorations.push(Decoration.mark({ class: className }).range(from, to));
  }
}

function scanInlineLine(text, lineFrom, active, decorations) {
  let index = 0;

  while (index < text.length) {
    const remaining = text.slice(index);
    const from = lineFrom + index;

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
    if (linkMatch) {
      const [full, label] = linkMatch;
      if (active) {
        mark(decorations, from, from + full.length, "cm-live-link");
      } else {
        const labelStart = from + 1;
        const labelEnd = labelStart + label.length;
        hide(decorations, from, labelStart);
        mark(decorations, labelStart, labelEnd, "cm-live-link");
        hide(decorations, labelEnd, from + full.length);
      }
      index += full.length;
      continue;
    }

    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      const [full, inner] = codeMatch;
      if (active) {
        mark(decorations, from, from + full.length, "cm-live-code");
      } else {
        hide(decorations, from, from + 1);
        mark(decorations, from + 1, from + 1 + inner.length, "cm-live-code");
        hide(decorations, from + 1 + inner.length, from + full.length);
      }
      index += full.length;
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const [full, inner] = boldMatch;
      if (active) {
        mark(decorations, from, from + full.length, "cm-live-bold");
      } else {
        hide(decorations, from, from + 2);
        mark(decorations, from + 2, from + 2 + inner.length, "cm-live-bold");
        hide(decorations, from + 2 + inner.length, from + full.length);
      }
      index += full.length;
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      const [full, inner] = italicMatch;
      if (active) {
        mark(decorations, from, from + full.length, "cm-live-italic");
      } else {
        hide(decorations, from, from + 1);
        mark(decorations, from + 1, from + 1 + inner.length, "cm-live-italic");
        hide(decorations, from + 1 + inner.length, from + full.length);
      }
      index += full.length;
      continue;
    }

    const nextSpecialIndexCandidates = [
      remaining.indexOf("["),
      remaining.indexOf("`"),
      remaining.indexOf("*"),
    ].filter((candidate) => candidate >= 0);
    const nextSpecialIndex = nextSpecialIndexCandidates.length > 0
      ? Math.min(...nextSpecialIndexCandidates)
      : -1;

    if (nextSpecialIndex === -1) {
      break;
    }

    // A special char that didn't match any pattern above (e.g. a stray
    // unmatched "*") -- skip just that one character and keep scanning the
    // rest of the line, rather than aborting the whole line's decorations.
    index += Math.max(1, nextSpecialIndex);
  }
}

function lineIsActive(selection, line) {
  return selection.from <= line.to && selection.to >= line.from;
}

function buildDecorations(state) {
  const decorations = [];
  const selection = state.selection.main;
  const { doc } = state;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const text = line.text;
    const active = lineIsActive(selection, line);
    let contentFrom = line.from;

    const headingMatch = text.match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1].length;
      decorations.push(Decoration.line({ class: `cm-live-heading cm-live-heading-${level}` }).range(line.from));
      if (!active) {
        hide(decorations, line.from, line.from + headingMatch[0].length);
        contentFrom = line.from + headingMatch[0].length;
      }
    } else if (QUOTE_RE.test(text)) {
      const quoteMatch = text.match(QUOTE_RE);
      decorations.push(Decoration.line({ class: "cm-live-quote" }).range(line.from));
      if (!active) {
        hide(decorations, line.from, line.from + quoteMatch[0].length);
        contentFrom = line.from + quoteMatch[0].length;
      }
    }

    scanInlineLine(doc.sliceString(contentFrom, line.to), contentFrom, active, decorations);
  }

  return Decoration.set(decorations, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildDecorations(view.state);
  }

  update(update) {
    if (update.docChanged || update.selectionSet) {
      this.decorations = buildDecorations(update.state);
    }
  }
}, {
  decorations: (pluginValue) => pluginValue.decorations,
});

export function buildPaperNoteEditorExtensions({ onDocChange, onClose }) {
  return [
    history(),
    drawSelection(),
    closeBrackets(),
    markdown(),
    EditorView.lineWrapping,
    EditorView.editorAttributes.of({ class: "paper-note-editor" }),
    EditorView.contentAttributes.of({
      spellcheck: "true",
      autocapitalize: "sentences",
      autocomplete: "off",
      autocorrect: "off",
      "data-paper-note-editor": "true",
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
        onDocChange(update.state.doc.toString());
      }
    }),
    livePreviewPlugin,
    keymap.of([
      {
        key: "Escape",
        run: () => {
          onClose();
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
