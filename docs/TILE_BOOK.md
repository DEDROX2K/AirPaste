# AirPaste Tile Book

## Purpose

This file is the source of truth for AirPaste tile types.

It tracks:

- implemented tiles
- implemented tile variants
- runtime placeholder tiles already present in the registry
- planned tiles that have not been implemented yet

When tile behavior changes, this book must change with it.

## Tile Development Rule

Whenever a tile type is created, edited, renamed, deleted, or significantly changed, update:
- `docs/TILE_BOOK.md`
- `docs/TESTING_TILES.md` if Testing Tiles behavior changes
- `renderer/src/lib/testingTiles.js` if seeded QA examples need to change

A tile feature is not complete until:
- it is represented in Testing Tiles
- it is documented in `TILE_BOOK.md`
- `npm run check:tiles` passes
- `npm run lint` passes
- `npm run build` passes

## Tile Inventory

| Status | Category | Tile name | Type ID | Purpose | Main component | Data model location | Add menu | Testing Tiles coverage | Diagnostics | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Implemented | Files & Navigation | File Tile | `file` | Local file reference with an open action. | `renderer/src/components/tiles/FileTile.jsx` | `renderer/src/lib/workspace.js` | No direct Add menu entry. | No seeded examples yet | No dedicated diagnostics. | Created from file import flows. |
| Implemented | Link & Media | Link Tile | `link` | Bookmark, preview, and media reference tile for web links. | `renderer/src/components/tiles/LinkTile.jsx` | `renderer/src/lib/workspace.js` | No direct Add menu entry. Usually created from paste/import. | Yes | Dedicated preview diagnostics and Codex copy report in DEV/testing flows. | Stable core tile type. |
| Implemented | Link & Media | Image Tile | `link` | Imported image tile rendered through the link tile system. | `renderer/src/components/tiles/LinkTile.jsx` | `renderer/src/lib/workspace.js` | No direct Add menu entry. Created through import/paste flows. | No seeded examples yet | No dedicated image-only copy report. Uses clean serializable link payload. | Implemented as `type: "link"` plus `contentKind: "image"`, not as a separate type id. |
| Implemented | Commerce | Product Tile | `amazon-product` | Product tile for shop links: Amazon, eBay and any page with product data. | `renderer/src/components/tiles/AmazonProductTile.jsx` | `renderer/src/lib/workspace.js` | No | No seeded examples yet | No dedicated copy report documented. | Specialized link-like tile. |
| Implemented | Organisation | Merged Tiles | `merge-note` | Frame + short note around tiles dropped on each other. | `renderer/src/components/tiles/MergeNoteTile.jsx` | `renderer/src/tiles/merge/model.js` | No | No seeded examples yet | No dedicated copy report documented. | Created by dropping a tile on another; not added directly. |
| Implemented | Link & Media | X Profile Tile | `x-profile` | X/Twitter profile as an ID badge hanging from a clip. | `renderer/src/components/tiles/XProfileTile.jsx` | `renderer/src/tiles/x/model.js` | No. Created by pasting an x.com/<handle> link. | No seeded examples yet | Link preview diagnostics. | Data from `preview/resolvers/x.js`; images stored in the card. |
| Implemented | Link & Media | X Post Tile | `x-post` | X/Twitter post card held by a pin: text, media (1-4 images or inline video), link card, quoted post, counts. | `renderer/src/components/tiles/XPostTile.jsx` | `renderer/src/tiles/x/model.js` | No. Created by pasting an x.com/<handle>/status/<id> link. | No seeded examples yet | Link preview diagnostics. | Data from `preview/resolvers/x.js`; images stored in the card, video streamed. |
| Implemented | Planning | Calendar Tile | `calendar` | Canvas calendar for planning dates and events. | `renderer/src/components/tiles/CalendarTile.jsx` | `renderer/src/lib/workspace.js` | Yes | No seeded examples yet | No dedicated diagnostics. | Stable manual tile. |
| Implemented | Structure & Planning | Checklist Tile | `checklist` | Simple checklist with editable items and completion state. | `renderer/src/components/tiles/ChecklistTile.jsx` | `renderer/src/lib/workspace.js` | Yes | No seeded examples yet | No dedicated diagnostics/copy report yet. State is serializable. | Stable manual tile. |
| Deprecated | Notes & Writing | Note / Markdown Tile | `note` | Legacy alias kept so previously saved Markdown notes still render; no longer creatable. | `renderer/src/components/tiles/CanvasTextTile.jsx` | `renderer/src/lib/workspace.js` | No (removed) | None | No dedicated diagnostics/copy report. State is serializable. | Replaced by the Paper Note tile; file-backed vault notes are unaffected. |
| Implemented | Notes & Writing | Canvas Text | `canvas-text` | Lightweight visible canvas label for headings, callouts, and annotations. | `renderer/src/components/tiles/TextBoxTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | Dedicated DEV/testing diagnostics and Codex copy report. | Plain-text annotations use one fixed visual style; legacy `text-box` data is migrated here. |
| Implemented | Structured Data | Database / Table Tile | `table` | Lightweight grid tile for small structured datasets. | `renderer/src/components/tiles/TableTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | No dedicated diagnostics/copy report yet. State is serializable. | Tracker-style table, not a spreadsheet. |
| Implemented | Development | Code Tile | `code` | Code file with language detection, CodeMirror editing and an adjustable height. | `renderer/src/components/tiles/CodeTile.jsx` | `renderer/src/lib/workspace.js` | No | No | Dedicated code diagnostics and Codex copy report in DEV/testing flows. | Legacy hidden tile kept for workspace compatibility. |
| Implemented | Tracking & Productivity | Counter Tile | `counter` | Large plus/minus counter for lightweight tracking. | `renderer/src/components/tiles/CounterTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | Dedicated counter diagnostics and Codex copy report in DEV/testing flows. | Stable manual tile. |
| Implemented | Tracking & Productivity | Deadline Countdown Tile | `deadline` | Live countdown to a deadline or launch. | `renderer/src/components/tiles/DeadlineTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | Dedicated deadline diagnostics and Codex copy report in DEV/testing flows. | Rewritten with a cleaner dashboard-style layout. |
| Implemented | Tracking & Productivity | Progress Bar Tile | `progress` | Progress indicator, optionally linked to checklist completion. | `renderer/src/components/tiles/ProgressTile.jsx` | `renderer/src/lib/workspace.js` | No | No | Dedicated progress diagnostics and Codex copy report in DEV/testing flows. | Legacy hidden tile kept for workspace compatibility. |
| Implemented | Layout & Containment | Rack Tile | `rack` | Shelf that holds tiles in captioned frames, with spring drag on/off. | `renderer/src/components/tiles/RackTile.jsx` | `renderer/src/lib/workspace.js` | Yes | No seeded examples yet | No dedicated diagnostics/copy report yet. State is serializable. | Stable container tile. |
| Implemented | Notes & Writing | Paper Note Tile | `paper-note` | Vertical notebook-paper note with an immersive fullscreen write mode, Obsidian-style live preview (lists, tasks, code, highlight), slash menu and selection toolbar. | `renderer/src/components/tiles/PaperNoteTile.jsx` | `renderer/src/lib/workspace.js`, `renderer/src/tiles/paperNote/model.js` | Yes | Yes | No dedicated diagnostics/copy report yet. State is serializable. | Canvas preview is read-only and renders the same markdown tree as the editor; all editing happens in the fullscreen overlay. Extra stacked pages are a decorative pagination cue, not separate tiles. |
| Planned | Structure & Systems | Node Group Tile | `node-group` | Future grouping/system wrapper for related tiles. | Placeholder in `renderer/src/tiles/tileRegistry.js` | Not normalized in active workspace model yet | No | No | None | Registry placeholder only. |
| Planned | Interactive | Game Tile | `game` | Future embedded interactive/game surface. | Placeholder in `renderer/src/tiles/tileRegistry.js` | Not normalized in active workspace model yet | No | No | None | Registry placeholder only. |
| Planned | 3D & Media | 3D Model Tile | `3d-model` | Future 3D viewport/content tile. | Placeholder in `renderer/src/tiles/tileRegistry.js` | Not normalized in active workspace model yet | No | No | None | Registry placeholder only. |
| Planned | Simulation | Physics Item Tile | `physics-item` | Future physics-aware item tile. | Placeholder in `renderer/src/tiles/tileRegistry.js` | Not normalized in active workspace model yet | No | No | None | Registry placeholder only. |
| Planned | Tracking & Productivity | Pomodoro / Stopwatch Tile | `pomodoro` | Sprint timer for focus sessions. | Placeholder only | Placeholder only | No | No | None | Planned productivity tile. |
| Planned | Tracking & Productivity | Habit Tracker Tile | `habit` | Daily habit completion grid. | Placeholder only | Placeholder only | No | No | None | Planned productivity tile. |

