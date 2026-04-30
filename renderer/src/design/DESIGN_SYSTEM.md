# AirPaste Design System

AirPaste uses a calm, white-to-warm-neutral desktop UI system.

The product direction is:

- Apple-like restraint in spacing, radius, and depth
- Claude-like readability, focus, and low-chrome calm
- Neutral surfaces instead of blue-tinted shell chrome
- Soft borders and light shadows instead of heavy glow
- Clear interaction states that stay visible without shouting

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

- Tiles do not use shadows
