// Stacks: select some tiles and press G (or right-click > Group) and they
// gather into one neat pile, each a touch askew with a mild shadow. A stacked
// tile is inert: clicking, dragging and selecting it do nothing. The only way
// out is right-click > Ungroup, which puts every tile back where it was.
//
// Each stacked card carries `stack`:
//   { id, order, tilt, homeX, homeY }
// id     which pile it's in
// order  its place in the pile (0 = bottom)
// tilt   its small rotation, degrees
// homeX / homeY  where it sat before stacking, restored on ungroup
// Its own x / y are moved onto the pile, so everything that reads positions
// (rendering, culling, hit tests, saving) needs nothing special.

export const STACK = Object.freeze({
  MAX_TILT_DEG: 4,
  MAX_OFFSET_PX: 9,
});

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// A stable value in [-1, 1] for a card in a pile, so a pile looks the same
// every time it's drawn.
function jitter(seed) {
  return ((hashString(seed) % 2001) / 1000) - 1;
}

export function normalizeTileStack(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id.trim()) {
    return null;
  }

  const tilt = Number.isFinite(value.tilt) ? value.tilt : 0;

  return {
    id: value.id,
    order: Number.isFinite(value.order) ? Math.max(0, Math.round(value.order)) : 0,
    tilt: Math.max(-STACK.MAX_TILT_DEG, Math.min(STACK.MAX_TILT_DEG, tilt)),
    homeX: Number.isFinite(value.homeX) ? value.homeX : null,
    homeY: Number.isFinite(value.homeY) ? value.homeY : null,
  };
}

export function isStackedCard(card) {
  return Boolean(card?.stack?.id);
}

// Piles `tileIds` (in their current draw order) on the centre of their
// bounds. The stacked cards move to the end of the list, in pile order, so
// the pile draws above the board and bottom-to-top. Tiles that were already
// in another pile join this one and keep their original home.
// Returns { cards, stackId } or null when there are fewer than two tiles.
export function stackCards(cards, tileIds, { stackId = crypto.randomUUID() } = {}) {
  const idSet = new Set(tileIds);
  const members = cards.filter((card) => idSet.has(card.id));

  if (members.length < 2) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  members.forEach((card) => {
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + card.width);
    maxY = Math.max(maxY, card.y + card.height);
  });
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const topIndex = members.length - 1;

  const piled = members.map((card, order) => {
    const isTop = order === topIndex;
    const seed = `${stackId}:${card.id}`;
    const offsetX = isTop ? 0 : jitter(`${seed}:x`) * STACK.MAX_OFFSET_PX;
    const offsetY = isTop ? 0 : jitter(`${seed}:y`) * STACK.MAX_OFFSET_PX;
    const tilt = isTop ? 0 : jitter(`${seed}:r`) * STACK.MAX_TILT_DEG;
    const previous = normalizeTileStack(card.stack);

    return {
      ...card,
      x: Math.round(centerX - card.width / 2 + offsetX),
      y: Math.round(centerY - card.height / 2 + offsetY),
      stack: {
        id: stackId,
        order,
        tilt: Math.round(tilt * 100) / 100,
        homeX: previous?.homeX ?? card.x,
        homeY: previous?.homeY ?? card.y,
      },
    };
  });

  return {
    stackId,
    cards: [...cards.filter((card) => !idSet.has(card.id)), ...piled],
  };
}

// Takes a pile apart: every card goes back to where it sat before stacking.
export function unstackCards(cards, stackId) {
  let changed = false;

  const next = cards.map((card) => {
    if (card.stack?.id !== stackId) {
      return card;
    }

    changed = true;
    const { homeX, homeY } = card.stack;
    return {
      ...card,
      x: Number.isFinite(homeX) ? homeX : card.x,
      y: Number.isFinite(homeY) ? homeY : card.y,
      stack: null,
    };
  });

  return changed ? next : cards;
}

// One rubber band per pile, wrapped round the whole bundle: as wide as the
// pile's outer edges (tilted tiles included) plus a little where it turns
// round the sides, through the middle of the pile. `layer` is the top tile's
// draw order, so the band sits over the pile but under anything added since.
// The band's slant is fixed per pile.
// Returns [{ stackId, x, y, width, angle, layer }] (x / y = band centre).
export function getStackBands(cards) {
  const piles = new Map();

  cards.forEach((card, index) => {
    const stackId = card.stack?.id;

    if (!stackId) {
      return;
    }

    const radians = ((card.stack.tilt ?? 0) * Math.PI) / 180;
    const halfX = (card.width * Math.abs(Math.cos(radians)) + card.height * Math.abs(Math.sin(radians))) / 2;
    const halfY = (card.width * Math.abs(Math.sin(radians)) + card.height * Math.abs(Math.cos(radians))) / 2;
    const centerX = card.x + card.width / 2;
    const centerY = card.y + card.height / 2;
    const pile = piles.get(stackId) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, layer: 0 };

    pile.minX = Math.min(pile.minX, centerX - halfX);
    pile.maxX = Math.max(pile.maxX, centerX + halfX);
    pile.minY = Math.min(pile.minY, centerY - halfY);
    pile.maxY = Math.max(pile.maxY, centerY + halfY);
    pile.layer = Math.max(pile.layer, index + 1);
    piles.set(stackId, pile);
  });

  return [...piles.entries()].map(([stackId, pile]) => ({
    stackId,
    x: (pile.minX + pile.maxX) / 2,
    y: pile.minY + (pile.maxY - pile.minY) * (0.46 + jitter(`${stackId}:band-y`) * 0.06),
    width: Math.round(pile.maxX - pile.minX + 14),
    angle: Math.round(jitter(`${stackId}:band`) * 50) / 10,
    layer: pile.layer,
  }));
}
