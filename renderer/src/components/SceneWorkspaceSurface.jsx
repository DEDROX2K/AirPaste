import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { desktop } from "../lib/desktop";
import { LINK_CONTENT_KIND_IMAGE } from "../lib/workspace";
import { PREVIEW_TIER } from "../systems/canvas/tileLod";

const DRAG_START_THRESHOLD = 8;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;

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

function drawBackground(ctx, canvasWidth, canvasHeight, viewport) {
  ctx.save();
  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  gradient.addColorStop(0, "#f7f4ee");
  gradient.addColorStop(1, "#efebe3");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();

  const zoom = Math.max(0.1, viewport?.zoom ?? 1);
  const baseSpacing = 96;
  const gridSpacing = baseSpacing * zoom;

  if (gridSpacing < 12) {
    return;
  }

  const offsetX = ((viewport?.x ?? 0) % gridSpacing + gridSpacing) % gridSpacing;
  const offsetY = ((viewport?.y ?? 0) % gridSpacing + gridSpacing) % gridSpacing;

  ctx.save();
  ctx.strokeStyle = "rgba(94, 82, 68, 0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = offsetX; x < canvasWidth; x += gridSpacing) {
    ctx.moveTo(Math.floor(x) + 0.5, 0);
    ctx.lineTo(Math.floor(x) + 0.5, canvasHeight);
  }

  for (let y = offsetY; y < canvasHeight; y += gridSpacing) {
    ctx.moveTo(0, Math.floor(y) + 0.5);
    ctx.lineTo(canvasWidth, Math.floor(y) + 0.5);
  }

  ctx.stroke();
  ctx.restore();
}

function getFallbackTileColor(tile) {
  switch (tile?.type) {
    case "rack":
      return "#8f5827";
    case "folder":
      return "#8a7d52";
    case "amazon-product":
      return "#3f6a97";
    case "note-folder":
      return "#4e5f84";
    default:
      return "#4a5567";
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

    if (!renderHint || renderHint.imageEnabled === false) {
      return;
    }

    const key = getSceneImageCacheKey(
      folderPath,
      tile,
      renderHint.previewTier,
      dprBucket,
    );

    if (resolvedSourceByKeyRef.current.has(key)) {
      sourceByTileIdRef.current.set(tile.id, resolvedSourceByKeyRef.current.get(key) || "");
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
      requestDrawRef.current();
    };

    image.onerror = () => {
      nextEntry.status = "error";
    };

    image.decoding = "async";
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

    if (!needsRedrawRef.current && !isCanvasMoving) {
      return;
    }

    needsRedrawRef.current = false;

    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) {
      return;
    }

    const viewport = getViewportSnapshot();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    const visibleWorldRect = getVisibleWorldRect(viewport, canvasWidth, canvasHeight, isCanvasMoving ? 320 : 180);
    const dprBucket = Math.max(1, Math.min(2, Number(dpr.toFixed(2))));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(ctx, canvasWidth, canvasHeight, viewport);

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

      if (renderHint?.imageEnabled !== false && !source) {
        queueTileImageSource(tileEntry, dprBucket);
      }

      ctx.save();
      ctx.beginPath();
      traceRoundedRectPath(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 8);
      ctx.closePath();
      ctx.fillStyle = getFallbackTileColor(tile);
      ctx.fill();

      const shouldDrawImage = Boolean(source)
        && renderHint?.imageEnabled !== false
        && renderHint?.previewTier !== PREVIEW_TIER.THUMBNAIL;

      if (shouldDrawImage) {
        const imageEntry = getImageEntry(source);
        if (imageEntry?.status === "loaded") {
          ctx.clip();
          ctx.drawImage(
            imageEntry.image,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
          );
        }
      }

      if (!renderHint?.simplify) {
        ctx.strokeStyle = "rgba(228, 234, 242, 0.18)";
        ctx.lineWidth = 1 / Math.max(0.35, viewport.zoom);
        ctx.stroke();
      }

      ctx.restore();
    });

    ctx.restore();
    renderStateRef.current.drawnTiles = drawnTiles.sort((left, right) => left.zIndex - right.zIndex);
  }, [getImageEntry, getViewportSnapshot, isCanvasMoving, queueTileImageSource, tileList]);

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
