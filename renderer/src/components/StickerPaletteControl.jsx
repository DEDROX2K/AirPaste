import { AppButton } from "./ui/app";
import { Sticker } from "./ui/icons";

function StickerIcon() {
  return <Sticker className="drawing-tool-controls__icon" size={16} aria-hidden="true" />;
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
