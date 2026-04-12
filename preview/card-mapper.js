const AMAZON_PRODUCT_CARD_TYPE = "amazon-product";
const LINK_CONTENT_KIND_BOOKMARK = "bookmark";
const LINK_CONTENT_KIND_IMAGE = "image";
const { PREVIEW_KIND, PREVIEW_STATE_VALUES, PREVIEW_STATUS } = require("./constants");
const { getHostname } = require("./utils");

function defaultCardTypeForResult(result) {
  if (result.kind === PREVIEW_KIND.AMAZON_PRODUCT && result.status !== PREVIEW_STATUS.BLOCKED) {
    return AMAZON_PRODUCT_CARD_TYPE;
  }

  return "link";
}

function getCardStateFromResolvedPreview(currentCard, result, defaultCardSize) {
  const nextType = defaultCardTypeForResult(result);
  const nextSize = defaultCardSize(nextType);
  const shouldResize = currentCard.type !== nextType;
  const domainFallback = getHostname(result.canonicalUrl || currentCard.url);
  const safeStatus = PREVIEW_STATE_VALUES.includes(result.status) ? result.status : "error";
  const keepImage = safeStatus === "ready";
  const contentKind = result.kind === PREVIEW_KIND.IMAGE ? LINK_CONTENT_KIND_IMAGE : LINK_CONTENT_KIND_BOOKMARK;
  const isAmazonCard = nextType === AMAZON_PRODUCT_CARD_TYPE;

  return {
    type: nextType,
    url: result.canonicalUrl || currentCard.url,
    width: shouldResize ? nextSize.width : currentCard.width,
    height: shouldResize
      ? nextSize.height
      : result.previewKind === "music"
        ? Math.max(currentCard.height, currentCard.width)
        : currentCard.height,
    contentKind,
    title: result.title || result.siteName || domainFallback,
    description: safeStatus === "blocked" ? "" : (result.description || ""),
    image: keepImage ? result.image || "" : "",
    favicon: result.favicon || "",
    siteName: result.siteName || domainFallback,
    previewKind: result.previewKind === "music" ? "music" : "default",
    previewError: result.reason || "",
    status: safeStatus,
    productAsin: isAmazonCard ? String(result.metadata?.productAsin ?? "") : "",
    productPrice: isAmazonCard ? String(result.metadata?.productPrice ?? "") : "",
    productDomain: isAmazonCard ? String(result.metadata?.productDomain ?? "") : "",
    productRating: isAmazonCard && Number.isFinite(result.metadata?.productRating)
      ? Number(result.metadata.productRating)
      : null,
    productReviewCount: isAmazonCard && Number.isFinite(result.metadata?.productReviewCount)
      ? Math.round(result.metadata.productReviewCount)
      : null,
  };
}

module.exports = {
  getCardStateFromResolvedPreview,
};
