// Draws each Constellation tile onto its own small 2D canvas, which the scene
// uses as a texture. A tile is painted straight away as a plain card (title,
// text, colour), then repainted once if it has a picture and the picture has
// loaded -- so nothing waits on the network and a missing or blocked image
// just leaves the card. Pictures are decoded off the main thread at a small
// size (createImageBitmap), which keeps 200+ of them cheap.

import { getEntryTitle, getSerendipityKind, getStickyHex } from "../../lib/serendipity";
import { getDomainLabel } from "../../lib/workspace";
import { PREVIEW_TIER } from "../canvas/tileLod";
import { resolveAssetPreviewUrl } from "../canvas/useTilePreviewSource";

export const TILE_TEXTURE_HEIGHT = 288;
const RADIUS = 20;
const PAPER = "#fffdfa";
const INK = "#1d1b19";
const INK_SOFT = "rgba(29, 27, 25, 0.6)";

export function getTileCanvasSize(aspect) {
  return {
    width: Math.max(176, Math.min(544, Math.round(TILE_TEXTURE_HEIGHT * aspect))),
    height: TILE_TEXTURE_HEIGHT,
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;

      if (lines.length === maxLines) {
        break;
      }
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  if (words.length > 0 && lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const used = lines.join(" ").length;

    if (used < words.join(" ").length) {
      lines[maxLines - 1] = `${last.replace(/[.,;:\s]+$/, "")}…`;
    }
  }

  return lines;
}

function drawText(ctx, text, x, y, { size, weight = 500, color = INK, maxWidth, maxLines, lineHeight = 1.25, family = "system-ui, sans-serif" }) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  const lines = wrap(ctx, text, maxWidth, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * size * lineHeight));
  return y + lines.length * size * lineHeight;
}

function drawCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function hueFor(text) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash % 360;
}

function paintPlaceholder(ctx, W, H, seed) {
  const hue = hueFor(seed);
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, `hsl(${hue} 22% 26%)`);
  gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 24% 16%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

// Whether a tile has a picture to show (loaded or still to load).
export function hasTileImage(card) {
  return Boolean(card?.asset?.relativePath) || (typeof card?.image === "string" && card.image.length > 0);
}

// Repaints the whole tile. `bitmap` is the picture once it has loaded; `failed`
// says it never will. A tile with a picture shows ONLY the picture (no title,
// no text) -- until it arrives it is a quiet colour wash, and if it can't be
// read the tile falls back to its plain card.
export function paintTile(canvas, entry, bitmap = null, failed = false) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const card = entry.card;
  const kind = getSerendipityKind(card);
  const pad = 20;
  const inner = W - pad * 2;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  roundRect(ctx, 0, 0, W, H, RADIUS);
  ctx.clip();

  const pictureOnly = (kind === "image" || kind === "link") && !failed && hasTileImage(card);

  if (pictureOnly || kind === "image") {
    if (bitmap) {
      drawCover(ctx, bitmap, 0, 0, W, H);
    } else {
      paintPlaceholder(ctx, W, H, entry.key);
    }
  } else if (kind === "link") {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    let y = pad;
    drawText(ctx, card.siteName || getDomainLabel(card.url), pad, y, { size: 15, weight: 600, color: INK_SOFT, maxWidth: inner, maxLines: 1 });
    y += 24;
    const bottom = drawText(ctx, card.title || card.url, pad, y, { size: 22, weight: 700, maxWidth: inner, maxLines: 5, lineHeight: 1.18 });

    if (card.description && bottom < H - 60) {
      drawText(ctx, card.description, pad, bottom + 10, { size: 16, color: INK_SOFT, maxWidth: inner, maxLines: 5 });
    }
  } else if (kind === "sticky") {
    ctx.fillStyle = getStickyHex(card);
    ctx.fillRect(0, 0, W, H);
    const y = card.title ? drawText(ctx, card.title, pad, pad, { size: 22, weight: 700, maxWidth: inner, maxLines: 2 }) + 8 : pad;
    drawText(ctx, card.text, pad, y, { size: 20, maxWidth: inner, maxLines: 8, lineHeight: 1.3 });
  } else if (kind === "code") {
    ctx.fillStyle = "#17161c";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    ctx.fillRect(0, 0, W, 38);
    drawText(ctx, `${card.title || "Snippet"}${card.language ? `  ·  ${card.language}` : ""}`, pad, 11, { size: 14, weight: 600, color: "rgba(255,255,255,0.6)", maxWidth: inner, maxLines: 1 });
    const lines = String(card.code ?? "").split(/\r?\n/).slice(0, 12);
    ctx.font = "500 14px ui-monospace, Consolas, monospace";
    ctx.fillStyle = "#cfd3e6";
    ctx.textBaseline = "top";
    lines.forEach((line, index) => {
      ctx.fillText(line.length > 46 ? `${line.slice(0, 45)}…` : line, pad, 52 + index * 20);
    });
  } else if (kind === "checklist") {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    let y = card.title ? drawText(ctx, card.title, pad, pad, { size: 22, weight: 700, maxWidth: inner, maxLines: 2 }) + 12 : pad;
    card.items.filter((item) => item.text.trim()).slice(0, 7).forEach((item) => {
      ctx.strokeStyle = INK_SOFT;
      ctx.lineWidth = 2;
      roundRect(ctx, pad, y + 2, 16, 16, 4);
      ctx.stroke();

      if (item.checked) {
        ctx.fillStyle = INK_SOFT;
        ctx.fill();
      }

      y = Math.max(y + 28, drawText(ctx, item.text, pad + 28, y, { size: 17, color: item.checked ? INK_SOFT : INK, maxWidth: inner - 28, maxLines: 1 }) + 8);
    });
  } else if (kind === "file") {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(29, 27, 25, 0.08)";
    roundRect(ctx, pad, pad, 76, 34, 10);
    ctx.fill();
    drawText(ctx, card.file?.extension ? `.${card.file.extension}` : "file", pad + 12, pad + 8, { size: 16, weight: 700, color: INK_SOFT, maxWidth: 60, maxLines: 1 });
    drawText(ctx, getEntryTitle(card), pad, pad + 56, { size: 22, weight: 700, maxWidth: inner, maxLines: 4 });
  } else {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    let y = card.title ? drawText(ctx, card.title, pad, pad, { size: 24, weight: 700, maxWidth: inner, maxLines: 3 }) + 10 : pad;

    if (card.subtitle) {
      y = drawText(ctx, card.subtitle, pad, y, { size: 16, color: INK_SOFT, maxWidth: inner, maxLines: 2 }) + 8;
    }

    drawText(ctx, card.text, pad, y, { size: 18, maxWidth: inner, maxLines: Math.max(2, Math.floor((H - y - pad) / 23)), lineHeight: 1.3 });
  }

  ctx.restore();
}

