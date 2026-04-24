const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { createResolvedPreviewResult } = require("../result");
const { firstString, getHostname, getUrlHostname, uniqueValues } = require("../utils");

function isSpotifyHost(url) {
  return /(?:^|\.)spotify(?:\.com|\.link)$/i.test(getUrlHostname(url));
}

function parseTweetIdentity(url) {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (segments.length < 3) {
      return null;
    }

    const statusIndex = segments.findIndex((segment) => segment === "status");

    if (statusIndex < 1 || statusIndex === segments.length - 1) {
      return null;
    }

    return {
      username: segments[statusIndex - 1],
      tweetId: segments[statusIndex + 1],
    };
  } catch {
    return null;
  }
}

function isLikelyPreviewImageUrl(url) {
  if (!url) {
    return false;
  }

  const normalizedUrl = String(url).toLowerCase();

  if (
    normalizedUrl.includes(".mp4")
    || normalizedUrl.includes(".m3u8")
    || normalizedUrl.includes(".mov")
    || normalizedUrl.includes("video.twimg.com/")
    || normalizedUrl.includes("/amplify_video/")
    || normalizedUrl.includes("/tweet_video/")
  ) {
    return false;
  }

  return /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(normalizedUrl)
    || normalizedUrl.includes("pbs.twimg.com/media/")
    || normalizedUrl.includes("pbs.twimg.com/ext_tw_video_thumb/")
    || normalizedUrl.includes("i.pinimg.com/")
    || normalizedUrl.includes("i.ytimg.com/");
}

async function resolveDirectImagePreview(url) {
  return createResolvedPreviewResult({
    kind: PREVIEW_KIND.IMAGE,
    confidence: PREVIEW_CONFIDENCE.HIGH,
    status: PREVIEW_STATUS.READY,
    canonicalUrl: url,
    title: "",
    siteName: getHostname(url),
    image: url,
    candidateImageUrls: [url],
    metadata: {
      contentClass: "direct-image",
    },
  });
}

async function resolveSpotifyPreview(url, fetchJson) {
  if (!isSpotifyHost(url)) {
    return null;
  }

  const payload = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);

  if (!payload?.thumbnail_url) {
    return null;
  }

  return createResolvedPreviewResult({
    kind: PREVIEW_KIND.GENERIC_LINK,
    confidence: PREVIEW_CONFIDENCE.HIGH,
    status: PREVIEW_STATUS.READY,
    canonicalUrl: url,
    title: firstString(payload.title),
    siteName: firstString(payload.provider_name, "Spotify"),
    candidateImageUrls: [payload.thumbnail_url],
    previewKind: "music",
    allowScreenshotFallback: false,
    metadata: {
      provider: "spotify",
    },
  });
}

async function resolveXPreview(url, fetchJson) {
  const identity = parseTweetIdentity(url);

  if (!identity?.tweetId) {
    return null;
  }

  const payload = await fetchJson(`https://api.vxtwitter.com/${identity.username}/status/${identity.tweetId}`);

  if (!payload) {
    return null;
  }

  const mediaUrls = uniqueValues([
    ...(Array.isArray(payload.media_extended)
      ? payload.media_extended.flatMap((media) => [
        media?.thumbnail_url,
        media?.image,
        media?.url,
      ])
      : []),
    ...(Array.isArray(payload.mediaURLs) ? payload.mediaURLs : []),
  ]).filter((candidateUrl) => isLikelyPreviewImageUrl(candidateUrl));

  return createResolvedPreviewResult({
    kind: PREVIEW_KIND.X_POST,
    confidence: mediaUrls.length > 0 ? PREVIEW_CONFIDENCE.MEDIUM : PREVIEW_CONFIDENCE.LOW,
    status: PREVIEW_STATUS.READY,
    canonicalUrl: url,
    contentType: "video",
    sourceType: "x",
    description: firstString(payload.text),
    siteName: "X (formerly Twitter)",
    candidateImageUrls: mediaUrls,
    allowScreenshotFallback: false,
    metadata: {
      username: identity.username,
      tweetId: identity.tweetId,
    },
  });
}

module.exports = {
  resolveDirectImagePreview,
  resolveSpotifyPreview,
  resolveXPreview,
};
