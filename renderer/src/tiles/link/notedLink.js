// A link or image tile can grow a note (NotedLinkTile). "Remove note" puts
// the tile back; the note is kept for next time. Two variants:
//
//   long   the image sits in a frame with a note panel to its right (title
//          and body). The panel reaches above and below the image, joined
//          to the image's frame by curved edge connectors, the bottom one
//          larger. The panel grows downward as you write.
//   short  a yellow card around the image with the body below it.
//
// Both are measured on a 768px-wide image and scale with the image's width
// (k = mediaWidth / 768). Short: 9px around the image (none below), so 786
// wide. Long: see LINK_NOTE_SIDE below.

export const LINK_NOTE_BASE_MEDIA_WIDTH = 768;
export const LINK_NOTE_CARD_PADDING = 9;
export const LINK_NOTE_VARIANT_LONG = "long";
export const LINK_NOTE_VARIANT_SHORT = "short";

// The long note's side layout at k = 1 (from the design, scaled 768/651).
export const LINK_NOTE_SIDE = {
  pad: 19,            // frame around the image (left, top, bottom)
  frame: 16.5,        // frame around the note panel
  panelWidth: 1228,   // note panel, inside its frame
  lift: 186,          // how far the note frame rises above the image's frame
  topJoin: 124,       // radius of the top edge connector
  bottomJoin: 372,    // radius of the bottom edge connector
  outerRadius: 62,    // outside corners of both frames
  innerRadius: 47,    // the image's and the panel's corners
};

// The long note's panel can be dragged narrower or wider (its right-edge
// handle); stored on the note at k = 1 like the sizes above.
export const LINK_NOTE_PANEL_MIN_WIDTH = 420;
export const LINK_NOTE_PANEL_MAX_WIDTH = 3200;

export function clampNotePanelWidth(panelWidth) {
  if (!Number.isFinite(panelWidth)) {
    return LINK_NOTE_SIDE.panelWidth;
  }

  return Math.min(LINK_NOTE_PANEL_MAX_WIDTH, Math.max(LINK_NOTE_PANEL_MIN_WIDTH, panelWidth));
}

// `note` on a link card: null until a note is first added.
//   open                 whether the tile shows as noted
//   variant              "long" (side panel, title + body) or "short"
//                        (yellow card, body only)
//   title, body          the note's text
//   panelWidth           the long note's panel width at k = 1 (null: the
//                        design's 1228)
//   mediaWidth/Height    the tile's size before the note was added (the
//                        image keeps it; "Remove note" restores it)
export function normalizeLinkNote(note) {
  if (!note || typeof note !== "object") {
    return null;
  }

  const mediaWidth = Number.isFinite(note.mediaWidth) && note.mediaWidth > 0 ? note.mediaWidth : null;
  const mediaHeight = Number.isFinite(note.mediaHeight) && note.mediaHeight > 0 ? note.mediaHeight : null;

  return {
    open: note.open === true && mediaWidth !== null && mediaHeight !== null,
    variant: note.variant === LINK_NOTE_VARIANT_SHORT ? LINK_NOTE_VARIANT_SHORT : LINK_NOTE_VARIANT_LONG,
    title: typeof note.title === "string" ? note.title : "",
    body: typeof note.body === "string" ? note.body : "",
    panelWidth: Number.isFinite(note.panelWidth) ? clampNotePanelWidth(note.panelWidth) : null,
    mediaWidth,
    mediaHeight,
  };
}

export function isLinkNoteOpen(card) {
  return card?.type === "link" && card.note?.open === true;
}

export function getLinkNoteVariant(card) {
  return card?.note?.variant === LINK_NOTE_VARIANT_SHORT ? LINK_NOTE_VARIANT_SHORT : LINK_NOTE_VARIANT_LONG;
}

// Stickers are cut-outs, not pictures; they don't take a note.
export function canAddLinkNote(card) {
  return card?.type === "link" && card.sourceType !== "sticker";
}

// The short note's padding (around the image) and width for an image this wide.
export function getNotedLinkGeometry(mediaWidth) {
  const k = mediaWidth / LINK_NOTE_BASE_MEDIA_WIDTH;
  const padding = LINK_NOTE_CARD_PADDING * k;

  return { k, padding, width: Math.round(mediaWidth + (padding * 2)) };
}

// The long note's side layout in canvas px for an image this size. The
// tile's box runs from the image frame's left edge to the panel frame's
// right, and from the note frame's top to its bottom (at least minHeight,
// so the bottom connector always fits). `panelWidth` is the note's own
// (k = 1), or the design's when it has none.
export function getSideNoteLayout(mediaWidth, mediaHeight, panelWidth = null) {
  const k = mediaWidth / LINK_NOTE_BASE_MEDIA_WIDTH;
  const s = {};

  for (const [key, value] of Object.entries(LINK_NOTE_SIDE)) {
    s[key] = value * k;
  }

  s.panelWidth = clampNotePanelWidth(panelWidth ?? LINK_NOTE_SIDE.panelWidth) * k;

  const tileTop = s.lift;
  const tileHeight = mediaHeight + (s.pad * 2);
  const noteLeft = s.pad + mediaWidth;

  return {
    ...s,
    k,
    mediaWidth,
    mediaHeight,
    tileTop,
    tileHeight,
    noteLeft,
    width: noteLeft + (s.frame * 2) + s.panelWidth,
    minHeight: tileTop + tileHeight + s.bottomJoin + s.outerRadius,
    // Where the image sits inside the tile.
    offsetX: s.pad,
    offsetY: tileTop + s.pad,
  };
}

