import { memo } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

function normalizeNumericInput(value, fallback) {
  const trimmed = String(value ?? "").trim();

  if (trimmed.length === 0) {
    return fallback;
  }

  const nextValue = Number(trimmed);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function CounterTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
}) {
  const { updateExistingCard } = useAppContext();
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const value = Number.isFinite(card?.value) ? card.value : 0;
  const step = Number.isFinite(card?.step) && card.step > 0 ? card.step : 1;

  const updateCounter = (patch) => {
    updateExistingCard(card.id, patch);
  };

  const handleDelta = (direction) => {
    updateCounter({ value: value + (step * direction) });
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--counter"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section className="card__surface card__surface--counter" aria-label={card.title || "Counter"}>
            <header className="card__counter-header">
              <input
                className="card__counter-title"
                type="text"
                value={card.title ?? ""}
                placeholder="Counter"
                aria-label="Counter title"
                onPointerDown={stopInteractivePointer}
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateCounter({ title: event.target.value })}
              />
            </header>

            <div className="card__counter-value-shell" onPointerDown={stopInteractivePointer}>
              <span className="card__counter-value" aria-label={`Counter value ${value}`}>{value}</span>
              <input
                className="card__counter-unit"
                type="text"
                value={card.unit ?? ""}
                placeholder="unit"
                aria-label="Counter unit"
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateCounter({ unit: event.target.value })}
              />
            </div>

            <div className="card__counter-actions" onPointerDown={stopInteractivePointer}>
              <button
                type="button"
                className="card__counter-button"
                aria-label="Decrement counter"
                onClick={() => handleDelta(-1)}
              >
                -
              </button>
              <button
                type="button"
                className="card__counter-button card__counter-button--reset"
                onClick={() => updateCounter({ value: 0 })}
              >
                Reset
              </button>
              <button
                type="button"
                className="card__counter-button card__counter-button--primary"
                aria-label="Increment counter"
                onClick={() => handleDelta(1)}
              >
                +
              </button>
            </div>

            <label className="card__counter-step-row" onPointerDown={stopInteractivePointer}>
              <span className="card__counter-step-label">Step</span>
              <input
                className="card__counter-step-input"
                type="number"
                min="1"
                step="1"
                value={step}
                aria-label="Counter step"
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateCounter({ step: normalizeNumericInput(event.target.value, step) })}
                onBlur={(event) => updateCounter({ step: Math.max(1, normalizeNumericInput(event.target.value, 1)) })}
              />
            </label>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(CounterTile);
