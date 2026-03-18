# AirPaste

AirPaste is a local-first desktop bookmark and note board built with Electron and React. Open any folder, let AirPaste create a `data.json`, and keep every card, note, and canvas position on your own drive.

## MVP

- Single canvas per folder
- Global paste for URLs and plain text
- Open Graph previews with graceful fallback cards
- JSON storage instead of a database
- Minimal sidebar with folder controls and local card count

## Comprehensive Project Brief

### Application Overview
AirPaste is a desktop application that provides an infinite, zoomable canvas for collecting, organizing, and storing web content. Users can paste URLs, plain text, and images directly onto a canvas. The application automatically fetches Open Graph metadata for URLs, creates visually rich card representations, and stores everything in a single `data.json` file within the selected workspace folder. The app is completely local-first—no cloud storage, no external dependencies beyond metadata scraping.

### Core Features & Functionality

#### Canvas System
- **Infinite Canvas**: Users can pan, zoom, and drag cards across an infinite 2D workspace
- **Viewport Management**: Tracks x, y position and zoom level; automatically persisted to `data.json`
- **Marquee Selection**: Multi-select cards with drag-based selection
- **Drag & Drop**: Reposition cards freely on the canvas
- **Context Menu**: Right-click tiles for actions like delete, duplicate, or copy link
- **Toast Notifications**: User feedback for paste events, errors, and operations

#### Card Types
1. **Link Cards**: Created by pasting URLs
   - Fetch Open Graph data (title, description, image, site name)
   - Display preview image with fallback styling
   - Status tracking: `idle`, `loading`, `ready`, `failed`
   - Graceful degradation if metadata fetch fails
   - Responsive sizing (portrait, landscape, square formats)

2. **Text Cards**: Created by pasting plain text or typing
   - Supports multiline content
   - Automatic headline extraction from first line
   - Keyboard shortcuts for creation (Ctrl+Shift+N or similar)

3. **Note Folder Cards**: Specialized containers for journaling/memo-taking
   - Contains child notes with multiple visual styles
   - Three note variants: `NoteVariantOne`, `NoteVariantTwo`, `NoteVariantThree`
   - Each note can have different styling (quotes, checkboxes, bullet points)
   - Default title: "Daily memo", description: "Notes & Journaling"
   - Separate `data.json` structure for nested notes

#### Image Handling
- **Clipboard Image Pasting**: Users can paste images directly
- **Dynamic Sizing**: Responsive image dimensions based on aspect ratio
- **Music Card Special Case**: Album artwork displays as square with overlay patterns
- **Image Metadata**: Extracts and stores dimensions for proper canvas rendering

#### Text & Note Utilities
- **Markdown-like Parsing**: Strips markdown headers, checkboxes, bullet points
- **Headline Extraction**: Automatically derives card titles from first line
- **Note Search/Filter**: `searchTiles.js` provides filtering by text content
- **Note Variants**: Three distinct visual styles for visual organization

### Data Model

#### Workspace Schema (data.json)
```json
{
  "version": 1,
  "viewport": { "x": 180, "y": 120, "zoom": 1 },
  "cards": [
    {
      "id": "card-uuid",
      "type": "link|text|note-folder",
      "x": 100, "y": 200,
      "width": 340, "height": 280,
      "text": "card text content",
      "url": "https://...",
      "title": "OG title",
      "description": "OG description",
      "image": "image url",
      "siteName": "site name",
      "status": "idle|loading|ready|failed",
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  ]
}
```

#### Note Folder Schema
- Contains nested `notes` array with individual note objects
- Each note has: `id`, `text`, `secondaryText`, `noteStyle`, `quoteAuthor`, `createdAt`, `updatedAt`
- Note styles: `notes-1`, `notes-2`, `notes-3`

### Architecture & Technology Stack

#### Frontend (React + Vite)
- **State Management**: React Context API with custom providers
  - `AppContext`: Main workspace state (cards, viewport, current folder)
  - `LogContext`: Centralized logging system
  - `ToastContext`: Notification queue management
