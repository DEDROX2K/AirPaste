import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Card from "./Card";
import CanvasAddMenu from "./CanvasAddMenu";
import CanvasZoomMenu from "./CanvasZoomMenu";
import NoteMagnifier from "./notes/NoteMagnifier";
import RadialContextMenu from "./RadialContextMenu";
import { useAppContext } from "../context/useAppContext";
import { useLog } from "../hooks/useLog";
import { useToast } from "../hooks/useToast";
import { isEditableElement } from "../lib/workspace";
import { useCanvasSystem } from "../systems/canvas/useCanvasSystem";
import { useCanvasCommands } from "../systems/commands/useCanvasCommands";
import { useCanvasInteractionSystem } from "../systems/interactions/useCanvasInteractionSystem";
import { buildRadialMenuActions } from "../systems/interactions/radialMenuActions";
import { useCanvasDropImport } from "../systems/import/useCanvasDropImport";
import { useTileLayoutSystem } from "../systems/layout/useTileLayoutSystem";
import {
  buildCanvasSnapUiStatePatch,
  DEFAULT_CANVAS_SNAP_SETTINGS,
  normalizeCanvasSnapSettings,
} from "../systems/snapping/canvasSnapSettings";
import { AppEmptyState } from "./ui/app";
import { useTheme } from "../hooks/useTheme";
import { filterTiles } from "../utils/searchTiles";
import { folderNameFromPath } from "../lib/home";
import { recordBoardRender, recordDerivedMetric, setPerfSummary } from "../lib/perf";
import TILE_TYPES from "../tiles/tileTypes";

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.8V21h14V9.8" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function CanvasPerformanceOverlay({
  enabled,
  visibleTileCount,
  activeDragLayers,
}) {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let rafId = 0;
    let lastSampleTime = performance.now();
    let frameCount = 0;

    function tick(now) {
      frameCount += 1;

      if (now - lastSampleTime >= 500) {
        setFps(Math.round((frameCount * 1000) / Math.max(1, now - lastSampleTime)));
        frameCount = 0;
        lastSampleTime = now;
      }

      rafId = window.requestAnimationFrame(tick);
    }

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="canvas-perf-overlay" aria-live="off">
      <span>FPS {fps}</span>
      <span>Visible {visibleTileCount}</span>
      <span>Layers {activeDragLayers}</span>
    </div>
  );
}

