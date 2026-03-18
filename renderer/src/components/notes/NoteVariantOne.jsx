import {
  DEFAULT_NOTE_ONE_FOOTER,
  DEFAULT_NOTE_ONE_ITEMS,
  DEFAULT_NOTE_ONE_TITLE,
  getEditableChecklistItems,
  parseChecklistNote,
  serializeChecklistNote,
} from "./noteUtils";

export default function NoteVariantOne({
  card,
  isEditable,
  noteTimestamp,
  headerProps,
  onTextChange,
}) {
  const document = parseChecklistNote(card.text, DEFAULT_NOTE_ONE_TITLE);
  const showsDefaultItems = document.items.length === 0;
  const previewItems = !showsDefaultItems
    ? document.items.slice(0, DEFAULT_NOTE_ONE_ITEMS.length)
    : DEFAULT_NOTE_ONE_ITEMS;
  const editableItems = isEditable
    ? getEditableChecklistItems(document.items)
    : [];
  const footerText = document.footer || (document.isPlaceholder ? DEFAULT_NOTE_ONE_FOOTER : "");

  function updateChecklistDocument(partialUpdates) {
    const nextValue = serializeChecklistNote({
      title: partialUpdates.title ?? document.title,
      items: partialUpdates.items ?? document.items,
      footer: partialUpdates.footer ?? document.footer,
    }, DEFAULT_NOTE_ONE_TITLE);

    onTextChange(card.id, {
      text: nextValue,
    });
  }

  return (
    <div className="card__note1-shell">
      <div
        className={`card__note-header${headerProps ? " card__note-header--draggable" : ""}`}
        {...(headerProps ?? {})}
      >
        <div className="card__note-stamp">
          <span className="card__note-date">{noteTimestamp.dateLabel}</span>
          <span className="card__note-time">{noteTimestamp.timeLabel}</span>
        </div>

        <div className="card__note-menu" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className={`card__note-sheet${isEditable ? " card__note-sheet--editing" : ""}`}>
        {isEditable ? (
          <div className="card__note-editor">
            <input
              className="card__note-title-input"
              type="text"
              value={document.title}
              placeholder={DEFAULT_NOTE_ONE_TITLE}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => updateChecklistDocument({ title: event.target.value })}
            />

            <div className="card__note-list card__note-list--editing">
              {editableItems.map((item, index) => (
                <label
                  key={`note1-item-${index}`}
                  className={`card__note-item card__note-item--editable${item.checked ? " card__note-item--checked" : ""}`}
                >
                  <button
                    className={`card__note-check${item.checked ? " card__note-check--checked" : ""}`}
                    type="button"
                    aria-label={item.checked ? "Mark task as incomplete" : "Mark task as complete"}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      const nextItems = editableItems.map((currentItem, currentIndex) => (
                        currentIndex === index
                          ? { ...currentItem, checked: !currentItem.checked }
                          : currentItem
                      ));
                      updateChecklistDocument({ items: nextItems });
                    }}
                  />
                  <input
                    className={`card__note-item-input${item.checked ? " card__note-item-input--checked" : ""}`}
                    type="text"
                    value={item.text}
                    placeholder={DEFAULT_NOTE_ONE_ITEMS[index]?.text || "Add a task"}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const nextItems = editableItems.map((currentItem, currentIndex) => (
                        currentIndex === index
                          ? { ...currentItem, text: event.target.value }
                          : currentItem
                      ));
                      updateChecklistDocument({ items: nextItems });
                    }}
                  />
                </label>
              ))}
            </div>

            <textarea
              className="card__note-footer-input"
              value={document.footer}
              placeholder={DEFAULT_NOTE_ONE_FOOTER}
              rows={2}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => updateChecklistDocument({ footer: event.target.value })}
            />
          </div>
        ) : (
          <div className="card__note-preview">
            <h2 className={`card__note-title${document.hasContent ? "" : " card__note-title--placeholder"}`}>
              {document.title || DEFAULT_NOTE_ONE_TITLE}
            </h2>

            <div className="card__note-list">
              {previewItems.map((item, index) => (
                <div
                  key={`note1-preview-${index}`}
                  className={`card__note-item${item.checked ? " card__note-item--checked" : ""}${showsDefaultItems ? " card__note-item--placeholder" : ""}`}
                >
                  <span className={`card__note-check${item.checked ? " card__note-check--checked" : ""}`} aria-hidden="true" />
                  <span className="card__note-item-label">{item.text}</span>
                </div>
              ))}
            </div>

            <p className={`card__note-footer${footerText ? "" : " card__note-footer--placeholder"}`}>
              {footerText || DEFAULT_NOTE_ONE_FOOTER}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
