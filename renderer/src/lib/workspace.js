import TILE_TYPES from "../tiles/tileTypes";
import {
  clamp,
  getDefaultCameraDistance,
  getDefaultWorkspaceView,
  MAX_CAMERA_DISTANCE,
  MIN_GLOBE_RADIUS,
  getSoftGlobeRadius,
} from "../systems/globe/globeLayout";

export const RACK_CARD_TYPE = TILE_TYPES.RACK;
export const AMAZON_PRODUCT_CARD_TYPE = TILE_TYPES.AMAZON_PRODUCT;
export const LINK_CONTENT_KIND_BOOKMARK = "bookmark";
export const LINK_CONTENT_KIND_IMAGE = "image";
export const WORKSPACE_SCHEMA_VERSION = 7;
export const RACK_MIN_SLOTS = 3;
export const RACK_SLOT_WIDTH = 216;
export const RACK_LEFT_CAP_WIDTH = 94;
export const RACK_RIGHT_CAP_WIDTH = 94;
export const RACK_HEIGHT = 126;
export const RACK_TILE_BASELINE = 44;
const LEGACY_FOLDER_CARD_TYPE = "folder";
const LEGACY_FOLDER_ZONE_GAP = 24;
const LEGACY_FOLDER_ZONE_MIN_WIDTH = 860;

const DEFAULT_VIEWPORT = Object.freeze({
  x: 180,
  y: 120,
  zoom: 1,
});

const LINK_CARD_SIZE = Object.freeze({
  width: 340,
  height: 280,
});

const AMAZON_PRODUCT_CARD_SIZE = Object.freeze({
  width: 340,
  height: 388,
});

const RACK_CARD_SIZE = Object.freeze({
  width: RACK_LEFT_CAP_WIDTH + RACK_RIGHT_CAP_WIDTH + (RACK_SLOT_WIDTH * RACK_MIN_SLOTS),
  height: RACK_HEIGHT,
});

const RACK_DEFAULT_TITLE = "Rack";
const RACK_DEFAULT_DESCRIPTION = "Mounted display rack";
const LINK_PREVIEW_STATUSES = Object.freeze(["idle", "loading", "ready", "fallback", "blocked", "error", "failed"]);

