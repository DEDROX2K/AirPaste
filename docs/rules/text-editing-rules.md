# Text Editing Rules

Every place in AirPaste where someone **writes a note** edits and displays text
the same way: the Paper Note editor. This is the rule book for building or
changing any tile with note text. Follow it instead of re-specifying the
behaviour per tile.

> TL;DR: body text is markdown, edited with `<NoteTextEditor>` and displayed
> with `<NoteTextView>`. Don't build a textarea, a contentEditable or another
> CodeMirror setup for note text. Need something the shared editor doesn't do?
> Add it to the shared editor so every note gets it.

## 1. What counts as "note text"

Free-form text that a person writes and reads back, usually the body of a
note. Today that means:

| Tile | Component | Body | Title field |
|---|---|---|---|
| Paper note | `PaperNoteTile` + `PaperNoteFullscreenEditor` | shared editor (fullscreen) | title + subtitle inputs |
| Sticky (classic) | `StickyTile` | shared editor (inline) | none |
| Sticky (folder design) | `StickyFolderTile` | shared editor (inline) | single-line title |
| Sticky note (file-backed) | `StickyNoteTile` | shared editor (inline) | single-line title |
| Markdown / vault note | `CanvasTextTile` | shared editor (inline) | from the file |
| Link / image note | `NotedLinkTile` | shared editor (inline) | single-line title |

**Not note text** (these keep their own inputs on purpose):
- Canvas Text labels (`TextBoxTile`): typography with one style for the whole label, no markdown.
- Single-line fields: titles, names, URLs, search boxes.
- Structured rows: checklist items, Quick Note tasks, table cells, counters.
- Code: code snippets and code-file stickies.

A new tile with a free-form text body is note text. Add it to the table above.

## 2. The building blocks (use these, nothing else)

```jsx
import { NoteTextEditor, NoteTextView } from "../noteText/NoteText";

// Not editing: read-only render, identical to the editor with no caret.
<NoteTextView text={body} placeholder="Start typing..." />

// Editing: the live editor. Uncontrolled: initialText is read once on mount.
<NoteTextEditor
  ref={editorRef}                       // optional: .focus(where), .view, .getText()
  key={textBoxEditorState?.requestId}   // new edit request = fresh editor
  initialText={body}
  replacementText={textBoxEditorState?.replacementText} // type-to-edit key
  initialSelection="end"                // "end" | "start" | "all" | { anchor, head }
  autoFocus                             // default true
  placeholder="Start typing..."
  onChange={(text, view) => { draftRef.current = text; }}
  onExit={({ reason, relatedTarget }) => { /* save + leave edit mode */ }}
/>
```

- `onExit` reasons: `"escape"` (Esc or Mod+Enter) and `"blur"` (focus left the
  editor). For `"blur"`, check `relatedTarget`: if focus moved to the tile's
  own title field, stay in edit mode.
- `onExit` can fire more than once in one session (Esc, then the unmount
  blur). Guard with an `exitedRef`, as the sticky tiles do.
- Keep the draft in a ref (or state) from `onChange` and save it in your exit
  handler. Never read text back out of the DOM.
- `NoteTextEditor` lazy-loads CodeMirror; while loading it shows the
  `NoteTextView` of the same text. Don't import `NoteTextEditorImpl` directly
  unless your component is itself lazy-loaded (as `PaperNoteFullscreenEditor` is).
- The host element's `font-size`, `line-height`, `color` and `text-align` set
  the look. Everything inside is em-based and derives its colours from
  `currentColor`.

Source:
- `renderer/src/components/noteText/`: `NoteText.jsx` (public API), `NoteTextEditorImpl.jsx` (editor + slash menu + toolbar), `NoteText.css`
- `renderer/src/lib/noteText/`: `markdown.js` (dialect), `livePreview.js` (decorations), `commands.js` (formatting, slash menu), `extensions.js` (keymap), `render.jsx` (read-only render)
- Tests: `test/note-text.test.js`, `test/note-text-editor-mount.test.js`

## 3. Storage

- The body is **one markdown string** on the card (`text`, `note.body`, or the
  file's content). No HTML, no rich-text JSON, no per-tile schema.
- Dialect: CommonMark + GFM (tasks, strikethrough, tables, autolinks) +
  `==highlight==` + `<u>underline</u>`. Defined once in
  `lib/noteText/markdown.js`; the editor and the read-only render both use it.
- Whole-note styles (a sticky's colour, font size, alignment, whole-note
  bold) are separate card fields, not markdown. They style the container.

## 4. Behaviour every note shares

All of this comes from the shared editor. Don't re-implement it or turn it
off per tile.

**Live preview (Obsidian-style)**
- Block markup (`#`, `>`, `- `, `1. `, `- [ ]`, `---`, code fences) is hidden
  unless the caret is on that line (fences: inside that block).
- Inline markup (`**`, `*`, `~~`, `==`, `<u>`, `` ` ``, `[..](..)`) is hidden
  unless the caret touches that span. Nested emphasis works.
- Bullets, numbers and checkboxes render with a hanging indent per depth.
  Clicking a checkbox toggles the source (undoable) without moving the caret.

**Keys** (Mod = Cmd on macOS, Ctrl on Windows/Linux)

| Key | Does |
|---|---|
| Mod+B / Mod+I / Mod+U | bold / italic / underline the selection (toggle) |
| Shift+Mod+X / Shift+Mod+H | strikethrough / highlight |
| Mod+Alt+C / Shift+Mod+C | code span / code block |
| Mod+K | link |
| Mod+T / Mod+L / Shift+Mod+L / Mod+4 | task / bullet list / numbered list / body text |
| Enter | continue a list; on an empty item, leave the list |
| Tab / Shift+Tab | nest / un-nest a list item (to the parent's content column) |
| `/` at the start of a line | block menu (filters as you type, arrows + Enter, Esc closes) |
| Esc or Mod+Enter | finish editing (`onExit({ reason: "escape" })`) |
| Mod+E | raw source mode (debugging) |

Inside a note, Mod+B/I/U always format **the selection**. Whole-note
formatting belongs on the tile's own toolbar, never on these keys.

**Selection toolbar**: shows above a non-empty selection (highlight, B, I, U,
S, code span, code block, link, with active states). It hides on blur or
scroll.

**Spellcheck**: squiggles only on the line being written. Every other line,
and every line while the note isn't focused, opts out.

**Cursor**: the native I-beam over writable text, a pointer over checkboxes.

## 5. Title fields

Single-line titles stay plain inputs (or `plaintext-only` contentEditables),
with these rules everywhere:
- Enter moves to the body (`editorRef.current.focus("start")`). It never inserts a newline.
- Esc or Mod+Enter finishes editing, like the body.
- Moving focus between the title and the body keeps the note in edit mode.
- Spellcheck only while the title has focus (`spellCheck={isFocused}`).
- No markdown in titles.

## 6. Don'ts

- Don't add a `<textarea>`, `contentEditable` or `new EditorView(...)` for note text.
- Don't render note markdown any other way than `NoteTextView` / `renderNoteMarkdown`.
- Don't fork the shared CSS. Restyle with the `--nt-*` tokens on your tile's
  root (see the Paper Note's tokens in `PaperNoteTile.css`), plus the host's
  font and colour.
- Don't bind the editor's shortcuts to anything else inside a note.
- Don't turn spellcheck on for a whole note.

## 7. Changing the standard

Change the shared editor, not a tile, so every note changes together:
1. Behaviour goes in `lib/noteText/*` and needs a test in `test/note-text.test.js`.
2. Look goes in `components/noteText/NoteText.css`.
3. Update this file (sections 4–5) in the same change.
