// @vitest-environment jsdom
//
// FigJam-style sticky notes: square canvas-text cards (variant "sticky")
// with a `sticky` style object. jsdom because the tile registry pulls in
// tile components that touch window at import.
import { describe, expect, it } from "vitest";
import { normalizeCard } from "@/lib/workspace.js";
import { createCanvasTextCard } from "@/tiles/canvasText/model.js";
import {
  clampCodeFileWidth,
  clampFolderStickyWidth,
  describeCodeFilePath,
  getFileCardCodeLanguageId,
  clampStickySize,
  getAdjacentStickyPosition,
  getLastStickyColor,
  getStickyDisplayText,
  normalizeStickyStyle,
  rememberStickyColor,
} from "@/tiles/sticky/model.js";
import { getTileRegistration } from "@/tiles/tileRegistry.js";
import { formatFileSize, splitFileName } from "@/tiles/file/defaultFileDesign.js";
import { buildRadialMenuActions } from "@/systems/interactions/radialMenuActions.js";
import FileTile from "@/components/tiles/FileTile";
import StickyCodeFileTile from "@/components/tiles/StickyCodeFileTile";
import StickyFolderTile from "@/components/tiles/StickyFolderTile";
import StickyTile from "@/components/tiles/StickyTile";
import StickyNoteTile from "@/components/tiles/StickyNoteTile";

const VIEWPORT = { x: 0, y: 0, zoom: 1 };