function nowIso() {
  return new Date().toISOString();
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function getCardType(card) {
  if (card?.type === TILE_TYPES.LINK) {
    return TILE_TYPES.LINK;
  }

  if (card?.type === AMAZON_PRODUCT_CARD_TYPE) {
    return AMAZON_PRODUCT_CARD_TYPE;
  }

  if (card?.type === RACK_CARD_TYPE) {
    return RACK_CARD_TYPE;
  }

  return null;
}

function normalizeLinkContentKind(contentKind, asset = null) {
  if (contentKind === LINK_CONTENT_KIND_IMAGE) {
    return LINK_CONTENT_KIND_IMAGE;
  }

  if (asset?.relativePath) {
    return LINK_CONTENT_KIND_IMAGE;
  }

  return LINK_CONTENT_KIND_BOOKMARK;
}

function normalizeLinkAsset(asset) {
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

function normalizeLegacyFolderChildIds(childIds) {
  return Array.isArray(childIds)
    ? [...new Set(childIds.filter((childId) => typeof childId === "string" && childId.trim().length > 0))]
    : [];
}

function isLinkLikeType(type) {
  return type === TILE_TYPES.LINK || type === AMAZON_PRODUCT_CARD_TYPE;
}

function normalizeRackTileIds(tileIds) {
  return Array.isArray(tileIds)
    ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
    : [];
}

function normalizeLegacyFolderChildLayouts(childIds, childLayouts) {
  const safeLayouts = childLayouts && typeof childLayouts === "object" ? childLayouts : {};

  return Object.fromEntries(
    childIds.map((childId) => {
      const entry = safeLayouts[childId];

      return [
        childId,
        {
          x: Number.isFinite(entry?.x) ? entry.x : 0,
          y: Number.isFinite(entry?.y) ? entry.y : 0,
        },
      ];
    }),
  );
}

function getCardSize(type) {
  if (type === TILE_TYPES.LINK) {
    return LINK_CARD_SIZE;
  }

  if (type === AMAZON_PRODUCT_CARD_TYPE) {
    return AMAZON_PRODUCT_CARD_SIZE;
  }

  if (type === RACK_CARD_TYPE) {
    return RACK_CARD_SIZE;
  }

  return RACK_CARD_SIZE;
}

function normalizeCardLayout(layout) {
  const globe = layout?.globe;

  return {
    globe: Number.isFinite(globe?.theta) && Number.isFinite(globe?.phi)
      ? {
        theta: globe.theta,
        phi: globe.phi,
      }
      : null,
  };
}

function normalizePreviewDiagnostics(previewDiagnostics) {
  if (!previewDiagnostics || typeof previewDiagnostics !== "object" || Array.isArray(previewDiagnostics)) {
    return null;
  }

  return JSON.parse(JSON.stringify(previewDiagnostics));
}

function normalizeWorkspaceView(view, tileCount = 0) {
  const defaults = getDefaultWorkspaceView(tileCount);
  const globeRadius = Number.isFinite(view?.globeRadius)
    ? clamp(view.globeRadius, MIN_GLOBE_RADIUS, getSoftGlobeRadius(9999))
    : defaults.globeRadius;

  return {
    mode: view?.mode === "globe" ? "globe" : view?.mode === "grid" ? "grid" : "flat",
    globeRadius,
    yaw: Number.isFinite(view?.yaw) ? view.yaw : defaults.yaw,
    pitch: Number.isFinite(view?.pitch) ? view.pitch : defaults.pitch,
    cameraDistance: Number.isFinite(view?.cameraDistance)
      ? clamp(view.cameraDistance, getDefaultCameraDistance(globeRadius), MAX_CAMERA_DISTANCE)
      : getDefaultCameraDistance(globeRadius),
    focusedTileId: typeof view?.focusedTileId === "string" ? view.focusedTileId : null,
  };
}

export function getDomainLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

export function createEmptyWorkspace() {
  return {
    version: WORKSPACE_SCHEMA_VERSION,
    viewport: { ...DEFAULT_VIEWPORT },
    view: getDefaultWorkspaceView(0),
    cards: [],
  };
}

export function getRackSlotCount(rackCard) {
  return Math.max(
    Number.isFinite(rackCard?.minSlots) ? rackCard.minSlots : RACK_MIN_SLOTS,
    Array.isArray(rackCard?.tileIds) ? rackCard.tileIds.length : 0,
  );
}

export function getRackSize(rackCard) {
  return {
    width: RACK_LEFT_CAP_WIDTH + RACK_RIGHT_CAP_WIDTH + (getRackSlotCount(rackCard) * RACK_SLOT_WIDTH),
    height: RACK_HEIGHT,
  };
}

export function getRackTileWorldPosition(rackCard, tile, rackIndex = tile?.rackIndex ?? 0) {
  const normalizedIndex = Number.isFinite(rackIndex) ? rackIndex : 0;
  const slotLeft = rackCard.x + RACK_LEFT_CAP_WIDTH + (normalizedIndex * RACK_SLOT_WIDTH);
  const centeredOffset = (RACK_SLOT_WIDTH - tile.width) / 2;

  return {
    x: slotLeft + centeredOffset,
    y: rackCard.y + RACK_TILE_BASELINE - tile.height,
  };
}

export function canAttachTileToRack(tile) {
  return Boolean(
    tile
    && tile.type !== RACK_CARD_TYPE,
  );
}

export function normalizeCard(card, fallbackIndex = 0) {
  const type = getCardType(card);

  if (!type) {
    return null;
  }

  const isLinkLikeCard = isLinkLikeType(type);
  const linkAsset = type === TILE_TYPES.LINK ? normalizeLinkAsset(card?.asset) : null;
  const contentKind = isLinkLikeCard
    ? normalizeLinkContentKind(card?.contentKind, linkAsset)
    : "";
  const size = getCardSize(type);
  const createdAt = typeof card?.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card?.updatedAt === "string" ? card.updatedAt : createdAt;
  const rackTileIds = type === RACK_CARD_TYPE ? normalizeRackTileIds(card?.tileIds) : [];
  const rackSize = type === RACK_CARD_TYPE
    ? getRackSize({
      minSlots: Math.max(RACK_MIN_SLOTS, Number.isFinite(card?.minSlots) ? card.minSlots : RACK_MIN_SLOTS),
      tileIds: rackTileIds,
    })
    : null;

  return {
    id: typeof card?.id === "string" ? card.id : `card-${fallbackIndex}-${Date.now()}`,
    type,
    x: Number.isFinite(card?.x) ? card.x : 120,
    y: Number.isFinite(card?.y) ? card.y : 120,
    width: type === RACK_CARD_TYPE ? rackSize.width : Number.isFinite(card?.width) ? card.width : size.width,
    height: type === RACK_CARD_TYPE ? rackSize.height : Number.isFinite(card?.height) ? card.height : size.height,
    url: isLinkLikeCard ? String(card?.url ?? "") : "",
    contentKind,
    title: isLinkLikeCard
      ? String(card?.title ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.title, RACK_DEFAULT_TITLE)
        : "",
    description: isLinkLikeCard
      ? String(card?.description ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.description, RACK_DEFAULT_DESCRIPTION)
        : "",
    image: isLinkLikeCard ? String(card?.image ?? "") : "",
    favicon: isLinkLikeCard ? String(card?.favicon ?? "") : "",
    siteName: isLinkLikeCard ? String(card?.siteName ?? "") : "",
    previewKind: isLinkLikeCard && card?.previewKind === "music" ? "music" : "default",
    previewError: isLinkLikeCard ? String(card?.previewError ?? "") : "",
    status: isLinkLikeCard && LINK_PREVIEW_STATUSES.includes(card?.status)
      ? card.status
      : "idle",
    previewDiagnostics: isLinkLikeCard ? normalizePreviewDiagnostics(card?.previewDiagnostics) : null,
    asset: type === TILE_TYPES.LINK ? linkAsset : null,
    productAsin: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productAsin ?? "") : "",
    productPrice: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productPrice ?? "") : "",
    productDomain: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productDomain ?? "") : "",
    productRating: type === AMAZON_PRODUCT_CARD_TYPE && Number.isFinite(card?.productRating)
      ? Number(card.productRating)
      : null,
    productReviewCount: type === AMAZON_PRODUCT_CARD_TYPE && Number.isFinite(card?.productReviewCount)
      ? Math.max(0, Math.round(card.productReviewCount))
      : null,
    tileIds: rackTileIds,
    minSlots: type === RACK_CARD_TYPE
      ? Math.max(RACK_MIN_SLOTS, Number.isFinite(card?.minSlots) ? card.minSlots : RACK_MIN_SLOTS)
      : null,
    layout: normalizeCardLayout(card?.layout),
    parentRackId: type !== RACK_CARD_TYPE && typeof card?.parentRackId === "string" && card.parentRackId.trim().length > 0
      ? card.parentRackId
      : null,
    rackIndex: type !== RACK_CARD_TYPE && Number.isFinite(card?.rackIndex)
      ? Math.max(0, Math.round(card.rackIndex))
      : null,
    createdAt,
    updatedAt,
  };
}

