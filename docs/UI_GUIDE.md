# AirPaste UI Guide

## Beta Two Direction

AirPaste beta two should feel like a creative desktop utility from the Win98 and Y2K era that somehow stayed useful long enough to become modern again.

- The shell should feel like a compact desktop window, not a web dashboard.
- Panels should read as physical UI pieces with 1px bevel logic.
- Blue is reserved for active title bars, selected states, and primary actions.
- Silver, gray, off-white, and muted teal carry the rest of the interface.
- The canvas is still the hero. Retro chrome frames it, but never overwhelms it.

## Color Model

Use semantic tokens from `renderer/src/design/theme.css`.

Core intent:

- Desktop background: cool gray or steel-blue field
- Window chrome: silver
- Raised face: `#d4d0c8` family
- Inset field: white with darker top-left edge
- Active blue: strong classic OS blue
- Text: near-black, never low-contrast beige

Rules:

- Do not use soft luxury neutrals as the default shell direction anymore.
- Do not introduce purple accents.
- Do not spread blue across every surface. Blue means active, selected, or primary.
- Warning and danger colors should feel system-native, not marketing-bright.

## Typography

- Body UI uses a Tahoma or MS Sans Serif style stack.
- Display and accent labels can use a mono or bitmap-adjacent stack for retro flavor.
- Metadata stays compact at 11px to 12px.
- Standard control labels should usually stay in the 12px to 14px range.

Rules:

- Favor dense clarity over oversized airy layouts.
- Use uppercase sparingly for section labels, tabs, and meta chrome.
- Do not rely on giant type to create hierarchy.
- Code surfaces keep monospace.

## Surfaces And Borders

AirPaste now uses physical UI logic instead of soft modern depth.

- Raised surfaces get light top-left and dark bottom-right edges.
- Pressed surfaces invert the bevel.
- Windows, trays, menus, and panels use square or near-square corners.
- Large soft radii are no longer the default language.

Rules:

- Prefer 1px border systems.
- If a component needs hierarchy, solve it with bevel, tone, and spacing first.
- Avoid blurred glass, frosted overlays, and soft card fog.
- Shadows should be minimal and mechanical, not atmospheric.

## Buttons

Button families:

- Primary: blue system button
- Standard: silver raised button
- Utility: icon button using the same bevel logic
- Danger: silver base with restrained red signal

Rules:

- Buttons should look clickable even when motion is disabled.
- Pressed state must read as physically depressed.
- Disabled buttons should flatten and desaturate.
- Avoid pill buttons unless a component is intentionally non-system.

## Inputs

- Inputs are inset white wells inside silver chrome.
- Focus should use a clear dotted or crisp blue treatment.
- Placeholder text stays legible and system-like.

Rules:

- Keep forms rectangular.
- Do not use glowing focus rings.
- Do not style inputs like floating modern search bars.

## Home Shell

The home screen should feel like a file manager crossed with a media utility.

- Sidebar acts like navigation chrome.
- Toolbar reads like a command strip.
- Browser cards read like selectable file objects inside a desktop app.
- Empty states should feel like utility prompts, not marketing banners.

Rules:

- Keep action groups grouped tightly.
- Use OS-like separators and borders.
- If something can look like a pane or list item, it should.

## Canvas Shell

The canvas is the most important screen and should inherit the retro language without losing performance.

- Floating controls should feel like compact tool trays.
- The create button should feel like a primary system action.
- The board can carry a subtle scanline or brushed texture, but drag clarity wins.
- Selection should be crisp and unmistakable.

Rules:

- No heavy blur on floating chrome.
- No decorative animations on board controls.
- No oversized shadows around the canvas tools.
- Keep keyboard tool flows intact.

Canvas text tools:

- `V` selects the canvas Select tool
- `H` selects the canvas Hand tool
- `T` selects the canvas Text tool
- Hold `Space` for a temporary Hand tool and release to return to the previously selected tool
- Canvas shortcuts must stay silent while typing in editable fields

## Tiles

Tiles should look like content windows dropped onto the board.

- Default tiles use crisp edge definition.
- Selected tiles should read as active windows.
- Internal tile controls should borrow from the same retro control family.
- Code and utility tiles may be slightly darker, but should still feel native to the system.

Rules:

- Do not reintroduce soft floating-card aesthetics.
- Do not use neon outlines.
- Do not mix rounded modern controls inside sharp retro shells.
- Keep tile drag performance clean.

## Menus, Dialogs, Toasts

- Menus should feel like native context menus.
- Dialogs should read like compact system modals.
- Toasts can feel like small status windows rather than soft snackbars.

Rules:

- Use edge definition, not blur.
- Maintain compact spacing.
- Keep status color visible but secondary to structure.

## Responsive Behavior

The retro language still needs to survive smaller widths.

- Toolbar groups may wrap, but each control should stay usable.
- Sidebar collapse should preserve icon recognizability.
- Floating canvas controls should stack cleanly.
- Menus and trays must clamp to the viewport.

Rules:

- Reduce chrome before reducing readability.
- Avoid shrinking controls below practical pointer size.

## Anti-Patterns

- Do not drift back into warm-minimal SaaS styling.
- Do not use glassmorphism.
- Do not use purple gradients.
- Do not use large 16px to 24px corner radii as the default.
- Do not make everything blue.
- Do not trade canvas responsiveness for decoration.
