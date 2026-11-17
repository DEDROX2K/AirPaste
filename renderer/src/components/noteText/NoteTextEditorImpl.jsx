import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  filterSlashItems,
  formatShortcut,
  isFormatActive,
  lineBlockType,
  runSlashItem,
  slashMenuField,
  toggleCodeBlock,
  toggleInline,
  toggleLink,
} from "../../lib/noteText/commands";
import { FORMAT_SHORTCUTS, buildNoteTextExtensions, isSourceMode } from "../../lib/noteText/extensions";
import { CheckboxEmpty, Code, CodeBlock, Highlighter, Link2, List, Minus } from "../ui/icons";
import "./NoteText.css";

// THE text editor for every note in the app (see
// docs/rules/text-editing-rules.md). Owns the CodeMirror view, the "/" block
// menu and the selection toolbar; the host tile owns everything around it
// (its title field, its chrome, when to save). Loaded lazily through
// NoteText.jsx -- import NoteTextEditor from there, not this file.

// Keeps focus (and the selection) in the editor when a menu/toolbar button
// is pressed -- which is also why the menus never trigger an onExit blur.
function keepEditorFocus(event) {
  event.preventDefault();
}

const SLASH_ICONS = {
  task: <CheckboxEmpty size={20} aria-hidden="true" />,
  list: <List size={20} aria-hidden="true" />,
  ordered: <span className="nt-slash__glyph">1.</span>,
  code: <CodeBlock size={20} aria-hidden="true" />,
  divider: <Minus size={20} aria-hidden="true" />,
};

const TOOLBAR_BUTTONS = [
  { id: "highlight", label: "Highlight", icon: <Highlighter size={20} aria-hidden="true" />, run: toggleInline("highlight") },
  { id: "bold", label: "Bold", glyph: "B", run: toggleInline("bold") },
  { id: "italic", label: "Italic", glyph: "I", run: toggleInline("italic") },
  { id: "underline", label: "Underline", glyph: "U", run: toggleInline("underline") },
  { id: "strike", label: "Strikethrough", glyph: "S", run: toggleInline("strike") },
  { id: "code", label: "Code span", icon: <Code size={20} aria-hidden="true" />, run: toggleInline("code") },
  { id: "codeBlock", label: "Code block", icon: <CodeBlock size={20} aria-hidden="true" />, run: toggleCodeBlock },
  { id: "link", label: "Link", icon: <Link2 size={20} aria-hidden="true" />, run: toggleLink },
];

const SLASH_MENU_WIDTH = 272;
const SLASH_MENU_MAX_HEIGHT = 420;
const TOOLBAR_GAP = 10;
const TOOLBAR_HEIGHT = 48;
const TOOLBAR_HALF_WIDTH = 190;
const EMPTY_UI = Object.freeze({ slash: null, toolbar: null, sourceMode: false });

// Reads everything the floating UI needs from the editor (positions included)
// inside CodeMirror's measure phase, so it never forces a layout mid-update.
// Positions are viewport coordinates, so this works at any canvas zoom.
function measureEditorUi(view) {
  const { state } = view;
  const menu = state.field(slashMenuField, false);
  const selection = state.selection.main;
  const next = { slash: null, toolbar: null, sourceMode: isSourceMode(view) };

  if (menu) {
    const coords = view.coordsAtPos(menu.from);
    if (coords) {
      const line = state.doc.lineAt(menu.from);
      const spaceBelow = window.innerHeight - coords.bottom;
      next.slash = {
        items: filterSlashItems(menu.query),
        index: menu.index,
        current: lineBlockType(state.doc.sliceString(line.from, menu.from)),
        left: Math.max(16, Math.min(coords.left - 24, window.innerWidth - SLASH_MENU_WIDTH - 16)),
        ...(spaceBelow > SLASH_MENU_MAX_HEIGHT || spaceBelow > coords.top
          ? { top: coords.bottom + 8 }
          : { bottom: window.innerHeight - coords.top + 8 }),
      };
    }
  } else if (!selection.empty && view.hasFocus) {
    const start = view.coordsAtPos(selection.from, 1);
    const end = view.coordsAtPos(selection.to, -1);
    if (start && end) {
      const sameLine = Math.abs(start.top - end.top) < 4;
      const contentRect = view.contentDOM.getBoundingClientRect();
      const centre = sameLine ? (start.left + end.right) / 2 : (contentRect.left + contentRect.right) / 2;
      const halfWidth = TOOLBAR_HALF_WIDTH + 16;
      const above = Math.min(start.top, end.top) - TOOLBAR_GAP;
      const fitsAbove = above - TOOLBAR_HEIGHT > 8;
      next.toolbar = {
        x: Math.max(halfWidth, Math.min(centre, window.innerWidth - halfWidth)),
        y: fitsAbove ? above : Math.max(start.bottom, end.bottom) + TOOLBAR_GAP,
        placement: fitsAbove ? "above" : "below",
        active: Object.fromEntries(TOOLBAR_BUTTONS.map((button) => [button.id, isFormatActive(state, button.id)])),
      };
    }
  }
  return next;
}

function resolveInitialSelection(initialSelection, length) {
  if (initialSelection === "all") {
    return EditorSelection.single(0, length);
  }
  if (initialSelection === "start") {
    return EditorSelection.cursor(0);
  }
  if (initialSelection && typeof initialSelection === "object") {
    const clamp = (value) => Math.max(0, Math.min(length, Number(value) || 0));
    return EditorSelection.single(clamp(initialSelection.anchor), clamp(initialSelection.head ?? initialSelection.anchor));
  }
  return EditorSelection.cursor(length);
}

