const { MUSIC_HOSTS } = require("./constants");

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function uniqueValues(values) {
  return [...new Set(
    values
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function getUrlHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function resolveUrl(input, baseUrl) {
  const value = firstString(input);

  if (!value) {
    return "";
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function normalizeExternalUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Fall through and try https.
  }

  try {
    return new URL(`https://${trimmed}`).toString();
  } catch {
    return "";
  }
}

function isMusicHost(url) {
  const hostname = getUrlHostname(url);
  return MUSIC_HOSTS.some((musicHost) => hostname === musicHost || hostname.endsWith(`.${musicHost}`));
}

function cleanPreviewText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizePreviewText(value) {
  return cleanPreviewText(value).toLowerCase();
}

function normalizeImageCandidate(candidate, baseUrl) {
  if (!candidate) {
    return null;
  }

  if (typeof candidate === "string") {
    const url = resolveUrl(candidate, baseUrl);
    return url ? { url, width: 0, height: 0 } : null;
  }

  if (typeof candidate !== "object") {
    return null;
  }

  const url = resolveUrl(
    firstString(candidate.url, candidate.secureUrl, candidate.secureURL),
    baseUrl,
  );

  if (!url) {
    return null;
  }

  const width = Number.parseInt(candidate.width, 10);
  const height = Number.parseInt(candidate.height, 10);

  return {
    url,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

function getImageCandidates(result, url) {
  const entries = [];
  const rawCandidates = [
    result?.ogImage,
    result?.twitterImage,
    result?.ogImage?.url,
    result?.twitterImage?.url,
  ].flat();

  for (const candidate of rawCandidates) {
    if (Array.isArray(candidate)) {
      for (const nestedCandidate of candidate) {
        const normalized = normalizeImageCandidate(nestedCandidate, url);
        if (normalized?.url) {
          entries.push(normalized);
        }
      }
      continue;
    }

    const normalized = normalizeImageCandidate(candidate, url);
    if (normalized?.url) {
      entries.push(normalized);
    }
  }

  return entries;
}

function scoreImageCandidate(candidate) {
  if (!candidate?.url) {
    return -1;
  }

  const largestSide = Math.max(candidate.width || 0, candidate.height || 0);
  const squareness = candidate.width > 0 && candidate.height > 0
    ? 1 - Math.abs(candidate.width - candidate.height) / Math.max(candidate.width, candidate.height)
    : 0.4;

  return largestSide + squareness * 500;
}

module.exports = {
  cleanPreviewText,
  firstString,
  getHostname,
  getImageCandidates,
  getUrlHostname,
  isMusicHost,
  normalizeExternalUrl,
  normalizePreviewText,
  resolveUrl,
  scoreImageCandidate,
  uniqueValues,
};
