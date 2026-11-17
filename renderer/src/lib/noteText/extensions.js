import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdownKeymap } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { Compartment, Prec } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder as placeholderText } from "@codemirror/view";
import {
  closeSlashMenu,
  exitEmptyListItem,
  indentListItem,
  outdentListItem,
  setBlockType,
  slashMenuField,
  slashMenuKeymap,
  toggleCodeBlock,
  toggleInline,
  toggleLink,
} from "./commands";
import { livePreviewPlugin, noteMarkdownLanguage } from "./livePreview";

// Assembles the shared note editor (NoteTextEditor): markdown language +
// live preview + slash menu + formatting shortcuts. Shortcuts use CodeMirror's
// "Mod" (Cmd on macOS, Ctrl elsewhere) and sit ahead of the default keymaps,
// which otherwise bind Mod-i / Mod-u / Mod-l to selection commands.

const livePreviewCompartment = new Compartment();

export function isSourceMode(view) {
  return livePreviewCompartment.get(view.state) !== livePreviewPlugin;
}

export function toggleSourceMode(view) {
  view.dispatch({
    effects: livePreviewCompartment.reconfigure(isSourceMode(view) ? livePreviewPlugin : []),
  });
  return true;
}

export const FORMAT_SHORTCUTS = Object.freeze({
  highlight: "Shift-Mod-h",
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  strike: "Shift-Mod-x",
  code: "Mod-Alt-c",
  codeBlock: "Shift-Mod-c",
  link: "Mod-k",
});

// onExit(reason): "escape" for Esc / Mod+Enter (finish editing). Blur is
// reported by NoteTextEditor itself, which knows about its own menus.
export function buildNoteTextExtensions({ onDocChange, onExit, onUiChange, placeholder = "" }) {
  return [
    ...(placeholder ? [placeholderText(placeholder)] : []),
    history(),
    drawSelection(),
    closeBrackets(),
    noteMarkdownLanguage(),
    slashMenuField,
    livePreviewCompartment.of(livePreviewPlugin),
    EditorView.lineWrapping,
    EditorView.editorAttributes.of({ class: "note-text-editor" }),
    EditorView.contentAttributes.of({
      spellcheck: "true",
      autocapitalize: "sentences",
      autocomplete: "off",
      autocorrect: "off",
      "data-note-text-editor": "true",
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
      blur: (event, view) => {
        if (view.state.field(slashMenuField, false)) {
          view.dispatch({ effects: closeSlashMenu.of(null) });
        }
        onUiChange?.(view);
        return false;
      },
      focus: (event, view) => {
        onUiChange?.(view);
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChange(update.state.doc.toString());
      }
      if (update.docChanged || update.selectionSet || update.focusChanged || update.transactions.some((tr) => tr.effects.length > 0)) {
        onUiChange?.(update.view);
      }
    }),
    Prec.highest(keymap.of(slashMenuKeymap)),
    keymap.of([
      {
        key: "Escape",
        run: () => {
          onExit("escape");
          return true;
        },
      },
      {
        key: "Mod-Enter",
        run: () => {
          onExit("escape");
          return true;
        },
      },
      { key: FORMAT_SHORTCUTS.bold, run: toggleInline("bold") },
      { key: FORMAT_SHORTCUTS.italic, run: toggleInline("italic") },
      { key: FORMAT_SHORTCUTS.underline, run: toggleInline("underline") },
      { key: FORMAT_SHORTCUTS.strike, run: toggleInline("strike") },
      { key: FORMAT_SHORTCUTS.highlight, run: toggleInline("highlight") },
      { key: FORMAT_SHORTCUTS.code, run: toggleInline("code") },
      { key: FORMAT_SHORTCUTS.codeBlock, run: toggleCodeBlock },
      { key: FORMAT_SHORTCUTS.link, run: toggleLink },
      { key: "Mod-t", run: setBlockType("task") },
      { key: "Mod-l", run: setBlockType("bullet") },
      { key: "Shift-Mod-l", run: setBlockType("ordered") },
      { key: "Mod-4", run: setBlockType("body") },
      { key: "Mod-e", run: toggleSourceMode },
      { key: "Tab", run: indentListItem },
      { key: "Shift-Tab", run: outdentListItem },
      { key: "Enter", run: exitEmptyListItem },
      ...markdownKeymap,
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
  ];
}
