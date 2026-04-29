# Tile Capability Matrix

Quick inventory of every tile type currently defined in the live AirPaste runtime.

Use this file as the simple source of truth when adding new tiles. For each new tile, update:

1. `renderer/src/tiles/tileTypes.js`
2. `renderer/src/tiles/tileRegistry.js`
3. `renderer/src/components/tiles/tileRegistry.js`
4. `renderer/src/lib/workspace.js`
5. `renderer/src/components/CanvasAddMenu.jsx` if the tile should be manually creatable
6. `renderer/src/systems/commands/useCanvasCommands.js` if the tile should be manually creatable
7. `renderer/src/lib/testingTiles.js` if the tile should appear in the tile QA playground
8. This file

## Current Matrix

| Tile Name | Type ID | Exists in code? | Status | User-creatable? | In Add Menu? | In Testing Tiles? | Draggable | Selectable | Editable | Resizable | Container | Navigation | Physics | Lazy candidate | Primary component |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Link Tile | `link` | yes | stable | indirect via paste/import | no | yes | yes | yes | no | no | no | no | no | no | `LinkTile.jsx` |
| Amazon Product Tile | `amazon-product` | yes | stable | no direct create flow | no | no | yes | yes | no | no | no | yes | no | no | `AmazonProductTile.jsx` |
| Checklist Tile | `checklist` | yes | stable | yes | yes | no seeded examples yet | yes | yes | yes | no | no | no | no | no | `ChecklistTile.jsx` |
| Code Snippet Tile | `code` | yes | stable | yes | yes | yes | yes | yes | yes | no | no | no | no | no | `CodeSnippetTile.jsx` |
| Note Tile | `note` | yes | stable | yes | yes | yes | yes | yes | yes | no | no | no | no | no | `NoteTile.jsx` |
| Table Tile | `table` | yes | stable | yes | yes | yes | yes | yes | yes | no | no | no | no | no | `TableTile.jsx` |
| Rack Tile | `rack` | yes | stable | yes | yes | no | yes | yes | no | no | yes | no | no | no | `RackTile.jsx` |
| Node Group Tile | `node-group` | placeholder only | planned | no | no | no | yes | yes | yes | yes | yes | no | no | no | placeholder |
| Game Tile | `game` | placeholder only | planned | no | no | no | yes | yes | no | yes | no | no | no | yes | placeholder |
| 3D Model Tile | `3d-model` | placeholder only | planned | no | no | no | yes | yes | no | yes | no | no | no | yes | placeholder |
| Physics Item Tile | `physics-item` | placeholder only | planned | no | no | no | yes | yes | no | yes | no | no | yes | yes | placeholder |

## Notes

- Source of truth for tile ids: `renderer/src/tiles/tileTypes.js`
- Source of truth for metadata, capability flags, and status: `renderer/src/tiles/tileRegistry.js`
- Testing Tiles is now the universal tile QA playground, but not every stable tile has a seeded example yet.
- Current manually creatable structure tiles are `checklist`, `code`, `note`, `table`, and `rack`.
- Link-based tiles still mostly enter the system through paste/import and preview resolution instead of the Add menu.

## Testing Tiles Coverage

Current seeded QA rows in `renderer/src/lib/testingTiles.js`:

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
- `Tables / Databases`
- `Development / Technical`

## Rule For New Tiles

Before a new stable tile is considered complete:

1. Add the tile type and both registry entries.
2. Add workspace normalization and default creation support.
3. Add a manual creation flow if the tile should be user-creatable.
4. Add at least one Testing Tiles example.
5. Update this matrix.
