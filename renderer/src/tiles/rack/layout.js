// Rack layout: shelves (tiers). Pure; imports only the geometry constants,
// so lib/workspace, the layout and interaction systems and RackTile can all
// read it.
//
// A rack holds at most RACK_TIER_CAPACITY tiles per shelf. A full shelf
// refuses a drop and the tile goes to the next shelf down (a new one if
// needed), inside the same rack, joined by two posts. rack.tiers is the
// count on each shelf, in order; tileIds stays one flat list.
//
// Every layout uses x from the rack's horizontal centre (the rack grows
// about its centre) and y from its top edge. Rules: docs/rules/rack-rules.md.

import {
  RACK_FRAME_TOP,
  RACK_HEIGHT,
  RACK_MIN_WIDTH,
  RACK_SHELF_TOP,
  SHELF_HEIGHT,
  SHELF_SIDE,
  SLOT_FRAME_HEIGHT,
  SLOT_GAP,
  getRackRowWidth,
} from "./geometry";

export const RACK_TIER_CAPACITY = 5;
export const RACK_TIER_SPACING = 24;
export const RACK_TIER_PITCH = RACK_HEIGHT + RACK_TIER_SPACING;
export const RACK_POST_WIDTH = 10;
// Posts sit this far in from the shelf ends, behind the tiles.
export const RACK_POST_INSET = 70;

function chunkCount(count, capacity = RACK_TIER_CAPACITY) {
  const tiers = [];
  let left = Math.max(0, count);

  while (left > 0) {
    tiers.push(Math.min(capacity, left));
    left -= capacity;
  }

  return tiers;
}

// Counts per shelf that add up to `count`, none over capacity, none empty.
// Anything else (legacy racks, bad data) is re-chunked in fives.
export function normalizeRackTiers(tiers, count) {
  const total = Math.max(0, Math.round(count) || 0);

  if (
    Array.isArray(tiers)
    && tiers.every((value) => Number.isInteger(value) && value > 0 && value <= RACK_TIER_CAPACITY)
    && tiers.reduce((sum, value) => sum + value, 0) === total
  ) {
    return [...tiers];
  }

  return chunkCount(total);
}

// Flat index -> { tier, index } (index within its shelf).
export function getRackTierPosition(tiers, flatIndex) {
  let start = 0;

  for (let tier = 0; tier < tiers.length; tier += 1) {
    if (flatIndex < start + tiers[tier]) {
      return { tier, index: flatIndex - start };
    }
    start += tiers[tier];
  }

  return { tier: Math.max(0, tiers.length - 1), index: tiers[tiers.length - 1] ?? 0 };
}

// Where a tile goes when dropped on shelf `tier` at `index`. A full shelf
// refuses it: it goes to the next shelf down with room, at the same index
// or that shelf's end, and a new shelf is made under the last if they're
// all full. With tier null (legacy callers) it goes in at flat `index` (or
// the end) and full shelves overflow into the next one, keeping the order.
export function insertIntoRackTiers(tiers, { tier = null, index = null } = {}) {
  const next = [...tiers];
  const total = next.reduce((sum, value) => sum + value, 0);

  if (!Number.isFinite(tier)) {
    const flatIndex = Number.isFinite(index) ? Math.max(0, Math.min(total, Math.round(index))) : total;

    if (next.length === 0) {
      return { tiers: [1], flatIndex, tier: 0, refused: false };
    }

    let target = flatIndex === total
      ? next.length - 1
      : getRackTierPosition(next, flatIndex).tier;
    const placedTier = target;
    next[target] += 1;

    while (next[target] > RACK_TIER_CAPACITY) {
      next[target] -= 1;
      target += 1;
      next[target] = (next[target] ?? 0) + 1;
    }

    return { tiers: next, flatIndex, tier: placedTier, refused: false };
  }

  const wanted = Math.max(0, Math.min(next.length, Math.round(tier)));
  let target = wanted;

  while (target < next.length && next[target] >= RACK_TIER_CAPACITY) {
    target += 1;
  }

  if (target === next.length) {
    next.push(0);
  }

  const localIndex = Math.max(0, Math.min(next[target], Number.isFinite(index) ? Math.round(index) : next[target]));
  const flatIndex = next.slice(0, target).reduce((sum, value) => sum + value, 0) + localIndex;
  next[target] += 1;

  return { tiers: next, flatIndex, tier: target, index: localIndex, refused: target !== wanted };
}

export function removeFromRackTiers(tiers, flatIndex) {
  if (!(flatIndex >= 0) || tiers.length === 0) {
    return [...tiers];
  }

  const { tier } = getRackTierPosition(tiers, flatIndex);
  const next = [...tiers];
  next[tier] -= 1;
  return next.filter((value) => value > 0);
}

