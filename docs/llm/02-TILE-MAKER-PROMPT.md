# AirPaste — New Tile Maker (prompt for an LLM)

> HOW TO USE: copy this whole file into an LLM chat. Then, at the very bottom, fill in
> "MY TILE IDEA". The LLM will reply with ready-to-drop files plus small, exact edits
> for existing files. Checked against the source on 2026-10-28.

---

## YOUR ROLE

You are building **one new tile type** for AirPaste, a local-first Electron + React 19
desktop app. You do **not** have the codebase. Everything you need is in this document.
Follow the patterns here exactly — the app silently deletes tiles that are wired wrong.

## WHAT AIRPASTE IS (short)

- An infinite canvas where the user saves anything. Each saved thing is a **tile**.
- Tiles are **DOM elements** (React `<article>`) inside a CSS-transformed canvas div.
  They are not drawn on `<canvas>`.
- Data is saved locally as JSON. A tile is a plain object: `{ id, type, x, y, width,
  height, createdAt, updatedAt, ...your fields }`.
- The owner is a **designer**. Each tile should look like a distinct **physical
  object** resting on a canvas (reference: get-spatial.com, mymind) — not a generic
  grey card. Be bold and specific in the visual design. Keep text minimal; let the
  visual carry the idea. Functional tiles (tables, lists) stay legible and quiet.
- Shared behaviour (drag, select, hover, right-click) comes from the app — you only
  hook into it.

## TECH RULES

- Plain JavaScript: `.js` and `.jsx`. **No TypeScript. No Tailwind** in the tile.
- React 19 function components. Wrap the export in `memo(...)`.
- Styling: **one plain CSS file** for the tile, imported by the component.
  - Use your own root class, BEM-style: `.yourtype-tile`, `.yourtype-tile__part`,
    `.yourtype-tile--state`.
  - Do **not** use the classes `card__surface` or `card__surface-frame` — a global file
    overrides them with `!important`.
  - You may use theme tokens: `--ap-text-primary`, `--ap-text-secondary`,
    `--ap-text-tertiary`, `--ap-border-default`, `--ap-surface-raised`,
    `--ap-bg-page`, `--ap-font-body`. Bespoke colours are fine for the tile's own art.
  - `--canvas-zoom` is set on the canvas. For UI that must stay the same screen size at
    any zoom: `calc(1 / var(--canvas-zoom, 1))`.
  - Selected state: TileShell adds `.card--selected`, `.card--hovered`,
    `.card--dragging`, `.card--focused` on the outer `<article>`. Style off those, e.g.
    `.card--selected .yourtype-tile { outline: ... }`.
- No new npm packages unless truly needed; say so clearly if you add one.
  Available already: `lucide-react` (icons), `framer-motion`, `clsx`.
- Network: the renderer may call public HTTPS APIs with `fetch` (the weather tile calls
  Open-Meteo this way). No API keys. Always handle offline/failure with a clear fallback
  state — never a permanent spinner.
- Never call Electron, `require`, `fs`, or `window.airpaste` from the tile.
- Keep **runtime data** (fetched results, timers, animation state) in React state.
  Save on the card **only durable data** the user chose (settings, text, values).
- Animations: stop them when `renderHint?.renderState === "compact"`,
  `renderHint?.simplify === true`, or `renderHint?.isStaticPreview === true` (the tile
  is drawn small inside a "rack" container then). Respect `prefers-reduced-motion`.

## NAMING (pick these first, use them everywhere)

Example for a "pomodoro" tile:

| Thing | Example |
|---|---|
| type id (kebab-case, stable forever) | `pomodoro` |
| TILE_TYPES key | `POMODORO` |
| model folder | `renderer/src/tiles/pomodoro/model.js` |
| constants | `POMODORO_CARD_TYPE`, `POMODORO_CARD_SIZE` |
| create function | `createPomodoroCard` |
| component file | `renderer/src/components/tiles/PomodoroTile.jsx` |
| CSS file | `renderer/src/components/tiles/PomodoroTile.css` |
| CSS root class | `.pomodoro-tile` |
| provider function | `createNewPomodoroCard` |
| command | `createPomodoro` |

---

## REFERENCE 1 — model file (copy this shape)

This is the real Counter tile model. Your `model.js` must follow it.

