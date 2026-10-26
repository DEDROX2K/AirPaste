// @vitest-environment jsdom
//
// FigJam-style sticky notes: square canvas-text cards (variant "sticky")
// with a `sticky` style object. jsdom because the tile registry pulls in
// tile components that touch window at import.
import { describe, expect, it } from "vitest";
import { normalizeCard } from "@/lib/workspace.js";
import { createCanvasTextCard } from "@/tiles/canvasText/model.js";
import {
  clampStickySize,
  getAdjacentStickyPosition,
  getLastStickyColor,
  getStickyDisplayText,
  normalizeStickyStyle,
  rememberStickyColor,
} from "@/tiles/sticky/model.js";
import { getTileRegistration } from "@/tiles/tileRegistry.js";
import StickyTile from "@/components/tiles/StickyTile";
import StickyNoteTile from "@/components/tiles/StickyNoteTile";

const VIEWPORT = { x: 0, y: 0, zoom: 1 };

describe("sticky style", () => {
  it("defaults to a yellow, medium, left-aligned, unformatted note", () => {
    expect(normalizeStickyStyle(undefined)).toEqual({
      color: "yellow",
      fontSize: "m",
      align: "left",
      bold: false,
      italic: false,
      strike: false,
      author: "",
    });
    expect(normalizeStickyStyle({ color: "teal", fontSize: "l", align: "center", bold: true, author: "Raghav" }))
      .toMatchObject({ color: "teal", fontSize: "l", align: "center", bold: true, author: "Raghav" });
    expect(normalizeStickyStyle({ color: "magenta", fontSize: "xl", align: "justify" }))
      .toMatchObject({ color: "yellow", fontSize: "m", align: "left" });
  });

  it("remembers the last colour picked for new notes", () => {
    rememberStickyColor("violet");
    expect(getLastStickyColor()).toBe("violet");
    rememberStickyColor("not-a-colour");
    expect(getLastStickyColor()).toBe("yellow");
  });

  it("keeps size between 96 and 640", () => {
    expect([50, 240, 700, Number.NaN].map(clampStickySize)).toEqual([96, 240, 640, 240]);
  });

  it("places a '+' sticky one note plus a 24px gap away", () => {
    const card = { x: 100, y: 200, width: 240, height: 240 };
    expect(getAdjacentStickyPosition(card, "e")).toEqual({ x: 364, y: 200 });
    expect(getAdjacentStickyPosition(card, "w")).toEqual({ x: -164, y: 200 });
    expect(getAdjacentStickyPosition(card, "n")).toEqual({ x: 100, y: -64 });
    expect(getAdjacentStickyPosition(card, "s")).toEqual({ x: 100, y: 464 });
  });
});

describe("sticky cards", () => {
  it("creates a square 240 sticky that keeps its style", () => {
    const card = createCanvasTextCard([], VIEWPORT, { x: 0, y: 0 }, {
      variant: "sticky",
      sticky: { color: "pink", author: "Raghav" },
    });

    expect(card).toMatchObject({ type: "canvas-text", variant: "sticky", width: 240, height: 240 });
    expect(card.sticky).toMatchObject({ color: "pink", author: "Raghav", fontSize: "m" });
    expect(normalizeCard(card).sticky).toEqual(card.sticky);
  });

  it("makes older non-square stickies square, within limits", () => {
    expect(normalizeCard({ type: "canvas-text", variant: "sticky", width: 300, height: 180 })).toMatchObject({ width: 300, height: 300 });
    expect(normalizeCard({ type: "canvas-text", variant: "sticky", width: 900, height: 900 })).toMatchObject({ width: 640, height: 640 });
  });

  it("leaves other canvas-text cards without a sticky style", () => {
    expect(normalizeCard({ type: "canvas-text", text: "hi" }).sticky).toBeNull();
  });

  it("reads an older sticky's title as the first line of its text", () => {
    expect(getStickyDisplayText({ title: "Launch", text: "Short demo video" })).toBe("Launch\nShort demo video");
    expect(getStickyDisplayText({ title: "", text: "Just text" })).toBe("Just text");
    expect(getStickyDisplayText({ title: "Only a title", text: "" })).toBe("Only a title");
  });

  it("renders local stickies with the FigJam tile, file-backed ones with the older one", () => {
    expect(getTileRegistration({ type: "canvas-text", variant: "sticky", source: "local" }).Component).toBe(StickyTile);
    expect(getTileRegistration({ type: "canvas-text", variant: "sticky", source: "file" }).Component).toBe(StickyNoteTile);
  });
});
