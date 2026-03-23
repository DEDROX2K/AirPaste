import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Card from "./Card";
import CanvasAddMenu from "./CanvasAddMenu";
import CanvasZoomMenu from "./CanvasZoomMenu";
import NoteMagnifier from "./notes/NoteMagnifier";
import TileContextMenu from "./TileContextMenu";
import { useAppContext } from "../context/useAppContext";
import { useLog } from "../hooks/useLog";
import { useToast } from "../hooks/useToast";
import { isEditableElement } from "../lib/workspace";
import { useCanvasSystem } from "../systems/canvas/useCanvasSystem";
import { useCanvasCommands } from "../systems/commands/useCanvasCommands";
import { useCanvasInteractionSystem } from "../systems/interactions/useCanvasInteractionSystem";
import { useCanvasDropImport } from "../systems/import/useCanvasDropImport";
import { useTileLayoutSystem } from "../systems/layout/useTileLayoutSystem";
import { AppEmptyState } from "./ui/app";
import { useTheme } from "../hooks/useTheme";
import { filterTiles } from "../utils/searchTiles";
import { folderNameFromPath } from "../lib/home";
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

export default function CanvasWorkspaceView() {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const {
    currentEditor,
    folderLoading,
    folderPath,
    openExistingWorkspace,
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
    projectId: currentEditor.projectId,
    spaceId: currentEditor.spaceId,
    canvasId: currentEditor.itemId,
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
    viewportZoom: workspace.viewport.zoom,
  });

  useEffect(() => {
    setSearchQuery("");
  }, [currentEditor.itemId, folderPath]);

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

  const filteredTiles = useMemo(
    () => filterTiles(workspace.cards, deferredSearchQuery),
    [deferredSearchQuery, workspace.cards],
  );

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
  }, [canvas, commands, focusSearchInput, interactions, searchQuery, zoomToFitAll]);

  const totalTileCount = workspace.cards.length;
  const visibleTileCount = layout.rootTiles.length;
  const hasActiveSearch = deferredSearchQuery.trim().length > 0;
  const folderLabel = folderPath ? folderNameFromPath(folderPath) : null;
  const canvasName = currentEditor.name || "Canvas";
  const magnifiedNoteCard = interactions.magnifiedNoteState
    ? workspace.cards.find((tile) => tile.id === interactions.magnifiedNoteState.cardId && tile.type === TILE_TYPES.NOTE) ?? null
    : null;

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
          <CanvasAddMenu commands={commands} disabled={!folderPath || folderLoading} />
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
        className={`canvas${interactions.marqueeBox ? " canvas--selecting" : ""}${dropImport.isDropTarget ? " canvas--drop-target" : ""}`}
        tabIndex={-1}
        onDragEnter={dropImport.handleDragEnter}
        onDragOver={dropImport.handleDragOver}
        onDragLeave={dropImport.handleDragLeave}
        onDrop={(event) => { void dropImport.handleDrop(event); }}
        onPointerDown={interactions.handleCanvasPointerDown}
        onDoubleClick={interactions.handleCanvasDoubleClick}
        onContextMenu={interactions.handleCanvasContextMenu}
        onClick={(event) => {
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
              childTiles={layout.folderChildTilesByFolderId[card.id] ?? layout.rackTileChildrenByRackId[card.id] ?? []}
              folderState={layout.openFolderState?.folderId === card.id ? layout.openFolderState : null}
              rackState={layout.rackStateById[card.id] ?? null}
              expandedTileId={interactions.expandedTileId}
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
              onToggleExpanded={interactions.toggleExpandedTile}
              onToggleFolderOpen={commands.toggleFolder}
            />
          ))}
        </div>

        {interactions.marqueeBox ? (
          <div className="canvas__marquee" style={interactions.marqueeStyleVars} />
        ) : null}

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

      <TileContextMenu
        menu={interactions.contextMenu}
        onAction={interactions.closeContextMenu}
        onDelete={(menu) => {
          commands.deleteTiles(menu.selectionIds ?? [menu.card.id]);
          interactions.closeContextMenu();
        }}
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
