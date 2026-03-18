export const NOTE_FOLDER_CARD_TYPE = "note-folder";
export const FOLDER_CARD_TYPE = "folder";
export const RACK_CARD_TYPE = "rack";
export const NOTE_STYLE_ONE = "notes-1";
export const NOTE_STYLE_TWO = "notes-2";
export const NOTE_STYLE_THREE = "notes-3";
export const WORKSPACE_SCHEMA_VERSION = 4;
export const RACK_MIN_SLOTS = 3;
export const RACK_SLOT_WIDTH = 216;
export const RACK_LEFT_CAP_WIDTH = 94;
export const RACK_RIGHT_CAP_WIDTH = 94;
export const RACK_HEIGHT = 126;
export const RACK_TILE_BASELINE = 44;

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

const FOLDER_CARD_SIZE = Object.freeze({
  width: 340,
  height: 236,
});

const RACK_CARD_SIZE = Object.freeze({
  width: RACK_LEFT_CAP_WIDTH + RACK_RIGHT_CAP_WIDTH + (RACK_SLOT_WIDTH * RACK_MIN_SLOTS),
  height: RACK_HEIGHT,
});

const NOTE_FOLDER_DEFAULT_TITLE = "Daily memo";
const NOTE_FOLDER_DEFAULT_DESCRIPTION = "Notes & Journaling";
const FOLDER_DEFAULT_TITLE = "Folder";
const FOLDER_DEFAULT_DESCRIPTION = "Grouped tiles";
const RACK_DEFAULT_TITLE = "Rack";
const RACK_DEFAULT_DESCRIPTION = "Mounted display rack";

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

  if (card?.type === RACK_CARD_TYPE) {
    return RACK_CARD_TYPE;
  }

  if (card?.type === FOLDER_CARD_TYPE) {
    return FOLDER_CARD_TYPE;
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

function normalizeFolderChildIds(childIds) {
  return Array.isArray(childIds)
    ? [...new Set(childIds.filter((childId) => typeof childId === "string" && childId.trim().length > 0))]
    : [];
}

function normalizeRackTileIds(tileIds) {
  return Array.isArray(tileIds)
    ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
    : [];
}

function normalizeFolderChildLayouts(childIds, childLayouts) {
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

  if (type === RACK_CARD_TYPE) {
    return RACK_CARD_SIZE;
  }

  if (type === FOLDER_CARD_TYPE) {
    return FOLDER_CARD_SIZE;
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
    version: WORKSPACE_SCHEMA_VERSION,
    viewport: { ...DEFAULT_VIEWPORT },
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
    && tile.type !== RACK_CARD_TYPE
    && tile.type !== FOLDER_CARD_TYPE,
  );
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
  const rackTileIds = type === RACK_CARD_TYPE ? normalizeRackTileIds(card?.tileIds) : [];
  const childIds = type === FOLDER_CARD_TYPE ? normalizeFolderChildIds(card?.childIds) : [];
  const childLayouts = type === FOLDER_CARD_TYPE
    ? normalizeFolderChildLayouts(childIds, card?.childLayouts)
    : {};
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
    text: type === "text" ? String(card?.text ?? "") : "",
    secondaryText: type === "text" ? String(card?.secondaryText ?? "") : "",
    noteStyle: type === "text" ? noteStyle : "",
    quoteAuthor: type === "text" ? String(card?.quoteAuthor ?? "") : "",
    url: type === "link" ? String(card?.url ?? "") : "",
    title: type === "link"
      ? String(card?.title ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.title, RACK_DEFAULT_TITLE)
      : type === FOLDER_CARD_TYPE
        ? firstString(card?.title, FOLDER_DEFAULT_TITLE)
      : type === NOTE_FOLDER_CARD_TYPE
        ? firstString(card?.title, getFolderTitleFromNotes(notes), NOTE_FOLDER_DEFAULT_TITLE)
        : "",
    description: type === "link"
      ? String(card?.description ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.description, RACK_DEFAULT_DESCRIPTION)
      : type === FOLDER_CARD_TYPE
        ? firstString(card?.description, FOLDER_DEFAULT_DESCRIPTION)
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
    tileIds: rackTileIds,
    minSlots: type === RACK_CARD_TYPE
      ? Math.max(RACK_MIN_SLOTS, Number.isFinite(card?.minSlots) ? card.minSlots : RACK_MIN_SLOTS)
      : null,
    childIds,
    childLayouts,
    parentRackId: type !== RACK_CARD_TYPE && typeof card?.parentRackId === "string" && card.parentRackId.trim().length > 0
      ? card.parentRackId
      : null,
    rackIndex: type !== RACK_CARD_TYPE && Number.isFinite(card?.rackIndex)
      ? Math.max(0, Math.round(card.rackIndex))
      : null,
    notes,
    createdAt,
    updatedAt,
  };
}

