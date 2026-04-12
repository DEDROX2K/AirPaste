const cheerio = require("cheerio");
const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { createResolvedPreviewResult } = require("../result");
const { cleanPreviewText, firstString, getUrlHostname, uniqueValues } = require("../utils");

function normalizeAmazonDomain(hostname) {
  const match = String(hostname ?? "").toLowerCase().match(/(?:^|\.)((?:smile\.)?amazon\.[a-z.]+)$/i);

  if (!match?.[1]) {
    return "";
  }

  return match[1].replace(/^smile\./, "");
}

function extractAmazonAsin(url) {
  try {
    const parsedUrl = new URL(url);
    const patterns = [
      /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/offer-listing\/([A-Z0-9]{10})(?:[/?]|$)/i,
    ];

    for (const pattern of patterns) {
      const match = parsedUrl.pathname.match(pattern);

      if (match?.[1]) {
        return match[1].toUpperCase();
      }
    }

    return "";
  } catch {
    return "";
  }
}

function buildAmazonCanonicalUrl(domain, asin) {
  const normalizedDomain = normalizeAmazonDomain(domain) || "amazon.com";
  return asin ? `https://${normalizedDomain}/dp/${asin}` : "";
}

function parseAmazonRatingValue(value) {
  const match = cleanPreviewText(value).match(/(\d+(?:[.,]\d+)?)/);

  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAmazonReviewCount(value) {
  const digits = cleanPreviewText(value).replace(/[^\d]/g, "");

  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAmazonPriceValue(value, currency = "") {
  const text = cleanPreviewText(value);

  if (!text) {
    return "";
  }

  const normalizedCurrency = cleanPreviewText(currency);
  return normalizedCurrency && !text.includes(normalizedCurrency)
    ? `${normalizedCurrency} ${text}`
    : text;
}

function getLargestAmazonDynamicImageUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const parsed = JSON.parse(value);
    const entries = Object.keys(parsed);
    return entries.sort((leftUrl, rightUrl) => rightUrl.length - leftUrl.length)[0] ?? "";
  } catch {
    return "";
  }
}

function isAmazonPreviewRejectionText(text) {
  const normalizedText = cleanPreviewText(text).toLowerCase();

  return [
    "amazon sign-in",
    "captcha",
    "robot check",
    "sorry, something went wrong",
    "sign in",
    "unusual traffic",
    "enter the characters you see below",
  ].some((pattern) => normalizedText.includes(pattern));
}

