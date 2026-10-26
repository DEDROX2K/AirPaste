// Characterization tests for lib/workspace.js's normalizeCard(): the single
// ~180-line dispatcher every tile type's data flows through on every
// load/save/create/update. These tests exist as the safety net for the
// planned extraction of each type's logic into its own
// renderer/src/tiles/<type>/model.js file (Phase 2B part 2) -- they pin
// down today's actual behavior per type so that refactor can be verified
// against it, the same way Phase 0's tests preceded Phase 1's schema fixes.
import { describe, expect, it } from "vitest";
import { normalizeCard } from "@/lib/workspace.js";

describe("normalizeCard", () => {
  it("returns null for an unrecognized or legacy type (e.g. a pre-flatten legacy folder card)", () => {
    expect(normalizeCard({ type: "folder" })).toBeNull();
    expect(normalizeCard({ type: "some-unknown-type" })).toBeNull();
    expect(normalizeCard({})).toBeNull();
  });

  it("normalizes a link card, defaulting the preview status and leaving other types' fields blank", () => {
    const card = normalizeCard({
      type: "link",
      url: "https://example.com/post",
      title: "Example Post",
      siteName: "example.com",
      status: "ready",
      x: 10,
      y: 20,
    });

    expect(card).toMatchObject({
      type: "link",
      url: "https://example.com/post",
      title: "Example Post",
      siteName: "example.com",
      status: "ready",
      contentType: "link",
      x: 10,
      y: 20,
      width: 340,
      height: 280,
    });
    // Fields that only apply to other types stay at their blank defaults.
    expect(card.items).toEqual([]);
    expect(card.columns).toEqual([]);
    expect(card.value).toBeNull();
  });

  it("defaults an unknown link preview status to idle rather than passing it through", () => {
    const card = normalizeCard({ type: "link", url: "https://example.com", status: "not-a-real-status" });
    expect(card.status).toBe("idle");
  });

  it("normalizes a file card, deriving the title from the file name when no title is set", () => {
    const card = normalizeCard({
      type: "file",
      file: { relativePath: "assets/report.pdf", fileName: "report.pdf", extension: "pdf", sizeBytes: 100 },
    });

    expect(card.type).toBe("file");
    expect(card.title).toBe("report.pdf");
    expect(card.file).toMatchObject({ relativePath: "assets/report.pdf", fileName: "report.pdf" });
    expect(card.width).toBe(344);
    expect(card.height).toBe(436);
  });

  it("normalizes an amazon-product card's product fields", () => {
    const card = normalizeCard({
      type: "amazon-product",
      url: "https://amazon.com/dp/B000",
      productAsin: "B000",
      productPrice: "$19.99",
      productRating: 4.5,
      productReviewCount: 1234.9,
    });

    expect(card).toMatchObject({
      type: "amazon-product",
      productAsin: "B000",
      productPrice: "$19.99",
      productRating: 4.5,
      productReviewCount: 1235,
      width: 340,
      height: 388,
    });
  });

  it("normalizes a calendar card with its month/year/view/theme fields and defaults", () => {
    const card = normalizeCard({ type: "calendar", view: "week", themeId: "mist", heightPreset: "tall" });

    expect(card.type).toBe("calendar");
    expect(card.view).toBe("week");
    expect(card.themeId).toBe("mist");
    expect(card.title).toBe("Calendar");
    expect(card.width).toBe(920);
    expect(card.height).toBe(468);
  });

  it("normalizes a checklist card's items, staying empty when it has none", () => {
    const withItems = normalizeCard({
      type: "checklist",
      items: [{ id: "a", text: "Buy milk", checked: true }],
      dateLabel: "Thu, 2 May 2024",
      timeLabel: "15:30",
    });
    expect(withItems.items).toEqual([{ id: "a", text: "Buy milk", checked: true }]);
    expect(withItems.dateLabel).toBe("Thu, 2 May 2024");
    expect(withItems.timeLabel).toBe("15:30");

    const withoutItems = normalizeCard({ type: "checklist", createdAt: "2024-05-02T15:30:00" });
    expect(withoutItems.items).toEqual([]);
    expect(withoutItems.title).toBe("Things to do today");
    expect(withoutItems.dateLabel).toBe("Thu, 2 May 2024");
    expect(withoutItems.timeLabel).toBe("15:30");
  });

  it("normalizes a code card, defaulting language to plain and preserving wrap/line-number flags", () => {
    const card = normalizeCard({ type: "code", code: "console.log(1)", language: "javascript", wrap: false });
    expect(card).toMatchObject({
      type: "code",
      code: "console.log(1)",
      language: "javascript",
      wrap: false,
      showLineNumbers: true,
    });

    const defaulted = normalizeCard({ type: "code" });
    expect(defaulted.language).toBe("plain");
  });

  it("normalizes a counter card's value/step/unit with their defaults", () => {
    const card = normalizeCard({ type: "counter", value: 7, step: 2, unit: "reps" });
    expect(card).toMatchObject({ type: "counter", value: 7, step: 2, unit: "reps", title: "Counter" });

    const defaulted = normalizeCard({ type: "counter" });
    expect(defaulted).toMatchObject({ value: 0, step: 1, unit: "" });
  });

  it("normalizes a deadline card's target and showSeconds flag", () => {
    const card = normalizeCard({
      type: "deadline",
      targetAt: "2027-01-01T00:00:00.000Z",
      showSeconds: true,
    });
    expect(card).toMatchObject({
      type: "deadline",
      targetAt: "2027-01-01T00:00:00.000Z",
      showSeconds: true,
      title: "Launch countdown",
    });
    // normalizeDeadlineTimezone currently always returns "local" regardless
    // of input -- both branches of its ternary return the same constant.
    // This looks like unfinished/stubbed timezone support, not something
    // this characterization test should paper over or "fix" in passing.
    expect(card.timezone).toBe("local");
  });

  it("normalizes a progress card's mode/value/max/linkedTileId", () => {
    const card = normalizeCard({ type: "progress", mode: "linked", value: 40, max: 80, linkedTileId: "tile-1" });
    expect(card).toMatchObject({
      type: "progress",
      mode: "linked",
      value: 40,
      max: 80,
      linkedTileId: "tile-1",
    });
  });

  it("normalizes a table card's columns and rows, falling back to default seed data when empty", () => {
    const card = normalizeCard({
      type: "table",
      columns: [{ id: "col_a", name: "A", kind: "text" }],
      rows: [{ id: "row_1", cells: { col_a: "hello" } }],
    });
    expect(card.columns).toEqual([{ id: "col_a", name: "A", kind: "text" }]);
    expect(card.rows).toEqual([{ id: "row_1", cells: { col_a: "hello" } }]);

    const defaulted = normalizeCard({ type: "table" });
    expect(defaulted.columns.length).toBeGreaterThan(0);
    expect(defaulted.rows.length).toBeGreaterThan(0);
  });

  it("normalizes a rack card's tileIds and computes its size from slot count", () => {
    const card = normalizeCard({ type: "rack", tileIds: ["a", "b"], minSlots: 3 });
    expect(card.type).toBe("rack");
    expect(card.tileIds).toEqual(["a", "b"]);
    expect(card.minSlots).toBe(3);
    expect(card.width).toBeGreaterThan(0);
    expect(card.height).toBeGreaterThan(0);
  });

  it("aliases note and text-box legacy types to canvas-text, preserving the text content", () => {
    // The legacy "note" type historically stored its content in `body`, not
    // `text` -- normalizeCanvasTextPayload still reads it from there.
    const noteCard = normalizeCard({ type: "note", body: "Legacy note body" });
    expect(noteCard.type).toBe("canvas-text");
    expect(noteCard.text).toBe("Legacy note body");

    const textBoxCard = normalizeCard({ type: "text-box", text: "Legacy text box body" });
    expect(textBoxCard.type).toBe("canvas-text");
    expect(textBoxCard.text).toBe("Legacy text box body");
  });

  it("normalizes a canvas-text card, preserving its text and deriving a title when absent", () => {
    const card = normalizeCard({ type: "canvas-text", text: "# Hello\nWorld", format: "markdown" });
    expect(card.type).toBe("canvas-text");
    expect(card.text).toBe("# Hello\nWorld");
    expect(card.title.length).toBeGreaterThan(0);
  });

  it("is idempotent: normalizing an already-normalized card twice yields the same result", () => {
    const once = normalizeCard({ type: "counter", value: 5, step: 2, unit: "km", id: "card-1", x: 1, y: 2 });
    const twice = normalizeCard(once);
    expect(twice).toEqual(once);
  });

  it("generates a stable id when none is provided, derived from the fallback index", () => {
    const card = normalizeCard({ type: "link", url: "https://example.com" }, 3);
    expect(card.id).toMatch(/^card-3-/);
  });
});
