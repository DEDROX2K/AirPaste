import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAttachTileToRack } from "../../lib/workspace";
import {
  recordHitTestSample,
  readPointerMoveStats,
  recordInteractionCommit,
  recordPointerMoveSample,
} from "../../lib/perf";
import {
  findRackDropTarget,
  getBoxStyleVars,
  getRenderableTileEntries,
  getRenderableTileEntryById,
  getTileByIdMap,
  getSelectedTileIdsInRect,
  MARQUEE_DRAG_THRESHOLD,
  normalizeRect,
} from "../layout/tileLayout";
import { resolveSnappedDragDelta } from "../snapping/canvasSnapping";

const VIEWPORT_PADDING = 16;
const SNAP_DEBUG_LOG_ENABLED = Boolean(import.meta.env?.DEV);

function isSelectionModifierPressed(event) {
  return event.ctrlKey || event.metaKey;
}

function isCanvasBackgroundTarget(event) {
  return event.target === event.currentTarget
    || event.target.classList?.contains("canvas__content");
}

export function useCanvasInteractionSystem({
  cards,
  canvas,
  commands,
  resetKey,
  snapSettings,
  suppressHoverUpdates = false,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedTileIds, setSelectedTileIds] = useState([]);
  const [hoveredTileId, setHoveredTileId] = useState(null);
  const [focusedTileId, setFocusedTileId] = useState(null);
  const [draggingTileIds, setDraggingTileIds] = useState([]);
  const [dragVisualDelta, setDragVisualDelta] = useState(null);
  const [marqueeBox, setMarqueeBox] = useState(null);
  const [rackDropPreview, setRackDropPreview] = useState(null);

  const dragStateRef = useRef(null);
  const marqueeStateRef = useRef(null);
  const cardsRef = useRef(cards);
  const tileByIdRef = useRef(getTileByIdMap(cards));
  const rackDropPreviewRef = useRef(rackDropPreview);
  const snapSettingsRef = useRef(snapSettings);
  const pointerMoveMetricsRef = useRef({
    count: 0,
    totalMs: 0,
  });
  const suppressCanvasContextMenuRef = useRef(false);

  const selectedTileIdSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);

  useEffect(() => {
    cardsRef.current = cards;
    tileByIdRef.current = getTileByIdMap(cards);
  }, [cards]);

  useEffect(() => {
    rackDropPreviewRef.current = rackDropPreview;
  }, [rackDropPreview]);

  useEffect(() => {
    snapSettingsRef.current = snapSettings;
  }, [snapSettings]);

  useEffect(() => {
    if (!suppressHoverUpdates) {
      return;
    }

    setHoveredTileId(null);
    setFocusedTileId((currentId) => (draggingTileIds.length > 0 ? currentId : null));
  }, [draggingTileIds.length, suppressHoverUpdates]);

  const clearRackDropPreview = useCallback(() => {
    setRackDropPreview(null);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const resetTransientState = useCallback(() => {
    closeContextMenu();
    clearRackDropPreview();
    setSelectedTileIds([]);
    setHoveredTileId(null);
    setFocusedTileId(null);
    setDraggingTileIds([]);
    setDragVisualDelta(null);
    setMarqueeBox(null);
    dragStateRef.current = null;
    marqueeStateRef.current = null;
  }, [
    clearRackDropPreview,
    closeContextMenu,
  ]);

  useEffect(() => {
    resetTransientState();
  }, [resetKey, resetTransientState]);

  useEffect(() => {
    setSelectedTileIds((currentIds) => currentIds.filter((tileId) => cards.some((tile) => tile.id === tileId)));
    setHoveredTileId((currentId) => (cards.some((tile) => tile.id === currentId) ? currentId : null));
    setFocusedTileId((currentId) => (cards.some((tile) => tile.id === currentId) ? currentId : null));

    if (contextMenu?.kind === "tile" && contextMenu.card && !cards.some((tile) => tile.id === contextMenu.card.id)) {
      setContextMenu(null);
    }
  }, [cards, contextMenu]);

  useEffect(() => {
    const renderableTileIds = new Set(
      getRenderableTileEntries(cards, tileByIdRef.current).map((entry) => entry.tile.id),
    );

    setSelectedTileIds((currentIds) => currentIds.filter((tileId) => renderableTileIds.has(tileId)));
    setHoveredTileId((currentId) => (renderableTileIds.has(currentId) ? currentId : null));
    setFocusedTileId((currentId) => (renderableTileIds.has(currentId) ? currentId : null));
  }, [cards]);

  useEffect(() => {
    if (!rackDropPreview) {
      return;
    }

    const targetStillExists = cards.some((tile) => tile.id === rackDropPreview.rackId);

    if (!targetStillExists) {
      clearRackDropPreview();
    }
  }, [cards, clearRackDropPreview, rackDropPreview]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    if (contextMenu.kind === "canvas" || contextMenu.kind === "tile") {
      function closeOnWindowChange() {
        setContextMenu(null);
      }

      window.addEventListener("resize", closeOnWindowChange);
      window.addEventListener("wheel", closeOnWindowChange, { passive: true });

      return () => {
        window.removeEventListener("resize", closeOnWindowChange);
        window.removeEventListener("wheel", closeOnWindowChange);
      };
    }

    function closeOnPointerDown(event) {
      if (event.target instanceof Element && event.target.closest("[data-context-menu-root='true']")) {
        return;
      }

      setContextMenu(null);
    }

    function closeOnWindowChange() {
      setContextMenu(null);
    }

    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("resize", closeOnWindowChange);
    window.addEventListener("wheel", closeOnWindowChange, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("resize", closeOnWindowChange);
      window.removeEventListener("wheel", closeOnWindowChange);
    };
  }, [contextMenu]);

  const selectTile = useCallback((tileId, options = {}) => {
    const shouldToggle = Boolean(options.toggle);

    setSelectedTileIds((currentIds) => {
      if (shouldToggle) {
        return currentIds.includes(tileId)
          ? currentIds.filter((currentId) => currentId !== tileId)
          : [...currentIds, tileId];
      }

      if (currentIds.length === 1 && currentIds[0] === tileId) {
        return currentIds;
      }

      if (currentIds.includes(tileId) && !options.forceSingle) {
        return currentIds;
      }

      return [tileId];
    });
  }, []);

  const replaceSelection = useCallback((tileIds) => {
    const normalizedTileIds = Array.isArray(tileIds)
      ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
      : [];

    setSelectedTileIds(normalizedTileIds);
    setHoveredTileId(null);
    setFocusedTileId(normalizedTileIds.length === 1 ? normalizedTileIds[0] : null);
  }, []);

  const handleTilePressStart = useCallback((tile, event) => {
    closeContextMenu();

    if (isSelectionModifierPressed(event)) {
      selectTile(tile.id, { toggle: true });
      return true;
    }

    selectTile(tile.id, { forceSingle: !selectedTileIdSet.has(tile.id) });
    return false;
  }, [closeContextMenu, selectTile, selectedTileIdSet]);

  const handleTileContextMenu = useCallback((tile, event) => {
    event.preventDefault();
    event.stopPropagation();

    const selectionIds = selectedTileIdSet.has(tile.id)
      ? selectedTileIds
      : [tile.id];

    selectTile(tile.id);

    const worldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);

    setContextMenu({
      kind: "tile",
      id: `${Date.now()}-${tile.id}-${Math.round(event.clientX)}-${Math.round(event.clientY)}`,
      card: tile,
      selectionIds,
      x: Math.max(VIEWPORT_PADDING, event.clientX),
      y: Math.max(VIEWPORT_PADDING, event.clientY),
      worldPoint,
    });
  }, [canvas, selectedTileIdSet, selectedTileIds, selectTile]);

  const handleTileHoverChange = useCallback((tileId, isHovered) => {
    if (suppressHoverUpdates) {
      return;
    }

    setHoveredTileId((currentId) => {
      if (isHovered) {
        return tileId;
      }

      return currentId === tileId ? null : currentId;
    });
  }, [suppressHoverUpdates]);

  const handleTileFocusIn = useCallback((tileId) => {
    if (suppressHoverUpdates) {
      return;
    }

    setFocusedTileId(tileId);
  }, [suppressHoverUpdates]);

  const handleTileFocusOut = useCallback((tileId) => {
    if (suppressHoverUpdates) {
      return;
    }

    setFocusedTileId((currentId) => (currentId === tileId ? null : currentId));
  }, [suppressHoverUpdates]);

  const beginCanvasMarqueeSelection = useCallback((event) => {
    const startCanvasPoint = canvas.clientToCanvasPoint(event.clientX, event.clientY);

    marqueeStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      startedWithSecondaryButton: event.button === 2,
    };

    setMarqueeBox({
      x: startCanvasPoint.x,
      y: startCanvasPoint.y,
      width: 0,
      height: 0,
    });

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [canvas]);

  const beginTileDrag = useCallback((tile, event) => {
    closeContextMenu();
    clearRackDropPreview();

    const isPrimaryPointer = event.button === 0 || event.buttons === 1;

    if (!isPrimaryPointer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const anchorEntry = getRenderableTileEntryById(
      cardsRef.current,
      tile.id,
      tileByIdRef.current,
    );

    if (!anchorEntry) {
      return;
    }

    const candidateTileIds = anchorEntry.containerType === "rack"
      ? [tile.id]
      : selectedTileIdSet.has(tile.id)
        ? selectedTileIds
        : [tile.id];
    const dragEntries = candidateTileIds
      .map((tileId) => getRenderableTileEntryById(
        cardsRef.current,
        tileId,
        tileByIdRef.current,
      ))
      .filter((entry) => (
        entry
        && entry.containerType === anchorEntry.containerType
        && entry.folderId === anchorEntry.folderId
        && entry.rackId === anchorEntry.rackId
      ));

    let dragTileIds = dragEntries.length > 0 ? dragEntries.map((entry) => entry.tile.id) : [tile.id];
    let dragOrigins = Object.fromEntries(
      dragEntries.map((entry) => [
        entry.tile.id,
        {
          containerType: entry.containerType,
          folderId: entry.folderId,
          rackId: entry.rackId,
          x: entry.x,
          y: entry.y,
          localX: entry.localX,
          localY: entry.localY,
          width: entry.width,
          height: entry.height,
        },
      ]),
    );

    if (anchorEntry.containerType === "rack" && anchorEntry.rackId) {
      const detachedTile = commands.removeTileFromRack(anchorEntry.tile.id, anchorEntry.rackId, {
        x: anchorEntry.x,
        y: anchorEntry.y,
      });

      if (!detachedTile) {
        return;
      }

      dragTileIds = [anchorEntry.tile.id];
      dragOrigins = {
        [anchorEntry.tile.id]: {
          containerType: "canvas",
          folderId: null,
          rackId: null,
          x: anchorEntry.x,
          y: anchorEntry.y,
          localX: anchorEntry.x,
          localY: anchorEntry.y,
          width: anchorEntry.width,
          height: anchorEntry.height,
        },
      };
      setSelectedTileIds([anchorEntry.tile.id]);
    } else if (!selectedTileIdSet.has(tile.id)) {
      setSelectedTileIds([tile.id]);
    }

    commands.bringTilesToFront(dragTileIds);

    const dragTargetRootTiles = getRenderableTileEntries(
      cardsRef.current,
      tileByIdRef.current,
    )
      .filter((entry) => entry.containerType === "canvas")
      .map((entry) => entry.tile);
    const dragTileIdSet = new Set(dragTileIds);

    dragStateRef.current = {
      tileId: tile.id,
      tileIds: dragTileIds,
      tileIdSet: dragTileIdSet,
      startedFromRack: anchorEntry.containerType === "rack",
      pointerWorldStart: canvas.clientToWorldPoint(event.clientX, event.clientY),
      lastDelta: { x: 0, y: 0 },
      origins: dragOrigins,
      hasMoved: false,
      targetCache: {
        rootTiles: dragTargetRootTiles,
        draggedTile: tileByIdRef.current[tile.id] ?? tile,
      },
    };
    setDraggingTileIds(dragTileIds);
    setDragVisualDelta({ x: 0, y: 0 });
  }, [
    canvas,
    clearRackDropPreview,
    closeContextMenu,
    commands,
    selectedTileIdSet,
    selectedTileIds,
  ]);

  useEffect(() => {
    function updateMarquee(event) {
      const marqueeState = marqueeStateRef.current;

      if (!marqueeState || marqueeState.pointerId !== event.pointerId) {
        return;
      }

      marqueeState.currentClientX = event.clientX;
      marqueeState.currentClientY = event.clientY;

      const startCanvasPoint = canvas.clientToCanvasPoint(
        marqueeState.startClientX,
        marqueeState.startClientY,
      );
      const currentCanvasPoint = canvas.clientToCanvasPoint(event.clientX, event.clientY);
      const canvasRect = normalizeRect(
        startCanvasPoint.x,
        startCanvasPoint.y,
        currentCanvasPoint.x,
        currentCanvasPoint.y,
      );

      setMarqueeBox({
        x: canvasRect.left,
        y: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
      });
    }

    function finishMarquee(event) {
      const marqueeState = marqueeStateRef.current;

      if (!marqueeState || (event && marqueeState.pointerId !== event.pointerId)) {
        return;
      }

      const dragDistanceX = Math.abs(marqueeState.currentClientX - marqueeState.startClientX);
      const dragDistanceY = Math.abs(marqueeState.currentClientY - marqueeState.startClientY);

      if (
        marqueeState.startedWithSecondaryButton
        && (dragDistanceX >= MARQUEE_DRAG_THRESHOLD || dragDistanceY >= MARQUEE_DRAG_THRESHOLD)
      ) {
        suppressCanvasContextMenuRef.current = true;
      }

      marqueeStateRef.current = null;
      setMarqueeBox(null);

      if (dragDistanceX < MARQUEE_DRAG_THRESHOLD && dragDistanceY < MARQUEE_DRAG_THRESHOLD) {
        return;
      }

      const startWorldPoint = canvas.clientToWorldPoint(
        marqueeState.startClientX,
        marqueeState.startClientY,
      );
      const endWorldPoint = canvas.clientToWorldPoint(
        marqueeState.currentClientX,
        marqueeState.currentClientY,
      );
      const selectionWorldRect = normalizeRect(
        startWorldPoint.x,
        startWorldPoint.y,
        endWorldPoint.x,
        endWorldPoint.y,
      );

      setSelectedTileIds(getSelectedTileIdsInRect(
        cardsRef.current,
        selectionWorldRect,
        tileByIdRef.current,
      ));
    }

    function cancelMarquee() {
      if (!marqueeStateRef.current) {
        return;
      }

      marqueeStateRef.current = null;
      setMarqueeBox(null);
    }

    window.addEventListener("pointermove", updateMarquee, true);
    window.addEventListener("pointerup", finishMarquee, true);
    window.addEventListener("pointercancel", finishMarquee, true);
    window.addEventListener("blur", cancelMarquee);

    return () => {
      window.removeEventListener("pointermove", updateMarquee, true);
      window.removeEventListener("pointerup", finishMarquee, true);
      window.removeEventListener("pointercancel", finishMarquee, true);
      window.removeEventListener("blur", cancelMarquee);
    };
  }, [canvas]);

  useEffect(() => {
    function finishDrag(event = null) {
      const dragState = dragStateRef.current;

      if (!dragState) {
        clearRackDropPreview();
        return;
      }

      const commitStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const activeRackPreview = rackDropPreviewRef.current;
      const dragDelta = dragState.lastDelta ?? { x: 0, y: 0 };
      let nextSelectedIds = dragState.tileIds;
      let wasHandled = false;

      if (event && activeRackPreview?.rackId) {
        const rackTile = commands.addTilesToRack(dragState.tileIds, activeRackPreview.rackId);

        if (rackTile) {
          nextSelectedIds = dragState.tileIds;
          wasHandled = true;
        }
      }

      if (!wasHandled && event && (dragDelta.x !== 0 || dragDelta.y !== 0)) {
        commands.moveTiles(dragState.tileIds, dragState.origins, dragDelta);
        wasHandled = true;
      }

      if (!wasHandled && dragState.startedFromRack) {
        commands.commitCurrentWorkspace();
        wasHandled = true;
      }

      if (!wasHandled) {
        commands.cancelPendingWorkspaceChange();
      }

      const commitEnd = typeof performance !== "undefined" ? performance.now() : Date.now();

      recordInteractionCommit("drag", commitEnd - commitStart, {
        movedTileCount: dragState.tileIds.length,
        deltaX: dragDelta.x,
        deltaY: dragDelta.y,
      });

      const pointerStats = readPointerMoveStats();

      if (pointerMoveMetricsRef.current.count > 0) {
        console.debug("[perf] drag pointermove handler", {
          count: pointerMoveMetricsRef.current.count,
          avgMs: pointerMoveMetricsRef.current.totalMs / pointerMoveMetricsRef.current.count,
          globalAvgMs: pointerStats?.avgMs ?? null,
          globalMaxMs: pointerStats?.maxMs ?? null,
        });
        pointerMoveMetricsRef.current = { count: 0, totalMs: 0 };
      }

      if (dragState.tileIds.length > 0) {
        setDragVisualDelta(null);
      }

      dragStateRef.current = null;
      setDraggingTileIds([]);
      clearRackDropPreview();
      setSelectedTileIds(nextSelectedIds);
    }

    function handlePointerMove(event) {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      const moveStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const currentWorldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);
      const rawWorldDelta = {
        x: currentWorldPoint.x - dragState.pointerWorldStart.x,
        y: currentWorldPoint.y - dragState.pointerWorldStart.y,
      };
      const snapResolution = resolveSnappedDragDelta({
        dragOrigins: dragState.origins,
        anchorTileId: dragState.tileId,
        rawDelta: rawWorldDelta,
        snapSettings: snapSettingsRef.current,
      });
      const worldDelta = snapResolution.appliedDelta;

      if (SNAP_DEBUG_LOG_ENABLED) {
        console.debug("[canvas-snap]", {
          snapEnabled: snapResolution.snapEnabled,
          gridSize: snapResolution.gridSize,
          rawDelta: rawWorldDelta,
          origin: snapResolution.origin,
          candidate: snapResolution.candidate,
          snapped: snapResolution.snapped,
          appliedDelta: snapResolution.appliedDelta,
        });
      }

      dragState.hasMoved = true;
      dragState.lastDelta = worldDelta;
      setDragVisualDelta((currentDelta) => {
        if (currentDelta?.x === worldDelta.x && currentDelta?.y === worldDelta.y) {
          return currentDelta;
        }

        return worldDelta;
      });

      const canDropOnRack = dragState.tileIds.every((tileId) => {
        const origin = dragState.origins[tileId];
        const draggedTile = tileByIdRef.current[tileId] ?? null;

        return origin?.containerType === "canvas" && canAttachTileToRack(draggedTile);
      });

      if (canDropOnRack) {
        const rackHitTestMetrics = {};
        const rackHitTestStart = typeof performance !== "undefined" ? performance.now() : Date.now();
        const nextRackDropPreview = findRackDropTarget({
          tiles: cardsRef.current,
          dragTileIds: dragState.tileIds,
          dragTileIdSet: dragState.tileIdSet,
          dragOrigins: dragState.origins,
          dragDelta: worldDelta,
          clientToWorldPoint: canvas.clientToWorldPoint,
          pointerClientX: event.clientX,
          pointerClientY: event.clientY,
          rootTiles: dragState.targetCache.rootTiles,
          metrics: rackHitTestMetrics,
        });
        const rackHitTestEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
        recordHitTestSample("rack-drop", rackHitTestEnd - rackHitTestStart, rackHitTestMetrics);
        setRackDropPreview(nextRackDropPreview);
      } else {
        clearRackDropPreview();
      }

      if (dragState.tileIds.length !== 1 || rackDropPreviewRef.current?.rackId) {
        const moveEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
        const durationMs = moveEnd - moveStart;
        pointerMoveMetricsRef.current.count += 1;
        pointerMoveMetricsRef.current.totalMs += durationMs;
        recordPointerMoveSample(durationMs);
        return;
      }

      const moveEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      const durationMs = moveEnd - moveStart;
      pointerMoveMetricsRef.current.count += 1;
      pointerMoveMetricsRef.current.totalMs += durationMs;
      recordPointerMoveSample(durationMs);
    }

    function handlePointerUp(event) {
      finishDrag(event);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        finishDrag();
      }
    }

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerUp, true);
    window.addEventListener("blur", handlePointerUp);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);
      window.removeEventListener("blur", handlePointerUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canvas, clearRackDropPreview, commands]);

  const handleCanvasPointerDown = useCallback((event) => {
    if (event.button === 1) {
      closeContextMenu();
      setHoveredTileId(null);
      setFocusedTileId(null);
      suppressCanvasContextMenuRef.current = false;
      event.preventDefault();
      canvas.beginCanvasPan(event);
      return;
    }

    const isCanvasBackground = isCanvasBackgroundTarget(event);

    if (!isCanvasBackground) {
      return;
    }

    closeContextMenu();
    setHoveredTileId(null);
    setFocusedTileId(null);
    suppressCanvasContextMenuRef.current = false;

    const shouldBeginMarquee = isSelectionModifierPressed(event);

    if (shouldBeginMarquee) {
      event.preventDefault();
      event.stopPropagation();
      beginCanvasMarqueeSelection(event);
      return;
    }

    if (event.button === 2) {
      return;
    }

    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    setSelectedTileIds([]);
    canvas.beginCanvasPan(event);
  }, [beginCanvasMarqueeSelection, canvas, closeContextMenu]);

  const handleCanvasContextMenu = useCallback((event) => {
    if (!isCanvasBackgroundTarget(event)) {
      return;
    }

    event.preventDefault();

    if (suppressCanvasContextMenuRef.current) {
      suppressCanvasContextMenuRef.current = false;
      return;
    }

    const worldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);

    setContextMenu({
      kind: "canvas",
      id: `${Date.now()}-${Math.round(event.clientX)}-${Math.round(event.clientY)}`,
      x: event.clientX,
      y: event.clientY,
      worldPoint,
      selectionIds: [...selectedTileIds],
    });
  }, [canvas, selectedTileIds]);

  const marqueeStyleVars = useMemo(() => getBoxStyleVars(marqueeBox), [marqueeBox]);

  return useMemo(() => ({
    contextMenu,
    selectedTileIds,
    selectedTileIdSet,
    hoveredTileId,
    focusedTileId,
    draggingTileIds,
    dragVisualDelta,
    rackDropPreview,
    marqueeBox,
    marqueeStyleVars,
    beginTileDrag,
    closeContextMenu,
    handleCanvasContextMenu,
    handleCanvasPointerDown,
    handleTileContextMenu,
    handleTileFocusIn,
    handleTileFocusOut,
    handleTileHoverChange,
    handleTilePressStart,
    replaceSelection,
    resetTransientState,
    selectTile,
  }), [
    beginTileDrag,
    closeContextMenu,
    contextMenu,
    dragVisualDelta,
    draggingTileIds,
    focusedTileId,
    rackDropPreview,
    handleCanvasContextMenu,
    handleCanvasPointerDown,
    handleTileContextMenu,
    handleTileFocusIn,
    handleTileFocusOut,
    handleTileHoverChange,
    handleTilePressStart,
    hoveredTileId,
    marqueeBox,
    marqueeStyleVars,
    replaceSelection,
    resetTransientState,
    selectTile,
    selectedTileIdSet,
    selectedTileIds,
  ]);
}
