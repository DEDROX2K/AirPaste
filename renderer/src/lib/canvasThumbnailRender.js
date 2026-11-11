import { createLoadQueue, getTileCanvasSize, hasTileImage, loadTileBitmap, paintTile } from "../systems/constellation/constellationTextures";

// The Home thumbnail of a canvas, drawn from its data rather than screenshotted:
// every tile on the page laid out where it sits, the whole page scaled to fit,
// on the canvas's dotted paper. Runs entirely offscreen, so leaving a canvas
// shows nothing (the old on-screen capture zoomed the view out and hid the UI
// in front of you). Tiles are painted with Constellation's tile painter.

const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 800;
const PADDING = 56;
const MAX_TILES = 150;
// Pictures still loading after this are drawn as their placeholder wash.
const IMAGE_BUDGET_MS = 2500;
const BACKGROUND = "#efefed";
const DOT = "rgba(0, 0, 0, 0.1)";

function getBounds(cards) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  cards.forEach((card) => {
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + card.width);
    maxY = Math.max(maxY, card.y + card.height);
  });

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function isDrawable(card) {
  return card
    && Number.isFinite(card.x)
    && Number.isFinite(card.y)
    && Number.isFinite(card.width)
    && Number.isFinite(card.height)
    && card.width > 0
    && card.height > 0;
}

async function loadBitmaps(entries, folderPath) {
  const queue = createLoadQueue(6);
  const bitmaps = new Map();
  const controller = new AbortController();
  const jobs = entries
    .filter((entry) => hasTileImage(entry.card))
    .map((entry) => new Promise((resolve) => {
      queue.add(async () => {
        try {
          const bitmap = await loadTileBitmap(entry, folderPath, controller.signal);
          if (bitmap) bitmaps.set(entry.key, bitmap);
        } finally {
          resolve();
        }
      });
    }));

  await Promise.race([
    Promise.allSettled(jobs),
    new Promise((resolve) => window.setTimeout(resolve, IMAGE_BUDGET_MS)),
  ]);
  controller.abort();
  queue.clear();
  return bitmaps;
}

// Returns a JPEG data URL, or "" when the page has no tiles (keep whatever
// thumbnail the canvas already has).
export async function renderCanvasThumbnail(cards, folderPath) {
  const drawable = (Array.isArray(cards) ? cards : []).filter(isDrawable).slice(0, MAX_TILES);

  if (drawable.length === 0 || typeof document === "undefined") {
    return "";
  }

  const bounds = getBounds(drawable);
  const scale = Math.min(
    (THUMB_WIDTH - PADDING * 2) / bounds.width,
    (THUMB_HEIGHT - PADDING * 2) / bounds.height,
    1,
  );
  const offsetX = (THUMB_WIDTH - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = (THUMB_HEIGHT - bounds.height * scale) / 2 - bounds.y * scale;
  const entries = drawable.map((card) => ({ key: card.id, card }));
  const bitmaps = await loadBitmaps(entries, folderPath);

  const output = document.createElement("canvas");
  output.width = THUMB_WIDTH;
  output.height = THUMB_HEIGHT;
  const ctx = output.getContext("2d");
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  // The canvas's dot grid, at the same scale as the tiles.
  const gridStep = Math.max(10, 28 * scale);
  ctx.fillStyle = DOT;
  for (let x = offsetX % gridStep; x < THUMB_WIDTH; x += gridStep) {
    for (let y = offsetY % gridStep; y < THUMB_HEIGHT; y += gridStep) {
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  const tileCanvas = document.createElement("canvas");

  entries.forEach((entry) => {
    const { card } = entry;
    const size = getTileCanvasSize(card.width / card.height);
    tileCanvas.width = size.width;
    tileCanvas.height = size.height;
    paintTile(tileCanvas, entry, bitmaps.get(entry.key) ?? null, hasTileImage(card) && !bitmaps.has(entry.key));

    const x = offsetX + card.x * scale;
    const y = offsetY + card.y * scale;
    const width = card.width * scale;
    const height = card.height * scale;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.16)";
    ctx.shadowBlur = Math.max(2, 10 * scale);
    ctx.shadowOffsetY = Math.max(1, 3 * scale);
    ctx.drawImage(tileCanvas, x, y, width, height);
    ctx.restore();
  });

  bitmaps.forEach((bitmap) => bitmap.close?.());
  return output.toDataURL("image/jpeg", 0.84);
}