- **Custom Hooks**: Encapsulate canvas logic, logging, and toast management
- **Component Structure**: Functional components with hooks; no class components
- **Styling**: Custom CSS with CSS variables for theming (dark mode with accent colors)

#### Backend (Electron + Node.js)
- **Main Process**: Handles file I/O, IPC communication, and Open Graph scraping
- **IPC Channels**: Secure communication between renderer and main process
- **Open Graph Scraping**: Uses `open-graph-scraper` npm package with Playwright browser instance
- **File Operations**: Atomic writes (temp file + rename) for data integrity
- **Queue System**: Prevents concurrent writes to the same workspace file

#### Build & Packaging
- **Dev Build**: Vite dev server on port 5173 + Electron with hot reload
- **Production Build**: Vite bundles renderer → Electron Builder packages for distribution
- **Target Platform**: Windows (primary with `.exe` installer)

### Component Architecture

#### Core Components
- **App.jsx**: Main entry point, wires up context providers and canvas logic
- **Card.jsx**: Renders individual card UI (links, text, images, notes)
- **DevConsole.jsx**: Development utility for debugging
- **TileContextMenu.jsx**: Right-click popup menu for card actions
- **ToastStack.jsx**: Toast notification display system

#### Note Components (renderer/src/components/notes/)
- **NoteMagnifier.jsx**: Zoom/magnification view for notes
- **NoteSurface.jsx**: Canvas for drawing/annotating notes
- **NoteVariantOne/Two/Three.jsx**: Different visual rendering styles
- **noteInteraction.js**: Event handling for note interactions
- **noteUtils.js**: Utility functions for note manipulation

#### Context Providers
- **AppProvider.jsx**: Wraps app with context, manages workspace state
- **LogProvider.jsx**: Central logging throughout the app
- **ToastProvider.jsx**: Toast notification system

### Styling & Design System

#### Design Language
- **Dark UI**: Base color `#232120` with layered opacity surfaces
- **Color Palette**:
  - **Accent**: Purple (`#b9afff`) for interactive elements
  - **Danger**: Red (`#f87171`) for destructive actions
  - **Success**: Green (`#34d399`) for confirmations
- **Typography**: 
  - Primary: "DM Sans" (sans-serif)
  - Mono: "JetBrains Mono" (code/technical content)
- **Spacing & Radius**: Standardized with CSS variables (`--radius-sm`, `--radius-md`, etc.)

#### Component Styling Patterns
- **Responsive Cards**: Different sizes based on content (portrait: 320×540, landscape: 420×320, square: 340×380)
- **Image Cards**: Aspect-ratio responsive with min/max constraints
- **Music Cards**: Special square format with overlay patterns
- **Hover States**: Elevated backgrounds, border highlights via `var(--border-strong)`
- **Transitions**: Smooth 160ms ease transitions on interactive elements

### Storage & Data Persistence

#### Local-First Architecture
- **Data Location**: `data.json` in user-selected workspace folder
- **Atomic Writes**: Uses temp files (`.tmp` suffix) and backup files (`.bak` suffix) for safety
- **Workspaces**: Each folder maintains its own isolated `data.json`
- **Concurrency**: Queue system prevents race conditions on writes

#### IPC Communication
- **Renderer → Main**: Request Open Graph data, file operations, folder dialogs
- **Main → Renderer**: Send fetched metadata, update workspace, error notifications
- **Preload.js**: Secure bridge exposing only necessary APIs to renderer

### Key Development Concepts

#### Canvas Interactions
- `useCanvas.js` hook manages pan, zoom, drag operations
- Marquee drag detection with 6px threshold
- Viewport normalization ensures consistent state

#### Paste Handling
- Global paste listener detects URLs, plain text, and images
- URL validation with `isUrl()` check
- Image data URL conversion for embedded storage
- Type-specific card creation based on paste content

#### Metadata Fetching
- Open Graph scraper runs in main process (Node.js with Playwright)
- Status tracking allows UI to show loading states
- Fallback card styling when metadata fails
- Rating limiting to prevent hammering servers

