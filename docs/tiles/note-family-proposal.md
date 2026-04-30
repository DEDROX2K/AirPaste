# Historical / Reference Document

This document is retained for historical context. For current tile implementation status, type IDs, data models, and QA requirements, use `docs/TILE_BOOK.md` and `docs/TESTING_TILES.md`.

# Structured Note-Family Proposal

> **Implementation Status:** Phase 1, 2, 3 (Creation unified, Call sites migrated) have been implemented. See [Implementation Notes](./note-family-implementation-notes.md) for details.

Based on the audit of existing note-like implementations, this document proposes a unified note-family architecture to eliminate fragmentation and define clear boundaries between features.

## 1. Base Note Tile Type

There should be **one base note tile type: `text` (`TILE_TYPES.NOTE`)**.

All text-based notes, regardless of how they are created (blank note, quick note, pasted text) should use this single data structure. This ensures compatibility across the canvas, folders, and racks.

## 2. Note Variants

Visual and functional differences should be handled via explicit variants of the base `text` tile type, rather than separate tile types.

Recommended variants:
*   **`variant: 'sticky'` (or `noteStyle: 'notes-1', 'notes-2', 'notes-3'`)**: The standard colorful, floating note cards.
*   **`variant: 'quick'` (or `noteStyle: 'notes-quick'`)**: A fast-entry, minimized note variant.
*   **`variant: 'document'` (Future proposal)**: For longer-form, structured text that might not look like a sticky note.

## 3. Dispositions for Current Implementations

*   **Keep / Consolidate:** The core `TextTile.jsx` (and the `text` tile type) should be kept as the foundation. The logic inside `createNewTextCard` and `createQuickNote` should be consolidated to use the same underlying factory function with a `variant` property.
*   **Deprecate / Merge:** The `note-folder` (`TILE_TYPES.NOTE_FOLDER`) type should be deprecated.
    *   *Why:* It uses a proprietary internal data structure for notes (`note.text`, `note.secondaryText`) instead of treating notes as first-class workspace tiles. This breaks normal folder behaviors like dragging notes out of a folder.
    *   *Action:* Regular `folder` types should natively support grouping `text` tiles. existing note folders should eventually be migrated to standard folders containing standard `text` tiles.

## 4. Zoom-Aware Interaction Model

Note tiles must dynamically switch their interaction modes based on their visual size on screen to prevent frustrating accidental text edits when trying to navigate the canvas.

We recommend adopting and standardizing the threshold strategy currently present in `noteInteraction.js`:

*   **Editing Threshold (e.g., Viewport Zoom >= 0.9):**
    *   When the note appears large, **text editing takes priority**.
    *   Clicking the note body enters text edit mode.
    *   Dragging the note is only possible via a designated header/drag handle.
*   **Navigation Threshold (e.g., Viewport Zoom < 0.9):**
    *   When the note appears small, **navigation takes priority**.
    *   Text editing is disabled inline.
    *   Clicking and dragging *anywhere* on the note surface drags the tile.
    *   Double-clicking the note should optionally "magnify" it or zoom the viewport to the edit threshold.

By enforcing this interaction model strictly across the entire unified note family, we guarantee a predictable user experience whether they are interacting with a quick note or a standard sticky note.
