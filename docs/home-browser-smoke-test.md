# Home Browser Smoke Test

Manual checklist for the folder-first Home and file browser pass on top of the stable v2 filesystem core.

## Scope

- Folder tree navigation
- File browser layout, metadata, and empty states
- Folder and file actions in the current folder context
- Return-to-Home restoration after editing
- No storage-model validation beyond confirming the UI stays on the v2 flow

## Test Setup

1. Launch AirPaste.
2. Open a disposable workspace folder.
3. Create a small nested structure:
   - workspace root
   - `Notes/`
   - `Notes/Daily/`
   - `Assets/`
4. Keep the app and the system file explorer visible during the test.

## Checklist

### Sidebar Folder Tree

1. Confirm the sidebar shows the workspace root plus nested folders.
2. Expand and collapse at least two nested folders.
3. Select `Notes/` and then `Notes/Daily/`.
4. Confirm the current folder is visually highlighted.
5. Switch between `Home`, `Recent`, and `Starred` and confirm those sections remain available.

### Main Browser Layout

1. In the root folder, confirm folders appear distinctly from canvases, pages, and assets.
2. Create one canvas, one page, and import at least one asset file.
3. Confirm the browser shows edited time and path metadata where applicable.
4. Toggle between grid and list view.
5. Change sort and filter settings and confirm the visible items update as expected.

### Folder And File Actions

1. In the current folder, create a new folder from the Home toolbar.
2. Enter that folder and create:
   - one canvas
   - one page
3. Rename the folder, then rename the canvas and page inside it.
4. Star the canvas and page, then confirm they appear in `Starred`.
5. Delete one item from the current folder and confirm it disappears from the browser immediately.
6. Confirm all actions apply to the active folder context and do not create files in the wrong folder.

### Return To Home Restoration

1. Navigate to a non-root folder.
2. Set a non-default browser state:
   - choose `Recent` or `Starred`, then return to `Home`
   - choose list or grid
   - choose a sort order
   - choose a filter
   - scroll the browser body downward
3. Open a canvas from that folder, then return to Home.
4. Open a page from that folder, then return to Home.
5. Confirm Home restores:
   - current folder
   - selected section
   - scroll position
   - sort, filter, and view mode

### Empty States

1. Open an empty folder in the sidebar.
2. Confirm the empty state offers:
   - `New Canvas`
   - `New Page`
   - `New Folder`
   - `Import files`
3. Use each action from an empty folder at least once across the test.
4. In `Recent`, confirm the empty state message is appropriate when no recent files exist.
5. In `Starred`, confirm the empty state message is appropriate when nothing is starred.

## Failure Signals

- Folder tree does not reflect nested folders accurately
- Expand or collapse state is unreliable
- Current folder highlight is wrong or missing
- Grid/list, sort, or filter state is lost after returning from an editor
- New folder, rename, delete, star, or import acts on the wrong folder
- Empty states are missing actions or point to the wrong behavior
- Returning from a canvas or page resets Home instead of restoring prior context
