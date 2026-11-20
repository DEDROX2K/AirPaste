# Rack Rules

The rack is a shelf that holds tiles. Tiles stand on it side by side, each in a
dark frame captioned with its source, and move on and off it with spring
physics. Read this before changing anything in `RackTile`, the rack geometry,
or the drag paths that touch racks.

Source of truth for numbers: `renderer/src/tiles/rack/geometry.js` (sizes,
zones, distances), `renderer/src/tiles/rack/layout.js` (shelves and
capacity) and `renderer/src/tiles/rack/rackMotion.js` (spring model).
This doc explains them; if they disagree, fix the doc.

## Files

| What | Where |
| --- | --- |
| Geometry (pure, import-free) | `renderer/src/tiles/rack/geometry.js` |
| Shelves layout, capacity, drop slot | `renderer/src/tiles/rack/layout.js` |
| Materials, frame styles, style-panel event | `renderer/src/tiles/rack/model.js` |
| Right-click entry | `radialMenuActions.js` (`rack-style`), handler in `CanvasWorkspaceView.jsx` |
| Spring model, dock hints, approach store | `renderer/src/tiles/rack/rackMotion.js` |
| Rack tile, spring loop, rubber band | `renderer/src/components/tiles/RackTile.jsx` / `.css` |
| Drop zone, insertion index | `findRackDropTarget` in `renderer/src/systems/layout/tileLayout.js` |
| Approach shrink, throw, dock hints, tear-off start | `renderer/src/systems/interactions/useCanvasInteractionSystem.js` |
| Approach scale on the dragged card | `useRackApproach` in `TileShell.jsx`, `--rack-s` in `styles.css` |
| Membership, frame widths, centring | `addTileToRack` / `removeTileFromRack` / `syncRackChildren` in `renderer/src/lib/workspace.js` |

## What is saved, and what isn't

- Saved: `tileIds` (order), each child's `parentRackId` / `rackIndex`,
  `slotWidths` (each frame's width, derived from the tile's size), `tiers`
  (how many tiles are on each shelf, in order), `material` and `frameStyle`.
- `tiers` must add up to `tileIds.length` with no shelf over 5; anything else
  (legacy racks) is re-chunked in fives on load.
- There is no wall-rail or collapsed mode (both were tried and removed on
  2026-11-20). Old racks that saved `orientation` / `collapsed` drop them on
  load.
- Never saved: every spring, the gap, the ghost slot, the shelf dip, squash,
  hover and the approach scale. They are runtime-only.
- `plasticColor` and `minSlots` are legacy fields. Keep normalizing them, but
  they don't affect the look or the layout.

## Look

### Shelf
- `rack_edge.svg` (114 × 30.3645) scaled ×2.4: the right cap as drawn, the left
  cap mirrored, the middle stretched. One path, one gradient
  (`userSpaceOnUse`, y −21.6358 → 30.3645, stops `#5F5F5F` 0, `#656363` .349,
  `#7F7F7F` .740, `#A6A6A6` .832, `#868686` 1).
- Height 72.9. Shelf edge to first frame: 134.9 (cap inset 90.9 + 44).
- Minimum width 489.8. The width fits the frames plus both caps.
- The shelf is drawn **behind** the tiles. Their feet stand on its top surface.
- The rack's name is pressed into the shelf's front lip: 11px, uppercase,
  dark with a 1px light highlight. Click it to rename.
- Selected: an outline traced on the shelf path. No ring around the box.

### Racked tile
- The image box is 250 tall. Its width follows the tile's own aspect ratio,
  clamped to 0.56–1.9. Past that the tile is cropped: scaled to cover,
  centred horizontally, top-aligned.
- The real tile renders inside it as a static preview
  (`renderHint.isStaticPreview`), inert.
- Frame: `#232323`, 6px padding, 30px caption strip, outer radius 30, media
  radius 24.
- Caption: the source URL without protocol or `www.`, else the title, else the
  tile kind. 11px, `#7C7C7C`, `#A9A9A9` on hover.
- Frames are 30 apart and centred as a group. A frame's bottom sits 26.2
  (0.36 × shelf height) into the shelf top.

### Empty and hover states
- Empty rack: "Drop tiles here" above the shelf. It fades out while a tile is
  over the rack.
- Ghost slot (where a hovering tile will go): radius 30, faint fill with a
  1.5px inset edge, scales 0.96 → 1 as it fades in. Ink flips for dark theme.

## Motion model

- Every animation is a spring: mass 1, stiffness (2π / response)²,
  damping 4π · dampingFraction / response (Apple's response /
  dampingFraction).
- **Every response below is multiplied by 0.769 (100/130) at runtime.**
  Damping is used as written. Port the numbers as listed and let
  `Spring` apply the factor.
- Springs step in fixed sub-steps of 1/480 s, with frames capped at 50 ms.
- One loop per rack, run from `requestAnimationFrame` only while something
  moves. It writes transforms and CSS variables straight to the DOM. React
  renders only when membership, size or the drop preview changes.
- `prefers-reduced-motion`: every spring snaps to its target.

| Spring | response | damping |
| --- | --- | --- |
| Neighbours to their slot | .38 | .80 |
| Dock flight (x, y) | .46 | .70 (inherits release velocity) |
| Docking scale to 1 | .40 | .78 |
| Frame + caption grow in (p 0 → 1) | .36 | .90 |
| Shelf width | .42 | .82 |
| Shelf dip | .32 | .32 |
| Squash | .26 | .42 |
| Ghost position / opacity | .30 / .22 | .90 / 1 |
| Rubber band follow | .05 | 1 |
| Pick-up lift / scale 1.03 | .25 | 1 / .80 |
| Tilt from velocity | .30 | .70 |
| Hover lift | .22 | .90 |

