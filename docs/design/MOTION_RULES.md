# Motion Rules

AirPaste avoids jagged, robotic interactions. We rely on bespoke timing curves rather than default Tailwind `ease-in-out` values.

## CSS Variables
- `--ap-duration-fast`: `150ms` (Micro-interactions, button hovers, toggles)
- `--ap-duration-normal`: `250ms` (Standard fades, overlay reveals, context menus)
- `--ap-duration-slow`: `400ms` (Sheet entrances, major layout shifts)

- `--ap-ease-spring`: `cubic-bezier(0.175, 0.885, 0.32, 1.275)` (Playful pop-ins, bouncy elements)
- `--ap-ease-smooth`: `cubic-bezier(0.2, 0.8, 0.2, 1)` (Decelerating "Apple-like" premium sweeps)

## Tailwind Implementation
When applying transitions, ALWAYS use the AirPaste extensions:
```jsx
// CORRECT
<div className="transition-all duration-ap-normal ease-ap-smooth" />

// INCORRECT
<div className="transition-all duration-200 ease-out" />
```
