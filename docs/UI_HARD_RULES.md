# AirPaste UI Hard Rules

These rules are non-optional for canvas and tile UI work.

## Tile Rules

- Tiles must not use shadows.
- Tiles must not use blur.
- Tiles must not use glow effects.
- Tiles must not use backdrop filters.
- Tiles must not use heavy gradients.
- Tiles must not use decorative motion.
- Separation should come from spacing, border, tone, or outline instead of shadow.

## Canvas Rules

- Canvas performance is more important than visual decoration.
- Avoid effects that become more expensive during pan, zoom, drag, selection, or editing.
- Keep selection, hover, and focus states visible but quiet.
- Do not introduce loading-only visual states for tiles that should always be interactive.

## Control Rules

- Floating toolbars, menus, and popovers should stay flat and neutral.
- Use subtle borders and calm hover states.
- Do not add heavy glassmorphism or glossy chrome.
- Use system fonts unless a canvas object explicitly needs a different fallback stack.

## Text Box Rule

- Canvas text objects should feel like direct canvas typography, not miniature cards.
- Text editing should stay lightweight.
- Use textarea-based editing for simple whole-box text unless a richer editor is explicitly justified.
