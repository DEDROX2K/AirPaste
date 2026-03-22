# AirPaste Component Specifications

Every standard UI element is an `App*` wrapper around a raw `shadcn/ui` primitive.

## 🟢 Core Components

### **AppButton**
- **Height Default**: Standard height is equivalent to standard node sizes (e.g., `h-8` or `h-9`).
- **Radius**: `ap-md` (8px).
- **Timing duration**: `ap-normal` with `ap-smooth` easing.
- **Variants**:
  - `default`: Primary action buttons or Creation headers.
  - `secondary`: Toggled active node states.
  - `ghost`: Auxiliary list bindings or Navigation tree nodes.

### **AppDropdownMenu & AppContextMenu**
- **Trigger button nodes**: Standard heights `h-8` or default heights.
- **Position offsets**: Use explicit offsets, usually `sideOffset={8}`, to prevent overlapping anchor node visual clips.
- **Heights and padding nodes**: Standard items hover state uses `focus:bg-ap-surface-muted`.

### **AppEmptyState**
- **Layout Structure**: `flex flex-col items-center justify-center p-8 text-center max-w-sm flex-1`.
- **Spacing Guidelines**:
  - Icon Top margin: `mb-3`
  - Eyebrow padding: `mb-1.5` (all caps, text-xs)
  - Title strings: `text-base font-semibold text-ap-text-primary`
  - Muted description strings: `text-xs text-ap-text-secondary mb-4`

### **AppCard, AppDialog, AppSheet**
- **Surfaces**: Overlays utilize `bg-ap-surface-dialog` or `bg-ap-surface-panel`.
- **Borders**: All structural containers inside standard layouts enforce `border-ap-border-subtle`.
- **Typography**: Primary strings: `text-ap-text-primary`, Secondary captions: `text-ap-text-secondary`.

---

## 🛠 Extending the System

When you need a new Shadcn component (e.g., `<Switch />`), follow these steps:

1. **Add Primitive**: `npx shadcn@latest add switch`
2. **Setup Wrapper**: Duplicate an existing wrapper template as `AppSwitch.jsx`.
3. **Strip Presets**: Erase whatever generic Tailwind rounded/color classes Shadcn inserted.
4. **Link Tokens**: Replace them with AirPaste tokens (e.g., `rounded-ap-md`, `bg-ap-surface-muted`).
5. **Lock import rules**: Ensure consumption is exclusively from the approved index central node (`import { AppSwitch } from "./ui/app"`).
