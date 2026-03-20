import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Card from "./Card";
import CanvasDock from "./CanvasDock";
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
import { useTileLayoutSystem } from "../systems/layout/useTileLayoutSystem";
import { useTheme } from "../hooks/useTheme";
import { filterTiles } from "../utils/searchTiles";
import { folderNameFromPath } from "../lib/home";

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
  const { theme, toggleTheme } = useTheme();
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

  const canvas = useCanvasSystem({
    viewport: workspace.viewport,
    onViewportChange: setViewport,
  });

  const commands = useCanvasCommands({
    folderPath,
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

    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, []);

  useEffect(() => {
    async function handlePaste(event) {
      if (isEditableElement(document.activeElement)) {
        return;
      }

      await commands.pasteFromClipboard(event);
    }

    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("paste", handlePaste);
    };
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

      if (editingAnotherField) {
        return;
      }

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

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canvas, commands, focusSearchInput, interactions, searchQuery, zoomToFitAll]);

  const totalTileCount = workspace.cards.length;
  const visibleTileCount = layout.rootTiles.length;
  const hasActiveSearch = deferredSearchQuery.trim().length > 0;
  const zoomPct = Math.round(workspace.viewport.zoom * 100);
  const folderLabel = folderPath ? folderNameFromPath(folderPath) : "No folder selected";
  const showSearchHud = Boolean(folderPath || totalTileCount > 0);
  const tileCountLabel = hasActiveSearch
    ? `${visibleTileCount} of ${totalTileCount} tiles`
    : `${totalTileCount} ${totalTileCount === 1 ? "tile" : "tiles"}`;
  const workspaceHudLabel = folderPath
    ? `${folderLabel} · ${currentEditor.name || "Canvas"} · ${tileCountLabel} · ${zoomPct}% zoom`
    : "Choose a local folder to start saving notes, links, and images.";
  const magnifiedNoteCard = interactions.magnifiedNoteState
    ? workspace.cards.find((tile) => tile.id === interactions.magnifiedNoteState.cardId && tile.type === "text") ?? null
    : null;

  return (
    <main className="canvas-stage">
      <div className="canvas-hud canvas-hud--top-left">
        <div className="canvas-hud__actions">
          <button
            className="hud-chip hud-chip--action"
            type="button"
            onClick={() => void showHome()}
          >
            <IconHome />
            <span>Home</span>
          </button>
          <button
            id="canvas-open-folder-hud"
            className="hud-chip hud-chip--action"
            type="button"
            onClick={commands.openWorkspaceFolder}
            disabled={folderLoading}
          >
            <IconFolder />
            <span>{folderLoading ? "Opening..." : "Switch Workspace"}</span>
          </button>
          <button
            className="hud-chip"
            type="button"
            onClick={toggleTheme}
          >
            <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
          </button>
          <span className="hud-stat" title={folderPath || workspaceHudLabel}>
            {workspaceHudLabel}
          </span>
        </div>
        <p className="canvas-hud__hint">Scroll to zoom, middle-drag to pan, Ctrl or Cmd + drag or right-drag to multi-select.</p>
      </div>

      <div className="canvas-hud canvas-hud--top-right">
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
      </div>

      {showSearchHud ? (
        <div className="canvas-hud canvas-hud--top-center">
          <div className="search-panel">
            <div className="search-shell">
              <input
                id="tile-search"
                ref={searchInputRef}
                className="search-shell__input"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search tiles"
              />
              {searchQuery ? (
                <button
                  className="search-shell__clear"
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    focusSearchInput();
                  }}
                >
                  Clear
                </button>
              ) : (
                <span className="search-shell__meta">Ctrl+K</span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="canvas-hud canvas-hud--bottom-center">
        <CanvasDock commands={commands} />
      </div>

      <div
        ref={canvas.containerRef}
        id="canvas-board"
        className={`canvas${interactions.marqueeBox ? " canvas--selecting" : ""}`}
        tabIndex={-1}
        onPointerDown={interactions.handleCanvasPointerDown}
        onDoubleClick={interactions.handleCanvasDoubleClick}
        onContextMenu={interactions.handleCanvasContextMenu}
        onWheel={canvas.handleCanvasWheel}
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

        {folderPath && totalTileCount === 0 ? (
          <section className="canvas__callout canvas__callout--subtle">
            <p className="canvas__eyebrow">Canvas ready</p>
            <h2>Press Ctrl+V to drop your first link or note into the center.</h2>
            <p>Use the bottom dock for note types. Scroll anywhere on the canvas to zoom.</p>
          </section>
        ) : null}

        {folderPath && totalTileCount > 0 && hasActiveSearch && visibleTileCount === 0 ? (
          <section className="canvas__callout canvas__callout--subtle">
            <p className="canvas__eyebrow">Search</p>
            <h2>No tiles match &ldquo;{deferredSearchQuery.trim()}&rdquo;.</h2>
            <p>Try a title, URL, note snippet, site name, or tile type.</p>
            <button
              className="button"
              type="button"
              onClick={() => {
                setSearchQuery("");
                focusSearchInput();
              }}
            >
              Clear Search
            </button>
          </section>
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
