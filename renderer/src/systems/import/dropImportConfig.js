export const DROP_IMPORT_LIMITS = Object.freeze({
  maxItemsPerDrop: 32,
  maxBytesPerImage: 32 * 1024 * 1024,
  maxTotalBytesPerDrop: 128 * 1024 * 1024,
});

export const SUPPORTED_DROP_IMAGE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export const SUPPORTED_DROP_IMAGE_EXTENSIONS = Object.freeze([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
]);

const SUPPORTED_MIME_TYPE_SET = new Set(SUPPORTED_DROP_IMAGE_MIME_TYPES);
const SUPPORTED_EXTENSION_SET = new Set(SUPPORTED_DROP_IMAGE_EXTENSIONS);

export function getFileExtension(fileName) {
  if (typeof fileName !== "string") {
    return "";
  }

  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex < 0 || lastDotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase();
}

export function isSupportedDropImageMimeType(mimeType) {
  return SUPPORTED_MIME_TYPE_SET.has(String(mimeType ?? "").toLowerCase());
}

export function isSupportedDropImageExtension(extension) {
  return SUPPORTED_EXTENSION_SET.has(String(extension ?? "").toLowerCase());
}

export function isSupportedDroppedImageFile(fileLike) {
  return isSupportedDropImageMimeType(fileLike?.mimeType) || isSupportedDropImageExtension(fileLike?.extension);
}

export function isValidDroppedUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  const precision = value >= 10 || exponent === 0 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[exponent]}`;
}
