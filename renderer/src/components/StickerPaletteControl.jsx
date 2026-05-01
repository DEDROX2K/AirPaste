import { AppButton } from "./ui/app";

function StickerIcon() {
  return (
    <svg className="drawing-tool-controls__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.5 4h7.25A5.25 5.25 0 0 1 20 9.25v6.25A4.5 4.5 0 0 1 15.5 20H9a5 5 0 0 1-5-5V8.5A4.5 4.5 0 0 1 8.5 4Z" />
      <path d="M14.5 4.2v4.05a2.4 2.4 0 0 0 2.4 2.4h3.02" />
      <path d="M10 12.25h4.5" />
      <path d="M10 15.5h3" />
    </svg>
  );
}

export default function StickerPaletteControl({
  stickers,
  isOpen,
  onToggle,
  onStickerPointerDown,
  activeStickerId = null,
}) {
  return (
    <div className={`sticker-palette${isOpen ? " sticker-palette--open" : ""}`}>
      <AppButton
        tone="unstyled"
        type="button"
        className={`drawing-tool-controls__button sticker-palette__toggle${isOpen ? " drawing-tool-controls__button--active" : ""}`}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-pressed={isOpen}
        aria-label={isOpen ? "Close sticker sheet" : "Open sticker sheet"}
        title={isOpen ? "Hide stickers" : "Show stickers"}
      >
        <StickerIcon />
        <span className="drawing-tool-controls__text">Sticker</span>
      </AppButton>

      {isOpen ? (
        <section className="sticker-paper" role="dialog" aria-label="Sticker sheet">
          <header className="sticker-paper__header">
            <div className="sticker-paper__title-group">
              <p className="sticker-paper__eyebrow">Sticker sheet</p>
              <h2 className="sticker-paper__title">Peel one off and drop it on the canvas</h2>
            </div>
            <p className="sticker-paper__hint">Stays open until you tap the Sticker button again.</p>
          </header>

          <div className="sticker-paper__grid">
            {stickers.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                className={`sticker-paper__item${activeStickerId === sticker.id ? " sticker-paper__item--active" : ""}`}
                onPointerDown={(event) => onStickerPointerDown(sticker, event)}
                aria-label={`Pick up ${sticker.label}`}
                title={sticker.label}
              >
                <span className="sticker-paper__chip">
                  <img className="sticker-paper__image" src={sticker.src} alt="" draggable={false} />
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