## Implemented Tiles

## Link Tile

- Type ID: `link`
- Category: Link & Media
- Status: Implemented
- Purpose: Store and render bookmark-style links, rich previews, video/music previews, and fallback states.
- User-facing UX:
  - Usually created by paste/import, not from the Add menu
  - Shows preview image, metadata, and link actions
  - Failed preview (no image/video): framed "Preview failed" art (`FailedLinkPreview.jsx`) with the full URL (hover slides the rest into view, click opens it) and a short reason derived from `previewError`/`previewDiagnostics` (`tiles/link/failedPreview.js`). Retry is the right-click "Refresh preview"; no button on the tile
  - Supports copy-link action
- Data model:
```js
{
  type: "link",
  url: "",
  contentKind: "bookmark",
  title: "",
  siteName: "",
  description: "",
  image: "",
  favicon: "",
  status: "loading",
  previewDiagnostics: null
}
```
- Main files:
  - `renderer/src/components/tiles/LinkTile.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasWorkspaceView.jsx`
  - `renderer/src/lib/testingTiles.js`
- Add menu behavior: No direct Add menu entry. Primary creation path is paste/import.
- Testing Tiles examples:
  - `YouTube / video`
  - `social links`
  - `docs/productivity`
  - `articles/blogs`
  - `ecommerce`
  - `cookie-banner sites`
  - `login-wall sites`
  - `iframe-blocked sites`
  - `broken/redirect/edge cases`
- Diagnostics / copy report behavior:
  - Dedicated DEV/testing copy diagnostics exist for bookmark previews.
  - Dedicated Codex report exists for bookmark previews.
  - Visual QA badges appear in Testing Tiles for preview outcomes.
