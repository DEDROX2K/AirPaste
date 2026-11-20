const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { createResolvedPreviewResult } = require("../result");
const { firstString, getHostname, getUrlHostname } = require("../utils");

function isSpotifyHost(url) {
  return /(?:^|\.)spotify(?:\.com|\.link)$/i.test(getUrlHostname(url));
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

module.exports = {
  resolveDirectImagePreview,
  resolveSpotifyPreview,
};
