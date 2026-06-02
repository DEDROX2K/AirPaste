import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { desktop } from "../lib/desktop";
import { CANVAS_TEXT_SOURCE_FILE, deriveCanvasTextSummary, deriveCanvasTextTitle } from "../lib/canvasText";
import { LINK_CONTENT_KIND_IMAGE } from "../lib/workspace";
import { PREVIEW_TIER } from "../systems/canvas/tileLod";
import {
  ensureDitheredPreview,
  getCachedDitheredPreview,
  getDitheredPreviewCacheKey,
} from "../systems/canvas/ditheredPreview";

const DRAG_START_THRESHOLD = 8;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;
const LOD1_DITHER_SIZE = 24;
const LOD1_DITHER_LEVELS = 4;

function parseCssPixel(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function getTileWorldBounds(tile, tileMeta) {
  const styleVars = tileMeta?.styleVars ?? {};
  const width = Number.isFinite(tileMeta?.renderWidth) ? tileMeta.renderWidth : Math.max(1, tile?.width ?? 1);
  const height = Number.isFinite(tileMeta?.renderHeight) ? tileMeta.renderHeight : Math.max(1, tile?.height ?? 1);
  const x = parseCssPixel(styleVars["--tile-x"], Number.isFinite(tile?.x) ? tile.x : 0);
  const y = parseCssPixel(styleVars["--tile-y"], Number.isFinite(tile?.y) ? tile.y : 0);
  const zIndex = parseCssPixel(styleVars["--tile-z"], 0);

  return {
    x,
    y,
    width,
    height,
    zIndex,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

function getGroupWorldBounds(group) {
  const x = parseCssPixel(group?.x, 0);
  const y = parseCssPixel(group?.y, 0);
  const width = Math.max(1, parseCssPixel(group?.width, 1));
  const height = Math.max(1, parseCssPixel(group?.height, 1));

  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

function getBoundsWithOffset(bounds, delta, enabled) {
  if (!enabled || !delta) {
    return bounds;
  }

  return {
    ...bounds,
    x: bounds.x + delta.x,
    y: bounds.y + delta.y,
    left: bounds.left + delta.x,
    top: bounds.top + delta.y,
    right: bounds.right + delta.x,
    bottom: bounds.bottom + delta.y,
  };
}

function isGroupHitZone(worldX, worldY, bounds) {
  const edgeReach = 18;
  const headerHeight = 34;
  const inside = (
    worldX >= bounds.left
    && worldX <= bounds.right
    && worldY >= bounds.top
    && worldY <= bounds.bottom
  );

  if (!inside) {
    return false;
  }

  const inHeader = worldY <= bounds.top + headerHeight;
  const nearEdge = (
    worldX <= bounds.left + edgeReach
    || worldX >= bounds.right - edgeReach
    || worldY <= bounds.top + edgeReach
    || worldY >= bounds.bottom - edgeReach
  );

  return inHeader || nearEdge;
}

function rectsIntersect(leftRect, rightRect) {
  return !(
    leftRect.right < rightRect.left
    || leftRect.left > rightRect.right
    || leftRect.bottom < rightRect.top
    || leftRect.top > rightRect.bottom
  );
}

function getVisibleWorldRect(viewport, width, height, overscan = 220) {
  const zoom = Math.max(0.1, viewport?.zoom ?? 1);
  const x = viewport?.x ?? 0;
  const y = viewport?.y ?? 0;

  return {
    left: (-x - overscan) / zoom,
    top: (-y - overscan) / zoom,
    right: (width - x + overscan) / zoom,
    bottom: (height - y + overscan) / zoom,
  };
}

function isLikelyRemoteImage(url, tile) {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }

  if (url.startsWith("/")) {
    return IMAGE_EXTENSIONS.test(url);
  }

  if (url.startsWith("data:image/")) {
    return true;
  }

  if (url.startsWith("blob:")) {
    return true;
  }

  if (url.startsWith("file:")) {
    return IMAGE_EXTENSIONS.test(url);
  }

  if (/^https?:\/\//i.test(url)) {
    if (tile?.contentKind === LINK_CONTENT_KIND_IMAGE) {
      return true;
    }

    return IMAGE_EXTENSIONS.test(url)
      || url.includes("image")
      || /[?&](format|fm|ext|type)=image/i.test(url);
  }

  return false;
}

function getFallbackTileColor(tile) {
  switch (tile?.type) {
    case "rack":
      return "#b58559";
    case "folder":
      return "#9a8d66";
    case "amazon-product":
      return "#7c95af";
    case "note-folder":
      return "#8090b4";
    default:
      return "#8c96a7";
  }
}

function getSampledPreviewColor(image) {
  if (!image?.naturalWidth || !image?.naturalHeight) {
    return null;
  }

  try {
    const sampleCanvas = document.createElement("canvas");
    const sampleSize = 12;
    sampleCanvas.width = sampleSize;
    sampleCanvas.height = sampleSize;
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });

    if (!sampleContext) {
      return null;
    }

    sampleContext.drawImage(image, 0, 0, sampleSize, sampleSize);
    const imageData = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;

    let weightedRed = 0;
    let weightedGreen = 0;
    let weightedBlue = 0;
    let alphaWeight = 0;

    for (let index = 0; index < imageData.length; index += 4) {
      const alpha = imageData[index + 3] / 255;
      if (alpha < 0.04) {
        continue;
      }

      weightedRed += imageData[index] * alpha;
      weightedGreen += imageData[index + 1] * alpha;
      weightedBlue += imageData[index + 2] * alpha;
      alphaWeight += alpha;
    }

    if (alphaWeight <= 0) {
      return null;
    }

    const red = Math.round(Math.max(0, Math.min(255, weightedRed / alphaWeight)));
    const green = Math.round(Math.max(0, Math.min(255, weightedGreen / alphaWeight)));
    const blue = Math.round(Math.max(0, Math.min(255, weightedBlue / alphaWeight)));
    return `rgb(${red} ${green} ${blue})`;
  } catch {
    return null;
  }
}

function getSceneImageCacheKey(folderPath, tile, previewTier, devicePixelRatio) {
  const relativePath = tile?.asset?.relativePath ?? "";
  const directImage = typeof tile?.image === "string" ? tile.image : "";
  return [
    folderPath || "",
    tile?.id || "",
    relativePath,
    directImage,
    previewTier || PREVIEW_TIER.ORIGINAL,
    devicePixelRatio || 1,
  ].join("|");
}

function traceRoundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, Math.min(width, height) / 2));

  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, safeRadius);
    return;
  }

  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
}

