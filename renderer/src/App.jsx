import { useCallback, useEffect, useRef, useState } from "react";
import Card from "./components/Card";
import { DevConsole } from "./components/DevConsole";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useCanvas } from "./hooks/useCanvas";
import { useLog } from "./hooks/useLog";
import { useToast } from "./hooks/useToast";
import { isEditableElement, isUrl } from "./lib/workspace";

const THEME_STORAGE_KEY = "airpaste.theme";

function readInitialTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "night" ? "night" : "dark";
  } catch {
    return "dark";
  }
}

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

export default function App() {
  const usesCustomTitlebar = window.electronAPI?.usesCustomTitlebar === true;
  const [theme, setTheme] = useState(readInitialTheme);
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write failures in restricted environments.
    }
  }, [theme]);

  useEffect(() => {
    if (error) {
      log("error", error);
      toast("error", error);
      setError("");
    }
  }, [error, log, toast, setError]);

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

  const handleThemeToggle = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "night" : "dark"));
  }, []);

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

  const cardCount = workspace.cards.length;
  const zoomPct = Math.round(workspace.viewport.zoom * 100);
  const folderLabel = folderPath ? folderNameFromPath(folderPath) : "No folder selected";

  return (
    <div className={`app-shell ${usesCustomTitlebar ? "app-shell--custom-titlebar" : "app-shell--native-frame"}`}>
      {usesCustomTitlebar ? (
        <header className="titlebar">
          <div className="titlebar__brand">
            <span className="titlebar__brand-dot" />
            AirPaste
          </div>
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

      <main className="canvas-stage">
        <div className="canvas-hud canvas-hud--top-left">
          <div className="brand-chip">
            <span className="brand-chip__dot" />
            <span>AirPaste</span>
          </div>
          <div className="canvas-hud__actions">
            <button
              id="hud-open-folder"
              className="hud-chip hud-chip--action"
              type="button"
              onClick={handleOpenFolder}
              disabled={folderLoading}
            >
              <IconFolder />
              {folderLoading ? "Opening..." : "Open Folder"}
            </button>
            <button
              id="hud-new-note"
              className="hud-chip"
              type="button"
              onClick={handleNewTextCard}
              disabled={!folderPath}
            >
              <IconNote />
              New Note
            </button>
          </div>
          <p className="canvas-hud__hint">
            {folderPath
              ? `${folderLabel} stores the canvas data locally as data.json.`
              : "Pick a folder, then paste links or notes directly onto the dotted field."}
          </p>
        </div>

        <div className="canvas-hud canvas-hud--top-right">
          <span className="hud-stat">{folderLabel}</span>
          <span className="hud-stat">{cardCount} {cardCount === 1 ? "tile" : "tiles"}</span>
          <span className="hud-stat">{zoomPct}%</span>
        </div>

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

          {folderPath && cardCount === 0 ? (
            <section className="canvas__callout canvas__callout--subtle">
              <p className="canvas__eyebrow">Canvas ready</p>
              <h2>Press Ctrl+V to drop your first link or note into the center.</h2>
              <p>Hold Ctrl and scroll to zoom. Drag on empty space to pan around the board.</p>
            </section>
          ) : null}
        </div>

        <button
          id="theme-toggle"
          className={`theme-toggle theme-toggle--${theme}`}
          type="button"
          onClick={handleThemeToggle}
          aria-label={`Switch to ${theme === "dark" ? "night" : "dark"} mode`}
          title={theme === "dark" ? "Switch to night mode" : "Switch to dark mode"}
        >
          <span className="theme-toggle__core" />
          <span className="theme-toggle__orbit" />
        </button>
      </main>

      <ToastStack />
      <DevConsole />
    </div>
  );
}
