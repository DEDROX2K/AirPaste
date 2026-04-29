import { memo, useMemo } from "react";
import { useAppContext } from "../../context/useAppContext";
import { renderSimpleMarkdown } from "../../lib/renderSimpleMarkdown";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

function detectLanguageHints(body) {
  const matches = String(body ?? "").match(/```([a-z0-9_+-]+)/gi) ?? [];

  return [...new Set(
    matches
      .map((match) => match.replace("```", "").trim().toLowerCase())
      .filter((hint) => hint.length > 0),
  )];
}

function NoteTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
}) {
  const { updateExistingCard } = useAppContext();
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const isPreviewMode = card.mode === "preview";
  const markdownPreview = useMemo(() => renderSimpleMarkdown(card.body ?? ""), [card.body]);
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const updateNote = (patch) => {
    updateExistingCard(card.id, patch);
  };

  const toggleMode = (nextMode) => {
    updateNote({ mode: nextMode });
  };

  const handleBodyKeyDown = (event) => {
    stopInteractiveKey(event);

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      toggleMode(isPreviewMode ? "edit" : "preview");
      return;
    }

    if (event.key === "Escape" && !isPreviewMode) {
      event.preventDefault();
      toggleMode("preview");
    }
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--note"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section className="card__surface card__surface--note" aria-label={card.title || "Note"}>
            <header className="card__note-header">
              <input
                className="card__note-title"
                type="text"
                value={card.title ?? ""}
                placeholder="Untitled note"
                aria-label="Note title"
                onPointerDown={stopInteractivePointer}
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateNote({ title: event.target.value })}
              />
              <div className="card__note-mode-toggle" onPointerDown={stopInteractivePointer}>
                <button
                  type="button"
                  className={`card__note-mode-button${!isPreviewMode ? " card__note-mode-button--active" : ""}`}
                  onClick={() => toggleMode("edit")}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={`card__note-mode-button${isPreviewMode ? " card__note-mode-button--active" : ""}`}
                  onClick={() => toggleMode("preview")}
                >
                  Preview
                </button>
              </div>
            </header>

            <div className="card__note-body-shell" onPointerDown={stopInteractivePointer}>
              {isPreviewMode ? (
                <div
                  className="card__note-preview"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleMode("edit")}
                  onKeyDown={handleBodyKeyDown}
                >
                  {String(card.body ?? "").trim().length > 0 ? (
                    markdownPreview
                  ) : (
                    <p className="card__note-empty">Click to start writing Markdown.</p>
                  )}
                </div>
              ) : (
                <textarea
                  className="card__note-editor"
                  value={card.body ?? ""}
                  placeholder={"# Heading\n\nWrite notes, code snippets, or future-me instructions here."}
                  aria-label="Markdown note body"
                  onKeyDown={handleBodyKeyDown}
                  onChange={(event) => updateNote({
                    body: event.target.value,
                    languageHints: detectLanguageHints(event.target.value),
                  })}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(NoteTile);
