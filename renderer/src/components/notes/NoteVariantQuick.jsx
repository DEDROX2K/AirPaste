import { useRef } from "react";

export default function NoteVariantQuick({
  card,
  isEditable,
  noteTimestamp,
  headerProps,
  onTextChange,
}) {
  const paperRef = useRef(null);
  const themeClass = card.colorTheme || "theme-blue-red";

  return (
    <div className={`card__notequick-shell ${themeClass}`}>
      <div className="card__notequick-paper" ref={paperRef}>
        {isEditable && (
          <div 
            className="card__notequick-move-handle" 
            title="Drag to move"
            {...(headerProps ?? {})}
          >
            <div className="card__notequick-move-icon"></div>
          </div>
        )}

        <div className="card__notequick-header-meta">
          <span className="card__notequick-day">{noteTimestamp.weekdayLabel}</span>
          <span className="card__notequick-time">{noteTimestamp.timeLabel}</span>
        </div>

        <div 
          className={`card__notequick-body${isEditable ? " card__notequick-body--editing" : ""}`}
          data-replicated-value={card.text + " "}
        >
          {isEditable ? (
            <textarea
              className="card__notequick-editor"
              value={card.text}
              placeholder="Jot something down..."
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
    </div>
  );
}
