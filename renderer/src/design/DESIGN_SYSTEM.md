# AirPaste Design System

## Visual Direction

AirPaste is a local-first visual workspace. The UI must feel like a premium native
desktop application — not a web page dressed up, not a SaaS dashboard. The aesthetic
is restrained, tactile, and layered. Think: physical objects on a desk, not slides
in a deck.

---

## Design Principles

### 1. Local-first materiality
The UI should feel like it lives on your machine. Surfaces have weight and
depth. Shadows are physical, not decorative. Elements stack the way objects stack.

### 2. Restrained sophistication
Fewer, better decisions. No element earns its place by accident. Every color,
shadow, and radius is from the system. If you can remove it without loss, remove it.

### 3. Tactile feedback
Interactive elements respond visibly but subtly. Motion is purposeful —
it communicates state change, not personality. Hover, press, and focus states
are clear without being theatrical.

### 4. Controlled depth
The UI has layers: canvas, surface, card, popover, modal. Each layer has its
own elevation. Depth never feels arbitrary — it encodes z-position semantically.

### 5. Chromeless hierarchy
The interface recedes. Content leads. Navigation, menus, and toolbars are
present but not dominant. Maximum signal-to-chrome ratio.

---

## Color System

### Philosophy
Two neutral scales (light and dark) anchor the palette. One accent color
carries all interactive intent. A small set of semantic colors handle status.
No decorative colors. No gradients except in specific surface contexts.

### Neutral scale — Stone
Stone (warm gray, slightly cool) works for both light and dark themes without
looking sterile. Avoids the yellow cast of warm grays and the coldness of
pure neutrals.

```
stone-50   #FAFAF9   — lightest surface, page background (light)
stone-100  #F5F5F4   — secondary surface
stone-200  #E7E5E4   — borders, dividers
stone-300  #D6D3D1   — disabled states, placeholder
stone-400  #A8A29E   — secondary text, icons (light)
stone-500  #78716C   — tertiary text
stone-600  #57534E   — secondary text (dark)
stone-700  #44403C   — primary text (dark surface)
stone-800  #292524   — rich dark surface
stone-900  #1C1917   — deepest dark, page background (dark)
stone-950  #0C0A09   — true black surface
```

### Accent — Indigo-adjacent (Iris)
Not standard indigo. Slightly violet-shifted, desaturated at higher values.
Feels considered rather than defaulted-to.

```
iris-100   #EEF0FF   — accent tint (light)
iris-200   #E0E3FF   — accent hover tint
iris-400   #818CF8   — accent muted
iris-500   #6366F1   — accent base
iris-600   #4F46E5   — accent press
iris-700   #4338CA   — accent deep
iris-900   #312E81   — accent darkest tint (dark)
```

### Semantic colors

```
success-base   #16A34A   — green-600
success-tint   #F0FDF4   — green-50
warning-base   #D97706   — amber-600
warning-tint   #FFFBEB   — amber-50
danger-base    #DC2626   — red-600
danger-tint    #FEF2F2   — red-50
info-base      #0284C7   — sky-600
info-tint      #F0F9FF   — sky-50
```

---

## Typography Scale

### Typeface decisions
- **Display / UI headings**: `"Mona Sans"` — geometric, confident, wide range of weights
- **Body / prose**: `"Geist"` — monospace-influenced, clean, excellent at small sizes
- **Monospace / code**: `"Geist Mono"` — consistent with body, reduces visual switching

If Mona Sans is unavailable: fallback to `"DM Sans"`, then `system-ui`.
If Geist is unavailable: fallback to `"Inter"`, then `system-ui`.

### Scale
The scale uses a 1.25 major third ratio. All sizes are named semantically,
not by pixel size. Root base: 16px.

```
text-2xs   10px / 0.625rem   — labels, badges, captions
text-xs    12px / 0.75rem    — metadata, timestamps, secondary UI
text-sm    13px / 0.8125rem  — body small, sidebar items
text-base  14px / 0.875rem   — primary body text (desktop app default)
text-md    16px / 1rem       — emphasized body, card titles
text-lg    18px / 1.125rem   — section headers, card headings
text-xl    20px / 1.25rem    — page subheadings
text-2xl   24px / 1.5rem     — page headings
text-3xl   30px / 1.875rem   — display headings
text-4xl   36px / 2.25rem    — hero / welcome
```

### Line heights
```
leading-tight    1.2   — headings
leading-snug     1.35  — subheadings, card titles
leading-normal   1.5   — body text
leading-relaxed  1.65  — long-form prose
```

### Font weights
```
weight-regular    400
weight-medium     500
weight-semibold   600
weight-bold       700
```

### Letter spacing
```
tracking-tight    -0.025em   — large display text
tracking-snug     -0.01em    — headings
tracking-normal    0em       — body
tracking-wide      0.025em   — small caps, labels
tracking-wider     0.05em    — metadata, badges
```

---

## Spacing Scale

Base unit: 4px. All spacing is a multiple of 4.

```
space-0     0px
space-0.5   2px    — hairline gaps
space-1     4px    — icon padding, tight elements
space-1.5   6px    — small gaps
space-2     8px    — inline padding, compact
space-2.5   10px   — medium-small
space-3     12px   — standard element gap
space-4     16px   — section padding (small)
space-5     20px   — element spacing
space-6     24px   — section padding (standard)
space-8     32px   — large gaps
space-10    40px   — section spacing
space-12    48px   — major sections
space-16    64px   — page padding
space-20    80px   — hero spacing
space-24    96px   — large hero
```

---

## Radius Scale

AirPaste uses soft rounded geometry. No hard corners, no pill shapes on non-pill
elements. Radius scales with component size — small components get relatively more
radius to stay visually soft.