export function normalizeWorkspace(workspace) {
  const safeWorkspace = migrateWorkspace(workspace && typeof workspace === "object"
    ? workspace
    : createEmptyWorkspace());

  return {
    version: WORKSPACE_SCHEMA_VERSION,
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

  return nextWorkspace;
}

function updateFolderChildren(folderCard, nextChildIds, nextChildLayouts = folderCard.childLayouts) {
  return normalizeCard({
    ...folderCard,
    childIds: nextChildIds,
    childLayouts: nextChildLayouts,
    updatedAt: nowIso(),
  });
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

function detachTileFromFolders(cards, tileId) {
  return cards.map((card) => {
    if (card.type !== FOLDER_CARD_TYPE || !card.childIds.includes(tileId)) {
      return card;
    }

    const nextChildIds = card.childIds.filter((childId) => childId !== tileId);
    const nextChildLayouts = Object.fromEntries(
      Object.entries(card.childLayouts).filter(([childId]) => childId !== tileId),
    );

    return updateFolderChildren(card, nextChildIds, nextChildLayouts);
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
  const folderChildIds = new Set(
    cards
      .filter((card) => card.type === FOLDER_CARD_TYPE)
      .flatMap((card) => card.childIds),
  );

  return cards.filter((card) => !folderChildIds.has(card.id) && !card.parentRackId);
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

export function createNoteFolderCard(cards, viewport, preferredCenter = null, options = {}) {
  const title = firstString(options?.title, NOTE_FOLDER_DEFAULT_TITLE);
  const description = firstString(options?.description, NOTE_FOLDER_DEFAULT_DESCRIPTION);
  const notes = normalizeFolderNotes(options?.notes);
  const position = getNextCardPosition(cards, viewport, NOTE_FOLDER_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: NOTE_FOLDER_CARD_TYPE,
    title,
    description,
    notes,
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createFolderCard(cards, viewport, preferredCenter = null, options = {}) {
  const title = firstString(options?.title, FOLDER_DEFAULT_TITLE);
  const description = firstString(options?.description, FOLDER_DEFAULT_DESCRIPTION);
  const childIds = normalizeFolderChildIds(options?.childIds);
  const childLayouts = normalizeFolderChildLayouts(childIds, options?.childLayouts);
  const position = getNextCardPosition(cards, viewport, FOLDER_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: FOLDER_CARD_TYPE,
    title,
    description,
    childIds,
    childLayouts,
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
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

export function getFolderByChildId(cards, childId) {
  return cards.find((card) => card.type === FOLDER_CARD_TYPE && card.childIds.includes(childId)) ?? null;
}

export function getRackByTileId(cards, tileId) {
  return cards.find((card) => card.type === RACK_CARD_TYPE && card.tileIds.includes(tileId)) ?? null;
}

export function createFolderFromTiles(cards, sourceCardId, targetCardId) {
  if (!sourceCardId || !targetCardId || sourceCardId === targetCardId) {
    return null;
  }

  const sourceCard = cards.find((card) => card.id === sourceCardId);
  const targetCard = cards.find((card) => card.id === targetCardId);

  if (
    !sourceCard
    || !targetCard
    || sourceCard.type === FOLDER_CARD_TYPE
    || sourceCard.type === RACK_CARD_TYPE
    || targetCard.type === RACK_CARD_TYPE
  ) {
    return null;
  }

  if (targetCard.type === FOLDER_CARD_TYPE) {
    return addTileToFolder(cards, sourceCardId, targetCardId);
  }

  const cleanedCards = detachTileFromRacks(
    detachTileFromRacks(
      detachTileFromFolders(detachTileFromFolders(cards, sourceCardId), targetCardId),
      sourceCardId,
    ),
    targetCardId,
  );
  const timestamp = nowIso();
  const folderCard = normalizeCard({
    id: crypto.randomUUID(),
    type: FOLDER_CARD_TYPE,
    title: FOLDER_DEFAULT_TITLE,
    description: FOLDER_DEFAULT_DESCRIPTION,
    childIds: [targetCardId, sourceCardId],
    childLayouts: {
      [targetCardId]: { x: 32, y: 30 },
      [sourceCardId]: { x: 240, y: 58 },
    },
    x: targetCard.x,
    y: targetCard.y,
    width: FOLDER_CARD_SIZE.width,
    height: FOLDER_CARD_SIZE.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return {
    cards: [...cleanedCards, folderCard],
    folderCard,
  };
}

export function addTileToFolder(cards, tileId, folderId, folderPosition = null) {
  if (!tileId || !folderId || tileId === folderId) {
    return null;
  }

  const tile = cards.find((card) => card.id === tileId);
  const folderCard = cards.find((card) => card.id === folderId && card.type === FOLDER_CARD_TYPE);

  if (!tile || !folderCard || tile.type === FOLDER_CARD_TYPE || tile.type === RACK_CARD_TYPE || folderCard.childIds.includes(tileId)) {
    return null;
  }

  const cleanedCards = detachTileFromRacks(detachTileFromFolders(cards, tileId), tileId);
  const latestFolderCard = cleanedCards.find((card) => card.id === folderId && card.type === FOLDER_CARD_TYPE);

  if (!latestFolderCard) {
    return null;
  }

  const nextChildIds = [...latestFolderCard.childIds, tileId];
  const nextChildLayouts = {
    ...latestFolderCard.childLayouts,
    [tileId]: {
      x: Number.isFinite(folderPosition?.x) ? folderPosition.x : 36 + (nextChildIds.length % 3) * 220,
      y: Number.isFinite(folderPosition?.y) ? folderPosition.y : 36 + Math.floor((nextChildIds.length - 1) / 3) * 182,
    },
  };
  const nextFolderCard = updateFolderChildren(latestFolderCard, nextChildIds, nextChildLayouts);

  return {
    cards: cleanedCards.map((card) => (card.id === folderId ? nextFolderCard : card)),
    folderCard: nextFolderCard,
  };
}

export function removeTileFromFolder(cards, tileId, folderId, dropPosition = null) {
  if (!tileId || !folderId) {
    return null;
  }

  const folderCard = cards.find((card) => card.id === folderId && card.type === FOLDER_CARD_TYPE);
  const tile = cards.find((card) => card.id === tileId);

  if (!folderCard || !tile || !folderCard.childIds.includes(tileId)) {
    return null;
  }

  const nextChildIds = folderCard.childIds.filter((childId) => childId !== tileId);
  const nextChildLayouts = Object.fromEntries(
    Object.entries(folderCard.childLayouts).filter(([childId]) => childId !== tileId),
  );
  const nextFolderCard = updateFolderChildren(folderCard, nextChildIds, nextChildLayouts);

  return {
    cards: cards.map((card) => {
      if (card.id === folderId) {
        return nextFolderCard;
      }

      if (card.id === tileId) {
        return normalizeCard({
          ...card,
          x: Number.isFinite(dropPosition?.x) ? dropPosition.x : card.x,
          y: Number.isFinite(dropPosition?.y) ? dropPosition.y : card.y,
          updatedAt: nowIso(),
        });
      }

      return card;
    }),
    folderCard: nextFolderCard,
    tile: normalizeCard({
      ...tile,
      x: Number.isFinite(dropPosition?.x) ? dropPosition.x : tile.x,
      y: Number.isFinite(dropPosition?.y) ? dropPosition.y : tile.y,
    }),
  };
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

  const cleanedCards = detachTileFromRacks(detachTileFromFolders(cards, tileId), tileId);
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

  return nextCards.map((card, index) => normalizeCard(card, index));
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
  const queue = [cardId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const currentCard = cards.find((card) => card.id === currentId);

    if (!currentCard || currentCard.type !== FOLDER_CARD_TYPE) {
      continue;
    }

    for (const childId of currentCard.childIds) {
      if (!idsToRemove.has(childId)) {
        idsToRemove.add(childId);
        queue.push(childId);
      }
    }
  }

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

      if (card.type !== FOLDER_CARD_TYPE) {
        return card;
      }

      const nextChildIds = card.childIds.filter((childId) => !idsToRemove.has(childId));
      const nextChildLayouts = Object.fromEntries(
        Object.entries(card.childLayouts).filter(([childId]) => !idsToRemove.has(childId)),
      );

      return nextChildIds.length === card.childIds.length
        ? card
        : updateFolderChildren(card, nextChildIds, nextChildLayouts);
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

  if (card.type === FOLDER_CARD_TYPE) {
    const childCount = card.childIds.length;
    return `${childCount} ${childCount === 1 ? "tile" : "tiles"}`;
  }

  if (card.type === RACK_CARD_TYPE) {
    const tileCount = card.tileIds.length;
    return `${tileCount} ${tileCount === 1 ? "tile" : "tiles"} on rack`;
  }

  if (card.type === NOTE_FOLDER_CARD_TYPE) {
    const noteCount = card.notes.length;
    return `${noteCount} ${noteCount === 1 ? "note" : "notes"}`;
  }

  return firstString(card.siteName, getDomainLabel(card.url), "Link");
}
