import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Card from "./components/Card";
import { DevConsole } from "./components/DevConsole";
import TileContextMenu from "./components/TileContextMenu";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useCanvas } from "./hooks/useCanvas";
import { useLog } from "./hooks/useLog";
import { useToast } from "./hooks/useToast";
import { isEditableElement, isUrl } from "./lib/workspace";
import { filterTiles } from "./utils/searchTiles";

function folderNameFromPath(folderPath) {
  if (!folderPath) return "No folder";
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

function IconNote() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
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

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default function App() {
  const usesCustomTitlebar = window.electronAPI?.usesCustomTitlebar === true;
  const [searchQuery, setSearchQuery] = useState("");
  const {
    booting,
    createNewLinkCard,
    error,
    deleteExistingCard,
    folderLoading,
    folderPath,
    openFolder,
    setError,
    workspace,
    setViewport,
    createNewTextCard,
    updateExistingCard,
  } = useAppContext();

  const { log } = useLog();
  const { toast } = useToast();

  const {
    containerRef,
    getViewportCenter,
    handleCanvasPointerDown,
    handleCanvasWheel,
  } = useCanvas({
    viewport: workspace.viewport,
    onViewportChange: setViewport,
  });
  const dragStateRef = useRef(null);
  const searchInputRef = useRef(null);
  const contextMenuRef = useRef(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [contextMenu, setContextMenu] = useState(null);

  useEffect(() => {
    if (error) {
      log("error", error);
      toast("error", error);
      setError("");
    }
  }, [error, log, toast, setError]);

  useEffect(() => {
    setSearchQuery("");
  }, [folderPath]);

  useEffect(() => {
    setContextMenu(null);
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

      if (event.key === "Escape" && contextMenu) {
        event.preventDefault();
        setContextMenu(null);
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
  }, [contextMenu, focusSearchInput, searchQuery]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    function closeOnPointerDown(event) {
      if (contextMenuRef.current?.contains(event.target)) {
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

  const triggerPreview = useCallback(async (card) => {
    log("info", "Fetching link preview...", { url: card.url, cardId: card.id });
    try {
      await window.airpaste.fetchLinkPreview(folderPath, card.id, card.url, card);
      log("success", `Preview queued for "${card.url}"`);
    } catch (previewError) {
      const msg = previewError.message || "Unable to fetch preview metadata.";
      updateExistingCard(card.id, { status: "failed" });
      log("error", `Preview failed for "${card.url}"`, msg);
      toast("error", `Preview failed: ${msg}`);
    }
  }, [folderPath, log, toast, updateExistingCard]);

  useEffect(() => {
    function handlePaste(event) {
      if (isEditableElement(document.activeElement)) return;

      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      event.preventDefault();

      if (!folderPath) {
        log("warn", "Paste blocked because no folder is open");
        toast("warn", "Open a folder first so AirPaste knows where to save the board.");
        return;
      }

      const centerPoint = getViewportCenter();

      if (isUrl(text)) {
        log("info", "Pasted URL into canvas center", { url: text, centerPoint });
        const card = createNewLinkCard(text, centerPoint);
        toast("info", "Link pasted into the center. Fetching preview...");
        void triggerPreview(card);
        return;
      }

      log("success", "Pasted text note into canvas center", { length: text.length, centerPoint });
      createNewTextCard(text, centerPoint);
      toast("success", "Text note dropped into the center of the canvas.");
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [createNewLinkCard, createNewTextCard, folderPath, getViewportCenter, log, toast, triggerPreview]);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!dragStateRef.current) return;

      const deltaX = (event.clientX - dragStateRef.current.pointerX) / workspace.viewport.zoom;
      const deltaY = (event.clientY - dragStateRef.current.pointerY) / workspace.viewport.zoom;

      updateExistingCard(dragStateRef.current.cardId, {
        x: dragStateRef.current.originX + deltaX,
        y: dragStateRef.current.originY + deltaY,
      });
    }

    function handlePointerUp() {
      if (dragStateRef.current) {
        log("info", "Card moved", { cardId: dragStateRef.current.cardId });
        dragStateRef.current = null;
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [log, updateExistingCard, workspace.viewport.zoom]);

  const handleCardDragStart = useCallback((card, event) => {
    setContextMenu(null);

    const isPrimaryPointer = event.button === 0 || event.buttons === 1;

    if (!isPrimaryPointer) return;
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      cardId: card.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: card.x,
      originY: card.y,
    };
  }, []);

  const handleCardContextMenu = useCallback((card, event) => {
    event.preventDefault();
    event.stopPropagation();

    const MENU_WIDTH = 376;
    const MENU_HEIGHT = 340;
    const VIEWPORT_PADDING = 16;
    const nextX = Math.min(
      event.clientX,
      window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING,
    );
    const nextY = Math.min(
      event.clientY,
      window.innerHeight - MENU_HEIGHT - VIEWPORT_PADDING,
    );

    setContextMenu({
      card,
      x: Math.max(VIEWPORT_PADDING, nextX),
      y: Math.max(VIEWPORT_PADDING, nextY),
    });
  }, []);

  const handleOpenFolder = useCallback(async () => {
    log("info", "Opening folder picker...");
    try {
      const selectedPath = await openFolder();
      if (selectedPath) {
        log("success", `Folder opened: ${selectedPath}`);
        toast("success", `Folder opened: ${folderNameFromPath(selectedPath)}`);
      } else {
        log("warn", "Folder picker dismissed");
      }
    } catch (openError) {
      const msg = openError.message || "Could not open folder.";
      log("error", "Folder open failed", msg);
      toast("error", msg);
    }
  }, [log, openFolder, toast]);

  const handleNewTextCard = useCallback(() => {
    if (!folderPath) {
      log("warn", "New note blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return;
    }

    const centerPoint = getViewportCenter();
    log("success", "New blank text card created in canvas center", centerPoint);
    createNewTextCard("", centerPoint);
    toast("success", "Blank note dropped into the center.");
  }, [createNewTextCard, folderPath, getViewportCenter, log, toast]);

  const handleContextAction = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleDeleteFromContextMenu = useCallback((card) => {
    if (!card) {
      return;
    }

    try {
      deleteExistingCard(card.id);
      setContextMenu(null);
      log("info", `Deleted card ${card.id}`);
      toast("success", "Tile deleted.");
    } catch (deleteError) {
      const message = deleteError?.message || "Unable to delete this tile.";
      log("error", `Failed to delete card ${card.id}`, message);
      toast("error", message);
    }
  }, [deleteExistingCard, log, toast]);

  const totalTileCount = workspace.cards.length;
  const filteredTiles = useMemo(
    () => filterTiles(workspace.cards, deferredSearchQuery),
    [workspace.cards, deferredSearchQuery],
  );
  const visibleTileCount = filteredTiles.length;
  const hasActiveSearch = deferredSearchQuery.trim().length > 0;
  const zoomPct = Math.round(workspace.viewport.zoom * 100);
  const folderLabel = folderPath ? folderNameFromPath(folderPath) : "No folder selected";
  const showSearchHud = Boolean(folderPath || totalTileCount > 0);
  const tileCountLabel = hasActiveSearch
    ? `${visibleTileCount} of ${totalTileCount} tiles`
    : `${totalTileCount} ${totalTileCount === 1 ? "tile" : "tiles"}`;
  const sidebarEyebrow = folderPath ? "Workspace" : "Setup";
  const sidebarLabel = folderPath ? folderLabel : "Open folder";
  const sidebarMeta = folderPath
    ? tileCountLabel
    : "Choose a local folder, then paste links or notes onto the board.";

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
              onClick={() => window.electronAPI?.minimize?.()}
            >
              <IconMinus />
            </button>
            <button
              id="titlebar-close"
              className="titlebar__icon-btn titlebar__icon-btn--close"
              type="button"
              title="Close"
              onClick={() => window.electronAPI?.close?.()}
            >
              <IconClose />
            </button>
          </div>
        </header>
      ) : null}

      <div className="workspace-shell">
        <aside className="side-nav">
          <div className="side-nav__brand" aria-label="AirPaste">
            <span className="side-nav__brand-mark">
              <span className="side-nav__brand-core" />
            </span>
            <span className="side-nav__brand-copy">AirPaste</span>
          </div>

          <div className="side-nav__actions">
            <button
              id="side-nav-open-folder"
              className="side-nav__action side-nav__action--primary"
              type="button"
              onClick={handleOpenFolder}
              disabled={folderLoading}
              aria-label={folderLoading ? "Opening folder" : "Open folder"}
              title={folderLoading ? "Opening folder" : "Open folder"}
            >
              <IconFolder />
            </button>
            <button
              id="side-nav-new-note"
              className="side-nav__action"
              type="button"
              onClick={handleNewTextCard}
              disabled={!folderPath}
              aria-label="Create note"
              title="Create note"
            >
              <IconNote />
            </button>
            <button
              id="side-nav-search"
              className="side-nav__action"
              type="button"
              onClick={focusSearchInput}
              disabled={!showSearchHud}
              aria-label="Focus search"
              title="Focus search (Ctrl+K)"
            >
              <IconSearch />
            </button>
          </div>

          <div className="side-nav__footer">
            <p className="side-nav__eyebrow">{sidebarEyebrow}</p>
            <p className="side-nav__label">{sidebarLabel}</p>
            <p className="side-nav__meta">{sidebarMeta}</p>
            <p className="side-nav__shortcut">Ctrl+V add, Ctrl+K search</p>
            <p className="side-nav__zoom">{zoomPct}% zoom</p>
          </div>
        </aside>

        <main className="canvas-stage">
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

          <div
            ref={containerRef}
            id="canvas-board"
            className="canvas"
            tabIndex={-1}
            onPointerDown={handleCanvasPointerDown}
            onWheel={handleCanvasWheel}
            onClick={(event) => {
              if (!isEditableElement(event.target)) {
                event.currentTarget.focus({ preventScroll: true });
              }
            }}
          >
            <div
              className="canvas__grid"
              style={{
                backgroundSize: `${28 * workspace.viewport.zoom}px ${28 * workspace.viewport.zoom}px`,
                backgroundPosition: `${workspace.viewport.x}px ${workspace.viewport.y}px`,
              }}
            />
            <div
              className="canvas__content"
              style={{
                transform: `translate(${workspace.viewport.x}px, ${workspace.viewport.y}px) scale(${workspace.viewport.zoom})`,
              }}
            >
              {filteredTiles.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  onContextMenu={handleCardContextMenu}
                  onDragStart={handleCardDragStart}
                  onTextChange={(cardId, nextText) => {
                    updateExistingCard(cardId, { text: nextText });
                  }}
                  onRetry={(nextCard) => {
                    log("info", `Retrying preview for card ${nextCard.id}`);
                    toast("info", "Retrying link preview...");
                    updateExistingCard(nextCard.id, { status: "loading" });
                    void triggerPreview(nextCard);
                  }}
                />
              ))}
            </div>

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
                  onClick={handleOpenFolder}
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
                <p>Hold Ctrl and scroll to zoom. Drag on empty space to pan around the board.</p>
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
      </div>

      <TileContextMenu
        menu={contextMenu}
        menuRef={contextMenuRef}
        onAction={handleContextAction}
        onDelete={handleDeleteFromContextMenu}
      />
      <ToastStack />
      <DevConsole />
    </div>
  );
}
