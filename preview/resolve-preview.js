const { classifyPreviewTarget } = require("./classification");
const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_REJECTION_REASON, PREVIEW_STATUS } = require("./constants");
const { createBlockedResult, createResolvedPreviewResult } = require("./result");
const { validateResolvedPreview } = require("./validation");
const { resolveAmazonProductPreview } = require("./resolvers/amazon");
const {
  acquirePreviewImage,
  capturePreviewScreenshot,
  closePreviewBrowser,
  fetchJson,
  resolveGenericLinkPreview,
} = require("./resolvers/generic");
const { resolveGitHubRepoPreview } = require("./resolvers/github");
const { resolvePinterestPinPreview } = require("./resolvers/pinterest");
const {
  resolveGenericVideoPreview,
  resolveVimeoVideoPreview,
  resolveYouTubeVideoPreview,
} = require("./resolvers/video");
const {
  resolveDirectImagePreview,
  resolveSpotifyPreview,
  resolveXPreview,
} = require("./resolvers/providers");
const { firstString, getHostname, normalizeExternalUrl } = require("./utils");

const PREVIEW_DEBUG_ENABLED = String(process.env.AIRPASTE_PREVIEW_DEBUG ?? "").trim() === "1";

function logPreviewDebug(event, payload) {
  if (!PREVIEW_DEBUG_ENABLED) {
    return;
  }

  console.debug(`[preview] ${event}`, payload);
}

function logTraceStep(step, status, detail = {}) {
  logPreviewDebug("trace-step", {
    step,
    status,
    ...detail,
  });
}

