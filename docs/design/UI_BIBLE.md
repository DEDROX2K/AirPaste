# AirPaste UI Bible

The AirPaste aesthetic is distinct, functional, and strictly controlled. While we utilize `shadcn/ui` as a robust accessibility and primitive foundation, **shadcn components must NEVER leak onto the Canvas unmodified.**

## 1. The Separation of Canvas vs. Chrome

**App Chrome** (Settings, Sidebars, Modals, Menus, Toolbars)
- Use standard HTML structures wrapped in `App*` components.
- Rely strictly on the Tailwind CSS tokens defined in `tailwind.config.js`.

**Canvas Objects** (Notes, Links, Folders, Racks, Connectors)
- Remain *completely custom*.
- These components exist in spatial 2D/3D environments. Tailwind relies on standard DOM flow, which breaks when `transformScale()` or absolute positioning rules clash.
- Continue to use standard CSS modules or `styles.css` for canvas objects.
- Do NOT convert a Note or a Tile to an `AppCard`.

## 2. Layout & Anatomy Standards

To preserve the edge-to-edge workspace immersive feeling, follow these structured dimensional rules for app chrome:

### **Top bars / Headers**
- **Height**: Strictly `h-14` (56px).
- **Styling**: `bg-ap-surface-shell/80 backdrop-blur-md border-b border-ap-border-subtle sticky top-0`.
- **Anatomy**: Left-aligned breadcrumb node, Center search inputs (optional), Right-aligned modular toolbars & layout controls.

### **Sidebar Panels**
- **Width**: `w-60` (240px).
- **Header Top**: Standard height (`h-14`) with title wordmark string: `Air` `Paste` (with Air supporting static primary weight bindings).
- **Inner Nesting nodes**: Explicitly leverage ghost-weighted triggers or indentation wrappers with border bindings (`border-l border-ap-border-subtle/60`).

## 3. Empty State Standards
Empty states deliver structural messaging that is centered and clean:
- **Layout Structure**: `flex flex-col items-center justify-center p-8 text-center`.
- **Hierarchy node tree**:
  - Eyebrow auxiliary state row.
  - Bold Title string (font-semibold).
  - Descriptions string (`text-ap-text-secondary`).
  - Modular `AppButton` setup trigger triggers.

## 4. No Novelty Configurations
Tailwind classes like `rounded-xl`, `bg-indigo-500`, or `shadow-2xl` are strictly forbidden. Use our semantic design tokens:
- **Surface**: `bg-ap-surface-shell`, `bg-ap-surface-panel`
- **Border**: `border-ap-border-subtle`
- **Radius**: `rounded-ap-md` (8px), `rounded-ap-lg`
- **Timers**: `transition-ap-normal ease-ap-smooth`

If a design token is missing, add it to `styles.css` setup structure globally. Do not insert one-off values locally.
