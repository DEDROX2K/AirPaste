// Stacks: select some tiles and press G (or right-click > Stack) and they
// fly into one 3D pile (components/canvas/StackBundle.jsx). The pile is one
// object: click selects it, drag moves it, double-click / Shift+G /
// right-click > Unstack puts every tile back (relative to where the pile now
// is). Its tiles themselves are inert while stacked.
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

// Moves a whole pile by (dx, dy): the cards and the spots they go back to on
// unstack, so a pile carried elsewhere comes apart where it now is.
export function moveStackCards(cards, stackId, dx, dy) {
  if (!stackId || (!dx && !dy)) {
    return cards;
  }

  let changed = false;
  const next = cards.map((card) => {
    if (card.stack?.id !== stackId) {
      return card;
    }

    changed = true;
    return {
      ...card,
      x: Math.round(card.x + dx),
      y: Math.round(card.y + dy),
      stack: {
        ...card.stack,
        homeX: Number.isFinite(card.stack.homeX) ? Math.round(card.stack.homeX + dx) : card.stack.homeX,
        homeY: Number.isFinite(card.stack.homeY) ? Math.round(card.stack.homeY + dy) : card.stack.homeY,
      },
    };
  });

  return changed ? next : cards;
}

// The cards of each pile, bottom to top: Map(stackId -> cards[]).
export function groupStacks(cards) {
  const piles = new Map();

  cards.forEach((card) => {
    const stackId = card.stack?.id;
    if (!stackId) return;
    const pile = piles.get(stackId);
    if (pile) pile.push(card); else piles.set(stackId, [card]);
  });

  piles.forEach((pile) => pile.sort((a, b) => (a.stack.order ?? 0) - (b.stack.order ?? 0)));
  return piles;
}

// How long a pile takes to fly apart (StackBundle.jsx): each layer leaves
// 30ms after the one above it and flies for 560ms.
export const STACK_RELEASE_STAGGER_MS = 30;
export const STACK_FLY_MS = 560;

export function stackReleaseDuration(count) {
  return count * STACK_RELEASE_STAGGER_MS + STACK_FLY_MS;
}
