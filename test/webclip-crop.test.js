// Cropping a webclip from the bottom with its handle (tiles/link/webclipCrop.js).
import { describe, expect, it } from "vitest";
import { normalizeCard } from "@/lib/workspace.js";
import {
  WEBCLIP_MIN_CROP_HEIGHT,
  getWebclipCropPatch,
  getWebclipFullHeight,
  getWebclipHeight,
} from "@/tiles/link/webclipCrop.js";

// A 400px-wide webclip of a page 5x taller than wide: 2000px tall.
const webclip = (extra = {}) => normalizeCard({
  id: "clip",
  type: "link",
  url: "https://example.com",
  previewMode: "webclip",
  webclipImagePath: ".airpaste/previews/webclip/a.jpg",
  webclipAspectRatio: 0.2,
  x: 0,
  y: 0,
  width: 400,
  height: 2000,
  ...extra,
});

describe("webclip crop", () => {
  it("crops the tile shorter, keeping the crop as a share of the whole page", () => {
    const card = webclip();
    expect(getWebclipFullHeight(card)).toBe(2000);

    const patch = getWebclipCropPatch(card, 600);
    expect(patch).toEqual({ height: 600, webclipCropRatio: 0.3 });
    expect(normalizeCard({ ...card, ...patch }).webclipCropRatio).toBe(0.3);
  });

  it("clamps between the minimum and the whole page, and dragging back down uncrops", () => {
    const card = webclip();
    expect(getWebclipCropPatch(card, 10).height).toBe(WEBCLIP_MIN_CROP_HEIGHT);
    expect(getWebclipCropPatch(card, 99999)).toEqual({ height: 2000, webclipCropRatio: null });
    // A page shorter than the minimum can't be cropped below itself.
    expect(getWebclipCropPatch(webclip({ webclipAspectRatio: 4, height: 100 }), 10).height).toBe(100);
  });

  it("keeps the crop when the webclip is shown again at its width", () => {
    expect(getWebclipHeight(400, 0.2, 0.3)).toBe(600);
    expect(getWebclipHeight(400, 0.2, null)).toBe(2000);
    expect(getWebclipHeight(400, 0.2, 0.001)).toBe(WEBCLIP_MIN_CROP_HEIGHT);
  });

  it("drops a malformed crop and has nothing to crop without the page's proportions", () => {
    expect(webclip({ webclipCropRatio: 3 }).webclipCropRatio).toBeNull();
    expect(webclip({ webclipCropRatio: "x" }).webclipCropRatio).toBeNull();
    expect(getWebclipCropPatch(webclip({ webclipAspectRatio: null }), 500)).toBeNull();
  });
});
