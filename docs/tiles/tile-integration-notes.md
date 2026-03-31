# Tile Integration Notes

## Current implementation audit
- Tile types currently live in `renderer/src/lib/workspace.js`. The file exports `FOLDER_CARD_TYPE`, `NOTE_FOLDER_CARD_TYPE`, and `RACK_CARD_TYPE`, and `getCardType()` still normalizes the plain `text` and `link` types there.
- Tile rendering is selected in `renderer/src/components/Card.jsx`, which calls `getTileRegistration()` from `renderer/src/components/tiles/tileRegistry.js`.
- Shared tile shell and chrome live in `renderer/src/components/tiles/TileShell.jsx`. It applies common card classes, interaction state attributes, hover/focus hooks, and shared wrapper markup.
- Tile creation defaults live in `renderer/src/lib/workspace.js` through `createTextCard()`, `createNoteFolderCard()`, `createFolderCard()`, `createRackCard()`, and `createLinkCard()`. User-facing entry points for those defaults are in `renderer/src/systems/commands/useCanvasCommands.js` and surfaced in `renderer/src/components/CanvasDock.jsx`.
- Tile persistence schema currently lives in `renderer/src/lib/workspace.js`. `normalizeCard()`, `normalizeWorkspace()`, and `migrateWorkspace()` define the saved card shape, normalization rules, and schema migration path.
- The safest future integration points for `renderer/src/tiles/tileRegistry.js` are:
  - `renderer/src/components/tiles/tileRegistry.js` as the current runtime selector
  - `renderer/src/components/Card.jsx` as the render dispatch boundary
  - `renderer/src/lib/workspace.js` as the place where type IDs and creation defaults can gradually align
  - `renderer/src/systems/commands/useCanvasCommands.js` and `renderer/src/components/CanvasDock.jsx` as the tile creation surface
  - `renderer/src/systems/layout/useTileLayoutSystem.js` as the current type-aware layout and container behavior layer

## Capability mismatches
- The new `renderer/src/tiles/tileRegistry.js` marks every current tile as `resizable`, but the current runtime does not expose a resize interaction system. A code search only finds `resizable` in the new foundation registry, not in live drag or tile interaction code.
- The foundation registry marks `Folder Tile`, `Note Folder Tile`, and `Rack Tile` as `editable`, but the live tile components mainly expose drag, open, and context interactions. There is no direct inline rename or edit flow inside `FolderTile.jsx`, `NoteFolderTile.jsx`, or `RackTile.jsx`.
- The foundation registry marks `Note Folder Tile` as `container: true`, but the live implementation in `renderer/src/components/tiles/NoteFolderTile.jsx` stores `notes[]`, not generic child tiles. Generic child containment currently belongs to `FolderTile` (`childIds`) and `RackTile` (`tileIds`).
- Runtime behaviors exist that the new registry does not describe yet:
  - `TextTile.jsx` supports note-style variants and note magnify behavior.
  - `LinkTile.jsx` supports open/copy actions, imported-image mode, and music-preview mode.
  - `FolderTile.jsx` supports nested tile rendering and open-folder canvas behavior.
  - `RackTile.jsx` supports slot previews and rack drop targeting.

## March 2026 stability updates
- Image persistence path was hardened so link/image tiles do not disappear during prolonged pan/drag activity.
  - `renderer/src/components/tiles/TileImageReveal.jsx` now uses a single stable image load path instead of a dual preview/final fetch path.
  - `renderer/src/components/tiles/LinkTile.jsx` keeps the last good image visible and only falls back to placeholder if the tile never successfully loaded.
- Canvas visibility-culling was disabled in `renderer/src/components/CanvasWorkspaceView.jsx` (`visibleWorldRect = null`) to avoid tile unmount/remount cycles that can retrigger fragile image fetch paths.
- Performance rule for tiles: optimization is allowed to reduce effects and motion, but must never hide or remove tile content images.
- Visual policy for cards: shadows are removed across idle, hover, focused, dragging, and canvas-moving states without affecting image visibility.

## Integration guardrails
- Do not introduce any new `imagesOff` or equivalent image-hiding optimization toggles in tile components or canvas classes.
- If image reveal effects are revisited, they must degrade gracefully on network/load error and keep a successfully loaded final image on screen.
- Any tile-level visual optimization should be validated against long drag/pan sessions, not only initial load behavior.

