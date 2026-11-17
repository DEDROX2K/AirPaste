# AirPaste

## Text editing (standard for every note)

Any tile with a free-form text body uses the shared note editor:
`NoteTextEditor` to edit and `NoteTextView` to display
(`renderer/src/components/noteText/NoteText.jsx`). The body is stored as one
markdown string. Read `docs/rules/text-editing-rules.md` before adding or
changing a tile with text. Change the shared editor rather than one tile, so
every note keeps the same UX. Never add a textarea or contentEditable for
note text.

## Other rules

- Tile conventions: `docs/rules/tile-system-rules.md`
- Tile catalogue and status: `docs/TILE_BOOK.md`
