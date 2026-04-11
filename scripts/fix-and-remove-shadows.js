const fs = require('fs');
const path = require('path');

const stylesPath = path.join(process.cwd(), 'renderer/src/styles.css');
let content = fs.readFileSync(stylesPath, 'utf8');

// List of exact blocks to replace (safest way)
const replacements = [
    [
        `.card {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: var(--tile-width);
  z-index: var(--tile-z, 1);
  /* Keep containment limited to layout/style so transforms remain isolated
     without clipping overflow-heavy tile visuals. */
  contain: layout style;
  transform: translate3d(
    calc(var(--tile-x, 0) + var(--tile-drag-x, 0px)),
    calc(var(--tile-y, 0) + var(--tile-drag-y, 0px)),
    0
  );
  overflow: visible;
  transition: ;
}

.card--hovered:not(.card--dragging) {
  filter: brightness(1.02);
}

.card--hovered:not(.card--selected):not(.card--dragging) .card__surface-frame .card__surface:not(.card__surface--music):not(.card__surface--rack),
.card--hovered:not(.card--selected):not(.card--dragging) .card__surface-frame .card__record-sleeve,
.card--hovered:not(.card--selected):not(.card--dragging) .card__surface-frame .card__folder-front {
  border-color: rgba(255, 255, 255, 0.24);
}

.card--focused:not(.card--selected):not(.card--dragging) .card__surface-frame .card__surface:not(.card__surface--music),
.card--focused:not(.card--selected):not(.card--dragging) .card__surface-frame .card__record-sleeve {
  border-color: rgba(255, 255, 255, 0.32);
}

.card--dragging {
  will-change: transform;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 0 12px;
  cursor: grab;
  user-select: none;
}

.card__toolbar:active {
  cursor: grabbing;
}`,
        `.card {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: var(--tile-width);
  z-index: var(--tile-z, 1);
  /* Keep containment limited to layout/style so transforms remain isolated
     without clipping overflow-heavy tile visuals. */
  contain: layout style;
  transform: translate3d(
    calc(var(--tile-x, 0) + var(--tile-drag-x, 0px)),
    calc(var(--tile-y, 0) + var(--tile-drag-y, 0px)),
    0
  );
  overflow: visible;
  transition: transform 180ms ease;
}

.card--hovered:not(.card--dragging) {
  filter: brightness(1.02);
}

.card--hovered:not(.card--selected):not(.card--dragging) .card__surface-frame .card__surface:not(.card__surface--music):not(.card__surface--rack),
.card--hovered:not(.card--selected):not(.card--dragging) .card__surface-frame .card__record-sleeve,
.card--hovered:not(.card--selected):not(.card--dragging) .card__surface-frame .card__folder-front {
  border-color: rgba(255, 255, 255, 0.24);
}

.card--focused:not(.card--selected):not(.card--dragging) .card__surface-frame .card__surface:not(.card__surface--music),
.card--focused:not(.card--selected):not(.card--dragging) .card__surface-frame .card__record-sleeve {
  border-color: rgba(255, 255, 255, 0.32);
}

.card--dragging {
  will-change: transform;
}

.card__toolbar {
  display: flex;
  align-self: center;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 0 12px;
  cursor: grab;
  user-select: none;
}

.card__toolbar:active {
  cursor: grabbing;
}`
    ],
    // Remove individual shadow lines throughout the file
    [`box-shadow:
    0 18px 36px rgba(0, 0, 0, 0.26),
    0 0 0 2px rgba(185, 175, 255, 0.92);`, `border: 2px solid rgba(185, 175, 255, 0.92);`],
    [`box-shadow:
    0 20px 38px rgba(0, 0, 0, 0.26),
    0 0 0 2px rgba(185, 175, 255, 0.92);`, `border: 2px solid rgba(185, 175, 255, 0.92);`],
    [`filter: drop-shadow(0 28px 40px rgba(0, 0, 0, 0.24));`, `/* shadow removed */`],
    [`filter: drop-shadow(0 22px 40px rgba(53, 179, 255, 0.2));`, `/* shadow removed */`],
    [`filter: drop-shadow(0 18px 34px rgba(66, 186, 255, 0.16));`, `/* shadow removed */`],
    [`filter: drop-shadow(0 24px 42px rgba(66, 186, 255, 0.28));`, `/* shadow removed */`],
    [`text-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);`, `/* shadow removed */`],
    [`filter: drop-shadow(var(--rack-shadow-rest, 0 28px 40px rgba(0, 0, 0, 0.28)));`, `/* shadow removed */`],
    [`filter: drop-shadow(var(--rack-shadow-hover, 0 42px 58px rgba(0, 0, 0, 0.36)));`, `/* shadow removed */`],
    [`box-shadow: 0 16px 30px rgba(0, 0, 0, 0.22);`, `/* shadow removed */`],
    [`box-shadow: none;`, `/* shadow removed */`],
    [`box-shadow: 0 0 0 0 transparent;`, `/* shadow removed */`],
    [`box-shadow:
    0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent),
    0 0 0 12px color-mix(in srgb, var(--accent) 10%, transparent);`, `border: 2px solid var(--accent);`],
    [`box-shadow:
    0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent),
    0 0 0 8px color-mix(in srgb, var(--accent) 8%, transparent);`, `border: 2px solid var(--accent);`],
    [`box-shadow:
    inset 0 6px 14px rgba(255, 213, 157, 0.22),
    inset 0 -8px 16px rgba(113, 59, 18, 0.18),
    0 18px 26px rgba(47, 24, 10, 0.24),
    0 2px 0 rgba(255, 237, 208, 0.08);`, `/* shadow removed */`],
    [`box-shadow:
    inset 0 2px 4px rgba(71, 34, 9, 0.12),
    inset 0 1px 0 rgba(255, 229, 189, 0.08);`, `/* shadow removed */`],
    [`box-shadow:
    inset 0 2px 4px rgba(71, 34, 9, 0.08),
    0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);`, `/* shadow removed */`],
    [`box-shadow:
    inset 0 6px 14px rgba(255, 213, 157, 0.24),
    inset 0 -8px 16px rgba(113, 59, 18, 0.2),
    0 24px 34px rgba(47, 24, 10, 0.3),
    0 2px 0 rgba(255, 237, 208, 0.12);`, `/* shadow removed */`],
    [`box-shadow:
    0 8px 20px color-mix(in srgb, var(--shadow) 72%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);`, `/* shadow removed */`],
    [`box-shadow:
    0 12px 28px rgba(30, 116, 182, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.42);`, `/* shadow removed */`],
    [`box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.38),
    inset 0 -3px 0 rgba(30, 122, 190, 0.22);`, `/* shadow removed */`],
    [`box-shadow:
    0 26px 44px rgba(17, 86, 142, 0.28),
    0 0 0 2px rgba(219, 243, 255, 0.98),
    0 0 0 7px rgba(63, 174, 245, 0.22);`, `border: 2px solid white;`],
    [`box-shadow:
    0 28px 48px rgba(17, 86, 142, 0.3),
    0 0 0 2px rgba(219, 243, 255, 0.98),
    0 0 0 10px rgba(63, 174, 245, 0.24);`, `border: 2px solid white;`],
    [`text-shadow: 0 1px 1px rgba(16, 100, 151, 0.18);`, `/* shadow removed */`],
    [`box-shadow:
    0 28px 44px rgba(14, 74, 124, 0.2),
    0 0 0 1px rgba(110, 180, 237, 0.14);`, `border: 1px solid rgba(110, 180, 237, 0.14);`],
    [`filter: drop-shadow(0 -10px 20px rgba(52, 52, 52, 0.1));`, `/* shadow removed */`],
    [`box-shadow:
    0 32px 50px rgba(95, 62, 16, 0.22),
    0 0 0 2px rgba(217, 245, 255, 0.92),
    0 0 0 10px rgba(255, 255, 255, 0.08);`, `border: 2px solid white;`],
    [`box-shadow:
    0 28px 46px rgba(95, 62, 16, 0.32),
    0 0 0 2px rgba(217, 245, 255, 0.92),
    0 0 0 6px rgba(255, 255, 255, 0.12);`, `border: 2px solid white;`],
    [`text-shadow: 0 1px 1px rgba(122, 76, 17, 0.18);`, `/* shadow removed */`],
    [`box-shadow:
    0 24px 38px rgba(0, 0, 0, 0.22),
    0 0 0 1px rgba(255, 255, 255, 0.24);`, `border: 1px solid white;`],
    [`box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);`, `/* shadow removed */`],
    [`box-shadow:
    0 0 0 2px rgba(185, 175, 255, 0.92),
    0 16px 30px rgba(0, 0, 0, 0.22);`, `border: 2px solid var(--accent);`],
    [`box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.32),
    0 20px 38px rgba(0, 0, 0, 0.28);`, `border: 1px solid white;`],
    [`box-shadow:
    0 18px 36px rgba(0, 0, 0, 0.26),
    0 0 0 2px rgba(185, 175, 255, 0.92);`, `border: 2px solid var(--accent);`],
];

replacements.forEach(([from, to]) => {
    content = content.replace(from, to);
});

fs.writeFileSync(stylesPath, content, 'utf8');
console.log('Shadow removal and corruption fix complete.');
