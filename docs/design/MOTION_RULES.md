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

## Tile Motion Ownership
- Link, image, music, and YouTube preview tiles do not currently use Framer Motion for press feedback.
- Shared tile wrapper state is exposed through `renderer/src/components/tiles/TileShell.jsx` as `data-interaction-state`.
- Gesture capture is handled by `renderer/src/systems/interactions/useTileGesture.js`, and tile press selection is coordinated by `renderer/src/systems/interactions/useCanvasInteractionSystem.js`.
- Video-tile press feedback is currently authored in `renderer/src/styles.css` on `.card__video-frame`.

## Video Tile Press Feedback
- The current shrink-on-tap rule is `.card[data-interaction-state="pressed"] .card__video-frame { transform: scale(0.992); }`.
- If this motion is adjusted, keep the change local to the video frame rather than scaling the full tile shell. Scaling the full shell would also move toolbar chrome and selection affordances.
- Before changing or deleting the rule, confirm whether the live app still emits `data-interaction-state="pressed"` in the active build. The current source layout helper only documents `idle`, `hover`, `focused`, `selected`, and `dragging`.