describe("sticky style", () => {
  it("defaults to a yellow, medium, left-aligned, unformatted note", () => {
    expect(normalizeStickyStyle(undefined)).toEqual({
      design: "classic",
      color: "yellow",
      fontSize: "m",
      align: "left",
      bold: false,
      italic: false,
      strike: false,
      author: "",
      editedAt: null,
      filePath: "",
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

describe("folder sticky design", () => {
  it("checks colour and size against the folder palette", () => {
    expect(normalizeStickyStyle({ design: "folder" })).toMatchObject({ design: "folder", color: "maroon", fontSize: "m" });
    expect(normalizeStickyStyle({ design: "folder", color: "forest", fontSize: "xl" })).toMatchObject({ color: "forest", fontSize: "xl" });
    expect(normalizeStickyStyle({ design: "folder", color: "yellow" }).color).toBe("maroon");
    expect(normalizeStickyStyle({ design: "glitter" }).design).toBe("classic");
  });

  it("keeps the last-edited time only when it's a real date", () => {
    expect(normalizeStickyStyle({ editedAt: "2026-10-29T10:15:00.000Z" }).editedAt).toBe("2026-10-29T10:15:00.000Z");
    expect(normalizeStickyStyle({ editedAt: "yesterday" }).editedAt).toBeNull();
  });

  it("keeps width between 320 and 1280 and is never shorter than an empty note", () => {
    expect([100, 480, 2000, Number.NaN].map(clampFolderStickyWidth)).toEqual([320, 480, 1280, 480]);
    expect(normalizeCard({ type: "canvas-text", variant: "sticky", sticky: { design: "folder" }, width: 640, height: 100 }))
      .toMatchObject({ width: 640, height: 484 });
    expect(normalizeCard({ type: "canvas-text", variant: "sticky", sticky: { design: "folder" }, width: 640, height: 900 }))
      .toMatchObject({ width: 640, height: 900 });
  });

  it("keeps its own title next to the text", () => {
    const card = normalizeCard({ type: "canvas-text", variant: "sticky", title: "Ideas", text: "one\ntwo", sticky: { design: "folder" } });
    expect(card).toMatchObject({ title: "Ideas", text: "one\ntwo" });
  });

  it("renders with the folder tile", () => {
    expect(getTileRegistration({ type: "canvas-text", variant: "sticky", source: "local", sticky: { design: "folder" } }).Component)
      .toBe(StickyFolderTile);
  });
});

describe("code-file sticky design", () => {
  it("uses the language as its colour", () => {
    expect(normalizeStickyStyle({ design: "code-file" })).toMatchObject({ design: "code-file", color: "html", filePath: "" });
    expect(normalizeStickyStyle({ design: "code-file", color: "rust", filePath: "C:\\src\\main.rs" }))
      .toMatchObject({ color: "rust", filePath: "C:\\src\\main.rs" });
    expect(normalizeStickyStyle({ design: "code-file", color: "yellow" }).color).toBe("html");
  });

  it("reads a linked file's name and language from its path", () => {
    expect(describeCodeFilePath("C:\\Users\\you\\app\\Button.tsx")).toEqual({ name: "Button", languageId: "react" });
    expect(describeCodeFilePath("/home/you/scripts/build.sh")).toEqual({ name: "build", languageId: "sh" });
    expect(describeCodeFilePath("/repo/Dockerfile")).toEqual({ name: "Dockerfile", languageId: "docker" });
    expect(describeCodeFilePath("/repo/notes.txt")).toEqual({ name: "notes", languageId: null });
  });

  it("keeps its 497 x 735 proportions within 160 to 994 wide", () => {
    expect([100, 300, 2000].map(clampCodeFileWidth)).toEqual([160, 300, 994]);
    expect(normalizeCard({ type: "canvas-text", variant: "sticky", sticky: { design: "code-file" }, width: 497, height: 100 }))
      .toMatchObject({ width: 497, height: 735 });
  });

  it("shows imported coding files as code files, other files in the default design", () => {
    const htmlFile = normalizeCard({ type: "file", width: 344, file: { relativePath: "index.html", fileName: "index.html" } });
    expect(htmlFile).toMatchObject({ width: 344, height: 509 });
    expect(getFileCardCodeLanguageId(htmlFile)).toBe("html");
    expect(getTileRegistration(htmlFile).Component).toBe(StickyCodeFileTile);

    const blendFile = normalizeCard({ type: "file", width: 610, height: 900, file: { relativePath: "a.blend", fileName: "a.blend" } });
    expect(blendFile).toMatchObject({ width: 610, height: 415, fileColor: null });
    expect(getFileCardCodeLanguageId(blendFile)).toBeNull();
    expect(getTileRegistration(blendFile).Component).toBe(FileTile);
  });

  it("keeps a default file's colour only when it's a hex colour", () => {
    const card = (fileColor) => normalizeCard({ type: "file", fileColor, file: { relativePath: "a.flo", fileName: "a.flo" } });
    expect(card("#c955f4").fileColor).toBe("#C955F4");
    expect(card("purple").fileColor).toBeNull();
    expect(normalizeCard({ type: "file", fileColor: "#C955F4", file: { relativePath: "a.css", fileName: "a.css" } }).fileColor).toBeNull();
  });

  it("offers Change colour in the right-click menu only for default files", () => {
    const actions = (showFileColor) => buildRadialMenuActions({
      menu: { kind: "tile", selectionIds: ["a"] },
      showFileColor,
      handlers: { onChangeFileColor: () => true },
    }).filter(Boolean).map((action) => action.label);
    expect(actions(true)).toContain("Change colour");
    expect(actions(false)).not.toContain("Change colour");
  });

  it("splits file names and sizes for the default design", () => {
    expect(splitFileName("Model.final.BLEND")).toEqual({ name: "Model.final", extension: ".blend" });
    expect(splitFileName("Makefile")).toEqual({ name: "Makefile", extension: "" });
    expect([0, 2048, 5 * 1024 * 1024, 42 * 1024 * 1024].map(formatFileSize)).toEqual(["0 MB", "2 KB", "5.0 MB", "42 MB"]);
  });

  it("renders with the code-file tile", () => {
    expect(getTileRegistration({ type: "canvas-text", variant: "sticky", source: "local", sticky: { design: "code-file" } }).Component)
      .toBe(StickyCodeFileTile);
  });
});