- Known limitations:
  - Add menu creation is indirect.
  - Preview quality depends on remote metadata and embed policy.
- Future improvements:
  - Stronger seeded edge cases for more preview classes.
  - Better doc coverage for non-bookmark media submodes.

## Image Tile

- Type ID: `link`
- Category: Link & Media
- Status: Implemented
- Purpose: Store imported/pasted images inside the same tile system as links.
- User-facing UX:
  - Created through image import/paste flows
  - Renders as an image-first tile with no bookmark action strip
  - Keeps image asset metadata in the tile payload
- Data model:
```js
{
  type: "link",
  contentKind: "image",
  title: "",
  image: "",
  asset: {
    relativePath: "",
    fileName: "",
    mimeType: ""
  },
  status: "ready"
}
```
- Main files:
  - `renderer/src/components/tiles/LinkTile.jsx`
  - `renderer/src/components/tiles/TileImageReveal.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/systems/commands/useCanvasCommands.js`
- Add menu behavior: No direct Add menu entry. Created by paste/import.
- Testing Tiles examples:
  - None seeded yet. This is a current QA gap.
- Diagnostics / copy report behavior:
  - No image-specific copy report today.
  - Payload is normalized and serializable through the workspace layer.
- Known limitations:
  - Not a separate type id, so image-specific behavior shares the link tile runtime.
  - No dedicated Testing Tiles row yet.
- Future improvements:
  - Add seeded image examples to Testing Tiles.
  - Consider whether image deserves its own tile type in the future.

## Merged Tiles (`merge-note`)

- Type ID: `merge-note`
- Status: Implemented (2026-11-23)
- Purpose: Drop one tile on another and they snap into a group: side by side in rows (random order, up to 3 a row, fuller rows at the bottom, centred), wrapped in one yellow frame with a short note in a tab under the bottom row.
- User-facing UX:
  - Drag a single tile over another: the target gets the green merge ring; drop to merge. Dropping on a grouped tile (or its frame) adds to that group. A rack under the pointer wins (docks instead).
  - Grabbing any tile in a group, or its yellow frame, drags the whole group.
  - The note: click it once the frame is selected, or double-click it, to write (shared note editor). The tab grows with the text.
  - Right-click a grouped tile or the frame > Unmerge: the frame goes, the tiles stay where they are.
  - The group re-arranges itself when a tile in it resizes or is deleted; one left alone leaves the group.
- Data model:
```js
// each member tile
{ mergeId: "merge-..." }
// the frame card, drawn just below its members
{
  type: "merge-note",
  memberIds: [],     // shuffled order
  body: "",          // note markdown
  noteHeight: null,  // tab height, measured by the tile
  mergeShape: { path: "", note: { x, y, width, height } } // rebuilt by settleMergeGroups
}
```
- Main files: `renderer/src/tiles/merge/model.js` (layout, outline, merge / unmerge, `settleMergeGroups` run from `normalizeWorkspace`), `renderer/src/components/tiles/MergeNoteTile.jsx` / `.css`, drag hooks in `systems/interactions/useCanvasInteractionSystem.js`.
- Tests: `test/merge-tiles.test.js`
- Known limitations: only loose canvas tiles merge (not racks, tiles in racks, or stacked piles); dragging a whole group onto another tile doesn't merge groups.

## Product Tile (`amazon-product`)

- Type ID: `amazon-product` (kept so saved tiles still load; shown as "Product")
- Category: Commerce
- Status: Implemented (redesigned 2026-11-20 from the "Online Product Tile v1" prototype)
- Purpose: Any online-shop product link: Amazon, eBay, and any page with structured product data.
- Where products come from (all map to this tile via `preview/card-mapper.js`):
  - Amazon: `preview/resolvers/amazon.js` (unchanged)
  - eBay item links (`ebay.<tld>/itm/<id>`): `preview/resolvers/ebay.js`. eBay 403s plain fetches with a bot check, so the item is read in an offscreen browser (`fetchRenderedPageHtml` in `preview/resolvers/generic.js`, its own in-memory session cleared per load, real Chrome UA)
  - Any other shop: the generic resolver turns a page with JSON-LD `Product`, `og:type=product` or `product:price:*` tags into a product (`preview/product.js`)
- User-facing UX:
  - One fixed shape, drawn at 470 x 625 and scaled to the tile's width (340 wide = 452 tall; `normalizeCard` keeps the proportions)
  - Name in the top lobe: centred, or faded at the right edge and rolled left on hover when long
  - Product photo cropped to fill the window; red `#FD5B60` when there's none
  - Price in the bottom tab, shown number-then-symbol (`69.99£`, `PRODUCT_PRICE_FORMAT` in `tiles/link/product.js`), shrunk to fit; "No price" in grey
  - Shop pill from the domain (`Ebay.co.uk`)
  - Nothing inside is a control: the whole tile drags; double-click or right-click > Open opens the product
  - Hover / selection ring follows the shape
  - Everything shows at every zoom level (no compact LOD hiding)
