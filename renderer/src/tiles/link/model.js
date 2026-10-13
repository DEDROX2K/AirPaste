import {
  LINK_CONTENT_KIND_BOOKMARK,
  LINK_CONTENT_KIND_IMAGE,
  getDomainLabel,
  getNextCardPosition,
  nowIso,
  normalizeCard,
} from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const LINK_CARD_TYPE = TILE_TYPES.LINK;
export const AMAZON_PRODUCT_CARD_TYPE = TILE_TYPES.AMAZON_PRODUCT;

export const LINK_CARD_SIZE = Object.freeze({
  width: 340,
  height: 280,
});

export const AMAZON_PRODUCT_CARD_SIZE = Object.freeze({
  width: 340,
  height: 388,
});

export const LINK_PREVIEW_STATUSES = Object.freeze(["idle", "loading", "ready", "fallback", "blocked", "error", "failed"]);

const IMAGE_CARD_PORTRAIT_MAX_HEIGHT = 540;
// Matches LINK_CARD_SIZE/AMAZON_PRODUCT_CARD_SIZE's width -- see the same
// constant in renderer/src/systems/import/imageSizing.js for why.
const IMAGE_CARD_FIXED_WIDTH = 340;

export function isLinkLikeType(type) {
  return type === LINK_CARD_TYPE || type === AMAZON_PRODUCT_CARD_TYPE;
}

export function normalizeLinkContentKind(contentKind, asset = null) {
  if (contentKind === LINK_CONTENT_KIND_IMAGE) {
    return LINK_CONTENT_KIND_IMAGE;
  }

  if (asset?.relativePath) {
    return LINK_CONTENT_KIND_IMAGE;
  }

  return LINK_CONTENT_KIND_BOOKMARK;
}

export function normalizeLinkAsset(asset) {
  if (!asset || typeof asset !== "object") {
    return null;
  }

  const relativePath = typeof asset.relativePath === "string" ? asset.relativePath.trim() : "";

  if (!relativePath) {
    return null;
  }

  return {
    relativePath,
    fileName: typeof asset.fileName === "string" ? asset.fileName : "",
    mimeType: typeof asset.mimeType === "string" ? asset.mimeType : "",
    sizeBytes: Number.isFinite(asset.sizeBytes) ? Math.max(0, asset.sizeBytes) : 0,
    width: Number.isFinite(asset.width) ? Math.max(0, asset.width) : 0,
    height: Number.isFinite(asset.height) ? Math.max(0, asset.height) : 0,
  };
}

