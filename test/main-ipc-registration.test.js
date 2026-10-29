import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

// main/*.js modules are CommonJS, written to run inside the Electron main
// process; `require("electron")` outside the real Electron binary resolves
// to a path string, not the API object, so these modules cannot be required
// under plain Node/Vitest without faking the "electron" module. `vi.mock`
// does not reach a plain `require()` call made from inside a pure-CommonJS
// source file (Vitest only intercepts imports it transforms as ESM), so this
// seeds Node's own `require.cache` directly -- the one interception point
// every `require("electron")` call actually goes through, regardless of how
// the calling file got loaded.
//
// This test exists to catch exactly the class of mistake a manual
// code-motion refactor risks: a dropped, renamed, or duplicated IPC channel.
// It does not exercise handler behavior (that's covered by the real
// end-to-end tests against workspace-service.js and by manually launching
// the app).

const require = createRequire(import.meta.url);
const electronModulePath = require.resolve("electron");

const handledChannels = [];
const onChannels = [];

function buildElectronMock() {
  return {
    app: { getPath: vi.fn(() => "/tmp"), isPackaged: false, whenReady: vi.fn(() => new Promise(() => {})) },
    BrowserWindow: vi.fn(),
    dialog: { showOpenDialog: vi.fn() },
    ipcMain: {
      handle: vi.fn((channel) => handledChannels.push(channel)),
      on: vi.fn((channel) => onChannels.push(channel)),
    },
    nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => true })) },
    net: { fetch: vi.fn() },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
  };
}

// Every explicit ipcMain.handle("airpaste:...") call plus every channel from
// the dynamically-registered `workspaceActionHandlers` table, as catalogued
// directly from the pre-refactor main.js before the Phase 2A split.
const EXPECTED_HANDLE_CHANNELS = [
  // main/ipc/dome.js
  "airpaste:openFolder", "airpaste:openFiles", "airpaste:listDomes", "airpaste:getActiveDome",
  "airpaste:createDome", "airpaste:openDome", "airpaste:switchDome", "airpaste:removeDome",
  "airpaste:revealDome", "airpaste:getLastFolder",
  // main/ipc/workspace.js
  "airpaste:loadWorkspace", "airpaste:createWorkspace", "airpaste:saveWorkspace",
  "airpaste:listFiles", "airpaste:getHomeData", "airpaste:getRecentItems", "airpaste:getStarredItems",
  "airpaste:createCanvas", "airpaste:createMarkdownFile", "airpaste:createFolder",
  "airpaste:renameFile", "airpaste:renameEntry", "airpaste:deleteFile", "airpaste:deleteEntry",
  "airpaste:markItemStarred", "airpaste:recordRecentItem", "airpaste:getItemForFilePath",
  "airpaste:loadUiState", "airpaste:readMarkdownFile", "airpaste:saveUiState", "airpaste:writeMarkdownFile",
  "airpaste:loadCanvas", "airpaste:saveCanvas",
  "airpaste:listCanvasHistory", "airpaste:restoreCanvasHistoryEntry",
  // main/ipc/assets.js
  "airpaste:importImageAsset", "airpaste:resolveAssetUrl", "airpaste:captureCanvasThumbnail",
  "airpaste:importFiles", "airpaste:captureWebclip",
  // main/ipc/files.js
  "airpaste:watchMarkdownFile", "airpaste:unwatchMarkdownFile", "airpaste:getUserName", "airpaste:openExternal", "airpaste:openFile",
  // main/ipc/linkPreview.js
  "airpaste:getPreviewCapabilities", "airpaste:fetchLinkPreview", "airpaste:cancelLinkPreview",
];

const EXPECTED_ON_CHANNELS = [
  "window:minimize", "window:maximize", "window:close",
  "window:resizeStart", "window:resizeMove", "window:resizeEnd",
  "window:moveStart", "window:moveEnd",
  "window:ready-to-close",
];

const MAIN_MODULE_PATHS = [
  "../main/ipc/dome.js",
  "../main/ipc/workspace.js",
  "../main/ipc/assets.js",
  "../main/ipc/files.js",
  "../main/ipc/linkPreview.js",
  "../main/windows.js",
  "../main/context.js",
  "../main/fsUtils.js",
  "../main/workspaceQueue.js",
].map((relative) => require.resolve(relative));

beforeEach(() => {
  handledChannels.length = 0;
  onChannels.length = 0;

  // Clear any previously-cached copies of the main/* modules so each test
  // gets a fresh require() that picks up the current electron mock.
  for (const modulePath of MAIN_MODULE_PATHS) {
    delete require.cache[modulePath];
  }

  require.cache[electronModulePath] = {
    id: electronModulePath,
    filename: electronModulePath,
    loaded: true,
    exports: buildElectronMock(),
  };
});

afterEach(() => {
  delete require.cache[electronModulePath];
  for (const modulePath of MAIN_MODULE_PATHS) {
    delete require.cache[modulePath];
  }
});

describe("main-process IPC registration", () => {
  it("registers every expected channel exactly once, with none dropped or duplicated", () => {
    const domeIpc = require("../main/ipc/dome.js");
    const workspaceIpc = require("../main/ipc/workspace.js");
    const assetsIpc = require("../main/ipc/assets.js");
    const filesIpc = require("../main/ipc/files.js");
    const linkPreviewIpc = require("../main/ipc/linkPreview.js");
    const windows = require("../main/windows.js");

    domeIpc.registerIpc();
    workspaceIpc.registerIpc();
    assetsIpc.registerIpc();
    filesIpc.registerIpc();
    linkPreviewIpc.registerIpc();
    windows.registerIpc();

    expect(new Set(handledChannels).size).toBe(handledChannels.length);
    expect(new Set(onChannels).size).toBe(onChannels.length);

    expect(handledChannels.sort()).toEqual([...EXPECTED_HANDLE_CHANNELS].sort());
    expect(onChannels.sort()).toEqual([...EXPECTED_ON_CHANNELS].sort());
  });
});