- Data model (no new fields; rating / review count are kept but not shown):
```js
{
  type: "amazon-product",
  url: "",
  title: "",
  image: "",
  productAsin: "",
  productPrice: "",   // as scraped: "£69.99"
  productDomain: "",  // "ebay.co.uk"
  productRating: null,
  productReviewCount: null
}
```
- Main files:
  - `renderer/src/components/tiles/AmazonProductTile.jsx` / `.css`
  - `renderer/src/tiles/link/product.js` (price / shop text), `renderer/src/tiles/link/model.js` (size)
  - `preview/product.js`, `preview/resolvers/ebay.js`, `preview/resolvers/amazon.js`
- Add menu behavior: No direct Add menu entry; paste a product link (bare addresses like `amazon.co.uk/dp/...` paste as links too).
- Tests: `test/product-links.test.js`
- Known limitations:
  - Fonts: name and shop pill use Obel Mono (bundled); the price uses Geist bold in place of the design's IBM Plex Sans.
  - Old `.card__amazon-product-*` CSS rules in styles.css / MonochromeUi.css / TilePolish.css are now unused.

## X Profile Tile / X Post Tile

- Type IDs: `x-profile`, `x-post`
- Category: Link & Media
- Status: Implemented
- Purpose: Paste an X (Twitter) profile or post link and get a native-looking X card instead of a screenshot.
- User-facing UX:
  - Profile: banner, avatar, name + verified rosette (blue / gold / grey), handle, bio, location / website / joined, following + followers. Hangs from a clip.
  - Post: author row, text with coloured @mentions / #tags / links, 1-4 image grid or an inline video (no play button; click plays/pauses, never autoplays). Photos and video are part of the drag surface: grab them to move the tile; double-click a photo to open it on X, link card (only when no media), quoted post, timestamp, likes + replies. Held by a pin. Hover is the default tile hover (shadow, no movement). Both are the standard 340px link-tile width. Selecting one (single tile) shows the standard Open / Copy quick-action bar.
  - Every pill, link, image, card and quote opens externally via the app's open-link handler; double-click opens the profile/post.
  - Counts under 10,000 show in full (8,242), above compact like X (12.5K, 3.4M).
  - A pasted X link shows the link tile's loading gif and only becomes the X tile once its data and images have loaded.
  - First fetch fails: the card becomes the link tile's failed-preview state. A failed refresh keeps the last good data.
- Data model (one prefixed object per tile, `normalizeXProfile` / `normalizeXPost`):
```js
{ type: "x-profile", url, xProfile: { name, handle, bio, location, website, websiteUrl, joined: "YYYY-MM",
  following, followers, verified: "blue"|"business"|"government"|"none", avatarAsset, bannerAsset, fetchedAt } }
{ type: "x-post", url, xPost: { id, url, author: { name, handle, verified, avatarAsset }, text,
  entities: [{ type, start, end, href }] | null, createdAt, likes, replies,
  media: [{ kind: "photo"|"video"|"gif", asset, videoUrl, width, height, durationMs }],
  linkCard: { url, domain, title, imageAsset } | null,
  quoted: { id, url, author: { name, handle }, createdAt, text } | null, fetchedAt } }
```
- Data source (`preview/resolvers/x.js`, main process, unofficial keyless endpoints isolated in that one file):
  - Profile: `api.fxtwitter.com/<handle>` (retried: it intermittently answers 404 for real accounts).
  - Post: `cdn.syndication.twimg.com/tweet-result` then `api.fxtwitter.com/<handle>/status/<id>`.
  - Avatar / banner / photos / posters / link image are downloaded into the card as data URLs; video is streamed from video.twimg.com.
- Main files:
  - `renderer/src/components/tiles/XProfileTile.jsx`, `XPostTile.jsx`, `XTileParts.jsx`, `XTileParts.css`
  - `renderer/src/tiles/x/model.js`
  - `preview/resolvers/x.js`, `preview/card-mapper.js`
- Known limitations:
  - Depends on unofficial endpoints; a payload change is a one-file fix in the resolver.
  - Video playback needs a connection.
  - Compact LOD only pauses video; content stays the same so the measured height does not jump while zooming.

## Checklist Tile

- Type ID: `checklist`
- Category: Structure & Planning
- Status: Implemented
- Purpose: Lightweight checklist for task sequencing and completion tracking.
- User-facing UX:
  - Editable title
  - Check/uncheck items
  - `Enter` adds the next item
  - `Backspace` on an empty item removes it
  - Explicit `Add item` action
