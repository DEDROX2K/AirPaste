import { memo, useMemo } from "react";
import { useAppContext } from "../../context/useAppContext";
import { CHECKLIST_CARD_TYPE } from "../../lib/workspace";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

function normalizeNumericInput(value, fallback, minimum = 0) {
  const trimmed = String(value ?? "").trim();

  if (trimmed.length === 0) {
    return fallback;
  }

  const nextValue = Number(trimmed);
  return Number.isFinite(nextValue) ? Math.max(minimum, nextValue) : fallback;
}

function computeProgressPercent(value, max) {
  if (!Number.isFinite(max) || max <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / max) * 100));
}

function ProgressTile({
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
  const { updateExistingCard, workspace } = useAppContext();
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
  const checklistOptions = useMemo(
    () => workspace.cards.filter((workspaceCard) => workspaceCard.type === CHECKLIST_CARD_TYPE),
    [workspace.cards],
  );
  const linkedChecklist = checklistOptions.find((checklist) => checklist.id === card.linkedTileId) ?? null;
  const linkedTotals = useMemo(() => {
    if (!linkedChecklist) {
      return { completed: 0, total: 0, percent: 0 };
    }

    const total = Array.isArray(linkedChecklist.items) ? linkedChecklist.items.length : 0;
    const completed = Array.isArray(linkedChecklist.items)
      ? linkedChecklist.items.filter((item) => item.checked === true).length
      : 0;

    return {
      completed,
      total,
      percent: total > 0 ? computeProgressPercent(completed, total) : 0,
    };
  }, [linkedChecklist]);
  const isLinkedMode = card.mode === "linked";
  const manualValue = Number.isFinite(card.value) ? card.value : 0;
  const manualMax = Number.isFinite(card.max) && card.max > 0 ? card.max : 100;
  const percent = isLinkedMode ? linkedTotals.percent : computeProgressPercent(manualValue, manualMax);

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--progress"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section className="card__surface card__surface--progress" aria-label={card.title || "Progress bar"}>
            <header className="card__progress-header">
              <input
                className="card__progress-title"
                type="text"
                value={card.title ?? ""}
                placeholder="Feature progress"
                aria-label="Progress title"
                onPointerDown={stopInteractivePointer}
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateExistingCard(card.id, { title: event.target.value })}
              />
              <div className="card__progress-mode-toggle" onPointerDown={stopInteractivePointer}>
                <button
                  type="button"
                  className={`card__progress-mode-button${!isLinkedMode ? " card__progress-mode-button--active" : ""}`}
                  onClick={() => updateExistingCard(card.id, { mode: "manual" })}
                >
                  Manual
                </button>
                <button
                  type="button"
                  className={`card__progress-mode-button${isLinkedMode ? " card__progress-mode-button--active" : ""}`}
                  onClick={() => updateExistingCard(card.id, { mode: "linked" })}
                >
                  Linked
                </button>
              </div>
            </header>

            <div className="card__progress-meter">
              <div className="card__progress-meter-bar" style={{ width: `${percent}%` }} />
            </div>

            <div className="card__progress-summary">
              <span className="card__progress-percent">{Math.round(percent)}%</span>
              <span className="card__progress-caption">
                {isLinkedMode
                  ? linkedChecklist
                    ? `${linkedTotals.completed}/${linkedTotals.total} checklist items complete`
                    : "Select a checklist to link"
                  : `${manualValue} / ${manualMax}`}
              </span>
            </div>

            {isLinkedMode ? (
              <label className="card__progress-linked-row" onPointerDown={stopInteractivePointer}>
                <span className="card__progress-field-label">Checklist</span>
                <select
                  className="card__progress-select"
                  value={card.linkedTileId ?? ""}
                  aria-label="Linked checklist"
                  onKeyDown={stopInteractiveKey}
                  onChange={(event) => updateExistingCard(card.id, { linkedTileId: event.target.value || null })}
                >
                  <option value="">Select checklist</option>
                  {checklistOptions.map((checklist) => (
                    <option key={checklist.id} value={checklist.id}>
                      {checklist.title || "Checklist"}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="card__progress-manual-grid" onPointerDown={stopInteractivePointer}>
                <label className="card__progress-field">
                  <span className="card__progress-field-label">Value</span>
                  <input
                    className="card__progress-input"
                    type="number"
                    min="0"
                    value={manualValue}
                    onKeyDown={stopInteractiveKey}
                    onChange={(event) => updateExistingCard(card.id, {
                      value: normalizeNumericInput(event.target.value, manualValue),
                    })}
                  />
                </label>
                <label className="card__progress-field">
                  <span className="card__progress-field-label">Max</span>
                  <input
                    className="card__progress-input"
                    type="number"
                    min="1"
                    value={manualMax}
                    onKeyDown={stopInteractiveKey}
                    onChange={(event) => updateExistingCard(card.id, { max: normalizeNumericInput(event.target.value, manualMax, 1) })}
                  />
                </label>
              </div>
            )}
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(ProgressTile);
