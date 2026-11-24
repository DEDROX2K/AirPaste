// Merged tiles: drop one tile on another and they snap together into a
// group -- arranged side by side in rows (random order), wrapped in one
// yellow frame, with a short note in a tab hanging off the frame's bottom.
//
// Data:
//   - each member tile carries `mergeId` (its frame's id)
//   - the frame is its own card, type "merge-note", drawn behind its members:
//       memberIds   the members, in their (shuffled) order
//       body        the note's text (markdown, the shared note editor)
//       noteHeight  the tab's rendered height (written back by the tile)
//       mergeShape  { path, note: { x, y, width, height } }, relative to the
//                   frame, rebuilt by settleMergeGroups
//
// settleMergeGroups runs on every workspace change (normalizeWorkspace): it
// lays each group out from its members' current sizes (so a member that
// grows pushes the rest along), drops members that are gone, and dissolves
// a group left with fewer than two. The frame's x / y is the group's
// anchor: its top-left corner.

export const MERGE_NOTE_CARD_TYPE = "merge-note";

export const MERGE_LAYOUT = Object.freeze({
  pad: 22, // frame around the tiles
  gap: 18, // between tiles, in a row and between rows
  maxPerRow: 3,
  radius: 30, // the frame's outer corners and its curved inner joins
  noteMinHeight: 120,
  noteRadius: 16, // the note tab's bottom corners
  noteMinWidth: 240,
  noteMaxWidth: 380,
});

export function isMergeFrame(card) {
  return card?.type === MERGE_NOTE_CARD_TYPE;
}

// Tiles that can join a group: loose on the canvas (not in a rack or a
// stacked pile), and not a rack or a frame itself.
export function canMergeCard(card) {
  return Boolean(card)
    && !isMergeFrame(card)
    && card.type !== "rack"
    && !card.parentRackId
    && !card.stack?.id
    && Number.isFinite(card.width)
    && Number.isFinite(card.height);
}

export function normalizeMergeShape(value) {
  if (!value || typeof value !== "object" || typeof value.path !== "string") {
    return null;
  }

  const note = value.note && typeof value.note === "object" ? value.note : {};
  const num = (v) => (Number.isFinite(v) ? v : 0);

  return {
    path: value.path,
    note: { x: num(note.x), y: num(note.y), width: num(note.width), height: num(note.height) },
  };
}

// Rows for `count` tiles: up to 3 per row, the fuller rows at the bottom
// (2 over 3, like a pyramid).
export function getMergeRowCounts(count) {
  if (count <= 0) {
    return [];
  }

  const rows = Math.ceil(count / MERGE_LAYOUT.maxPerRow);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index >= rows - extra ? 1 : 0));
}

// A rectilinear outline (clockwise, screen coordinates) with each corner
// rounded by its own radius: convex corners bulge out, concave ones curve
// in, so steps between rows get smooth joins.
function roundedPolygonPath(points, radii) {
  const count = points.length;
  const n = (v) => Math.round(v * 100) / 100;
  const parts = [];

  for (let index = 0; index < count; index += 1) {
    const prev = points[(index - 1 + count) % count];
    const point = points[index];
    const next = points[(index + 1) % count];
    const inLength = Math.hypot(point.x - prev.x, point.y - prev.y);
    const outLength = Math.hypot(next.x - point.x, next.y - point.y);
    const radius = Math.max(0, Math.min(radii[index], inLength / 2, outLength / 2));
    const inDir = { x: (point.x - prev.x) / (inLength || 1), y: (point.y - prev.y) / (inLength || 1) };
    const outDir = { x: (next.x - point.x) / (outLength || 1), y: (next.y - point.y) / (outLength || 1) };
    const start = { x: point.x - (inDir.x * radius), y: point.y - (inDir.y * radius) };
    const end = { x: point.x + (outDir.x * radius), y: point.y + (outDir.y * radius) };
    const sweep = (inDir.x * outDir.y) - (inDir.y * outDir.x) > 0 ? 1 : 0;

    parts.push(`${index === 0 ? "M" : "L"}${n(start.x)} ${n(start.y)}`);
    if (radius > 0) {
      parts.push(`A${n(radius)} ${n(radius)} 0 0 ${sweep} ${n(end.x)} ${n(end.y)}`);
    }
  }

  return `${parts.join(" ")} Z`;
}

