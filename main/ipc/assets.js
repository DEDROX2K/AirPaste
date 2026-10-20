const { ipcMain, nativeImage, net, protocol } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const workspaceService = require("../../workspace-service");
const context = require("../context");
const { pathExists } = require("../fsUtils");
const { withWorkspaceQueue } = require("../workspaceQueue");
const { captureFullPageScreenshot } = require("../../preview/resolvers/generic");

const ASSET_PREVIEW_DIR_SEGMENTS = Object.freeze([".airpaste", "previews", "asset-lod"]);
const CANVAS_THUMB_DIR_SEGMENTS = Object.freeze([".airpaste", "previews", "canvas-thumbs"]);
const WEBCLIP_DIR_SEGMENTS = Object.freeze([".airpaste", "previews", "webclip"]);
const ASSET_PREVIEW_TIER_WIDTHS = Object.freeze({
  thumbnail: 256,
  medium: 768,
  high: 1536,
  original: Infinity,
});
const CANVAS_THUMB_JPEG_QUALITY = 68;
const ASSET_PROTOCOL_SCHEME = "airpaste-asset";
const MAX_RESOLVED_ASSET_URLS = 4000;

const resolvedAssetUrlRegistry = new Map();

function normalizeRel(value, fallback = "") {
  const normalized = String(value ?? "")
    .replaceAll("\\", "/")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  if (!normalized || normalized === ".") {
    return fallback;
  }
  return normalized;
}

function canvasThumbIdFromRelativePath(relativePath) {
  const normalized = normalizeRel(relativePath, "");
  return createHash("sha1").update(normalized).digest("hex").slice(0, 20);
}

function webclipIdFromUrl(url) {
  return createHash("sha1").update(String(url ?? "")).digest("hex").slice(0, 20);
}

function isLikelyImageAsset(assetPath) {
  const ext = path.extname(String(assetPath ?? "")).toLowerCase().replace(/^\./, "");
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(ext);
}

function normalizeAssetPreviewOptions(options = null) {
  const safe = options && typeof options === "object" ? options : {};
  const requestedTier = typeof safe.previewTier === "string" ? safe.previewTier.trim().toLowerCase() : "original";
  const previewTier = Object.prototype.hasOwnProperty.call(ASSET_PREVIEW_TIER_WIDTHS, requestedTier)
    ? requestedTier
    : "original";
  const devicePixelRatio = Number.isFinite(safe.devicePixelRatio)
    ? Math.max(1, Math.min(2, Number(safe.devicePixelRatio)))
    : 1;

  return {
    previewTier,
    devicePixelRatio,
  };
}

function getAssetPreviewTargetWidth(imageWidth, options) {
  const tierWidth = ASSET_PREVIEW_TIER_WIDTHS[options.previewTier] ?? Infinity;

  if (!Number.isFinite(tierWidth)) {
    return imageWidth;
  }

  return Math.max(64, Math.round(Math.min(imageWidth, tierWidth * options.devicePixelRatio)));
}

async function resolveAssetVariantPath(folderPath, assetPath, options) {
  if (!folderPath || !assetPath || !isLikelyImageAsset(assetPath) || options.previewTier === "original") {
    return assetPath;
  }

  const image = nativeImage.createFromPath(assetPath);

  if (image.isEmpty()) {
    return assetPath;
  }

  const imageSize = image.getSize();
  const imageWidth = Number.isFinite(imageSize?.width) ? imageSize.width : 0;
  if (imageWidth <= 0) {
    return assetPath;
  }

  const targetWidth = getAssetPreviewTargetWidth(imageWidth, options);
  if (targetWidth >= imageWidth) {
    return assetPath;
  }

  const sourceStat = await fs.stat(assetPath).catch(() => null);
  const sourceMtimeToken = Number.isFinite(sourceStat?.mtimeMs)
    ? Math.round(sourceStat.mtimeMs)
    : 0;
  const variantDir = path.join(folderPath, ...ASSET_PREVIEW_DIR_SEGMENTS);
  await fs.mkdir(variantDir, { recursive: true });

  const sourceHash = createHash("sha1")
    .update(path.resolve(assetPath).toLowerCase())
    .digest("hex")
    .slice(0, 16);
  const variantName = `${sourceHash}-${sourceMtimeToken}-${targetWidth}.png`;
  const variantPath = path.join(variantDir, variantName);

  if (!(await pathExists(variantPath))) {
    const resizedImage = image.resize({
      width: targetWidth,
      quality: "good",
    });
    const variantBuffer = resizedImage.toPNG();
    await fs.writeFile(variantPath, variantBuffer);
  }

  return variantPath;
}

