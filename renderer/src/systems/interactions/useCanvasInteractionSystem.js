import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStableCallback } from "../../hooks/useStableCallback";
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
  isSameRackDropPreview,
  MARQUEE_DRAG_THRESHOLD,
  normalizeRect,
} from "../layout/tileLayout";
import { resolveSnappedDragDelta } from "../snapping/canvasSnapping";
import { createDragMotionStore } from "./dragMotion";
import {
  easeSnapOffset,
  getSnapRectsBounds,
  resolveTileMagnetSnap,
  toSnapRect,
} from "../snapping/tileMagnetSnapping";

const VIEWPORT_PADDING = 16;
const SNAP_DEBUG_LOG_ENABLED = Boolean(import.meta.env?.DEV);
// Gap between a rack's top edge and a tile pulled out of it with a click.
const RACK_PULL_OUT_GAP = 24;

function isSelectionModifierPressed(event) {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

function isMagnetSettled(dragState) {
  return dragState.snapShown.x === dragState.snapTarget.x && dragState.snapShown.y === dragState.snapTarget.y;
}

function isCanvasBackgroundTarget(event) {
  return event.target === event.currentTarget
    || event.target.classList?.contains("canvas__content")
    || event.target.classList?.contains("canvas__grid");
}

// These pruning effects run on every card write; handing back the same array
// when nothing was removed saves a full canvas re-render each time.
function keepIfUnchanged(currentIds, filteredIds) {
  return filteredIds.length === currentIds.length ? currentIds : filteredIds;
}

export function useCanvasInteractionSystem({
  cards,
  groups = [],
  canvas,
  commands,
  interactionMode = "select",
  resetKey,
  snapSettings,
  suppressHoverUpdates = false,
  // Split screen: lets a tile drag be dropped into the other pane.
  // { hitTest(clientX, clientY) -> target|null, preview(target|null),
  //   drop(target, { tileIds, origins, pointerWorldStart, clientX, clientY }) -> bool }
  externalDrop = null,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedTileIds, setSelectedTileIds] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [hoveredTileId, setHoveredTileId] = useState(null);
  const [hoveredGroupId, setHoveredGroupId] = useState(null);
  const [focusedTileId, setFocusedTileId] = useState(null);
  const [draggingTileIds, setDraggingTileIds] = useState([]);
  // The live drag offset: a store, not state, so a drag frame re-renders
  // nothing (see dragMotion.js).
  const [dragMotion] = useState(createDragMotionStore);
  // Where the tile was grabbed (world point), for the grab-corner tilt.
  const [dragGrabPoint, setDragGrabPoint] = useState(null);
  const [marqueeBox, setMarqueeBox] = useState(null);
  const [rackDropPreview, setRackDropPreview] = useState(null);

  const dragStateRef = useRef(null);
  const marqueeStateRef = useRef(null);
  // Set when a plain (no-modifier) press lands on a tile that's already
  // part of a multi-selection: the full selection stays intact at
  // pointerdown (so a drag, if one follows, moves the whole group), but if
  // the pointer goes back up without ever starting a drag -- a plain click
  // -- this is what the click collapses the selection down to, matching
  // Figma. Cleared the moment any real drag begins.
  const pendingSingleSelectRef = useRef(null);
  const cardsRef = useRef(cards);
  const tileByIdRef = useRef(getTileByIdMap(cards));
  const rackDropPreviewRef = useRef(rackDropPreview);
  const snapSettingsRef = useRef(snapSettings);
  const externalDropRef = useRef(externalDrop);
  externalDropRef.current = externalDrop;
  const pointerMoveMetricsRef = useRef({
    count: 0,
    totalMs: 0,
  });
  const suppressCanvasContextMenuRef = useRef(false);

  const selectedTileIdSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);
  const isSelectMode = interactionMode === "select";
  const isHandMode = interactionMode === "hand";

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

  // Magnet glide: while a drag's shown pull differs from its target, one
  // step per frame (see easeSnapOffset), aged by the frame's own timestamp.
  // It lives outside the drag effect below because that effect re-runs mid
  // drag, and its cleanup would cancel a glide halfway.
  const magnetGlideRef = useRef({ rafId: 0, frameTime: null });

  const showDragDelta = useCallback((dragState) => {
    dragMotion.set(dragState.tileIds, {
      x: dragState.baseDelta.x + dragState.snapShown.x,
      y: dragState.baseDelta.y + dragState.snapShown.y,
    });
  }, [dragMotion]);

  const stopMagnetGlide = useCallback(() => {
    const glide = magnetGlideRef.current;

    if (glide.rafId) {
      cancelAnimationFrame(glide.rafId);
    }
    glide.rafId = 0;
    glide.frameTime = null;
  }, []);

  const stepMagnetGlide = useCallback(function step(frameTime) {
    const glide = magnetGlideRef.current;
    const dragState = dragStateRef.current;
    glide.rafId = 0;

    if (!dragState?.snapShown) {
      glide.frameTime = null;
      return;
    }

    const frameMs = glide.frameTime === null ? 16 : Math.min(64, frameTime - glide.frameTime);
    glide.frameTime = frameTime;
    dragState.snapShown = easeSnapOffset(dragState.snapShown, dragState.snapTarget, frameMs);
    showDragDelta(dragState);

    if (isMagnetSettled(dragState)) {
      glide.frameTime = null;
    } else {
      glide.rafId = requestAnimationFrame(step);
    }
  }, [showDragDelta]);

  const startMagnetGlide = useCallback(() => {
    const dragState = dragStateRef.current;

    if (dragState?.snapShown && !isMagnetSettled(dragState) && !magnetGlideRef.current.rafId) {
      magnetGlideRef.current.rafId = requestAnimationFrame(stepMagnetGlide);
    }
  }, [stepMagnetGlide]);

  useEffect(() => stopMagnetGlide, [stopMagnetGlide]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const resetTransientState = useCallback(() => {
    closeContextMenu();
    clearRackDropPreview();
    setSelectedTileIds([]);
    setSelectedGroupIds([]);
    setHoveredTileId(null);
    setHoveredGroupId(null);
    setFocusedTileId(null);
    setDraggingTileIds([]);
    dragMotion.clear();
    setDragGrabPoint(null);
    setMarqueeBox(null);
    dragStateRef.current = null;
    marqueeStateRef.current = null;
  }, [
    clearRackDropPreview,
    closeContextMenu,
    dragMotion,
  ]);

  useEffect(() => {
    resetTransientState();
  }, [resetKey, resetTransientState]);

  useEffect(() => {
    setSelectedTileIds((currentIds) => keepIfUnchanged(currentIds, currentIds.filter((tileId) => cards.some((tile) => tile.id === tileId))));
    setSelectedGroupIds((currentIds) => keepIfUnchanged(currentIds, currentIds.filter((groupId) => groups.some((group) => group.id === groupId))));
    setHoveredTileId((currentId) => (cards.some((tile) => tile.id === currentId) ? currentId : null));
    setHoveredGroupId((currentId) => (groups.some((group) => group.id === currentId) ? currentId : null));
    setFocusedTileId((currentId) => (cards.some((tile) => tile.id === currentId) ? currentId : null));

    if (contextMenu?.kind === "tile" && contextMenu.card && !cards.some((tile) => tile.id === contextMenu.card.id)) {
      setContextMenu(null);
    }
    if (contextMenu?.kind === "group" && contextMenu.group && !groups.some((group) => group.id === contextMenu.group.id)) {
      setContextMenu(null);
    }
  }, [cards, contextMenu, groups]);

  useEffect(() => {
    // Tiles inside a rack aren't on the canvas, so they can't stay selected.
    const renderableTileIds = new Set(
      getRenderableTileEntries(cards, tileByIdRef.current)
        .filter((entry) => entry.containerType === "canvas")
        .map((entry) => entry.tile.id),
    );

    setSelectedTileIds((currentIds) => keepIfUnchanged(currentIds, currentIds.filter((tileId) => renderableTileIds.has(tileId))));
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
    setSelectedGroupIds([]);
  }, []);

  const selectGroup = useCallback((groupId, options = {}) => {
    const shouldToggle = Boolean(options.toggle);

    setSelectedGroupIds((currentIds) => {
      if (shouldToggle) {
        return currentIds.includes(groupId)
          ? currentIds.filter((currentId) => currentId !== groupId)
          : [...currentIds, groupId];
      }

      if (currentIds.length === 1 && currentIds[0] === groupId) {
        return currentIds;
      }

      if (currentIds.includes(groupId) && !options.forceSingle) {
        return currentIds;
      }

      return [groupId];
    });
    setSelectedTileIds([]);
    setFocusedTileId(null);
  }, []);

  const replaceSelection = useCallback((tileIds) => {
    const normalizedTileIds = Array.isArray(tileIds)
      ? [...new Set(tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0))]
      : [];

    setSelectedTileIds(normalizedTileIds);
    setSelectedGroupIds([]);
    setHoveredTileId(null);
    setHoveredGroupId(null);
    setFocusedTileId(normalizedTileIds.length === 1 ? normalizedTileIds[0] : null);
  }, []);

  const nudgeSelection = useCallback((delta) => {
    if (!delta || (delta.x === 0 && delta.y === 0)) {
      return false;
    }

    if (selectedGroupIds.length > 0) {
      commands.moveGroups(selectedGroupIds, delta);
      return true;
    }

    if (selectedTileIds.length === 0) {
      return false;
    }

    const origins = {};

    selectedTileIds.forEach((tileId) => {
      const entry = getRenderableTileEntryById(cardsRef.current, tileId, tileByIdRef.current);

      if (entry && entry.containerType === "canvas") {
        origins[tileId] = {
          containerType: entry.containerType,
          x: entry.x,
          y: entry.y,
        };
      }
    });

    const movableTileIds = Object.keys(origins);

    if (movableTileIds.length === 0) {
      return false;
    }

    commands.moveTiles(movableTileIds, origins, delta);
    return true;
  }, [commands, selectedGroupIds, selectedTileIds]);

  // Tile handlers below are stable (useStableCallback) because every tile
  // receives them; a fresh identity per render re-renders the whole board.
  const handleTilePressStart = useStableCallback((tile, event) => {
    closeContextMenu();

    if (isHandMode) {
      canvas.beginCanvasPan(event);
      return true;
    }

    if (isSelectionModifierPressed(event)) {
      pendingSingleSelectRef.current = null;
      selectTile(tile.id, { toggle: true });
      return true;
    }

    pendingSingleSelectRef.current = (selectedTileIds.length > 1 && selectedTileIdSet.has(tile.id))
      ? tile.id
      : null;
    selectTile(tile.id, { forceSingle: !selectedTileIdSet.has(tile.id) });
    return false;
  });

  const handleGroupPressStart = useCallback((group, event) => {
    closeContextMenu();

    if (isHandMode) {
      canvas.beginCanvasPan(event);
      return true;
    }

    if (isSelectionModifierPressed(event)) {
      selectGroup(group.id, { toggle: true });
      return true;
    }

    selectGroup(group.id, { forceSingle: true });
    return false;
  }, [canvas, closeContextMenu, isHandMode, selectGroup]);

  const handleTileContextMenu = useStableCallback((tile, event) => {
    event.preventDefault();
    event.stopPropagation();

    // A stacked tile is never selected (it's inert until ungrouped); its
    // menu only offers Ungroup.
    const isStacked = Boolean(tile.stack?.id);
    const selectionIds = !isStacked && selectedTileIdSet.has(tile.id)
      ? selectedTileIds
      : [tile.id];

    if (isStacked) {
      setSelectedTileIds((currentIds) => (currentIds.length === 0 ? currentIds : []));
    } else {
      selectTile(tile.id);
    }

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
  });

  const handleGroupContextMenu = useCallback((group, event) => {
    event.preventDefault();
    event.stopPropagation();

    const selectionIds = selectedGroupIds.includes(group.id)
      ? selectedGroupIds
      : [group.id];

    selectGroup(group.id, { forceSingle: true });

    const worldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);

    setContextMenu({
      kind: "group",
      id: `${Date.now()}-${group.id}-${Math.round(event.clientX)}-${Math.round(event.clientY)}`,
      group,
      selectionIds,
      x: Math.max(VIEWPORT_PADDING, event.clientX),
      y: Math.max(VIEWPORT_PADDING, event.clientY),
      worldPoint,
    });
  }, [canvas, selectGroup, selectedGroupIds]);

  // Stable identities (useStableCallback), though they read
  // suppressHoverUpdates: every tile gets these, and as plain callbacks
  // keyed on it they changed whenever a pan or drag started or stopped,
  // re-rendering every tile on the canvas twice per gesture.
  const handleTileHoverChange = useStableCallback((tileId, isHovered) => {
    if (suppressHoverUpdates) {
      return;
    }

    setHoveredTileId((currentId) => {
      if (isHovered) {
        return tileId;
      }

      return currentId === tileId ? null : currentId;
    });
  });

  const handleGroupHoverChange = useCallback((groupId, isHovered) => {
    if (suppressHoverUpdates) {
      return;
    }

    setHoveredGroupId((currentId) => {
      if (isHovered) {
        return groupId;
      }

      return currentId === groupId ? null : currentId;
    });
  }, [suppressHoverUpdates]);

  const handleTileFocusIn = useStableCallback((tileId) => {
    if (suppressHoverUpdates) {
      return;
    }

    setFocusedTileId(tileId);
  });

  const handleTileFocusOut = useStableCallback((tileId) => {
    if (suppressHoverUpdates) {
      return;
    }

    setFocusedTileId((currentId) => (currentId === tileId ? null : currentId));
  });

  const beginCanvasMarqueeSelection = useCallback((event, options = {}) => {
    const startCanvasPoint = canvas.clientToCanvasPoint(event.clientX, event.clientY);
    const additive = Boolean(options.additive);

    marqueeStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      startedWithSecondaryButton: event.button === 2,
      additive,
      baseSelectedTileIds: additive ? [...selectedTileIds] : [],
    };

    setMarqueeBox({
      x: startCanvasPoint.x,
      y: startCanvasPoint.y,
      width: 0,
      height: 0,
    });

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [canvas, selectedTileIds]);

  const beginTileDrag = useStableCallback((tile, event, pressOrigin = null) => {
    if (!isSelectMode) {
      return;
    }

    closeContextMenu();
    clearRackDropPreview();

    const isPrimaryPointer = event.button === 0 || event.buttons === 1;

    if (!isPrimaryPointer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    pendingSingleSelectRef.current = null;

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

    // The z-order change used to happen here, rewriting the whole workspace
    // on the same frame the drag begins (every tile's layout, culling and
    // tether sync reran) -- that was the stutter at the start of a grab. A
    // dragged tile already sits on top through its drag layer, so the
    // reorder is applied when the drag ends instead (see finishDrag).

    const rootTileEntries = getRenderableTileEntries(
      cardsRef.current,
      tileByIdRef.current,
    ).filter((entry) => entry.containerType === "canvas");
    const dragTargetRootTiles = rootTileEntries.map((entry) => entry.tile);
    const dragTileIdSet = new Set(dragTileIds);
    const dragOriginList = Object.values(dragOrigins);
    // Magnetic snapping is for canvas tiles; tiles in a rack move with it.
    const magnet = dragOriginList.length > 0 && dragOriginList.every((origin) => origin.containerType === "canvas")
      ? {
        bounds: getSnapRectsBounds(dragOriginList.map(toSnapRect)),
        neighbours: rootTileEntries
          .filter((entry) => !dragTileIdSet.has(entry.tile.id))
          .map(toSnapRect),
      }
      : null;

    // Anchor to the press point and start with the distance already
    // travelled, so the tile is under the cursor on the very first frame
    // instead of waiting for the next pointer move.
    const pointerWorldStart = canvas.clientToWorldPoint(
      pressOrigin?.clientX ?? event.clientX,
      pressOrigin?.clientY ?? event.clientY,
    );
    const currentWorldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);
    const initialDelta = {
      x: currentWorldPoint.x - pointerWorldStart.x,
      y: currentWorldPoint.y - pointerWorldStart.y,
    };

    dragStateRef.current = {
      tileId: tile.id,
      tileIds: dragTileIds,
      tileIdSet: dragTileIdSet,
      startedFromRack: anchorEntry.containerType === "rack",
      pointerWorldStart,
      lastDelta: initialDelta,
      origins: dragOrigins,
      hasMoved: false,
      magnet,
      // The drag before any magnet pull, the pull's target (snapped minus
      // that) and the pull shown so far, which glides toward the target.
      baseDelta: initialDelta,
      snapTarget: { x: 0, y: 0 },
      snapShown: { x: 0, y: 0 },
      targetCache: {
        rootTiles: dragTargetRootTiles,
        draggedTile: tileByIdRef.current[tile.id] ?? tile,
      },
    };
    setDraggingTileIds(dragTileIds);
    dragMotion.set(dragTileIds, initialDelta);
    setDragGrabPoint(pointerWorldStart);
  });

  // Clicking a tile's card in a rack takes it out, full size, just above the
  // rack (dragging the card pulls it out under the pointer instead).
  const pullTileFromRack = useStableCallback((tile) => {
    const entry = getRenderableTileEntryById(cardsRef.current, tile.id, tileByIdRef.current);
    const rackTile = entry?.rackId ? tileByIdRef.current[entry.rackId] : null;

    if (!isSelectMode || !entry || entry.containerType !== "rack" || !rackTile) {
      return;
    }

    closeContextMenu();
    const detachedTile = commands.removeTileFromRack(tile.id, rackTile.id, {
      x: entry.x,
      y: rackTile.y - entry.height - RACK_PULL_OUT_GAP,
    });

    if (detachedTile) {
      commands.commitCurrentWorkspace();
      setSelectedTileIds([tile.id]);
    }
  });

  const beginGroupDrag = useCallback((group, event) => {
    if (!isSelectMode) {
      return;
    }

    closeContextMenu();
    clearRackDropPreview();

    const isPrimaryPointer = event.button === 0 || event.buttons === 1;
    if (!isPrimaryPointer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    pendingSingleSelectRef.current = null;

    const selectedIds = selectedGroupIds.includes(group.id) ? selectedGroupIds : [group.id];
    const activeGroups = selectedIds
      .map((groupId) => groups.find((entry) => entry.id === groupId) ?? null)
      .filter(Boolean);
    const draggedTileIds = [...new Set(activeGroups.flatMap((entry) => Array.isArray(entry.tileIds) ? entry.tileIds : []))];

    dragStateRef.current = {
      kind: "group",
      groupIds: activeGroups.map((entry) => entry.id),
      tileIds: draggedTileIds,
      pointerWorldStart: canvas.clientToWorldPoint(event.clientX, event.clientY),
      lastDelta: { x: 0, y: 0 },
    };
    setSelectedGroupIds(activeGroups.map((entry) => entry.id));
    setSelectedTileIds([]);
    setDraggingTileIds(draggedTileIds);
    dragMotion.set(draggedTileIds, { x: 0, y: 0 });
  }, [canvas, clearRackDropPreview, closeContextMenu, dragMotion, groups, isSelectMode, selectedGroupIds]);

  useEffect(() => {
    // Same coalescing technique as the tile-drag pointermove handler above:
    // at most one flush per animation frame, so live marquee preview (see
    // applyMarqueeSelection below) never does more work than the display
    // can paint, however fast the pointer reports moves.
    let pendingMoveEvent = null;
    let moveRafId = 0;

    function applyMarqueeSelection(marqueeState) {
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
      // Stacked tiles can't be selected (they're inert until ungrouped).
      const rectTileIds = getSelectedTileIdsInRect(
        cardsRef.current.filter((card) => !card.stack?.id),
        selectionWorldRect,
        tileByIdRef.current,
      );

      setSelectedTileIds(marqueeState.additive
        ? [...new Set([...marqueeState.baseSelectedTileIds, ...rectTileIds])]
        : rectTileIds);
    }

    function processMarqueeMove(event) {
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

      const dragDistanceX = Math.abs(marqueeState.currentClientX - marqueeState.startClientX);
      const dragDistanceY = Math.abs(marqueeState.currentClientY - marqueeState.startClientY);

      // Live preview: highlight what would be selected as the box is
      // dragged, same as Figma/Obsidian, not just after releasing.
      if (dragDistanceX >= MARQUEE_DRAG_THRESHOLD || dragDistanceY >= MARQUEE_DRAG_THRESHOLD) {
        applyMarqueeSelection(marqueeState);
      }
    }

    function updateMarquee(event) {
      if (!marqueeStateRef.current || marqueeStateRef.current.pointerId !== event.pointerId) {
        return;
      }

      pendingMoveEvent = event;

      if (!moveRafId) {
        moveRafId = requestAnimationFrame(() => {
          moveRafId = 0;
          const flushEvent = pendingMoveEvent;
          pendingMoveEvent = null;
          if (flushEvent) {
            processMarqueeMove(flushEvent);
          }
        });
      }
    }

    function finishMarquee(event) {
      const marqueeState = marqueeStateRef.current;

      if (!marqueeState || (event && marqueeState.pointerId !== event.pointerId)) {
        return;
      }

      if (moveRafId) {
        cancelAnimationFrame(moveRafId);
        moveRafId = 0;
      }
      pendingMoveEvent = null;

      // Use the release event's own coordinates rather than whatever the
      // last rAF-flushed frame happened to leave in marqueeState -- that
      // value is only ever updated inside the coalesced move handler, so a
      // release that lands before the next animation frame (a very fast
      // flick, or a frame skipped under load) would otherwise still read the
      // pointerdown position and compute a zero-distance drag.
      if (event) {
        marqueeState.currentClientX = event.clientX;
        marqueeState.currentClientY = event.clientY;
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
        // Never actually dragged -- a plain (or shift-) click on empty
        // canvas. Selection was already settled in handleCanvasPointerDown;
        // leave it as-is rather than re-deriving from a near-zero rect.
        return;
      }

      // Recompute once more against the exact release position: the last
      // rAF-flushed frame above can be up to ~16ms stale.
      applyMarqueeSelection(marqueeState);
    }

    function cancelMarquee() {
      if (!marqueeStateRef.current) {
        return;
      }

      if (moveRafId) {
        cancelAnimationFrame(moveRafId);
        moveRafId = 0;
      }
      pendingMoveEvent = null;
      marqueeStateRef.current = null;
      setMarqueeBox(null);
    }

    window.addEventListener("pointermove", updateMarquee, true);
    window.addEventListener("pointerup", finishMarquee, true);
    window.addEventListener("pointercancel", finishMarquee, true);
    window.addEventListener("blur", cancelMarquee);

    return () => {
      if (moveRafId) {
        cancelAnimationFrame(moveRafId);
      }
      window.removeEventListener("pointermove", updateMarquee, true);
      window.removeEventListener("pointerup", finishMarquee, true);
      window.removeEventListener("pointercancel", finishMarquee, true);
      window.removeEventListener("blur", cancelMarquee);
    };
  }, [canvas]);

  useEffect(() => {
    // Native pointermove can fire far faster than the display can paint
    // (especially on high-poll-rate mice/trackpads). Each event used to
    // run world-point conversion, snapping and a React state update
    // synchronously, so on a fast pointer the drag did more work than the
    // screen could ever show -- wasted renders that still cost a commit
    // each. Coalescing to one flush per animation frame keeps dragging at
    // display refresh rate regardless of how often the OS reports moves;
    // dragState.lastDelta (what finishDrag commits on drop) is still
    // whatever the latest flushed frame set it to, at most ~16ms stale.
    let pendingMoveEvent = null;
    let moveRafId = 0;

    function flushPendingMove() {
      moveRafId = 0;
      const event = pendingMoveEvent;
      pendingMoveEvent = null;
      if (event) {
        processPointerMove(event);
      }
    }

    // Only plain canvas tiles can leave for the other pane: not groups,
    // not tiles still being pulled out of a rack.
    function canDropExternally(dragState) {
      return Boolean(externalDropRef.current)
        && dragState.kind !== "group"
        && !dragState.startedFromRack
        && dragState.tileIds.every((tileId) => dragState.origins[tileId]?.containerType === "canvas");
    }

    function updateExternalDropPreview(dragState, event) {
      if (!canDropExternally(dragState)) {
        return;
      }
      const target = externalDropRef.current.hitTest(event.clientX, event.clientY) ?? null;
      if (!target && !dragState.externalTarget) {
        return;
      }
      dragState.externalTarget = target;
      if (target && !dragState.externalBounds) {
        dragState.externalBounds = getDragBoundsFromPointer(dragState);
      }
      externalDropRef.current.preview(target, target ? {
        clientX: event.clientX,
        clientY: event.clientY,
        bounds: dragState.externalBounds,
      } : null);
    }

    // The dragged tiles' world box, relative to where the pointer grabbed
    // them, so the other pane can draw a drop outline under the pointer.
    function getDragBoundsFromPointer(dragState) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const tileId of dragState.tileIds) {
        const origin = dragState.origins[tileId];
        const tile = tileByIdRef.current[tileId];
        if (!origin) continue;
        const width = origin.width ?? tile?.width ?? 0;
        const height = origin.height ?? tile?.height ?? 0;
        minX = Math.min(minX, origin.x);
        minY = Math.min(minY, origin.y);
        maxX = Math.max(maxX, origin.x + width);
        maxY = Math.max(maxY, origin.y + height);
      }
      if (!Number.isFinite(minX)) return null;
      return {
        left: minX - dragState.pointerWorldStart.x,
        top: minY - dragState.pointerWorldStart.y,
        width: maxX - minX,
        height: maxY - minY,
      };
    }

    function finishDrag(event = null) {
      if (moveRafId) {
        cancelAnimationFrame(moveRafId);
        moveRafId = 0;
      }
      pendingMoveEvent = null;
      // The drop commits the snapped spot; .card's transform transition
      // carries the tile the rest of the way once .card--dragging is gone.
      stopMagnetGlide();

      // Catch up to the release point first: the last flushed frame can be
      // up to a frame behind the pointer, and committing that stale delta
      // made the tile slide the last few px after letting go.
      if (event && dragStateRef.current) {
        processPointerMove(event);
      }

      const dragState = dragStateRef.current;

      if (dragState?.externalTarget) {
        externalDropRef.current?.preview(null, null);
      }

      if (!dragState) {
        clearRackDropPreview();

        if (pendingSingleSelectRef.current) {
          setSelectedTileIds([pendingSingleSelectRef.current]);
          pendingSingleSelectRef.current = null;
        }

        return;
      }

      // Released over the other split pane: the tiles move there instead.
      if (event && dragState.externalTarget && canDropExternally(dragState)) {
        const target = externalDropRef.current.hitTest(event.clientX, event.clientY);
        if (target) {
          commands.cancelPendingWorkspaceChange();
          const dropped = externalDropRef.current.drop(target, {
            tileIds: dragState.tileIds,
            origins: dragState.origins,
            pointerWorldStart: dragState.pointerWorldStart,
            clientX: event.clientX,
            clientY: event.clientY,
          });
          if (dropped) {
            dragMotion.clear();
            setDragGrabPoint(null);
            dragStateRef.current = null;
            setDraggingTileIds([]);
            clearRackDropPreview();
            setSelectedTileIds([]);
            return;
          }
        }
      }

      if (event && dragState.kind !== "group" && !rackDropPreviewRef.current?.rackId) {
        commands.bringTilesToFront(dragState.tileIds);
      }

      const commitStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const activeRackPreview = rackDropPreviewRef.current;
      const dragDelta = dragState.lastDelta ?? { x: 0, y: 0 };
      let nextSelectedIds = dragState.tileIds;
      let wasHandled = false;

      if (dragState.kind === "group") {
        if (event && (dragDelta.x !== 0 || dragDelta.y !== 0)) {
          commands.moveGroups(dragState.groupIds, dragDelta);
          wasHandled = true;
        } else {
          commands.cancelPendingWorkspaceChange();
        }
      } else if (event && activeRackPreview?.rackId) {
        const rackTile = commands.addTilesToRack(dragState.tileIds, activeRackPreview.rackId);

        if (rackTile) {
          // The tiles are inside the rack now; the rack is what's selected.
          nextSelectedIds = [rackTile.id];
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
        kind: dragState.kind ?? "tile",
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

      // Tiles keep showing the last offset until the commit that moves them
      // (TileShell drops it when its tile stops dragging), so nothing jumps.
      dragMotion.clear();
      setDragGrabPoint(null);

      dragStateRef.current = null;
      setDraggingTileIds([]);
      clearRackDropPreview();
      if (dragState.kind === "group") {
        setSelectedGroupIds(dragState.groupIds);
      } else {
        setSelectedTileIds(nextSelectedIds);
      }
    }

    function processPointerMove(event) {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      const moveStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (dragState.kind === "group") {
        const currentWorldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);
        const worldDelta = {
          x: currentWorldPoint.x - dragState.pointerWorldStart.x,
          y: currentWorldPoint.y - dragState.pointerWorldStart.y,
        };

        dragState.lastDelta = worldDelta;
        dragMotion.set(dragState.tileIds, worldDelta);
        recordPointerMoveSample((typeof performance !== "undefined" ? performance.now() : Date.now()) - moveStart);
        return;
      }

      updateExternalDropPreview(dragState, event);
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
      const baseDelta = snapResolution.appliedDelta;
      let worldDelta = baseDelta;

      // Magnetic snap, when it's switched on: the grid snap wins if that's
      // on too, and Alt turns the magnet off for this drag.
      if (
        snapSettingsRef.current?.magnetEnabled
        && !snapResolution.snapEnabled
        && dragState.magnet
        && !event.altKey
      ) {
        worldDelta = resolveTileMagnetSnap({
          bounds: dragState.magnet.bounds,
          neighbours: dragState.magnet.neighbours,
          rawDelta: rawWorldDelta,
          zoom: canvas.getViewportSnapshot()?.zoom,
        });
      }

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
      // The drop and the rack hit test use the snapped spot; the tile on
      // screen follows the pointer and glides the pull in.
      dragState.lastDelta = worldDelta;
      dragState.baseDelta = baseDelta;
      dragState.snapTarget = { x: worldDelta.x - baseDelta.x, y: worldDelta.y - baseDelta.y };
      showDragDelta(dragState);
      startMagnetGlide();

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
        setRackDropPreview((currentPreview) => (
          isSameRackDropPreview(currentPreview, nextRackDropPreview) ? currentPreview : nextRackDropPreview
        ));
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

    function handlePointerMove(event) {
      if (!dragStateRef.current) {
        return;
      }

      pendingMoveEvent = event;
      if (moveRafId) {
        return;
      }

      moveRafId = requestAnimationFrame(flushPendingMove);
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
      if (moveRafId) {
        cancelAnimationFrame(moveRafId);
      }
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);
      window.removeEventListener("blur", handlePointerUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canvas, clearRackDropPreview, commands, dragMotion, showDragDelta, startMagnetGlide, stopMagnetGlide]);

  const handleCanvasPointerDown = useCallback((event) => {
    if (isHandMode && event.button !== 2) {
      closeContextMenu();
      setHoveredTileId(null);
      setFocusedTileId(null);
      suppressCanvasContextMenuRef.current = false;
      event.preventDefault();
      canvas.beginCanvasPan(event);
      return;
    }

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
    setHoveredGroupId(null);
    setFocusedTileId(null);
    suppressCanvasContextMenuRef.current = false;

    if (event.button === 2) {
      return;
    }

    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    const isAdditiveSelection = isSelectMode && event.button === 0 && isSelectionModifierPressed(event);

    if (!isAdditiveSelection) {
      setSelectedTileIds([]);
      setSelectedGroupIds([]);
    }

    if (isSelectMode && event.button === 0) {
      event.preventDefault();
      event.stopPropagation();
      beginCanvasMarqueeSelection(event, { additive: isAdditiveSelection });
    }
  }, [beginCanvasMarqueeSelection, canvas, closeContextMenu, isHandMode, isSelectMode]);

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
    selectedGroupIds,
    selectedTileIdSet,
    hoveredTileId,
    hoveredGroupId,
    focusedTileId,
    draggingTileIds,
    dragMotion,
    dragGrabPoint,
    rackDropPreview,
    marqueeBox,
    marqueeStyleVars,
    beginGroupDrag,
    beginTileDrag,
    closeContextMenu,
    handleCanvasContextMenu,
    handleCanvasPointerDown,
    handleGroupContextMenu,
    handleGroupHoverChange,
    handleGroupPressStart,
    handleTileContextMenu,
    handleTileFocusIn,
    handleTileFocusOut,
    handleTileHoverChange,
    handleTilePressStart,
    nudgeSelection,
    pullTileFromRack,
    replaceSelection,
    resetTransientState,
    selectGroup,
    selectTile,
  }), [
    beginGroupDrag,
    beginTileDrag,
    closeContextMenu,
    contextMenu,
    dragMotion,
    dragGrabPoint,
    draggingTileIds,
    focusedTileId,
    handleGroupContextMenu,
    handleGroupHoverChange,
    handleGroupPressStart,
    rackDropPreview,
    handleCanvasContextMenu,
    handleCanvasPointerDown,
    handleTileContextMenu,
    handleTileFocusIn,
    handleTileFocusOut,
    handleTileHoverChange,
    handleTilePressStart,
    hoveredGroupId,
    hoveredTileId,
    marqueeBox,
    marqueeStyleVars,
    nudgeSelection,
    pullTileFromRack,
    replaceSelection,
    resetTransientState,
    selectGroup,
    selectTile,
    selectedGroupIds,
    selectedTileIdSet,
    selectedTileIds,
  ]);
}
