import { getFileExtension, isValidDroppedUrl } from "./dropImportConfig";

function normalizeDroppedFile(file, index) {
  return {
    id: `drop-file-${index}`,
    payloadKind: "file",
    sourceKind: "local-file",
    name: typeof file?.name === "string" ? file.name : `image-${index + 1}`,
    mimeType: typeof file?.type === "string" ? file.type.toLowerCase() : "",
    extension: getFileExtension(file?.name),
    sizeBytes: Number.isFinite(file?.size) ? Math.max(0, file.size) : 0,
    sourcePath: typeof file?.path === "string" ? file.path : "",
    file,
  };
}

function parseUriList(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function getDroppedUrlValues(uriListText, plainText) {
  const candidates = [
    ...parseUriList(uriListText),
    String(plainText ?? "").trim(),
  ].filter(Boolean);

  const uniqueUrls = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    if (!isValidDroppedUrl(candidate) || seen.has(candidate)) {
      return;
    }

    seen.add(candidate);
    uniqueUrls.push(candidate);
  });

  return uniqueUrls;
}

export function normalizeDropPayload(capturedPayload) {
  const fileItems = Array.isArray(capturedPayload?.files)
    ? capturedPayload.files.map((file, index) => normalizeDroppedFile(file, index))
    : [];
  const urlItems = getDroppedUrlValues(capturedPayload?.uriListText, capturedPayload?.plainText)
    .map((url, index) => ({
      id: `drop-url-${index}`,
      payloadKind: "url",
      sourceKind: "dropped-url",
      url,
      rawValue: url,
      sizeBytes: 0,
    }));

  return {
    clientPoint: capturedPayload?.clientPoint ?? { x: 0, y: 0 },
    items: [...fileItems, ...urlItems],
  };
}
