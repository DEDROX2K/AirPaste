import * as THREE from "three";

const TILE_SKIN_TEXTURE_CACHE = new Map();

export function getTileSkinKind(card) {
  if (card?.type === "rack") {
    return "folder";
  }

  if (card?.contentKind === "image" || (typeof card?.image === "string" && card.image.trim().length > 0)) {
    return "image";
  }

  if (typeof card?.url === "string" && card.url.trim().length > 0) {
    return "bookmark";
  }

  return "note";
}

export function getTileImageSource(card) {
  if (typeof card?.image === "string" && card.image.trim().length > 0) {
    return card.image;
  }

  if (typeof card?.asset?.relativePath === "string" && card.asset.relativePath.trim().length > 0) {
    return card.asset.relativePath;
  }

  return null;
}

export function getTileSkinCacheKey(card, lodLevel) {
  const stamp = typeof card?.updatedAt === "string" ? card.updatedAt : "";
  const title = typeof card?.title === "string" ? card.title.slice(0, 60) : "";
  const kind = getTileSkinKind(card);
  return `${card?.id ?? "unknown"}:${kind}:${lodLevel}:${title}:${stamp}`;
}

function getDisplayTitle(card) {
  const title = typeof card?.title === "string" ? card.title.trim() : "";

  if (title) {
    return title;
  }

  if (typeof card?.url === "string" && card.url.trim().length > 0) {
    try {
      const parsed = new URL(card.url);
      return parsed.hostname.replace(/^www\./i, "");
    } catch {
      return card.url;
    }
  }

  return "AirPaste";
}

