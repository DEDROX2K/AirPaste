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
| Implemented | Link & Media | Link Tile | `link` | Bookmark, preview, and media reference tile for web links. | `renderer/src/components/tiles/LinkTile.jsx` | `renderer/src/lib/workspace.js` | No direct Add menu entry. Usually created from paste/import. | Yes | Dedicated preview diagnostics and Codex copy report in DEV/testing flows. | Stable core tile type. |
| Implemented | Link & Media | Image Tile | `link` | Imported image tile rendered through the link tile system. | `renderer/src/components/tiles/LinkTile.jsx` | `renderer/src/lib/workspace.js` | No direct Add menu entry. Created through import/paste flows. | No seeded examples yet | No dedicated image-only copy report. Uses clean serializable link payload. | Implemented as `type: "link"` plus `contentKind: "image"`, not as a separate type id. |
| Implemented | Commerce | Amazon Product Tile | `amazon-product` | Specialized product preview tile for Amazon items. | `renderer/src/components/tiles/AmazonProductTile.jsx` | `renderer/src/lib/workspace.js` | No | No seeded examples yet | No dedicated copy report documented. | Specialized link-like tile. |
| Implemented | Structure & Planning | Checklist Tile | `checklist` | Simple checklist with editable items and completion state. | `renderer/src/components/tiles/ChecklistTile.jsx` | `renderer/src/lib/workspace.js` | Yes | No seeded examples yet | No dedicated diagnostics/copy report yet. State is serializable. | Stable manual tile. |
| Implemented | Notes & Writing | Note / Markdown Tile | `note` | Scratchpad tile for Markdown notes, explanations, and snippets. | `renderer/src/components/tiles/NoteTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | No dedicated diagnostics/copy report yet. State is serializable. | Supports edit/preview. |
| Implemented | Structured Data | Database / Table Tile | `table` | Lightweight grid tile for small structured datasets. | `renderer/src/components/tiles/TableTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | No dedicated diagnostics/copy report yet. State is serializable. | Tracker-style table, not a spreadsheet. |
| Implemented | Development | Code Snippet Tile | `code` | Syntax-highlighted storage tile for commands, config, SQL, regex, and snippets. | `renderer/src/components/tiles/CodeSnippetTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | Dedicated code diagnostics and Codex copy report in DEV/testing flows. | Stable manual tile. |
| Implemented | Tracking & Productivity | Counter Tile | `counter` | Large plus/minus counter for lightweight tracking. | `renderer/src/components/tiles/CounterTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | Dedicated counter diagnostics and Codex copy report in DEV/testing flows. | Stable manual tile. |
| Implemented | Tracking & Productivity | Deadline Countdown Tile | `deadline` | Live countdown to a deadline or launch. | `renderer/src/components/tiles/DeadlineTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | Dedicated deadline diagnostics and Codex copy report in DEV/testing flows. | Stable manual tile. |
| Implemented | Tracking & Productivity | Progress Bar Tile | `progress` | Progress indicator, optionally linked to checklist completion. | `renderer/src/components/tiles/ProgressTile.jsx` | `renderer/src/lib/workspace.js` | Yes | Yes | Dedicated progress diagnostics and Codex copy report in DEV/testing flows. | Stable manual tile. |
| Implemented | Layout & Containment | Rack Tile | `rack` | Container tile for mounted/slotted child tiles. | `renderer/src/components/tiles/RackTile.jsx` | `renderer/src/lib/workspace.js` | Yes | No seeded examples yet | No dedicated diagnostics/copy report yet. State is serializable. | Stable container tile. |
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
  - Supports retry for recoverable preview failures
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

## Amazon Product Tile

- Type ID: `amazon-product`
- Category: Commerce
- Status: Implemented
- Purpose: Specialized product card for Amazon product links.
- User-facing UX:
  - Renders product-specific metadata such as pricing and ratings when available
  - Behaves like a specialized link-like preview tile
- Data model:
```js
{
  type: "amazon-product",
  url: "",
  title: "",
  image: "",
  productAsin: "",
  productPrice: "",
  productDomain: "",
  productRating: null,
  productReviewCount: null
}
```
- Main files:
  - `renderer/src/components/tiles/AmazonProductTile.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/tiles/tileRegistry.js`
- Add menu behavior: No direct Add menu entry.
- Testing Tiles examples:
  - None seeded yet.
- Diagnostics / copy report behavior:
  - No dedicated copy report documented.
  - State is normalized in the workspace model.
- Known limitations:
  - Narrow domain-specific tile.
  - No dedicated QA row yet.
- Future improvements:
  - Add seeded examples once product-specific QA is needed.

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
- Status: Implemented
- Purpose: Scratchpad tile for Markdown notes, documentation, and future-me instructions.
- User-facing UX:
  - Editable title
  - Multiline Markdown body
  - Edit/preview toggle
  - Click preview to edit
  - `Cmd/Ctrl+Enter` toggles mode
  - `Escape` exits editing into preview
- Data model:
```js
{
  type: "note",
  title: "Untitled note",
  body: "",
  mode: "edit",
  languageHints: []
}
```
- Main files:
  - `renderer/src/components/tiles/NoteTile.jsx`
  - `renderer/src/lib/renderSimpleMarkdown.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
