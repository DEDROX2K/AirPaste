export default function NoteVariantQuick({
  card,
  isEditable,
  noteTimestamp,
  headerProps,
  onTextChange,
}) {
  return (
    <div className="card__notequick-shell">
      <div
        className={`card__notequick-header${headerProps ? " card__notequick-header--draggable" : ""}`}
        {...(headerProps ?? {})}
      >
        <span className="card__notequick-day">{noteTimestamp.weekdayLabel}</span>
        <span className="card__notequick-time">{noteTimestamp.timeLabel}</span>
      </div>

      <div className={`card__notequick-body${isEditable ? " card__notequick-body--editing" : ""}`}>
        {isEditable ? (
          <textarea
            className="card__notequick-editor"
            value={card.text}
            placeholder=""
            rows={8}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onTextChange(card.id, { text: event.target.value })}
          />
        ) : (
          <p className={`card__notequick-text${card.text.trim() ? "" : " card__notequick-text--placeholder"}`}>
            {card.text.trim() || " "}
          </p>
        )}
      </div>
    </div>
  );
}