function getSubtitle(card, kind) {
  if (kind === "folder") {
    const count = Array.isArray(card?.tileIds) ? card.tileIds.length : 0;
    return `${count} item${count === 1 ? "" : "s"}`;
  }

  if (kind === "bookmark") {
    if (typeof card?.siteName === "string" && card.siteName.trim().length > 0) {
      return card.siteName;
    }

    if (typeof card?.url === "string") {
      try {
        const parsed = new URL(card.url);
        return parsed.hostname.replace(/^www\./i, "");
      } catch {
        return "link";
      }
    }

    return "link";
  }

  if (kind === "image") {
    return "image";
  }

  return typeof card?.description === "string" && card.description.trim().length > 0
    ? card.description
    : "note";
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawFaviconGlyph(ctx, title) {
  const glyph = (title || "A").trim().charAt(0).toUpperCase() || "A";
  ctx.fillStyle = "rgba(52, 38, 22, 0.82)";
  ctx.font = "700 52px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, 80, 80);
}

export function createTileSkinTexture(card, lodLevel = "mid") {
  const cacheKey = getTileSkinCacheKey(card, lodLevel);

  if (TILE_SKIN_TEXTURE_CACHE.has(cacheKey)) {
    return TILE_SKIN_TEXTURE_CACHE.get(cacheKey);
  }

  const kind = getTileSkinKind(card);
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (context) {
    const title = getDisplayTitle(card);
    const subtitle = getSubtitle(card, kind);
    const highDetail = lodLevel === "close";
    const compactDetail = lodLevel === "far";

    if (kind === "bookmark") {
      context.fillStyle = "rgba(255, 250, 242, 0.98)";
      drawRoundedRect(context, 18, 18, 732, 476, 54);
      context.fill();
      context.strokeStyle = "rgba(58, 44, 29, 0.18)";
      context.lineWidth = 4;
      context.stroke();

      context.fillStyle = "rgba(245, 236, 220, 0.9)";
      drawRoundedRect(context, 38, 38, 84, 84, 24);
      context.fill();
      drawFaviconGlyph(context, title);

      context.fillStyle = "rgba(43, 33, 22, 0.92)";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = highDetail ? "700 48px Georgia" : "700 40px Georgia";
      context.fillText(title.slice(0, compactDetail ? 18 : 30), 146, 78);
      context.fillStyle = "rgba(95, 73, 46, 0.84)";
      context.font = highDetail ? "600 30px Georgia" : "600 26px Georgia";
      context.fillText(subtitle.slice(0, compactDetail ? 20 : 34), 146, 118);

      context.fillStyle = "rgba(235, 224, 206, 0.72)";
      drawRoundedRect(context, 42, 156, 682, 312, 26);
      context.fill();
      context.fillStyle = "rgba(181, 160, 129, 0.32)";
      for (let row = 0; row < 4; row += 1) {
        context.fillRect(72, 202 + (row * 58), 620 - (row * 24), 16);
      }
    }

    if (kind === "image") {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "rgba(255, 237, 200, 0.95)");
      gradient.addColorStop(1, "rgba(253, 215, 171, 0.94)");
      context.fillStyle = gradient;
      drawRoundedRect(context, 20, 20, 728, 472, 52);
      context.fill();
      context.strokeStyle = "rgba(57, 38, 20, 0.22)";
      context.lineWidth = 4;
      context.stroke();

      context.fillStyle = "rgba(255, 248, 236, 0.78)";
      drawRoundedRect(context, 48, 48, 672, 340, 28);
      context.fill();
      context.fillStyle = "rgba(103, 74, 46, 0.58)";
      context.font = "700 50px Georgia";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("IMAGE", 384, 216);

      context.fillStyle = "rgba(48, 33, 20, 0.9)";
      context.textAlign = "left";
      context.font = highDetail ? "700 44px Georgia" : "700 36px Georgia";
      context.fillText(title.slice(0, compactDetail ? 18 : 26), 60, 432);
      context.fillStyle = "rgba(89, 62, 35, 0.82)";
      context.font = "600 28px Georgia";
      context.fillText(subtitle.slice(0, 26), 60, 468);
    }

    if (kind === "note") {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "rgba(254, 244, 188, 0.95)");
      gradient.addColorStop(1, "rgba(248, 224, 160, 0.92)");
      context.fillStyle = gradient;
      drawRoundedRect(context, 22, 22, 724, 468, 40);
      context.fill();
      context.strokeStyle = "rgba(99, 79, 50, 0.26)";
      context.lineWidth = 4;
      context.stroke();

      context.fillStyle = "rgba(53, 38, 19, 0.88)";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = highDetail ? "700 48px Georgia" : "700 40px Georgia";
      context.fillText(title.slice(0, compactDetail ? 18 : 28), 56, 86);
      context.fillStyle = "rgba(77, 60, 35, 0.8)";
      context.font = "600 28px Georgia";
      for (let line = 0; line < 5; line += 1) {
        context.fillText(subtitle.slice(0, compactDetail ? 24 : 42), 56, 148 + (line * 62));
      }
    }

    if (kind === "folder") {
      context.fillStyle = "rgba(248, 236, 206, 0.95)";
      drawRoundedRect(context, 54, 74, 658, 392, 34);
      context.fill();
      context.strokeStyle = "rgba(78, 61, 38, 0.24)";
      context.lineWidth = 4;
      context.stroke();

      context.fillStyle = "rgba(253, 228, 172, 0.92)";
      drawRoundedRect(context, 74, 46, 266, 72, 22);
      context.fill();

      context.fillStyle = "rgba(66, 47, 24, 0.9)";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = highDetail ? "700 44px Georgia" : "700 36px Georgia";
      context.fillText(title.slice(0, compactDetail ? 16 : 24), 88, 252);
      context.fillStyle = "rgba(95, 71, 42, 0.82)";
      context.font = "600 28px Georgia";
      context.fillText(subtitle.slice(0, 20), 88, 300);

      context.fillStyle = "rgba(237, 220, 185, 0.76)";
      drawRoundedRect(context, 380, 124, 290, 290, 22);
      context.fill();
      context.fillStyle = "rgba(180, 152, 108, 0.34)";
      drawRoundedRect(context, 412, 154, 226, 64, 16);
      context.fill();
      drawRoundedRect(context, 412, 238, 226, 64, 16);
      context.fill();
      drawRoundedRect(context, 412, 322, 226, 64, 16);
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  TILE_SKIN_TEXTURE_CACHE.set(cacheKey, texture);
  return texture;
}
