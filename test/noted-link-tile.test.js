// @vitest-environment jsdom
//
// Link/image tiles that grow a note ("Add note" in the right-click menu).
// jsdom because the tile registry pulls in tile components that touch
// window at import.
import { describe, expect, it } from "vitest";
import { normalizeCard } from "@/lib/workspace.js";
import {
  canAddLinkNote,
  getCloseLinkNotePatch,
  getLinkNoteVariantPatch,
  getNotedLinkGeometry,
  getNotedLinkMediaWidth,
  getSideNoteLayout,
  getSideNoteOutlinePath,
  getNotePanelResizePatch,
  getOpenLinkNotePatch,
  isLinkNoteOpen,
  normalizeLinkNote,
} from "@/tiles/link/notedLink.js";
import { buildRadialMenuActions } from "@/systems/interactions/radialMenuActions.js";
import { getTileRegistration } from "@/tiles/tileRegistry.js";
import LinkTile from "@/components/tiles/LinkTile";
import NotedLinkTile from "@/components/tiles/NotedLinkTile";

const imageCard = (extra = {}) => normalizeCard({
  id: "img",
  type: "link",
  contentKind: "image",
  x: 100,
  y: 200,
  width: 768,
  height: 648,
  ...extra,
});

describe("link notes", () => {
  it("has no note until one is added, and drops a malformed one", () => {
    expect(imageCard().note).toBeNull();
    expect(normalizeLinkNote({ open: true, title: 5 })).toMatchObject({ open: false, title: "" });
    expect(normalizeCard({ type: "file", note: { open: true } }).note).toBeNull();
  });

  it("adds a short note around the image: 9px padding at 768 wide, so 786", () => {
    expect(getNotedLinkGeometry(768)).toEqual({ k: 1, padding: 9, width: 786 });
    expect(getNotedLinkGeometry(384)).toEqual({ k: 0.5, padding: 4.5, width: 393 });

    const card = imageCard();
    const noted = normalizeCard({ ...card, ...getOpenLinkNotePatch(card, "short") });
    expect(noted).toMatchObject({ x: 91, y: 191, width: 786 });
    expect(noted.note).toEqual({ open: true, variant: "short", title: "", body: "", panelWidth: null, mediaWidth: 768, mediaHeight: 648 });
    expect(isLinkNoteOpen(noted)).toBe(true);
    expect(getNotedLinkMediaWidth("short", 786)).toBeCloseTo(768);
  });

  it("adds a long note as a side panel: image frame left, note to the right, reaching above and below", () => {
    const layout = getSideNoteLayout(768, 648);
    expect(layout).toMatchObject({ k: 1, offsetX: 19, offsetY: 205, noteLeft: 787, width: 2048 });
    // The bottom connector always fits below the image's frame.
    expect(layout.minHeight).toBe(186 + 686 + 372 + 62);

    const card = imageCard();
    const noted = normalizeCard({ ...card, ...getOpenLinkNotePatch(card) });
    expect(noted).toMatchObject({ x: 81, y: -5, width: 2048, height: 1306 });
    expect(noted.note).toMatchObject({ open: true, variant: "long" });
    expect(getNotedLinkMediaWidth("long", 2048)).toBeCloseTo(768);
    // Half-size image, half-size layout.
    expect(getSideNoteLayout(384, 324).width).toBe(1024);

    const ring = getSideNoteOutlinePath(layout, 1306, 5);
    expect(ring.startsWith("M")).toBe(true);
    expect(ring.endsWith("Z")).toBe(true);
    expect(ring).not.toContain("NaN");
  });

  it("removes the note back to the image's own size and place, keeping the text", () => {
    const card = imageCard();
    const noted = normalizeCard({ ...card, ...getOpenLinkNotePatch(card), height: 1000 });
    const written = normalizeCard({ ...noted, note: { ...noted.note, title: "Trip", body: "Day one" } });
    const closed = normalizeCard({ ...written, ...getCloseLinkNotePatch(written) });

    expect(closed).toMatchObject({ x: 100, y: 200, width: 768, height: 648 });
    expect(closed.note).toMatchObject({ open: false, title: "Trip", body: "Day one" });
    expect(getCloseLinkNotePatch(closed)).toBeNull();

    const reopened = normalizeCard({ ...closed, ...getOpenLinkNotePatch(closed) });
    expect(reopened.note).toMatchObject({ open: true, title: "Trip", body: "Day one" });
  });

  it("lands the image back exactly where it was after many add/remove cycles", () => {
    let card = imageCard({ x: 40, width: 384, height: 324 });

    for (let cycle = 0; cycle < 5; cycle += 1) {
      card = normalizeCard({ ...card, ...getOpenLinkNotePatch(card) });
      card = normalizeCard({ ...card, ...getCloseLinkNotePatch(card) });
    }

    expect(card).toMatchObject({ x: 40, y: 200, width: 384, height: 324 });
  });

  it("renders noted tiles with the noted tile, others as before", () => {
    const card = imageCard();
    expect(getTileRegistration(card).Component).toBe(LinkTile);
    expect(getTileRegistration({ ...card, ...getOpenLinkNotePatch(card) }).Component).toBe(NotedLinkTile);
  });

  it("offers Add note / Remove note in the right-click menu, not for stickers", () => {
    const labels = (linkNoteState) => buildRadialMenuActions({
      menu: { kind: "tile", selectionIds: ["img"] },
      linkNoteState,
      handlers: { onToggleLinkNote: () => true },
    }).filter(Boolean).map((action) => action.label);

    expect(labels("closed")).toContain("Add note");
    expect(labels("open")).toContain("Remove note");
    expect(labels(null)).not.toContain("Add note");
    expect(canAddLinkNote(imageCard())).toBe(true);
    expect(canAddLinkNote(imageCard({ sourceType: "sticker" }))).toBe(false);
  });

  it("switches long <-> short with the image staying put, and keeps the title", () => {
    const card = imageCard();
    const short = normalizeCard({ ...card, ...getOpenLinkNotePatch(card, "short") });
    expect(short.note).toMatchObject({ open: true, variant: "short" });
    expect(short).toMatchObject({ x: 91, y: 191, width: 786 });

    const titled = normalizeCard({ ...short, note: { ...short.note, title: "Trip" } });
    const long = normalizeCard({ ...titled, ...getLinkNoteVariantPatch(titled, "long") });
    expect(long).toMatchObject({ x: 81, y: -5, width: 2048 });
    const back = normalizeCard({ ...long, ...getLinkNoteVariantPatch(long, "short") });
    expect(back).toMatchObject({ x: 91, y: 191, width: 786 });
    expect(long.note).toMatchObject({ variant: "long", title: "Trip" });
    expect(getLinkNoteVariantPatch(long, "long")).toBeNull();
    expect(normalizeLinkNote({ variant: "odd" }).variant).toBe("long");
  });

  it("offers Add short note, then Make short / Make long note", () => {
    const labels = (linkNoteState, linkNoteVariant) => buildRadialMenuActions({
      menu: { kind: "tile", selectionIds: ["img"] },
      linkNoteState,
      linkNoteVariant,
      handlers: {},
    }).filter(Boolean).map((action) => action.label);

    expect(labels("closed")).toContain("Add short note");
    expect(labels("open", "long")).toContain("Make short note");
    expect(labels("open", "short")).toContain("Make long note");
    expect(labels(null)).not.toContain("Add short note");
  });

  it("drags the long note's panel narrower or wider, clamped, with the image staying put", () => {
    const card = imageCard();
    const noted = normalizeCard({ ...card, ...getOpenLinkNotePatch(card) });

    const narrower = normalizeCard({ ...noted, ...getNotePanelResizePatch(noted, 768, 800) });
    expect(narrower.note.panelWidth).toBe(800);
    expect(narrower).toMatchObject({ x: noted.x, y: noted.y, width: 2048 - 428 });
    expect(getNotedLinkMediaWidth("long", narrower.width, 800)).toBeCloseTo(768);

    // Clamped both ways.
    expect(getNotePanelResizePatch(noted, 768, 10).note.panelWidth).toBe(420);
    expect(getNotePanelResizePatch(noted, 768, 99999).note.panelWidth).toBe(3200);

    // Kept through remove / add and long <-> short.
    const closed = normalizeCard({ ...narrower, ...getCloseLinkNotePatch(narrower) });
    expect(closed).toMatchObject({ x: 100, y: 200, width: 768 });
    const reopened = normalizeCard({ ...closed, ...getOpenLinkNotePatch(closed) });
    expect(reopened).toMatchObject({ width: 1620 });

    // Short notes have no panel to resize.
    const short = normalizeCard({ ...card, ...getOpenLinkNotePatch(card, "short") });
    expect(getNotePanelResizePatch(short, 768, 800)).toBeNull();
  });
});