```
radius-none    0px
radius-xs      3px    — subtle (small badges, tags)
radius-sm      5px    — inputs, small buttons
radius-md      8px    — standard (buttons, cards, menus)
radius-lg      12px   — modals, panels, large cards
radius-xl      16px   — floating panels, drawers
radius-2xl     20px   — large surfaces
radius-3xl     28px   — welcome screen cards
radius-full    9999px — avatars, pills, circle buttons
```

---

## Shadow / Elevation Scale

Shadows encode depth semantically. Each level corresponds to a z-layer.
Shadows are slightly warm (stone-tinted umbra) to match the palette.
Dark mode uses opacity-based shadows that work on dark surfaces.

```
shadow-none    — no shadow, flat element

shadow-xs      — inset UI affordance
               0 1px 2px rgba(12, 10, 9, 0.06)

shadow-sm      — resting card, inline element
               0 1px 3px rgba(12, 10, 9, 0.08),
               0 1px 2px rgba(12, 10, 9, 0.06)

shadow-md      — raised card, hover state
               0 4px 8px rgba(12, 10, 9, 0.08),
               0 2px 4px rgba(12, 10, 9, 0.06)

shadow-lg      — floating panel, dropdown
               0 8px 24px rgba(12, 10, 9, 0.10),
               0 4px 8px rgba(12, 10, 9, 0.06)

shadow-xl      — modal, dialog
               0 16px 40px rgba(12, 10, 9, 0.12),
               0 8px 16px rgba(12, 10, 9, 0.08)

shadow-2xl     — welcome screen, prominent card
               0 24px 64px rgba(12, 10, 9, 0.14),
               0 12px 24px rgba(12, 10, 9, 0.08)

shadow-inner   — pressed state, inset
               inset 0 2px 4px rgba(12, 10, 9, 0.08)
```

Elevation z-index map:
```
z-base         0     — canvas, page
z-raised       10    — cards, tiles
z-sticky       100   — sticky headers, toolbars
z-dropdown     200   — context menus, selects
z-overlay      300   — drawers, sidebars
z-modal        400   — dialogs, modals
z-toast        500   — notifications, toasts
z-tooltip      600   — tooltips
```

---

## Border Rules

```
border-width-none   0px
border-width-thin   1px    — standard UI border
border-width-base   1.5px  — emphasized border (focus rings)
border-width-thick  2px    — accent borders, selected states
```

Border colors come from the neutral scale:
- Light mode default: `stone-200` — subtle, present but not loud
- Light mode interactive: `stone-300` on hover
- Dark mode default: `stone-700`
- Dark mode interactive: `stone-600` on hover
- Focus: `iris-500` at `border-width-base`

---

## Motion Rules

### Philosophy
Motion is communicative, not decorative. It should help the user understand
what happened and where focus moved. It must feel native — not web-app-bouncy.

### Durations
```
duration-instant   0ms     — no animation (reduced-motion)
duration-fast      100ms   — micro-interactions (hover, icon swap)
duration-normal    150ms   — state transitions (open/close, press)
duration-moderate  200ms   — panel transitions, menu open
duration-slow      300ms   — page transitions, modal enter
duration-deliberate 400ms  — welcome screen, onboarding
```

### Easing curves
```
ease-standard      cubic-bezier(0.2, 0, 0, 1)      — most UI transitions
ease-decelerate    cubic-bezier(0, 0, 0.2, 1)       — elements entering view
ease-accelerate    cubic-bezier(0.4, 0, 1, 1)       — elements leaving view
ease-spring        cubic-bezier(0.35, 1.35, 0.45, 1) — tactile press/expand
ease-linear        linear                            — opacity fades
```

### Principles
- Use `ease-decelerate` for elements entering
- Use `ease-accelerate` for elements leaving
- Use `ease-spring` for interactive press responses
- Never animate layout properties (width, height) unless necessary
- Prefer `transform` and `opacity` for all animated properties
- Respect `prefers-reduced-motion` — collapse all durations to 0ms

---

## Opacity and Blur Rules

### Opacity scale (UI use only)
```
opacity-0        0      — invisible
opacity-disabled 0.4    — disabled elements
opacity-muted    0.6    — secondary, placeholder
opacity-subtle   0.8    — slightly receded
opacity-full     1      — fully visible
```

### Blur scale
Blur is used for frosted-glass surfaces (menus, modals) and depth layering.
Use sparingly — overuse kills performance and looks cheap.

```
blur-none   0px
blur-xs     4px    — subtle panel tint
blur-sm     8px    — menu backdrop
blur-md     12px   — modal backdrop
blur-lg     20px   — full overlay
```

Backdrop blur should be paired with a semi-transparent surface color
(e.g., `stone-50` at 85% opacity in light mode) to maintain legibility.

---

## Surface Layer Model

AirPaste has a defined surface hierarchy. Every component lives on exactly one layer.

```
Layer 0 — Canvas/Page
  Background of the application window.
  Light: stone-50 | Dark: stone-900

Layer 1 — Base Surface
  Main content areas, sidebars.
  Light: stone-100 | Dark: stone-850 (between 800/900)

Layer 2 — Card / Tile
  Individual workspace items, cards, list rows.
  Light: white | Dark: stone-800
  Shadow: shadow-sm

Layer 3 — Raised Surface
  Hovered/selected cards, inline panels.
  Light: white | Dark: stone-750
  Shadow: shadow-md

Layer 4 — Floating
  Dropdowns, context menus, tooltips.
  Light: white + backdrop-blur-sm | Dark: stone-800 + backdrop-blur-sm
  Shadow: shadow-lg

Layer 5 — Modal
  Dialogs, full overlays.
  Light: white | Dark: stone-800
  Shadow: shadow-xl
  Backdrop: black at opacity-40 + blur-lg
```
