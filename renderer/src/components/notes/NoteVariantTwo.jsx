import {
  DEFAULT_BODY_PLACEHOLDER,
  DEFAULT_META_LINES,
  DEFAULT_NOTE_TITLE,
  DEFAULT_SECONDARY_TITLE,
  DEFAULT_SECTION_LABEL,
  parseNoteDocument,
  serializeNoteDocument,
} from "./noteUtils";

const PAGE_EXPAND_ICON_SRC = "/icons/page-expand.png";

function renderPillStack(noteTimestamp) {
  return (
    <div className="card__note2-pill-stack">
      <span className="card__note2-pill">{noteTimestamp.timeLabel}</span>
      <span className="card__note2-pill">{noteTimestamp.weekdayLabel}</span>
    </div>
  );
}

function renderNoteHeaderTitle(title, fallbackTitle, columnClassName, onChange, isEditable) {
  if (!isEditable) {
    return (
      <h2 className={`card__note2-title ${columnClassName}`}>
        {title || fallbackTitle}
      </h2>
    );
  }

  return (
    <input
      className={`card__note2-title-input ${columnClassName}`}
      type="text"
      value={title}
      placeholder={fallbackTitle}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function NoteColumn({
  document,
  columnKey,
  fallbackTitle,
  isEditable,
  isSecondary = false,
  noteTimestamp,
  onDocumentChange,
  previewBodyRef = null,
  showPreviewFade = false,
}) {
  const columnClassName = [
    "card__note2-column",
    isSecondary ? "card__note2-column--secondary" : "",
    isEditable ? "card__note2-column--editing" : "card__note2-column--preview",
  ]
    .filter(Boolean)
    .join(" ");
  const bodyText = document.body || (document.isPlaceholder ? DEFAULT_BODY_PLACEHOLDER : "");

  return (
    <section className={columnClassName}>
      <div className="card__note2-meta-row">
        {isEditable ? (
          <textarea
            className="card__note2-meta-editor"
            value={document.metaText}
            placeholder={DEFAULT_META_LINES.join("\n")}
            rows={2}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onDocumentChange(columnKey, document, { metaText: event.target.value }, fallbackTitle)}
          />
        ) : (
          <div className={`card__note2-meta-copy${document.metaLines.length === 0 ? " card__note2-meta-copy--empty" : ""}`}>
            {(document.metaLines.length > 0 ? document.metaLines : (document.isPlaceholder ? DEFAULT_META_LINES : [])).map((line, index) => (
              <p key={`${columnKey}-meta-${index}`}>{line}</p>
            ))}
          </div>
        )}

        {renderPillStack(noteTimestamp)}
      </div>

      {isEditable ? (
        <input
          className="card__note2-section-input"
          type="text"
          value={document.sectionLabel}
          placeholder={DEFAULT_SECTION_LABEL}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onDocumentChange(columnKey, document, { sectionLabel: event.target.value }, fallbackTitle)}
        />
      ) : (
        <p className="card__note2-section-label">
          {document.sectionLabel || DEFAULT_SECTION_LABEL}
        </p>
      )}

      {isEditable ? (
        <textarea
          className="card__note2-body-editor"
          value={document.body}
          placeholder={DEFAULT_BODY_PLACEHOLDER}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onDocumentChange(columnKey, document, { body: event.target.value }, fallbackTitle)}
        />
      ) : (
        <div className="card__note2-preview-body-wrap">
          <div
            ref={previewBodyRef}
            className={`card__note2-preview-body${document.isPlaceholder ? " card__note2-preview-body--placeholder" : ""}`}
          >
            {bodyText}
          </div>
          {showPreviewFade ? <div className="card__note2-bottom-fade" aria-hidden="true" /> : null}
        </div>
      )}
    </section>
  );
}

export default function NoteVariantTwo({
  card,
  isEditable,
  isMagnified,
  noteTimestamp,
  headerProps,
  onTextChange,
  previewBodyRef,
  showPreviewFade,
  isSplit,
  onSplitToggle,
  onRequestSplitMagnify,
}) {
  const primaryNoteDocument = parseNoteDocument(card.text, DEFAULT_NOTE_TITLE);
  const secondaryNoteDocument = parseNoteDocument(card.secondaryText, DEFAULT_SECONDARY_TITLE);
  const canToggleSplit = isMagnified;
  const showSplit = canToggleSplit && isSplit;

  function updateNoteDocument(columnKey, currentDocument, partialUpdates, fallbackTitle) {
    const nextValue = serializeNoteDocument({
      title: partialUpdates.title ?? currentDocument.title,
      metaText: partialUpdates.metaText ?? currentDocument.metaText,
      sectionLabel: partialUpdates.sectionLabel ?? currentDocument.sectionLabel,
      body: partialUpdates.body ?? currentDocument.body,
    }, fallbackTitle);

    onTextChange(card.id, {
      [columnKey]: nextValue,
    });
  }

  return (
    <div className={`card__note2-shell${showSplit ? " card__note2-shell--split" : ""}`}>
      <div
        className={`card__note2-header${showSplit ? " card__note2-header--split" : ""}${headerProps ? " card__note2-header--draggable" : ""}`}
        {...(headerProps ?? {})}
      >
        {renderNoteHeaderTitle(
          primaryNoteDocument.title,
          DEFAULT_NOTE_TITLE,
          "card__note2-title--primary",
          (nextTitle) => updateNoteDocument("text", primaryNoteDocument, { title: nextTitle }, DEFAULT_NOTE_TITLE),
          isEditable,
        )}

        {showSplit ? renderNoteHeaderTitle(
          secondaryNoteDocument.title,
          DEFAULT_SECONDARY_TITLE,
          "card__note2-title--secondary",
          (nextTitle) => updateNoteDocument("secondaryText", secondaryNoteDocument, { title: nextTitle }, DEFAULT_SECONDARY_TITLE),
          isEditable,
        ) : null}

        <button
          className={`card__note2-expand-button${showSplit ? " card__note2-expand-button--active" : ""}${canToggleSplit ? "" : " card__note2-expand-button--passive"}`}
          type="button"
          aria-label={canToggleSplit ? (showSplit ? "Collapse split note" : "Expand note into two columns") : "Open split note view"}
          title={canToggleSplit ? (showSplit ? "Collapse split note" : "Expand note into two columns") : "Open split note view"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();

            if (canToggleSplit) {
              onSplitToggle();
              return;
            }

            onRequestSplitMagnify();
          }}
        >
          <img src={PAGE_EXPAND_ICON_SRC} alt="" />
        </button>
      </div>

      <div className="card__note2-divider" />

      <div className={`card__note2-content${showSplit ? " card__note2-content--split" : ""}`}>
        <NoteColumn
          document={primaryNoteDocument}
          columnKey="text"
          fallbackTitle={DEFAULT_NOTE_TITLE}
          isEditable={isEditable}
          noteTimestamp={noteTimestamp}
          onDocumentChange={updateNoteDocument}
          previewBodyRef={!showSplit ? previewBodyRef : null}
          showPreviewFade={!showSplit && showPreviewFade}
        />
        {showSplit ? (
          <NoteColumn
            document={secondaryNoteDocument}
            columnKey="secondaryText"
            fallbackTitle={DEFAULT_SECONDARY_TITLE}
            isEditable={isEditable}
            isSecondary
            noteTimestamp={noteTimestamp}
            onDocumentChange={updateNoteDocument}
          />
        ) : null}
      </div>
    </div>
  );
}
