const cheerio = require("cheerio");
const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { createResolvedPreviewResult } = require("../result");
const { firstString, getHostname, resolveUrl, uniqueValues } = require("../utils");
const { extractPinterestPinId } = require("../classification");

function normalizePinterestPinUrl(url) {
  const pinId = extractPinterestPinId(url);
  return pinId ? `https://www.pinterest.com/pin/${pinId}/` : url;
}

function isPinterestImageHost(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "i.pinimg.com" || hostname.endsWith(".pinimg.com");
  } catch {
    return false;
  }
}

function upgradePinterestImageUrl(url) {
  if (!url) {
    return "";
  }

  return url.replace(/i\.pinimg\.com\/(?:\d+x|\d+x\d+_RS)\//i, "i.pinimg.com/originals/");
}

function isRejectedPinterestImageUrl(url) {
  const normalizedUrl = String(url ?? "").toLowerCase();

  if (!normalizedUrl) {
    return true;
  }

  return normalizedUrl.includes("logo")
    || normalizedUrl.includes("favicon")
    || normalizedUrl.includes("avatar")
    || normalizedUrl.includes("sprite")
    || normalizedUrl.includes("placeholder")
    || normalizedUrl.includes("default")
    || normalizedUrl.includes("/static/")
    || normalizedUrl.includes("/images/user/")
    || normalizedUrl.includes("pinterest-logo")
    || normalizedUrl.includes("pinterestapp")
    || normalizedUrl.includes("1x1")
    || normalizedUrl.includes("75x75")
    || normalizedUrl.includes("140x140")
    || normalizedUrl.includes("236x")
    || !isPinterestImageHost(normalizedUrl);
}

function scorePinterestImageUrl(url) {
  const normalizedUrl = String(url ?? "").toLowerCase();

  if (!normalizedUrl) {
    return -1;
  }

  let score = 0;

  if (normalizedUrl.includes("/originals/")) {
    score += 100;
  }

  if (normalizedUrl.includes("/736x/")) {
    score += 70;
  }

  if (normalizedUrl.includes("/564x/")) {
    score += 50;
  }

  if (normalizedUrl.includes("/474x/")) {
    score += 30;
  }

  if (normalizedUrl.includes("/236x/")) {
    score -= 50;
  }

  if (normalizedUrl.match(/\/\d+x\d+_rs\//i)) {
    score -= 40;
  }

  return score;
}

function findJsonLdPinCandidates(payload, candidates = []) {
  if (!payload) {
    return candidates;
  }

  if (Array.isArray(payload)) {
    payload.forEach((entry) => findJsonLdPinCandidates(entry, candidates));
    return candidates;
  }

  if (typeof payload !== "object") {
    return candidates;
  }

  const image = payload.image;
  const title = firstString(payload.name, payload.headline);
  const description = firstString(payload.description, payload.caption, payload.articleBody);

  if (typeof image === "string" || Array.isArray(image) || (image && typeof image === "object")) {
    const imageCandidates = [];

    if (typeof image === "string") {
      imageCandidates.push(image);
    } else if (Array.isArray(image)) {
      image.forEach((entry) => {
        if (typeof entry === "string") {
          imageCandidates.push(entry);
        } else if (entry && typeof entry === "object") {
          imageCandidates.push(firstString(entry.url, entry.contentUrl));
        }
      });
    } else {
      imageCandidates.push(firstString(image.url, image.contentUrl));
    }

    candidates.push({
      title,
      description,
      imageCandidates,
    });
  }

  Object.values(payload).forEach((value) => {
    if (value && typeof value === "object") {
      findJsonLdPinCandidates(value, candidates);
    }
  });

  return candidates;
}

function extractPinterestDocumentData(html, finalUrl) {
  const $ = cheerio.load(html);
  const jsonLdEntries = $("script[type='application/ld+json']").toArray()
    .flatMap((node) => {
      try {
        return [JSON.parse($(node).text())];
      } catch {
        return [];
      }
    });
  const jsonLdCandidates = jsonLdEntries.flatMap((entry) => findJsonLdPinCandidates(entry));
  const stableImageCandidates = [
    $("meta[property='og:image']").attr("content"),
    $("meta[name='twitter:image']").attr("content"),
    $("meta[property='twitter:image']").attr("content"),
    $("meta[property='pin:media']").attr("content"),
    $("meta[name='pin:media']").attr("content"),
    $("img[src*='pinimg.com']").first().attr("src"),
    $("source[srcset*='pinimg.com']").first().attr("srcset")?.split(",")?.pop()?.trim()?.split(" ")?.[0],
    ...jsonLdCandidates.flatMap((entry) => entry.imageCandidates),
  ]
    .map((candidate) => upgradePinterestImageUrl(resolveUrl(candidate, finalUrl)))
    .filter(Boolean);

  const imageCandidates = uniqueValues(stableImageCandidates)
    .filter((candidate) => !isRejectedPinterestImageUrl(candidate))
    .sort((left, right) => scorePinterestImageUrl(right) - scorePinterestImageUrl(left));
  const bestJsonLd = jsonLdCandidates.find((entry) => entry.title || entry.description) ?? null;

  return {
    title: firstString(
      $("meta[property='og:title']").attr("content"),
      $("meta[name='twitter:title']").attr("content"),
      bestJsonLd?.title,
      $("title").first().text(),
    ),
    description: firstString(
      $("meta[property='og:description']").attr("content"),
      $("meta[name='twitter:description']").attr("content"),
      bestJsonLd?.description,
      $("meta[name='description']").attr("content"),
    ),
    imageCandidates,
    favicon: resolveUrl(
      firstString(
        $("link[rel='icon']").attr("href"),
        $("link[rel='shortcut icon']").attr("href"),
      ),
      finalUrl,
    ),
  };
}

async function resolvePinterestPinPreview(url) {
  const pinId = extractPinterestPinId(url);

  if (!pinId) {
    return null;
  }

  const canonicalUrl = normalizePinterestPinUrl(url);

  try {
    const response = await fetch(canonicalUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const finalUrl = response.url || canonicalUrl;
    const html = response.ok ? await response.text() : "";
    const isPinPage = /\/pin\/\d+(?:\/|$)/i.test(finalUrl);
    const extracted = html ? extractPinterestDocumentData(html, finalUrl) : {
      title: "",
      description: "",
      imageCandidates: [],
      favicon: "",
    };
    const bestImage = extracted.imageCandidates[0] ?? "";

    if (!response.ok || !isPinPage) {
      return createResolvedPreviewResult({
        kind: PREVIEW_KIND.PINTEREST_PIN,
        confidence: PREVIEW_CONFIDENCE.LOW,
        status: PREVIEW_STATUS.FALLBACK,
        canonicalUrl,
        title: extracted.title || "Pinterest pin",
        description: extracted.description,
        siteName: "Pinterest",
        favicon: extracted.favicon,
        allowScreenshotFallback: false,
        metadata: {
          pinId,
          sourceHost: getHostname(finalUrl || canonicalUrl),
        },
      });
    }

    return createResolvedPreviewResult({
      kind: PREVIEW_KIND.PINTEREST_PIN,
      confidence: bestImage ? PREVIEW_CONFIDENCE.HIGH : PREVIEW_CONFIDENCE.MEDIUM,
      status: bestImage ? PREVIEW_STATUS.READY : PREVIEW_STATUS.FALLBACK,
      canonicalUrl: normalizePinterestPinUrl(finalUrl),
      title: extracted.title || "Pinterest pin",
      description: extracted.description,
      siteName: "Pinterest",
      favicon: extracted.favicon,
      candidateImageUrls: extracted.imageCandidates,
      allowScreenshotFallback: false,
      metadata: {
        pinId,
        sourceHost: getHostname(finalUrl),
      },
    });
  } catch {
    return createResolvedPreviewResult({
      kind: PREVIEW_KIND.PINTEREST_PIN,
      confidence: PREVIEW_CONFIDENCE.LOW,
      status: PREVIEW_STATUS.FALLBACK,
      canonicalUrl,
      title: "Pinterest pin",
      siteName: "Pinterest",
      allowScreenshotFallback: false,
      metadata: {
        pinId,
      },
    });
  }
}

module.exports = {
  resolvePinterestPinPreview,
};
