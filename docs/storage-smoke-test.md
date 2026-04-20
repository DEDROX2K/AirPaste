# Storage Smoke Test

Manual stabilization checklist for the v2 filesystem layer.

## Scope

- No preview validation in this pass
- No graph or link enrichment checks in this pass
- No page editor feature expansion checks in this pass
- Focus only on open/create/save/rename/delete/star/recent behavior through the v2 storage core

## Test Setup

1. Launch AirPaste.
2. Open an empty test folder that is not used for development.
3. Confirm the folder contains only hidden app metadata under `.airpaste/`.
4. Keep the file explorer open during the test so visible temp or backup artifacts can be spotted immediately.

## Expected Filesystem Rules

- Canvas files are saved as `*.airpaste.json`.
- Page files are saved as `*.md`.
- App metadata lives only in `.airpaste/`.
- Temporary writes go only into `.airpaste/tmp/`.
- No `.airpaste.page.json` files are created.
- No visible `.tmp` or `.bak` files appear next to user files.

## Checklist

### Create / Open / Save / Reopen Canvas

1. Create a new canvas from the home view.
2. Confirm one `*.airpaste.json` file appears in the selected folder or requested subfolder.
3. Open the canvas and make a simple visible edit.
4. Wait for autosave to finish.
5. Close the tab, reopen the same canvas, and confirm the edit is still present.
6. Restart the app, reopen the same workspace, and confirm the canvas still opens and still contains the saved edit.

### Create / Open / Save / Reopen Page

1. Create a new page from the home view.
2. Confirm one `*.md` file appears in the selected folder or requested subfolder.
3. Open the page and add a short text edit.
4. Wait for autosave to finish.
5. Close the tab, reopen the same page, and confirm the edit is still present.
6. Restart the app, reopen the same workspace, and confirm the page still opens and still contains the saved edit.

### Rename Starred Canvas / Page

1. Star one canvas and one page.
2. Rename the starred canvas.
3. Rename the starred page.
4. Confirm the files are renamed on disk with no duplicate files left behind.
5. Confirm both items still appear in the Starred view after rename.
6. Restart the app and confirm both renamed items are still starred.

### Recents And Starred After Restart

1. Open several canvases and pages in a known order.
2. Confirm the Recents view reflects that order.
3. Restart the app.
4. Reopen the same workspace.
5. Confirm Recents still shows the same recently opened items.
6. Confirm Starred still shows the same starred items.

### Nested Folder File Creation

1. Navigate into a nested folder from the home view.
2. Create a canvas in that nested folder.
3. Create a page in that nested folder.
4. Confirm the files are created in the selected nested folder, not flattened to the root.
5. Open both files and confirm save and reopen still work from that nested path.

### Delete Behavior

1. Delete a canvas from the home view.
2. Confirm the file is removed from disk.
3. Confirm it disappears from Home, Recents, and Starred.
4. Delete a page from the home view.
5. Confirm the file is removed from disk.
6. Confirm it disappears from Home, Recents, and Starred.
7. Restart the app and confirm deleted items do not reappear.

## Failure Signals

- Visible temp or backup files next to user files
- Renaming creates a duplicate instead of moving the original
- Renaming causes starred state to disappear
- Deleted items still appear after restart
- Canvases or pages reopen with missing saved edits
- A page is saved in any format other than `.md`
- Any runtime path creates `.airpaste.page.json`
- Any preview-related action mutates workspace files during this stabilization pass