export function normalizeWorkspace(workspace) {
  const safeWorkspace = migrateWorkspace(workspace && typeof workspace === "object"
    ? workspace
    : createEmptyWorkspace());
  const cards = Array.isArray(safeWorkspace.cards)
    ? safeWorkspace.cards
      .map((card, index) => normalizeCard(card, index))
      .filter(Boolean)
    : [];

  return {
    version: WORKSPACE_SCHEMA_VERSION,
    viewport: {
      x: Number.isFinite(safeWorkspace.viewport?.x) ? safeWorkspace.viewport.x : DEFAULT_VIEWPORT.x,
      y: Number.isFinite(safeWorkspace.viewport?.y) ? safeWorkspace.viewport.y : DEFAULT_VIEWPORT.y,
      zoom: Number.isFinite(safeWorkspace.viewport?.zoom) ? safeWorkspace.viewport.zoom : DEFAULT_VIEWPORT.zoom,
    },
    view: normalizeWorkspaceView(safeWorkspace.view, cards.length),
    cards,
  };
}

function migrateWorkspace(rawWorkspace) {
  const safeWorkspace = rawWorkspace && typeof rawWorkspace === "object"
    ? rawWorkspace
    : createEmptyWorkspace();
  const version = Number.isFinite(safeWorkspace.version) ? safeWorkspace.version : 1;

  if (version >= WORKSPACE_SCHEMA_VERSION) {
    return safeWorkspace;
  }

  let nextWorkspace = { ...safeWorkspace };

  if (version < 2) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 2,
    };
  }

  if (version < 3) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 3,
    };
  }

  if (version < 4) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 4,
    };
  }

  if (version < 5) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 5,
    };
  }

  if (version < 6) {
    nextWorkspace = {
      ...nextWorkspace,
      version: 6,
    };
  }

  if (version < 7) {
    nextWorkspace = {
      ...nextWorkspace,
      cards: flattenLegacyFolderCards(Array.isArray(nextWorkspace.cards) ? nextWorkspace.cards : []),
      version: 7,
    };
  }

  return nextWorkspace;
}

