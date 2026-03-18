import { useEffect, useRef, useState } from "react";
import { formatCardSubtitle, NOTE_FOLDER_CARD_TYPE } from "../lib/workspace";
import NoteSurface from "./notes/NoteSurface";
import { getTextNoteInteraction } from "./notes/noteInteraction";
import {
  formatNoteTimestamp,
  getFolderNotePreview,
  getTextNoteVariant,
} from "./notes/noteUtils";

const DRAG_START_THRESHOLD = 8;

function formatShortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function getCardLabel(card) {
  if (card.type === "text") {
    return card.text.trim().slice(0, 28) || "Quick note";
  }

  if (card.type === NOTE_FOLDER_CARD_TYPE) {
    return card.title.trim() || "Daily memo";
  }

  return card.title.trim() || formatCardSubtitle(card);
}

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

export default function Card({
  card,
  isSelected = false,
  isMergeTarget = false,
  viewportZoom = 1,
  onMediaLoad,
  onContextMenu,
  onDragStart,
  onRequestTextNoteMagnify,
  onTextChange,
  onRetry,
}) {
  const articleRef = useRef(null);
  const pressStateRef = useRef(null);
  const [isFolderPeekOpen, setIsFolderPeekOpen] = useState(false);
  const isMusicCard = card.type === "link" && card.previewKind === "music" && Boolean(card.image);
  const isNoteFolderCard = card.type === NOTE_FOLDER_CARD_TYPE;
  const isTextCard = card.type === "text";
  const noteVariant = isTextCard ? getTextNoteVariant(card) : "";
  const textInteraction = isTextCard ? getTextNoteInteraction(viewportZoom) : null;
  const label = getCardLabel(card);
  const linkTitle = card.title || formatShortUrl(card.url) || "Untitled link";
  const noteTimestamp = isTextCard
    ? formatNoteTimestamp(card.updatedAt || card.createdAt)
    : null;
  const folderNotes = isNoteFolderCard
    ? card.notes.map((note) => ({
      ...note,
      preview: getFolderNotePreview(note),
    }))
    : [];
  const folderTitle = isNoteFolderCard ? (card.title || "Daily memo") : "";
  const folderDescription = isNoteFolderCard ? (card.description || "Notes & Journaling") : "";
  const folderCountLabel = isNoteFolderCard ? formatFolderCount(folderNotes.length) : "";
  const surfaceFrameClassName = [
    "card__surface-frame",
    (textInteraction?.dragMode === "surface" || card.type === "link" || isNoteFolderCard)
      ? "card__surface-frame--interactive"
      : "",
    noteVariant === "note1" ? "card__surface-frame--note1" : "",
    noteVariant === "note2" ? "card__surface-frame--note2" : "",
    noteVariant === "note3" ? "card__surface-frame--note3" : "",
    isSelected ? "card__surface-frame--selected" : "",
    isMusicCard ? "card__surface-frame--music" : "",
    isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setIsFolderPeekOpen(false);
  }, [card.id, card.type]);

  useEffect(() => {
    if (!(isNoteFolderCard && isFolderPeekOpen)) {
      return undefined;
    }

    function closeOnOutsidePointerDown(event) {
      if (articleRef.current?.contains(event.target)) {
        return;
      }

      setIsFolderPeekOpen(false);
    }

    window.addEventListener("pointerdown", closeOnOutsidePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
    };
  }, [isFolderPeekOpen, isNoteFolderCard]);

  function beginPress(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    pressStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hasTriggeredDrag: false,
      target: event.currentTarget,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function clearPressState(event) {
    const pressState = pressStateRef.current;

    if (!pressState) {
      return null;
    }

    if (event && pressState.pointerId !== event.pointerId) {
      return null;
    }

    pressState.target?.releasePointerCapture?.(pressState.pointerId);
    pressStateRef.current = null;
    return pressState;
  }

  function handlePressMove(event) {
    const pressState = pressStateRef.current;

    if (!pressState || pressState.pointerId !== event.pointerId || pressState.hasTriggeredDrag) {
      return;
    }

    const deltaX = event.clientX - pressState.startX;
    const deltaY = event.clientY - pressState.startY;

    if (Math.hypot(deltaX, deltaY) < DRAG_START_THRESHOLD) {
      return;
    }

    pressState.hasTriggeredDrag = true;
    onDragStart(card, event);
  }

  function handlePressUp(event) {
    const pressState = clearPressState(event);

    if (!pressState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (pressState.hasTriggeredDrag) {
      return;
    }

    if (isNoteFolderCard) {
      setIsFolderPeekOpen((currentValue) => !currentValue);
      return;
    }

    if (card.type === "link") {
      window.open(card.url, "_blank", "noopener,noreferrer");
    }
  }

  function handlePressCancel(event) {
    clearPressState(event);
  }

  function preventNativeDrag(event) {
    event.preventDefault();
  }

  function handleImageLoad(event) {
    if (typeof onMediaLoad !== "function") {
      return;
    }

    onMediaLoad(
      event.currentTarget.naturalWidth,
      event.currentTarget.naturalHeight,
    );
  }

  const dragGestureProps = {
    onPointerDown: beginPress,
    onPointerMove: handlePressMove,
    onPointerUp: handlePressUp,
    onPointerCancel: handlePressCancel,
  };
  const noteSurfaceProps = isTextCard && textInteraction.dragMode === "surface"
    ? {
      ...dragGestureProps,
      onDoubleClick: textInteraction.canMagnify
        ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          onRequestTextNoteMagnify?.(card.id);
        }
        : undefined,
    }
    : isTextCard && textInteraction.canMagnify
      ? {
        onDoubleClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          onRequestTextNoteMagnify?.(card.id);
        },
      }
      : null;
  const noteHeaderProps = isTextCard && textInteraction.dragMode === "header"
    ? dragGestureProps
    : null;

  return (
    <article
      ref={articleRef}
      className={[
        "card",
        `card--${card.type}`,
        isNoteFolderCard && isFolderPeekOpen ? "card--note-folder-open" : "",
        isSelected ? "card--selected" : "",
        isMusicCard ? "card--music" : "",
        isMergeTarget ? "card--merge-target" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: `${card.width}px`,
        transform: `translate(${card.x}px, ${card.y}px)`,
      }}
      onContextMenu={(event) => onContextMenu(card, event)}
      onDragStart={preventNativeDrag}
    >
      {card.type === "link" ? (
        <div
          className="card__toolbar"
          onPointerDown={(event) => onDragStart(card, event)}
        >
          <p className="card__label">{label}</p>
        </div>
      ) : null}

      {isTextCard ? (
        <div className={surfaceFrameClassName}>
          <NoteSurface
            card={card}
            mode={textInteraction.mode}
            noteTimestamp={noteTimestamp}
            onTextChange={onTextChange}
            surfaceProps={noteSurfaceProps}
            headerProps={noteHeaderProps}
            onRequestMagnify={onRequestTextNoteMagnify}
          />
        </div>
      ) : isNoteFolderCard ? (
        <div className="card__content">
          <div
            className={surfaceFrameClassName}
            {...dragGestureProps}
          >
            <div
              className={`card__surface card__surface--folder${isFolderPeekOpen ? " card__surface--folder-open" : ""}`}
              style={{ height: `${card.height}px` }}
            >
              {isFolderPeekOpen ? (
                <div
                  className="card__folder-glimpse"
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                >
                  <div className="card__folder-glimpse-scroll">
                    {folderNotes.map((note, index) => (
                      <article
                        key={note.id}
                        className="card__folder-note"
                      >
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
      ) : (
        <div className="card__content">
          <div
            className={surfaceFrameClassName}
            {...dragGestureProps}
          >
            <a
              className={`card__surface card__surface--link${isMusicCard ? " card__surface--music" : ""}`}
              href={card.url}
              target="_blank"
              rel="noreferrer"
              title={linkTitle}
              aria-label={`Open ${linkTitle}`}
              style={{ height: `${card.height}px` }}
              draggable={false}
              onClick={(event) => event.preventDefault()}
              onDragStart={preventNativeDrag}
            >
              {isMusicCard ? (
                <div className="card__record-shell">
                  <div
                    className="card__record-disc"
                    aria-hidden="true"
                  />
                  <div className="card__record-sleeve">
                    <img
                      className="card__image card__image--music"
                      src={card.image}
                      alt={linkTitle}
                      draggable={false}
                      onLoad={handleImageLoad}
                      onDragStart={preventNativeDrag}
                    />
                  </div>
                </div>
              ) : card.image ? (
                <img
                  className="card__image"
                  src={card.image}
                  alt={linkTitle}
                  draggable={false}
                  onLoad={handleImageLoad}
                  onDragStart={preventNativeDrag}
                />
              ) : (
                <div className="card__placeholder">
                  <p className="card__placeholder-title">{linkTitle}</p>
                  <p className="card__placeholder-subtitle">{formatShortUrl(card.url)}</p>
                </div>
              )}
            </a>
          </div>

          {card.status === "failed" ? (
            <button
              className="card__retry"
              type="button"
              onClick={() => onRetry(card)}
            >
              Retry preview
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}
