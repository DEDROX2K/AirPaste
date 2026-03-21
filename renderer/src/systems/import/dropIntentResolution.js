import {
  DROP_IMPORT_LIMITS,
  formatBytes,
  isSupportedDroppedImageFile,
  isValidDroppedUrl,
  SUPPORTED_DROP_IMAGE_EXTENSIONS,
  SUPPORTED_DROP_IMAGE_MIME_TYPES,
} from "./dropImportConfig";

function createRejectedItem(item, reason, detail) {
  return {
    item,
    reason,
    detail,
  };
}

export function resolveDropIntents(normalizedDrop) {
  const items = Array.isArray(normalizedDrop?.items) ? normalizedDrop.items : [];
  const totalBytes = items.reduce((sum, item) => sum + (Number.isFinite(item?.sizeBytes) ? item.sizeBytes : 0), 0);

  if (items.length === 0) {
    return {
      acceptedItems: [],
      rejectedItems: [],
      dropError: null,
    };
  }

  if (items.length > DROP_IMPORT_LIMITS.maxItemsPerDrop) {
    return {
      acceptedItems: [],
      rejectedItems: [],
      dropError: {
        reason: "item-count-limit",
        message: `Drop rejected: ${items.length} items exceeds the ${DROP_IMPORT_LIMITS.maxItemsPerDrop}-item limit.`,
      },
    };
  }

  if (totalBytes > DROP_IMPORT_LIMITS.maxTotalBytesPerDrop) {
    return {
      acceptedItems: [],
      rejectedItems: [],
      dropError: {
        reason: "total-size-limit",
        message: `Drop rejected: total payload size ${formatBytes(totalBytes)} exceeds the ${formatBytes(DROP_IMPORT_LIMITS.maxTotalBytesPerDrop)} per-drop limit.`,
      },
    };
  }

  const acceptedItems = [];
  const rejectedItems = [];

  items.forEach((item) => {
    if (item.payloadKind === "file") {
      if (!isSupportedDroppedImageFile(item)) {
        rejectedItems.push(createRejectedItem(
          item,
          "unsupported-file-type",
          `"${item.name}" (${item.mimeType || "unknown type"}, ${formatBytes(item.sizeBytes)}) is not supported. Supported image MIME types: ${SUPPORTED_DROP_IMAGE_MIME_TYPES.join(", ")}. Supported extensions: ${SUPPORTED_DROP_IMAGE_EXTENSIONS.join(", ")}.`,
        ));
        return;
      }

      if (item.sizeBytes > DROP_IMPORT_LIMITS.maxBytesPerImage) {
        rejectedItems.push(createRejectedItem(
          item,
          "image-size-limit",
          `"${item.name}" (${item.mimeType || "unknown type"}, ${formatBytes(item.sizeBytes)}) exceeds the ${formatBytes(DROP_IMPORT_LIMITS.maxBytesPerImage)} per-image limit.`,
        ));
        return;
      }

      if (!item.sourcePath) {
        rejectedItems.push(createRejectedItem(
          item,
          "missing-local-path",
          `"${item.name}" could not be imported because its local file path was unavailable to the app.`,
        ));
        return;
      }

      acceptedItems.push({
        intent: "import-image",
        item,
      });
      return;
    }

    if (item.payloadKind === "url" && isValidDroppedUrl(item.url)) {
      acceptedItems.push({
        intent: "create-bookmark",
        item,
      });
      return;
    }

    rejectedItems.push(createRejectedItem(
      item,
      "invalid-url",
      `"${item.rawValue || ""}" is not a valid http or https URL.`,
    ));
  });

  return {
    acceptedItems,
    rejectedItems,
    dropError: null,
  };
}