#### Search & Filter
- `searchTiles.js` filters cards by text content
- Case-insensitive substring matching
- Supports searching across card titles, descriptions, text content

### Development Workflow

#### Commands
- `npm run dev`: Start Vite + Electron development
- `npm run build`: Bundle renderer with Vite
- `npm run package`: Build + create Windows installer
- `npm run lint`: ESLint code quality checks

#### Configuration Files
- **eslint.config.mjs**: Code style rules (React, hooks, refresh)
- **vite.config.mjs**: Bundler configuration
- **package.json**: Dependencies and build scripts
- **electron-builder** config: Windows installer settings

### Performance Considerations
- **Deferred Rendering**: `useDeferredValue` for async operations
- **Image Dimension Caching**: Prevents redundant image loads
- **Queue-based File I/O**: Prevents blocking operations
- **Lazy Context Subscriptions**: Components only re-render on relevant state changes

---

## Project Structure

```
AirPaste/
├── eslint.config.mjs              # ESLint configuration for code linting
├── main.js                        # Electron main process entry point
├── package.json                   # Project metadata, dependencies, and scripts
├── preload.js                     # Preload script for secure IPC communication
├── README.md                      # This file
├── vite.config.mjs                # Vite build configuration
├── logo.png                       # Application logo
├── screenshot.png                 # Project screenshot
├── dist-renderer/                 # Built renderer assets (generated)
│   ├── index.html
│   └── assets/
│       ├── index-*.js
│       └── index-*.css
├── public/                        # Static assets
│   ├── manifest.json              # Electron app manifest
│   ├── icons/                     # Application icons
│   └── tilesimg/                  # Tile images
├── release/                       # Packaged app outputs (generated)
│   ├── AirPaste Setup 0.1.0.exe.blockmap
│   ├── builder-debug.yml
│   ├── latest.yml
│   └── win-unpacked/              # Unpacked Windows app
│       ├── locales/               # Language packs
│       ├── resources/
│       │   ├── app.asar
│       │   └── app-update.yml
│       └── ... (Electron binaries)
├── scripts/                       # Build and setup scripts
│   └── install-playwright-browser.js
├── renderer/                      # Frontend React application
│   ├── index.html                 # Main HTML template
│   └── src/
│       ├── App.jsx                # Main React app component
│       ├── main.jsx               # React app entry point
│       ├── styles.css             # Global styles
│       ├── components/
│       │   ├── Card.jsx           # Card component for notes/links
│       │   ├── DevConsole.jsx     # Development console component
│       │   ├── TileContextMenu.jsx # Context menu for tiles
│       │   ├── ToastStack.jsx     # Toast notifications component
│       │   └── notes/             # Note-related components
│       │       ├── noteInteraction.js
│       │       ├── NoteMagnifier.jsx
│       │       ├── NoteSurface.jsx
│       │       ├── noteUtils.js
│       │       ├── NoteVariantOne.jsx
│       │       ├── NoteVariantTwo.jsx
│       │       └── NoteVariantThree.jsx
│       ├── context/               # React Context setup
│       │   ├── AppContext.js      # App context definition
│       │   ├── AppProvider.jsx    # App context provider
│       │   ├── LogContext.js      # Logging context definition
│       │   ├── LogProvider.jsx    # Logging context provider
│       │   ├── ToastContext.js    # Toast context definition
│       │   ├── ToastProvider.jsx  # Toast context provider
│       │   └── useAppContext.js   # Custom hook for app context
│       ├── hooks/                 # Custom React hooks
│       │   ├── useCanvas.js       # Canvas interaction hook
│       │   ├── useLog.js          # Logging hook
│       │   └── useToast.js        # Toast notification hook
│       ├── lib/                   # Utility functions
│       │   └── workspace.js       # Workspace-related utilities
│       └── utils/                 # Helper utilities
│           └── searchTiles.js     # Tile search functionality
└── src/                           # Backend/additional source
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