- Data model:
```js
{
  type: "checklist",
  title: "Checklist",
  items: [
    { id: "item-1", text: "", checked: false }
  ]
}
```
- Main files:
  - `renderer/src/components/tiles/ChecklistTile.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
- Add menu behavior:
  - Yes
  - Label: `Checklist`
- Testing Tiles examples:
  - None seeded yet. This is a current QA gap.
- Diagnostics / copy report behavior:
  - No dedicated copy diagnostics/report flow today.
  - Persisted state is simple and serializable.
- Known limitations:
  - No seeded Testing Tiles row yet.
  - No dedicated diagnostics export yet.
- Future improvements:
  - Add seeded normal, empty, and completed examples.
  - Consider optional progress summary linkage.

## Note / Markdown Tile

- Type ID: `note`
- Category: Notes & Writing
- Status: Deprecated -- creation removed, replaced by the Paper Note tile
- Purpose (historical): Scratchpad tile for Markdown notes, documentation, and future-me instructions.
- Current behavior: `note` is kept only as a legacy type-id alias in `getCardType()` (`renderer/src/lib/workspace.js`) so canvases saved before this change still load and render correctly, rendered through `CanvasTextTile`. There is no longer any UI path (Add menu, dock, or right-click canvas menu) that creates a new blank local Markdown note -- use the Paper Note tile instead.
- Not removed: file-backed "vault notes" (`Add note from vault`, `addNoteFromVault`) are a separate feature built on the same `canvas-text`/markdown rendering and remain fully supported; only the blank/local creation flow was removed.
- Main files (legacy load-bearing only):
  - `renderer/src/components/tiles/CanvasTextTile.jsx`
  - `renderer/src/lib/workspace.js`
- Testing Tiles examples:
  - None -- QA seeds for this flow were removed along with the creation command.
- Known limitations:
  - None of this tile's own; see Paper Note Tile for the actively developed replacement.

## Canvas Text

- Type ID: `canvas-text`
- Category: Notes & Writing
- Status: Implemented
- Purpose: Lightweight Figma-like text object for headings, labels, captions, callouts, annotations, and diagram text directly on the canvas.
- Important distinction: this is not the same as the Paper Note Tile.
- `canvas-text` with `format: "markdown"` also still backs file-synced "vault notes" (`addNoteFromVault`); blank/local Markdown note creation itself was removed in favor of Paper Note.
- `canvas-text` with `format: "plain"` is for visible canvas typography.
- Legacy `text-box` cards are normalized into this format for compatibility.
- `placeholder` is optional and reserved for lightweight seeded/demo flows when a box should render starter copy before editing.
- User-facing UX:
  - Single click selects like a normal tile
  - Single click in Text tool selects and enters edit mode
  - Double click enters edit mode
  - `Enter` while selected enters edit mode
  - Typing a printable key while selected enters edit mode and replaces the current text with that typed character
  - Right-click blank canvas space, then choose `Add text` to create and immediately edit a label at that point
  - `Select`, `Hand`, and `Text` are explicit canvas tools
  - Holding `Space` temporarily switches the canvas into Hand mode until the key is released
  - The `Text` canvas tool creates a new label at the click point and enters editing immediately
  - The `Hand` canvas tool pans without trying to select or drag tiles
  - Uses a textarea in edit mode
  - Blur or click outside saves and exits edit mode
  - `Escape` exits edit mode
  - Preserves multiline text and pasted line breaks
  - Selected corner handles change wrapping width; height follows the text
  - All plain text labels use one shared font and size
- Data model:
```js
{
  type: "canvas-text",
  format: "plain",
  text: "",
  autoWidth: true
}
```
- Main files:
  - `renderer/src/components/tiles/TextBoxTile.jsx`
  - `renderer/src/lib/textBoxStyle.js`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasWorkspaceView.jsx`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
  - `renderer/src/lib/testingTiles.js`
- Add menu behavior:
  - Yes
  - Label: `Text`
- Testing Tiles examples:
  - `Text / Typography`
  - Includes simple labels and multiline/narrow-wrap coverage
- Diagnostics / copy report behavior:
  - Dedicated DEV/testing diagnostics export exists
  - Dedicated DEV/testing Codex report exists
  - Diagnostics include type, text length, line count, and size
- Known limitations:
  - Intentionally no font, size, color, or rich-text controls
  - Uses textarea editing instead of a rich-text editor
  - Resize is width-first; height is derived from wrapped content instead of being independently authored
- Future improvements:
  - Smarter auto-sizing if the canvas gets a shared resize system later

## Database / Table Tile

- Type ID: `table`
- Category: Structured Data
- Status: Implemented
- Purpose: Lightweight structured tracker for rows, columns, and small datasets.
- User-facing UX:
  - Editable title
  - Editable column names
  - Column kind selector
  - Editable cells
  - Add/delete row
  - Add/delete column
  - `Enter` moves down
  - TSV paste can expand across rows and columns
