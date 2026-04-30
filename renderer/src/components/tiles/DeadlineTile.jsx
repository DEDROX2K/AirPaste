import { memo, useEffect, useMemo, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

function formatCountdownParts(deltaMs, showSeconds) {
  const totalSeconds = Math.max(0, Math.floor(deltaMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    primaryLabel: showSeconds
      ? `${days}d ${hours}h ${minutes}m ${seconds}s`
      : `${days}d ${hours}h ${minutes}m`,
  };
}

function formatTargetLabel(targetAt) {
  if (!targetAt) {
    return "Set a date and time";
  }

  const parsed = new Date(targetAt);
  return Number.isNaN(parsed.getTime())
    ? "Invalid date"
    : parsed.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
}

function DeadlineTile({
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
  const [now, setNow] = useState(() => Date.now());
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

  useEffect(() => {
    const intervalMs = card.showSeconds ? 1000 : 60000;
    const intervalId = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(intervalId);
  }, [card.showSeconds]);

  const countdownState = useMemo(() => {
    if (!card.targetAt) {
      return {
        status: "empty",
        targetLabel: "Set a date and time",
        summary: "No deadline selected",
        parts: formatCountdownParts(0, card.showSeconds),
      };
    }

    const targetDate = new Date(card.targetAt);
    const targetMs = targetDate.getTime();

    if (Number.isNaN(targetMs)) {
      return {
        status: "fallback",
        targetLabel: "Invalid date",
        summary: "Check the deadline input",
        parts: formatCountdownParts(0, card.showSeconds),
      };
    }

    const deltaMs = targetMs - now;
    const overdue = deltaMs < 0;
    const parts = formatCountdownParts(Math.abs(deltaMs), card.showSeconds);

    return {
      status: overdue ? "overdue" : "success",
      targetLabel: formatTargetLabel(card.targetAt),
      summary: overdue ? "Past due by" : "Time remaining",
      parts,
    };
  }, [card.showSeconds, card.targetAt, now]);

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--deadline"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section
            className={`card__surface card__surface--deadline${countdownState.status === "overdue" ? " card__surface--deadline-overdue" : ""}`}
            aria-label={card.title || "Deadline countdown"}
          >
            <header className="card__deadline-header">
              <input
                className="card__deadline-title"
                type="text"
                value={card.title ?? ""}
                placeholder="Launch countdown"
                aria-label="Deadline title"
                onPointerDown={stopInteractivePointer}
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateExistingCard(card.id, { title: event.target.value })}
              />
              <label className="card__deadline-seconds-toggle" onPointerDown={stopInteractivePointer}>
                <input
                  type="checkbox"
                  checked={card.showSeconds === true}
                  onKeyDown={stopInteractiveKey}
                  onChange={(event) => updateExistingCard(card.id, { showSeconds: event.target.checked })}
                />
                <span>Seconds</span>
              </label>
            </header>

            <label className="card__deadline-target-row" onPointerDown={stopInteractivePointer}>
              <span className="card__deadline-target-label">Deadline</span>
              <input
                className="card__deadline-target-input"
                type="datetime-local"
                value={card.targetAt ?? ""}
                aria-label="Deadline date and time"
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateExistingCard(card.id, { targetAt: event.target.value, timezone: "local" })}
              />
            </label>

            <div className="card__deadline-countdown">
              <p className="card__deadline-summary">{countdownState.summary}</p>
              <p className="card__deadline-primary">{countdownState.parts.primaryLabel}</p>
              <div className="card__deadline-parts" aria-hidden="true">
                <div className="card__deadline-part"><span>{countdownState.parts.days}</span><small>Days</small></div>
                <div className="card__deadline-part"><span>{countdownState.parts.hours}</span><small>Hours</small></div>
                <div className="card__deadline-part"><span>{countdownState.parts.minutes}</span><small>Minutes</small></div>
                {card.showSeconds ? (
                  <div className="card__deadline-part"><span>{countdownState.parts.seconds}</span><small>Seconds</small></div>
                ) : null}
              </div>
            </div>

            <footer className="card__deadline-footer">
              <span className={`card__deadline-status card__deadline-status--${countdownState.status}`}>{countdownState.status}</span>
              <span className="card__deadline-target-text">{countdownState.targetLabel}</span>
            </footer>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(DeadlineTile);
