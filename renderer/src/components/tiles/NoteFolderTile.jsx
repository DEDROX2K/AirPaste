import { memo, useMemo } from "react";
import TileShell from "./TileShell";
import { getFolderNotePreview } from "../notes/noteUtils";
import { useTileGesture } from "../../systems/interactions/useTileGesture";

function formatFolderCount(noteCount) {
  return `${new Intl.NumberFormat().format(noteCount)} ${noteCount === 1 ? "note" : "notes"}`;
}

function IconDotsVertical() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-1 1a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.3a1.2 1.2 0 0 1-1.2 1.2h-1.4a1.2 1.2 0 0 1-1.2-1.2v-.2a1 1 0 0 0-.7-1 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-1-1a1.2 1.2 0 0 1 0-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6h-.3A1.2 1.2 0 0 1 2 13.4V12a1.2 1.2 0 0 1 1.2-1.2h.2a1 1 0 0 0 1-.7 1 1 0 0 0-.2-1.1L4 8.9a1.2 1.2 0 0 1 0-1.7l1-1a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9v-.3A1.2 1.2 0 0 1 9.8 4h1.4a1.2 1.2 0 0 1 1.2 1.2v.2a1 1 0 0 0 .7 1h.1a1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l1 1a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.3A1.2 1.2 0 0 1 22 10.6V12a1.2 1.2 0 0 1-1.2 1.2h-.2a1 1 0 0 0-1 .7z" />
    </svg>
  );
}

function NoteFolderTile({
  card,
  tileMeta,
  isExpanded,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  onToggleExpanded,
}) {
  const folderNotes = useMemo(() => card.notes.map((note) => ({
    ...note,
    preview: getFolderNotePreview(note),
  })), [card.notes]);
  const folderTitle = card.title || "Daily memo";
  const folderDescription = card.description || "Notes & Journaling";
  const folderCountLabel = formatFolderCount(folderNotes.length);
  const dragGesture = useTileGesture({
    card,
    onActivate: () => onToggleExpanded(card.id),
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <TileShell
      card={card}
      tileMeta={{ ...tileMeta, isExpanded }}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...dragGesture}>
          <div className={`card__surface card__surface--folder${isExpanded ? " card__surface--folder-open" : ""}`}>
            {isExpanded ? (
              <div
                className="card__folder-glimpse"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                <div className="card__folder-glimpse-scroll">
                  {folderNotes.map((note, index) => (
                    <article key={note.id} className="card__folder-note">
                      <p className="card__folder-note-kicker">Note {index + 1}</p>
                      <h4 className="card__folder-note-title">{note.preview.title}</h4>
                      <p className="card__folder-note-snippet">{note.preview.snippet}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="card__folder-backdrop" aria-hidden="true">
              <div className="card__folder-tab" />
              <div className="card__folder-paper card__folder-paper--rear" />
              <div className="card__folder-paper card__folder-paper--front" />
            </div>

            <div className="card__folder-front">
              <div className="card__folder-header">
                <div className="card__folder-copy">
                  <h3 className="card__folder-title">{folderTitle}</h3>
                  <p className="card__folder-subtitle">{folderDescription}</p>
                </div>

                <div className="card__folder-actions" aria-hidden="true">
                  <span className="card__folder-action">
                    <IconDotsVertical />
                  </span>
                  <span className="card__folder-action">
                    <IconGear />
                  </span>
                </div>
              </div>

              <p className="card__folder-count">{folderCountLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(NoteFolderTile);