- Data model:
```js
{
  type: "table",
  title: "Untitled table",
  columns: [
    { id: "col_name", name: "Name", kind: "text" }
  ],
  rows: [
    { id: "row_1", cells: { col_name: "" } }
  ]
}
```
- Main files:
  - `renderer/src/components/tiles/TableTile.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
- Add menu behavior:
  - Yes
  - Label: `Table`
- Testing Tiles examples:
  - `Expenses`
  - `Asset list`
  - `Leads / CRM`
  - `Checkbox tracker`
- Diagnostics / copy report behavior:
  - No dedicated diagnostics/report flow yet.
  - State is normalized and serializable.
- Known limitations:
  - Not a spreadsheet.
  - No formulas, sorting, or filtering.
- Future improvements:
  - Add table-specific diagnostics.
  - Add more seeded empty and stress examples.

## Code Tile

- Type ID: `code`
- Category: Development
- Status: Implemented (reworked 2026-11-26 from "AirPaste — Code Tile v2")
- Purpose: A code file on the canvas: paste or type code, the tile works out the language.
- User-facing UX:
  - Black header with an editable title (Obel Mono) and a lime FILE TYPE badge
  - The badge shows the detected language (pops when it changes); click it for a list of every language plus Auto. A picked language shows a ● marker.
  - Grey paper on a blue frame holds the code. At rest it shows a static highlighted copy; pressing it mounts CodeMirror 6 (lazy) with the caret where you pressed.
  - Selection draws one band per selected line (no block fill); the caret line gets a faint band while editing
  - Tools on the paper (top right): copy, smaller text, bigger text
  - Lime bar on the bottom edge (on hover): drag to set the height, double-click or Enter to go back to auto, arrow keys ±20 px
  - Auto height grows with the code (160–440 px of paper), then the paper scrolls
  - Tab inserts two spaces, Escape leaves the editor
- Data model:
```js
{
  type: "code",
  title: "Untitled",
  language: "auto",      // or a key from CODE_LANGUAGES (js, ts, py, rust, ...)
  code: "",
  codeFontSize: 14,      // one of 10 11 12 13 14 16 18 20 24
  codeHeight: null,      // null = auto, else paper height 120–1600
  wrap: false,           // kept from the old tile, unused
  showLineNumbers: false // kept from the old tile, unused
}
```
  - Old language names (javascript, typescript, python, markdown, plain, regex) are mapped on load.
  - `card.height` follows the paper: 108.5 + paper + 19.
- Main files:
  - `renderer/src/components/tiles/CodeTile.jsx` + `CodeTile.css`
  - `renderer/src/tiles/code/CodeEditor.jsx` (CodeMirror view, highlight style, line bands)
  - `renderer/src/tiles/code/codeLanguages.js` (lazy language packs)
  - `renderer/src/tiles/code/detectLanguage.js` (weighted regex detection)
  - `renderer/src/tiles/code/staticHighlight.js` (static copy / compact renders)
  - `renderer/src/tiles/code/model.js`
- Add menu behavior:
  - None (the Add menu's "Code file" is the sticky code-file design, a different tile)
- Compact / rack renders: static copy of the first 30 lines; tools and bar hidden.
- Tests: `test/code-tile.test.js`, `test/normalize-card.test.js`
- Known limitations:
  - Width isn't resizable from the tile itself.
  - Detection is heuristic; short snippets may read as TEXT until there is more code.

## Counter Tile

- Type ID: `counter`
- Category: Tracking & Productivity
- Status: Implemented
- Purpose: Lightweight plus/minus counter for bugs found, coffees, outreach, tests passed, and other running counts.
- User-facing UX:
  - Editable title
  - Large visible number
  - Editable unit label
  - `+` increments by the current step
  - `-` decrements by the current step
  - `Reset` returns the value to `0`
  - Editable step input
- Data model:
```js
{
  type: "counter",
  title: "Counter",
  value: 0,
  step: 1,
  unit: ""
}
```
- Main files:
  - `renderer/src/components/tiles/CounterTile.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
  - `renderer/src/components/CanvasWorkspaceView.jsx`
  - `renderer/src/lib/testingTiles.js`
- Add menu behavior:
  - Yes
  - Label: `Counter`
- Testing Tiles examples:
  - `Bugs Found`
  - `Cups of Coffee`
  - `Outreach Messages`
  - `Tests Passed`
- Diagnostics / copy report behavior:
  - Dedicated DEV/testing diagnostics export exists.
  - Dedicated DEV/testing Codex report exists.
  - Diagnostics include type, title, value, step, and unit.
- Known limitations:
  - No seeded empty-state or extreme-step QA example yet.
  - No time-series/history support in V1.
- Future improvements:
  - Add empty, negative, and high-step QA examples.
  - Consider optional goal/target linkage for productivity dashboards.

## Deadline Countdown Tile

- Type ID: `deadline`
- Category: Tracking & Productivity
- Status: Implemented
- Purpose: Live countdown tile for launches, handoffs, deadlines, and date-based urgency tracking.
- User-facing UX:
  - Editable title
  - Editable target date/time
  - Optional seconds toggle
  - Live countdown display
  - Overdue styling after the deadline passes
  - Never enters a loading state
- Data model:
```js
{
  type: "deadline",
  title: "Launch countdown",
  targetAt: "",
  timezone: "local",
  showSeconds: false
}
```
- Main files:
  - `renderer/src/components/tiles/DeadlineTile.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
  - `renderer/src/components/CanvasWorkspaceView.jsx`
  - `renderer/src/lib/testingTiles.js`
- Add menu behavior:
  - Yes
  - Label: `Deadline Countdown`
- Testing Tiles examples:
  - `Launch countdown`
  - `Client handoff`
  - `Campaign deadline`
  - `Unset deadline`
- Diagnostics / copy report behavior:
  - Dedicated DEV/testing diagnostics export exists.
  - Dedicated DEV/testing Codex report exists.
  - Diagnostics include type, title, target date, timezone, and seconds mode.
- Known limitations:
  - Timezone is currently fixed to local.
  - No relative reminder/notification behavior in V1.
- Future improvements:
  - Add explicit timezone selection.
  - Add urgency thresholds and optional linked milestone metadata.

## Progress Bar Tile

- Type ID: `progress`
- Category: Tracking & Productivity
- Status: Implemented
- Purpose: Visual progress indicator for manual tracking or checklist-linked completion.
- User-facing UX:
  - Editable title
  - Manual or linked mode
  - Editable value and max in manual mode
  - Checklist selector in linked mode
  - Large percent display and clear progress bar
  - Never enters a loading state
- Data model:
```js
{
  type: "progress",
  title: "Feature progress",
  mode: "manual",
  value: 0,
  max: 100,
  linkedTileId: null
}
```
- Main files:
  - `renderer/src/components/tiles/ProgressTile.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
  - `renderer/src/components/CanvasWorkspaceView.jsx`
  - `renderer/src/lib/testingTiles.js`
