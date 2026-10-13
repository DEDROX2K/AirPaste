# Rewrite progress: what changed

A running before/after log of the incremental rewrite. See [the rewrite plan](.) for the full phase breakdown — this is the scannable version.

## Phase 0 — Safety net

| Area | Before | After |
|---|---|---|
| Tests | None at all | Vitest, with tests for the JSON Canvas round-trip, atomic-write crash recovery, and schema migration |
| CI | `package` job only (lint + build) | New `test` job that `package` now depends on — a broken test blocks a release build |
| TypeScript | Not set up (`jsconfig.json` only) | Non-strict `tsconfig.json` scaffold (`allowJs`, `checkJs: false`), verified working in both `npm run dev` and `npm run build` |

## Phase 1 — Data-integrity fixes + 2 early UX wins

| Area | Before | After |
|---|---|---|
| Schema version | Two independent, inconsistent constants (`workspace-service.js` had a stale `9`; renderer had `17`) | Single source of truth: `shared/workspace-schema.json`, read natively by both the main process and renderer |
| **Saving a canvas** | `saveCanvas()` never wrote the renderer's current schema version to disk — it preserved whatever was already there, or a hardcoded `version: 9` on the legacy write path. Every file was frozen at its creation-time version forever | Every save now stamps the current schema version. Confirmed via a test that fails against the old code and passes against the fix |
| Migration gap | Versions 13–17 had no migration branches — a workspace stuck below v13 was silently stamped "v17" with no transform applied | Explicit, documented branches for v13–17 (confirmed via git archaeology they were additive-only), plus a dev-time warning if a future bump ever falls short again |
| Error handling | A crash in any tile component blanked the entire window | Error boundaries around the canvas and home views — a crash now shows a fallback, not a white screen |
| Search | `HomeShell.jsx` hardcoded `const searchQuery = ""` — there wasn't even a search input in the UI, so the existing filter logic was unreachable | Real search input wired up, in-memory filtering as a stopgap ahead of the real search-index work |

## Phase 2A — Split `main.js`

| Area | Before | After |
|---|---|---|
| `main.js` size | 3,281 lines, every IPC handler and the entire preview pipeline in one file | 1 line (`require("./main/index")`); logic moved into `main/context.js`, `fsUtils.js`, `workspaceQueue.js`, `windows.js`, and `main/ipc/{dome,workspace,assets,files,linkPreview}.js` |
| Dead code | ~1,300 lines of a fully superseded inline OG-scrape/Amazon/Spotify/YouTube/Twitter preview pipeline, unreachable from any real code path | Removed — confirmed dead via a call-graph reachability check from every IPC handler and app-lifecycle hook, and a repo-wide grep showing nothing called it. The live preview system (`preview/resolve-preview.js` and friends) was already doing this job |
| Shared window state | `mainWindow` was a module-level variable captured by closures across the file | Moved to `main/context.js` as a plain object property, so every module reads the *current* window, not a stale captured value |
| IPC regression coverage | None | New test mocking `electron` via `require.cache` injection, asserting all 44 `ipcMain.handle` + 6 `ipcMain.on` channels are registered exactly once |
| Packaging | — | Fixed `electron-builder`'s `files` list, which would have silently excluded the new `main/` and `shared/` directories from production builds |

## Phase 2B — Tile registry + `normalizeCard` extraction (done)

