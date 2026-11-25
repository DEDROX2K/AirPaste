import { desktop } from "./desktop";
import { resolveAssetPreviewUrl } from "../systems/canvas/useTilePreviewSource";
import { PREVIEW_TIER } from "../systems/canvas/tileLod";

// "Copy image" on a link tile: puts the full-size picture the tile shows
// (its pasted image, its link preview image, or its webclip) on the system
// clipboard as an image, ready to paste into any other app.

function getWebclipPath(card) {
  return card?.previewMode === "webclip" && typeof card?.webclipImagePath === "string"
    ? card.webclipImagePath
    : "";
}

export function tileHasCopyableImage(card) {
  if (!card) return false;
  return Boolean(
    getWebclipPath(card)
      || card.asset?.relativePath
      || (typeof card.image === "string" && card.image.trim()),
  );
}

async function resolveTileImageSource(card, folderPath) {
  const webclipPath = getWebclipPath(card);
  if (webclipPath && folderPath) {
    const url = await desktop.workspace.resolveAssetUrl(folderPath, webclipPath);
    if (url) return url;
  }

  const assetPath = card?.asset?.relativePath;
  if (assetPath && folderPath) {
    const url = await resolveAssetPreviewUrl({
      folderPath,
      relativePath: assetPath,
      previewTier: PREVIEW_TIER.ORIGINAL,
      devicePixelRatio: 1,
    });
    if (url) return url;
  }

  return typeof card?.image === "string" ? card.image.trim() : "";
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = url;
  });
}

// Formats the clipboard can't take as they are (WebP, AVIF, GIF, SVG...)
// are drawn once and re-encoded as PNG.
async function toPngBytes(bytes) {
  const blob = new Blob([bytes]);
  let source = null;
  let width = 0;
  let height = 0;
  let objectUrl = "";

  try {
    source = await createImageBitmap(blob);
    width = source.width;
    height = source.height;
  } catch {
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/svg+xml" }));
    source = await loadImageElement(objectUrl);
    width = source.naturalWidth || 1024;
    height = source.naturalHeight || 1024;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Could not encode the image."))), "image/png");
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    source?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function copyTileImageToClipboard(card, folderPath) {
  const source = await resolveTileImageSource(card, folderPath);
  if (!source) throw new Error("This tile has no image yet.");

  const result = await desktop.workspace.copyImageToClipboard(source);
  if (result?.copied) return true;
  if (!result?.bytes) throw new Error("Could not copy that image.");

  await desktop.workspace.writeClipboardPng(await toPngBytes(result.bytes));
  return true;
}