function groupByTier(tiers) {
  const groups = [];
  let start = 0;

  tiers.forEach((size) => {
    groups.push(Array.from({ length: size }, (_, offset) => start + offset));
    start += size;
  });

  return groups.length > 0 ? groups : [[]];
}

// The whole rack's drawing. spec: { slotWidths, tiers }. gap (a drag
// hovering over it): { tier, index, width }.
//
// Returns { width, height, slots, gap, supports, name, empty }: slots[i] =
// { index, tier, x, y, w, h } for tile i (flat order); supports are the
// shelves and posts ({ key, kind, tier, x, y, w, h }).
export function getRackLayout(spec = {}, gap = null) {
  const slotWidths = Array.isArray(spec.slotWidths) ? spec.slotWidths : [];
  const groups = groupByTier(normalizeRackTiers(spec.tiers, slotWidths.length));
  const hasGap = gap && gap.width > 0 && Number.isFinite(gap.tier);
  const gapTier = hasGap ? Math.max(0, Math.min(groups.length, Math.round(gap.tier))) : -1;
  const rows = (gapTier === groups.length ? [...groups, []] : groups).map((indices, tier) => {
    const entries = indices.map((index) => ({ index, width: slotWidths[index] }));

    if (tier === gapTier) {
      const at = Math.max(0, Math.min(entries.length, Math.round(gap.index ?? entries.length)));
      entries.splice(at, 0, { index: -1, width: gap.width });
    }

    return entries;
  });

  const rowWidths = rows.map((entries) => getRackRowWidth(entries.map((entry) => entry.width)));
  const width = Math.max(RACK_MIN_WIDTH, Math.max(0, ...rowWidths) + (SHELF_SIDE * 2));
  const tierCount = rows.length;
  const height = (tierCount * RACK_HEIGHT) + ((tierCount - 1) * RACK_TIER_SPACING);
  const slots = new Array(slotWidths.length);
  const supports = [];
  let gapRect = null;

  rows.forEach((entries, tier) => {
    const top = tier * RACK_TIER_PITCH;
    let left = -rowWidths[tier] / 2;

    entries.forEach((entry) => {
      const rect = { tier, x: left, y: top + RACK_FRAME_TOP, w: entry.width, h: SLOT_FRAME_HEIGHT };

      if (entry.index === -1) {
        gapRect = rect;
      } else {
        slots[entry.index] = { index: entry.index, ...rect };
      }

      left += entry.width + SLOT_GAP;
    });

    supports.push({ key: `shelf-${tier}`, kind: "shelf", tier, x: -width / 2, y: top + RACK_SHELF_TOP, w: width, h: SHELF_HEIGHT });
  });

  if (tierCount > 1) {
    const top = RACK_FRAME_TOP - 18;
    const bottom = ((tierCount - 1) * RACK_TIER_PITCH) + RACK_SHELF_TOP + (SHELF_HEIGHT * 0.5);
    [-1, 1].forEach((side) => {
      supports.push({
        key: side < 0 ? "post-left" : "post-right",
        kind: "post",
        tier: null,
        x: (side * ((width / 2) - RACK_POST_INSET)) - (RACK_POST_WIDTH / 2),
        y: top,
        w: RACK_POST_WIDTH,
        h: bottom - top,
      });
    });
  }

  const lastShelfTop = ((tierCount - 1) * RACK_TIER_PITCH) + RACK_SHELF_TOP;

  return {
    width,
    height,
    slots,
    gap: gapRect,
    supports,
    // Pressed into the bottom shelf's front lip.
    name: { x: 0, y: lastShelfTop + (SHELF_HEIGHT * 0.83), tier: tierCount - 1 },
    empty: { x: 0, y: RACK_SHELF_TOP - 46 },
  };
}

// Where a drag at `point` (x from the rack's centre, y from its top) would
// go: { tier, index, refusedTier }. Shelves are picked by height; below the
// last shelf is a new one. A full shelf refuses: refusedTier is that shelf
// and the tile goes on the next one down with room.
export function getRackDropSlot(spec = {}, point) {
  const slotWidths = Array.isArray(spec.slotWidths) ? spec.slotWidths : [];
  const tiers = normalizeRackTiers(spec.tiers, slotWidths.length);
  const layout = getRackLayout(spec);
  let tier = Math.max(0, Math.min(Math.max(1, tiers.length) - 1, Math.floor(point.y / RACK_TIER_PITCH)));

  if (tiers.length > 0 && point.y > layout.height + 10) {
    tier = tiers.length;
  }

  const index = layout.slots.filter((slot) => slot.tier === tier && slot.x + (slot.w / 2) < point.x).length;
  const placed = insertIntoRackTiers(tiers, { tier, index });

  return {
    tier: placed.tier,
    index: placed.index,
    refusedTier: placed.refused ? tier : null,
  };
}
