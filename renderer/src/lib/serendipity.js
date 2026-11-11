// Serendipity: a slow shuffle through tiles saved across every canvas, so old
// saves resurface. Pure helpers live here (picking, weighting, removing and
// restoring a tile); the disk round trip goes through AppProvider's
// rewriteCanvasFile so open-canvas caches stay in sync.
import { TILE_TYPES } from "../tiles/tileTypes";
import { STICKY_COLORS } from "../tiles/sticky/model";
import {
  addTileToRack,
  getDomainLabel,
  isImageLinkCard,
  normalizeWorkspace,
  removeCard,
  removeStructuredEntriesForTileIds,
  untetherTile,
} from "./workspace";

export const SERENDIPITY_DECK_SIZE = 24;
const SHOWN_STORAGE_KEY = "airpaste.serendipity.shown";
const DAY_MS = 24 * 60 * 60 * 1000;
// A tile shown in the last few days is much less likely to come back soon.
const RECENTLY_SHOWN_WINDOW_MS = 3 * DAY_MS;
const RECENTLY_SHOWN_WEIGHT = 0.08;
const MAX_REMEMBERED_SHOWN = 400;

const LINK_LIKE_TYPES = new Set([TILE_TYPES.LINK, TILE_TYPES.AMAZON_PRODUCT, TILE_TYPES.GITHUB_REPO]);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** Saves worth resurfacing: links, images, files, notes and lists — not widgets like clocks or counters. */
export function isSerendipityCard(card) {
  if (!card || typeof card !== "object") {
    return false;
  }

  if (LINK_LIKE_TYPES.has(card.type)) {
    return hasText(card.url) || hasText(card.image) || hasText(card.asset?.relativePath);
  }

  switch (card.type) {
    case TILE_TYPES.FILE:
      return hasText(card.file?.relativePath);
    case TILE_TYPES.PAPER_NOTE:
      return hasText(card.title) || hasText(card.text);
    case TILE_TYPES.CANVAS_TEXT:
      return !card.placeholder && (hasText(card.text) || hasText(card.title));
    case TILE_TYPES.CODE:
      return hasText(card.code);
    case TILE_TYPES.CHECKLIST:
      return Array.isArray(card.items) && card.items.some((item) => hasText(item?.text));
    default:
      return false;
  }
}

/** What kind of face a card gets in the Serendipity view. */
export function getSerendipityKind(card) {
  if (isImageLinkCard(card)) return "image";
  if (LINK_LIKE_TYPES.has(card?.type)) return "link";
  if (card?.type === TILE_TYPES.FILE) return "file";
  if (card?.type === TILE_TYPES.CODE) return "code";
  if (card?.type === TILE_TYPES.CHECKLIST) return "checklist";
  if (card?.type === TILE_TYPES.CANVAS_TEXT && card.variant === "sticky") return "sticky";
  return "note";
}

export function getStickyHex(card) {
  return STICKY_COLORS.find((color) => color.id === card?.sticky?.color)?.hex ?? STICKY_COLORS[0].hex;
}

function entryKey(filePath, cardId) {
  return `${filePath}::${cardId}`;
}

/**
 * Flattens loaded canvases into Serendipity entries.
 * `docs` are loadCanvas results ({ filePath, name, workspace }).
 */
export function collectSerendipityEntries(docs) {
  const entries = [];

  (Array.isArray(docs) ? docs : []).forEach((doc) => {
    if (!doc?.filePath || !doc.workspace) {
      return;
    }

    const workspace = normalizeWorkspace(doc.workspace);
    workspace.pages.forEach((page) => {
      page.cards.forEach((card) => {
        if (!isSerendipityCard(card)) {
          return;
        }

        entries.push({
          key: entryKey(doc.filePath, card.id),
          card,
          canvasFilePath: doc.filePath,
          canvasName: doc.name || workspace.name || "Canvas",
          pageId: page.id,
          pageName: workspace.pages.length > 1 ? page.name : "",
          savedAt: card.createdAt || card.updatedAt || "",
        });
      });
    });
  });

  return entries;
}

function getEntryWeight(entry, now, shownAt) {
  const savedTime = Date.parse(entry.savedAt);
  const ageDays = Number.isFinite(savedTime) ? Math.max(0, (now - savedTime) / DAY_MS) : 30;
  // Older saves surface more often: a year-old tile is ~8x as likely as
  // one saved today, without today's saves disappearing entirely.
  let weight = 1 + Math.sqrt(ageDays / 6);

  const lastShown = shownAt?.[entry.key];
  if (Number.isFinite(lastShown) && now - lastShown < RECENTLY_SHOWN_WINDOW_MS) {
    weight *= RECENTLY_SHOWN_WEIGHT;
  }

  return weight;
}

/**
 * Weighted sample without replacement (Efraimidis–Spirakis): each entry
 * draws u^(1/w) and the highest draws win, so heavier entries tend to come
 * first while every entry can still appear.
 */
export function pickSerendipityDeck(entries, {
  limit = SERENDIPITY_DECK_SIZE,
  now = Date.now(),
  shownAt = null,
  random = Math.random,
} = {}) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const weight = getEntryWeight(entry, now, shownAt);
      return { entry, score: Math.pow(Math.max(random(), Number.EPSILON), 1 / weight) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map(({ entry }) => entry);
}

/**
 * Removes one tile (and its tethers/edges/group membership) from a page.
 * Returns { workspace, removed } or null when the tile is already gone.
 * `removed` holds what restoreSerendipityCard needs to put it back.
 */
