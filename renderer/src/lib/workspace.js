export const NOTE_FOLDER_CARD_TYPE = "note-folder";
export const NOTE_STYLE_ONE = "notes-1";
export const NOTE_STYLE_TWO = "notes-2";
export const NOTE_STYLE_THREE = "notes-3";

const DEFAULT_VIEWPORT = Object.freeze({
  x: 180,
  y: 120,
  zoom: 1,
});

const TEXT_CARD_SIZE = Object.freeze({
  width: 428,
  height: 540,
});

const QUOTE_TEXT_CARD_SIZE = Object.freeze({
  width: 452,
  height: 468,
});

const LINK_CARD_SIZE = Object.freeze({
  width: 340,
  height: 280,
});

const NOTE_FOLDER_CARD_SIZE = Object.freeze({
  width: 360,
  height: 284,
});

const NOTE_FOLDER_DEFAULT_TITLE = "Daily memo";
const NOTE_FOLDER_DEFAULT_DESCRIPTION = "Notes & Journaling";

function nowIso() {
  return new Date().toISOString();
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function getCardType(card) {
  if (card?.type === "link") {
    return "link";
  }

  if (card?.type === NOTE_FOLDER_CARD_TYPE) {
    return NOTE_FOLDER_CARD_TYPE;
  }

  return "text";
}

function stripNoteLine(line) {
  return String(line ?? "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^(?:[-*•]\s*)?\[(?:\s|x|X)\]\s+/, "")
    .replace(/^(?:[-*•]\s+)/, "")
    .trim();
}

function getTextCardHeadline(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(stripNoteLine)
    .find(Boolean) ?? "";
}

function normalizeFolderNote(note, fallbackIndex = 0) {
  const createdAt = typeof note?.createdAt === "string" ? note.createdAt : nowIso();
  const updatedAt = typeof note?.updatedAt === "string" ? note.updatedAt : createdAt;

  return {
    id: typeof note?.id === "string" ? note.id : `note-${fallbackIndex}-${Date.now()}`,
    text: String(note?.text ?? ""),
    secondaryText: String(note?.secondaryText ?? ""),
    noteStyle: typeof note?.noteStyle === "string" ? note.noteStyle : NOTE_STYLE_TWO,
    quoteAuthor: String(note?.quoteAuthor ?? ""),
    createdAt,
    updatedAt,
  };
}

function normalizeFolderNotes(notes) {
  return Array.isArray(notes)
    ? notes.map((note, index) => normalizeFolderNote(note, index))
    : [];
}

function getFolderTitleFromNotes(notes) {
  return firstString(
    ...notes.map((note) => getTextCardHeadline(note.text)),
    NOTE_FOLDER_DEFAULT_TITLE,
  );
}

function cardToFolderNote(card) {
  return normalizeFolderNote({
    id: card.id,
    text: card.text,
    secondaryText: card.secondaryText,
    noteStyle: card.noteStyle,
    quoteAuthor: card.quoteAuthor,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  });
}

function getTextCardSize(noteStyle) {
  return noteStyle === NOTE_STYLE_THREE ? QUOTE_TEXT_CARD_SIZE : TEXT_CARD_SIZE;
}

function getCardSize(type, noteStyle = "") {
  if (type === "link") {
    return LINK_CARD_SIZE;
  }

  if (type === NOTE_FOLDER_CARD_TYPE) {
    return NOTE_FOLDER_CARD_SIZE;
  }

  return getTextCardSize(noteStyle);
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
  const type = getCardType(card);
  const noteStyle = type === "text" && typeof card?.noteStyle === "string"
    ? card.noteStyle
    : NOTE_STYLE_TWO;
  const size = getCardSize(type, noteStyle);
  const createdAt = typeof card?.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card?.updatedAt === "string" ? card.updatedAt : createdAt;
  const notes = type === NOTE_FOLDER_CARD_TYPE ? normalizeFolderNotes(card?.notes) : [];

  return {
    id: typeof card?.id === "string" ? card.id : `card-${fallbackIndex}-${Date.now()}`,
    type,
    x: Number.isFinite(card?.x) ? card.x : 120,
    y: Number.isFinite(card?.y) ? card.y : 120,
    width: Number.isFinite(card?.width) ? card.width : size.width,
    height: Number.isFinite(card?.height) ? card.height : size.height,
    text: type === "text" ? String(card?.text ?? "") : "",
    secondaryText: type === "text" ? String(card?.secondaryText ?? "") : "",
    noteStyle: type === "text" ? noteStyle : "",
    quoteAuthor: type === "text" ? String(card?.quoteAuthor ?? "") : "",
    url: type === "link" ? String(card?.url ?? "") : "",
    title: type === "link"
      ? String(card?.title ?? "")
      : type === NOTE_FOLDER_CARD_TYPE
        ? firstString(card?.title, getFolderTitleFromNotes(notes), NOTE_FOLDER_DEFAULT_TITLE)
        : "",
    description: type === "link"
      ? String(card?.description ?? "")
      : type === NOTE_FOLDER_CARD_TYPE
        ? firstString(card?.description, NOTE_FOLDER_DEFAULT_DESCRIPTION)
        : "",
    image: type === "link" ? String(card?.image ?? "") : "",
    favicon: type === "link" ? String(card?.favicon ?? "") : "",
    siteName: type === "link" ? String(card?.siteName ?? "") : "",
    previewKind: type === "link" && card?.previewKind === "music" ? "music" : "default",
    status: type === "link" && ["loading", "ready", "failed"].includes(card?.status)
      ? card.status
      : "idle",
    notes,
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
    a.x + a.width < b.x
    || b.x + b.width < a.x
    || a.y + a.height < b.y
    || b.y + b.height < a.y
  );
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

function getCenteredCardPosition(cards, preferredCenter, type, noteStyle = "") {
  const size = getCardSize(type, noteStyle);
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

export function getNextCardPosition(cards, viewport, type, preferredCenter = null, noteStyle = "") {
  if (preferredCenter && Number.isFinite(preferredCenter.x) && Number.isFinite(preferredCenter.y)) {
    return getCenteredCardPosition(cards, preferredCenter, type, noteStyle);
  }

  const size = getCardSize(type, noteStyle);
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

export function createTextCard(cards, viewport, text = "", preferredCenter = null, options = {}) {
  const noteStyle = typeof options?.noteStyle === "string" ? options.noteStyle : NOTE_STYLE_TWO;
  const quoteAuthor = typeof options?.quoteAuthor === "string" ? options.quoteAuthor : "";
  const secondaryText = typeof options?.secondaryText === "string" ? options.secondaryText : "";
  const position = getNextCardPosition(cards, viewport, "text", preferredCenter, noteStyle);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: "text",
    text,
    secondaryText,
    noteStyle,
    quoteAuthor,
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
    previewKind: "default",
    status: "loading",
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function mergeCardIntoNoteFolder(cards, sourceCardId, targetCardId) {
  if (!sourceCardId || !targetCardId || sourceCardId === targetCardId) {
    return null;
  }

  const sourceCard = cards.find((card) => card.id === sourceCardId);
  const targetCard = cards.find((card) => card.id === targetCardId);

  if (!sourceCard || !targetCard || sourceCard.type !== "text") {
    return null;
  }

  if (targetCard.type !== "text" && targetCard.type !== NOTE_FOLDER_CARD_TYPE) {
    return null;
  }

  const timestamp = nowIso();
  const folderCard = targetCard.type === NOTE_FOLDER_CARD_TYPE
    ? normalizeCard({
      ...targetCard,
      notes: [...targetCard.notes, cardToFolderNote(sourceCard)],
      updatedAt: timestamp,
    })
    : normalizeCard({
      id: crypto.randomUUID(),
      type: NOTE_FOLDER_CARD_TYPE,
      x: targetCard.x,
      y: targetCard.y,
      width: NOTE_FOLDER_CARD_SIZE.width,
      height: NOTE_FOLDER_CARD_SIZE.height,
      title: getFolderTitleFromNotes([cardToFolderNote(targetCard), cardToFolderNote(sourceCard)]),
      description: NOTE_FOLDER_DEFAULT_DESCRIPTION,
      notes: [cardToFolderNote(targetCard), cardToFolderNote(sourceCard)],
      createdAt: targetCard.createdAt,
      updatedAt: timestamp,
    });

  const nextCards = [];

  for (const card of cards) {
    if (card.id === sourceCardId) {
      continue;
    }

    if (card.id === targetCardId) {
      nextCards.push(folderCard);
      continue;
    }

    nextCards.push(card);
  }

  return {
    cards: nextCards,
    folderCard,
  };
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

export function updateCards(cards, updatesById) {
  return cards.map((card) => {
    const updates = updatesById?.[card.id];

    if (!updates) {
      return card;
    }

    return normalizeCard({
      ...card,
      ...updates,
      updatedAt: nowIso(),
    });
  });
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

  if (card.type === NOTE_FOLDER_CARD_TYPE) {
    const noteCount = card.notes.length;
    return `${noteCount} ${noteCount === 1 ? "note" : "notes"}`;
  }

  return firstString(card.siteName, getDomainLabel(card.url), "Link");
}
