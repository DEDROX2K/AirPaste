// Reads a product (name, images, price) out of a shop page's HTML, from the
// structured data shops publish for search engines:
//   - JSON-LD `Product` (also inside @graph, arrays, or a ProductGroup's
//     variants), with its `offers` (Offer or AggregateOffer)
//   - Open Graph `og:type=product` / `product:price:amount` + `:currency`
//     (Shopify, WooCommerce and most small shops)
//   - microdata `itemprop=price` / `priceCurrency`
// Any link whose page has one of these becomes a product tile, not only
// Amazon (which has its own resolver) and eBay.
const cheerio = require("cheerio");
const { cleanPreviewText, firstString, getHostname, resolveUrl, uniqueValues } = require("./utils");

const CURRENCY_SYMBOLS = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  KRW: "₩",
  AUD: "A$",
  CAD: "C$",
  NZD: "NZ$",
  CHF: "CHF ",
};

function hasType(node, typeName) {
  const type = node?.["@type"];
  return Array.isArray(type) ? type.includes(typeName) : type === typeName;
}

function findProductNode(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProductNode(entry, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (hasType(value, "Product")) {
    return value;
  }

  // A ProductGroup (variants): use the group's name/image with the first
  // variant's offer.
  if (hasType(value, "ProductGroup")) {
    const variant = Array.isArray(value.hasVariant) ? value.hasVariant[0] : null;
    return { ...variant, ...value, offers: value.offers ?? variant?.offers };
  }

  return findProductNode(value["@graph"], depth + 1)
    ?? findProductNode(value.mainEntity, depth + 1)
    ?? null;
}

function getJsonLdProduct($) {
  for (const script of $("script[type='application/ld+json']").toArray()) {
    const rawText = $(script).text();

    if (!/Product/.test(rawText)) {
      continue;
    }

    try {
      const node = findProductNode(JSON.parse(rawText));
      if (node) {
        return node;
      }
    } catch {
      // Malformed JSON-LD is common; try the next block.
    }
  }

  return null;
}

function imageList(value) {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(imageList);
  }

  return typeof value === "object" ? imageList(value.url ?? value.contentUrl) : [];
}

function firstOffer(offers) {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  return list.find((offer) => offer && (offer.price ?? offer.lowPrice) != null) ?? list[0] ?? null;
}

// "£", "GBP", "USD" -> a symbol to show; unknown codes stay as written.
function currencySymbol(currency) {
  const value = cleanPreviewText(currency);

  if (!value) {
    return "";
  }

  return CURRENCY_SYMBOLS[value.toUpperCase()] ?? value;
}

// A price as shops write it for people ("£60.82"), built from a number and
// a currency when that's all the structured data gives.
function formatProductPrice(amount, currency) {
  const text = cleanPreviewText(amount);

  if (!text || !/\d/.test(text)) {
    return "";
  }

  // Already has a symbol or code in it ("£60.82", "60.82 GBP").
  if (/[^\d.,\s]/.test(text)) {
    return text;
  }

  const symbol = currencySymbol(currency);
  return symbol ? `${symbol}${text}` : text;
}

// The product on this page, or null when it isn't a product page.
function extractProductFromHtml(html, pageUrl) {
  if (typeof html !== "string" || !html) {
    return null;
  }

  const $ = cheerio.load(html);
  const meta = (name) => cleanPreviewText(
    $(`meta[property='${name}']`).attr("content") ?? $(`meta[name='${name}']`).attr("content"),
  );
  const node = getJsonLdProduct($);
  const ogType = meta("og:type").toLowerCase();
  const ogPrice = firstString(meta("product:price:amount"), meta("og:price:amount"));
  const microPrice = firstString(
    $("[itemprop='price']").first().attr("content"),
    cleanPreviewText($("[itemprop='price']").first().text()),
  );
  const isProductPage = Boolean(node) || ogType === "product" || ogType.startsWith("product.") || Boolean(ogPrice);

  if (!isProductPage) {
    return null;
  }

  const offer = firstOffer(node?.offers);
  const price = firstString(
    formatProductPrice(offer?.price ?? offer?.lowPrice, offer?.priceCurrency ?? node?.offers?.priceCurrency),
    formatProductPrice(ogPrice, firstString(meta("product:price:currency"), meta("og:price:currency"))),
    formatProductPrice(microPrice, $("[itemprop='priceCurrency']").first().attr("content")),
  );
  const title = firstString(
    cleanPreviewText(node?.name),
    meta("og:title"),
    cleanPreviewText($("title").first().text()),
  );
  const images = uniqueValues([
    ...imageList(node?.image),
    meta("og:image"),
    meta("og:image:secure_url"),
  ].map((url) => resolveUrl(url, pageUrl)).filter(Boolean));

  if (!title && images.length === 0) {
    return null;
  }

  return {
    title,
    description: firstString(cleanPreviewText(node?.description), meta("og:description")),
    images,
    price,
    domain: getHostname(pageUrl),
  };
}

module.exports = {
  extractProductFromHtml,
  formatProductPrice,
};