function drawImageCover(ctx, image, x, y, width, height) {
  const sourceWidth = Math.max(1, image?.naturalWidth ?? image?.width ?? 1);
  const sourceHeight = Math.max(1, image?.naturalHeight ?? image?.height ?? 1);
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = width / Math.max(1, height);

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    cropX = (sourceWidth - cropWidth) * 0.5;
  } else if (sourceAspect < targetAspect) {
    cropHeight = sourceWidth / targetAspect;
    cropY = (sourceHeight - cropHeight) * 0.5;
  }

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    x,
    y,
    width,
    height,
  );
}

function drawImageContain(ctx, image, x, y, width, height) {
  const targetRect = getContainedImageRect(image, x, y, width, height);

  ctx.drawImage(
    image,
    0,
    0,
    Math.max(1, image?.naturalWidth ?? image?.width ?? 1),
    Math.max(1, image?.naturalHeight ?? image?.height ?? 1),
    targetRect.x,
    targetRect.y,
    targetRect.width,
    targetRect.height,
  );
}

function getContainedImageRect(image, x, y, width, height) {
  const sourceWidth = Math.max(1, image?.naturalWidth ?? image?.width ?? 1);
  const sourceHeight = Math.max(1, image?.naturalHeight ?? image?.height ?? 1);
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return {
    x: x + ((width - (sourceWidth * scale)) * 0.5),
    y: y + ((height - (sourceHeight * scale)) * 0.5),
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

function shouldPreserveTileImageAspect(tile) {
  if (tile?.type !== "link") {
    return false;
  }

  if (tile?.sourceType === "sticker" || tile?.previewKind === "music") {
    return false;
  }

  return true;
}

function getNodeAnchor(bounds, side = "") {
  switch (side) {
    case "top":
      return { x: bounds.left + (bounds.width / 2), y: bounds.top };
    case "bottom":
      return { x: bounds.left + (bounds.width / 2), y: bounds.bottom };
    case "left":
      return { x: bounds.left, y: bounds.top + (bounds.height / 2) };
    case "right":
      return { x: bounds.right, y: bounds.top + (bounds.height / 2) };
    default:
      return { x: bounds.left + (bounds.width / 2), y: bounds.top + (bounds.height / 2) };
  }
}

function getPrimaryTileLabel(tile) {
  if (tile?.type === "canvas-text") {
    return deriveCanvasTextTitle(tile);
  }

  if (typeof tile?.title === "string" && tile.title.trim()) {
    return tile.title.trim();
  }

  if (typeof tile?.siteName === "string" && tile.siteName.trim()) {
    return tile.siteName.trim();
  }

  if (typeof tile?.file?.fileName === "string" && tile.file.fileName.trim()) {
    return tile.file.fileName.trim();
  }

  if (typeof tile?.url === "string" && tile.url.trim()) {
    return tile.url.trim();
  }

  if (typeof tile?.text === "string" && tile.text.trim()) {
    return tile.text.trim();
  }

  if (typeof tile?.body === "string" && tile.body.trim()) {
    return tile.body.trim();
  }

  if (typeof tile?.description === "string" && tile.description.trim()) {
    return tile.description.trim();
  }

  return tile?.type ?? "tile";
}

function getSecondaryTileLabel(tile) {
  if (tile?.type === "canvas-text") {
    const summary = deriveCanvasTextSummary(tile?.text, 4);
    return tile?.source === CANVAS_TEXT_SOURCE_FILE && !summary
      ? (tile?.file?.relativePath || "")
      : summary;
  }

  if (typeof tile?.description === "string" && tile.description.trim()) {
    return tile.description.trim();
  }

  if (typeof tile?.body === "string" && tile.body.trim()) {
    return tile.body.trim();
  }

  if (typeof tile?.text === "string" && tile.text.trim()) {
    return tile.text.trim();
  }

  if (typeof tile?.code === "string" && tile.code.trim()) {
    return tile.code.trim();
  }

  return "";
}

function shouldDrawSceneText(tile) {
  const type = String(tile?.type || "").toLowerCase();

  if (type === "link" || type === "amazon-product") {
    return false;
  }

  return true;
}

function drawClampedText(ctx, text, x, y, width, lineHeight, maxLines) {
  const normalized = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!normalized || maxLines <= 0 || width <= 8) {
    return 0;
  }

  const words = normalized.split(" ");
  const lines = [];
  let current = words.shift() ?? "";

  words.forEach((word) => {
    const candidate = `${current} ${word}`.trim();

    if (ctx.measureText(candidate).width <= width) {
      current = candidate;
      return;
    }

    lines.push(current);
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  const visibleLines = lines.slice(0, maxLines);
  visibleLines.forEach((line, index) => {
    let renderedLine = line;
    const isLastVisibleLine = index === visibleLines.length - 1;
    const wasTruncated = lines.length > maxLines && isLastVisibleLine;

    if (wasTruncated) {
      while (renderedLine.length > 1 && ctx.measureText(`${renderedLine}…`).width > width) {
        renderedLine = renderedLine.slice(0, -1);
      }
      renderedLine = `${renderedLine}…`;
    }

    ctx.fillText(renderedLine, x, y + (index * lineHeight));
  });

  return visibleLines.length;
}

async function resolveSceneTileImageSource({
  folderPath,
  tile,
  previewTier,
  devicePixelRatio,
}) {
  const directImage = typeof tile?.image === "string" ? tile.image : "";
  const relativePath = tile?.asset?.relativePath ?? "";

  if (tile?.sourceType === "sticker" && directImage) {
    return directImage;
  }

  if (previewTier === PREVIEW_TIER.THUMBNAIL) {
    return "";
  }

  if (
    tile?.contentKind === LINK_CONTENT_KIND_IMAGE
    && folderPath
    && relativePath
  ) {
    const resolved = await desktop.workspace.resolveAssetUrl(folderPath, relativePath, {
      previewTier,
      devicePixelRatio,
    }).catch(() => "");

    if (typeof resolved === "string" && resolved.trim()) {
      return resolved;
    }

    if (previewTier !== PREVIEW_TIER.ORIGINAL) {
      const originalResolved = await desktop.workspace.resolveAssetUrl(folderPath, relativePath, {
        previewTier: PREVIEW_TIER.ORIGINAL,
        devicePixelRatio,
      }).catch(() => "");

      if (typeof originalResolved === "string" && originalResolved.trim()) {
        return originalResolved;
      }
    }
  }

  if (isLikelyRemoteImage(directImage, tile)) {
    return directImage;
  }

  return "";
}

function SceneWorkspaceSurface({
  folderPath,
  tiles,
  edges = [],
  groups = [],
  selectedGroupIds = [],
  hoveredGroupId = null,
  dragVisualDelta = null,
  dragVisualTileIdSet = null,
  draggingGroupIdSet = null,
  tileMetaById,
  tileRenderHintsById,
  isCanvasMoving,
  cameraSnapshot,
  getViewportSnapshot,
  onTilePressStart,
  onTileDragStart,
  onTileContextMenu,
  onTileHoverChange,
  onGroupPressStart,
  onGroupDragStart,
  onGroupContextMenu,
  onGroupHoverChange,
  onBackgroundPointerDown,
  onBackgroundContextMenu,
}) {
  const canvasRef = useRef(null);
  const drawRafRef = useRef(0);
  const renderStateRef = useRef({
    drawnTiles: [],
    hoveredTileId: null,
    drawnGroups: [],
    hoveredGroupId: null,
  });
  const pressStateRef = useRef(null);
  const resolvedSourceByKeyRef = useRef(new Map());
  const sourceByTileIdRef = useRef(new Map());
  const pendingSourceByKeyRef = useRef(new Map());
  const imageCacheRef = useRef(new Map());
  const previewColorBySourceRef = useRef(new Map());
  const previewColorByTileIdRef = useRef(new Map());
  const pendingDitherKeysRef = useRef(new Set());
  const needsRedrawRef = useRef(true);
  const requestDrawRef = useRef(() => {});
  const isCanvasMovingRef = useRef(isCanvasMoving);
  const drawSceneRef = useRef(() => {});

  const tileList = useMemo(() => (
    tiles.map((tile) => {
      const tileMeta = tileMetaById[tile.id] ?? null;
      const renderHint = tileRenderHintsById[tile.id] ?? null;
      const baseBounds = getTileWorldBounds(tile, tileMeta);
      const bounds = getBoundsWithOffset(
        baseBounds,
        dragVisualDelta,
        dragVisualTileIdSet?.has?.(tile.id) === true,
      );
      return {
        tile,
        tileMeta,
        renderHint,
        bounds,
      };
    })
  ), [dragVisualDelta, dragVisualTileIdSet, tileMetaById, tileRenderHintsById, tiles]);
  const groupList = useMemo(() => (
    groups.map((group) => ({
      group,
      bounds: getBoundsWithOffset(
        getGroupWorldBounds(group),
        dragVisualDelta,
        draggingGroupIdSet?.has?.(group.id) === true,
      ),
    }))
  ), [dragVisualDelta, draggingGroupIdSet, groups]);

  const queueTileImageSource = useCallback((tileEntry, dprBucket) => {
    const tile = tileEntry.tile;
    const renderHint = tileEntry.renderHint;
    const needsSource = renderHint?.imageEnabled !== false || renderHint?.usePreviewColorBlock === true;

    if (!renderHint || !needsSource) {
      return;
    }

    const key = getSceneImageCacheKey(
      folderPath,
      tile,
      renderHint.previewTier,
      dprBucket,
    );

    if (resolvedSourceByKeyRef.current.has(key)) {
      const cachedSource = resolvedSourceByKeyRef.current.get(key) || "";
      sourceByTileIdRef.current.set(tile.id, cachedSource);
      if (cachedSource) {
        const cachedColor = previewColorBySourceRef.current.get(cachedSource) || null;
        if (cachedColor) {
          previewColorByTileIdRef.current.set(tile.id, cachedColor);
        }
      }
      return;
    }

    if (pendingSourceByKeyRef.current.has(key)) {
      return;
    }

    const pending = resolveSceneTileImageSource({
      folderPath,
      tile,
      previewTier: renderHint.previewTier,
      devicePixelRatio: dprBucket,
    })
      .then((source) => {
        const safeSource = typeof source === "string" ? source : "";
        resolvedSourceByKeyRef.current.set(key, safeSource);
        sourceByTileIdRef.current.set(tile.id, safeSource);
        if (safeSource) {
          const cachedColor = previewColorBySourceRef.current.get(safeSource) || null;
          if (cachedColor) {
            previewColorByTileIdRef.current.set(tile.id, cachedColor);
          }
        } else {
          previewColorByTileIdRef.current.delete(tile.id);
        }
        pendingSourceByKeyRef.current.delete(key);
        requestDrawRef.current();
      })
      .catch(() => {
        pendingSourceByKeyRef.current.delete(key);
      });

    pendingSourceByKeyRef.current.set(key, pending);
  }, [folderPath]);

  const getImageEntry = useCallback((source) => {
    if (!source) {
      return null;
    }

    const existing = imageCacheRef.current.get(source);
    if (existing) {
      return existing;
    }

    const image = new window.Image();
    const nextEntry = {
      image,
      status: "loading",
    };

    imageCacheRef.current.set(source, nextEntry);

    image.onload = () => {
      nextEntry.status = "loaded";
      if (!previewColorBySourceRef.current.has(source)) {
        const sampledColor = getSampledPreviewColor(image);
        if (sampledColor) {
          previewColorBySourceRef.current.set(source, sampledColor);
        }
      }
      requestDrawRef.current();
    };

    image.onerror = () => {
      nextEntry.status = "error";
    };

    image.decoding = "async";
    if (/^https?:\/\//i.test(source)) {
      image.crossOrigin = "anonymous";
    }
    image.src = source;
    return nextEntry;
  }, []);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      needsRedrawRef.current = true;
    }

    if (!needsRedrawRef.current && !isCanvasMovingRef.current) {
      return;
    }

    needsRedrawRef.current = false;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) {
      return;
    }

    const viewport = getViewportSnapshot();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    const visibleWorldRect = getVisibleWorldRect(
      viewport,
      canvasWidth,
      canvasHeight,
      isCanvasMovingRef.current ? 320 : 180,
    );
    const dprBucket = Math.max(1, Math.min(2, Number(dpr.toFixed(2))));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    const drawnTiles = [];
    const nodeBoundsById = new Map();

    tileList.forEach((tileEntry) => {
      nodeBoundsById.set(tileEntry.tile.id, tileEntry.bounds);
    });
    groupList.forEach((groupEntry) => {
      nodeBoundsById.set(groupEntry.group.id, groupEntry.bounds);
    });

    groupList.forEach((groupEntry) => {
      if (!rectsIntersect(visibleWorldRect, groupEntry.bounds)) {
        return;
      }

      const { bounds, group } = groupEntry;
      const label = typeof group?.label === "string" ? group.label.trim() : "";
      const isSelected = selectedGroupIds.includes(group.id);
      const isHovered = hoveredGroupId === group.id;
      const isDragging = draggingGroupIdSet?.has?.(group.id) === true;

      ctx.save();
      ctx.fillStyle = isSelected
        ? "rgba(162, 128, 87, 0.14)"
        : isHovered
          ? "rgba(162, 128, 87, 0.11)"
          : "rgba(162, 128, 87, 0.08)";
      ctx.strokeStyle = isDragging
        ? "rgba(91, 68, 44, 0.78)"
        : isSelected
          ? "rgba(91, 68, 44, 0.62)"
          : isCanvasMovingRef.current
            ? "rgba(133, 101, 66, 0.34)"
            : "rgba(133, 101, 66, 0.48)";
      ctx.lineWidth = (isSelected ? 2 : 1.25) / Math.max(0.35, viewport.zoom);
      ctx.setLineDash(isCanvasMovingRef.current ? [10 / viewport.zoom, 8 / viewport.zoom] : [14 / viewport.zoom, 10 / viewport.zoom]);
      ctx.beginPath();
      traceRoundedRectPath(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      if (label) {
        ctx.fillStyle = "rgba(90, 65, 38, 0.88)";
        ctx.font = '16px "Segoe UI", sans-serif';
        ctx.textBaseline = "top";
        drawClampedText(ctx, label, bounds.x + 16, bounds.y + 12, Math.max(40, bounds.width - 32), 18, 1);
      }

      ctx.restore();
    });

    edges.forEach((edge) => {
      const fromBounds = nodeBoundsById.get(edge?.fromNode);
      const toBounds = nodeBoundsById.get(edge?.toNode);

      if (!fromBounds || !toBounds) {
        return;
      }

      const fromPoint = getNodeAnchor(fromBounds, edge?.fromSide);
      const toPoint = getNodeAnchor(toBounds, edge?.toSide);
      const minX = Math.min(fromPoint.x, toPoint.x);
      const minY = Math.min(fromPoint.y, toPoint.y);
      const maxX = Math.max(fromPoint.x, toPoint.x);
      const maxY = Math.max(fromPoint.y, toPoint.y);

      if (!rectsIntersect(visibleWorldRect, {
        left: minX - 40,
        top: minY - 40,
        right: maxX + 40,
        bottom: maxY + 40,
      })) {
        return;
      }

      const horizontalDelta = toPoint.x - fromPoint.x;
      const controlOffset = Math.max(32, Math.min(160, Math.abs(horizontalDelta) * 0.35));

      ctx.save();
      ctx.strokeStyle = edge?.color || (isCanvasMovingRef.current ? "rgba(126, 112, 94, 0.42)" : "rgba(103, 92, 78, 0.58)");
      ctx.lineWidth = (isCanvasMovingRef.current ? 1.5 : 2) / Math.max(0.35, viewport.zoom);
      ctx.beginPath();
      ctx.moveTo(fromPoint.x, fromPoint.y);
      ctx.bezierCurveTo(
        fromPoint.x + controlOffset,
        fromPoint.y,
        toPoint.x - controlOffset,
        toPoint.y,
        toPoint.x,
        toPoint.y,
      );
      ctx.stroke();

      if (!isCanvasMovingRef.current && typeof edge?.label === "string" && edge.label.trim()) {
        const midX = (fromPoint.x + toPoint.x) * 0.5;
        const midY = (fromPoint.y + toPoint.y) * 0.5;
        ctx.fillStyle = "rgba(255, 250, 242, 0.92)";
        ctx.strokeStyle = "rgba(126, 112, 94, 0.24)";
        ctx.lineWidth = 1 / Math.max(0.35, viewport.zoom);
        ctx.beginPath();
        traceRoundedRectPath(ctx, midX - 52, midY - 14, 104, 28, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(73, 61, 49, 0.92)";
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(edge.label.trim(), midX, midY);
        ctx.textAlign = "start";
      }

      ctx.restore();
    });

    tileList.forEach((tileEntry) => {
      const bounds = tileEntry.bounds;

      if (!rectsIntersect(visibleWorldRect, bounds)) {
        return;
      }

      drawnTiles.push({
        tile: tileEntry.tile,
        bounds,
        zIndex: bounds.zIndex,
      });

      const renderHint = tileEntry.renderHint;
      const tile = tileEntry.tile;
      const source = sourceByTileIdRef.current.get(tile.id) || "";
      const usePreviewColorBlock = renderHint?.usePreviewColorBlock === true;
      const shouldResolveSource = renderHint?.imageEnabled !== false || usePreviewColorBlock;

      if (shouldResolveSource && !source) {
        queueTileImageSource(tileEntry, dprBucket);
      }

      const imageEntry = source ? getImageEntry(source) : null;
      if (imageEntry?.status === "loaded" && source && !previewColorByTileIdRef.current.has(tile.id)) {
        const sampledColor = previewColorBySourceRef.current.get(source) || null;
        if (sampledColor) {
          previewColorByTileIdRef.current.set(tile.id, sampledColor);
        }
      }

      let ditheredPreview = null;
      if (usePreviewColorBlock && source) {
        ditheredPreview = getCachedDitheredPreview(source, LOD1_DITHER_SIZE);

        if (!ditheredPreview && imageEntry?.status === "loaded") {
          const ditherCacheKey = getDitheredPreviewCacheKey(source, LOD1_DITHER_SIZE);
          const pendingDither = ensureDitheredPreview({
            imageSrc: source,
            image: imageEntry.image,
            size: LOD1_DITHER_SIZE,
            posterizeLevels: LOD1_DITHER_LEVELS,
          });

          if (
            pendingDither
            && ditherCacheKey
            && !pendingDitherKeysRef.current.has(ditherCacheKey)
          ) {
            pendingDitherKeysRef.current.add(ditherCacheKey);
            void pendingDither.finally(() => {
              pendingDitherKeysRef.current.delete(ditherCacheKey);
              requestDrawRef.current();
            });
          }
        }
      }

      ctx.save();
      const preserveTileAspect = shouldPreserveTileImageAspect(tile);
      const canDrawNaturalImage = preserveTileAspect && !usePreviewColorBlock && imageEntry?.status === "loaded";
      const naturalImageRect = canDrawNaturalImage
        ? getContainedImageRect(imageEntry.image, bounds.x, bounds.y, bounds.width, bounds.height)
        : null;
      const clipRect = naturalImageRect ?? bounds;
      const clipRadius = naturalImageRect ? 0 : 8;

      ctx.beginPath();
      traceRoundedRectPath(ctx, clipRect.x, clipRect.y, clipRect.width, clipRect.height, clipRadius);
      ctx.closePath();
      ctx.clip();

      if (usePreviewColorBlock) {
        const headerHeight = Math.max(8, Math.min(bounds.height * 0.16, 22));
        const previewHeight = Math.max(0, bounds.height - headerHeight);
        const sampledColor = previewColorByTileIdRef.current.get(tile.id)
          || (source ? previewColorBySourceRef.current.get(source) : null)
          || getFallbackTileColor(tile);

        ctx.fillStyle = "rgba(246, 241, 233, 0.98)";
        ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.fillStyle = "rgba(255, 250, 242, 0.96)";
        ctx.fillRect(bounds.x, bounds.y, bounds.width, headerHeight);

        if (ditheredPreview && previewHeight > 0) {
          const previousSmoothingValue = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          if (shouldPreserveTileImageAspect(tile)) {
            drawImageContain(
              ctx,
              ditheredPreview,
              bounds.x,
              bounds.y + headerHeight,
              bounds.width,
              previewHeight,
            );
          } else {
            drawImageCover(
              ctx,
              ditheredPreview,
              bounds.x,
              bounds.y + headerHeight,
              bounds.width,
              previewHeight,
            );
          }
          ctx.imageSmoothingEnabled = previousSmoothingValue;
        } else {
          ctx.fillStyle = sampledColor;
          ctx.fillRect(bounds.x, bounds.y + headerHeight, bounds.width, previewHeight);
        }
      } else {
        const shouldDrawImage = Boolean(source)
          && renderHint?.imageEnabled !== false
          && renderHint?.previewTier !== PREVIEW_TIER.THUMBNAIL;

        if (!preserveTileAspect || !shouldDrawImage || imageEntry?.status !== "loaded") {
          ctx.fillStyle = "rgba(246, 241, 233, 0.98)";
          ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }

        if (shouldDrawImage && imageEntry?.status === "loaded") {
          if (preserveTileAspect) {
            drawImageContain(ctx, imageEntry.image, bounds.x, bounds.y, bounds.width, bounds.height);
          } else {
            drawImageCover(ctx, imageEntry.image, bounds.x, bounds.y, bounds.width, bounds.height);
          }
        }
      }

      if (!naturalImageRect) {
        ctx.strokeStyle = "rgba(126, 112, 94, 0.24)";
        ctx.lineWidth = 1 / Math.max(0.35, viewport.zoom);
        ctx.stroke();
      }

      if (dragVisualTileIdSet?.has?.(tile.id) === true) {
        ctx.strokeStyle = "rgba(91, 68, 44, 0.42)";
        ctx.lineWidth = 1.5 / Math.max(0.35, viewport.zoom);
        ctx.beginPath();
        traceRoundedRectPath(
          ctx,
          naturalImageRect?.x ?? bounds.x,
          naturalImageRect?.y ?? bounds.y,
          naturalImageRect?.width ?? bounds.width,
          naturalImageRect?.height ?? bounds.height,
          naturalImageRect ? 0 : 8,
        );
        ctx.closePath();
        ctx.stroke();
      }

      if (shouldDrawSceneText(tile)) {
        const titleText = getPrimaryTileLabel(tile);
        const secondaryText = getSecondaryTileLabel(tile);
        const headerHeight = usePreviewColorBlock
          ? Math.max(8, Math.min(bounds.height * 0.16, 22))
          : 0;
        const textInsetX = bounds.x + 14;
        const textWidth = Math.max(24, bounds.width - 28);
        const textTop = bounds.y + headerHeight + 18;
        const titleFontSize = 14;
        const bodyFontSize = 12;

        ctx.fillStyle = "rgba(56, 49, 41, 0.92)";
        ctx.font = `600 ${titleFontSize}px "Segoe UI", sans-serif`;
        ctx.textBaseline = "top";
        const titleLines = drawClampedText(
          ctx,
          titleText,
          textInsetX,
          textTop,
          textWidth,
          titleFontSize + 4,
          usePreviewColorBlock ? 1 : Math.min(2, Math.max(1, Math.floor(bounds.height / 96))),
        );

        if (!isCanvasMovingRef.current && secondaryText) {
          ctx.fillStyle = "rgba(93, 83, 70, 0.86)";
          ctx.font = `${bodyFontSize}px "Segoe UI", sans-serif`;
          drawClampedText(
            ctx,
            secondaryText,
            textInsetX,
            textTop + (titleLines * (titleFontSize + 4)) + 6,
            textWidth,
            bodyFontSize + 4,
            Math.max(1, Math.min(4, Math.floor(bounds.height / 92))),
          );
        }
      }

      ctx.restore();
    });

    ctx.restore();
    renderStateRef.current.drawnTiles = drawnTiles.sort((left, right) => left.zIndex - right.zIndex);
    renderStateRef.current.drawnGroups = groupList.map((entry) => ({
      group: entry.group,
      bounds: entry.bounds,
    }));
  }, [
    dragVisualTileIdSet,
    draggingGroupIdSet,
    edges,
    getImageEntry,
    getViewportSnapshot,
    groupList,
    hoveredGroupId,
    queueTileImageSource,
    selectedGroupIds,
    tileList,
  ]);

  const runDrawLoop = useCallback(() => {
    drawRafRef.current = 0;
    drawSceneRef.current?.();

    if (isCanvasMovingRef.current || needsRedrawRef.current) {
      drawRafRef.current = window.requestAnimationFrame(runDrawLoop);
    }
  }, []);

  const requestDraw = useCallback(() => {
    needsRedrawRef.current = true;

    if (!drawRafRef.current) {
      drawRafRef.current = window.requestAnimationFrame(runDrawLoop);
    }
  }, [runDrawLoop]);

  useEffect(() => {
    requestDrawRef.current = requestDraw;
  }, [requestDraw]);

  useEffect(() => {
    drawSceneRef.current = drawScene;
  }, [drawScene]);

  useEffect(() => {
    needsRedrawRef.current = true;
    requestDraw();
  }, [requestDraw, tileList]);

  useEffect(() => {
    isCanvasMovingRef.current = isCanvasMoving;

    if (isCanvasMoving) {
      requestDraw();
    }
  }, [isCanvasMoving, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [cameraSnapshot?.x, cameraSnapshot?.y, cameraSnapshot?.zoom, requestDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const handleResize = () => {
      requestDraw();
    };

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(handleResize);
      observer.observe(canvas);
    }

    window.addEventListener("resize", handleResize);
    return () => {
      observer?.disconnect?.();
      window.removeEventListener("resize", handleResize);
    };
  }, [requestDraw]);

  useEffect(() => () => {
    if (drawRafRef.current) {
      window.cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = 0;
    }
  }, []);

  const hitTestTile = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const viewport = getViewportSnapshot();
    const worldX = (clientX - rect.left - viewport.x) / Math.max(0.1, viewport.zoom);
    const worldY = (clientY - rect.top - viewport.y) / Math.max(0.1, viewport.zoom);
    const drawnTiles = renderStateRef.current.drawnTiles;

    for (let index = drawnTiles.length - 1; index >= 0; index -= 1) {
      const entry = drawnTiles[index];
      if (
        worldX >= entry.bounds.left
        && worldX <= entry.bounds.right
        && worldY >= entry.bounds.top
        && worldY <= entry.bounds.bottom
      ) {
        return entry.tile;
      }
    }

    return null;
  }, [getViewportSnapshot]);

  const hitTestGroup = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const viewport = getViewportSnapshot();
    const worldX = (clientX - rect.left - viewport.x) / Math.max(0.1, viewport.zoom);
    const worldY = (clientY - rect.top - viewport.y) / Math.max(0.1, viewport.zoom);
    const drawnGroups = renderStateRef.current.drawnGroups;

    for (let index = drawnGroups.length - 1; index >= 0; index -= 1) {
      const entry = drawnGroups[index];
      if (isGroupHitZone(worldX, worldY, entry.bounds)) {
        return entry.group;
      }
    }

    return null;
  }, [getViewportSnapshot]);

  const updateHoveredTile = useCallback((nextTile) => {
    const previousTileId = renderStateRef.current.hoveredTileId ?? null;
    const nextTileId = nextTile?.id ?? null;

    if (previousTileId === nextTileId) {
      return;
    }

    if (previousTileId) {
      onTileHoverChange?.(previousTileId, false);
    }

    if (nextTileId) {
      onTileHoverChange?.(nextTileId, true);
    }

    renderStateRef.current.hoveredTileId = nextTileId;
  }, [onTileHoverChange]);

  const updateHoveredGroup = useCallback((nextGroup) => {
    const previousGroupId = renderStateRef.current.hoveredGroupId ?? null;
    const nextGroupId = nextGroup?.id ?? null;

    if (previousGroupId === nextGroupId) {
      return;
    }

    if (previousGroupId) {
      onGroupHoverChange?.(previousGroupId, false);
    }

    if (nextGroupId) {
      onGroupHoverChange?.(nextGroupId, true);
    }

    renderStateRef.current.hoveredGroupId = nextGroupId;
  }, [onGroupHoverChange]);

  const handlePointerDown = useCallback((event) => {
    const hitTile = hitTestTile(event.clientX, event.clientY);
    const hitGroup = hitTile ? null : hitTestGroup(event.clientX, event.clientY);
    updateHoveredTile(hitTile);
    updateHoveredGroup(hitGroup);

    if (hitTile) {
      const suppressDrag = onTilePressStart?.(hitTile, event) === true;

      pressStateRef.current = {
        pointerId: event.pointerId,
        tile: hitTile,
        startX: event.clientX,
        startY: event.clientY,
        hasTriggeredDrag: false,
        suppressDrag,
      };

      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    if (hitGroup) {
      const suppressDrag = onGroupPressStart?.(hitGroup, event) === true;

      pressStateRef.current = {
        pointerId: event.pointerId,
        group: hitGroup,
        startX: event.clientX,
        startY: event.clientY,
        hasTriggeredDrag: false,
        suppressDrag,
      };

      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    pressStateRef.current = null;
    onBackgroundPointerDown?.(event);
  }, [hitTestGroup, hitTestTile, onBackgroundPointerDown, onGroupPressStart, onTilePressStart, updateHoveredGroup, updateHoveredTile]);

  const handlePointerMove = useCallback((event) => {
    const hitTile = hitTestTile(event.clientX, event.clientY);
    const hitGroup = hitTile ? null : hitTestGroup(event.clientX, event.clientY);
    updateHoveredTile(hitTile);
    updateHoveredGroup(hitGroup);

    const pressState = pressStateRef.current;

    if (!pressState || pressState.pointerId !== event.pointerId || pressState.hasTriggeredDrag || pressState.suppressDrag) {
      return;
    }

    const deltaX = event.clientX - pressState.startX;
    const deltaY = event.clientY - pressState.startY;

    if (Math.hypot(deltaX, deltaY) < DRAG_START_THRESHOLD) {
      return;
    }

    pressState.hasTriggeredDrag = true;
    if (pressState.tile) {
      onTileDragStart?.(pressState.tile, event);
      return;
    }

    onGroupDragStart?.(pressState.group, event);
  }, [hitTestGroup, hitTestTile, onGroupDragStart, onTileDragStart, updateHoveredGroup, updateHoveredTile]);

  const clearPressedTile = useCallback((event) => {
    const pressState = pressStateRef.current;
    if (!pressState) {
      return;
    }

    if (event && pressState.pointerId !== event.pointerId) {
      return;
    }

    pressStateRef.current = null;
    event?.currentTarget?.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleContextMenu = useCallback((event) => {
    const hitTile = hitTestTile(event.clientX, event.clientY);
    const hitGroup = hitTile ? null : hitTestGroup(event.clientX, event.clientY);
    updateHoveredTile(hitTile);
    updateHoveredGroup(hitGroup);

    if (hitTile) {
      onTileContextMenu?.(hitTile, event);
      return;
    }

    if (hitGroup) {
      onGroupContextMenu?.(hitGroup, event);
      return;
    }

    onBackgroundContextMenu?.(event);
  }, [hitTestGroup, hitTestTile, onBackgroundContextMenu, onGroupContextMenu, onTileContextMenu, updateHoveredGroup, updateHoveredTile]);

  const handlePointerLeave = useCallback(() => {
    updateHoveredTile(null);
    updateHoveredGroup(null);
  }, [updateHoveredGroup, updateHoveredTile]);

  return (
    <canvas
      ref={canvasRef}
      className="canvas__scene-surface"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearPressedTile}
      onPointerCancel={clearPressedTile}
      onPointerLeave={handlePointerLeave}
      onContextMenu={handleContextMenu}
    />
  );
}

export default memo(SceneWorkspaceSurface);