function logPreviewSummary(event, payload) {
  console.info(`[preview] ${event}`, payload);
}

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

  if (classification.resolverKey === "youtube" || classification.resolverKey === "youtube-shorts") {
    const providerResult = await resolveYouTubeVideoPreview(
      url,
      fetchJson,
      classification.sourceType === "youtube-shorts" ? "youtube-shorts" : "youtube",
    );

    if (providerResult) {
      logPreviewDebug("resolver-success", {
        resolverKey: classification.resolverKey,
        sourceType: providerResult.sourceType,
        path: "provider-youtube",
      });
      return {
        result: providerResult,
        documentSignals: {},
      };
    }

    logPreviewDebug("resolver-fallback", {
      resolverKey: classification.resolverKey,
      reason: "youtube_metadata_unavailable",
      path: "provider-youtube->generic",
    });
    const genericResult = await resolveGenericLinkPreview(url);
    return {
      result: {
        ...genericResult.result,
        kind: PREVIEW_KIND.YOUTUBE_VIDEO,
        contentType: "video",
        sourceType: classification.sourceType === "youtube-shorts" ? "youtube-shorts" : "youtube",
        metadata: {
          ...(genericResult.result?.metadata ?? {}),
          fallbackPath: "provider-youtube->generic",
          mediaAspectRatio: classification.sourceType === "youtube-shorts" ? (9 / 16) : (16 / 9),
        },
      },
      documentSignals: genericResult.documentSignals,
    };
  }

  if (classification.resolverKey === "vimeo") {
    const providerResult = await resolveVimeoVideoPreview(url, fetchJson);

    if (providerResult) {
      logPreviewDebug("resolver-success", {
        resolverKey: classification.resolverKey,
        sourceType: providerResult.sourceType,
        path: "provider-vimeo",
      });
      return {
        result: providerResult,
        documentSignals: {},
      };
    }

    logPreviewDebug("resolver-fallback", {
      resolverKey: classification.resolverKey,
      reason: "vimeo_metadata_unavailable",
      path: "provider-vimeo->generic",
    });
    const genericResult = await resolveGenericLinkPreview(url);
    return {
      result: {
        ...genericResult.result,
        kind: PREVIEW_KIND.VIMEO_VIDEO,
        contentType: "video",
        sourceType: "vimeo",
        metadata: {
          ...(genericResult.result?.metadata ?? {}),
          fallbackPath: "provider-vimeo->generic",
          mediaAspectRatio: 16 / 9,
        },
      },
      documentSignals: genericResult.documentSignals,
    };
  }

  if (classification.resolverKey === "video-generic") {
    const providerResult = await resolveGenericVideoPreview(url, fetchJson);

    if (providerResult) {
      logPreviewDebug("resolver-success", {
        resolverKey: classification.resolverKey,
        sourceType: providerResult.sourceType,
        path: "provider-noembed",
      });
      return {
        result: providerResult,
        documentSignals: {},
      };
    }

    logPreviewDebug("resolver-fallback", {
      resolverKey: classification.resolverKey,
      reason: "noembed_unavailable",
      path: "provider-noembed->generic",
    });
    const genericResult = await resolveGenericLinkPreview(url);
    return {
      result: {
        ...genericResult.result,
        kind: PREVIEW_KIND.VIDEO_GENERIC,
        contentType: "video",
        sourceType: "video-generic",
        metadata: {
          ...(genericResult.result?.metadata ?? {}),
          fallbackPath: "provider-noembed->generic",
          mediaAspectRatio: 16 / 9,
        },
      },
      documentSignals: genericResult.documentSignals,
    };
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
    return {
      image: result.image || result.candidateImageUrls?.[0] || "",
      chosenImageUrl: result.image ? (result.canonicalUrl || result.candidateImageUrls?.[0] || "") : (result.candidateImageUrls?.[0] || ""),
      attemptedCandidateUrls: result.candidateImageUrls ?? [],
      screenshotFallbackUsed: false,
    };
  }

  if (!validation.acceptImage) {
    return {
      image: "",
      chosenImageUrl: "",
      attemptedCandidateUrls: result.candidateImageUrls ?? [],
      screenshotFallbackUsed: false,
    };
  }

  const acquisition = await acquirePreviewImage(result.candidateImageUrls ?? []);
  logPreviewDebug("image-acquisition", {
    canonicalUrl: result.canonicalUrl,
    attemptedCandidateUrls: acquisition.attemptedCandidateUrls,
    chosenImageUrl: acquisition.chosenImageUrl,
    hasImage: Boolean(acquisition.image),
  });

  if (acquisition.image) {
    const preferRemoteVideoThumbnail = result.contentType === "video"
      && typeof acquisition.chosenImageUrl === "string"
      && acquisition.chosenImageUrl.trim().length > 0;

    return {
      image: preferRemoteVideoThumbnail ? acquisition.chosenImageUrl : acquisition.image,
      chosenImageUrl: acquisition.chosenImageUrl,
      attemptedCandidateUrls: acquisition.attemptedCandidateUrls,
      screenshotFallbackUsed: false,
    };
  }

  if (result.allowScreenshotFallback) {
    const screenshotImage = await capturePreviewScreenshot(result.canonicalUrl);
    return {
      image: screenshotImage,
      chosenImageUrl: "",
      attemptedCandidateUrls: acquisition.attemptedCandidateUrls,
      screenshotFallbackUsed: Boolean(screenshotImage),
    };
  }

  return {
    image: "",
    chosenImageUrl: acquisition.chosenImageUrl,
    attemptedCandidateUrls: acquisition.attemptedCandidateUrls,
    screenshotFallbackUsed: false,
  };
}

