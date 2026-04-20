const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_REJECTION_REASON, PREVIEW_STATUS } = require("./constants");

function createResolvedPreviewResult(overrides = {}) {
  return {
    kind: PREVIEW_KIND.FALLBACK_LINK,
    confidence: PREVIEW_CONFIDENCE.LOW,
    status: PREVIEW_STATUS.FALLBACK,
    reason: "",
    rejectionReason: "",
    url: "",
    resolvedUrl: "",
    canonicalUrl: "",
    title: "",
    description: "",
    image: "",
    favicon: "",
    siteName: "",
    contentType: "link",
    sourceType: "generic-link",
    duration: null,
    author: "",
    channelName: "",
    previewStatus: "",
    previewKind: "default",
    metadata: {},
    candidateImageUrls: [],
    allowScreenshotFallback: false,
    diagnostics: null,
    ...overrides,
  };
}

function createBlockedResult(url, reason = PREVIEW_REJECTION_REASON.UNSUPPORTED_DOMAIN, details = {}) {
  return createResolvedPreviewResult({
    kind: PREVIEW_KIND.FALLBACK_LINK,
    confidence: PREVIEW_CONFIDENCE.LOW,
    status: PREVIEW_STATUS.BLOCKED,
    reason: "Preview blocked",
    rejectionReason: reason,
    canonicalUrl: url,
    ...details,
  });
}

module.exports = {
  createBlockedResult,
  createResolvedPreviewResult,
};