// The picture a tile shows, if it has one: its saved image asset (loaded
// through the app's own asset protocol) or the link's preview image.
async function resolveImageUrl(card, folderPath) {
  const relativePath = card?.asset?.relativePath;

  if (relativePath && folderPath) {
    const medium = await resolveAssetPreviewUrl({ folderPath, relativePath, previewTier: PREVIEW_TIER.MEDIUM, devicePixelRatio: 1 });
    return medium || resolveAssetPreviewUrl({ folderPath, relativePath, previewTier: PREVIEW_TIER.ORIGINAL, devicePixelRatio: 1 });
  }

  return typeof card?.image === "string" ? card.image : "";
}

// Loads a tile's picture as a small bitmap, or null when it has none or it
// can't be read (a remote image without CORS headers, say).
export async function loadTileBitmap(entry, folderPath, signal) {
  const kind = getSerendipityKind(entry.card);

  if (kind !== "image" && kind !== "link") {
    return null;
  }

  try {
    const url = await resolveImageUrl(entry.card, folderPath);

    if (!url || signal?.aborted) {
      return null;
    }

    const response = await fetch(url, { signal, mode: "cors" });

    if (!response.ok) {
      return null;
    }

    return await createImageBitmap(await response.blob(), {
      resizeHeight: TILE_TEXTURE_HEIGHT,
      resizeQuality: "medium",
    });
  } catch {
    return null;
  }
}

// Runs jobs a few at a time, in the order given.
export function createLoadQueue(concurrency = 5) {
  const waiting = [];
  let running = 0;

  function pump() {
    while (running < concurrency && waiting.length > 0) {
      const job = waiting.shift();
      running += 1;
      job().finally(() => {
        running -= 1;
        pump();
      });
    }
  }

  return {
    add(job) {
      waiting.push(job);
      pump();
    },
    clear() {
      waiting.length = 0;
    },
  };
}

// Decoded pictures, kept by item so a tile that comes round again (or that is
// shown in several slots) never loads twice, and so the tiles about to be shown
// can be fetched ahead of time: when a slot is refilled its picture is already
// here and it is painted at once, with no placeholder and no wait.
//   peek(item)  -> undefined (not loaded) | { bitmap } (bitmap null: unreadable)
//   load(item)  -> Promise of the same, loading it if needed
export function createBitmapCache(maxEntries = 180) {
  const done = new Map();
  const pending = new Map();

  function remember(item, value) {
    done.delete(item);
    done.set(item, value);

    while (done.size > maxEntries) {
      const oldest = done.keys().next().value;
      done.get(oldest)?.bitmap?.close?.();
      done.delete(oldest);
    }
  }

  return {
    peek(item) {
      return done.get(item);
    },
    has(item) {
      return done.has(item) || pending.has(item);
    },
    load(item, entry, folderPath) {
      if (done.has(item)) {
        return Promise.resolve(done.get(item));
      }

      if (!pending.has(item)) {
        pending.set(item, loadTileBitmap(entry, folderPath).then((bitmap) => {
          pending.delete(item);
          const value = { bitmap };
          remember(item, value);
          return value;
        }));
      }

      return pending.get(item);
    },
    clear() {
      done.forEach((value) => value.bitmap?.close?.());
      done.clear();
      pending.clear();
    },
  };
}