function getImageCardSizeFromAspectRatio(aspectRatio) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return null;
  }

  let width = IMAGE_CARD_FIXED_WIDTH;
  let height = IMAGE_CARD_FIXED_WIDTH / aspectRatio;

  if (height > IMAGE_CARD_PORTRAIT_MAX_HEIGHT) {
    height = IMAGE_CARD_PORTRAIT_MAX_HEIGHT;
    width = height * aspectRatio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function getNormalizedImageLinkDimensions(cardWidth, cardHeight, fallbackSize, contentKind, asset, mediaAspectRatio) {
  const width = Number.isFinite(cardWidth) ? cardWidth : fallbackSize.width;
  const height = Number.isFinite(cardHeight) ? cardHeight : fallbackSize.height;
  const isDefaultLinkSize = Math.abs(width - fallbackSize.width) <= 1 && Math.abs(height - fallbackSize.height) <= 1;

  if (contentKind !== LINK_CONTENT_KIND_IMAGE || !isDefaultLinkSize) {
    return { width, height };
  }

  const derivedAspectRatio = Number.isFinite(mediaAspectRatio) && mediaAspectRatio > 0
    ? mediaAspectRatio
    : (asset && Number.isFinite(asset.width) && Number.isFinite(asset.height) && asset.width > 0 && asset.height > 0
      ? (asset.width / asset.height)
      : null);
  const normalizedSize = getImageCardSizeFromAspectRatio(derivedAspectRatio);

  return normalizedSize ?? { width, height };
}

export function createLinkCard(cards, viewport, url, preferredCenter = null, options = {}) {
  const type = options?.type === AMAZON_PRODUCT_CARD_TYPE ? AMAZON_PRODUCT_CARD_TYPE : LINK_CARD_TYPE;
  const position = getNextCardPosition(cards, viewport, type, preferredCenter);
  const timestamp = nowIso();
  const contentKind = normalizeLinkContentKind(options?.contentKind, options?.asset);
  const domain = getDomainLabel(url);
  const image = typeof options?.image === "string" ? options.image : "";
  const asset = normalizeLinkAsset(options?.asset);
  const derivedMediaAspectRatio = asset && Number.isFinite(asset.width) && Number.isFinite(asset.height) && asset.width > 0 && asset.height > 0
    ? (asset.width / asset.height)
    : null;

  return normalizeCard({
    id: crypto.randomUUID(),
    type,
    url,
    contentKind,
    title: typeof options?.title === "string" ? options.title : "",
    siteName: typeof options?.siteName === "string" ? options.siteName : domain,
    description: typeof options?.description === "string" ? options.description : "",
    image,
    favicon: typeof options?.favicon === "string" ? options.favicon : "",
    resolvedUrl: typeof options?.resolvedUrl === "string" ? options.resolvedUrl : url,
    previewStatus: typeof options?.previewStatus === "string" ? options.previewStatus : "",
    contentType: typeof options?.contentType === "string" ? options.contentType : "link",
    sourceType: typeof options?.sourceType === "string" ? options.sourceType : "generic-link",
    duration: Number.isFinite(options?.duration) ? Math.max(0, Math.round(options.duration)) : null,
    author: typeof options?.author === "string" ? options.author : "",
    channelName: typeof options?.channelName === "string" ? options.channelName : "",
    mediaAspectRatio: Number.isFinite(options?.mediaAspectRatio) && options.mediaAspectRatio > 0
      ? Number(options.mediaAspectRatio)
      : derivedMediaAspectRatio,
    previewKind: options?.previewKind === "music" ? "music" : "default",
    previewError: typeof options?.previewError === "string" ? options.previewError : "",
    status: contentKind === LINK_CONTENT_KIND_IMAGE
      ? "ready"
      : LINK_PREVIEW_STATUSES.includes(options?.status)
        ? options.status
        : "loading",
    asset,
    productAsin: typeof options?.productAsin === "string" ? options.productAsin : "",
    productPrice: typeof options?.productPrice === "string" ? options.productPrice : "",
    productDomain: typeof options?.productDomain === "string" ? options.productDomain : "",
    productRating: Number.isFinite(options?.productRating) ? Number(options.productRating) : null,
    productReviewCount: Number.isFinite(options?.productReviewCount) ? Math.max(0, Math.round(options.productReviewCount)) : null,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createStickerCard(options = {}) {
  const timestamp = nowIso();
  const width = Number.isFinite(options?.width) ? Math.max(1, Math.round(options.width)) : 160;
  const height = Number.isFinite(options?.height) ? Math.max(1, Math.round(options.height)) : 160;
  const x = Number.isFinite(options?.x) ? Math.round(options.x) : 120;
  const y = Number.isFinite(options?.y) ? Math.round(options.y) : 120;

  return normalizeCard({
    id: crypto.randomUUID(),
    type: LINK_CARD_TYPE,
    url: "",
    contentKind: LINK_CONTENT_KIND_IMAGE,
    title: typeof options?.title === "string" ? options.title : "Sticker",
    siteName: "Sticker",
    description: "",
    image: typeof options?.image === "string" ? options.image : "",
    favicon: "",
    resolvedUrl: "",
    previewStatus: "ready",
    contentType: "sticker",
    sourceType: "sticker",
    duration: null,
    author: "",
    channelName: "",
    mediaAspectRatio: null,
    previewKind: "default",
    previewError: "",
    status: "ready",
    asset: null,
    x,
    y,
    width,
    height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
