# AirPaste UI Hard Rules

These rules are non-optional for canvas and tile UI work.

## Tile Rules

- Tiles must not use soft modern card shadows.
- Tiles must not use blur.
- Tiles must not use glow effects.
- Tiles must not use backdrop filters.
- Tiles must not use luxury gradients or neon accent treatments.
- Tiles must not use decorative motion.
- Separation should come from crisp borders, bevels, outlines, tone, and spacing.

## Canvas Rules

- Canvas performance is more important than visual decoration.
- Avoid effects that become more expensive during pan, zoom, drag, selection, or editing.
- Keep selection, hover, and focus states visible and crisp.
- Do not introduce loading-only visual states for tiles that should always be interactive.

## Control Rules

- Floating toolbars, menus, and popovers should follow retro tray or window logic.
- Use 1px border systems and bevel logic before adding depth.
- Do not add heavy glassmorphism.
- Do not add soft iOS-style pill controls unless explicitly justified.
- Use the retro system font stack unless a canvas object explicitly needs something else.

## Text Box Rule

- Canvas text objects should feel like direct canvas typography, not miniature cards.
- Text editing should stay lightweight.
- Use textarea-based editing for simple whole-box text unless a richer editor is explicitly justified.

## Beta Two Visual Rules

- Primary action buttons may be blue. Secondary surfaces should stay silver.
- Large rounded corners are not the default.
- Chrome should feel utilitarian, not luxury-minimal.
- If a new control would fit better in Windows 11 than Windows 98, redesign it before shipping.