const NoteTextEditorImpl = forwardRef(function NoteTextEditorImpl({
  initialText = "",
  replacementText,
  initialSelection = "end",
  placeholder = "",
  autoFocus = true,
  className = "",
  style,
  onChange,
  onExit,
  onReady,
  onUiStateChange,
}, ref) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const [ui, setUi] = useState(EMPTY_UI);
  const callbacksRef = useRef({});
  callbacksRef.current = { onChange, onExit, onReady, onUiStateChange };
  // Read once at mount: the editor is uncontrolled after that.
  const mountPropsRef = useRef({ initialText, replacementText, initialSelection, placeholder, autoFocus });

  useImperativeHandle(ref, () => ({
    get view() {
      return viewRef.current;
    },
    getText() {
      return viewRef.current?.state.doc.toString() ?? "";
    },
    focus(where = "end") {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      view.focus();
      view.dispatch({ selection: resolveInitialSelection(where, view.state.doc.length), scrollIntoView: true });
    },
  }), []);

  useEffect(() => {
    const { initialText: text, replacementText: replacement, initialSelection: selection, placeholder: hint, autoFocus: focusOnMount } = mountPropsRef.current;
    const doc = typeof replacement === "string" ? replacement : text;
    const requestUi = (view) => {
      view.requestMeasure({
        key: "note-text-ui",
        read: measureEditorUi,
        write: (next) => {
          setUi(next);
          callbacksRef.current.onUiStateChange?.(next);
        },
      });
    };

    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: buildNoteTextExtensions({
          placeholder: hint,
          onDocChange: (nextText) => callbacksRef.current.onChange?.(nextText, viewRef.current),
          onExit: (reason) => callbacksRef.current.onExit?.({ reason }),
          onUiChange: requestUi,
        }),
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;

    // Focus leaving the editor = the user is done, unless it only moved
    // within it. The host decides what a blur to its own title field means.
    const handleFocusOut = (event) => {
      if (event.relatedTarget instanceof Node && view.dom.contains(event.relatedTarget)) {
        return;
      }
      callbacksRef.current.onExit?.({ reason: "blur", relatedTarget: event.relatedTarget ?? null });
    };
    view.dom.addEventListener("focusout", handleFocusOut);

    // Floating UI is anchored to viewport coordinates: any scroll hides the
    // selection toolbar, while the slash menu follows its line (typing near
    // the bottom scrolls the caret into view, which mustn't close the menu).
    const handleScroll = () => {
      if (view.state.field(slashMenuField, false)) {
        requestUi(view);
      } else {
        setUi((current) => (current.toolbar ? { ...current, toolbar: null } : current));
      }
    };
    window.addEventListener("scroll", handleScroll, true);

    let frame = 0;
    if (focusOnMount) {
      frame = requestAnimationFrame(() => {
        view.focus();
        view.dispatch({
          selection: typeof replacement === "string"
            ? EditorSelection.cursor(view.state.doc.length)
            : resolveInitialSelection(selection, view.state.doc.length),
          scrollIntoView: true,
        });
      });
    }
    callbacksRef.current.onReady?.(view);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll, true);
      view.dom.removeEventListener("focusout", handleFocusOut);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  const runToolbarButton = (button) => {
    const view = viewRef.current;
    if (view) {
      button.run(view);
      view.focus();
    }
  };

  const runSlash = (item) => {
    const view = viewRef.current;
    if (view) {
      runSlashItem(view, item);
    }
  };

  const { slash, toolbar } = ui;

  return (
    <>
      <div ref={hostRef} className={`note-text${className ? ` ${className}` : ""}`} style={style} />

      {slash ? createPortal(
        <div
          className="note-text-menu nt-slash"
          role="listbox"
          aria-label="Insert block"
          style={{ left: slash.left, top: slash.top, bottom: slash.bottom }}
          onMouseDown={keepEditorFocus}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {slash.items.map((item, index) => {
            const previous = slash.items[index - 1];
            const isCurrent = item.id === slash.current;
            return (
              <div key={item.id}>
                {previous && previous.group !== item.group ? <div className="nt-slash__separator" role="separator" /> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === slash.index}
                  className={`nt-slash__item${index === slash.index ? " nt-slash__item--selected" : ""}${isCurrent ? " nt-slash__item--current" : ""}`}
                  onClick={() => runSlash(item)}
                >
                  <span className="nt-slash__lead">
                    {item.index ? <span className="nt-slash__index">{item.index}</span> : SLASH_ICONS[item.icon]}
                  </span>
                  <span className="nt-slash__label">{item.label}</span>
                  <span className="nt-slash__hint">{item.shortcut ? formatShortcut(item.shortcut) : item.hint}</span>
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      ) : null}

      {toolbar ? createPortal(
        <div
          className={`note-text-menu nt-toolbar nt-toolbar--${toolbar.placement}`}
          role="toolbar"
          aria-label="Format selection"
          style={{ left: toolbar.x, top: toolbar.y }}
          onMouseDown={keepEditorFocus}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {TOOLBAR_BUTTONS.map((button) => (
            <button
              key={button.id}
              type="button"
              className={`nt-toolbar__button${toolbar.active[button.id] ? " nt-toolbar__button--active" : ""}`}
              aria-label={button.label}
              aria-pressed={Boolean(toolbar.active[button.id])}
              onClick={() => runToolbarButton(button)}
            >
              {button.icon ?? <span className={`nt-toolbar__glyph nt-toolbar__glyph--${button.id}`}>{button.glyph}</span>}
              <span className="nt-toolbar__tip" aria-hidden="true">
                {button.label}
                {FORMAT_SHORTCUTS[button.id] ? <span className="nt-toolbar__tip-key">{formatShortcut(FORMAT_SHORTCUTS[button.id])}</span> : null}
              </span>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
});

export default NoteTextEditorImpl;
