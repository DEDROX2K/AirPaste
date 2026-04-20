const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { createResolvedPreviewResult } = require("../result");
const { firstString, getUrlHostname, uniqueValues } = require("../utils");

function parseYouTubeVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname === "youtu.be") {
      return parsedUrl.pathname.slice(1);
    }

    if (!hostname.endsWith("youtube.com")) {
      return "";
    }

    if (parsedUrl.pathname === "/watch") {
      return parsedUrl.searchParams.get("v") ?? "";
    }

    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") {
      return segments[1] ?? "";
    }

    return "";
  } catch {
    return "";
  }
}

function isYouTubeShortSource(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    return hostname.endsWith("youtube.com") && parsedUrl.pathname.startsWith("/shorts/");
  } catch {
    return false;
  }
}

function extractVimeoVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const lastNumericSegment = [...segments].reverse().find((segment) => /^\d{4,12}$/.test(segment));
    return lastNumericSegment ?? "";
  } catch {
    return "";
  }
}

async function fetchOEmbed(url, endpoint, fetchJson) {
  const payload = await fetchJson(`${endpoint}${encodeURIComponent(url)}`);
  return payload && typeof payload === "object" ? payload : null;
}

function normalizeDurationSeconds(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? Math.round(numericValue)
    : null;
}

function buildVideoResult({
  kind,
  canonicalUrl,
  sourceType,
  siteName,
  title = "",
  description = "",
  candidateImageUrls = [],
  author = "",
  channelName = "",
  duration = null,
  metadata = {},
}) {
  return createResolvedPreviewResult({
    kind,
    confidence: candidateImageUrls.length > 0 ? PREVIEW_CONFIDENCE.HIGH : PREVIEW_CONFIDENCE.MEDIUM,
    status: PREVIEW_STATUS.READY,
    canonicalUrl,
    url: canonicalUrl,
    resolvedUrl: canonicalUrl,
    title,
    description,
    siteName,
    contentType: "video",
    sourceType,
    author,
    channelName: channelName || author,
    duration: normalizeDurationSeconds(duration),
    previewStatus: PREVIEW_STATUS.READY,
    candidateImageUrls,
    allowScreenshotFallback: false,
    metadata,
  });
}

async function resolveYouTubeVideoPreview(url, fetchJson, explicitSourceType = "") {
  const videoId = parseYouTubeVideoId(url);

  if (!videoId) {
    return null;
  }

  const sourceType = explicitSourceType || (isYouTubeShortSource(url) ? "youtube-shorts" : "youtube");
  const noembedPayload = await fetchOEmbed(url, "https://noembed.com/embed?url=", fetchJson);
  const youtubeOembedPayload = await fetchOEmbed(url, "https://www.youtube.com/oembed?format=json&url=", fetchJson);
  const title = firstString(noembedPayload?.title, youtubeOembedPayload?.title);
  const author = firstString(noembedPayload?.author_name, youtubeOembedPayload?.author_name);
  const candidateImageUrls = uniqueValues([
    noembedPayload?.thumbnail_url,
    youtubeOembedPayload?.thumbnail_url,
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  ]);
  const mediaAspectRatio = sourceType === "youtube-shorts" ? (9 / 16) : (16 / 9);

  return buildVideoResult({
    kind: PREVIEW_KIND.YOUTUBE_VIDEO,
    canonicalUrl: url,
    sourceType,
    siteName: "YouTube",
    title,
    candidateImageUrls,
    author,
    channelName: author,
    duration: noembedPayload?.duration,
    metadata: {
      provider: "youtube",
      videoId,
      mediaAspectRatio,
      metadataSource: noembedPayload ? "youtube-oembed+noembed" : "youtube-oembed",
      hasProviderMetadata: Boolean(title || author || noembedPayload?.duration),
    },
  });
}

async function resolveVimeoVideoPreview(url, fetchJson) {
  const hostname = getUrlHostname(url);

  if (!/(?:^|\.)vimeo\.com$/i.test(hostname)) {
    return null;
  }

  const payload = await fetchOEmbed(url, "https://vimeo.com/api/oembed.json?url=", fetchJson);
  const videoId = extractVimeoVideoId(url);

  if (!payload && !videoId) {
    return null;
  }

  return buildVideoResult({
    kind: PREVIEW_KIND.VIMEO_VIDEO,
    canonicalUrl: url,
    sourceType: "vimeo",
    siteName: firstString(payload?.provider_name, "Vimeo"),
    title: firstString(payload?.title),
    description: firstString(payload?.description),
    candidateImageUrls: uniqueValues([payload?.thumbnail_url]),
    author: firstString(payload?.author_name),
    channelName: firstString(payload?.author_name),
    duration: payload?.duration,
    metadata: {
      provider: "vimeo",
      videoId,
      mediaAspectRatio: Number.isFinite(payload?.width) && Number.isFinite(payload?.height) && payload.height > 0
        ? payload.width / payload.height
        : (16 / 9),
      metadataSource: payload ? "vimeo-oembed" : "vimeo-url",
      hasProviderMetadata: Boolean(payload),
    },
  });
}

async function resolveGenericVideoPreview(url, fetchJson) {
  const payload = await fetchOEmbed(url, "https://noembed.com/embed?url=", fetchJson);

  if (!payload) {
    return null;
  }

  const aspectRatio = Number.isFinite(payload.width) && Number.isFinite(payload.height) && payload.height > 0
    ? payload.width / payload.height
    : (16 / 9);

  return buildVideoResult({
    kind: PREVIEW_KIND.VIDEO_GENERIC,
    canonicalUrl: url,
    sourceType: "video-generic",
    siteName: firstString(payload.provider_name, payload.provider_url),
    title: firstString(payload.title),
    description: firstString(payload.description),
    candidateImageUrls: uniqueValues([payload.thumbnail_url]),
    author: firstString(payload.author_name),
    channelName: firstString(payload.author_name),
    duration: payload.duration,
    metadata: {
      provider: "noembed",
      mediaAspectRatio: aspectRatio,
      metadataSource: "noembed",
      hasProviderMetadata: true,
    },
  });
}

module.exports = {
  resolveGenericVideoPreview,
  resolveVimeoVideoPreview,
  resolveYouTubeVideoPreview,
};
