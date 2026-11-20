// Failed link preview: the short line the failed-preview tile shows under the
// URL. Derived at render time from what the preview resolver already saved
// (card.previewError / card.previewDiagnostics); nothing new is stored.

export const FAILED_PREVIEW_REASONS = Object.freeze({
  "no-media": "No image or video found on this page",
  blocked: "Site blocked the preview",
  timeout: "Site took too long to answer",
  "not-found": "Page not found (404)",
  auth: "Page needs a login to view",
  "not-html": "Not a web page we can read",
  offline: "You’re offline",
  unknown: "Couldn’t load a preview",
});

function readHttpStatus(diagnostics) {
  const warnings = Array.isArray(diagnostics?.warnings) ? diagnostics.warnings : [];

  for (const warning of warnings) {
    const match = typeof warning === "string" ? warning.match(/HTTP (\d{3})/) : null;
    if (match) {
      return Number(match[1]);
    }
  }

  return 0;
}

function lower(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getFailedPreviewReasonCode(card, { hasImageError = false, isOnline = true } = {}) {
  const diagnostics = card?.previewDiagnostics && typeof card.previewDiagnostics === "object"
    ? card.previewDiagnostics
    : null;
  const error = lower(card?.previewError);
  const fetchStatus = lower(diagnostics?.metadataFetchStatus);

  if (!isOnline && (fetchStatus === "network-error" || !diagnostics)) {
    return "offline";
  }

  if (diagnostics?.loginWallDetected === true) {
    return "auth";
  }

  // embedBlocked (X-Frame-Options / CSP) only stops iframes, and most big
  // sites send it, so it says nothing about why the preview failed.
  if (diagnostics?.cookieWallDetected === true || diagnostics?.captchaDetected === true) {
    return "blocked";
  }

  if (fetchStatus === "http-error") {
    const status = readHttpStatus(diagnostics);
    if (status === 404 || status === 410) return "not-found";
    if (status === 401) return "auth";
    if (status === 403 || status === 429 || status === 451) return "blocked";
    return "unknown";
  }

  if (fetchStatus === "non-html") {
    return "not-html";
  }

  if (/timed? ?out|timeout/.test(error)) {
    return "timeout";
  }

  if (/sign in|log ?in|login/.test(error)) {
    return "auth";
  }

  if (/blocked|captcha|consent|cookie/.test(error)) {
    return "blocked";
  }

  // The page answered but the preview has nothing to show.
  if (
    hasImageError
    || fetchStatus === "success"
    || ["missing", "rejected", "blocked"].includes(lower(diagnostics?.thumbnailStatus))
  ) {
    return "no-media";
  }

  return "unknown";
}

export function getFailedPreviewReason(card, options) {
  return FAILED_PREVIEW_REASONS[getFailedPreviewReasonCode(card, options)];
}
