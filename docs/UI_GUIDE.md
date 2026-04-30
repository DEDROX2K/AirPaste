# AirPaste UI Guide

## Visual Direction

AirPaste should feel calm, precise, and local-first.

- White and warm-neutral surfaces
- Soft, restrained depth
- Clear hierarchy without dashboard-like noise
- Content-first shell chrome
- Apple-like spacing and softness
- Claude-like readability and focus

The interface should not feel blue-tinted, glossy, glassy, or overdesigned.

## Color Tokens

Use semantic tokens from `renderer/src/design/theme.css`.

Core light theme intent:

- Page background: warm off-white
- Panels and cards: near-white
- Borders: subtle stone/beige grays
- Primary text: deep charcoal
- Secondary text: softened neutral gray
- Accent button: neutral dark, not blue
- Focus ring: muted warm gray

Rules:

- Use neutral backgrounds by default
- Use accent color for emphasis, not for general shell tinting
- Keep destructive styling explicit but restrained
- Avoid introducing one-off blues for hover, selection, or focus states

## Typography

- UI font: system sans-serif via the existing semantic font tokens
- Code font: existing monospace token stack
- Default body size: 14px equivalent
- Small metadata: 12px to 13px
- Titles: use clear weight changes before increasing size too much

Rules:

- Prefer a tight, readable hierarchy
- Avoid random weight jumps
- Avoid tiny low-contrast labels
- Keep code tiles on monospace only

## Spacing

- Base spacing follows the token scale in `renderer/src/design/tokens.css`
- Use 8px/12px/16px/24px rhythm most often
- Increase whitespace before increasing decoration

Rules:

- Toolbars should breathe
- Cards should not feel cramped
- Menus should not feel padded like dialogs
- Small controls should still have comfortable hit targets

## Buttons

AirPaste uses a restrained button system:

- Primary: dark neutral fill, white text
- Secondary: white/near-white fill, subtle border
- Ghost: transparent or nearly transparent, soft neutral hover
- Icon: same height/radius rhythm as text buttons, centered icon, quiet hover
- Danger: light destructive tint with clear red text or border
- Disabled: reduced contrast and no fake hover affordance

Rules:

- Keep button heights consistent in the same area
- Reuse shared button primitives before creating one-off styles
- Avoid oversized shadows and loud gradients
- Avoid bright blue CTAs for standard app actions

## Menus And Popovers

- Neutral background
- Soft border
- Rounded corners
- Compact but breathable row spacing
- Hover states should be obvious and quiet

Rules:

- Menu items should not jump in width
- Keep labels left-aligned
- Keep status or shortcut labels visually secondary
- Avoid cramped separators and edge-to-edge hover fills

## Form Controls

Normalize the following around one height/radius language:

- text inputs
- textareas
- selects
- checkboxes
- toggles
- number inputs
- date/time inputs

Rules:

- Use visible focus states
- Use neutral hover fills, not default browser blue when avoidable
- Match corner radius to surrounding UI
- Keep placeholder text readable but clearly secondary

## Tile Styling Rules

Tiles should feel like one family even when they keep some personality.

Shared expectations:

- consistent outer radius
- subtle border
- no shadow
- readable title treatment
- calm selected, hovered, and focused states
- consistent internal controls

Allowed variation:

- subtle tonal tinting by tile type
- different internal layouts based on content needs
- darker treatment for code tiles

Not allowed:

- random gradients across standard tiles
- loud neon selection colors
- inconsistent internal button systems
- any tile shadow in idle, hover, focused, selected, or dragging states

Hard rule:

- Tiles should not have shadows ever again
- Do not add tile shadows as a hover affordance
- Do not add tile shadows as a selection affordance
- Do not add tile shadows back for “premium” or “depth” styling
- If a tile needs separation, use border, spacing, tone, or outline instead

## Shell And Canvas

Home:

- clean panel structure
- one button language for create/import/testing actions
- stable wrapping at smaller widths
- no harsh blue shell tint

Canvas:

- floating controls should stay visually quiet
- selection and focus should be visible but soft
- avoid adding motion or shadow work that hurts drag performance
- canvas chrome should frame content, not compete with it

## Interaction States

- Hover: slight tonal lift or background shift
- Active/pressed: slightly darker or inset state
- Focus: visible muted ring
- Selected: stronger border/ring, still neutral
- Disabled: lower contrast and no misleading hover behavior

Rules:

- Keyboard focus must remain visible
- Do not rely on color alone for destructive or disabled meaning
- Keep transitions short and purposeful

## Responsive Principles

Major screens must hold up at narrow, medium, and large widths.

Rules:

- Toolbars should wrap cleanly
- Action groups should stay aligned when wrapped
- Menus should clamp to viewport bounds
- Cards should avoid unreadable dense controls on narrow widths
- Prefer stacking controls over shrinking text too far

## What Not To Do

- Do not tint the entire shell blue
- Do not add glassmorphism-heavy blur layers
- Do not use flashy gradients outside tile content that already needs them
- Do not mix multiple button systems in one toolbar
- Do not hide focus rings
- Do not use loud shadows during drag or pan interactions
- Do not introduce new one-off colors when semantic tokens already cover the need
