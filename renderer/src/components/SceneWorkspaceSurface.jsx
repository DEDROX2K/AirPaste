import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { desktop } from "../lib/desktop";
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

function isLikelyRemoteImage(url) {
  if (typeof url !== "string" || !url.trim()) {
    return false;
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
    return IMAGE_EXTENSIONS.test(url) || url.includes("image");
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

async function resolveSceneTileImageSource({
  folderPath,
  tile,
  previewTier,
  devicePixelRatio,
}) {
  const directImage = typeof tile?.image === "string" ? tile.image : "";
  const relativePath = tile?.asset?.relativePath ?? "";

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
  }

  if (isLikelyRemoteImage(directImage)) {
    return directImage;
  }

  return "";
}

function SceneWorkspaceSurface({
  folderPath,
  tiles,
  tileMetaById,
  tileRenderHintsById,
  isCanvasMoving,
  cameraSnapshot,
  getViewportSnapshot,
  onTilePressStart,
  onTileDragStart,
  onTileContextMenu,
  onTileHoverChange,
  onBackgroundPointerDown,
  onBackgroundContextMenu,
}) {
  const canvasRef = useRef(null);
  const drawRafRef = useRef(0);
  const renderStateRef = useRef({
    drawnTiles: [],
    hoveredTileId: null,
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
      const bounds = getTileWorldBounds(tile, tileMeta);
      return {
        tile,
        tileMeta,
        renderHint,
        bounds,
      };
    })
  ), [tileMetaById, tileRenderHintsById, tiles]);

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
      ctx.beginPath();
      traceRoundedRectPath(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 8);
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
          drawImageCover(
            ctx,
            ditheredPreview,
            bounds.x,
            bounds.y + headerHeight,
            bounds.width,
            previewHeight,
          );
          ctx.imageSmoothingEnabled = previousSmoothingValue;
        } else {
          ctx.fillStyle = sampledColor;
          ctx.fillRect(bounds.x, bounds.y + headerHeight, bounds.width, previewHeight);
        }
      } else {
        ctx.fillStyle = "rgba(246, 241, 233, 0.98)";
        ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

        const shouldDrawImage = Boolean(source)
          && renderHint?.imageEnabled !== false
          && renderHint?.previewTier !== PREVIEW_TIER.THUMBNAIL;

        if (shouldDrawImage && imageEntry?.status === "loaded") {
          drawImageCover(ctx, imageEntry.image, bounds.x, bounds.y, bounds.width, bounds.height);
        }
      }

      ctx.strokeStyle = "rgba(126, 112, 94, 0.24)";
      ctx.lineWidth = 1 / Math.max(0.35, viewport.zoom);
      ctx.stroke();

      ctx.restore();
    });

    ctx.restore();
    renderStateRef.current.drawnTiles = drawnTiles.sort((left, right) => left.zIndex - right.zIndex);
  }, [getImageEntry, getViewportSnapshot, queueTileImageSource, tileList]);

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

  const handlePointerDown = useCallback((event) => {
    const hitTile = hitTestTile(event.clientX, event.clientY);
    updateHoveredTile(hitTile);

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

    pressStateRef.current = null;
    onBackgroundPointerDown?.(event);
  }, [hitTestTile, onBackgroundPointerDown, onTilePressStart, updateHoveredTile]);

  const handlePointerMove = useCallback((event) => {
    const hitTile = hitTestTile(event.clientX, event.clientY);
    updateHoveredTile(hitTile);

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
    onTileDragStart?.(pressState.tile, event);
  }, [hitTestTile, onTileDragStart, updateHoveredTile]);

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
    updateHoveredTile(hitTile);

    if (hitTile) {
      onTileContextMenu?.(hitTile, event);
      return;
    }

    onBackgroundContextMenu?.(event);
  }, [hitTestTile, onBackgroundContextMenu, onTileContextMenu, updateHoveredTile]);

  const handlePointerLeave = useCallback(() => {
    updateHoveredTile(null);
  }, [updateHoveredTile]);

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