```js
// renderer/src/tiles/counter/model.js
import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const COUNTER_CARD_TYPE = TILE_TYPES.COUNTER;

export const COUNTER_CARD_SIZE = Object.freeze({
  width: 360,
  height: 300,
});

export const COUNTER_DEFAULT_TITLE = "Counter";
export const COUNTER_DEFAULT_VALUE = 0;
export const COUNTER_DEFAULT_STEP = 1;
export const COUNTER_DEFAULT_UNIT = "";

// One normalize helper per saved field: bad/missing input -> safe default.
export function normalizeCounterValue(value) {
  return Number.isFinite(value) ? Number(value) : COUNTER_DEFAULT_VALUE;
}

export function normalizeCounterStep(step) {
  return Number.isFinite(step) && Number(step) > 0 ? Number(step) : COUNTER_DEFAULT_STEP;
}

export function normalizeCounterUnit(unit) {
  return typeof unit === "string" ? unit : COUNTER_DEFAULT_UNIT;
}

export function createCounterCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, COUNTER_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: COUNTER_CARD_TYPE,
    title: firstString(options?.title, COUNTER_DEFAULT_TITLE),
    value: normalizeCounterValue(options?.value),
    step: normalizeCounterStep(options?.step),
    unit: normalizeCounterUnit(options?.unit),
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
```

Note: Counter can use `title`, `value`, `step`, `unit` because `normalizeCard` already
has Counter-specific branches for them. **Your new tile cannot** — use prefixed names
(see step 3e).

Helpers you can import from `../../lib/workspace`: `firstString(...values)` (first
non-empty string), `nowIso()`, `getNextCardPosition(cards, viewport, type, center)`,
`normalizeCard(card)`.

## REFERENCE 2 — component file (copy this shape)

Template showing every required hook-up. Replace `yourtype` / `YourType` and build the
real design inside `.yourtype-tile`.

```jsx
// renderer/src/components/tiles/YourTypeTile.jsx
import { memo } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";
import "./YourTypeTile.css";

// Stops a click/keypress inside an input or button from starting a tile drag
// or triggering canvas shortcuts.
function stopPointer(event) {
  event.stopPropagation();
}

function stopKey(event) {
  event.stopPropagation();
}

function YourTypeTile({
  card,
  tileMeta,
  renderHint,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
}) {
  const { updateExistingCard } = useAppContext();
  // Spread onto the element that should act as the drag handle (usually the root).
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  // Static preview = drawn inside a rack: show it, but no interaction or motion.
  const isStatic = renderHint?.isStaticPreview === true;

  // Save durable changes. The patch is merged into the card and re-normalized.
  const update = (patch) => updateExistingCard(card.id, patch);

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      renderHint={renderHint}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--yourtype"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="yourtype-tile" {...surfaceGesture}>
        {/* Own prefixed field, NOT `title` (see "Field name clash warning"). */}
        <input
          className="yourtype-tile__label"
          type="text"
          value={card.yourTypeLabel ?? ""}
          placeholder="Label"
          aria-label="Label"
          disabled={isStatic}
          onPointerDown={stopPointer}
          onKeyDown={stopKey}
          onChange={(event) => update({ yourTypeLabel: event.target.value })}
        />
        {/* ...the tile's real design... */}
      </div>
    </TileShell>
  );
}

export default memo(YourTypeTile);
```

Rules for the component:
- **Always** wrap in `<TileShell>` and pass all the props shown.
- Any interactive child (input, button, slider, textarea) needs
  `onPointerDown={stopPointer}`; inputs also `onKeyDown={stopKey}`. Without this,
  clicking it drags the tile or fires canvas shortcuts.
- Root element should fill the tile: `width: 100%; height: 100%;` in CSS. The tile's
  pixel size is `card.width` × `card.height`.
- If the design has a fixed art size, scale it:
  `const scale = card.width / YOUR_CARD_SIZE.width;`.
- Clean up every timer/interval/listener in `useEffect` return functions.
- `updateExistingCard` only saves fields that are listed in `normalizeCard` (step 3e
  below). Unlisted fields vanish.

---

## WIRING — every edit needed (mirror the Weather tile)

The Weather tile (`weather`) is the most recent tile and was wired exactly this way.
**Rule of thumb: wherever `WEATHER` / `Weather` appears in the files below, add the same
line for your tile right after it.**

### 1. `renderer/src/tiles/tileTypes.js`
Add inside the frozen object:
```js
  WEATHER: "weather",
  YOUR_TYPE: "your-type",   // <- add
```