function getJsonLdProductNode($) {
  const scripts = $("script[type='application/ld+json']").toArray();

  for (const script of scripts) {
    const rawText = $(script).text();

    if (!rawText.includes("Product")) {
      continue;
    }

    try {
      const payload = JSON.parse(rawText);
      const entries = Array.isArray(payload) ? payload : [payload];

      for (const entry of entries) {
        if (entry?.["@type"] === "Product") {
          return entry;
        }

        if (Array.isArray(entry?.["@graph"])) {
          const node = entry["@graph"].find((graphNode) => graphNode?.["@type"] === "Product");
          if (node) {
            return node;
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  }

  return null;
}

async function resolveAmazonProductPreview(url) {
  const originalAsin = extractAmazonAsin(url);

  if (!originalAsin) {
    return null;
  }

  const originalDomain = normalizeAmazonDomain(getUrlHostname(url)) || "amazon.com";
  const canonicalUrl = buildAmazonCanonicalUrl(originalDomain, originalAsin);

  try {
    const response = await fetch(canonicalUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return createResolvedPreviewResult({
        kind: PREVIEW_KIND.AMAZON_PRODUCT,
        confidence: PREVIEW_CONFIDENCE.LOW,
        status: PREVIEW_STATUS.FALLBACK,
        canonicalUrl,
        title: "Amazon product",
        siteName: originalDomain,
        allowScreenshotFallback: false,
        metadata: {
          productAsin: originalAsin,
          productDomain: originalDomain,
        },
      });
    }

    const finalUrl = response.url || canonicalUrl;
    const finalDomain = normalizeAmazonDomain(getUrlHostname(finalUrl)) || originalDomain;
    const finalAsin = extractAmazonAsin(finalUrl) || originalAsin;
    const normalizedUrl = buildAmazonCanonicalUrl(finalDomain, finalAsin);
    const html = await response.text();
    const $ = cheerio.load(html);
    const pageTitle = cleanPreviewText($("title").first().text());
    const bodyText = cleanPreviewText($("body").text()).slice(0, 6000);

    if (
      isAmazonPreviewRejectionText(pageTitle)
      || isAmazonPreviewRejectionText(bodyText)
      || (!$("#productTitle").length && !html.includes('"@type":"Product"') && !html.includes('"@type": "Product"'))
    ) {
      return createResolvedPreviewResult({
        kind: PREVIEW_KIND.AMAZON_PRODUCT,
        confidence: PREVIEW_CONFIDENCE.LOW,
        status: PREVIEW_STATUS.FALLBACK,
        canonicalUrl: normalizedUrl,
        title: "Amazon product",
        siteName: finalDomain,
        allowScreenshotFallback: false,
        metadata: {
          productAsin: finalAsin,
          productDomain: finalDomain,
        },
      });
    }

    const productNode = getJsonLdProductNode($);
    const title = firstString(
      cleanPreviewText($("#productTitle").first().text()),
      cleanPreviewText(productNode?.name),
      cleanPreviewText($("meta[name='title']").attr("content")),
    );
    const description = firstString(
      cleanPreviewText($("#feature-bullets ul li span.a-list-item").first().text()),
      cleanPreviewText($("meta[name='description']").attr("content")),
      cleanPreviewText(productNode?.description),
    );
    const imageUrls = uniqueValues([
      firstString($("#landingImage").attr("data-old-hires")),
      getLargestAmazonDynamicImageUrl($("#landingImage").attr("data-a-dynamic-image")),
      firstString($("#imgTagWrapperId img").attr("data-old-hires")),
      getLargestAmazonDynamicImageUrl($("#imgTagWrapperId img").attr("data-a-dynamic-image")),
      firstString(productNode?.image),
      ...(Array.isArray(productNode?.image) ? productNode.image : []),
      firstString($("meta[property='og:image']").attr("content")),
    ]);
    const offer = Array.isArray(productNode?.offers) ? productNode.offers[0] : productNode?.offers;
    const aggregateRating = Array.isArray(productNode?.aggregateRating)
      ? productNode.aggregateRating[0]
      : productNode?.aggregateRating;
    const productPrice = firstString(
      parseAmazonPriceValue($(".a-price.aok-align-center .a-offscreen").first().text()),
      parseAmazonPriceValue($(".a-price .a-offscreen").first().text()),
      parseAmazonPriceValue(offer?.price, offer?.priceCurrency),
    );
    const productRating = parseAmazonRatingValue(
      firstString(
        $("#acrPopover").attr("title"),
        $("[data-hook='rating-out-of-text']").first().text(),
        aggregateRating?.ratingValue,
      ),
    );
    const productReviewCount = parseAmazonReviewCount(
      firstString(
        $("#acrCustomerReviewText").first().text(),
        $("[data-hook='total-review-count']").first().text(),
        aggregateRating?.reviewCount,
      ),
    );

    return createResolvedPreviewResult({
      kind: PREVIEW_KIND.AMAZON_PRODUCT,
      confidence: title ? PREVIEW_CONFIDENCE.HIGH : PREVIEW_CONFIDENCE.MEDIUM,
      status: PREVIEW_STATUS.READY,
      canonicalUrl: normalizedUrl,
      title: title || "Amazon product",
      description,
      siteName: finalDomain,
      candidateImageUrls: imageUrls,
      allowScreenshotFallback: false,
      metadata: {
        productAsin: finalAsin,
        productPrice,
        productDomain: finalDomain,
        productRating,
        productReviewCount,
      },
    });
  } catch {
    return createResolvedPreviewResult({
      kind: PREVIEW_KIND.AMAZON_PRODUCT,
      confidence: PREVIEW_CONFIDENCE.LOW,
      status: PREVIEW_STATUS.ERROR,
      reason: "Amazon preview resolution failed",
      canonicalUrl,
      title: "Amazon product",
      siteName: originalDomain,
      allowScreenshotFallback: false,
      metadata: {
        productAsin: originalAsin,
        productDomain: originalDomain,
      },
    });
  }
}

module.exports = {
  resolveAmazonProductPreview,
};