export default function CanvasWorkspaceView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [textPlacementMode, setTextPlacementMode] = useState(false);
  const [perfDebugMode, setPerfDebugMode] = useState(() => ({
    effectsOff: false,
    imagesOff: false,
  }));
  const [snapSettings, setSnapSettings] = useState(DEFAULT_CANVAS_SNAP_SETTINGS);
  const searchInputRef = useRef(null);
  const previousBoardSnapshotRef = useRef(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const {
    currentEditor,
    folderLoading,
    folderPath,
    homeData,
    openExistingWorkspace,
    saveHomeUiState,
    setViewport,
    showHome,
    workspace,
    createNewLinkCard,
    createNewNoteFolderCard,
    createNewRackCard,
    createNewTextCard,
    deleteExistingCard,
    mergeExistingNoteCardIntoFolder,
    replaceWorkspaceCards,
    reorderExistingCards,
    updateExistingCard,
    updateExistingCards,
  } = useAppContext();
  const { log } = useLog();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const canvas = useCanvasSystem({
    viewport: workspace.viewport,
    onViewportChange: setViewport,
  });

  const commands = useCanvasCommands({
    folderPath,
    canvasFilePath: currentEditor.filePath,
    workspace,
    getViewportCenter: canvas.getViewportCenter,
    openFolderDialog: openExistingWorkspace,
    createNewLinkCard,
    createNewNoteFolderCard,
    createNewRackCard,
    createNewTextCard,
    deleteExistingCard,
    mergeExistingNoteCardIntoFolder,
    replaceWorkspaceCards,
    reorderExistingCards,
    updateExistingCard,
    updateExistingCards,
    log,
    toast,
  });

  const dropImport = useCanvasDropImport({
    canvas,
    commands,
    folderPath,
    log,
    toast,
  });

  const interactions = useCanvasInteractionSystem({
    cards: workspace.cards,
    canvas,
    commands,
    resetKey: folderPath,
    snapSettings,
    viewportZoom: workspace.viewport.zoom,
  });

  useEffect(() => {
    setSearchQuery("");
    setTextPlacementMode(false);
  }, [currentEditor.filePath, folderPath]);

  useEffect(() => {
    setSnapSettings(normalizeCanvasSnapSettings(homeData?.uiState));
  }, [homeData?.uiState]);

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem("airpaste:canvas-perf-debug");

      if (!rawValue) {
        return;
      }

      const nextMode = JSON.parse(rawValue);

      setPerfDebugMode({
        effectsOff: Boolean(nextMode?.effectsOff),
        imagesOff: Boolean(nextMode?.imagesOff),
      });
    } catch {
      // Ignore malformed local storage.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("airpaste:canvas-perf-debug", JSON.stringify(perfDebugMode));
  }, [perfDebugMode]);

  const focusSearchInput = useCallback(() => {
    const input = searchInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  useEffect(() => {
    async function handlePaste(event) {
      if (isEditableElement(document.activeElement)) return;
      await commands.pasteFromClipboard(event);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [commands]);

  const filteredTiles = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextFilteredTiles = filterTiles(workspace.cards, deferredSearchQuery);
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("board:filteredTiles", end - start, {
      queryLength: deferredSearchQuery.trim().length,
      inputCount: workspace.cards.length,
      outputCount: nextFilteredTiles.length,
    });
    return nextFilteredTiles;
  }, [deferredSearchQuery, workspace.cards]);
  const tileById = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextTileById = Object.fromEntries(workspace.cards.map((tile) => [tile.id, tile]));
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("board:tileById", end - start, {
      tileCount: workspace.cards.length,
    });
    return nextTileById;
  }, [workspace.cards]);
  const draggingTileIdSet = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextDraggingTileIdSet = new Set(interactions.draggingTileIds);
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("board:draggingTileIdSet", end - start, {
      draggingCount: interactions.draggingTileIds.length,
    });
    return nextDraggingTileIdSet;
  }, [interactions.draggingTileIds]);
  const visibleWorldRect = useMemo(() => {
    if (!canvas.containerRect) {
      return null;
    }

    const padding = 320;

    return {
      left: (-canvas.viewport.x - padding) / canvas.viewport.zoom,
      top: (-canvas.viewport.y - padding) / canvas.viewport.zoom,
      right: (canvas.containerRect.width - canvas.viewport.x + padding) / canvas.viewport.zoom,
      bottom: (canvas.containerRect.height - canvas.viewport.y + padding) / canvas.viewport.zoom,
    };
  }, [
    canvas.containerRect,
    canvas.viewport.x,
    canvas.viewport.y,
    canvas.viewport.zoom,
  ]);

  const layout = useTileLayoutSystem({
    tiles: filteredTiles,
    openFolderId: commands.openFolderId,
    folderGroupingPreview: interactions.folderGroupingPreview,
    rackDropPreview: interactions.rackDropPreview,
    selectedTileIds: interactions.selectedTileIds,
    hoveredTileId: interactions.hoveredTileId,
    focusedTileId: interactions.focusedTileId,
    editingTileId: interactions.editingTileId,
    draggingTileIds: interactions.draggingTileIds,
    mergeTargetTileId: interactions.folderGroupingPreview?.targetTileId ?? null,
    visibleWorldRect,
  });

  const zoomToFitAll = useCallback(() => {
    canvas.zoomToBounds(layout.allTilesBounds);
  }, [canvas, layout.allTilesBounds]);

  const zoomToFitSelection = useCallback(() => {
    canvas.zoomToBounds(layout.selectedTilesBounds);
  }, [canvas, layout.selectedTilesBounds]);

  useEffect(() => {
    function handleKeyDown(event) {
      const activeElement = document.activeElement;
      const activeElementIsEditable = isEditableElement(activeElement);
      const editingAnotherField = activeElementIsEditable && activeElement !== searchInputRef.current;

      if (event.key === "Escape" && interactions.contextMenu) {
        event.preventDefault();
        interactions.closeContextMenu();
        return;
      }

      if (event.key === "Escape" && textPlacementMode) {
        event.preventDefault();
        setTextPlacementMode(false);
        return;
      }

      if (editingAnotherField) return;

      if (event.key === "Delete" && !activeElementIsEditable && interactions.selectedTileIds.length > 0) {
        event.preventDefault();
        commands.deleteTiles(interactions.selectedTileIds);
        interactions.closeContextMenu();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearchInput();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        canvas.zoomIn();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        canvas.zoomOut();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        canvas.setZoom(1);
        return;
      }

      if (event.shiftKey && event.key === "1") {
        event.preventDefault();
        zoomToFitAll();
        return;
      }

      if (event.key === "Escape" && activeElement === searchInputRef.current) {
        event.preventDefault();
        if (searchQuery) {
          setSearchQuery("");
        } else {
          searchInputRef.current.blur();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canvas, commands, focusSearchInput, interactions, searchQuery, textPlacementMode, zoomToFitAll]);

  const totalTileCount = workspace.cards.length;
  const visibleTileCount = layout.visibleTileCount ?? layout.rootTiles.length;
  const hasActiveSearch = deferredSearchQuery.trim().length > 0;
  const folderLabel = folderPath ? folderNameFromPath(folderPath) : null;
  const canvasName = currentEditor.name || "Canvas";
  const magnifiedNoteCard = interactions.magnifiedNoteState
    ? (
      tileById[interactions.magnifiedNoteState.cardId]?.type === TILE_TYPES.NOTE
        ? tileById[interactions.magnifiedNoteState.cardId]
        : null
    )
    : null;
  const isCanvasMoving = canvas.isPanning || interactions.draggingTileIds.length > 0;
  const performanceMode = useMemo(() => ({
    ...perfDebugMode,
    simplifyDuringMotion: isCanvasMoving,
  }), [isCanvasMoving, perfDebugMode]);

  const boardSnapshot = useMemo(() => ({
    viewport: `${Math.round(canvas.viewport.x)}:${Math.round(canvas.viewport.y)}:${canvas.viewport.zoom.toFixed(2)}`,
    cardCount: workspace.cards.length,
    filteredTileCount: filteredTiles.length,
    visibleTileCount,
    selectedCount: interactions.selectedTileIds.length,
    hoveredTileId: interactions.hoveredTileId,
    focusedTileId: interactions.focusedTileId,
    editingTileId: interactions.editingTileId,
    draggingCount: interactions.draggingTileIds.length,
    dragVisualDelta: interactions.dragVisualDelta
      ? `${Math.round(interactions.dragVisualDelta.x)}:${Math.round(interactions.dragVisualDelta.y)}`
      : null,
    folderPreview: interactions.folderGroupingPreview?.targetTileId ?? null,
    rackPreview: interactions.rackDropPreview?.rackId ?? null,
    marqueeActive: Boolean(interactions.marqueeBox),
    expandedTileId: interactions.expandedTileId,
    isPanning: canvas.isPanning,
    isDropTarget: dropImport.isDropTarget,
    snapEnabled: snapSettings.enabled,
    effectsOff: performanceMode.effectsOff,
    imagesOff: performanceMode.imagesOff,
    openFolderId: commands.openFolderId,
  }), [
    canvas.isPanning,
    canvas.viewport.x,
    canvas.viewport.y,
    canvas.viewport.zoom,
    commands.openFolderId,
    dropImport.isDropTarget,
    filteredTiles.length,
    interactions.draggingTileIds.length,
    interactions.dragVisualDelta,
    interactions.editingTileId,
    interactions.expandedTileId,
    interactions.focusedTileId,
    interactions.folderGroupingPreview?.targetTileId,
    interactions.hoveredTileId,
    interactions.marqueeBox,
    interactions.rackDropPreview?.rackId,
    interactions.selectedTileIds.length,
    performanceMode.effectsOff,
    performanceMode.imagesOff,
    snapSettings.enabled,
    visibleTileCount,
    workspace.cards.length,
  ]);

  useEffect(() => {
    const previousSnapshot = previousBoardSnapshotRef.current;
    const changedKeys = previousSnapshot
      ? Object.keys(boardSnapshot).filter((key) => previousSnapshot[key] !== boardSnapshot[key])
      : ["initial-render"];

    recordBoardRender(changedKeys);
    previousBoardSnapshotRef.current = boardSnapshot;
  }, [boardSnapshot]);

  useEffect(() => {
    setPerfSummary({
      visibleTileCount,
      totalTileCount,
      activeDragLayers: interactions.draggingTileIds.length,
      perfMode: performanceMode,
    });
  }, [interactions.draggingTileIds.length, performanceMode, totalTileCount, visibleTileCount]);

  const toggleEffectsOff = useCallback(() => {
    setPerfDebugMode((currentMode) => ({
      ...currentMode,
      effectsOff: !currentMode.effectsOff,
    }));
  }, []);

  const toggleImagesOff = useCallback(() => {
    setPerfDebugMode((currentMode) => ({
      ...currentMode,
      imagesOff: !currentMode.imagesOff,
    }));
  }, []);

  const toggleLiteMode = useCallback(() => {
    setPerfDebugMode((currentMode) => {
      const enableLiteMode = !(currentMode.effectsOff && currentMode.imagesOff);

      return {
        effectsOff: enableLiteMode,
        imagesOff: enableLiteMode,
      };
    });
  }, []);

  const toggleCanvasSnapping = useCallback(() => {
    setSnapSettings((currentSettings) => {
      const nextSettings = {
        ...currentSettings,
        enabled: !currentSettings.enabled,
      };

      void saveHomeUiState(buildCanvasSnapUiStatePatch(nextSettings)).catch((error) => {
        const message = error?.message || "Unable to save the canvas snap setting.";
        log("error", "Canvas snap setting save failed", message);
        toast("error", message);
      });

      log("info", `Canvas snapping ${nextSettings.enabled ? "enabled" : "disabled"}`, nextSettings);
      toast("info", `Canvas snapping ${nextSettings.enabled ? "enabled" : "disabled"}.`);
      return nextSettings;
    });
  }, [log, saveHomeUiState, toast]);

  const radialMenu = interactions.contextMenu;

  const handleRadialNote = useCallback(() => {
    if (!radialMenu?.worldPoint) {
      return false;
    }

    commands.createNote("notes-2", "", radialMenu.worldPoint);
    return true;
  }, [commands, radialMenu]);

  const handleRadialRack = useCallback(() => {
    if (!radialMenu?.worldPoint) {
      return false;
    }

    commands.createRack(radialMenu.worldPoint);
    return true;
  }, [commands, radialMenu]);

  const handleRadialFolder = useCallback(() => {
    if (!radialMenu?.worldPoint) {
      return false;
    }

    const selectionIds = radialMenu.selectionIds ?? [];

    if (selectionIds.length > 0) {
      commands.createFolderFromSelection(selectionIds, radialMenu.worldPoint);
      return true;
    }

    commands.createFolderTile(radialMenu.worldPoint);
    return true;
  }, [commands, radialMenu]);

  const handleRadialDelete = useCallback(() => {
    const selectionIds = radialMenu?.selectionIds ?? [];

    if (selectionIds.length === 0) {
      return false;
    }

    commands.deleteTiles(selectionIds);
    return true;
  }, [commands, radialMenu]);

  const handleRadialLink = useCallback(async () => {
    if (!radialMenu?.worldPoint) {
      return false;
    }

    const tile = await commands.createLinkFromClipboard(radialMenu.worldPoint);
    return Boolean(tile);
  }, [commands, radialMenu]);

  const radialActions = useMemo(() => buildRadialMenuActions({
    menu: radialMenu,
    snapEnabled: snapSettings.enabled,
    deleteDisabled: (radialMenu?.selectionIds?.length ?? 0) === 0,
    handlers: {
      onCreateNote: handleRadialNote,
      onToggleSnapping: () => {
        toggleCanvasSnapping();
        return true;
      },
      onDeleteSelection: handleRadialDelete,
      onCreateFolder: handleRadialFolder,
      onCreateRack: handleRadialRack,
      onCreateLink: handleRadialLink,
    },
  }), [
    handleRadialDelete,
    handleRadialFolder,
    handleRadialLink,
    handleRadialNote,
    handleRadialRack,
    radialMenu,
    snapSettings.enabled,
    toggleCanvasSnapping,
  ]);

  return (
    <main className="canvas-stage">
      {/* ── Search Portal ── */}
      {createPortal(
        <div className="canvas-search">
          <svg className="canvas-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            id="tile-search"
            ref={searchInputRef}
            className="canvas-search__input"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tiles\u2026"
            aria-label="Search tiles"
          />
          {searchQuery ? (
            <button
              className="canvas-search__clear"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery("");
                focusSearchInput();
              }}
            >
              &times;
            </button>
          ) : (
            <kbd className="canvas-search__kbd">{"\u2318"}K</kbd>
          )}
        </div>,
        document.getElementById("titlebar-center-slot") || document.body
      )}

      {/* ── Right Tools Portal ── */}
      {createPortal(
        <>
          <button
            type="button"
            className="canvas-topbar__theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <div className="canvas-perf-toggles" aria-label="Canvas performance debug toggles">
            <button
              type="button"
              className={`canvas-perf-toggle${performanceMode.effectsOff ? " canvas-perf-toggle--active" : ""}`}
              onClick={toggleEffectsOff}
            >
              FX
            </button>
            <button
              type="button"
              className={`canvas-perf-toggle${performanceMode.imagesOff ? " canvas-perf-toggle--active" : ""}`}
              onClick={toggleImagesOff}
            >
              IMG
            </button>
            <button
              type="button"
              className={`canvas-perf-toggle${performanceMode.effectsOff && performanceMode.imagesOff ? " canvas-perf-toggle--active" : ""}`}
              onClick={toggleLiteMode}
            >
              Lite
            </button>
          </div>
          <CanvasAddMenu
            commands={commands}
            disabled={!folderPath || folderLoading}
            textPlacementMode={textPlacementMode}
            onSelectText={() => setTextPlacementMode(true)}
          />
          <CanvasZoomMenu
            zoom={workspace.viewport.zoom}
            canFitAll={Boolean(layout.allTilesBounds)}
            canFitSelection={Boolean(layout.selectedTilesBounds)}
            onZoomIn={canvas.zoomIn}
            onZoomOut={canvas.zoomOut}
            onZoomToFitAll={zoomToFitAll}
            onZoomToFitSelection={zoomToFitSelection}
            onSetZoom={canvas.setZoom}
          />
        </>,
        document.getElementById("titlebar-right-slot") || document.body
      )}

      {/* ── Top bar ── */}
      <header className="canvas-topbar">
        <div className="canvas-topbar__left">
          <button
            className="canvas-topbar__crumb canvas-topbar__crumb--home"
            type="button"
            title="Go to Home"
            onClick={() => void showHome()}
          >
            <IconHome />
            <span>Home</span>
          </button>
          {folderLabel && (
            <>
              <span className="canvas-topbar__sep" aria-hidden="true">/</span>
              <button
                className="canvas-topbar__crumb"
                type="button"
                title="Switch workspace folder"
                disabled={folderLoading}
                onClick={commands.openWorkspaceFolder}
              >
                <IconFolder />
                <span className="canvas-topbar__crumb-text">
                  {folderLoading ? "Opening\u2026" : folderLabel}
                </span>
              </button>
              <span className="canvas-topbar__sep" aria-hidden="true">/</span>
              <span className="canvas-topbar__crumb canvas-topbar__crumb--active">
                {canvasName}
              </span>
            </>
          )}
        </div>

        <div className="canvas-topbar__center" />

        <div className="canvas-topbar__right" />
      </header>

      {/* ── Canvas board ── */}
      <div
        ref={canvas.containerRef}
        id="canvas-board"
        className={`canvas${interactions.marqueeBox ? " canvas--selecting" : ""}${dropImport.isDropTarget ? " canvas--drop-target" : ""}${isCanvasMoving ? " canvas--moving" : ""}${performanceMode.effectsOff ? " canvas--perf-effects-off" : ""}${performanceMode.imagesOff ? " canvas--perf-images-off" : ""}${textPlacementMode ? " canvas--placing-text" : ""}`}
        tabIndex={-1}
        onDragEnter={dropImport.handleDragEnter}
        onDragOver={dropImport.handleDragOver}
        onDragLeave={dropImport.handleDragLeave}
        onDrop={(event) => { void dropImport.handleDrop(event); }}
        onPointerDown={(event) => {
          const isBackgroundTarget = event.target === event.currentTarget
            || event.target.classList?.contains("canvas__content");

          if (textPlacementMode && isBackgroundTarget && event.button === 0) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          interactions.handleCanvasPointerDown(event);
        }}
        onDoubleClick={interactions.handleCanvasDoubleClick}
        onContextMenu={interactions.handleCanvasContextMenu}
        onClick={(event) => {
          const isBackgroundTarget = event.target === event.currentTarget
            || event.target.classList?.contains("canvas__content");

          if (textPlacementMode && isBackgroundTarget && event.button === 0) {
            const preferredCenter = canvas.clientToWorldPoint(event.clientX, event.clientY);
            const tile = commands.createRichTextTile(preferredCenter);

            if (tile?.id) {
              interactions.activateTileEditor(tile.id);
            }

            setTextPlacementMode(false);
            event.currentTarget.focus({ preventScroll: true });
            return;
          }

          if (!isEditableElement(event.target)) {
            event.currentTarget.focus({ preventScroll: true });
          }
        }}
      >
        <div className="canvas__grid" style={canvas.gridStyleVars} />
        <div className="canvas__content" style={canvas.contentStyleVars}>
          {layout.rootTiles.map((card) => (
            <Card
              key={card.id}
              card={card}
              tileMeta={layout.tileMetaById[card.id]}
              viewportZoom={workspace.viewport.zoom}
              isExpanded={interactions.expandedTileId === card.id}
              dragVisualDelta={interactions.dragVisualDelta}
              dragVisualTileIdSet={draggingTileIdSet}
              childTiles={layout.folderChildTilesByFolderId[card.id] ?? layout.rackTileChildrenByRackId[card.id] ?? []}
              folderState={layout.openFolderState?.folderId === card.id ? layout.openFolderState : null}
              rackState={layout.rackStateById[card.id] ?? null}
              expandedTileId={interactions.expandedTileId}
              performanceMode={performanceMode}
              onBeginDrag={interactions.beginTileDrag}
              onContextMenu={interactions.handleTileContextMenu}
              onHoverChange={interactions.handleTileHoverChange}
              onFocusIn={interactions.handleTileFocusIn}
              onFocusOut={interactions.handleTileFocusOut}
              onOpenLink={commands.openTileLink}
              onMediaLoad={commands.updateTileFromMediaLoad}
              onPressStart={interactions.handleTilePressStart}
              onRequestTextNoteMagnify={interactions.requestTextNoteMagnify}
              onRetry={commands.retryTilePreview}
              onTextChange={commands.updateTile}
              onEditingChange={interactions.handleTileEditingChange}
              onToggleExpanded={interactions.toggleExpandedTile}
              onToggleFolderOpen={commands.toggleFolder}
            />
          ))}
        </div>

        {interactions.marqueeBox ? (
          <div className="canvas__marquee" style={interactions.marqueeStyleVars} />
        ) : null}
        <CanvasPerformanceOverlay
          enabled={isCanvasMoving || performanceMode.effectsOff || performanceMode.imagesOff}
          visibleTileCount={visibleTileCount}
          activeDragLayers={interactions.draggingTileIds.length}
        />

        {/* Empty states */}
        {!folderPath ? (
          <section className="canvas__empty">
            <div className="canvas__empty-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="canvas__empty-title">No workspace open</h2>
            <p className="canvas__empty-description">Open a local folder to start saving notes, links, and media.</p>
            <button className="canvas__empty-action" type="button" onClick={commands.openWorkspaceFolder}>
              Open Folder
            </button>
          </section>
        ) : totalTileCount === 0 ? (
          <AppEmptyState
            title="Canvas is empty"
            description="Use the Add button in the top-right to create a note, folder, or rack. Paste a URL or image to import directly."
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            }
          />
        ) : hasActiveSearch && visibleTileCount === 0 ? (
          <AppEmptyState
            title={`No results for "${deferredSearchQuery.trim()}"`}
            description="Try a title, URL, note snippet, or tile type."
            actionLabel="Clear Search"
            onAction={() => { setSearchQuery(""); focusSearchInput(); }}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            }
          />
        ) : null}
      </div>

      <RadialContextMenu
        menu={radialMenu}
        actions={radialActions}
        onClose={interactions.closeContextMenu}
      />
      <NoteMagnifier
        card={magnifiedNoteCard}
        initialSplit={Boolean(interactions.magnifiedNoteState?.startSplit)}
        onClose={interactions.closeMagnifiedNote}
        onTextChange={commands.updateTile}
      />
    </main>
  );
}