| Area | Before | After |
|---|---|---|
| Tile registries | Two separate tables: `renderer/src/tiles/tileRegistry.js` (347 lines, rich metadata, **unused by anything**) and `renderer/src/components/tiles/tileRegistry.js` (90 lines, the one `Card.jsx` actually used) | Merged into one canonical file. The dead registry's cached tile sizes had drifted from reality (wrong for Calendar, Deadline, and the whole canvas-text family) — dropped rather than carried forward as "documentation" that was already wrong |
| Tile rendering coverage | No test for `getTileRegistration`, the dispatch every rendered tile goes through | 17-case regression test covering all tile types plus the sticky-note/text-box variant-detection edge cases |
| `normalizeCard` coverage | Zero tests for the ~180-line function every tile's data flows through on every load/save/create/update | Characterization tests across all 12 tile types, plus idempotency and unknown-type handling. Surfaced two pre-existing findings: the Deadline tile's `timezone` field is fully non-functional (flagged separately), and legacy "note"-type cards read content from `body`, not `text` |
| Per-tile data model | All 12 tile types' normalize/create logic lived inline in one 2,539-line `lib/workspace.js` | Extracted into 11 `renderer/src/tiles/<type>/model.js` files (1,041 lines total); `lib/workspace.js` drops to 1,701 lines (-33%), keeping only the orchestration that genuinely needs cross-type awareness (the central `normalizeCard`/`getCardSize` dispatchers, same reasoning as `migrateWorkspace`) |
| Dev-server-only crash | — | Caught live (prod build alone wouldn't have shown it): `RACK_CARD_SIZE` computed itself from imported constants at module top level, and the resulting circular import threw a "before initialization" error under native ESM (Vite dev) even though Rollup's bundled production build silently tolerated it. Fixed by keeping that one computed constant next to the geometry values it derives from |

## Bug fixes (post-Phase 2B)

| Area | Before | After |
|---|---|---|
| **Multi-page data loss** | Creating a second page, editing it, closing and reopening the file silently deleted that page and its contents, permanently — reported as "there has to be a huge reform?" | Root-caused to `json-canvas.js`: the serializer only ever wrote the *active* page into `nodes`/`edges` (the one place JSON Canvas has room for tile data) and had nowhere to put the rest. Fixed by stashing every page in the `airpaste.pages` extension field, always rebuilding the active page fresh from `nodes`/`edges` (never trusting its own stale stash entry), and preserving user-controlled page order (via `reorderCanvasPages`) instead of silently moving the active page to the front. Covered by a dedicated regression suite at both the serialization-unit level (`test/json-canvas.test.js`) and the real-file IPC level (`test/multi-page-persistence.test.js`) |
| **Debounced autosave dropped on close** | Canvas edits autosave on a 420ms debounce with no flush mechanism — closing a tab, switching/removing a dome, or quitting the app within that window silently discarded the edit, with no backup to recover it from | Added `flushAllPendingCanvasSaves()`, now called before every place in-memory workspace state could be torn down: closing the active canvas tab, loading a different folder, clearing workspace state (dome switch/remove), and — the bulk-tab-close functions (`closeOtherTabs`/`closeTabsToRight`), which bypassed the single-tab close hook entirely |
| **Whole-app-quit bypassed the close handshake** | Quitting via Cmd+Q / the app menu's "Quit" fires Electron's `before-quit` *before* any window's own `close` event. The handler there unconditionally allowed an immediate close, so quitting this way skipped the renderer entirely — no flush, no save — even though clicking the window's own close button worked correctly | Both paths now route through one `requestGracefulClose()` in `main/windows.js`: it sends `window:prepare-close`, the renderer flushes pending saves and acknowledges via `window:ready-to-close`, and only then is the window actually allowed to close — bounded by a 4s safety-net timeout so a hung or crashed renderer can never block the app from quitting. Covered by `test/window-close-flush.test.js` (fake-timer unit tests against the real main-process module via `require.cache` injection, the same technique as the Phase 2A IPC test) |

## Still ahead

- Split `AppProvider.jsx` (the ~1,800-line global state context) into narrower contexts
- Split `CanvasWorkspaceView.jsx` (the ~2,900-line canvas orchestrator) — highest-risk piece, scheduled last
- A decision from the project owner on the dead Three.js "globe" canvas view — unlike the Phase 2A dead code, this looks like paused feature work rather than superseded infrastructure, so it's gated behind a flag rather than deleted
- Real search index, formal per-tile schemas (zod), and the UI/UX/performance polish pass — all queued behind the foundation work above
