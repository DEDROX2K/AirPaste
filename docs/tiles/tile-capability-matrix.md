# Tile Capability Matrix

| Tile Name | Type ID | Exists in code? | Registered in foundation registry? | Draggable | Selectable | Editable | Resizable | Can contain children | Can live in folder | Can live in rack | Can join node group | Physics-enabled | Has custom render loop | Heavy / lazy-load candidate | Persistence complexity | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Note Tile (Base) | `text` | yes | yes | yes | yes | yes | no | no | yes | yes | no | no | no | no | low | stable |
| Link Tile | `link` | yes | yes | yes | yes | no | no | no | yes | yes | no | no | no | no | medium | stable |
| Folder Tile | `folder` | yes | yes | yes | yes | no | no | yes | no | no | no | no | no | no | medium | stable |
| Note Folder Tile | `note-folder` | yes | yes | yes | yes | no | no | no | yes | yes | no | no | no | no | medium | deprecated |
| Rack Tile | `rack` | yes | yes | yes | yes | no | no | yes | no | no | no | no | no | no | medium | stable |
| Page Link Tile | `page-link` | no | yes | yes | yes | yes | yes | no | yes | yes | yes | no | no | no | low | planned |
| Node Group Tile | `node-group` | no | yes | yes | yes | yes | yes | yes | no | no | yes | no | no | no | medium | planned |
| Game Tile | `game` | no | yes | yes | yes | no | yes | no | yes | yes | yes | no | yes | yes | high | planned |
| 3D Model Tile | `3d-model` | no | yes | yes | yes | no | yes | no | yes | yes | yes | no | yes | yes | high | planned |
| Physics Item Tile | `physics-item` | no | yes | yes | yes | no | yes | no | yes | yes | yes | yes | yes | yes | high | planned |

## Shared capabilities
- Dragging and selection already behave like universal tile affordances. Those should stay consistent across almost every tile type.
- Shared hover, focus, pressed, selected, dragging, and context-menu chrome should continue to flow through `TileShell` and the current interaction/layout systems.
- Stable `type` IDs and normalized persisted card data should remain universal even when a tile gets specialized rendering.

## Specialized capabilities
- Text editing should stay limited to note-like tiles unless another tile genuinely owns inline content.
- Generic child containment belongs to container families such as folders, racks, and future node groups, not every tile that happens to open or expand.
- Physics, custom render loops, and heavy lazy-loaded rendering should stay confined to advanced tiles like game, 3D, and physics families.

## Risk areas
- The current runtime still encodes several behaviors with direct `tile.type` checks in persistence, layout, and commands. That will get harder to manage as more tile families arrive.
- The new foundation registry and the live runtime registry are still separate sources of truth. If they drift, design planning and implementation will diverge quickly.
- Container rules already differ between `folder`, `rack`, and `note-folder`. Adding more container-like tiles without clearer boundaries will create overlapping behaviors.
- There is no resize system yet, so planned size-aware tiles could pile up faster than the interaction model can support them.
- Heavy tiles will need lifecycle boundaries early. Without them, custom render loops, simulation state, and lazy loading will leak into the general canvas path.

## Tile families

### Core content tiles
- Includes: Note Tile (Base), Link Tile
- Shared rules: must support standard drag/select flows, fit the common shell, and persist simple card data cleanly.
- Optional: rich editing, preview modes, import-specific metadata, content-specific toolbars.

### Note family (Unified)
- Includes: Base Note Tile (`text`) with variants:
  - Canonical: Quick Note (`notes-quick`)
  - Supported Legacy Styles: Sticky Note (`notes-1`), Todo Note (`notes-2`), Paper Note (`notes-3`)
- Shared rules: All note variants must use the base `text` tile type. Interaction mode (drag vs edit) is determined contextually by viewport zoom level.
- Deprecated: `note-folder` (Standard folders should be used to group base Note tiles instead).

### Container tiles
- Includes: Folder Tile, Rack Tile, future Node Group Tile
- Shared rules: containment rules must be explicit, reusable, and separate from tile-specific visuals.
- Optional: open/closed states, slot layouts, grouping previews, nested rendering.

### Navigation tiles
- Includes: Page Link Tile
- Shared rules: should prioritize destination clarity, safe navigation behavior, and lightweight persistence.
- Optional: breadcrumbs, workspace/page metadata previews, recents-aware badges.

### Interactive tiles
- Includes: Game Tile, some future live widgets
- Shared rules: should respect selection/drag conventions before custom interaction layers take over.
- Optional: embedded controls, pause/resume states, local-only runtime state.

### Simulation / physics tiles
- Includes: Physics Item Tile, future simulation helpers
- Shared rules: persisted state and runtime simulation state should stay clearly separated.
- Optional: colliders, constraints, scene membership, node-group participation.

### Heavy media / 3D tiles
- Includes: 3D Model Tile, heavier Game Tile variants
- Shared rules: should be lazy-loaded, isolated, and able to suspend work when offscreen.
- Optional: custom render loops, asset loaders, GPU-backed previews.

### Experimental tiles
- Includes: future one-off prototypes before they graduate into a real family
- Shared rules: still need stable type IDs, registry entries, and capability declarations.
- Optional: any specialized behavior, but only behind a clearly named tile type and a contained module.