// The image's width for a noted tile this wide (everything scales with it).
export function getNotedLinkMediaWidth(variant, tileWidth, panelWidth = null) {
  const extra = variant === LINK_NOTE_VARIANT_SHORT
    ? 2 * LINK_NOTE_CARD_PADDING
    : LINK_NOTE_SIDE.pad + (2 * LINK_NOTE_SIDE.frame) + clampNotePanelWidth(panelWidth ?? LINK_NOTE_SIDE.panelWidth);

  return tileWidth / (1 + (extra / LINK_NOTE_BASE_MEDIA_WIDTH));
}

// Where the image sits in the noted tile, and the tile's starting size.
function getNotedLinkBox(variant, mediaWidth, mediaHeight, panelWidth = null) {
  if (variant === LINK_NOTE_VARIANT_SHORT) {
    const { padding, width } = getNotedLinkGeometry(mediaWidth);
    return { offsetX: padding, offsetY: padding, width, height: Math.round(mediaHeight + padding) };
  }

  const layout = getSideNoteLayout(mediaWidth, mediaHeight, panelWidth);
  return {
    offsetX: layout.offsetX,
    offsetY: layout.offsetY,
    width: Math.round(layout.width),
    height: Math.ceil(layout.minHeight),
  };
}

// The card patch for "Add note": the image stays where it is and the card
// grows around it; the height follows the note once it has rendered.
export function getOpenLinkNotePatch(card, variant = LINK_NOTE_VARIANT_LONG) {
  const note = normalizeLinkNote(card.note);
  const mediaWidth = card.width;
  const mediaHeight = card.height;
  const panelWidth = note?.panelWidth ?? null;
  const box = getNotedLinkBox(variant, mediaWidth, mediaHeight, panelWidth);

  return {
    note: { title: note?.title ?? "", body: note?.body ?? "", open: true, variant, panelWidth, mediaWidth, mediaHeight },
    // Not rounded: adding and removing a note must land the image back
    // exactly where it was.
    x: card.x - box.offsetX,
    y: card.y - box.offsetY,
    width: box.width,
    height: box.height,
  };
}

// The card patch for "Remove note": back to the image's own size and place.
export function getCloseLinkNotePatch(card) {
  const note = normalizeLinkNote(card.note);

  if (!note?.open) {
    return null;
  }

  const box = getNotedLinkBox(note.variant, note.mediaWidth, note.mediaHeight, note.panelWidth);

  return {
    note: { ...note, open: false },
    x: card.x + box.offsetX,
    y: card.y + box.offsetY,
    width: note.mediaWidth,
    height: note.mediaHeight,
  };
}

// The card patch for switching an open note between long and short: the
// image stays put and the tile reshapes around it; the height follows the
// note once it has rendered.
export function getLinkNoteVariantPatch(card, variant) {
  const note = normalizeLinkNote(card.note);

  if (!note?.open || note.variant === variant) {
    return null;
  }

  const from = getNotedLinkBox(note.variant, note.mediaWidth, note.mediaHeight, note.panelWidth);
  const to = getNotedLinkBox(variant, note.mediaWidth, note.mediaHeight, note.panelWidth);

  return {
    note: { ...note, variant },
    x: card.x + from.offsetX - to.offsetX,
    y: card.y + from.offsetY - to.offsetY,
    width: to.width,
    height: to.height,
  };
}

// The card patch for dragging the long note's right edge: a new panel
// width (k = 1, clamped) and the tile's width to match. The image and the
// tile's left edge stay put.
export function getNotePanelResizePatch(card, mediaWidth, panelWidth) {
  const note = normalizeLinkNote(card.note);

  if (!note?.open || note.variant === LINK_NOTE_VARIANT_SHORT) {
    return null;
  }

  const nextPanelWidth = Math.round(clampNotePanelWidth(panelWidth));
  const layout = getSideNoteLayout(mediaWidth, note.mediaHeight, nextPanelWidth);

  return {
    note: { ...note, panelWidth: nextPanelWidth },
    width: Math.round(layout.width),
  };
}

// The outline of the long note's whole shape (image frame, note frame and
// both edge connectors) as an SVG path, pushed out by `gap` all round, for
// the hover/selection ring. `height` is the note frame's rendered height.
export function getSideNoteOutlinePath(layout, height, gap = 0) {
  const { noteLeft: nl, width: w, tileTop, tileHeight, outerRadius: ro, topJoin, bottomJoin } = layout;
  const tileBottom = tileTop + tileHeight;
  const r = ro + gap;
  const rt = Math.max(0, topJoin - gap);
  const rb = Math.max(0, bottomJoin - gap);
  const n = (v) => Math.round(v * 100) / 100;
  const arc = (radius, sweep, x, y) => `A${n(radius)} ${n(radius)} 0 0 ${sweep} ${n(x)} ${n(y)}`;

  return [
    `M${n(nl + ro)} ${n(-gap)}`,
    `H${n(w - ro)}`, arc(r, 1, w + gap, ro),
    `V${n(height - ro)}`, arc(r, 1, w - ro, height + gap),
    `H${n(nl + ro)}`, arc(r, 1, nl - gap, height - ro),
    `V${n(tileBottom + bottomJoin)}`, arc(rb, 0, nl - bottomJoin, tileBottom + gap),
    `H${n(ro)}`, arc(r, 1, -gap, tileBottom - ro),
    `V${n(tileTop + ro)}`, arc(r, 1, ro, tileTop - gap),
    `H${n(nl - topJoin)}`, arc(rt, 0, nl - gap, tileTop - topJoin),
    `V${n(ro)}`, arc(r, 1, nl + ro, -gap),
    "Z",
  ].join(" ");
}
