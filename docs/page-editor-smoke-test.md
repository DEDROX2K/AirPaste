# Page Editor Smoke Test

Manual checklist for page editor v1.

## Scope

- Create, open, edit, autosave, close, and reopen markdown-backed pages
- Save-state visibility
- Title and excerpt refresh in Home after page saves
- Return-to-Home restoration from the page editor

## Test Setup

1. Launch AirPaste.
2. Open a disposable workspace folder.
3. Keep Home visible long enough to note the current folder, view mode, sort/filter settings, and scroll position before opening a page.

## Checklist

### Create And Open

1. Create a new page from Home.
2. Confirm a `*.md` file appears in the selected folder.
3. Confirm the page opens into the document editor, not a textarea-like panel.
4. Confirm the shell shows:
   - back button
   - file or page title in the header
   - visible save state
   - large editable title
   - rich text body area

### Edit And Autosave

1. Enter a title.
2. Add body content using:
   - heading
   - bold
   - italic
   - bullet list
   - numbered list
   - quote
   - code block
   - link
3. Confirm the save state changes to a pending or saving state after edits.
4. Wait for autosave.
5. Confirm the save state returns to `Saved`.

### Close And Reopen

1. Return to Home using the back button.
2. Confirm Home restores the prior folder and browser context.
3. Reopen the same page from Home.
4. Confirm the title and body content persist.
5. Restart the desktop app, reopen the workspace, and reopen the page again.
6. Confirm the markdown-backed content still loads correctly.

### Home Updates

1. Return to Home after saving the page.
2. Confirm the page entry reflects the latest title.
3. Confirm the page entry excerpt/snippet reflects recent body text.
4. Confirm the updated timestamp changes after another edit and autosave cycle.

### Folder Context

1. Open a page from a nested folder in the browser.
2. Return to Home.
3. Confirm AirPaste restores the same folder context rather than resetting to workspace root.

## Failure Signals

- Page opens in a weak textbox or textarea-like shell
- Save state never changes or never returns to `Saved`
- Reopening loses title or body content
- Markdown file content is not reflected after reopen
- Home does not update page title, excerpt, or updated time after save
- Returning from the page editor resets Home instead of restoring folder/browser context
