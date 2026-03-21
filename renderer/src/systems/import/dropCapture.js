function readTransferText(dataTransfer, type) {
  try {
    return dataTransfer?.getData(type) ?? "";
  } catch {
    return "";
  }
}

function getTransferTypes(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).map((type) => String(type));
}

export function hasCapturableDropData(dataTransfer) {
  const types = new Set(getTransferTypes(dataTransfer));

  return (dataTransfer?.files?.length ?? 0) > 0
    || types.has("text/uri-list")
    || types.has("text/plain");
}

export function captureDropPayload(event) {
  return {
    clientPoint: {
      x: Number.isFinite(event?.clientX) ? event.clientX : 0,
      y: Number.isFinite(event?.clientY) ? event.clientY : 0,
    },
    files: Array.from(event?.dataTransfer?.files ?? []),
    uriListText: readTransferText(event?.dataTransfer, "text/uri-list"),
    plainText: readTransferText(event?.dataTransfer, "text/plain"),
  };
}
