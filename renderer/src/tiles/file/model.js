import { firstString, getNextCardPosition, nowIso, normalizeCard, normalizeFileExtension } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const FILE_CARD_TYPE = TILE_TYPES.FILE;

export const FILE_CARD_SIZE = Object.freeze({
  width: 344,
  height: 436,
});

export const FILE_DEFAULT_TITLE = "Untitled file";

export function normalizeFileAttachment(file) {
  if (!file || typeof file !== "object") {
    return null;
  }

  const relativePath = typeof file.relativePath === "string" ? file.relativePath.trim() : "";

  if (!relativePath) {
    return null;
  }

  const fileName = typeof file.fileName === "string" ? file.fileName.trim() : "";
  const extension = normalizeFileExtension(
    typeof file.extension === "string" && file.extension.trim().length > 0
      ? file.extension
      : fileName.split(".").pop(),
  );

  return {
    relativePath,
    filePath: typeof file.filePath === "string" ? file.filePath : "",
    fileName,
    extension,
    mimeType: typeof file.mimeType === "string" ? file.mimeType : "",
    sizeBytes: Number.isFinite(file.sizeBytes) ? Math.max(0, file.sizeBytes) : 0,
  };
}

export function createFileCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, FILE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();
  const file = normalizeFileAttachment(options?.file);

  return normalizeCard({
    id: crypto.randomUUID(),
    type: FILE_CARD_TYPE,
    title: firstString(options?.title, file?.fileName, FILE_DEFAULT_TITLE),
    file,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
