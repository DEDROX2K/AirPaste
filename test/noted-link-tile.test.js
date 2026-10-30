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
  getNotedLinkGeometry,
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

  it("adds a note around the image: 9px padding at 768 wide, so 786", () => {
    expect(getNotedLinkGeometry(768)).toEqual({ k: 1, padding: 9, width: 786 });
    expect(getNotedLinkGeometry(384)).toEqual({ k: 0.5, padding: 4.5, width: 393 });

    const card = imageCard();
    const noted = normalizeCard({ ...card, ...getOpenLinkNotePatch(card) });
    expect(noted).toMatchObject({ x: 91, y: 191, width: 786 });
    expect(noted.note).toEqual({ open: true, title: "", body: "", mediaWidth: 768, mediaHeight: 648 });
    expect(isLinkNoteOpen(noted)).toBe(true);
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
});
