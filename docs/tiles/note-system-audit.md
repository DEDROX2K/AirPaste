# Historical / Reference Document

This document is retained for historical context. For current tile implementation status, type IDs, data models, and QA requirements, use `docs/TILE_BOOK.md` and `docs/TESTING_TILES.md`.

# Note System Audit

## Existing Implementations

### 1. Blank Notes (Text Cards)
*   **Tile Type:** `text` (`TILE_TYPES.NOTE`)
*   **Location:**
    *   Component: `renderer/src/components/tiles/TextTile.jsx`
    *   Creation logic: `createNewTextCard` in `AppProvider.jsx` (which calls `createTextCard` in `lib/workspace.js`)
*   **Variants:** Defined by `noteStyle`
    *   `notes-1`, `notes-2`, `notes-3`, `notes-quick`
*   **Creation Flows:**
    *   `createNoteOne`, `createNoteTwo`, `createNoteThree` (from UI menus)
*   **Rendering:** Uses `NoteSurface.jsx` for the text editor and presentation.
*   **Status:** Active. These are the core text notes.

### 2. Quick Note
*   **Tile Type:** `text` (`TILE_TYPES.NOTE`)
*   **Location:**
    *   Creation logic: `createQuickNote` in `useCanvasCommands.js`
*   **Variants:** Uses `noteStyle: NOTE_STYLE_QUICK`
*   **Creation Flows:** Double-tapping the empty canvas creates a quick note.
*   **Rendering:** It's a text card with a specific style variant.
*   **Status:** Active. It's essentially a `text` tile variant, but with a dedicated creation flow.

### 3. Note Folders (Daily Memo)
*   **Tile Type:** `note-folder` (`TILE_TYPES.NOTE_FOLDER`)
*   **Location:**
    *   Component: `renderer/src/components/tiles/NoteFolderTile.jsx`
    *   Creation logic: `createNewNoteFolderCard` in `AppProvider.jsx` (which calls `createNoteFolderCard` in `lib/workspace.js`)
    *   Data normalization: `normalizeFolderNotes` in `workspace-service.js`
*   **Creation Flows:** Has its own creation command.
*   **Rendering:** Displays a stack of notes, showing a preview of the notes inside. Note data is embedded within the `note-folder` card's `notes` array (not as separate linked tiles like normal Folders).
*   **Status:** Active but architecturally distinct. It manages its own list of simple note objects rather than containing generic `childIds`.

### 4. Text Tiles from Pasted Text
*   **Tile Type:** `text` (`TILE_TYPES.NOTE`)
*   **Creation Flows:** Pasting text onto the canvas creates a `NOTE_STYLE_TWO` text note (seen in `useCanvasCommands.js`).

## Architectural Observations
*   **Fragmentation:**
    *   `text` tiles are stand-alone and flexible objects on the canvas.
    *   `note-folder` tiles maintain their own internal array of simplified note objects (`{ id, text, secondaryText, noteStyle, quoteAuthor }`). These internal notes are *not real tiles* in the workspace, meaning they can't be pulled out and placed on the canvas like links in a normal folder.
*   **Variant Handling:** The styling is handled via the `noteStyle` property (`notes-1`, `notes-2`, `notes-3`, `notes-quick`), which maps to CSS classes (e.g., `.card__surface-frame--note1`).
*   **Note Types in Matrix:** The matrix just says "Note Tile", ignoring the existence of "Note Folders" and the distinct styling logic of Blank/Quick/Pasted notes.

## Recommendations for Phase 2
1.  **Standardize Note Data Model:** A base note tile (`text` type) should be the foundation. Note folders should either be deprecated in favor of standard folders containing note tiles, or be refactored to actually group `text` tiles using `childIds`.
2.  **Consolidate Text Tile Styles/Variants:** Standardize on one base note visually, or clearly define variants as explicit tile types or strongly typed state variants (e.g., a "sticky" vs "document" note).
3.  **Interaction Model:** Define when a note is "draggable" vs "editable" based on viewport zoom level. This logic partially exists in `noteInteraction.js` and needs to be standardized.
