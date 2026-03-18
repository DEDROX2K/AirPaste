import {
  DEFAULT_QUOTE_AUTHOR_PLACEHOLDER,
  DEFAULT_QUOTE_LABEL,
  DEFAULT_QUOTE_PLACEHOLDER,
} from "./noteUtils";

export default function NoteVariantThree({
  card,
  isEditable,
  headerProps,
  onTextChange,
}) {
  const quoteText = card.text.trim();
  const author = card.quoteAuthor.trim();

  return (
    <div className="card__note3-shell">
      <div
        className={`card__note3-label-row${headerProps ? " card__note3-label-row--draggable" : ""}`}
        {...(headerProps ?? {})}
      >
        <span className="card__note3-label">{DEFAULT_QUOTE_LABEL}</span>
      </div>

      <div className="card__note3-body">
        {isEditable ? (
          <textarea
            className="card__note3-quote-editor"
            value={card.text}
            placeholder={DEFAULT_QUOTE_PLACEHOLDER}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onTextChange(card.id, { text: event.target.value })}
          />
        ) : (
          <p className={`card__note3-quote${quoteText ? "" : " card__note3-quote--placeholder"}`}>
            {quoteText || DEFAULT_QUOTE_PLACEHOLDER}
          </p>
        )}
      </div>

      <div className="card__note3-footer">
        {isEditable ? (
          <label className="card__note3-author-chip card__note3-author-chip--editing">
            <input
              className="card__note3-author-input"
              type="text"
              value={card.quoteAuthor}
              placeholder={DEFAULT_QUOTE_AUTHOR_PLACEHOLDER}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => onTextChange(card.id, { quoteAuthor: event.target.value })}
            />
          </label>
        ) : (
          <span className={`card__note3-author-chip${author ? "" : " card__note3-author-chip--placeholder"}`}>
            {author ? `By ${author}` : DEFAULT_QUOTE_AUTHOR_PLACEHOLDER}
          </span>
        )}
      </div>
    </div>
  );
}
