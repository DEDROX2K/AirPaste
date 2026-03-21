# AirPaste UI Bible

The AirPaste aesthetic is distinct, functional, and strictly controlled. While we utilize `shadcn/ui` as a robust accessibility and primitive foundation, **shadcn components must NEVER leak onto the Canvas unmodified.**

## 1. The Separation of Canvas vs. Chrome

**App Chrome** (Settings, Sidebars, Modals, Menus, Toolbars)
- Use standard HTML structures wrapped in `App*` components.
- Rely strictly on the Tailwind CSS tokens defined in `tailwind.config.js`.

**Canvas Objects** (Notes, Links, Folders, Racks, Connectors)
- Remain *completely custom*.
- These components exist in spatial 2D/3D environments. Tailwind relies on standard DOM flow, which breaks when `transform: scale()` or absolute positioning rules clash.
- Continue to use standard CSS modules or `styles.css` for canvas objects.
- Do NOT convert a Note or a Tile to an `AppCard`.

## 2. No Raw Primitives
Never `import { Button } from "@/components/ui/button"`.
Always `import { AppButton } from "@/components/ui/app/AppButton"`.
Our wrappers bake in the standard radiuses, motion timings, and typography rules of the AirPaste system.

## 3. ESLint Guardrails
A strict `no-restricted-imports` ESLint rule is actively enforced in the repository. 
If you attempt to import a raw generic primitive `from "@/components/ui/button"`, the build will fail. 
You are required to use the central export: `import { AppButton } from "@/components/ui/app"`.

## 4. No Novelty Configurations
Tailwind classes like `rounded-xl`, `bg-indigo-500`, or `shadow-2xl` are strictly forbidden. 
Use our semantic design tokens:
- `bg-ap-surface-shell`
- `text-ap-text-primary`
- `rounded-ap-md`
- `transition-ap-normal ease-ap-smooth`

If a design token is missing, add it to `index.css` and `tailwind.config.js` globally. Do not invent one-off values for a specific screen.