function updateRackTiles(rackCard, nextTileIds) {
  return normalizeCard({
    ...rackCard,
    tileIds: nextTileIds,
    updatedAt: nowIso(),
  });
}

function syncRackChildren(cards, rackId, nextTileIds) {
  const timestamp = nowIso();
  const tileSet = new Set(nextTileIds);

  return cards.map((card) => {
    if (card.id === rackId && card.type === RACK_CARD_TYPE) {
      return normalizeCard({
        ...card,
        tileIds: nextTileIds,
        updatedAt: timestamp,
      });
    }

    if (tileSet.has(card.id)) {
      return normalizeCard({
        ...card,
        parentRackId: rackId,
        rackIndex: nextTileIds.indexOf(card.id),
        updatedAt: timestamp,
      });
    }

    if (card.parentRackId === rackId) {
      return normalizeCard({
        ...card,
        parentRackId: null,
        rackIndex: null,
        updatedAt: timestamp,
      });
    }

    return card;
  });
}

function detachTileFromRacks(cards, tileId) {
  const sourceRack = cards.find((card) => card.type === RACK_CARD_TYPE && card.tileIds.includes(tileId));

  if (!sourceRack) {
    return cards;
  }

  const nextTileIds = sourceRack.tileIds.filter((attachedTileId) => attachedTileId !== tileId);
  return syncRackChildren(cards, sourceRack.id, nextTileIds);
}

function intersects(a, b) {
  return !(
    a.x + a.width < b.x
    || b.x + b.width < a.x
    || a.y + a.height < b.y
    || b.y + b.height < a.y
  );
}

function getCanvasCollisionCards(cards) {
  return cards.filter((card) => !card.parentRackId);
}

function hasCollision(cards, candidate) {
  return getCanvasCollisionCards(cards).some((card) =>
    intersects(candidate, {
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
    }));
}

function getCenteredCardPosition(cards, preferredCenter, type) {
  const size = getCardSize(type);
  const startX = Math.round(preferredCenter.x - size.width / 2);
  const startY = Math.round(preferredCenter.y - size.height / 2);
  const stepX = Math.max(48, Math.round(size.width * 0.42));
  const stepY = Math.max(40, Math.round(size.height * 0.38));

  for (let radius = 0; radius < 18; radius += 1) {
    for (let row = -radius; row <= radius; row += 1) {
      for (let col = -radius; col <= radius; col += 1) {
        if (radius > 0 && Math.max(Math.abs(row), Math.abs(col)) !== radius) {
          continue;
        }

        const candidate = {
          x: startX + col * stepX,
          y: startY + row * stepY,
          width: size.width,
          height: size.height,
        };

        if (!hasCollision(cards, candidate)) {
          return candidate;
        }
      }
    }
  }

  return {
    x: startX,
    y: startY + cards.length * 36,
    width: size.width,
    height: size.height,
  };
}

