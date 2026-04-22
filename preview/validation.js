const {
  PREVIEW_CONFIDENCE,
  PREVIEW_GENERIC_TITLES,
  PREVIEW_IMAGE_REJECTION_PATTERNS,
  PREVIEW_REJECTION_PATTERNS,
  PREVIEW_REJECTION_REASON,
  PREVIEW_STATUS,
  PREVIEW_URL_REJECTION_PATTERNS,
} = require("./constants");
const { getHostname, normalizePreviewText } = require("./utils");

function looksLikeGenericTitle(title, url, siteName = "") {
  const normalizedTitle = normalizePreviewText(title);

  if (!normalizedTitle) {
    return true;
  }

  const hostname = normalizePreviewText(getHostname(url));
  const normalizedSiteName = normalizePreviewText(siteName);

  return PREVIEW_GENERIC_TITLES.includes(normalizedTitle)
    || normalizedTitle === hostname
    || normalizedTitle === normalizedSiteName
    || normalizedTitle === `www.${hostname}`
    || normalizedTitle.length <= 3;
}

function looksLikeLowInformationDescription(description) {
  const normalizedDescription = normalizePreviewText(description);

  return !normalizedDescription
    || normalizedDescription.length < 24
    || PREVIEW_REJECTION_PATTERNS.some((pattern) => normalizedDescription.includes(pattern));
}

function isBodyLevelHardRejectionPattern(pattern = "") {
  const normalized = String(pattern ?? "").toLowerCase();

  return normalized.includes("captcha")
    || normalized.includes("robot check")
    || normalized.includes("unusual traffic")
    || normalized.includes("access denied")
    || normalized.includes("service unavailable")
    || normalized.includes("temporarily unavailable")
    || normalized.includes("privacy notice")
    || normalized.includes("consent")
    || normalized.includes("enable cookies")
    || normalized.includes("verify you are human")
    || normalized.includes("verify that you are human");
}

function resolveRejectionReason({ urlPattern, rejectionPattern, rejectImage, lowInformation }) {
  if (urlPattern?.includes("/consent") || rejectionPattern?.includes("consent")) {
    return PREVIEW_REJECTION_REASON.CONSENT_PAGE;
  }

  if (
    urlPattern?.includes("/login")
    || urlPattern?.includes("/signin")
    || rejectionPattern?.includes("sign in")
    || rejectionPattern?.includes("log in")
    || rejectionPattern?.includes("login")
  ) {
    return PREVIEW_REJECTION_REASON.LOGIN_WALL;
  }

  if (urlPattern?.includes("/captcha") || rejectionPattern?.includes("captcha") || rejectionPattern?.includes("robot check")) {
    return PREVIEW_REJECTION_REASON.CAPTCHA;
  }

  if (rejectionPattern?.includes("unusual traffic")) {
    return PREVIEW_REJECTION_REASON.UNUSUAL_TRAFFIC;
  }

  if (rejectImage) {
    return PREVIEW_REJECTION_REASON.PLACEHOLDER_IMAGE;
  }

  if (lowInformation) {
    return PREVIEW_REJECTION_REASON.LOW_INFORMATION;
  }

  if (urlPattern) {
    return PREVIEW_REJECTION_REASON.REDIRECTED_NON_CONTENT;
  }

  return PREVIEW_REJECTION_REASON.UNKNOWN;
}

function isTrustedVideoThumbnailUrl(url) {
  const normalizedUrl = String(url ?? "").toLowerCase();

  if (!normalizedUrl) {
    return false;
  }

  return normalizedUrl.includes("i.ytimg.com/")
    || normalizedUrl.includes("img.youtube.com/")
    || normalizedUrl.includes("i.vimeocdn.com/")
    || normalizedUrl.includes("vumbnail.com/");
}