### 2. `renderer/src/tiles/tileRegistry.js`
Add an import next to the other tile imports, and an entry in `tileRegistry`:
```js
import YourTypeTile from "../components/tiles/YourTypeTile";
...
  [TILE_TYPES.YOUR_TYPE]: {
    type: TILE_TYPES.YOUR_TYPE,
    displayName: "Your Type Tile",
    status: "stable",
    Component: YourTypeTile,
  },
```

### 3. `renderer/src/lib/workspace.js` (the critical file)

a) Import from your model, next to the weather import block:
```js
import {
  YOUR_TYPE_CARD_SIZE,
  YOUR_TYPE_CARD_TYPE,
  normalizeYourTypeFoo,
  normalizeYourTypeLabel,
} from "../tiles/your-type/model";
```
b) Re-export the create function, next to `export { createWeatherCard } from "../tiles/weather/model";`:
```js
export { createYourTypeCard } from "../tiles/your-type/model";
```
c) In `function getCardType(card)`, next to the weather check (**without this, every tile
of your type is deleted on load**):
```js
  if (card?.type === YOUR_TYPE_CARD_TYPE) {
    return YOUR_TYPE_CARD_TYPE;
  }
```
d) In `function getCardSize(type)`, next to the weather check:
```js
  if (type === YOUR_TYPE_CARD_TYPE) {
    return YOUR_TYPE_CARD_SIZE;
  }
```
e) In `export function normalizeCard(card, fallbackIndex = 0)`, inside the big returned
object, next to the weather lines:
```js
    city: type === WEATHER_CARD_TYPE ? normalizeWeatherCity(card?.city) : "",
    location: type === WEATHER_CARD_TYPE ? normalizeWeatherLocation(card?.location) : null,
    // add one line per saved field of your tile:
    yourTypeFoo: type === YOUR_TYPE_CARD_TYPE ? normalizeYourTypeFoo(card?.yourTypeFoo) : null,
    yourTypeLabel: type === YOUR_TYPE_CARD_TYPE ? normalizeYourTypeLabel(card?.yourTypeLabel) : "",
```
**Field name clash warning:** `normalizeCard` already outputs these fields for every
tile, and for your type it forces them to an empty default (`""`, `null`, `0`, …).
If you save data under one of these names **it will be wiped on the next update**:

`id type x y width height createdAt updatedAt url contentKind title description body
subtitle text style placeholder appearance placeholderText autoWidth source variant
format titleMode sticky language code wrap showLineNumbers value step unit targetAt
timezone showSeconds mode max linkedTileId month year view themeId heightPreset image
favicon siteName resolvedUrl previewStatus contentType sourceType duration author
channelName mediaAspectRatio previewKind previewError status previewDiagnostics
previewMode webclipImagePath webclipAspectRatio webclipPreviousHeight webclipStatus
asset file productAsin productPrice productDomain productRating productReviewCount
items repo city location dateLabel timeLabel columns rows tileIds minSlots plasticColor
layout airpaste parentRackId rackIndex`

**Always prefix your fields** with your type name (`pomodoroMinutes`,
`pomodoroLabel`), or store everything in one object field named after your type
(e.g. `pomodoro: { minutes, label }`) with one normalize helper. Even a title should be
`pomodoroTitle`, not `title`.

f) In `export function formatCardSubtitle(card)`, next to the weather check (short
label shown in lists/search):
```js
  if (card.type === YOUR_TYPE_CARD_TYPE) {
    return "your type · something short";
  }
```

### 4. `renderer/src/context/AppProvider.jsx`
a) Add `createYourTypeCard,` to the import list from `../lib/workspace` (next to
`createWeatherCard,`).
b) Add this next to `const createNewWeatherCard = useCallback(...)`:
```js
  const createNewYourTypeCard = useCallback((center = null, options = {}) => {
    const card = createYourTypeCard(workspace.cards, workspace.viewport, center, options);
    commitWorkspaceChange((current) => updateActivePageDocument(current, (page) => ({
      ...page,
      cards: [...page.cards, card],
    })));
    return card;
  }, [commitWorkspaceChange, workspace.cards, workspace.viewport]);
```
c) Add `createNewYourTypeCard,` next to **both** later occurrences of
`createNewWeatherCard,` (the context value object and its dependency list).

### 5. `renderer/src/components/CanvasWorkspaceView.jsx`
Add `createNewYourTypeCard,` next to **both** occurrences of `createNewWeatherCard,`
(one pulls it from `useAppContext()`, one passes it into `useCanvasCommands`).

