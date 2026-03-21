# AirPaste Component Specifications

## Core Concept
Every standard UI element is an `App*` wrapper around a raw `shadcn/ui` primitive.

### AppButton
- **Default Radius**: `ap-md` (8px)
- **Transitions**: Fast (`150ms`) with smooth easing (`cubic-bezier(0.2, 0.8, 0.2, 1)`).
- **Usage**: Use for all standard button interactions outside of the canvas.

### AppCard, AppDialog, AppSheet
- **Surfaces**: Overlays utilize `bg-ap-surface-dialog` or `bg-ap-surface-panel`.
- **Borders**: All structural containers enforce `border-ap-border-subtle`.
- **Primary Text**: `text-ap-text-primary`.
- **Secondary Text (Captions/Descriptions)**: `text-ap-text-secondary`.

### AppDropdownMenu, AppContextMenu
- **Hover States**: Items leverage `focus:bg-ap-surface-muted` instead of generic grays to preserve semantic theming.
- **Elevation**: Menus use the `z-ap-menu` depth token.

## Extending the System
When you need a new Shadcn component (e.g., `<Switch />`), follow these steps:
1. Terminal: `npx shadcn@latest add switch`
2. Duplicate an existing wrapper template as `AppSwitch.jsx`.
3. Erase whatever generic Tailwind rounded/color classes Shadcn inserted.
4. Replace them with AirPaste tokens (e.g., `rounded-ap-md`, `bg-ap-surface-muted`).
5. Only consume `AppSwitch` in the app.
