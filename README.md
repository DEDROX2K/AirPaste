# AirPaste

AirPaste is a local-first desktop bookmark and note board built with Electron and React. Open any folder, let AirPaste create a `data.json`, and keep every card, note, and canvas position on your own drive.

## MVP

- Single canvas per folder
- Global paste for URLs and plain text
- Open Graph previews with graceful fallback cards
- JSON storage instead of a database
- Minimal sidebar with folder controls and local card count

## Project Structure

```
AirPaste/
├── eslint.config.mjs          # ESLint configuration for code linting
├── main.js                    # Electron main process entry point
├── package.json               # Project metadata, dependencies, and scripts
├── preload.js                 # Preload script for secure IPC communication
├── README.md                  # This file
├── vite.config.mjs            # Vite build configuration
├── dist-renderer/             # Built renderer assets (generated)
│   ├── index.html
│   └── assets/
│       ├── index-*.js
│       └── index-*.css
├── public/
│   └── manifest.json          # Electron app manifest
├── release/                   # Packaged app outputs (generated)
│   ├── AirPaste Setup 0.1.0.exe.blockmap
│   ├── builder-debug.yml
│   ├── latest.yml
│   └── win-unpacked/          # Unpacked Windows app
│       ├── locales/
│       ├── resources/
│       └── ... (Electron binaries)
├── renderer/
│   ├── index.html             # Main HTML template for renderer
│   └── src/
│       ├── App.jsx            # Main React app component
│       ├── main.jsx           # React app entry point
│       ├── styles.css         # Global styles
│       ├── components/
│       │   └── Card.jsx       # Card component for notes/links
│       ├── context/
│       │   ├── AppContext.js  # Context definition
│       │   ├── AppProvider.jsx # Context provider
│       │   └── useAppContext.js # Context hook
│       ├── hooks/
│       │   └── useCanvas.js   # Canvas interaction hook
│       └── lib/
│           └── workspace.js   # Utility functions
└── src/                       # Additional source (possibly for docs or other features)
    ├── app/
    │   └── docs/
    │       └── [id]/
    ├── components/
    └── lib/
```

## How It Runs

### Development Mode
1. **Setup**: Run `npm install` to install dependencies (Node.js 22+ required).
2. **Start Dev Server**: `npm run dev` uses `concurrently` to run two processes:
   - `vite --config vite.config.mjs`: Starts the Vite dev server on port 5173, serving the React renderer.
   - `wait-on tcp:5173 && electron .`: Waits for Vite to be ready, then launches Electron with `main.js`.
3. **Electron Main Process** (`main.js`): Creates the desktop window, handles file I/O for `data.json`, manages IPC for previews, and coordinates with the renderer.
4. **Renderer Process** (`renderer/src/`): React app renders the canvas UI, handles user interactions (paste, drag), and communicates with main via IPC.
5. **Hot Reload**: Vite provides hot module replacement for the renderer; Electron reloads on main process changes.

### Production Mode
1. **Build**: `npm run build` uses Vite to bundle the renderer into `dist-renderer/`.
2. **Package**: `npm run package` runs the build, then `electron-builder` packages the app:
   - Includes `dist-renderer/`, `main.js`, `preload.js`, and `package.json`.
   - Outputs to `release/` (e.g., Windows installer `.exe`).
3. **Run**: The packaged app is a standalone Electron executable that runs the main process and serves the built renderer.

### App Flow
- User opens AirPaste → Electron window loads `renderer/index.html`.
- React app initializes via `main.jsx` → `App.jsx` renders the canvas.
- User selects a folder → App loads/saves `data.json` in that folder.
- Pasting URLs/text → Renderer detects paste → IPC to main → Fetches Open Graph data → Updates card in UI.
- Canvas interactions (zoom, pan, drag) → Handled by `useCanvas` hook → Updates viewport in context → Saves to `data.json`.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

## Packaging

```bash
npm run package
```

This builds the Vite renderer and packages the Electron app with `electron-builder`.
