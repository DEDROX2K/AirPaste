import { formatCardSubtitle } from "../../lib/workspace";
import TileShell from "./TileShell";
import { useTileGesture } from "../../systems/interactions/useTileGesture";

function formatShortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function getCardLabel(card) {
  return card.title.trim() || formatCardSubtitle(card);
}

export default function LinkTile({
  card,
  tileMeta,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onOpenLink,
  onPressStart,
  onMediaLoad,
  onRetry,
}) {
  const isMusicCard = card.previewKind === "music" && Boolean(card.image);
  const label = getCardLabel(card);
  const linkTitle = card.title || formatShortUrl(card.url) || "Untitled link";
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    isMusicCard ? "card__surface-frame--music" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const surfaceGesture = useTileGesture({
    card,
    onActivate: onOpenLink,
    onDragStart: onBeginDrag,
    onPressStart,
  });

  return (
    <TileShell
      card={card}
      tileMeta={{ ...tileMeta, isMusic: isMusicCard }}
      className={isMusicCard ? "card--music" : ""}
      toolbar={(
        <div className="card__toolbar" {...surfaceGesture}>
          <p className="card__label">{label}</p>
        </div>
      )}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <a
            className={`card__surface card__surface--link${isMusicCard ? " card__surface--music" : ""}`}
            href={card.url}
            target="_blank"
            rel="noreferrer"
            title={linkTitle}
            aria-label={`Open ${linkTitle}`}
            draggable={false}
            onClick={(event) => event.preventDefault()}
          >
            {isMusicCard ? (
              <div className="card__record-shell">
                <div className="card__record-disc" aria-hidden="true" />
                <div className="card__record-sleeve">
                  <img
                    className="card__image card__image--music"
                    src={card.image}
                    alt={linkTitle}
                    draggable={false}
                    onLoad={(event) => onMediaLoad?.(card, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                  />
                </div>
              </div>
            ) : card.image ? (
              <img
                className="card__image"
                src={card.image}
                alt={linkTitle}
                draggable={false}
                onLoad={(event) => onMediaLoad?.(card, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
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
    </TileShell>
  );
}