// The outline of stacked bands, each { left, right, top, bottom }, where
// each band's bottom is the next one's top. `radiusAt(index, point)` gives
// each corner's radius.
function bandsOutline(bands, radiusAt) {
  const points = [];
  const last = bands.length - 1;

  points.push({ x: bands[0].left, y: bands[0].top });
  points.push({ x: bands[0].right, y: bands[0].top });

  for (let index = 0; index < last; index += 1) {
    points.push({ x: bands[index].right, y: bands[index].bottom });
    if (bands[index + 1].right !== bands[index].right) {
      points.push({ x: bands[index + 1].right, y: bands[index].bottom });
    }
  }

  points.push({ x: bands[last].right, y: bands[last].bottom });
  points.push({ x: bands[last].left, y: bands[last].bottom });

  for (let index = last; index > 0; index -= 1) {
    points.push({ x: bands[index].left, y: bands[index].top });
    if (bands[index - 1].left !== bands[index].left) {
      points.push({ x: bands[index - 1].left, y: bands[index].top });
    }
  }

  // Keep only real corners: drop repeats, and points partway along a
  // straight edge (rows of equal width leave one at each row boundary).
  // Rounding one of those drew a semicircle notch into the edge.
  const unique = points.filter((point, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    return point.x !== prev.x || point.y !== prev.y;
  });
  const clean = unique.filter((point, index) => {
    const prev = unique[(index - 1 + unique.length) % unique.length];
    const next = unique[(index + 1) % unique.length];
    const straight = (prev.x === point.x && point.x === next.x) || (prev.y === point.y && point.y === next.y);
    return !straight;
  });

  return roundedPolygonPath(clean, clean.map((point, index) => radiusAt(index, point)));
}

// Lays out `members` (cards, in group order): positions relative to the
// frame's top-left, the frame's size, and its outline with the note tab.
export function computeMergeLayout(members, noteHeight = null) {
  const { pad, gap, radius } = MERGE_LAYOUT;
  const counts = getMergeRowCounts(members.length);
  const rows = [];
  let cursor = 0;

  for (const count of counts) {
    const tiles = members.slice(cursor, cursor + count);
    cursor += count;
    const width = tiles.reduce((sum, tile) => sum + tile.width, 0) + (gap * (tiles.length - 1));
    const height = Math.max(...tiles.map((tile) => tile.height));
    rows.push({ tiles, width, height });
  }

  const contentWidth = Math.max(...rows.map((row) => row.width));
  const positions = {};
  const bands = [];
  let y = pad;

  rows.forEach((row, rowIndex) => {
    let x = pad + ((contentWidth - row.width) / 2);
    const left = x - pad;

    for (const tile of row.tiles) {
      positions[tile.id] = { x: Math.round(x), y: Math.round(y) };
      x += tile.width + gap;
    }

    bands.push({
      left,
      right: left + row.width + (pad * 2),
      top: rowIndex === 0 ? 0 : y - (gap / 2),
      bottom: rowIndex === rows.length - 1 ? y + row.height + pad : y + row.height + (gap / 2),
    });
    y += row.height + gap;
  });

  // The note tab: under the bottom row, set in from its left end.
  const lastBand = bands[bands.length - 1];
  const tabHeight = Math.max(MERGE_LAYOUT.noteMinHeight, Number.isFinite(noteHeight) ? noteHeight : 0);
  const tabLeft = lastBand.left + (pad * 3);
  const tabWidth = Math.min(
    Math.max(MERGE_LAYOUT.noteMinWidth, (lastBand.right - lastBand.left) * 0.38),
    MERGE_LAYOUT.noteMaxWidth,
    lastBand.right - tabLeft - pad,
  );
  const tab = { left: tabLeft, right: tabLeft + tabWidth, top: lastBand.bottom, bottom: lastBand.bottom + tabHeight };
  const allBands = [...bands, tab];
  const path = bandsOutline(allBands, (_index, point) => {
    if (point.y === tab.bottom) return MERGE_LAYOUT.noteRadius;
    // Where the tab meets the frame: a clean square join, as designed.
    if (point.y === tab.top && (point.x === tab.left || point.x === tab.right)) return 0;
    return radius;
  });

  return {
    positions,
    width: Math.round(contentWidth + (pad * 2)),
    height: Math.round(tab.bottom),
    shape: {
      path,
      note: { x: tab.left, y: tab.top, width: tabWidth, height: tabHeight },
    },
  };
}