export function getNextCardPosition(
  cards,
  viewport,
  type,
  preferredCenter = null,
) {
  if (preferredCenter && Number.isFinite(preferredCenter.x) && Number.isFinite(preferredCenter.y)) {
    return getCenteredCardPosition(cards, preferredCenter, type);
  }

  const size = getCardSize(type);
  const startX = Math.max(72, Math.round((-viewport.x + 120) / viewport.zoom));
  const startY = Math.max(72, Math.round((-viewport.y + 160) / viewport.zoom));
  const gapX = 28;
  const gapY = 28;

  for (let row = 0; row < 18; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      const candidate = {
        x: startX + col * (size.width + gapX),
        y: startY + row * (size.height + gapY),
        width: size.width,
        height: size.height,
      };

      if (!hasCollision(cards, candidate)) {
        return candidate;
      }
    }
  }

  return {
    x: startX,
    y: startY + cards.length * 36,
    width: size.width,
    height: size.height,
  };
}

export function createRackCard(cards, viewport, preferredCenter = null, options = {}) {
  const title = firstString(options?.title, RACK_DEFAULT_TITLE);
  const description = firstString(options?.description, RACK_DEFAULT_DESCRIPTION);
  const tileIds = normalizeRackTileIds(options?.tileIds);
  const minSlots = Math.max(
    RACK_MIN_SLOTS,
    Number.isFinite(options?.minSlots) ? options.minSlots : RACK_MIN_SLOTS,
  );
  const position = getNextCardPosition(cards, viewport, RACK_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: RACK_CARD_TYPE,
    title,
    description,
    tileIds,
    minSlots,
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createLinkCard(cards, viewport, url, preferredCenter = null, options = {}) {
  const type = options?.type === AMAZON_PRODUCT_CARD_TYPE ? AMAZON_PRODUCT_CARD_TYPE : TILE_TYPES.LINK;
  const position = getNextCardPosition(cards, viewport, type, preferredCenter);
  const timestamp = nowIso();
  const contentKind = normalizeLinkContentKind(options?.contentKind, options?.asset);
  const domain = getDomainLabel(url);
  const image = typeof options?.image === "string" ? options.image : "";
  const asset = normalizeLinkAsset(options?.asset);

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

export function updateCard(cards, cardId, updates) {
  return cards
    .map((card) =>
      card.id === cardId
        ? normalizeCard({
          ...card,
          ...updates,
          updatedAt: nowIso(),
        })
        : card)
    .filter(Boolean);
}

export function updateCards(cards, updatesById) {
  return cards
    .map((card) => {
      const updates = updatesById?.[card.id];

      if (!updates) {
        return card;
      }

      return normalizeCard({
        ...card,
        ...updates,
        updatedAt: nowIso(),
      });
    })
    .filter(Boolean);
}

export function getRackByTileId(cards, tileId) {
  return cards.find((card) => card.type === RACK_CARD_TYPE && card.tileIds.includes(tileId)) ?? null;
}

export function addTileToRack(cards, tileId, rackId, slotIndex = null) {
  if (!tileId || !rackId || tileId === rackId) {
    return null;
  }

  const tile = cards.find((card) => card.id === tileId);
  const rackCard = cards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE);

  if (!tile || !rackCard || !canAttachTileToRack(tile) || rackCard.tileIds.includes(tileId)) {
    return null;
  }

  const cleanedCards = detachTileFromRacks(cards, tileId);
  const latestRackCard = cleanedCards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE);

  if (!latestRackCard) {
    return null;
  }

  const insertionIndex = Number.isFinite(slotIndex)
    ? Math.max(0, Math.min(latestRackCard.tileIds.length, Math.round(slotIndex)))
    : latestRackCard.tileIds.length;
  const nextTileIds = [...latestRackCard.tileIds];
  nextTileIds.splice(insertionIndex, 0, tileId);
  const nextCards = syncRackChildren(cleanedCards, rackId, nextTileIds);
  const nextRackCard = nextCards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE) ?? latestRackCard;

  return {
    cards: nextCards,
    rackCard: nextRackCard,
  };
}

