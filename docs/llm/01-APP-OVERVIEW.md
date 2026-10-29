# AirPaste — How the App Is Built (context for an LLM)

> Paste this whole file into an LLM chat so it understands the AirPaste codebase.
> Facts below were checked against the source on 2026-10-28. If the code and this
> file disagree, the code wins.

## 1. What AirPaste is

AirPaste is a **local-first desktop app** (Windows first; also builds for macOS/Linux).
It is an **infinite canvas** where the user saves anything: links (with auto previews),
images, files, notes, checklists, tables, code, weather, GitHub repos, and more.
Every saved thing is a **tile** on the canvas.

- No cloud, no account. Everything is plain files in a folder on the user's disk.
- The person building it is a **designer**. The goal is that every tile type has its
  own rich, custom, "physical object" look (reference: get-spatial.com, mymind).
  Tiles should feel like distinct objects resting on a canvas, not uniform boxes.
- Consistency lives in shared **behaviour** (drag, select, hover, motion), not in visuals.
  Visuals can vary wildly per tile.

## 2. Tech stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron 37 (Node ≥ 22) |
| UI | React 19 + Vite 7, plain JavaScript (`.js` / `.jsx`, no TypeScript in app code) |
| Canvas | **DOM-based**: tiles are normal React `<article>` elements inside a CSS-transformed div (`.canvas__content`). Konva is only used for the freehand drawing layer. |
| Rich text | Tiptap 3 (ProseMirror); CodeMirror 6 for code/markdown |
| UI primitives | Radix UI, lucide-react icons, Framer Motion |
| 3D (home screen only) | three.js + react-three-fiber |
| Styling | Plain CSS files per component + CSS custom-property tokens (`--ap-*`). Tailwind exists but tiles use their own CSS. |
| Link previews | `open-graph-scraper` + `cheerio` in the main process, with site-specific resolvers |
| Tests | Vitest (`npm test`), ESLint (`npm run lint`) |

Commands:

```
npm install
npm run dev        # Vite (port 5173) + Electron together
npm run build      # build renderer into dist-renderer/
npm test           # vitest
npm run lint
npm run check:tiles   # checks docs/TILE_BOOK.md lists every stable tile type
npm run package:win   # Windows installer
```

## 3. The three processes / layers

Electron apps have a **main process** (Node, full disk access) and a **renderer process**
(the web page). They talk only through a **preload bridge**.

