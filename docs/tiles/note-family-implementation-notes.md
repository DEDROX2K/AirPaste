# Historical / Reference Document

This document is retained for historical context. For current tile implementation status, type IDs, data models, and QA requirements, use `docs/TILE_BOOK.md` and `docs/TESTING_TILES.md`.

# Note Family Implementation Notes

## Old Creation Functions
The following legacy note creation functions were previously scattered:
- `createNoteOne`
- `createNoteTwo`
- `createNoteThree`
- `createQuickNote`
- `createNoteVariant`

## New Unified Flow
All note creation now funnels through a single unified API located in `useCanvasCommands.js`:
```javascript
createNote(variant = "standard", text = "", preferredCenter = null)
```
This function resolves the given `variant` against a `NOTE_VARIANTS` configuration map, which determines the specific properties (such as `noteStyle`) to pass down to `createNewTextCard`.

## Variant Model
Note variants are now represented exclusively by the `text` tile type (using `TILE_TYPES.NOTE`). The specific variant identity is stored in the `noteStyle` property. The `NOTE_VARIANTS` config map acts as the source of truth for mapping a semantic variant name to its internal data representation.

Currently existing variants:
1. **Quick Note (`notes-quick`)**: The new canonical quick note target. This is the primary approved note variant format and the focus for redesign.
2. **Sticky Note (`notes-1`)**, **Todo Note (`notes-2`)**, **Paper Note (`notes-3`)**: These are considered *legacy style variants*. They will remain supported so existing data isn't broken, but they may be candidates for eventual deprecation as the Quick Note matures.

All text tiles natively use the standardized zoom-aware thresholds from `noteInteraction.js`.

## What is Still Legacy
- **Legacy Wrappers:** The old creation functions (`createNoteOne`, etc.) still exist in `useCanvasCommands.js` as thin wrappers around `createNote`, and are marked with JSDoc `@deprecated` tags. A search confirms no calls remain in the UI layer.
- **Note Folders:** The `note-folder` card type and `createNoteFolderCard` function are technically functional to prevent breaking persistence, but their declarations in `workspace.js` are tagged as `@deprecated`.

## What is Next
With the architectural foundation unified into a single predictable flow, the **Quick Note Redesign** is underway. The "quick" variant is being redesigned as the canonical note format (blue surface, colored theme) without fracturing the creation pathways or standard interactions.

### Quick Note Visual Details
The `notes-quick` variant utilizes isolated CSS and layout techniques for a distinct feel:
- **Randomized Themes:** Upon creation, it picks a random curated palette (e.g., `theme-blue-red`, `theme-yellow-purple`) applied via CSS classes and variables.
- **Dynamic Layout Structure:** The internal `NoteVariantQuick.jsx` uses a custom base (a colored paper surface) without the old sticky element.
- **Auto-grow:** The main body textarea uses a CSS grid technique to naturally stretch its parent as users type.
