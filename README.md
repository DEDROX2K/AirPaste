# AirPaste

AirPaste is a local-first desktop canvas app for capturing links, text, images, and managed notes into a single folder workspace. It stores everything in a local JSON file and keeps UI state, layout, and content in one place.

## What’s in this version

- Click-to-continue splash screen with app logo (`renderer/src/components/SplashScreen.jsx`).
- Rack design polished to a continuous wood panel (three SVG pieces) in `public/rack/`.
- Electron window icon set for dev and production (`main.js`: `icon: path.join(__dirname, 'build', 'logo.png')`).
- Rack slot preview and rack-attached style updated for user experience (`renderer/src/styles.css`).
- `data.json` workspaces loaded/saved per folder with atomic backups and retry recovery.
- Canvas image rendering hardened to prevent tiles going blank during long drag/pan sessions.
- Tile visuals now enforce shadow-free cards across idle, hover, drag, and canvas-move states.
- Save pipeline hardened against `.tmp` rename races by using unique temp files and per-workspace serialization for canvas/page save/load IPC.

## Features

- Global paste support for URL, text, and image from clipboard
- Auto Open Graph link preview with fallback on failure
- Infinite zoom + pan canvas with tile positioning
- Selection, drag, context menu, and toolbar actions
- Manual creation for checklist, note, table, code snippet, and rack tiles
- Rack tiles with mount/hover/out-of-zone states

## Project Structure

```
AirPaste/
├── build/
│   └── logo.png                    # icon used by Electron
├── dist-renderer/                 # generated production bundle
├── public/                        # static assets (manifest, images)
│   ├── rack/                      # rack pieces (SVG)
│   ├── tilesimg/                  # tile images
│   └── icons/
├── renderer/
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── styles.css
│       ├── components/
│       │   ├── Card.jsx
│       │   ├── CanvasDock.jsx
│       │   ├── DevConsole.jsx
│       │   ├── SplashScreen.jsx
│       │   ├── TileContextMenu.jsx
│       │   ├── ToastStack.jsx
│       │   └── tiles/
│       │       ├── RackTile.jsx
│       │       └── TileShell.jsx
│       ├── context/
│       │   ├── AppContext.js
│       │   ├── AppProvider.jsx
│       │   ├── LogContext.js
│       │   ├── LogProvider.jsx
│       │   ├── ToastContext.js
│       │   └── ToastProvider.jsx
│       ├── hooks/
│       │   ├── useCanvas.js
│       │   ├── useLog.js
│       │   ├── useTheme.js
│       │   └── useToast.js
│       ├── lib/
│       │   └── workspace.js
│       └── utils/
│           └── searchTiles.js
├── main.js
├── preload.js
├── package.json
├── vite.config.mjs
└── README.md
```

## Core Architecture

### Electron main (`main.js`)
- Creates browser window with `icon` and custom title
- Loads `dist-renderer/index.html` in packaged mode, or Vite dev URL in dev
- Handles file operations for `data.json` workspaces
- Manages IPC channels (`airpaste:openFolder`, `airpaste:getLastFolder`, `airpaste:loadWorkspace`, `airpaste:saveWorkspace`, `airpaste:fetchLinkPreview`)
- Restores workspace with backup/temp atomic write logic

### Renderer (`renderer/src`)
- `App.jsx`: Main UI entry, includes custom titlebar integration and canvas HUD
- `useCanvas` for pointer, drag, zoom, pan interaction flow
- `AppProvider` + context providers for workspace state, logs, toasts
- `RackTile` uses 3-part wood asset layout with slot strip + count display
- `SplashScreen` renders until user click after boot restore

### Storage model

Workspace storage and tile schema evolve over time.

For the current tile model, type inventory, and tile lifecycle rules, use:

- [docs/TILE_BOOK.md](docs/TILE_BOOK.md)
- [docs/TESTING_TILES.md](docs/TESTING_TILES.md)
- [docs/README.md](docs/README.md)

## Build and run

- `npm install`
- `npm run dev` (concurrently starts Vite + Electron)
- `npm run check:tiles` (verifies registered tile type IDs are represented in the tile book)
- `npm run build` (renderer bundle)
- `npm run package` (electron-builder output in `release/`)

## Tile Documentation

- Tile source of truth: [docs/TILE_BOOK.md](docs/TILE_BOOK.md)
- Testing Tiles QA rules: [docs/TESTING_TILES.md](docs/TESTING_TILES.md)
- Docs index and trust boundaries: [docs/README.md](docs/README.md)

## Icon setup

Ensure your application icon is in `build/logo.png`. The window and packaged app icon is configured in `main.js`:

```js
new BrowserWindow({
  icon: path.join(__dirname, "build", "logo.png"),
  ...
});
```

If Electron keeps showing its default icon in dev, restart `npm run dev` after closing existing Electron windows.

## Notes

- Rack improvements include style and overlapping edge fix in CSS (`card__rack-slice--left/right`).
- Splash is now in `App.jsx` with `booting || showSplash` and click handler in `SplashScreen`.
- Open Graph scraping uses `open-graph-scraper`, and screenshot fallback uses Electron's own hidden browser window capture.

## Troubleshooting

- Error: `ENOENT ... rename ... airpaste.json.tmp -> airpaste.json`
  - Cause: concurrent saves colliding on the same temp filename.
  - Fix: use unique temp files per write operation and queue canvas/page save/load operations by workspace.
  - Action: restart the app after pulling latest `main.js` and `workspace-service.js`.

- Image tiles load and then disappear after moving around
  - Cause: remount/reload pressure and image-reveal failure paths.
  - Fix: single-path image loading with stable fallback behavior and no image-hiding optimization mode.

---

For detailed contributor notes, inspect the source code in `renderer/src` and `main.js`.
