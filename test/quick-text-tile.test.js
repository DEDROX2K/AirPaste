// @vitest-environment jsdom
//
// Quick text: plain text straight on the canvas (canvas-text, plain format),
// Figma text-tool style. Placement, sizing and style are model-level; the
// click/drag gesture and empty-deletes-itself live in the components.
import { describe, expect, it } from "vitest";
import { normalizeCard } from "@/lib/workspace.js";
import {
  TEXT_BOX_COLORS,
  TEXT_BOX_SIZE_OPTIONS,
  getLastTextBoxStyle,
  normalizeTextBoxStyle,
  rememberTextBoxStyle,
} from "@/lib/textBoxStyle.js";
import { createTextBoxCard } from "@/tiles/canvasText/model.js";

const VIEWPORT = { x: 0, y: 0, zoom: 1 };

describe("quick text style", () => {
  it("defaults to Inter-style 24 / 400 ink text at 1.25 line height", () => {
    expect(normalizeTextBoxStyle(undefined)).toMatchObject({
      fontSize: 24,
      fontWeight: 400,
      italic: false,
      align: "left",
      color: "#1E1E1E",
      lineHeight: 1.25,
    });
  });

  it("keeps font sizes between 8 and 600, fractional sizes from corner scaling included", () => {
    expect([2, 37.256, 900].map((fontSize) => normalizeTextBoxStyle({ fontSize }).fontSize)).toEqual([8, 37.26, 600]);
  });

  it("offers the brief's 8 colours and 4 sizes", () => {
    expect(TEXT_BOX_COLORS.map((color) => color.name)).toEqual(["Black", "Gray", "Red", "Orange", "Green", "Blue", "Violet", "Pink"]);
    expect(TEXT_BOX_SIZE_OPTIONS.map((size) => size.id)).toEqual([16, 24, 40, 64]);
  });

  it("starts new text with the last style used", () => {
    rememberTextBoxStyle({ fontSize: 40, fontWeight: 700, italic: true, align: "center", color: "#9747FF" });
    expect(getLastTextBoxStyle()).toMatchObject({ fontSize: 40, fontWeight: 700, italic: true, align: "center", color: "#9747FF" });
  });
});

describe("quick text cards", () => {
  it("places the top-left exactly when given x / y (caret on the click point)", () => {
    const card = createTextBoxCard([], VIEWPORT, { x: 500, y: 500 }, { text: "", x: 94, y: 81, width: 24, height: 38, autoWidth: true });

    expect(card).toMatchObject({ type: "canvas-text", format: "plain", x: 94, y: 81, width: 24, height: 38, autoWidth: true, text: "" });
  });

  it("still centres on the point when no x / y is given", () => {
    const card = createTextBoxCard([], VIEWPORT, { x: 500, y: 500 }, { text: "hi", width: 200, height: 100 });
    expect(card).toMatchObject({ x: 400, y: 450 });
  });

  it("lets short text stay small instead of the 180 x 80 note minimum", () => {
    const card = normalizeCard({ type: "canvas-text", format: "plain", text: "Hi", width: 40, height: 38 });
    expect(card).toMatchObject({ width: 40, height: 38 });

    const note = normalizeCard({ type: "canvas-text", format: "markdown", text: "Hi", width: 40, height: 38 });
    expect(note).toMatchObject({ width: 180, height: 80 });
  });

  it("keeps a fixed width when autoWidth is off", () => {
    expect(normalizeCard({ type: "canvas-text", format: "plain", text: "Wrap me", width: 300, autoWidth: false }))
      .toMatchObject({ width: 300, autoWidth: false });
  });
});
