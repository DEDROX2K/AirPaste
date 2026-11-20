// Text for the product tile (AmazonProductTile): the price in the bottom
// tab and the shop in the pill. Saved data stays as scraped
// (card.productPrice "£69.99", card.productDomain "amazon.co.uk"); these
// format it for display.

// "after" is the design's look: 215$. "before" is the usual locale one: $215.
export const PRODUCT_PRICE_FORMAT = "after";

const CURRENCY_CODES = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  KRW: "₩",
};

// "£69.99", "US $12.50", "1,299.99 USD", "EUR 40" -> { amount, symbol }.
export function parseProductPrice(raw) {
  const text = String(raw ?? "").trim();

  if (!text) {
    return null;
  }

  // The first number in it ("£12.99 - £20.00" shows the low end).
  const amount = text.match(/\d[\d.,]*/)?.[0]?.replace(/[.,]$/, "") ?? "";

  if (!amount) {
    return null;
  }

  const code = text.match(/\b(USD|GBP|EUR|JPY|CNY|INR|KRW)\b/i)?.[1]?.toUpperCase();
  const symbol = code
    ? CURRENCY_CODES[code]
    : (text.match(/(?:A|C|NZ|HK|S)?\$|[£€¥₹₩]/)?.[0] ?? "");

  return { amount, symbol };
}

export function formatProductPrice(raw, format = PRODUCT_PRICE_FORMAT) {
  const price = parseProductPrice(raw);

  if (!price) {
    return "";
  }

  return format === "before" ? `${price.symbol}${price.amount}` : `${price.amount}${price.symbol}`;
}

// "ebay.co.uk" -> "Ebay.co.uk", "https://www.amazon.com/dp/x" -> "Amazon.com".
export function formatProductSource(domain, url = "") {
  let host = String(domain ?? "").trim();

  if (!host && url) {
    try {
      host = new URL(url).hostname;
    } catch {
      host = "";
    }
  }

  host = host.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  return host ? host[0].toUpperCase() + host.slice(1) : "Online store";
}