export function removeTileFromRack(cards, tileId, rackId, dropPosition = null) {
  if (!tileId || !rackId) {
    return null;
  }

  const rackCard = cards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE);
  const tile = cards.find((card) => card.id === tileId);

  if (!rackCard || !tile || !rackCard.tileIds.includes(tileId)) {
    return null;
  }

  const nextTileIds = rackCard.tileIds.filter((attachedTileId) => attachedTileId !== tileId);
  const nextCards = syncRackChildren(cards, rackId, nextTileIds).map((card) => {
    if (card.id !== tileId) {
      return card;
    }

    return normalizeCard({
      ...card,
      x: Number.isFinite(dropPosition?.x) ? dropPosition.x : card.x,
      y: Number.isFinite(dropPosition?.y) ? dropPosition.y : card.y,
      parentRackId: null,
      rackIndex: null,
      updatedAt: nowIso(),
    });
  });
  const nextRackCard = nextCards.find((card) => card.id === rackId && card.type === RACK_CARD_TYPE) ?? rackCard;
  const nextTile = nextCards.find((card) => card.id === tileId) ?? tile;

  return {
    cards: nextCards,
    rackCard: nextRackCard,
    tile: nextTile,
  };
}

export function replaceCards(cards, nextCards) {
  if (!Array.isArray(nextCards)) {
    return cards;
  }

  return nextCards
    .map((card, index) => normalizeCard(card, index))
    .filter(Boolean);
}

export function reorderCards(cards, orderedCardIds = []) {
  const orderSet = new Set(orderedCardIds);
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const remainingCards = cards.filter((card) => !orderSet.has(card.id));
  const orderedCards = orderedCardIds
    .map((cardId) => cardById.get(cardId))
    .filter(Boolean);

  return [...remainingCards, ...orderedCards];
}

export function removeCard(cards, cardId) {
  if (!cardId) {
    return cards;
  }

  const idsToRemove = new Set([cardId]);

  const removedRackMap = new Map(
    cards
      .filter((card) => idsToRemove.has(card.id) && card.type === RACK_CARD_TYPE)
      .map((card) => [card.id, card]),
  );

  return cards
    .filter((card) => !idsToRemove.has(card.id))
    .map((card) => {
      const removedRack = card.parentRackId ? removedRackMap.get(card.parentRackId) : null;

      if (removedRack) {
        const detachedPosition = getRackTileWorldPosition(
          removedRack,
          card,
          Number.isFinite(card.rackIndex) ? card.rackIndex : removedRack.tileIds.indexOf(card.id),
        );

        return normalizeCard({
          ...card,
          x: detachedPosition.x,
          y: detachedPosition.y,
          parentRackId: null,
          rackIndex: null,
          updatedAt: nowIso(),
        });
      }

      if (card.type === RACK_CARD_TYPE) {
        const nextTileIds = card.tileIds.filter((tileId) => !idsToRemove.has(tileId));

        return nextTileIds.length === card.tileIds.length
          ? card
          : updateRackTiles(card, nextTileIds);
      }

      return card;
    });
}

export function isUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isImageLinkCard(card) {
  return isLinkLikeType(card?.type) && card.contentKind === LINK_CONTENT_KIND_IMAGE;
}

export function isBookmarkLinkCard(card) {
  return isLinkLikeType(card?.type) && !isImageLinkCard(card);
}

export function canRefreshLinkPreviewCard(card) {
  return isBookmarkLinkCard(card)
    && typeof card?.url === "string"
    && card.url.trim().length > 0
    && card.status !== "loading";
}

