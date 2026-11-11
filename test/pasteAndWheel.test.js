import { describe, expect, it } from "vitest";
import { isMouseWheelEvent } from "../renderer/src/systems/canvas/useCanvasSystem";
import { createLinkCard } from "../renderer/src/tiles/link/model";

describe("isMouseWheelEvent", () => {
  it("treats notched vertical wheel steps as a mouse", () => {
    expect(isMouseWheelEvent({ deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120 })).toBe(true);
    expect(isMouseWheelEvent({ deltaMode: 0, deltaX: 0, deltaY: -200, wheelDeltaY: 240 })).toBe(true);
    expect(isMouseWheelEvent({ deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe(true);
  });

  it("treats small or diagonal pixel deltas as a trackpad", () => {
    expect(isMouseWheelEvent({ deltaMode: 0, deltaX: 0, deltaY: 4.5, wheelDeltaY: -13 })).toBe(false);
    expect(isMouseWheelEvent({ deltaMode: 0, deltaX: 2, deltaY: 100, wheelDeltaY: -120 })).toBe(false);
  });
});

describe("createLinkCard exactCenter", () => {
  const blocker = { id: "a", type: "link", x: 0, y: 0, width: 400, height: 400 };
  const viewport = { x: 0, y: 0, zoom: 1 };

  it("centres a pasted tile on the point, even on top of another tile", () => {
    const card = createLinkCard([blocker], viewport, "https://example.com", { x: 200, y: 200 }, { exactCenter: true });
    expect(card.x + card.width / 2).toBe(200);
    expect(card.y + card.height / 2).toBe(200);
  });

  it("centres on the tile's real size when one is given", () => {
    const card = createLinkCard([blocker], viewport, "", { x: 500, y: 300 }, { exactCenter: true, width: 600, height: 200 });
    expect(card.x).toBe(200);
    expect(card.y).toBe(200);
  });

  it("still steps aside when not pasting", () => {
    const card = createLinkCard([blocker], viewport, "https://example.com", { x: 200, y: 200 });
    expect(card.x + card.width / 2 === 200 && card.y + card.height / 2 === 200).toBe(false);
  });
});
