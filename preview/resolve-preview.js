const { classifyPreviewTarget } = require("./classification");
const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_REJECTION_REASON, PREVIEW_STATUS } = require("./constants");
const { createBlockedResult, createResolvedPreviewResult } = require("./result");
const { validateResolvedPreview } = require("./validation");
const { resolveAmazonProductPreview } = require("./resolvers/amazon");
const {
  capturePreviewScreenshot,
  closePreviewBrowser,
  fetchJson,
  resolveGenericLinkPreview,
  resolvePreviewImage,
} = require("./resolvers/generic");
const { resolveGitHubRepoPreview } = require("./resolvers/github");
const { resolvePinterestPinPreview } = require("./resolvers/pinterest");
const {
  resolveDirectImagePreview,
  resolveSpotifyPreview,
  resolveXPreview,
  resolveYouTubePreview,
} = require("./resolvers/providers");
const { firstString, getHostname, normalizeExternalUrl } = require("./utils");

async function selectResolver(classification, url) {
  if (classification.resolverKey === "blocked") {
    return {
      result: createBlockedResult(url, classification.reason),
      documentSignals: {},
    };
  }

  if (classification.resolverKey === "image") {
    return {
      result: await resolveDirectImagePreview(url),
      documentSignals: {},
    };
  }

  if (classification.resolverKey === "amazon") {
    return {
      result: await resolveAmazonProductPreview(url),
      documentSignals: {},
    };
  }

  if (classification.resolverKey === "youtube") {
    const providerResult = await resolveYouTubePreview(url);

    if (providerResult) {
      return {
        result: providerResult,
        documentSignals: {},
      };
    }
  }

  if (classification.resolverKey === "x") {
    const providerResult = await resolveXPreview(url, fetchJson);

    if (providerResult) {
      return {
        result: providerResult,
        documentSignals: {},
      };
    }
  }

  if (classification.resolverKey === "github") {
    return resolveGitHubRepoPreview(url, resolveGenericLinkPreview);
  }

  if (classification.resolverKey === "pinterest") {
    return {
      result: await resolvePinterestPinPreview(url),
      documentSignals: {},
    };
  }

  const spotifyResult = await resolveSpotifyPreview(url, fetchJson);

  if (spotifyResult) {
    return {
      result: spotifyResult,
      documentSignals: {},
    };
  }

  return resolveGenericLinkPreview(url);
}

async function applyImageAcquisition(result, validation) {
  if (result.kind === PREVIEW_KIND.IMAGE) {
    return result.image || result.candidateImageUrls?.[0] || "";
  }

  if (!validation.acceptImage) {
    return "";
  }

  const image = await resolvePreviewImage(result.candidateImageUrls ?? []);

  if (image) {
    return image;
  }

  if (result.allowScreenshotFallback) {
    return capturePreviewScreenshot(result.canonicalUrl);
  }

  return "";
}

async function resolveUrlToPreview(url) {
  const normalizedUrl = normalizeExternalUrl(url);

  if (!normalizedUrl) {
    return createBlockedResult("", PREVIEW_REJECTION_REASON.UNKNOWN, {
      status: PREVIEW_STATUS.ERROR,
      reason: "Preview resolution failed",
    });
  }

  try {
    const classification = classifyPreviewTarget(normalizedUrl);
    const { result: baseResult, documentSignals } = await selectResolver(classification, normalizedUrl);
    const result = baseResult ?? createResolvedPreviewResult({
      kind: PREVIEW_KIND.FALLBACK_LINK,
      status: PREVIEW_STATUS.FALLBACK,
      canonicalUrl: normalizedUrl,
    });
    const validation = validateResolvedPreview(result, documentSignals);
    const image = await applyImageAcquisition(result, validation);
    const title = firstString(result.title, documentSignals?.ogTitle, documentSignals?.pageTitle);
    const siteName = firstString(result.siteName, getHostname(result.canonicalUrl || normalizedUrl));
    const description = validation.status === PREVIEW_STATUS.BLOCKED
      ? ""
      : firstString(result.description, documentSignals?.ogDescription);
    const finalStatus = validation.status === PREVIEW_STATUS.READY && !image && result.kind !== PREVIEW_KIND.IMAGE
      ? PREVIEW_STATUS.FALLBACK
      : validation.status;

    return createResolvedPreviewResult({
      ...result,
      confidence: validation.confidence || result.confidence || PREVIEW_CONFIDENCE.LOW,
      status: result.status === PREVIEW_STATUS.ERROR ? PREVIEW_STATUS.ERROR : finalStatus,
      reason: result.status === PREVIEW_STATUS.ERROR
        ? result.reason || "Preview resolution failed"
        : (validation.reason || (!image && finalStatus === PREVIEW_STATUS.FALLBACK ? "Preview image unavailable" : "")),
      rejectionReason: validation.rejectionReason || result.rejectionReason || "",
      canonicalUrl: result.canonicalUrl || normalizedUrl,
      title: title || siteName,
      description,
      image: image || "",
      siteName,
      favicon: result.favicon || "",
      metadata: {
        classification: classification.classification,
        ...result.metadata,
      },
    });
  } catch {
    return createResolvedPreviewResult({
      kind: PREVIEW_KIND.FALLBACK_LINK,
      confidence: PREVIEW_CONFIDENCE.LOW,
      status: PREVIEW_STATUS.ERROR,
      reason: "Preview resolution failed",
      rejectionReason: PREVIEW_REJECTION_REASON.UNKNOWN,
      canonicalUrl: normalizedUrl,
      title: getHostname(normalizedUrl),
      siteName: getHostname(normalizedUrl),
      metadata: {
        classification: "error",
      },
    });
  }
}

module.exports = {
  closePreviewBrowser,
  resolveUrlToPreview,
};
