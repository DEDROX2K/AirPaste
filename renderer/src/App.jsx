import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Card from "./components/Card";
import CanvasDock from "./components/CanvasDock";
import { DevConsole } from "./components/DevConsole";
import NoteMagnifier from "./components/notes/NoteMagnifier";
import TileContextMenu from "./components/TileContextMenu";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useLog } from "./hooks/useLog";
import { useToast } from "./hooks/useToast";
import { isEditableElement } from "./lib/workspace";
import { desktop } from "./lib/desktop";
import { useCanvasSystem } from "./systems/canvas/useCanvasSystem";
import { useCanvasCommands } from "./systems/commands/useCanvasCommands";
import { useCanvasInteractionSystem } from "./systems/interactions/useCanvasInteractionSystem";
import { useTileLayoutSystem } from "./systems/layout/useTileLayoutSystem";
import { useTheme } from "./hooks/useTheme";
import { filterTiles } from "./utils/searchTiles";

function folderNameFromPath(folderPath) {
  if (!folderPath) {
    return "No folder";
  }

  const segments = folderPath.split(/[\\/]/);
  return segments[segments.length - 1] || folderPath;
}

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect y="4.5" width="10" height="1" rx="0.5" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const usesCustomTitlebar = desktop.window.usesCustomTitlebar;
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const { theme, toggleTheme } = useTheme();

  const {
    booting,
    error,
    folderLoading,
    folderPath,
    openFolder,
    setError,
    workspace,
    setViewport,
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
    openFolderDialog: openFolder,
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
    if (!error) {
      return;
    }

    log("error", error);
    toast("error", error);
    setError("");
  }, [error, log, setError, toast]);

  useEffect(() => {
    setSearchQuery("");
  }, [folderPath]);

  const focusSearchInput = useCallback(() => {
    const input = searchInputRef.current;

    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      const activeElement = document.activeElement;
      const editingAnotherField = isEditableElement(activeElement) && activeElement !== searchInputRef.current;

      if (event.key === "Escape" && interactions.contextMenu) {
        event.preventDefault();
        interactions.closeContextMenu();
        return;
      }

      if (editingAnotherField) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearchInput();
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
  }, [focusSearchInput, interactions, searchQuery]);

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
    ? `${folderLabel} · ${tileCountLabel} · ${zoomPct}% zoom`
    : "Choose a local folder to start saving notes, links, and images.";
  const magnifiedNoteCard = interactions.magnifiedNoteState
    ? workspace.cards.find((tile) => tile.id === interactions.magnifiedNoteState.cardId && tile.type === "text") ?? null
    : null;

  if (booting) {
    return (
      <div className="app-shell app-shell--booting">
        <div className="launch-panel">
          <p className="launch-panel__eyebrow">AirPaste</p>
          <h1>Restoring your canvas</h1>
          <p>Reopening the last local workspace if one is available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${usesCustomTitlebar ? "app-shell--custom-titlebar" : "app-shell--native-frame"}`}>
      {usesCustomTitlebar ? (
        <header className="titlebar">
          <div className="titlebar__spacer" />
          <div className="titlebar__actions">
            <button
              id="titlebar-minimize"
              className="titlebar__icon-btn titlebar__icon-btn--min"
              type="button"
              title="Minimize"
              onClick={() => desktop.window.minimize()}
            >
              <IconMinus />
            </button>
            <button
              id="titlebar-close"
              className="titlebar__icon-btn titlebar__icon-btn--close"
              type="button"
              title="Close"
              onClick={() => desktop.window.close()}
            >
              <IconClose />
            </button>
          </div>
        </header>
      ) : null}

      <main className="canvas-stage">
        <div className="canvas-hud canvas-hud--top-left">
          <div className="canvas-hud__actions">
            <button
              id="canvas-open-folder-hud"
              className="hud-chip hud-chip--action"
              type="button"
              onClick={commands.openWorkspaceFolder}
              disabled={folderLoading}
            >
              <IconFolder />
              <span>{folderLoading ? "Opening..." : folderPath ? "Switch Folder" : "Open Folder"}</span>
            </button>
            <button
              className="hud-chip"
              type="button"
              onClick={toggleTheme}
            >
              <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
            </button>
            <button
              className="hud-chip"
              type="button"
              onClick={() => canvas.zoomToBounds(layout.allTilesBounds)}
              disabled={!layout.allTilesBounds}
            >
              Fit All
            </button>
            <button
              className="hud-chip"
              type="button"
              onClick={() => canvas.zoomToBounds(layout.selectedTilesBounds)}
              disabled={!layout.selectedTilesBounds}
            >
              Fit Selection
            </button>
            <span className="hud-stat" title={folderPath || workspaceHudLabel}>
              {workspaceHudLabel}
            </span>
          </div>
          <p className="canvas-hud__hint">Scroll to zoom, middle-drag to pan, Ctrl or Cmd + drag or right-drag to multi-select.</p>
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

          {!folderPath ? (
            <section className="canvas__callout">
              <p className="canvas__eyebrow">Local-first board</p>
              <h1>Open a folder, then paste straight into the canvas.</h1>
              <p>
                URLs become rich preview tiles. Plain text becomes simple notes.
                Everything stays inside that folder.
              </p>
              <button
                id="canvas-open-folder"
                className="button button--primary"
                type="button"
                onClick={commands.openWorkspaceFolder}
                disabled={folderLoading}
              >
                {folderLoading ? "Opening..." : "Choose Folder"}
              </button>
            </section>
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
      </main>

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
      <ToastStack />
      <DevConsole />
    </div>
  );
}
