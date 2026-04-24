const { PREVIEW_KIND, PREVIEW_REJECTION_REASON } = require("./constants");
const { getUrlHostname } = require("./utils");

function isDirectImageUrl(url) {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(url);
}

function isAmazonHost(url) {
  return /(?:^|\.)((?:smile\.)?amazon\.[a-z.]+)$/i.test(getUrlHostname(url));
}

function isYouTubeHost(url) {
  return /(?:^|\.)youtube\.com$/i.test(getUrlHostname(url)) || /(?:^|\.)youtu\.be$/i.test(getUrlHostname(url));
}

function isVimeoHost(url) {
  return /(?:^|\.)vimeo\.com$/i.test(getUrlHostname(url));
}

function isYouTubeWatchUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    return hostname.endsWith("youtube.com") && parsedUrl.pathname === "/watch" && Boolean(parsedUrl.searchParams.get("v"));
  } catch {
    return false;
  }
}

function isYouTubeShortUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    return hostname.endsWith("youtube.com") && /^\/shorts\/[^/]+/i.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

function isYouTubeShortHostUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.toLowerCase() === "youtu.be" && parsedUrl.pathname.length > 1;
  } catch {
    return false;
  }
}

const VIDEO_GENERIC_HOST_PATTERNS = Object.freeze([
  /(?:^|\.)dailymotion\.com$/i,
  /(?:^|\.)tiktok\.com$/i,
  /(?:^|\.)vm\.tiktok\.com$/i,
  /(?:^|\.)twitch\.tv$/i,
  /(?:^|\.)clips\.twitch\.tv$/i,
  /(?:^|\.)streamable\.com$/i,
  /(?:^|\.)loom\.com$/i,
  /(?:^|\.)wistia\.(?:com|net)$/i,
  /(?:^|\.)vidyard\.com$/i,
  /(?:^|\.)jwplayer\.com$/i,
  /(?:^|\.)rumble\.com$/i,
  /(?:^|\.)brightcove\.com$/i,
  /(?:^|\.)kick\.com$/i,
]);

function isGenericVideoHost(url) {
  const hostname = getUrlHostname(url);
  return VIDEO_GENERIC_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isTwitterHost(url) {
  return /(?:^|\.)x\.com$/i.test(getUrlHostname(url)) || /(?:^|\.)twitter\.com$/i.test(getUrlHostname(url));
}

function isPinterestHost(url) {
  const hostname = getUrlHostname(url);
  return hostname === "pinterest.com" || hostname.endsWith(".pinterest.com");
}

function extractPinterestPinId(url) {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.pathname.match(/\/pin\/(\d+)(?:\/|$)/i);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

function classifyGitHubRepo(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname !== "github.com" && hostname !== "www.github.com") {
      return false;
    }

    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    return segments.length >= 2 && segments[0] !== "orgs" && segments[0] !== "topics";
  } catch {
    return false;
  }
}

function classifyPreviewTarget(url) {
  if (!url) {
    return {
      classification: "blocked",
      resolverKey: "blocked",
      reason: PREVIEW_REJECTION_REASON.UNKNOWN,
    };
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return {
        classification: "blocked",
        resolverKey: "blocked",
        reason: PREVIEW_REJECTION_REASON.UNSUPPORTED_DOMAIN,
      };
    }
  } catch {
    return {
      classification: "blocked",
      resolverKey: "blocked",
      reason: PREVIEW_REJECTION_REASON.UNKNOWN,
    };
  }

  if (isDirectImageUrl(url)) {
    return {
      classification: "direct-image",
      resolverKey: "image",
      resolvedKind: PREVIEW_KIND.IMAGE,
    };
  }

  if (isAmazonHost(url)) {
    return {
      classification: "amazon-product",
      resolverKey: "amazon",
      resolvedKind: PREVIEW_KIND.AMAZON_PRODUCT,
    };
  }

  if (classifyGitHubRepo(url)) {
    return {
      classification: "github-repo",
      resolverKey: "github",
      resolvedKind: PREVIEW_KIND.GITHUB_REPO,
    };
  }

  if (isYouTubeShortUrl(url)) {
    return {
      classification: "youtube-shorts-video",
      resolverKey: "youtube-shorts",
      resolvedKind: PREVIEW_KIND.YOUTUBE_VIDEO,
      contentType: "video",
      sourceType: "youtube-shorts",
    };
  }

  if (isYouTubeWatchUrl(url) || isYouTubeShortHostUrl(url)) {
    return {
      classification: "youtube-video",
      resolverKey: "youtube",
      resolvedKind: PREVIEW_KIND.YOUTUBE_VIDEO,
      contentType: "video",
      sourceType: "youtube",
    };
  }

  if (isVimeoHost(url)) {
    return {
      classification: "vimeo-video",
      resolverKey: "vimeo",
      resolvedKind: PREVIEW_KIND.VIMEO_VIDEO,
      contentType: "video",
      sourceType: "vimeo",
    };
  }

  if (isPinterestHost(url) && extractPinterestPinId(url)) {
    return {
      classification: "pinterest-pin",
      resolverKey: "pinterest",
      resolvedKind: PREVIEW_KIND.PINTEREST_PIN,
      pinId: extractPinterestPinId(url),
    };
  }

  if (isTwitterHost(url)) {
    return {
      classification: "tweet",
      resolverKey: "x",
      resolvedKind: PREVIEW_KIND.X_POST,
      contentType: "video",
      sourceType: "x",
    };
  }

  if (isGenericVideoHost(url)) {
    return {
      classification: "generic-video",
      resolverKey: "video-generic",
      resolvedKind: PREVIEW_KIND.VIDEO_GENERIC,
      contentType: "video",
      sourceType: "video-generic",
    };
  }

  return {
    classification: "generic-webpage",
    resolverKey: "generic",
    resolvedKind: PREVIEW_KIND.GENERIC_LINK,
  };
}

module.exports = {
  classifyPreviewTarget,
  isAmazonHost,
  isDirectImageUrl,
  extractPinterestPinId,
  isPinterestHost,
  isTwitterHost,
  isVimeoHost,
  isYouTubeHost,
};
