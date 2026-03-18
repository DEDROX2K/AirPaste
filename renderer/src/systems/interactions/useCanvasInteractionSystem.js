import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAttachTileToRack, isEditableElement } from "../../lib/workspace";
import {
  findFolderGroupingTarget,
  findRackDropTarget,
  getBoxStyleVars,
  getFolderZoneRect,
  getRenderableTileEntries,
  getRenderableTileEntryById,
  getSelectedTileIdsInRect,
  MARQUEE_DRAG_THRESHOLD,
  normalizeRect,
  pointInsideRect,
} from "../layout/tileLayout";

const MENU_WIDTH = 376;
const MENU_HEIGHT = 340;
const VIEWPORT_PADDING = 16;
const FOLDER_GROUP_HOLD_DELAY_MS = 2000;

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
  viewportZoom,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedTileIds, setSelectedTileIds] = useState([]);
  const [hoveredTileId, setHoveredTileId] = useState(null);
  const [focusedTileId, setFocusedTileId] = useState(null);
  const [editingTileId, setEditingTileId] = useState(null);
  const [draggingTileIds, setDraggingTileIds] = useState([]);
  const [marqueeBox, setMarqueeBox] = useState(null);
  const [folderGroupingPreview, setFolderGroupingPreview] = useState(null);
  const [rackDropPreview, setRackDropPreview] = useState(null);
  const [magnifiedNoteState, setMagnifiedNoteState] = useState(null);
  const [expandedTileId, setExpandedTileId] = useState(null);

  const dragStateRef = useRef(null);
  const marqueeStateRef = useRef(null);
  const folderGroupingIntentRef = useRef(null);
  const cardsRef = useRef(cards);
  const folderGroupingPreviewRef = useRef(folderGroupingPreview);
  const rackDropPreviewRef = useRef(rackDropPreview);

  const selectedTileIdSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    folderGroupingPreviewRef.current = folderGroupingPreview;
  }, [folderGroupingPreview]);

  useEffect(() => {
    rackDropPreviewRef.current = rackDropPreview;
  }, [rackDropPreview]);

  const clearFolderGroupingPreview = useCallback(() => {
    if (folderGroupingIntentRef.current?.timeoutId) {
      window.clearTimeout(folderGroupingIntentRef.current.timeoutId);
    }

    folderGroupingIntentRef.current = null;
    setFolderGroupingPreview(null);
  }, []);

  const clearRackDropPreview = useCallback(() => {
    setRackDropPreview(null);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeExpandedTile = useCallback(() => {
    setExpandedTileId(null);
  }, []);

  const closeMagnifiedNote = useCallback(() => {
    setMagnifiedNoteState(null);
  }, []);

  const resetTransientState = useCallback(() => {
    closeContextMenu();
    clearFolderGroupingPreview();
    clearRackDropPreview();
    closeExpandedTile();
    closeMagnifiedNote();
    setSelectedTileIds([]);
    setHoveredTileId(null);
    setFocusedTileId(null);
    setEditingTileId(null);
    setDraggingTileIds([]);
    setMarqueeBox(null);
    dragStateRef.current = null;
    marqueeStateRef.current = null;
  }, [
    clearFolderGroupingPreview,
    clearRackDropPreview,
    closeContextMenu,
    closeExpandedTile,
    closeMagnifiedNote,
  ]);

  useEffect(() => {
    resetTransientState();
  }, [resetKey, resetTransientState]);

  useEffect(() => {
    setSelectedTileIds((currentIds) => currentIds.filter((tileId) => cards.some((tile) => tile.id === tileId)));
    setHoveredTileId((currentId) => (cards.some((tile) => tile.id === currentId) ? currentId : null));
    setFocusedTileId((currentId) => (cards.some((tile) => tile.id === currentId) ? currentId : null));
    setEditingTileId((currentId) => (cards.some((tile) => tile.id === currentId) ? currentId : null));
    setExpandedTileId((currentId) => (cards.some((tile) => tile.id === currentId) ? currentId : null));

    if (contextMenu?.card && !cards.some((tile) => tile.id === contextMenu.card.id)) {
      setContextMenu(null);
    }

    if (magnifiedNoteState?.cardId && !cards.some((tile) => tile.id === magnifiedNoteState.cardId && tile.type === "text")) {
      setMagnifiedNoteState(null);
    }
  }, [cards, contextMenu, magnifiedNoteState]);

  useEffect(() => {
    const renderableTileIds = new Set(
      getRenderableTileEntries(cards, commands.openFolderId).map((entry) => entry.tile.id),
    );

    setSelectedTileIds((currentIds) => currentIds.filter((tileId) => renderableTileIds.has(tileId)));
    setHoveredTileId((currentId) => (renderableTileIds.has(currentId) ? currentId : null));
    setFocusedTileId((currentId) => (renderableTileIds.has(currentId) ? currentId : null));
    setEditingTileId((currentId) => (renderableTileIds.has(currentId) ? currentId : null));
  }, [cards, commands.openFolderId]);

  useEffect(() => {
    if (!folderGroupingPreview) {
      return;
    }

    const targetStillExists = cards.some((tile) => tile.id === folderGroupingPreview.targetTileId);

    if (!targetStillExists) {
      clearFolderGroupingPreview();
    }
  }, [cards, clearFolderGroupingPreview, folderGroupingPreview]);

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

    function closeOnPointerDown(event) {
      if (event.target instanceof Element && event.target.closest(".tile-context-menu")) {
        return;
      }

      setContextMenu(null);
    }

    function closeOnWindowChange() {
      setContextMenu(null);
    }

    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("resize", closeOnWindowChange);
    window.addEventListener("blur", closeOnWindowChange);
    window.addEventListener("wheel", closeOnWindowChange, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("resize", closeOnWindowChange);
      window.removeEventListener("blur", closeOnWindowChange);
      window.removeEventListener("wheel", closeOnWindowChange);
    };
  }, [contextMenu]);

  const requestTextNoteMagnify = useCallback((tileId, options = {}) => {
    if (!tileId) {
      return;
    }

    closeContextMenu();
    setMagnifiedNoteState({
      cardId: tileId,
      startSplit: Boolean(options.startSplit),
    });
  }, [closeContextMenu]);

  const toggleExpandedTile = useCallback((tileId) => {
    setExpandedTileId((currentId) => (currentId === tileId ? null : tileId));
  }, []);

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

  const handleTilePressStart = useCallback((tile, event) => {
    closeContextMenu();

    if (expandedTileId && expandedTileId !== tile.id) {
      setExpandedTileId(null);
    }

    if (isSelectionModifierPressed(event)) {
      selectTile(tile.id, { toggle: true });
      return true;
    }

    selectTile(tile.id, { forceSingle: !selectedTileIdSet.has(tile.id) });
    return false;
  }, [closeContextMenu, expandedTileId, selectTile, selectedTileIdSet]);

  const handleTileContextMenu = useCallback((tile, event) => {
    event.preventDefault();
    event.stopPropagation();

    const selectionIds = selectedTileIdSet.has(tile.id)
      ? selectedTileIds
      : [tile.id];

    selectTile(tile.id);

    const nextX = Math.min(
      event.clientX,
      window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING,
    );
    const nextY = Math.min(
      event.clientY,
      window.innerHeight - MENU_HEIGHT - VIEWPORT_PADDING,
    );

    setContextMenu({
      card: tile,
      selectionIds,
      x: Math.max(VIEWPORT_PADDING, nextX),
      y: Math.max(VIEWPORT_PADDING, nextY),
    });
  }, [selectedTileIdSet, selectedTileIds, selectTile]);

  const handleTileHoverChange = useCallback((tileId, isHovered) => {
    setHoveredTileId((currentId) => {
      if (isHovered) {
        return tileId;
      }

      return currentId === tileId ? null : currentId;
    });
  }, []);

  const handleTileFocusIn = useCallback((tileId, event) => {
    setFocusedTileId(tileId);

    if (isEditableElement(event.target)) {
      setEditingTileId(tileId);
    }
  }, []);

  const handleTileFocusOut = useCallback((tileId, event) => {
    const nextFocusedElement = event.relatedTarget;

    if (event.currentTarget?.contains?.(nextFocusedElement)) {
      setEditingTileId(isEditableElement(nextFocusedElement) ? tileId : null);
      return;
    }

    setFocusedTileId((currentId) => (currentId === tileId ? null : currentId));
    setEditingTileId((currentId) => (currentId === tileId ? null : currentId));
  }, []);

  const handleTileEditingChange = useCallback((tileId, isEditing) => {
    setEditingTileId((currentId) => {
      if (isEditing) {
        return tileId;
      }

      return currentId === tileId ? null : currentId;
    });
  }, []);

  const beginCanvasMarqueeSelection = useCallback((event) => {
    const startCanvasPoint = canvas.clientToCanvasPoint(event.clientX, event.clientY);

    marqueeStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
    };

    setMarqueeBox({
      x: startCanvasPoint.x,
      y: startCanvasPoint.y,
      width: 0,
      height: 0,
    });

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [canvas]);

  const queueFolderGroupingTarget = useCallback((sourceTileId, nextTarget) => {
    const existingIntent = folderGroupingIntentRef.current;

    if (
      existingIntent?.sourceTileId === sourceTileId
      && existingIntent?.targetTileId === nextTarget.targetTileId
      && existingIntent?.kind === nextTarget.kind
    ) {
      return;
    }

    clearFolderGroupingPreview();
    setFolderGroupingPreview({
      ...nextTarget,
      sourceTileId,
      isArmed: false,
    });

    const timeoutId = window.setTimeout(() => {
      setFolderGroupingPreview((currentPreview) => {
        if (
          !currentPreview
          || currentPreview.sourceTileId !== sourceTileId
          || currentPreview.targetTileId !== nextTarget.targetTileId
          || currentPreview.kind !== nextTarget.kind
        ) {
          return currentPreview;
        }

        return {
          ...currentPreview,
          isArmed: true,
        };
      });
    }, FOLDER_GROUP_HOLD_DELAY_MS);

    folderGroupingIntentRef.current = {
      sourceTileId,
      targetTileId: nextTarget.targetTileId,
      kind: nextTarget.kind,
      timeoutId,
    };
  }, [clearFolderGroupingPreview]);

  const beginTileDrag = useCallback((tile, event) => {
    closeContextMenu();
    closeMagnifiedNote();
    clearFolderGroupingPreview();
    clearRackDropPreview();

    const isPrimaryPointer = event.button === 0 || event.buttons === 1;

    if (!isPrimaryPointer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const anchorEntry = getRenderableTileEntryById(cardsRef.current, commands.openFolderId, tile.id);

    if (!anchorEntry) {
      return;
    }

    const candidateTileIds = anchorEntry.containerType === "rack"
      ? [tile.id]
      : selectedTileIdSet.has(tile.id)
        ? selectedTileIds
        : [tile.id];
    const dragEntries = candidateTileIds
      .map((tileId) => getRenderableTileEntryById(cardsRef.current, commands.openFolderId, tileId))
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

    dragStateRef.current = {
      tileId: tile.id,
      tileIds: dragTileIds,
      pointerX: event.clientX,
      pointerY: event.clientY,
      lastDelta: { x: 0, y: 0 },
      origins: dragOrigins,
      hasMoved: false,
    };
    setDraggingTileIds(dragTileIds);
  }, [
    clearFolderGroupingPreview,
    clearRackDropPreview,
    closeContextMenu,
    closeMagnifiedNote,
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

      setSelectedTileIds(getSelectedTileIdsInRect(cardsRef.current, selectionWorldRect, commands.openFolderId));
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
  }, [canvas, commands.openFolderId]);

  useEffect(() => {
    function finishDrag(event = null) {
      const dragState = dragStateRef.current;

      if (!dragState) {
        clearFolderGroupingPreview();
        clearRackDropPreview();
        return;
      }

      const activeFolderPreview = folderGroupingPreviewRef.current;
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

      if (!wasHandled && event && dragState.tileIds.length === 1 && activeFolderPreview?.isArmed) {
        if (activeFolderPreview.kind === "tile") {
          const folderTile = commands.createFolderFromTiles(dragState.tileId, activeFolderPreview.targetTileId);

          if (folderTile) {
            nextSelectedIds = [folderTile.id];
            wasHandled = true;
          }
        } else if ((activeFolderPreview.kind === "folder-tile" || activeFolderPreview.kind === "folder-zone") && activeFolderPreview.folderId) {
          const sourceOrigin = dragState.origins[dragState.tileId];
          const targetFolder = cardsRef.current.find((tile) => tile.id === activeFolderPreview.folderId);

          if (sourceOrigin && targetFolder) {
            const zoneRect = getFolderZoneRect(targetFolder);
            const folderPosition = {
              x: sourceOrigin.x + dragDelta.x - zoneRect.left,
              y: sourceOrigin.y + dragDelta.y - zoneRect.top,
            };
            const folderTile = commands.addTileToFolder(dragState.tileId, activeFolderPreview.folderId, folderPosition);

            if (folderTile) {
              nextSelectedIds = [dragState.tileId];
              wasHandled = true;
            }
          }
        }
      }

      if (!wasHandled && event) {
        const extractedTileIds = dragState.tileIds.filter((tileId) => {
          const origin = dragState.origins[tileId];

          if (!origin || origin.containerType !== "folder" || !origin.folderId) {
            return false;
          }

          const sourceFolder = cardsRef.current.find((tile) => tile.id === origin.folderId);

          if (!sourceFolder) {
            return false;
          }

          const zoneRect = getFolderZoneRect(sourceFolder);
          const tileCenter = {
            x: origin.x + dragDelta.x + origin.width / 2,
            y: origin.y + dragDelta.y + origin.height / 2,
          };

          if (pointInsideRect(tileCenter, zoneRect)) {
            return false;
          }

          return Boolean(commands.removeTileFromFolder(tileId, origin.folderId, {
            x: origin.x + dragDelta.x,
            y: origin.y + dragDelta.y,
          }));
        });

        if (extractedTileIds.length > 0) {
          nextSelectedIds = extractedTileIds;
        }
      }

      dragStateRef.current = null;
      setDraggingTileIds([]);
      clearFolderGroupingPreview();
      clearRackDropPreview();
      setSelectedTileIds(nextSelectedIds);
    }

    function handlePointerMove(event) {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      const worldDelta = {
        x: (event.clientX - dragState.pointerX) / viewportZoom,
        y: (event.clientY - dragState.pointerY) / viewportZoom,
      };

      dragState.hasMoved = true;
      dragState.lastDelta = worldDelta;
      commands.moveTiles(dragState.tileIds, dragState.origins, worldDelta);

      const canDropOnRack = dragState.tileIds.every((tileId) => {
        const origin = dragState.origins[tileId];
        const draggedTile = cardsRef.current.find((tile) => tile.id === tileId);

        return origin?.containerType === "canvas" && canAttachTileToRack(draggedTile);
      });

      if (canDropOnRack) {
        setRackDropPreview(findRackDropTarget({
          tiles: cardsRef.current,
          dragTileIds: dragState.tileIds,
          dragOrigins: dragState.origins,
          dragDelta: worldDelta,
          clientToWorldPoint: canvas.clientToWorldPoint,
          pointerClientX: event.clientX,
          pointerClientY: event.clientY,
        }));
      } else {
        clearRackDropPreview();
      }

      if (dragState.tileIds.length !== 1 || rackDropPreviewRef.current?.rackId) {
        clearFolderGroupingPreview();
        return;
      }

      const groupingTarget = findFolderGroupingTarget({
        tiles: cardsRef.current,
        dragTileId: dragState.tileId,
        dragOrigins: dragState.origins,
        dragDelta: worldDelta,
        openFolderId: commands.openFolderId,
        clientToWorldPoint: canvas.clientToWorldPoint,
        pointerClientX: event.clientX,
        pointerClientY: event.clientY,
      });

      if (groupingTarget) {
        queueFolderGroupingTarget(dragState.tileId, groupingTarget);
      } else {
        clearFolderGroupingPreview();
      }
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
  }, [canvas, clearFolderGroupingPreview, clearRackDropPreview, commands, queueFolderGroupingTarget, viewportZoom]);

  const handleCanvasPointerDown = useCallback((event) => {
    const isCanvasBackground = isCanvasBackgroundTarget(event);

    if (!isCanvasBackground) {
      return;
    }

    closeContextMenu();
    closeExpandedTile();
    commands.closeFolder();
    setFocusedTileId(null);
    setEditingTileId(null);

    const shouldBeginMarquee = isSelectionModifierPressed(event) || event.button === 2;

    if (shouldBeginMarquee) {
      event.preventDefault();
      event.stopPropagation();
      beginCanvasMarqueeSelection(event);
      return;
    }

    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    setSelectedTileIds([]);
    canvas.beginCanvasPan(event);
  }, [beginCanvasMarqueeSelection, canvas, closeContextMenu, closeExpandedTile, commands]);

  const handleCanvasContextMenu = useCallback((event) => {
    if (!isCanvasBackgroundTarget(event)) {
      return;
    }

    event.preventDefault();
  }, []);

  const marqueeStyleVars = useMemo(() => getBoxStyleVars(marqueeBox), [marqueeBox]);

  return useMemo(() => ({
    contextMenu,
    selectedTileIds,
    selectedTileIdSet,
    hoveredTileId,
    focusedTileId,
    editingTileId,
    draggingTileIds,
    folderGroupingPreview,
    rackDropPreview,
    magnifiedNoteState,
    expandedTileId,
    marqueeBox,
    marqueeStyleVars,
    beginTileDrag,
    closeContextMenu,
    closeMagnifiedNote,
    handleCanvasContextMenu,
    handleCanvasPointerDown,
    handleTileContextMenu,
    handleTileEditingChange,
    handleTileFocusIn,
    handleTileFocusOut,
    handleTileHoverChange,
    handleTilePressStart,
    requestTextNoteMagnify,
    resetTransientState,
    selectTile,
    toggleExpandedTile,
  }), [
    beginTileDrag,
    closeContextMenu,
    closeMagnifiedNote,
    contextMenu,
    draggingTileIds,
    editingTileId,
    expandedTileId,
    focusedTileId,
    folderGroupingPreview,
    rackDropPreview,
    handleCanvasContextMenu,
    handleCanvasPointerDown,
    handleTileContextMenu,
    handleTileEditingChange,
    handleTileFocusIn,
    handleTileFocusOut,
    handleTileHoverChange,
    handleTilePressStart,
    hoveredTileId,
    magnifiedNoteState,
    marqueeBox,
    marqueeStyleVars,
    requestTextNoteMagnify,
    resetTransientState,
    selectTile,
    selectedTileIdSet,
    selectedTileIds,
    toggleExpandedTile,
  ]);
}
