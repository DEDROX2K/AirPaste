// Shop product links -> the product tile: reading a product off any page,
// eBay item links, pasting bare addresses, and the tile's price/shop text.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { toPastedUrl } from "@/lib/workspace.js";
import { formatProductPrice, formatProductSource, parseProductPrice } from "@/tiles/link/product.js";

const require = createRequire(import.meta.url);
const { extractProductFromHtml } = require("../preview/product.js");
const { buildEbayItemUrl, extractEbayItemId, isEbayItemUrl, readEbayItem } = require("../preview/resolvers/ebay.js");
const { classifyPreviewTarget } = require("../preview/classification.js");

const page = (head, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe("product pages", () => {
  it("reads a JSON-LD Product with its offer", () => {
    const product = extractProductFromHtml(page(ld({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Tree Runner",
      image: ["/img/a.jpg", "https://cdn.shop/b.jpg"],
      offers: { "@type": "Offer", price: "98.00", priceCurrency: "USD" },
    })), "https://www.shop.com/products/tree-runner");

    expect(product).toMatchObject({
      title: "Tree Runner",
      images: ["https://www.shop.com/img/a.jpg", "https://cdn.shop/b.jpg"],
      price: "$98.00",
      domain: "shop.com",
    });
  });

  it("finds the product inside @graph, and an AggregateOffer's low price", () => {
    const product = extractProductFromHtml(page(ld({
      "@graph": [{ "@type": "WebPage" }, {
        "@type": ["Product", "Thing"],
        name: "Kettle",
        image: { url: "https://x.com/k.png" },
        offers: { "@type": "AggregateOffer", lowPrice: 24.5, priceCurrency: "GBP" },
      }],
    })), "https://x.com/kettle");

    expect(product).toMatchObject({ title: "Kettle", images: ["https://x.com/k.png"], price: "£24.5" });
  });

  it("reads Open Graph product tags (Shopify / WooCommerce)", () => {
    const product = extractProductFromHtml(page([
      '<meta property="og:type" content="product">',
      '<meta property="og:title" content="Linen Shirt">',
      '<meta property="og:image" content="https://s.com/shirt.jpg">',
      '<meta property="product:price:amount" content="45.00">',
      '<meta property="product:price:currency" content="EUR">',
    ].join("")), "https://s.com/p/shirt");

    expect(product).toMatchObject({ title: "Linen Shirt", images: ["https://s.com/shirt.jpg"], price: "€45.00" });
  });

  it("is not a product page without product data", () => {
    expect(extractProductFromHtml(page('<meta property="og:type" content="article"><title>News</title>'), "https://n.com/a")).toBeNull();
    expect(extractProductFromHtml("", "https://n.com")).toBeNull();
    // Malformed JSON-LD doesn't throw.
    expect(extractProductFromHtml(page('<script type="application/ld+json">{"@type":"Product",</script>'), "https://n.com")).toBeNull();
  });
});

describe("eBay item links", () => {
  const link = "https://www.ebay.co.uk/itm/326753287046?_trkparms=amclksrc%3DITM%26aid%3D777008&itm=326753287046";

  it("recognises item links and drops the tracking query", () => {
    expect(isEbayItemUrl(link)).toBe(true);
    expect(extractEbayItemId("https://www.ebay.com/itm/some-title/123456789012")).toBe("123456789012");
    expect(buildEbayItemUrl(link)).toBe("https://www.ebay.co.uk/itm/326753287046");
    expect(isEbayItemUrl("https://www.ebay.co.uk/sch/i.html?_nkw=casio")).toBe(false);
    expect(classifyPreviewTarget(link)).toMatchObject({ resolverKey: "ebay", resolvedKind: "amazon-product" });
  });

  it("reads an item page, preferring the price eBay shows", () => {
    const html = page(
      `<title>CASIO HS-80TW | eBay UK</title><meta property="og:image" content="https://i.ebayimg.com/a.jpg">${ld({
        "@type": "Product",
        name: "CASIO HS-80TW",
        image: "https://i.ebayimg.com/a.jpg",
        offers: { "@type": "Offer", price: "8999", priceCurrency: "JPY" },
      })}`,
      '<div class="x-price-primary"><span>£60.82</span></div>',
    );

    expect(readEbayItem(html, "https://www.ebay.co.uk/itm/1")).toMatchObject({
      title: "CASIO HS-80TW",
      images: ["https://i.ebayimg.com/a.jpg"],
      price: "£60.82",
    });
  });

  it("treats eBay's bot page as nothing to read", () => {
    expect(readEbayItem(page("<title>Error Page | eBay</title>"), "https://www.ebay.co.uk/itm/1")).toBeNull();
  });
});

describe("pasting links", () => {
  it("pastes bare addresses as links", () => {
    expect(toPastedUrl("amazon.co.uk/dp/B0GMKJFT9W?ref_=x")).toBe("https://amazon.co.uk/dp/B0GMKJFT9W?ref_=x");
    expect(toPastedUrl("  www.ebay.com/itm/1 ")).toBe("https://www.ebay.com/itm/1");
    expect(toPastedUrl("example.com")).toBe("https://example.com");
    expect(toPastedUrl("https://a.com/x")).toBe("https://a.com/x");
  });

  it("keeps file names, emails and sentences as text", () => {
    expect(toPastedUrl("notes.md")).toBeNull();
    expect(toPastedUrl("script.js")).toBeNull();
    expect(toPastedUrl("me@example.com")).toBeNull();
    expect(toPastedUrl("see amazon.com for it")).toBeNull();
    expect(toPastedUrl("1.5")).toBeNull();
    expect(toPastedUrl("mailto:me@x.com")).toBeNull();
  });
});

describe("product tile text", () => {
  it("shows the price as the design does, number then symbol", () => {
    expect(formatProductPrice("£69.99")).toBe("69.99£");
    expect(formatProductPrice("$215")).toBe("215$");
    expect(formatProductPrice("1,299.99 USD")).toBe("1,299.99$");
    expect(formatProductPrice("US $12.50", "before")).toBe("$12.50");
    expect(formatProductPrice("£12.99 - £20.00")).toBe("12.99£");
    expect(formatProductPrice("")).toBe("");
    expect(parseProductPrice("Free")).toBeNull();
  });

  it("names the shop from its domain", () => {
    expect(formatProductSource("ebay.co.uk")).toBe("Ebay.co.uk");
    expect(formatProductSource("", "https://www.amazon.com/dp/x")).toBe("Amazon.com");
    expect(formatProductSource("")).toBe("Online store");
  });
});