- Add menu behavior:
  - No
  - Hidden from current creation surfaces and retained for older boards only
- Testing Tiles examples:
  - None seeded in the current QA board
- Diagnostics / copy report behavior:
  - Dedicated DEV/testing diagnostics export exists.
  - Dedicated DEV/testing Codex report exists.
  - Diagnostics include type, title, mode, value, max, and linked tile id.
- Known limitations:
  - Linked mode only supports checklist tiles in the current canvas.
  - No inverse/segmented progress modes in V1.
  - Hidden from current creation surfaces.
- Future improvements:
  - Add seeded linked-checklist examples once checklist QA coverage exists.
  - Consider optional target labels, milestones, and color thresholds.

## Rack Tile

- Type ID: `rack`
- Category: Layout & Containment
- Status: Implemented
- Purpose: A shelf that holds tiles. Tiles stand on it side by side in dark frames, captioned with their source.
- User-facing UX:
  - Manual creation from Add menu
  - Drag (or throw) a tile onto the shelf; neighbours open a gap where it will go
  - Pull a racked tile up to take it off (it rubber-bands, then tears off); slide it along the shelf to reorder
  - Enter / Space / R on a focused racked tile takes it off
  - Five tiles a shelf; a full shelf refuses and passes the tile to a new shelf below (posts join them)
  - Right-click: Rack style (5 materials, 3 frames)
  - The name is pressed into the shelf's front lip; click it to rename
  - Design and animation rules: `docs/rules/rack-rules.md`
- Data model:
```js
{
  type: "rack",
  title: "Rack",
  description: "Mounted display rack",
  tileIds: [],      // order on the shelf
  slotWidths: [],   // frame width of each tile, derived from its size
  tiers: [],        // tiles per shelf (max 5 each), in order
  material: "steel",   // steel | oak | walnut | acrylic | concrete
  frameStyle: "dark",  // dark | mat | polaroid
  minSlots: 3,      // legacy, unused by layout
  plasticColor: 0   // legacy, kept but no longer drawn
}
```
- Main files:
  - `renderer/src/components/tiles/RackTile.jsx`
  - `renderer/src/tiles/rack/geometry.js`
  - `renderer/src/tiles/rack/layout.js`
  - `renderer/src/tiles/rack/rackMotion.js`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
- Add menu behavior:
  - Yes
  - Label: `Rack`
- Testing Tiles examples:
  - None seeded yet. This is a current QA gap.
- Diagnostics / copy report behavior:
  - No dedicated diagnostics/report flow yet.
  - State is normalized and serializable.
- Known limitations:
  - No Testing Tiles row yet.
  - No dedicated diagnostics flow yet.
- Future improvements:
  - Add QA seeds for empty, partially filled, and full rack states.
  - Add rack-specific diagnostics if slot bugs become common.

## Paper Note Tile

