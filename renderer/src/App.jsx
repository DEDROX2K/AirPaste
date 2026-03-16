import { useCallback, useEffect, useRef } from "react";
import Card from "./components/Card";
import { DevConsole } from "./components/DevConsole";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useCanvas } from "./hooks/useCanvas";
import { useLog } from "./hooks/useLog";
import { useToast } from "./hooks/useToast";
import { isEditableElement, isUrl } from "./lib/workspace";

function folderNameFromPath(folderPath) {
  if (!folderPath) return "No folder";
  const segments = folderPath.split(/[\\/]/);
  return segments[segments.length - 1] || folderPath;
}

/* ── SVG icon primitives ──────────────────────────── */
function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconNote() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconMinus() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect y="4.5" width="10" height="1" rx="0.5"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export default function App() {
  const usesCustomTitlebar = window.electronAPI?.usesCustomTitlebar === true;
  const {
    booting,
    error,
    folderLoading,
    folderPath,
    openFolder,
    setError,
    workspace,
    setViewport,
    createNewTextCard,
    createNewLinkCard,
    updateExistingCard,
  } = useAppContext();

  const { log } = useLog();
  const { toast } = useToast();

  const { containerRef, handleCanvasPointerDown, handleCanvasWheel } = useCanvas({
    viewport: workspace.viewport,
    onViewportChange: setViewport,
  });
  const dragStateRef = useRef(null);

  /* Surface AppProvider errors into toasts */
  useEffect(() => {
    if (error) {
      log("error", error);
      toast("error", error);
      setError("");
    }
  }, [error, log, toast, setError]);

  /* ── Link preview ─────────────────────────────── */
  const triggerPreview = useCallback(async (card) => {
    log("info", `Fetching link preview…`, { url: card.url, cardId: card.id });
    try {
      await window.airpaste.fetchLinkPreview(folderPath, card.id, card.url, card);
      log("success", `Preview queued for "${card.url}"`);
    } catch (previewError) {
      const msg = previewError.message || "Unable to fetch preview metadata.";
      updateExistingCard(card.id, { status: "failed" });
      log("error", `Preview failed for "${card.url}"`, msg);
      toast("error", `Preview failed — ${msg}`);
    }
  }, [folderPath, log, toast, updateExistingCard]);

  /* Preview updates pushed from main process */
  useEffect(() => {
    // Log when a card's preview status is updated by the main process
    // (AppProvider handles the state update; we just watch workspace changes)
  }, []);

  /* ── Paste handler ────────────────────────────── */
  useEffect(() => {
    function handlePaste(event) {
      if (isEditableElement(document.activeElement)) return;

      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      event.preventDefault();

      if (!folderPath) {
        log("warn", "Paste blocked — no folder open");
        toast("warn", "Open a folder first, then paste links or notes onto the board.");
        return;
      }

      if (isUrl(text)) {
        log("info", `Pasted URL → creating link card`, { url: text });
        const card = createNewLinkCard(text);
        toast("info", `Link card created — fetching preview…`);
        void triggerPreview(card);
        return;
      }

      log("success", `Pasted text → creating note card`, { length: text.length });
      createNewTextCard(text);
      toast("success", "Text note added to the board.");
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [createNewLinkCard, createNewTextCard, folderPath, log, toast, triggerPreview]);

  /* ── Card drag ────────────────────────────────── */
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
        log("info", `Card moved`, { cardId: dragStateRef.current.cardId });
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
    if (event.button !== 0) return;
    event.preventDefault();
    dragStateRef.current = {
      cardId: card.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: card.x,
      originY: card.y,
    };
  }, []);

  /* ── Folder open ──────────────────────────────── */
  const handleOpenFolder = useCallback(async () => {
    log("info", "Opening folder picker…");
    try {
      const path = await openFolder();
      if (path) {
        log("success", `Folder opened: ${path}`);
        toast("success", `Folder opened — ${folderNameFromPath(path)}`);
      } else {
        log("warn", "Folder picker dismissed — no folder selected");
      }
    } catch (err) {
      const msg = err.message || "Could not open folder.";
      log("error", `Folder open failed`, msg);
      toast("error", msg);
    }
  }, [log, openFolder, toast]);

  /* ── New text card ────────────────────────────── */
  const handleNewTextCard = useCallback(() => {
    if (!folderPath) {
      log("warn", "New card blocked — no folder open");
      toast("warn", "Open a folder first.");
      return;
    }
    log("success", "New blank text card created");
    createNewTextCard("");
    toast("success", "Blank note added to the board.");
  }, [createNewTextCard, folderPath, log, toast]);

  /* ── Booting state ────────────────────────────── */
  if (booting) {
    return (
      <div className={`app-shell app-shell--booting ${usesCustomTitlebar ? "" : "app-shell--native-frame"}`}>
        <div className="launch-panel">
          <p className="launch-panel__eyebrow">AirPaste</p>
          <h1>Restoring your canvas</h1>
          <p>Opening the last folder if one is available.</p>
        </div>
      </div>
    );
  }

  const cardCount = workspace.cards.length;
  const zoomPct = Math.round(workspace.viewport.zoom * 100);

  return (
    <div className={`app-shell ${usesCustomTitlebar ? "" : "app-shell--native-frame"}`}>

      {usesCustomTitlebar ? (
        <header className="titlebar">
          <div className="titlebar__brand">
            <span className="titlebar__brand-dot" />
            AirPaste
          </div>
          <div className="titlebar__actions">
            <button
              id="titlebar-settings"
              className="titlebar__icon-btn"
              type="button"
              title="Settings"
            >
              <IconSettings />
            </button>
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

      {/* ── Sidebar ────────────────────────────── */}
      <aside className="sidebar">
        <span className="sidebar__section-label">Workspace</span>

        <button
          id="sidebar-open-folder"
          className="sidebar__item sidebar__item--active"
          type="button"
          onClick={handleOpenFolder}
          disabled={folderLoading}
        >
          <span className="sidebar__item-icon"><IconFolder /></span>
          {folderLoading ? "Opening…" : (folderPath ? folderNameFromPath(folderPath) : "Open Folder")}
        </button>

        <button
          id="sidebar-new-note"
          className="sidebar__item"
          type="button"
          onClick={handleNewTextCard}
          disabled={!folderPath}
        >
          <span className="sidebar__item-icon"><IconNote /></span>
          New Text Card
        </button>

        <div className="sidebar__stats">
          <div>
            <p className="sidebar__stat-label">Cards</p>
            <p className="sidebar__stat-value">{cardCount}</p>
          </div>
          <div>
            <p className="sidebar__stat-label">Zoom</p>
            <p className="sidebar__stat-value">{zoomPct}%</p>
          </div>
        </div>

        <div className="sidebar__hint">
          <p>Paste with <kbd>Ctrl</kbd> + <kbd>V</kbd> on the board.</p>
          <p>Hold <kbd>Ctrl</kbd> and scroll to zoom.</p>
          <p style={{ marginTop: 6, opacity: 0.6 }}>
            Dev console: <kbd>Ctrl</kbd> + <kbd>`</kbd>
          </p>
        </div>
      </aside>

      {/* ── Main Workspace ─────────────────────── */}
      <main className="workspace">
        {!folderPath ? (
          <section className="empty-state">
            <p className="empty-state__eyebrow">Offline by default</p>
            <h2>Pick a folder — AirPaste creates <code>data.json</code> for you.</h2>
            <p>
              Every card, note, position, and preview stays inside that folder.
              No accounts, sync, or hidden databases.
            </p>
            <button
              id="empty-open-folder"
              className="button button--primary"
              type="button"
              onClick={handleOpenFolder}
              disabled={folderLoading}
            >
              {folderLoading ? "Opening…" : "Open Folder"}
            </button>
          </section>
        ) : (
          <>
            {/* Tab bar */}
            <header className="workspace__header">
              <div
                id="workspace-tab-active"
                className="workspace__tab workspace__tab--active"
              >
                <IconFolder />
                {folderNameFromPath(folderPath)}
              </div>
              <span className="workspace__meta">
                {cardCount === 0
                  ? "Empty board"
                  : `${cardCount} card${cardCount === 1 ? "" : "s"} · ${zoomPct}%`}
              </span>
            </header>

            {/* Canvas */}
            <div
              ref={containerRef}
              id="canvas-board"
              className="canvas"
              tabIndex={-1}
              onPointerDown={handleCanvasPointerDown}
              onWheel={handleCanvasWheel}
              onClick={(e) => {
                if (!isEditableElement(e.target)) {
                  e.currentTarget.focus({ preventScroll: true });
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
                {workspace.cards.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    onDragStart={handleCardDragStart}
                    onTextChange={(cardId, nextText) => {
                      updateExistingCard(cardId, { text: nextText });
                    }}
                    onRetry={(nextCard) => {
                      log("info", `Retrying preview for card ${nextCard.id}`);
                      toast("info", "Retrying link preview…");
                      updateExistingCard(nextCard.id, { status: "loading" });
                      void triggerPreview(nextCard);
                    }}
                  />
                ))}
              </div>

              {cardCount === 0 ? (
                <div className="canvas__empty">
                  <p className="canvas__empty-title">Blank board · local data.</p>
                  <p>Paste a URL for a preview card or paste text for a quick note.</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>

      {/* ── Toast stack ────────────────────────── */}
      <ToastStack />

      {/* ── Dev console ────────────────────────── */}
      <DevConsole />
    </div>
  );
}
