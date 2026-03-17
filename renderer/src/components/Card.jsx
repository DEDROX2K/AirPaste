import { useEffect, useRef, useState } from "react";
import { formatCardSubtitle } from "../lib/workspace";

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

  return card.title.trim() || formatCardSubtitle(card);
}

export default function Card({
  card,
  isSelected = false,
  onMediaLoad,
  onContextMenu,
  onDragStart,
  onTextChange,
  onRetry,
}) {
  const articleRef = useRef(null);
  const pressStateRef = useRef(null);
  const textEditorRef = useRef(null);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const isMusicCard = card.type === "link" && card.previewKind === "music" && Boolean(card.image);
  const label = getCardLabel(card);
  const linkTitle = card.title || formatShortUrl(card.url) || "Untitled link";
  const surfaceFrameClassName = [
    "card__surface-frame",
    card.type === "text" && isTextExpanded ? "card__surface-frame--expanded" : "",
    card.type === "text" && !isTextExpanded ? "card__surface-frame--interactive" : "",
    card.type === "link" ? "card__surface-frame--interactive" : "",
    isSelected ? "card__surface-frame--selected" : "",
    isMusicCard ? "card__surface-frame--music" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (card.type !== "text" || !isTextExpanded) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const editor = textEditorRef.current;

      if (!editor) {
        return;
      }

      editor.focus();
      const cursorPosition = editor.value.length;
      editor.setSelectionRange(cursorPosition, cursorPosition);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [card.type, isTextExpanded]);

  useEffect(() => {
    if (card.type !== "text" || !isTextExpanded) {
      return undefined;
    }

    function collapseOnOutsidePointerDown(event) {
      if (articleRef.current?.contains(event.target)) {
        return;
      }

      setIsTextExpanded(false);
    }

    window.addEventListener("pointerdown", collapseOnOutsidePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", collapseOnOutsidePointerDown, true);
    };
  }, [card.type, isTextExpanded]);

  function handleSurfacePointerMove(event) {
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

  function handleSurfacePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    if (card.type === "text" && isTextExpanded) {
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

  function handleSurfacePointerUp(event) {
    const pressState = clearPressState(event);

    if (!pressState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (pressState.hasTriggeredDrag) {
      return;
    }

    if (card.type === "text") {
      setIsTextExpanded(true);
      return;
    }

    window.open(card.url, "_blank", "noopener,noreferrer");
  }

  function handleSurfacePointerCancel(event) {
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

  return (
    <article
      ref={articleRef}
      className={[
        "card",
        `card--${card.type}`,
        card.type === "text" && isTextExpanded ? "card--text-expanded" : "",
        isSelected ? "card--selected" : "",
        isMusicCard ? "card--music" : "",
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
      <div
        className="card__toolbar"
        onPointerDown={(event) => onDragStart(card, event)}
      >
        <p className="card__label">{label}</p>
      </div>

      {card.type === "text" ? (
        <div
          className={surfaceFrameClassName}
          onPointerDown={handleSurfacePointerDown}
          onPointerMove={handleSurfacePointerMove}
          onPointerUp={handleSurfacePointerUp}
          onPointerCancel={handleSurfacePointerCancel}
        >
          <div
            className="card__surface card__surface--text"
            style={{ height: `${card.height}px` }}
          >
            <textarea
              ref={textEditorRef}
              className="card__textarea"
              value={card.text}
              onChange={(event) => onTextChange(card.id, event.target.value)}
              placeholder="Paste or write a note..."
              readOnly={!isTextExpanded}
              tabIndex={isTextExpanded ? 0 : -1}
            />
          </div>
        </div>
      ) : (
        <div className="card__content">
          <div
            className={surfaceFrameClassName}
            onPointerDown={handleSurfacePointerDown}
            onPointerMove={handleSurfacePointerMove}
            onPointerUp={handleSurfacePointerUp}
            onPointerCancel={handleSurfacePointerCancel}
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
