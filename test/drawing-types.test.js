import { describe, expect, it } from "vitest";
import {
  areDrawingObjectsEqual,
  DRAWINGS_SCHEMA_VERSION,
  normalizeDrawings,
} from "../renderer/src/systems/drawing/drawingTypes.js";

describe("drawings v2", () => {
  it("migrates v1 line objects to line strokes", () => {
    const drawings = normalizeDrawings({
      version: 1,
      objects: [{ id: "a", type: "line", points: [0, 0, 10, 20], style: { stroke: "#ff0000", strokeWidth: 4 } }],
    });

    expect(drawings.version).toBe(DRAWINGS_SCHEMA_VERSION);
    expect(drawings.objects).toEqual([
      { id: "a", type: "stroke", tool: "line", color: "#ff0000", size: 4, points: [[0, 0, 1], [10, 20, 1]] },
    ]);
  });

  it("keeps valid strokes and the drawings object by reference", () => {
    const stroke = { id: "s", type: "stroke", tool: "ink", color: "#1E1E1E", size: 10, points: [[0, 0, 1], [5, 5, 0.8]] };
    const drawings = { version: DRAWINGS_SCHEMA_VERSION, objects: [stroke] };

    expect(normalizeDrawings(drawings)).toBe(drawings);
  });

  it("drops strokes with an unknown tool or no points", () => {
    const drawings = normalizeDrawings({
      version: 2,
      objects: [
        { id: "x", type: "stroke", tool: "spray", color: "#000", size: 3, points: [[0, 0, 1]] },
        { id: "y", type: "stroke", tool: "hl", color: "#FFD400", size: 22, points: [] },
        { id: "z", type: "stroke", tool: "hl", color: "#FFD400", size: 22, points: [[1, 2], [3, 4]] },
      ],
    });

    expect(drawings.objects).toEqual([
      { id: "z", type: "stroke", tool: "hl", color: "#FFD400", size: 22, points: [[1, 2, 1], [3, 4, 1]] },
    ]);
  });

  it("compares strokes by content", () => {
    const a = { id: "s", type: "stroke", tool: "hl", color: "#FFD400", size: 22, points: [[0, 0, 1], [1, 1, 1]] };
    expect(areDrawingObjectsEqual(a, { ...a, points: [[0, 0, 1], [1, 1, 1]] })).toBe(true);
    expect(areDrawingObjectsEqual(a, { ...a, points: [[0, 0, 1], [1, 2, 1]] })).toBe(false);
    expect(areDrawingObjectsEqual(a, { ...a, color: "#66E07A" })).toBe(false);
  });
});