```
┌──────────────────────── main process (Node) ────────────────────────┐
│ main.js -> main/index.js                                             │
│   main/windows.js          window creation, graceful close/flush     │
│   main/ipc/workspace.js    load/save canvases, history               │
│   main/ipc/dome.js         list/create/switch "Domes" (root folders) │
│   main/ipc/files.js        markdown files, rename/delete, user name  │
│   main/ipc/assets.js       image import, custom asset:// protocol    │
│   main/ipc/linkPreview.js  fetch link previews (uses preview/)       │
│   main/workspaceQueue.js   serialises all writes per folder          │
│ workspace-service.js       all disk reads/writes, atomic writes      │
│ json-canvas.js             converts app data <-> .canvas files       │
│ preview/                   link preview pipeline + per-site resolvers│
│ shared/workspace-schema.json   WORKSPACE_SCHEMA_VERSION (now 17)     │
└──────────────────────────────────────────────────────────────────────┘
                 ▲  ipcRenderer.invoke("airpaste:...")
                 │
┌──────────── preload.js ─────────────┐
│ exposes window.airpaste = { ... }   │  (contextBridge; the ONLY way the UI
└─────────────────────────────────────┘   touches disk/network-privileged stuff)
                 │
┌──────────────────────── renderer (React) ───────────────────────────┐
│ renderer/src/main.jsx      mounts providers + App, imports global CSS│
│ renderer/src/App.jsx       boot splash, top tabs, Home vs Canvas     │
│ renderer/src/lib/desktop.js  thin wrapper around window.airpaste     │
│ ... see section 5                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

Rules that hold everywhere:
- React components **never** call Electron or write files directly. They go through
  `lib/desktop.js` → `window.airpaste` → IPC → main process.
- All canvas load/save IPC is **serialised per workspace root** (no write races).
- File writes are **atomic** (unique temp file + rename, plus backup).
- Any change to the saved data shape must be **versioned** (bump the schema version
  and add a migration) — *adding a brand-new tile type does not need a bump*.

## 4. How data is stored on disk

- A **Dome** = a root folder the user picked. It contains:
  - `.airpaste/` — internal state: `dome.json`, `ui-state.json`, `state.json`, `tmp/`.
  - `*.canvas` files — one per canvas. Format is the open **JSON Canvas** spec
    (same as Obsidian Canvas). Legacy format `*.airpaste.json` is still readable.
  - Plain user files (markdown notes, imported images, etc.).
- A canvas can have **multiple pages**. Each page has `cards` (tiles), `viewport`
  (`{x, y, zoom}`), `drawings`, `tethers` (links between tiles), and groups.
- `json-canvas.js` writes each tile as a JSON Canvas node of type `text`, `link`, or
  `file` (so other apps can read it), and stores the **full AirPaste tile object** under
  `node.airpaste.card`. On load, that full object is read back. So any field on a tile
  survives saving — **as long as `normalizeCard()` keeps it** (see 6.3).

## 5. Renderer folder map

```
renderer/src/
  App.jsx                    top-level screens
  main.jsx                   entry; imports global CSS in order
  context/
    AppProvider.jsx          THE app state: workspace, pages, cards, undo/redo,
                             save/load, and createNew<Type>Card() functions
    useAppContext.js         hook to read it (e.g. updateExistingCard)
    ToastProvider / LogProvider / TabProvider
  components/
    HomeShell.jsx            home screen (file browser, recent, starred)
    CanvasWorkspaceView.jsx  the canvas screen; renders every tile via <Card>
    Card.jsx                 picks the right tile component from the registry
    CanvasAddMenu.jsx        "+" create menu (grouped list of tile types)
    CanvasDock.jsx           bottom dock (also creates tiles)
    TileContextMenu.jsx      right-click menu on tiles
    TilePolish.css           global tile overrides (uses !important — see 6.5)
    tiles/                   ONE component (+ optional .css) PER TILE TYPE
      TileShell.jsx          shared outer wrapper every tile must use
    canvas/                  drawing layer, tether lines, density zones, embeds
    ui/app/                  shared app buttons, dialogs, menus, inputs
  tiles/
    tileTypes.js             TILE_TYPES: every type id string
    tileRegistry.js          type id -> { displayName, status, Component }
    <type>/model.js          per-type: default size, defaults, normalize helpers,
                             create<Type>Card()
  lib/
    workspace.js             data model core: normalizeCard(), getCardType(),
                             getCardSize(), formatCardSubtitle(), racks, pages,
                             migrations, clipboard
    desktop.js               bridge to window.airpaste
    testingTiles.js          seeds the "Testing Tiles" QA canvas
  systems/
    canvas/        pan/zoom (useCanvasSystem), level-of-detail (tileLod)
    interactions/  select/drag (useCanvasInteractionSystem), useTileGesture,
                   radial menu
    commands/      useCanvasCommands: create<Type>() user actions (+toast/log)
    layout/        tile z-index/style vars, density zones
    import/        drag-and-drop + paste import from OS
    snapping/  tether/  drawing/  globe/ (3D home globe)
  design/          theme.css (tokens, light/dark), motion.css, cursors.css