export function removeSerendipityCard(workspace, pageId, cardId) {
  const normalized = normalizeWorkspace(workspace);
  // Prefer the page it was found on, but follow it if it has since moved.
  const hasCard = (candidate) => candidate.cards.some((card) => card.id === cardId);
  const page = normalized.pages.find((candidate) => candidate.id === pageId && hasCard(candidate))
    ?? normalized.pages.find(hasCard);
  const card = page?.cards.find((candidate) => candidate.id === cardId);

  if (!page || !card) {
    return null;
  }

  const rack = card.parentRackId
    ? page.cards.find((candidate) => candidate.id === card.parentRackId)
    : null;
  const removed = {
    pageId: page.id,
    card,
    index: page.cards.indexOf(card),
    tethers: (page.tethers ?? []).filter((tether) => tether.a === cardId || tether.b === cardId),
    rackId: rack?.id ?? null,
    rackIndex: rack ? rack.tileIds.indexOf(cardId) : null,
  };
  const nextPage = {
    ...untetherTile(page, cardId),
    cards: removeCard(page.cards, cardId),
    edges: removeStructuredEntriesForTileIds(page.edges, [cardId]),
    groups: removeStructuredEntriesForTileIds(page.groups, [cardId]),
  };

  return {
    workspace: {
      ...normalized,
      pages: normalized.pages.map((candidate) => (candidate.id === page.id ? nextPage : candidate)),
    },
    removed,
  };
}

/** Puts a tile removed by removeSerendipityCard back where it was. */
export function restoreSerendipityCard(workspace, removed) {
  const normalized = normalizeWorkspace(workspace);
  const page = normalized.pages.find((candidate) => candidate.id === removed?.pageId);

  if (!page || !removed.card || page.cards.some((card) => card.id === removed.card.id)) {
    return null;
  }

  const cards = [...page.cards];
  cards.splice(Math.min(Math.max(0, removed.index), cards.length), 0, removed.card);
  const rackResult = removed.rackId
    ? addTileToRack(cards, removed.card.id, removed.rackId, removed.rackIndex)
    : null;
  const cardIds = new Set(cards.map((card) => card.id));
  const tethers = [
    ...(page.tethers ?? []),
    ...removed.tethers.filter((tether) => cardIds.has(tether.a) && cardIds.has(tether.b)),
  ];
  const nextPage = { ...page, cards: rackResult?.cards ?? cards, tethers };

  return {
    ...normalized,
    pages: normalized.pages.map((candidate) => (candidate.id === page.id ? nextPage : candidate)),
  };
}

// When each tile was last shown, kept per viewer so a fresh shuffle leans
// toward tiles not seen lately. Storage can be unavailable; that only makes
// the shuffle a little less varied.
export function readShownAt() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SHOWN_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberShown(key, now = Date.now()) {
  try {
    const shownAt = { ...readShownAt(), [key]: now };
    const trimmed = Object.entries(shownAt)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_REMEMBERED_SHOWN);
    window.localStorage.setItem(SHOWN_STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // Ignore storage failures.
  }
}

/** A short title for a card, for captions and tile faces. */
export function getEntryTitle(card) {
  const kind = getSerendipityKind(card);
  if (kind === "file") return card.file?.fileName || card.title || "File";
  if (kind === "link" || kind === "image") return card.title || getDomainLabel(card.url) || "";
  return card.title || "";
}

/** Whether a tile has somewhere to keep a note (links/images carry one; note tiles are their own text). */
export function canEditSerendipityNote(card) {
  return card?.type === TILE_TYPES.LINK || card?.type === TILE_TYPES.PAPER_NOTE || card?.type === TILE_TYPES.CANVAS_TEXT;
}

/** The note text a tile currently has (what the notes box shows). */
export function getSerendipityNote(card) {
  if (card?.type === TILE_TYPES.LINK) return card.note?.body ?? "";
  if (card?.type === TILE_TYPES.PAPER_NOTE || card?.type === TILE_TYPES.CANVAS_TEXT) return card.text ?? "";
  return "";
}

/**
 * Sets a tile's note: a link/image keeps it in `note.body` (shown as a noted
 * tile only if it was opened on the canvas); note tiles keep it as their text.
 * Returns { workspace, card } or null when the tile is gone or can't take one.
 */
export function updateSerendipityNote(workspace, pageId, cardId, text) {
  const normalized = normalizeWorkspace(workspace);
  const hasCard = (candidate) => candidate.cards.some((card) => card.id === cardId);
  const page = normalized.pages.find((candidate) => candidate.id === pageId && hasCard(candidate))
    ?? normalized.pages.find(hasCard);
  const card = page?.cards.find((candidate) => candidate.id === cardId);

  if (!page || !card || !canEditSerendipityNote(card)) {
    return null;
  }

  const nextCard = card.type === TILE_TYPES.LINK
    ? { ...card, note: { open: false, title: "", mediaWidth: null, mediaHeight: null, ...(card.note ?? {}), body: text } }
    : { ...card, text };
  const nextPage = { ...page, cards: page.cards.map((candidate) => (candidate.id === cardId ? nextCard : candidate)) };

  return {
    card: nextCard,
    workspace: {
      ...normalized,
      pages: normalized.pages.map((candidate) => (candidate.id === page.id ? nextPage : candidate)),
    },
  };
}