function buildPreviewDiagnostics({
  inputUrl,
  classification,
  result,
  validation,
  imageAcquisition,
  documentSignals,
  trace = [],
  error = null,
}) {
  const bodyText = typeof documentSignals?.bodyText === "string"
    ? documentSignals.bodyText.slice(0, 320)
    : "";

  return {
    schemaVersion: 1,
    originalUrl: inputUrl,
    canonicalUrl: result.canonicalUrl || "",
    classification: classification.classification || "",
    resolverKey: classification.resolverKey || "",
    previewStatus: result.status || "",
    reason: result.reason || validation.reason || "",
    rejectionReason: result.rejectionReason || validation.rejectionReason || "",
    title: result.title || "",
    description: result.description || "",
    siteName: result.siteName || "",
    contentType: result.contentType || "",
    sourceType: result.sourceType || "",
    resolvedUrl: result.resolvedUrl || result.canonicalUrl || "",
    duration: Number.isFinite(result.duration) ? result.duration : null,
    author: result.author || "",
    channelName: result.channelName || "",
    candidateImageUrls: imageAcquisition?.attemptedCandidateUrls?.length
      ? imageAcquisition.attemptedCandidateUrls
      : (result.candidateImageUrls ?? []),
    chosenFinalImageUrl: imageAcquisition?.chosenImageUrl || "",
    allowScreenshotFallback: result.allowScreenshotFallback === true,
    screenshotFallbackUsed: imageAcquisition?.screenshotFallbackUsed === true,
    documentSignals: {
      pageTitle: documentSignals?.pageTitle || "",
      ogTitle: documentSignals?.ogTitle || "",
      ogDescription: documentSignals?.ogDescription || "",
      ogImageUrl: documentSignals?.ogImageUrl || "",
      faviconUrl: documentSignals?.faviconUrl || "",
      bodyTextExcerpt: bodyText,
    },
    resolverMetadata: result.metadata ?? {},
    trace: Array.isArray(trace) ? trace : [],
    ...(error
      ? {
        error: {
          message: error.message || "Preview resolution failed",
          ...(process.env.NODE_ENV !== "production" && error.stack
            ? { stack: error.stack }
            : {}),
        },
      }
      : {}),
  };
}

