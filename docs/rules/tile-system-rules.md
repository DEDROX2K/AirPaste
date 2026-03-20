# Tile System Rules

## Naming
- Everything on the canvas is a **tile**.
- Folders are **container tiles**.
- Node groups represent **systems or behaviors**, not random objects unless a real object tile is needed.
- Page links are **navigation tiles**.
- Specialized tiles should use explicit names: `game`, `3d-model`, `physics-item`, and similar.

## Architecture
- Every tile must be registered in the central tile registry.
- Shared frame, chrome, and common affordances belong in `TileShell`.
- Tile-specific rendering and behavior stay inside the tile's own module.
- Capabilities should drive behavior instead of scattered hardcoded conditionals.

## Data
- Every tile needs a stable `type`.
- Each tile should define a clear data shape or schema.
- Persist only durable tile state.
- Keep runtime-only state separate from saved state, especially for physics, live sims, and temporary UI.

## Interaction
- All tiles support drag and select by default.
- Hover, focus, press, and selection states should feel consistent across tiles.
- Container behaviors like folders, racks, and groups should be reusable primitives.

## Performance
- Heavy tiles such as 3D, game, and physics tiles must be lazy-loaded.
- Animations should pause when tiles are offscreen or inactive.
- Avoid unnecessary React re-renders during drag and gesture updates.