function shuffleInto(order, id, random) {
  const index = Math.floor(random() * (order.length + 1));
  return [...order.slice(0, index), id, ...order.slice(index)];
}

function createMergeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `merge-${crypto.randomUUID()}`
    : `merge-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// Every tile id of the group `tileId` belongs to (frame first), or null.
export function getMergeGroupTileIds(cards, tileId) {
  const card = cards.find((entry) => entry.id === tileId);
  const frameId = isMergeFrame(card) ? card.id : card?.mergeId;

  if (!frameId) {
    return null;
  }

  const frame = cards.find((entry) => entry.id === frameId && isMergeFrame(entry));
  if (!frame) {
    return null;
  }

  const memberIds = cards.filter((entry) => entry.mergeId === frameId).map((entry) => entry.id);
  return [frame.id, ...memberIds];
}

// The tile a drop on `targetId` would join: the frame's id when the target
// is (in) a group, else the target itself. Null when they can't merge.
export function getMergeDropTarget(cards, dragId, targetId) {
  const drag = cards.find((card) => card.id === dragId);
  const target = cards.find((card) => card.id === targetId);

  if (!canMergeCard(drag) || !target || target.id === drag.id) {
    return null;
  }

  if (isMergeFrame(target)) {
    return drag.mergeId === target.id ? null : target.id;
  }

  if (!canMergeCard(target)) {
    return null;
  }

  if (target.mergeId) {
    return drag.mergeId === target.mergeId ? null : target.mergeId;
  }

  return target.id;
}

// Drops tile `dragId` on `targetId`: joins the target's group, or starts a
// new one with the target. Returns { cards, frameId } or null.
export function mergeCards(cards, dragId, targetId, { random = Math.random, frameId: newFrameId = createMergeId(), now = new Date().toISOString() } = {}) {
  const joinId = getMergeDropTarget(cards, dragId, targetId);

  if (!joinId) {
    return null;
  }

  const drag = cards.find((card) => card.id === dragId);
  const existingFrame = cards.find((card) => card.id === joinId && isMergeFrame(card));
  let nextCards;
  let frameId;

  if (existingFrame) {
    frameId = existingFrame.id;
    const order = shuffleInto(existingFrame.memberIds.filter((id) => id !== dragId), dragId, random);
    const members = order.map((id) => (id === dragId ? drag : cards.find((card) => card.id === id))).filter(Boolean);
    const before = computeMergeLayout(members.filter((card) => card.id !== dragId), existingFrame.noteHeight);
    const after = computeMergeLayout(members, existingFrame.noteHeight);
    // Grows around its middle, so the group stays where it was.
    const x = existingFrame.x + ((before.width - after.width) / 2);

    nextCards = cards.map((card) => {
      if (card.id === frameId) return { ...card, x: Math.round(x), memberIds: order, updatedAt: now };
      if (card.id === dragId) return { ...card, mergeId: frameId, updatedAt: now };
      return card;
    });
  } else {
    const target = cards.find((card) => card.id === joinId);
    frameId = newFrameId;
    const order = random() < 0.5 ? [target.id, drag.id] : [drag.id, target.id];
    const members = order.map((id) => (id === drag.id ? drag : target));
    const layout = computeMergeLayout(members, null);
    // Centred where the target was.
    const rowsHeight = layout.shape.note.y;
    const frame = {
      id: frameId,
      type: MERGE_NOTE_CARD_TYPE,
      x: Math.round(target.x + (target.width / 2) - (layout.width / 2)),
      y: Math.round(target.y + (target.height / 2) - (rowsHeight / 2)),
      width: layout.width,
      height: layout.height,
      memberIds: order,
      body: "",
      noteHeight: null,
      mergeShape: layout.shape,
      createdAt: now,
      updatedAt: now,
    };
    const firstIndex = Math.min(...[target.id, drag.id].map((id) => cards.findIndex((card) => card.id === id)));

    nextCards = cards.map((card) => (
      card.id === target.id || card.id === drag.id ? { ...card, mergeId: frameId, updatedAt: now } : card
    ));
    nextCards.splice(firstIndex, 0, frame);
  }

  return { cards: settleMergeGroups(nextCards), frameId };
}

// Splits a group: the frame goes, its tiles stay where they are.
export function unmergeGroup(cards, frameId) {
  if (!cards.some((card) => card.id === frameId && isMergeFrame(card))) {
    return null;
  }

  return cards
    .filter((card) => card.id !== frameId)
    .map((card) => (card.mergeId === frameId ? { ...card, mergeId: null } : card));
}

const near = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 0.5;

// Lays every group out and tidies the membership (see the top of the file).
// Returns `cards` itself when nothing changed.
export function settleMergeGroups(cards) {
  if (!cards.some((card) => isMergeFrame(card) || card.mergeId)) {
    return cards;
  }

  const frames = new Map(cards.filter(isMergeFrame).map((frame) => [frame.id, frame]));
  const membersByFrame = new Map();

  for (const card of cards) {
    if (card.mergeId && frames.has(card.mergeId) && canMergeCard(card)) {
      if (!membersByFrame.has(card.mergeId)) membersByFrame.set(card.mergeId, []);
      membersByFrame.get(card.mergeId).push(card);
    }
  }

  const patches = new Map();
  const removed = new Set();
  const patch = (card, values) => {
    const current = patches.get(card.id) ?? {};
    patches.set(card.id, { ...current, ...values });
  };

  for (const frame of frames.values()) {
    const loose = membersByFrame.get(frame.id) ?? [];
    const byId = new Map(loose.map((card) => [card.id, card]));
    const order = [
      ...frame.memberIds.filter((id) => byId.has(id)),
      ...loose.map((card) => card.id).filter((id) => !frame.memberIds.includes(id)),
    ];

    if (order.length < 2) {
      removed.add(frame.id);
      loose.forEach((card) => patch(card, { mergeId: null }));
      continue;
    }

    const layout = computeMergeLayout(order.map((id) => byId.get(id)), frame.noteHeight);

    for (const id of order) {
      const card = byId.get(id);
      const at = layout.positions[id];
      const x = frame.x + at.x;
      const y = frame.y + at.y;
      if (!near(card.x, x) || !near(card.y, y)) patch(card, { x, y });
    }

    const sameOrder = order.length === frame.memberIds.length && order.every((id, index) => id === frame.memberIds[index]);
    if (
      !sameOrder
      || frame.width !== layout.width
      || frame.height !== layout.height
      || frame.mergeShape?.path !== layout.shape.path
    ) {
      patch(frame, { memberIds: order, width: layout.width, height: layout.height, mergeShape: layout.shape });
    }
  }

  // A tile pointing at a frame that's gone (or that can't be in one) leaves.
  for (const card of cards) {
    if (card.mergeId && (!frames.has(card.mergeId) || removed.has(card.mergeId) || !canMergeCard(card))) {
      patch(card, { mergeId: null });
    }
  }

  let next = cards;

  if (patches.size > 0 || removed.size > 0) {
    next = cards
      .filter((card) => !removed.has(card.id))
      .map((card) => (patches.has(card.id) ? { ...card, ...patches.get(card.id) } : card));
  }

  // Each frame draws just below its lowest member.
  for (const frame of next.filter(isMergeFrame)) {
    const frameIndex = next.indexOf(frame);
    const memberIndexes = next
      .map((card, index) => (card.mergeId === frame.id ? index : -1))
      .filter((index) => index >= 0);
    const firstMember = Math.min(...memberIndexes);

    if (memberIndexes.length > 0 && frameIndex > firstMember) {
      next = next.filter((card) => card !== frame);
      next.splice(firstMember, 0, frame);
    }
  }

  return next;
}
