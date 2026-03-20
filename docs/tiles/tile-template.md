# Tile Template

## Name
- Human-readable tile name.

## Type ID
- Stable machine ID used in saved data and the tile registry.

## Purpose
- Why this tile exists and what job it solves on the canvas.

## Visual Description
- High-level shape, layout, and visual cues.

## Capabilities
- Drag
- Resize
- Edit
- Container
- Navigation
- Physics
- Lazy-load

## States
- Idle
- Hover
- Focused
- Selected
- Dragging
- Disabled or inactive if needed

## Interactions
- Primary actions
- Secondary actions
- Keyboard or pointer behavior if relevant

## Behavior on Canvas
- How it behaves in the free canvas environment.

## Behavior in Containers
- Folder behavior
- Rack behavior
- Node group behavior

## Data Schema
```js
{
  id: "tile-id",
  type: "tile-type",
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  data: {}
}
```

## Rendering Notes
- Shared shell needs
- Lazy-loading needs
- Runtime-only state considerations

## Future Ideas
- Planned upgrades
- Open questions
- Nice-to-have interactions

