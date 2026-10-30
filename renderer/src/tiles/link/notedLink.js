// A link or image tile can grow a note: "Add note" in the right-click menu
// wraps the image in a dark card with an editable title and text below it
// that grows downward as you write (NotedLinkTile). "Remove note" puts the
// tile back; the note is kept for next time.
//
// The design is measured on a 768px-wide image: the card adds 9px around
// it (no bottom padding), so the noted tile is 786px wide. Everything
// scales with the image's width (k = mediaWidth / 768).

export const LINK_NOTE_BASE_MEDIA_WIDTH = 768;
export const LINK_NOTE_CARD_PADDING = 9;

// `note` on a link card: null until a note is first added.
//   open                 whether the tile shows as noted
//   title, body          the note's text
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
    title: typeof note.title === "string" ? note.title : "",
    body: typeof note.body === "string" ? note.body : "",
    mediaWidth,
    mediaHeight,
  };
}

export function isLinkNoteOpen(card) {
  return card?.type === "link" && card.note?.open === true;
}

// Stickers are cut-outs, not pictures; they don't take a note.
export function canAddLinkNote(card) {
  return card?.type === "link" && card.sourceType !== "sticker";
}

// The noted tile's padding (around the image) and width for an image this wide.
export function getNotedLinkGeometry(mediaWidth) {
  const k = mediaWidth / LINK_NOTE_BASE_MEDIA_WIDTH;
  const padding = LINK_NOTE_CARD_PADDING * k;

  return { k, padding, width: Math.round(mediaWidth + (padding * 2)) };
}

// The card patch for "Add note": the image stays where it is and the card
// grows around it; the height follows the note once it has rendered.
export function getOpenLinkNotePatch(card) {
  const note = normalizeLinkNote(card.note);
  const mediaWidth = card.width;
  const mediaHeight = card.height;
  const { padding, width } = getNotedLinkGeometry(mediaWidth);

  return {
    note: { title: note?.title ?? "", body: note?.body ?? "", open: true, mediaWidth, mediaHeight },
    // Not rounded: adding and removing a note must land the image back
    // exactly where it was.
    x: card.x - padding,
    y: card.y - padding,
    width,
    height: Math.round(mediaHeight + padding),
  };
}

// The card patch for "Remove note": back to the image's own size and place.
export function getCloseLinkNotePatch(card) {
  const note = normalizeLinkNote(card.note);

  if (!note?.open) {
    return null;
  }

  const { padding } = getNotedLinkGeometry(note.mediaWidth);

  return {
    note: { ...note, open: false },
    x: card.x + padding,
    y: card.y + padding,
    width: note.mediaWidth,
    height: note.mediaHeight,
  };
}