### 6. `renderer/src/systems/commands/useCanvasCommands.js`
a) Add `createNewYourTypeCard,` to the destructured params, next to `createNewWeatherCard,`.
b) Add next to `const createWeather = useCallback(...)`:
```js
  const createYourType = useCallback((preferredCenter = null) => {
    if (!folderPath) {
      log("warn", "New your-type tile blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return null;
    }

    const centerPoint = preferredCenter ?? getViewportCenter();
    const tile = createNewYourTypeCard(centerPoint);

    log("success", "New your-type tile created on the canvas", centerPoint);
    toast("success", "Your Type dropped into place.");
    maybeRemark(toast, TILE_CREATE_QUIPS, "create");
    return tile;
  }, [createNewYourTypeCard, folderPath, getViewportCenter, log, toast]);
```
c) Add `createYourType,` next to **both** later occurrences of `createWeather,` (the
returned object and its dependency list).

### 7. `renderer/src/components/CanvasAddMenu.jsx` (the "+" menu)
a) Add an item to the right section of `MENU_SECTIONS` (`write`, `plan`, `data`,
`organize`):
```js
      { key: "your-type", label: "Your Type", icon: "your-type", command: "createYourType" },
```
b) Add an icon branch in the icon function, next to `if (icon === "weather") {`.
16×16 viewBox, stroke `currentColor`, strokeWidth 1.2, no fill:
```jsx
  if (icon === "your-type") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {/* simple line icon */}
      </svg>
    );
  }
```

### 8. `renderer/src/components/CanvasDock.jsx` (optional, bottom dock)
Next to the weather entry (uses a `lucide-react` icon imported at the top of the file):
```js
        { key: "your-type", label: "Your Type", icon: SomeLucideIcon, onSelect: () => commands?.createYourType?.() },
```

### 9. `renderer/src/components/tiles/RackTile.jsx`
In the `TILE_TYPE_LABELS` object, next to `weather: "Weather",`:
```js
  "your-type": "Your Type",
```

### 10. `docs/TILE_BOOK.md`
Add one row to the "Tile Inventory" table (status `Implemented`, type id in backticks)
and a `## Your Type Tile` section with: Type ID, Purpose, User-facing UX, Data model
(JS block), Main files, Add menu behaviour, Known limitations. (`npm run check:tiles`
fails if a stable type is missing here.)

### 11. Assets (optional)
Static images go in `public/<your-type>/...` and are referenced as
`` `${import.meta.env.BASE_URL}<your-type>/file.png` ``.

---

## OUTPUT FORMAT (follow exactly)

Reply in this order:

1. **Summary** — 2–3 lines: what the tile does and how it looks.
2. **Saved data shape** — a JS block of the fields saved on the card, with defaults.
3. **New files** — each as a full file, heading = exact path, ready to drop in:
   - `renderer/src/tiles/<type>/model.js`
   - `renderer/src/components/tiles/<Name>Tile.jsx`
   - `renderer/src/components/tiles/<Name>Tile.css`
   - any extra helper file (e.g. `renderer/src/tiles/<type>/<name>Data.js` for fetch logic)
4. **Edits to existing files** — for each of steps 1–10 above: the file path, the
   **existing anchor line** to find, and the exact lines to add after it. Never rewrite a
   whole existing file. Never remove existing lines.
5. **Test steps** — how to check it works in `npm run dev`.

Quality checklist before you answer:
- [ ] Type id is kebab-case and used identically everywhere.
- [ ] `getCardType`, `getCardSize`, `normalizeCard` all updated (or the tile is deleted).
- [ ] Every saved field has a normalize helper with a safe default; no field-name clashes.
- [ ] Component uses `TileShell` + `useTileGesture`; inputs/buttons stop propagation.
- [ ] No permanent loading state; offline/error/empty states are designed.
- [ ] Timers and listeners are cleaned up; motion stops in compact/static preview.
- [ ] CSS is scoped under `.yourtype-tile`; no `card__surface*` classes; no TypeScript.

---

## MY TILE IDEA (fill this in)

- **Name:**
- **What it does:**
- **How it should look / feel (references, colours, materials, motion):**
- **What the user can change on it (this is what gets saved):**
- **Live data from the internet? (which API):**
- **Default size (px) if you care:**
- **Which "+" menu group:** write / plan / data / organize