- Type ID: `paper-note`
- Category: Notes & Writing
- Status: Implemented
- Purpose: A note that looks and behaves like a sheet of notebook paper, with a dedicated immersive write mode for longer-form notes.
- User-facing UX:
  - Canvas state shows a single read-only paper page with the note's actual title, subtitle, and body text (no placeholder chrome)
  - As the body grows past roughly one page's worth of text, one or two more pages visually peek out, stacked imperfectly behind the front page
  - Dragging the note drags the whole stack together; the back pages lag slightly behind the front page while moving, then settle, like a loose stack of paper being dragged
  - Double-click expands the note into an exclusive fullscreen write mode: the page itself grows from its on-canvas position/size up to fill the screen (not a fade/cross-dissolve to a new screen)
  - Fullscreen write mode has a back button (top-left), the note's date/time centred above an editable title and subtitle (Enter moves title -> subtitle -> body), and an infinitely scrollable body editor
  - The body editor is an Obsidian-style markdown live preview driven by the Lezer markdown syntax tree. Block markup (`#`/`##`/`###` headings, `>` quotes, `-`/`*`/`+`/`1.` list markers, `- [ ]` task boxes, `---` rules, ``` fences) hides unless the caret is on that line (fences: that block); inline markup (`**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, `<u>underline</u>`, `` `code` ``, `[text](url)`) hides unless the caret touches that span. Nested emphasis works.
  - Lists render with bullets / numbers and a hanging indent per depth; tasks render as checkboxes -- clicking a box toggles `[ ]`/`[x]` in the source (undoable) without moving the caret. Enter continues a list, Enter on an empty item leaves it, Tab / Shift+Tab nest / un-nest to the parent item's content column.
  - Typing `/` at the start of a line opens the block menu (Display, Headline, Subheader, Body, Task, List, Number list, Code block, Divider); it filters as you type, arrows + Enter pick, Esc closes. The current line's type is dimmed.
  - Selecting text shows a floating toolbar above the selection (highlight, bold, italic, underline, strikethrough, code span, code block, link) with active states; it hides on blur or scroll.
  - Shortcuts (Mod = Cmd on macOS, Ctrl elsewhere): Mod+B / I / U, Shift+Mod+X strike, Shift+Mod+H highlight, Mod+Alt+C code span, Shift+Mod+C code block, Mod+K link, Mod+T task, Mod+L list, Shift+Mod+L numbered list, Mod+4 body, Mod+E toggles raw source mode (debugging).
  - The canvas preview renders the same tree with the same `pn-md-*` classes (read-only: checkboxes show state but don't toggle), keeping one blank line of space per blank source line so it lines up with the editor.
  - Escape or the back button collapses the sheet back down to its place on the canvas
- Data model:
```js
{
  type: "paper-note",
  title: "",
  subtitle: "",
  text: ""
}
```
- Main files:
  - `renderer/src/components/tiles/PaperNoteTile.jsx` (canvas preview + page-stack visuals)
  - `renderer/src/components/PaperNoteFullscreenEditor.jsx` (fullscreen FLIP expand/collapse + title/subtitle/body editing)
  - `renderer/src/components/noteText/` + `renderer/src/lib/noteText/` (the shared note editor and read-only render every note tile uses -- see `docs/rules/text-editing-rules.md`)
  - `test/note-text.test.js` (markdown -> decoration mapping, commands, slash menu, read-only render)
  - `renderer/src/tiles/paperNote/model.js`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/components/CanvasDock.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
  - `renderer/src/context/AppProvider.jsx`
  - `renderer/src/lib/testingTiles.js`
- Add menu behavior:
  - Yes
  - Label: `Paper note`
- Testing Tiles examples:
  - `Reading List`
  - `Meeting Notes`
- Diagnostics / copy report behavior:
  - No dedicated diagnostics/report flow yet. State is normalized and serializable.
- Known limitations:
  - Page count is a decorative measurement of the rendered preview, not a real paginated document -- the fullscreen editor is always one continuous scrollable document.
  - Tables are recognised but shown as raw monospace text (editor and canvas alike), not as a rendered grid.
  - A list item's continuation lines (a second paragraph inside an item) keep their raw indentation in the editor.
  - Underline has no markdown syntax, so it is stored as `<u>...</u>`.
  - Canvas-state preview is read-only; all edits happen in the fullscreen overlay.
- Future improvements:
  - Render tables as a grid widget.
  - Consider letting the stacked pages be scrubbed through directly from the canvas.

## Planned Tiles

### Existing Runtime Placeholders

- Node Group Tile
  - Type ID: `node-group`
  - Status: Planned registry placeholder
- Game Tile
  - Type ID: `game`
  - Status: Planned registry placeholder
- 3D Model Tile
  - Type ID: `3d-model`
  - Status: Planned registry placeholder
- Physics Item Tile
  - Type ID: `physics-item`
  - Status: Planned registry placeholder

### Pomodoro / Stopwatch Tile

- Category: Tracking & Productivity
- Purpose:
  - A sprint-mode timer for focused work on a specific canvas zone or task.
- Expected UX:
  - Start / pause / reset
  - Pomodoro mode
  - Stopwatch mode
  - Optional focus target / linked canvas zone
  - Shows active sprint status clearly
  - Never blocks normal canvas use
- Suggested type ID:
  - `pomodoro`
- Suggested data model:
```js
{
  type: "pomodoro",
  title: "Sprint timer",
  mode: "pomodoro",
  durationMinutes: 25,
  remainingSeconds: 1500,
  isRunning: false,
  linkedZoneId: null,
  sessionsCompleted: 0
}
```

### Habit Tracker Tile

- Category: Tracking & Productivity
- Purpose:
  - A simple daily checkbox grid for tracking repeated work like marketing, outreach, writing, or exercise.
- Expected UX:
  - Rows are habits
  - Columns are dates/days
  - Click cells to check/uncheck
  - Add/remove habit
  - Compact weekly/monthly view if practical
- Suggested type ID:
  - `habit`
- Suggested data model:
```js
{
  type: "habit",
  title: "Habit tracker",
  habits: [],
  days: [],
  completions: {}
}
```

## Tile Lifecycle Checklist

Before a tile is considered complete:
- Type ID added
- Workspace normalization added
- Default data added
- Tile component added
- Tile registry updated
- Add menu entry added
- Canvas command added
- Styles added
- Diagnostics considered
- Testing Tiles examples added
- `docs/TILE_BOOK.md` updated
- `npm run lint` passes
- `npm run build` passes

## Deleting or Renaming a Tile

- Do not delete a tile type without considering old workspace compatibility.
- If renaming a type ID, add migration/normalization support.
- Update Testing Tiles and TILE_BOOK in the same change.

## Diagnostics Rule

Every tile should have clean serializable state.
Every tile should avoid permanent loading states.
Every tile should produce a clear terminal state:
- success
- empty
- fallback
- failed
- unsupported
- completed
- overdue if time-based

## Testing Tiles Rule

Testing Tiles is the visual QA board for all tile types.
Every implemented tile should have at least one seeded example there.
Complex tiles should have multiple examples covering normal, empty, edge, and failure states.
