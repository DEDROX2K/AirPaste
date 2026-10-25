// CodeMirror and its extensions used by CanvasTextTile's inline editor.
// Loaded dynamically rather than imported statically because this is one of
// the single heaviest dependency trees in the whole canvas bundle (CodeMirror
// core + view/state/commands/search/autocomplete + the markdown language
// package and its own embedded HTML/CSS/JS language support) -- every canvas
// open used to pay for parsing all of it, even for a canvas with no text
// tiles open for editing. Resolves once per session; every call after the
// first reuses the same cached promise, so re-entering edit mode (on this
// tile or any other) never re-fetches or re-parses it.
let modulesPromise = null;

export function loadCanvasTextEditorModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("@codemirror/state"),
      import("@codemirror/autocomplete"),
      import("@codemirror/commands"),
      import("@codemirror/lang-markdown"),
      import("@codemirror/search"),
      import("@codemirror/view"),
    ]).then(([stateMod, autocompleteMod, commandsMod, markdownMod, searchMod, viewMod]) => ({
      EditorState: stateMod.EditorState,
      closeBrackets: autocompleteMod.closeBrackets,
      closeBracketsKeymap: autocompleteMod.closeBracketsKeymap,
      defaultKeymap: commandsMod.defaultKeymap,
      history: commandsMod.history,
      historyKeymap: commandsMod.historyKeymap,
      indentWithTab: commandsMod.indentWithTab,
      markdown: markdownMod.markdown,
      searchKeymap: searchMod.searchKeymap,
      drawSelection: viewMod.drawSelection,
      EditorView: viewMod.EditorView,
      keymap: viewMod.keymap,
    }));
  }
  return modulesPromise;
}

export function buildCanvasTextEditorExtensions(cm, { onDocChange, onExit }) {
  return [
    cm.history(),
    cm.drawSelection(),
    cm.closeBrackets(),
    cm.markdown(),
    cm.EditorView.lineWrapping,
    cm.EditorView.contentAttributes.of({
      spellcheck: "true",
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
      "data-canvas-text-editor": "true",
    }),
    cm.EditorView.domEventHandlers({
      keydown: (event) => {
        event.stopPropagation();
        return false;
      },
      pointerdown: (event) => {
        event.stopPropagation();
        return false;
      },
      // Without this, double-clicking inside the editor to select a word
      // bubbles up to the tile's own onDoubleClick (wired to "enter edit
      // mode") and re-fires it mid-edit, which resets the draft back to
      // whatever was last saved -- silently discarding anything typed but
      // not yet committed.
      dblclick: (event) => {
        event.stopPropagation();
        return false;
      },
    }),
    cm.EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChange(update.state.doc.toString(), update.view.contentHeight);
      }
    }),
    cm.keymap.of([
      {
        key: "Escape",
        run: () => {
          onExit();
          return true;
        },
      },
      cm.indentWithTab,
      ...cm.closeBracketsKeymap,
      ...cm.defaultKeymap,
      ...cm.historyKeymap,
      ...cm.searchKeymap,
    ]),
  ];
}