## Interactions

### Dragging a tile onto the rack
- **Zone**: the shelf's width plus 30 each side, from 150 above the top of the
  frames to 60 below the shelf. Once inside it, the zone grows by 40
  (hysteresis), so the gap doesn't flicker at the edge. Overlapping zones:
  the rack whose centre is nearest wins.
- **Insertion index**: the number of racked frames whose centre is left of the
  dragged tile's on-screen centre.
- **Gap**: neighbours open a gap as wide as the incoming frame(s), the shelf
  grows to fit, and the ghost slot fades in. Leaving the zone closes it.
- **Approach**: within 220 of the zone, a single dragged tile shrinks up to 30%
  of the way toward its rack size. Inside the zone it is fully at rack size.
  It scales around the exact point under the pointer, so it never slides away
  from the finger. (Scale glides on `--rack-s`, about 300 ms with a little
  overshoot.)
- **Throw**: the release velocity, averaged over the last 90 ms, is projected
  0.12 s ahead. If that point is in a zone, the tile docks there even if the
  pointer never got there.
- Several tiles dropped together go in side by side from the insertion index.
  They don't shrink on approach.

### Docking
- The rack flies the tile in from where it was on screen, at the size it was,
  with the throw's momentum (a dock hint written on drop). The frame and
  caption grow in on the way.
- **Landing**: when the tile crosses its slot moving down (or after 650 ms),
  the shelf dips (velocity += 40 + impact × 0.1) and every racked tile rides
  the dip. The tile squashes (scaleY 1 + q, scaleX 1 − 0.6q, origin bottom;
  q velocity −= 0.7 + impact × 0.00045). The squash ripples to neighbours:
  q velocity −= 0.42 / distance, delayed 46 ms × distance.
- The rack grows and shrinks about its centre: x moves by half the width
  change, so the shelf opens both ways.
- No toast. The landing is the feedback.

### Taking a tile off
- Press a racked tile: it lifts (scale 1.03, −6, shadow).
- Pull it: it rubber-bands, offset = (1 − 1 / (x · 0.55 / 110 + 1)) · 110,
  and tilts with horizontal velocity (clamp(vx × 0.011, −7, 7)°).
- Past 56 it **tears off**. It becomes a canvas drag at full size, with the
  same point under the pointer, drawn at its rack scale. The approach then
  takes over: it stays small while over the rack, and grows back once away.
  The gap it left stays open while the drag is still in the zone.
- Let go before the tear: it springs home. If it moved, it lands again.
  A tap without moving does nothing.
- Reorder: tear it off and drop it back on the same shelf. The gap follows
  the insertion index.
- Keyboard: Enter, Space or R on a focused racked tile takes it off, placed
  just above the rack.

### Stacking (within a rack)
held 30 › landing 20 › racked tiles 10 + index › ghost 5 › shelf 1.

## Shelves and style

### Capacity and tiers
- A shelf holds at most **5** tiles (`RACK_TIER_CAPACITY`).
- Dropping on a full shelf **refuses**: the ghost slot opens on the next shelf
  down that has room. If every shelf below is full, a new shelf appears under
  the last one. The tile lands there at the same index (or the end of that
  shelf).
- The **first** refusal on a rack in a session also shakes that shelf sideways
  and makes it hop (shake velocity +1100 on a .18 / .22 spring, dip velocity
  −150, its tiles squash a little), as a one-time hint. After that a full
  shelf passes tiles down quietly, with no shake (`shakenRackIds` in
  RackTile).
- Dropping just below the bottom shelf also opens a new shelf.
- Shelves are 24 apart (each tier is 360 tall). With two or more, two posts
  (10 wide, 70 in from the shelf ends) run behind everything from just above
  the top frames to the bottom shelf, so the shelves read as one stacked rack.
- A new shelf drops in from 36 above and fades in. Posts grow.
- Landing dips only the shelf the tile lands on. The squash ripples along that
  shelf only.
- Appending (keyboard, paste, legacy calls) fills the last shelf, then opens a
  new one. A flat insert (legacy callers) overflows shelf to shelf, keeping
  order.

### Materials and frames
- Right-click "Rack style" opens a small panel above the rack: five material
  swatches and three frame styles. It is counter-scaled to stay readable at
  any zoom, and closes on Escape or a click outside.
- Materials (`RACK_MATERIALS`): brushed steel (default), oak, walnut, acrylic
  (tinted glass with an edge stroke, never `backdrop-filter`) and concrete.
  Each sets the shelf gradient's five stops, the post colour and the name ink.
- Frames (`RACK_FRAME_STYLES`): dark frame (default), gallery mat (white mat,
  near-square corners) and Polaroid (warm off-white, handwritten caption).
  All three keep the same geometry, so changing style never moves anything.
- The app's global button rule forces radius, background-image and box-shadow
  with `!important`. The swatches take theirs back with scoped `!important`
  rules. Keep that if you restyle them.

## Don'ts

- Don't put `backdrop-filter` anywhere in the rack (see the canvas drag
  performance notes). The old plastic sheet was removed partly for this.
- Don't animate rack layout through React state or CSS transitions on layout
  properties. Use the rack's spring loop.
- Don't save runtime motion state on the card.
- Don't hardcode geometry numbers outside `geometry.js`.