function registerResolvedAssetUrl(assetPath) {
  const resolvedAssetPath = path.resolve(String(assetPath ?? ""));
  if (!resolvedAssetPath) {
    return "";
  }

  const assetId = createHash("sha1")
    .update(resolvedAssetPath.toLowerCase())
    .digest("hex");
  resolvedAssetUrlRegistry.set(assetId, resolvedAssetPath);

  while (resolvedAssetUrlRegistry.size > MAX_RESOLVED_ASSET_URLS) {
    const oldestAssetId = resolvedAssetUrlRegistry.keys().next().value;
    if (!oldestAssetId) {
      break;
    }
    resolvedAssetUrlRegistry.delete(oldestAssetId);
  }

  return `${ASSET_PROTOCOL_SCHEME}://${assetId}`;
}

function registerProtocolScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

function registerProtocolHandler() {
  protocol.handle(ASSET_PROTOCOL_SCHEME, async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const assetId = String(requestUrl.host || "").trim();
      const assetPath = resolvedAssetUrlRegistry.get(assetId);
      if (!assetPath) {
        return new Response("Asset not found.", { status: 404 });
      }
      return net.fetch(pathToFileURL(assetPath).toString());
    } catch {
      return new Response("Invalid asset URL.", { status: 400 });
    }
  });
}

function registerIpc() {
  ipcMain.handle("airpaste:importImageAsset", async (_event, folderPath, payload) => (
    withWorkspaceQueue(folderPath, async () => (
      workspaceService.importImageAsset(folderPath, payload)
    ))
  ));

  ipcMain.handle("airpaste:resolveAssetUrl", async (_event, folderPath, relativePath, options = null) => {
    const assetPath = workspaceService.resolveWorkspaceAssetPath(folderPath, relativePath);

    if (!assetPath) {
      return "";
    }

    const normalizedOptions = normalizeAssetPreviewOptions(options);
    const resolvedPath = await resolveAssetVariantPath(folderPath, assetPath, normalizedOptions);
    return registerResolvedAssetUrl(resolvedPath);
  });

  ipcMain.handle("airpaste:captureCanvasThumbnail", async (_event, folderPath, canvasFilePath, rect, devicePixelRatio = 1) => {
    try {
      const mainWindow = context.mainWindow;
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { thumbnailPath: "" };
      }

      if (!folderPath || !canvasFilePath || !rect || typeof rect !== "object") {
        return { thumbnailPath: "" };
      }

      const relativeCanvasPath = normalizeRel(path.relative(folderPath, canvasFilePath), "");
      if (!relativeCanvasPath) {
        return { thumbnailPath: "" };
      }

      const thumbId = canvasThumbIdFromRelativePath(relativeCanvasPath);
      const thumbDir = path.join(folderPath, ...CANVAS_THUMB_DIR_SEGMENTS);
      await fs.mkdir(thumbDir, { recursive: true });

      const normalizedDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
      const captureRect = {
        x: Math.max(0, Math.floor(Number(rect.x || 0) * normalizedDpr)),
        y: Math.max(0, Math.floor(Number(rect.y || 0) * normalizedDpr)),
        width: Math.max(0, Math.floor(Number(rect.width || 0) * normalizedDpr)),
        height: Math.max(0, Math.floor(Number(rect.height || 0) * normalizedDpr)),
      };

      if (captureRect.width < 32 || captureRect.height < 32) {
        return { thumbnailPath: "" };
      }

      const image = await mainWindow.webContents.capturePage(captureRect);
      const outPath = path.join(thumbDir, `${thumbId}.jpg`);
      await fs.writeFile(outPath, image.toJPEG(CANVAS_THUMB_JPEG_QUALITY));

      const relativeThumbPath = normalizeRel(path.relative(folderPath, outPath), "");
      return { thumbnailPath: relativeThumbPath };
    } catch {
      return { thumbnailPath: "" };
    }
  });

  ipcMain.handle("airpaste:importFiles", async (_event, folderPath, sourcePaths, targetFolderPath = "") => (
    withWorkspaceQueue(folderPath, () => workspaceService.importFiles(folderPath, sourcePaths, targetFolderPath))
  ));

  ipcMain.handle("airpaste:captureWebclip", async (_event, folderPath, url) => {
    try {
      const trimmedUrl = typeof url === "string" ? url.trim() : "";
      if (!folderPath || !trimmedUrl) {
        return { webclipPath: "" };
      }

      const captured = await captureFullPageScreenshot(trimmedUrl);
      if (!captured?.buffer) {
        return { webclipPath: "" };
      }

      const webclipDir = path.join(folderPath, ...WEBCLIP_DIR_SEGMENTS);
      await fs.mkdir(webclipDir, { recursive: true });

      const outPath = path.join(webclipDir, `${webclipIdFromUrl(trimmedUrl)}.jpg`);
      await fs.writeFile(outPath, captured.buffer);

      const relativeWebclipPath = normalizeRel(path.relative(folderPath, outPath), "");
      return {
        webclipPath: relativeWebclipPath,
        width: captured.width,
        height: captured.height,
      };
    } catch {
      return { webclipPath: "" };
    }
  });
}

module.exports = {
  registerIpc,
  registerProtocolHandler,
  registerProtocolScheme,
};
