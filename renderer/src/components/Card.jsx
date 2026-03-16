import { formatCardSubtitle } from "../lib/workspace";

function formatShortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function statusLabel(status) {
  if (status === "loading") {
    return "Fetching preview";
  }

  if (status === "ready") {
    return "Preview ready";
  }

  if (status === "failed") {
    return "Fallback card";
  }

  return "Saved locally";
}

export default function Card({
  card,
  onDragStart,
  onTextChange,
  onRetry,
}) {
  return (
    <article
      className={`card card--${card.type}`}
      style={{
        width: `${card.width}px`,
        minHeight: `${card.height}px`,
        transform: `translate(${card.x}px, ${card.y}px)`,
      }}
    >
      <div
        className="card__toolbar"
        onPointerDown={(event) => onDragStart(card, event)}
      >
        <div>
          <p className="card__label">{formatCardSubtitle(card)}</p>
          <h2 className="card__title">
            {card.type === "link" ? (card.title || formatShortUrl(card.url) || "Untitled link") : "Quick note"}
          </h2>
        </div>
        <span className={`card__status card__status--${card.status}`}>{statusLabel(card.status)}</span>
      </div>

      {card.type === "text" ? (
        <textarea
          className="card__textarea"
          value={card.text}
          onChange={(event) => onTextChange(card.id, event.target.value)}
          placeholder="Paste or write a note..."
        />
      ) : (
        <div className="card__content">
          {card.image ? (
            <div className="card__image-wrap">
              <img
                className="card__image"
                src={card.image}
                alt={card.title || "Link preview"}
              />
            </div>
          ) : null}

          <div className="card__meta">
            <p className="card__description">
              {card.description || "AirPaste saved the link locally, but the page did not expose a full preview."}
            </p>
            <a
              className="card__link"
              href={card.url}
              target="_blank"
              rel="noreferrer"
            >
              {formatShortUrl(card.url)}
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
