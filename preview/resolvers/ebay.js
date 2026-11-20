// eBay item links (ebay.<tld>/itm/<id>) -> a product tile.
//
// eBay answers plain HTTP fetches with a 403 "Error Page" and a bot
// challenge, whatever the headers. A real browser passes it: the page
// redirects through /splashui/challenge and back to the item on its own. So
// the item is read from the offscreen capture window once the real page has
// loaded, then parsed like any other product page (preview/product.js), with
// eBay's own price element as a fallback.
const cheerio = require("cheerio");
const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { extractProductFromHtml, formatProductPrice } = require("../product");
const { createResolvedPreviewResult } = require("../result");
const { cleanPreviewText, firstString, getUrlHostname, uniqueValues } = require("../utils");

const EBAY_HOST_PATTERN = /(?:^|\.)(ebay\.[a-z.]+)$/i;

function getEbayDomain(url) {
  return getUrlHostname(url).match(EBAY_HOST_PATTERN)?.[1]?.toLowerCase() ?? "";
}

function extractEbayItemId(url) {
  try {
    const { pathname } = new URL(url);
    return pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:[/?]|$)/)?.[1] ?? "";
  } catch {
    return "";
  }
}

function isEbayItemUrl(url) {
  return Boolean(getEbayDomain(url) && extractEbayItemId(url));
}

// The item's plain URL: drops the long tracking query eBay links carry.
function buildEbayItemUrl(url) {
  const itemId = extractEbayItemId(url);
  const domain = getEbayDomain(url);
  return itemId && domain ? `https://www.${domain}/itm/${itemId}` : url;
}

// True in the page once the real item has loaded (not the bot challenge).
const EBAY_ITEM_READY_SCRIPT = [
  "location.pathname.includes('/itm/')",
  "&& (document.querySelector(\"meta[property='og:image']\")",
  "|| document.querySelector('.x-price-primary'))",
].join(" ");

function isEbayErrorPage(html) {
  const title = cleanPreviewText(cheerio.load(html)("title").first().text()).toLowerCase();
  return !title || title.startsWith("error page") || title.includes("security measure");
}

function readEbayItem(html, pageUrl) {
  if (!html || isEbayErrorPage(html)) {
    return null;
  }

  const product = extractProductFromHtml(html, pageUrl);
  const $ = cheerio.load(html);
  const shownPrice = cleanPreviewText($(".x-price-primary").first().text()).replace(/^(?:US|AU|C)?\s*/, "");

  if (!product && !shownPrice) {
    return null;
  }

  return {
    title: firstString(
      product?.title,
      cleanPreviewText($(".x-item-title__mainTitle").first().text()),
    ).replace(/\s*\|\s*eBay.*$/i, ""),
    description: product?.description ?? "",
    images: uniqueValues([
      ...(product?.images ?? []),
      $(".ux-image-carousel-item img").first().attr("data-zoom-src"),
      $(".ux-image-carousel-item img").first().attr("src"),
    ].filter(Boolean)),
    // The price as eBay shows it ("£60.82") beats the structured one,
    // which some listings leave in the seller's currency.
    price: firstString(formatProductPrice(shownPrice), product?.price),
  };
}

async function resolveEbayItemPreview(url, { fetchRenderedPageHtml } = {}) {
  const itemUrl = buildEbayItemUrl(url);
  const domain = getEbayDomain(url);
  let item = null;
  let finalUrl = itemUrl;

  // A plain fetch first: cheap, and sometimes allowed.
  try {
    const response = await fetch(itemUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
    });

    if (response.ok) {
      item = readEbayItem(await response.text(), response.url || itemUrl);
    }
  } catch {
    item = null;
  }

  // Blocked: let a real browser through the bot check.
  if (!item && typeof fetchRenderedPageHtml === "function") {
    const rendered = await fetchRenderedPageHtml(itemUrl, { isReadyScript: EBAY_ITEM_READY_SCRIPT, timeoutMs: 15000 });

    if (rendered?.html) {
      finalUrl = buildEbayItemUrl(rendered.finalUrl || itemUrl);
      item = readEbayItem(rendered.html, finalUrl);
    }
  }

  if (!item) {
    return createResolvedPreviewResult({
      kind: PREVIEW_KIND.AMAZON_PRODUCT,
      confidence: PREVIEW_CONFIDENCE.LOW,
      status: PREVIEW_STATUS.FALLBACK,
      reason: "eBay item could not be read",
      canonicalUrl: itemUrl,
      title: "eBay item",
      siteName: domain,
      allowScreenshotFallback: false,
      metadata: { productDomain: domain },
    });
  }

  return createResolvedPreviewResult({
    kind: PREVIEW_KIND.AMAZON_PRODUCT,
    confidence: item.title ? PREVIEW_CONFIDENCE.HIGH : PREVIEW_CONFIDENCE.MEDIUM,
    status: PREVIEW_STATUS.READY,
    canonicalUrl: finalUrl,
    title: item.title || "eBay item",
    description: item.description,
    siteName: domain,
    candidateImageUrls: item.images,
    allowScreenshotFallback: false,
    metadata: {
      productPrice: item.price,
      productDomain: domain,
    },
  });
}

module.exports = {
  buildEbayItemUrl,
  extractEbayItemId,
  isEbayItemUrl,
  readEbayItem,
  resolveEbayItemPreview,
};
