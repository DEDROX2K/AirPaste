const DEFAULT_VIEWPORT = Object.freeze({
  x: 180,
  y: 120,
  zoom: 1,
});

const TEXT_CARD_SIZE = Object.freeze({
  width: 300,
  height: 220,
});

const LINK_CARD_SIZE = Object.freeze({
  width: 340,
  height: 280,
});

function nowIso() {
  return new Date().toISOString();
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
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
    version: 1,
    viewport: { ...DEFAULT_VIEWPORT },
    cards: [],
  };
}

export function normalizeCard(card, fallbackIndex = 0) {
  const type = card?.type === "link" ? "link" : "text";
  const size = type === "link" ? LINK_CARD_SIZE : TEXT_CARD_SIZE;
  const createdAt = typeof card?.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card?.updatedAt === "string" ? card.updatedAt : createdAt;

  return {
    id: typeof card?.id === "string" ? card.id : `card-${fallbackIndex}-${Date.now()}`,
    type,
    x: Number.isFinite(card?.x) ? card.x : 120,
    y: Number.isFinite(card?.y) ? card.y : 120,
    width: Number.isFinite(card?.width) ? card.width : size.width,
    height: Number.isFinite(card?.height) ? card.height : size.height,
    text: type === "text" ? String(card?.text ?? "") : "",
    url: type === "link" ? String(card?.url ?? "") : "",
    title: type === "link" ? String(card?.title ?? "") : "",
    description: type === "link" ? String(card?.description ?? "") : "",
    image: type === "link" ? String(card?.image ?? "") : "",
    favicon: type === "link" ? String(card?.favicon ?? "") : "",
    siteName: type === "link" ? String(card?.siteName ?? "") : "",
    status: type === "link" && ["loading", "ready", "failed"].includes(card?.status)
      ? card.status
      : "idle",
    createdAt,
    updatedAt,
  };
}

export function normalizeWorkspace(workspace) {
  const safeWorkspace = workspace && typeof workspace === "object"
    ? workspace
    : createEmptyWorkspace();

  return {
    version: 1,
    viewport: {
      x: Number.isFinite(safeWorkspace.viewport?.x) ? safeWorkspace.viewport.x : DEFAULT_VIEWPORT.x,
      y: Number.isFinite(safeWorkspace.viewport?.y) ? safeWorkspace.viewport.y : DEFAULT_VIEWPORT.y,
      zoom: Number.isFinite(safeWorkspace.viewport?.zoom) ? safeWorkspace.viewport.zoom : DEFAULT_VIEWPORT.zoom,
    },
    cards: Array.isArray(safeWorkspace.cards)
      ? safeWorkspace.cards.map((card, index) => normalizeCard(card, index))
      : [],
  };
}

function intersects(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function getCardSize(type) {
  return type === "link" ? LINK_CARD_SIZE : TEXT_CARD_SIZE;
}

function hasCollision(cards, candidate) {
  return cards.some((card) =>
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

export function getNextCardPosition(cards, viewport, type, preferredCenter = null) {
  if (preferredCenter && Number.isFinite(preferredCenter.x) && Number.isFinite(preferredCenter.y)) {
    return getCenteredCardPosition(cards, preferredCenter, type);
  }

  const size = type === "link" ? LINK_CARD_SIZE : TEXT_CARD_SIZE;
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

export function createTextCard(cards, viewport, text = "", preferredCenter = null) {
  const position = getNextCardPosition(cards, viewport, "text", preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: "text",
    text,
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createLinkCard(cards, viewport, url, preferredCenter = null) {
  const position = getNextCardPosition(cards, viewport, "link", preferredCenter);
  const timestamp = nowIso();
  const domain = getDomainLabel(url);

  return normalizeCard({
    id: crypto.randomUUID(),
    type: "link",
    url,
    title: "",
    siteName: domain,
    description: "",
    image: "",
    favicon: "",
    status: "loading",
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function updateCard(cards, cardId, updates) {
  return cards.map((card) =>
    card.id === cardId
      ? normalizeCard({
        ...card,
        ...updates,
        updatedAt: nowIso(),
      })
      : card);
}

export function removeCard(cards, cardId) {
  return cards.filter((card) => card.id !== cardId);
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

export function isEditableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return Boolean(element.closest("input, textarea, [contenteditable='true']"));
}

export function formatCardSubtitle(card) {
  if (card.type === "text") {
    return "Text note";
  }

  return firstString(card.siteName, getDomainLabel(card.url), "Link");
}
