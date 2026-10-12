const { ipcMain, shell } = require("electron");
const fsSync = require("node:fs");
const path = require("node:path");
const context = require("../context");
const { nowIso } = require("../fsUtils");

const markdownFileWatchers = new Map();

function normalizeExternalUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Fall through and try an https-prefixed variant.
  }

  try {
    return new URL(`https://${trimmed}`).toString();
  } catch {
    return "";
  }
}

function notifyMarkdownFileChanged(filePath, eventType = "change") {
  const mainWindow = context.mainWindow;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("airpaste:markdownFileChanged", {
    filePath,
    eventType,
    updatedAt: nowIso(),
  });
}

function watchMarkdownFilePath(filePath) {
  const resolvedPath = path.resolve(String(filePath ?? ""));
  const existing = markdownFileWatchers.get(resolvedPath);

  if (existing) {
    existing.refCount += 1;
    return { watching: true, filePath: resolvedPath };
  }

  const watcher = fsSync.watch(resolvedPath, { persistent: false }, (eventType) => {
    notifyMarkdownFileChanged(resolvedPath, eventType || "change");
  });

  markdownFileWatchers.set(resolvedPath, {
    watcher,
    refCount: 1,
  });

  return { watching: true, filePath: resolvedPath };
}

function unwatchMarkdownFilePath(filePath) {
  const resolvedPath = path.resolve(String(filePath ?? ""));
  const existing = markdownFileWatchers.get(resolvedPath);

  if (!existing) {
    return { watching: false, filePath: resolvedPath };
  }

  existing.refCount -= 1;
  if (existing.refCount <= 0) {
    existing.watcher.close();
    markdownFileWatchers.delete(resolvedPath);
    return { watching: false, filePath: resolvedPath };
  }

  return { watching: true, filePath: resolvedPath };
}

function registerIpc() {
  ipcMain.handle("airpaste:watchMarkdownFile", async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") {
      return { watching: false };
    }

    return watchMarkdownFilePath(filePath);
  });

  ipcMain.handle("airpaste:unwatchMarkdownFile", async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") {
      return { watching: false };
    }

    return unwatchMarkdownFilePath(filePath);
  });

  ipcMain.handle("airpaste:openExternal", async (_event, url) => {
    const normalizedUrl = normalizeExternalUrl(url);

    if (!normalizedUrl) {
      return { opened: false };
    }

    await shell.openExternal(normalizedUrl);
    return { opened: true };
  });

  ipcMain.handle("airpaste:openFile", async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") {
      return { opened: false };
    }

    const errorMessage = await shell.openPath(filePath);
    return { opened: errorMessage === "" };
  });
}

module.exports = {
  registerIpc,
};