export function hasUsableLinkPreview(card) {
  if (!isBookmarkLinkCard(card)) {
    return false;
  }

  return Boolean(
    card.image?.trim()
    || card.title?.trim()
    || card.description?.trim()
    || card.favicon?.trim()
    || card.siteName?.trim()
    || card.productAsin?.trim()
    || card.productPrice?.trim()
    || card.productDomain?.trim()
    || Number.isFinite(card.productRating)
    || Number.isFinite(card.productReviewCount),
  );
}

export function shouldRecoverLinkPreviewCard(card) {
  if (!canRefreshLinkPreviewCard(card)) {
    return false;
  }

  return card.status === "failed"
    || card.status !== "ready"
    || Boolean(card.previewError?.trim())
    || !hasUsableLinkPreview(card);
}

export function createLinkPreviewRefreshPatch(card) {
  if (!isBookmarkLinkCard(card)) {
    return null;
  }

  return {
    type: TILE_TYPES.LINK,
    contentKind: LINK_CONTENT_KIND_BOOKMARK,
    status: "loading",
    previewKind: "default",
    previewError: "",
    image: "",
    productAsin: "",
    productPrice: "",
    productDomain: "",
    productRating: null,
    productReviewCount: null,
  };
}

export function isEditableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return Boolean(element.closest("input, textarea, [contenteditable='true']"));
}

export function formatCardSubtitle(card) {
  if (card.type === RACK_CARD_TYPE) {
    const tileCount = card.tileIds.length;
    return `${tileCount} ${tileCount === 1 ? "tile" : "tiles"} on rack`;
  }

  if (card.type === AMAZON_PRODUCT_CARD_TYPE) {
    return firstString(card.productPrice, card.productDomain, getDomainLabel(card.url), "Amazon");
  }

  if (isImageLinkCard(card)) {
    return firstString(card.siteName, "Image");
  }

  return firstString(card.siteName, getDomainLabel(card.url), "Link");
}

function getLegacyFolderZoneRect(folderCard) {
  const width = Math.max(
    LEGACY_FOLDER_ZONE_MIN_WIDTH,
    (Number.isFinite(folderCard?.width) ? folderCard.width : 340) + 220,
  );
  const left = (Number.isFinite(folderCard?.x) ? folderCard.x : 120)
    - Math.round((width - (Number.isFinite(folderCard?.width) ? folderCard.width : 340)) / 2);
  const top = (Number.isFinite(folderCard?.y) ? folderCard.y : 120)
    + (Number.isFinite(folderCard?.height) ? folderCard.height : 236)
    + LEGACY_FOLDER_ZONE_GAP;

  return { left, top };
}

function flattenLegacyFolderCards(cards) {
  const sourceCards = Array.isArray(cards) ? cards : [];
  const nextCards = sourceCards.map((card) => ({ ...card }));
  const cardById = new Map(nextCards.map((card) => [card.id, card]));
  const legacyFolders = nextCards.filter((card) => card?.type === LEGACY_FOLDER_CARD_TYPE);

  legacyFolders.forEach((folderCard) => {
    const zoneOrigin = getLegacyFolderZoneRect(folderCard);
    const childIds = normalizeLegacyFolderChildIds(folderCard?.childIds);
    const childLayouts = normalizeLegacyFolderChildLayouts(childIds, folderCard?.childLayouts);

    childIds.forEach((childId, index) => {
      const childCard = cardById.get(childId);

      if (!childCard) {
        return;
      }

      const fallbackLayout = {
        x: 36 + ((index + 1) % 3) * 220,
        y: 36 + Math.floor(index / 3) * 182,
      };
      const localLayout = childLayouts[childId] ?? fallbackLayout;

      childCard.x = zoneOrigin.left + (Number.isFinite(localLayout.x) ? localLayout.x : fallbackLayout.x);
      childCard.y = zoneOrigin.top + (Number.isFinite(localLayout.y) ? localLayout.y : fallbackLayout.y);
      childCard.updatedAt = typeof childCard.updatedAt === "string" ? childCard.updatedAt : nowIso();
    });
  });

  return nextCards.filter((card) => card?.type !== LEGACY_FOLDER_CARD_TYPE);
}