- Add menu behavior:
  - Yes
  - Label: `Note`
- Testing Tiles examples:
  - `Future-me instructions`
  - `Technical documentation`
  - `Code snippet`
  - `Long note scroll test`
- Diagnostics / copy report behavior:
  - No dedicated diagnostics/report flow yet.
  - State is normalized and serializable.
- Known limitations:
  - No dedicated copy-report tooling yet.
  - Safe internal Markdown renderer supports a limited V1 feature set.
- Future improvements:
  - Add note-specific diagnostics if needed.
  - Expand rich content support carefully.

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

## Code Snippet Tile

- Type ID: `code`
- Category: Development
- Status: Implemented
- Purpose: Safe syntax-highlighted storage tile for code, commands, config, SQL, and regex.
- User-facing UX:
  - Editable title
  - Language selector
  - Editable code area
  - Preview mode with syntax highlighting
  - Copy Code button
  - Wrap toggle
  - Line-number toggle
  - `Cmd/Ctrl+Enter` toggles edit/preview
  - `Escape` exits editing
- Data model:
```js
{
  type: "code",
  title: "Untitled snippet",
  language: "plain",
  code: "",
  wrap: true,
  showLineNumbers: true
}
```
- Main files:
  - `renderer/src/components/tiles/CodeSnippetTile.jsx`
  - `renderer/src/lib/renderCodeSyntax.jsx`
  - `renderer/src/lib/workspace.js`
  - `renderer/src/components/CanvasAddMenu.jsx`
  - `renderer/src/systems/commands/useCanvasCommands.js`
  - `renderer/src/components/CanvasWorkspaceView.jsx`
- Add menu behavior:
  - Yes
  - Label: `Code Snippet`
- Testing Tiles examples:
  - `Start dev server`
  - `Extract URLs`
  - `Tile config JSON`
  - `Debounce helper`
  - `Recent records query`
- Diagnostics / copy report behavior:
  - Dedicated DEV/testing diagnostics export exists.
  - Dedicated DEV/testing Codex report exists.
  - Diagnostics include language, code length, line count, wrap, and line-number settings.
- Known limitations:
  - Lightweight internal highlighter, not a full parser.
  - Not a runnable IDE.
- Future improvements:
  - More language coverage.
  - More seeded QA examples for long and empty states.

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
  - Yes
  - Label: `Progress Bar`
- Testing Tiles examples:
  - `QA rollout`
  - `Release readiness`
  - `Checklist sync`
- Diagnostics / copy report behavior:
  - Dedicated DEV/testing diagnostics export exists.
  - Dedicated DEV/testing Codex report exists.
  - Diagnostics include type, title, mode, value, max, and linked tile id.
- Known limitations:
  - Linked mode only supports checklist tiles in the current canvas.
  - No inverse/segmented progress modes in V1.
- Future improvements:
  - Add seeded linked-checklist examples once checklist QA coverage exists.
  - Consider optional target labels, milestones, and color thresholds.

## Rack Tile

- Type ID: `rack`
- Category: Layout & Containment
- Status: Implemented
- Purpose: Structured container for mounted/slotted child tiles.
- User-facing UX:
  - Manual creation from Add menu
  - Holds mounted child tiles in slots
  - Maintains attached tile layout rules
- Data model:
```js
{
  type: "rack",
  title: "Rack",
  description: "Mounted display rack",
  tileIds: [],
  minSlots: 3
}
```
- Main files:
  - `renderer/src/components/tiles/RackTile.jsx`
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
