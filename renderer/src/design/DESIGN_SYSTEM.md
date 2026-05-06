# AirPaste Design System

AirPaste now uses a retro desktop visual system for beta stage two.

The product direction is:

- Win98 and early-2000s desktop chrome as the base language
- Silver hardware surfaces with crisp 1px bevels
- Deep blue active states for windows, tabs, and primary actions
- Dense, practical controls that still read clearly on modern displays
- Nostalgic shell styling without sacrificing canvas speed or usability

## Source Of Truth

The canonical design guide now lives in:

- `docs/UI_GUIDE.md`

Use that document for:

- visual direction
- semantic color usage
- button variants
- menu/popover styling
- tile styling rules
- form controls
- responsive rules
- anti-patterns

## Implementation Notes

- Primitive tokens live in `renderer/src/design/tokens.css`
- Semantic light theme values live in `renderer/src/design/theme.css`
- Shared app primitives live in `renderer/src/components/ui/app/AppPrimitives.css`
- Product-specific shell, canvas, and tile styling lives in `renderer/src/styles.css`

Components should prefer semantic tokens and shared primitives over hardcoded colors.

Non-negotiable tile rule:

- Tiles do not use soft modern shadows