```

## 6. How tiles work (the core of the app)

### 6.1 A tile is a plain object

```js
{
  id: "uuid",
  type: "counter",            // stable type id from TILE_TYPES
  x: 120, y: 120,             // world position
  width: 360, height: 300,
  createdAt: "ISO", updatedAt: "ISO",
  // ...type-specific fields, e.g. title, value, step, unit
  layout, airpaste, parentRackId, rackIndex   // shared extras
}
```

### 6.2 Render path

```
CanvasWorkspaceView  ──for each card──>  <Card card={...} tileMeta renderHint ...>
Card.jsx  ──getTileRegistration(card)──>  tileRegistry[card.type].Component
<TheTile> wraps its content in <TileShell> (shared classes, hover/focus/context menu)
```

Props every tile component receives: `card`, `tileMeta` (isSelected, isHovered,
isFocused, isDragging, styleVars…), `renderHint` (level of detail, `isStaticPreview`),
`dragVisualDelta`, `dragVisualTileIdSet`, `onBeginDrag`, `onPressStart`,
`onContextMenu`, `onHoverChange`, `onFocusIn`, `onFocusOut`, plus a few type-specific ones.

### 6.3 Data path (important)

- Every tile goes through `normalizeCard()` in `renderer/src/lib/workspace.js` on
  create, on load, **and on every update** (`updateExistingCard(id, patch)` →
  `updateCard()` → `normalizeCard({...card, ...patch})`).
- `normalizeCard()` builds the output object **field by field**. A field that is not
  listed there is **silently dropped**. Shared names like `title`, `value`, `text`,
  `status` only keep their value for the tile types that have a branch for them;
  every other type gets an empty default. New tiles should use prefixed field names.
- `getCardType()` returns `null` for an unknown type, and `normalizeCard()` then
  returns `null` → **the tile is deleted**. So every new type must be added to
  `getCardType()`.
- `getCardSize(type)` gives the default size per type.

### 6.4 Creating a tile from the UI

```
CanvasAddMenu / CanvasDock button
  -> commands.createX()                    systems/commands/useCanvasCommands.js
     (checks a folder is open, picks viewport centre, toast + log)
  -> createNewXCard(center)                context/AppProvider.jsx
  -> createXCard(cards, viewport, center)  tiles/x/model.js  (uses normalizeCard)
  -> committed to the active page, undoable, autosaved
```

`createNewXCard` is passed from `CanvasWorkspaceView.jsx` into `useCanvasCommands`.

### 6.5 Styling

- Each tile has its own CSS file next to its component, imported by the component.
- Use the tile's own root class (e.g. `.weather-tile`, `.sticky-tile`). The legacy
  `.card__surface` / `.card__surface-frame` classes are **flattened by
  `TilePolish.css` with `!important`**, so new designs should not rely on them.
- Tokens live in `renderer/src/design/theme.css` (`--ap-*`), with light and dark modes.
- `--canvas-zoom` is set on the canvas; use `calc(1 / var(--canvas-zoom, 1))` for chrome
  that should stay the same screen size at any zoom.

### 6.6 Existing tile types

`link` (also images/videos/music), `file`, `amazon-product`, `github-repo`, `weather`,
`calendar`, `checklist`, `code`, `counter`, `deadline`, `canvas-text` (plain text box,
sticky note, markdown note — variants), `note` / `text-box` (legacy aliases),
`paper-note`, `progress`, `table`, `rack` (container that holds other tiles).
Placeholders (render nothing yet): `node-group`, `game`, `3d-model`, `physics-item`.
Full spec per tile: `docs/TILE_BOOK.md`.

## 7. Other systems worth knowing

- **Undo/redo + history**: in AppProvider; canvas file history is kept by the main
  process (`listCanvasHistory`, `restoreCanvasHistoryEntry`).
- **Link previews**: pasting a URL creates a `link` tile; main process runs
  `preview/resolve-preview.js` → classifies the URL → site resolver (GitHub, Amazon,
  YouTube/video, Pinterest, generic OG) → `card-mapper.js` maps the result onto the tile
  (may change its type, e.g. to `github-repo` or `amazon-product`).
- **Racks**: a rack tile holds other tiles (`tileIds`); racked tiles have
  `parentRackId` + `rackIndex`, are hidden on the canvas, and are drawn inside the rack
  as static previews (`renderHint.isStaticPreview === true`).
- **Tethers**: physics-y lines connecting tiles (`systems/tether`).
- **Level of detail**: `renderHint.renderState` is `"detail"` or `"compact"`; tiles
  should simplify/stop animating when compact, simplified, or a static preview.
- **Testing Tiles canvas**: `lib/testingTiles.js` seeds a QA board with examples of tiles.

## 8. Project rules (from `docs/rules` and `ARCHITECTURE.md`)

- Register every tile type in the central registry; don't bloat `Card.jsx`.
- Every tile uses the shared selection, drag, focus, z-index and context-menu systems
  (`TileShell` + `useTileGesture`).
- Persist only durable state; keep live/runtime state (fetched data, timers, animation)
  in React state, not on the card.
- Heavy tiles (3D, games, physics) must lazy-load. Pause animations when offscreen.
- Never hide tile images as a "performance" trick — reduce effects/motion instead.
- No direct Electron calls from React. No random inline styles in production code.
