// Regression coverage for the whole-app-quit data-loss path: closing the
// window (or quitting via Cmd+Q / the app menu) used to allow the window to
// close on a blind 190ms timer, with nothing waiting for the renderer to
// flush whatever canvas edit was still sitting in the 420ms autosave
// debounce. requestGracefulClose() in main/windows.js now blocks the actual
// close until the renderer acknowledges "window:ready-to-close" (after it
// flushes), with a safety-net timeout so a hung/crashed renderer can never
// prevent the app from closing.
//
// main/windows.js is CommonJS and calls require("electron"); outside the
// real Electron binary that resolves to a path string, not the API object,
// so this seeds Node's own require.cache directly, the same way
// test/main-ipc-registration.test.js does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronModulePath = require.resolve("electron");
const MODULE_PATHS = ["../main/windows.js", "../main/context.js"].map((modulePath) => require.resolve(modulePath));

let ipcHandlers;

function buildElectronMock() {
  ipcHandlers = {};
  return {
    app: { isPackaged: false },
    BrowserWindow: vi.fn(),
    ipcMain: {
      on: vi.fn((channel, handler) => {
        ipcHandlers[channel] = handler;
      }),
    },
    shell: { openExternal: vi.fn() },
  };
}

function makeFakeWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const modulePath of MODULE_PATHS) {
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
  vi.useRealTimers();
  delete require.cache[electronModulePath];
  for (const modulePath of MODULE_PATHS) {
    delete require.cache[modulePath];
  }
});

describe("requestGracefulClose", () => {
  it("waits for the renderer's ready-to-close acknowledgment before calling onReady", () => {
    const windows = require("../main/windows.js");
    const context = require("../main/context.js");
    windows.registerIpc();
    context.mainWindow = makeFakeWindow();

    const onReady = vi.fn();
    windows.requestGracefulClose(onReady);

    expect(context.mainWindow.webContents.send).toHaveBeenCalledWith("window:prepare-close");
    expect(onReady).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onReady).not.toHaveBeenCalled();

    ipcHandlers["window:ready-to-close"]();
    expect(onReady).not.toHaveBeenCalled(); // minimum close-animation delay still applies
    vi.advanceTimersByTime(190);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("closes anyway via the safety-net timeout if the renderer never acknowledges", () => {
    const windows = require("../main/windows.js");
    const context = require("../main/context.js");
    windows.registerIpc();
    context.mainWindow = makeFakeWindow();

    const onReady = vi.fn();
    windows.requestGracefulClose(onReady);

    vi.advanceTimersByTime(3999);
    expect(onReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("calls onReady immediately when there is no window to flush", () => {
    const windows = require("../main/windows.js");
    const context = require("../main/context.js");
    context.mainWindow = null;

    const onReady = vi.fn();
    windows.requestGracefulClose(onReady);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("does not start a second overlapping flush (e.g. a near-simultaneous window-close and Cmd+Q)", () => {
    const windows = require("../main/windows.js");
    const context = require("../main/context.js");
    windows.registerIpc();
    context.mainWindow = makeFakeWindow();

    const firstOnReady = vi.fn();
    const secondOnReady = vi.fn();
    windows.requestGracefulClose(firstOnReady);
    windows.requestGracefulClose(secondOnReady);

    expect(context.mainWindow.webContents.send).toHaveBeenCalledTimes(1);

    ipcHandlers["window:ready-to-close"]();
    vi.advanceTimersByTime(190);

    expect(firstOnReady).toHaveBeenCalledTimes(1);
    expect(secondOnReady).not.toHaveBeenCalled();
  });
});
