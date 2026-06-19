# Testing Tiles

## Purpose

Testing Tiles is the universal tile QA playground for AirPaste.

It is not only for link previews. It is the QA surface for all tile types.

It exists to visually validate:

- every implemented tile type
- representative seeded states for those tiles
- edge/fallback states where relevant
- diagnostics and copy-report behavior in DEV/testing flows
- shared UI polish after shell, tile, or control styling changes

## Visual QA Rule

When shared UI styles change, use Testing Tiles to verify:

- tile spacing still feels consistent across types
- title/input/control styling still matches the current UI guide
- selected, hover, focus, empty, and fallback states still read clearly
- no tile becomes cramped or visually off-family at smaller sizes

## Core Rule

Every new tile must be represented in Testing Tiles.

Every implemented tile should have at least one seeded example there.
Complex tiles should have multiple examples covering:

- normal state
- empty state
- edge state
- failure or fallback state when relevant

## How To Open Testing Tiles

Current app behavior:

1. Start the app in DEV or with preview debug enabled.
2. Open a folder-backed workspace.
3. From Home, use the `Testing Tiles` entry.

Implementation notes:

- The Testing Tiles canvas is created/opened by `openTestingTilesCanvas()` in `renderer/src/context/AppProvider.jsx`.
- The current guard requires both:
  - a folder-backed workspace
  - preview debug mode enabled via `isPreviewDebugModeEnabled()`

## Canonical Files

- Seed source:
  - `renderer/src/lib/testingTiles.js`
- Canvas open/create flow:
  - `renderer/src/context/AppProvider.jsx`
- Link preview DEV diagnostics:
  - `renderer/src/components/CanvasWorkspaceView.jsx`
  - `renderer/src/components/tiles/LinkTile.jsx`
- Code tile DEV diagnostics:
  - `renderer/src/components/CanvasWorkspaceView.jsx`

## Current Sections

Current seeded rows in `renderer/src/lib/testingTiles.js`:

- `YouTube / video`
- `social links`
- `docs/productivity`
- `articles/blogs`
- `ecommerce`
- `cookie-banner sites`
- `login-wall sites`
- `iframe-blocked sites`
- `broken/redirect/edge cases`
- `Notes / Markdown`
- `Text / Typography`
- `Tables / Databases`
- `Tracking & Productivity`

## Expected Seeded Examples

The target rule is that every implemented tile has representative seeded coverage.

### Currently Covered

- Link Tile
  - multiple seeded QA rows already exist
- Note / Markdown Tile
  - seeded examples exist
- Canvas Text Box Tile
  - seeded typography examples exist
- Database / Table Tile
  - seeded examples exist
- Counter Tile
  - seeded examples exist
- Deadline Countdown Tile
  - seeded examples exist

### Current Gaps

- Image Tile
  - no dedicated seeded examples yet
- Amazon Product Tile
  - no dedicated seeded examples yet
- Checklist Tile
  - no dedicated seeded examples yet
- Code Snippet Tile
  - legacy tile; no longer seeded in the active QA board
- Progress Bar Tile
  - legacy tile; no longer seeded in the active QA board
- Rack Tile
  - no dedicated seeded examples yet

## Text Box QA Notes

For `text-box` coverage, verify:

- selected state
- editing state
- resized state
- multiline rendering
- multiline paste behavior
- `Enter`-to-edit and printable-key replace behavior when the canvas itself has focus
- `Select`, `Hand`, and `Text` canvas tools, including `V`, `H`, and `T` shortcuts
- temporary `Space` hand-tool behavior and return-to-previous-tool behavior
- `Text` tool creation flow on blank canvas space
- `Text` tool click-to-edit flow on an existing text box
- visible resize handle behavior on selected text boxes
- toolbar style updates for preset, size, weight, italic, underline, strike, align, and color
- clipboard editing state: `Cmd/Ctrl+C` copies selected text while editing, `Cmd/Ctrl+X` cuts selected text while editing, and `Cmd/Ctrl+V` pastes text while editing
- canvas shortcuts stay quiet while any `isTypingTarget(target)` surface is focused, including the textarea and other tile editors

## Diagnostics And Copy Reports

Testing Tiles should make tile diagnostics easy to inspect during development.

Current behavior:

- Bookmark-style Link Tiles:
  - support DEV/testing copy diagnostics
  - support DEV/testing Codex report copy
  - show QA badges for preview outcomes in Testing Tiles
- Counter Tiles:
  - support DEV/testing copy diagnostics
  - support DEV/testing Codex report copy
- Deadline Countdown Tiles:
  - support DEV/testing copy diagnostics
  - support DEV/testing Codex report copy
- Other tiles:
  - should at minimum keep state serializable and clean in persisted payloads
  - may gain dedicated diagnostics later if debugging needs justify it

## Seeder Rule

Whenever a tile is created, edited, renamed, deleted, or significantly changed, review whether:

- `renderer/src/lib/testingTiles.js` needs new seeded examples
- `docs/TILE_BOOK.md` needs tile book updates
- `docs/TESTING_TILES.md` needs updated QA guidance

A tile feature is not complete until its Testing Tiles coverage is addressed.