function isRejectedPreviewImageUrl(url, result = null) {
  const normalizedUrl = String(url ?? "").toLowerCase();

  if (!normalizedUrl) {
    return true;
  }

  if (result?.contentType === "video" && isTrustedVideoThumbnailUrl(normalizedUrl)) {
    return false;
  }

  return PREVIEW_IMAGE_REJECTION_PATTERNS.some((pattern) => normalizedUrl.includes(pattern))
    || normalizedUrl.includes("abs.twimg.com/emoji/")
    || normalizedUrl.includes("abs.twimg.com/rweb/ssr/default/v2/og/image.png")
    || normalizedUrl.includes("client-web/icon")
    || normalizedUrl.includes("/favicon")
    || normalizedUrl.includes("/profile_images/")
    || normalizedUrl.includes("/semantic_core_img/")
    || normalizedUrl.includes("amazon-adsystem")
    || normalizedUrl.includes("gp/aw");
}

function validateResolvedPreview(result, documentSignals = {}) {
  const normalizedFinalUrl = String(result.canonicalUrl || "").toLowerCase();
  const normalizedTitle = normalizePreviewText(result.title || documentSignals.pageTitle);
  const normalizedDescription = normalizePreviewText(result.description);
  const normalizedBodyText = normalizePreviewText(documentSignals.bodyText).slice(0, 5000);
  const rejectionPatternFromTitleOrDescription = PREVIEW_REJECTION_PATTERNS.find((pattern) => (
    normalizedTitle.includes(pattern)
    || normalizedDescription.includes(pattern)
  ));
  const rejectionPatternFromBody = PREVIEW_REJECTION_PATTERNS.find((pattern) => (
    normalizedBodyText.includes(pattern)
  ));
  const rejectionPattern = rejectionPatternFromTitleOrDescription || rejectionPatternFromBody;
  const urlPattern = PREVIEW_URL_REJECTION_PATTERNS.find((pattern) => normalizedFinalUrl.includes(pattern));
  const rejectImage = isRejectedPreviewImageUrl(result.image || result.candidateImageUrls?.[0] || "", result);
  const genericTitle = looksLikeGenericTitle(result.title || documentSignals.pageTitle, result.canonicalUrl, result.siteName);
  const lowInformationDescription = looksLikeLowInformationDescription(result.description);
  const rejectionReason = resolveRejectionReason({
    urlPattern,
    rejectionPattern,
    rejectImage,
    lowInformation: genericTitle && lowInformationDescription,
  });
  const shouldBlockFromBodyPattern = Boolean(
    rejectionPatternFromBody
    && !rejectionPatternFromTitleOrDescription
    && isBodyLevelHardRejectionPattern(rejectionPatternFromBody),
  );

  if (urlPattern || rejectionPatternFromTitleOrDescription || shouldBlockFromBodyPattern) {
    return {
      decision: "blocked",
      status: PREVIEW_STATUS.BLOCKED,
      confidence: PREVIEW_CONFIDENCE.LOW,
      rejectionReason,
      reason: "Preview blocked",
      acceptImage: false,
    };
  }

  if (genericTitle && lowInformationDescription && rejectImage) {
    return {
      decision: "fallback",
      status: PREVIEW_STATUS.FALLBACK,
      confidence: PREVIEW_CONFIDENCE.LOW,
      rejectionReason,
      reason: "Low-information preview",
      acceptImage: false,
    };
  }

  if (rejectImage) {
    return {
      decision: "accept_without_image",
      status: PREVIEW_STATUS.READY,
      confidence: result.confidence,
      rejectionReason: PREVIEW_REJECTION_REASON.PLACEHOLDER_IMAGE,
      reason: "Preview image unavailable",
      acceptImage: false,
    };
  }

  return {
    decision: "accept",
    status: PREVIEW_STATUS.READY,
    confidence: result.confidence,
    rejectionReason: "",
    reason: "",
    acceptImage: true,
  };
}

module.exports = {
  isRejectedPreviewImageUrl,
  validateResolvedPreview,
};