async function resolveUrlToPreview(url) {
  const normalizedUrl = normalizeExternalUrl(url);
  const trace = [];
  const traceStep = (step, status, detail = {}) => {
    trace.push({
      ts: new Date().toISOString(),
      step,
      status,
      ...detail,
    });
    logTraceStep(step, status, detail);
  };

  if (!normalizedUrl) {
    traceStep("normalize-url", "error", { reason: "invalid_url" });
    return createBlockedResult("", PREVIEW_REJECTION_REASON.UNKNOWN, {
      status: PREVIEW_STATUS.ERROR,
      reason: "Preview resolution failed",
    });
  }

  try {
    traceStep("normalize-url", "ok", { canonicalUrl: normalizedUrl });
    const classification = classifyPreviewTarget(normalizedUrl);
    traceStep("classify", "ok", {
      resolverKey: classification.resolverKey,
      classification: classification.classification,
      contentType: classification.contentType || "link",
      sourceType: classification.sourceType || "generic-link",
    });
    logPreviewDebug("classification", classification);
    const { result: baseResult, documentSignals } = await selectResolver(classification, normalizedUrl);
    traceStep("resolve", "ok", {
      resolverKey: classification.resolverKey,
      resolvedKind: classification.resolvedKind || "",
    });
    logPreviewDebug("resolver-selection", {
      resolverKey: classification.resolverKey,
      classification: classification.classification,
      canonicalUrl: normalizedUrl,
      resolvedKind: classification.resolvedKind || "",
    });
    const result = baseResult ?? createResolvedPreviewResult({
      kind: PREVIEW_KIND.FALLBACK_LINK,
      status: PREVIEW_STATUS.FALLBACK,
      canonicalUrl: normalizedUrl,
    });
    traceStep("resolve-source", "ok", {
      contentType: result.contentType || classification.contentType || "link",
      sourceType: result.sourceType || classification.sourceType || "generic-link",
    });
    const validation = validateResolvedPreview(result, documentSignals);
    traceStep("validate", "ok", {
      status: validation.status,
      reason: validation.reason || "",
      rejectionReason: validation.rejectionReason || "",
      acceptImage: Boolean(validation.acceptImage),
    });
    logPreviewDebug("validation", validation);
    const imageAcquisition = await applyImageAcquisition(result, validation);
    traceStep("acquire-image", imageAcquisition.image ? "ok" : "warn", {
      attemptedCount: Array.isArray(imageAcquisition.attemptedCandidateUrls)
        ? imageAcquisition.attemptedCandidateUrls.length
        : 0,
      usedScreenshotFallback: imageAcquisition.screenshotFallbackUsed === true,
      hasImage: Boolean(imageAcquisition.image),
    });
    const title = firstString(result.title, documentSignals?.ogTitle, documentSignals?.pageTitle);
    const siteName = firstString(result.siteName, getHostname(result.canonicalUrl || normalizedUrl));
    const description = validation.status === PREVIEW_STATUS.BLOCKED
      ? ""
      : firstString(result.description, documentSignals?.ogDescription);
    const finalStatus = validation.status === PREVIEW_STATUS.READY && !imageAcquisition.image && result.kind !== PREVIEW_KIND.IMAGE
      ? PREVIEW_STATUS.FALLBACK
      : validation.status;
    const diagnostics = buildPreviewDiagnostics({
      inputUrl: normalizedUrl,
      classification,
      result,
      validation,
      imageAcquisition,
      documentSignals,
      trace,
    });
    traceStep("finalize", "ok", {
      finalStatus,
      hasImage: Boolean(imageAcquisition.image),
    });
    logPreviewSummary("pipeline-complete", {
      url: normalizedUrl,
      status: finalStatus,
      contentType: result.contentType || classification.contentType || "link",
      sourceType: result.sourceType || classification.sourceType || "generic-link",
      chosenImageUrl: diagnostics.chosenFinalImageUrl || "",
    });

    return createResolvedPreviewResult({
      ...result,
      confidence: validation.confidence || result.confidence || PREVIEW_CONFIDENCE.LOW,
      status: result.status === PREVIEW_STATUS.ERROR ? PREVIEW_STATUS.ERROR : finalStatus,
      reason: result.status === PREVIEW_STATUS.ERROR
        ? result.reason || "Preview resolution failed"
        : (validation.reason || (!imageAcquisition.image && finalStatus === PREVIEW_STATUS.FALLBACK ? "Preview image unavailable" : "")),
      rejectionReason: validation.rejectionReason || result.rejectionReason || "",
      canonicalUrl: result.canonicalUrl || normalizedUrl,
      url: result.url || normalizedUrl,
      resolvedUrl: result.resolvedUrl || result.canonicalUrl || normalizedUrl,
      title: title || siteName,
      description,
      image: imageAcquisition.image || "",
      siteName,
      contentType: result.contentType || classification.contentType || "link",
      sourceType: result.sourceType || classification.sourceType || "generic-link",
      duration: Number.isFinite(result.duration) ? result.duration : null,
      author: result.author || "",
      channelName: firstString(result.channelName, result.author),
      previewStatus: finalStatus,
      favicon: result.favicon || "",
      diagnostics,
      metadata: {
        classification: classification.classification,
        ...result.metadata,
      },
    });
  } catch (error) {
    const classification = classifyPreviewTarget(normalizedUrl);
    traceStep("resolve", "error", {
      message: error?.message || "Preview resolution failed",
    });
    logPreviewSummary("pipeline-error", {
      url: normalizedUrl,
      message: error?.message || "Preview resolution failed",
    });
    const diagnostics = buildPreviewDiagnostics({
      inputUrl: normalizedUrl,
      classification,
      result: createResolvedPreviewResult({
        canonicalUrl: normalizedUrl,
      }),
      validation: {
        reason: "Preview resolution failed",
        rejectionReason: PREVIEW_REJECTION_REASON.UNKNOWN,
      },
      imageAcquisition: {
        attemptedCandidateUrls: [],
        chosenImageUrl: "",
        screenshotFallbackUsed: false,
      },
      documentSignals: {},
      trace,
      error,
    });
    return createResolvedPreviewResult({
      kind: PREVIEW_KIND.FALLBACK_LINK,
      confidence: PREVIEW_CONFIDENCE.LOW,
      status: PREVIEW_STATUS.ERROR,
      reason: "Preview resolution failed",
      rejectionReason: PREVIEW_REJECTION_REASON.UNKNOWN,
      canonicalUrl: normalizedUrl,
      url: normalizedUrl,
      resolvedUrl: normalizedUrl,
      title: getHostname(normalizedUrl),
      siteName: getHostname(normalizedUrl),
      contentType: classification.contentType || "link",
      sourceType: classification.sourceType || "generic-link",
      previewStatus: PREVIEW_STATUS.ERROR,
      diagnostics,
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
