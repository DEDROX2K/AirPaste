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

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocalValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    primaryValue: days > 0 ? String(days) : pad(hours),
    primaryUnit: days > 0 ? "days" : "hours",
    compactLabel: showSeconds
      ? `${days}d ${hours}h ${minutes}m ${seconds}s`
      : `${days}d ${hours}h ${minutes}m`,
  };
}

function formatTargetLabel(targetAt) {
  if (!targetAt) {
    return "Set a deadline";
  }

  const parsed = new Date(targetAt);
  return Number.isNaN(parsed.getTime())
    ? "Invalid date"
    : parsed.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
}

function buildQuickDeadline(kind) {
  const date = new Date();

  if (kind === "tomorrow") {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return toDateTimeLocalValue(date);
  }

  if (kind === "next-week") {
    date.setDate(date.getDate() + 7);
    date.setHours(9, 0, 0, 0);
    return toDateTimeLocalValue(date);
  }

  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 17, 0, 0, 0);
  return toDateTimeLocalValue(endOfMonth);
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

  useEffect(() => {
    const intervalMs = card.showSeconds ? 1000 : 60000;
    const intervalId = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(intervalId);
  }, [card.showSeconds]);

  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const countdownState = useMemo(() => {
    if (!card.targetAt) {
      return {
        status: "empty",
        statusLabel: "No deadline",
        targetLabel: "Choose a date to start the countdown.",
        summary: "Nothing scheduled yet",
        parts: formatCountdownParts(0, card.showSeconds),
      };
    }

    const targetDate = new Date(card.targetAt);
    const targetMs = targetDate.getTime();

    if (Number.isNaN(targetMs)) {
      return {
        status: "fallback",
        statusLabel: "Invalid",
        targetLabel: "Check the date format.",
        summary: "This deadline needs a valid time",
        parts: formatCountdownParts(0, card.showSeconds),
      };
    }

    const deltaMs = targetMs - now;
    const overdue = deltaMs < 0;
    const parts = formatCountdownParts(Math.abs(deltaMs), card.showSeconds);

    return {
      status: overdue ? "overdue" : "success",
      statusLabel: overdue ? "Overdue" : "On track",
      targetLabel: formatTargetLabel(card.targetAt),
      summary: overdue ? "Past due by" : "Time remaining",
      parts,
    };
  }, [card.showSeconds, card.targetAt, now]);

  const title = typeof card.title === "string" ? card.title : "";

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
            aria-label={title || "Deadline countdown"}
          >
            <div className="card__deadline-shell">
              <header className="card__deadline-topbar">
                <span className={`card__deadline-status card__deadline-status--${countdownState.status}`}>
                  {countdownState.statusLabel}
                </span>

                <button
                  type="button"
                  className={`card__deadline-seconds-toggle${card.showSeconds ? " card__deadline-seconds-toggle--active" : ""}`}
                  onPointerDown={stopInteractivePointer}
                  onClick={() => updateExistingCard(card.id, { showSeconds: card.showSeconds !== true })}
                >
                  {card.showSeconds ? "Seconds on" : "Seconds off"}
                </button>
              </header>

              <div className="card__deadline-hero">
                <div className="card__deadline-copy">
                  <span className="card__deadline-eyebrow">Deadline</span>
                  <input
                    className="card__deadline-title"
                    type="text"
                    value={title}
                    placeholder="Launch countdown"
                    aria-label="Deadline title"
                    onPointerDown={stopInteractivePointer}
                    onKeyDown={stopInteractiveKey}
                    onChange={(event) => updateExistingCard(card.id, { title: event.target.value })}
                  />
                  <p className="card__deadline-target-text">{countdownState.targetLabel}</p>
                </div>

                <div className="card__deadline-primary-card">
                  <span className="card__deadline-summary">{countdownState.summary}</span>
                  <div className="card__deadline-primary">
                    <span className="card__deadline-primary-value">{countdownState.parts.primaryValue}</span>
                    <span className="card__deadline-primary-unit">{countdownState.parts.primaryUnit}</span>
                  </div>
                  <p className="card__deadline-compact-label">{countdownState.parts.compactLabel}</p>
                </div>
              </div>

              <div className="card__deadline-parts" aria-hidden="true">
                <div className="card__deadline-part">
                  <span>{countdownState.parts.days}</span>
                  <small>Days</small>
                </div>
                <div className="card__deadline-part">
                  <span>{countdownState.parts.hours}</span>
                  <small>Hours</small>
                </div>
                <div className="card__deadline-part">
                  <span>{countdownState.parts.minutes}</span>
                  <small>Minutes</small>
                </div>
                <div className="card__deadline-part">
                  <span>{card.showSeconds ? countdownState.parts.seconds : "-"}</span>
                  <small>Seconds</small>
                </div>
              </div>

              <div className="card__deadline-actions">
                <label className="card__deadline-target-row" onPointerDown={stopInteractivePointer}>
                  <span className="card__deadline-target-label">Target time</span>
                  <input
                    className="card__deadline-target-input"
                    type="datetime-local"
                    value={card.targetAt ?? ""}
                    aria-label="Deadline date and time"
                    onKeyDown={stopInteractiveKey}
                    onChange={(event) => updateExistingCard(card.id, { targetAt: event.target.value, timezone: "local" })}
                  />
                </label>

                <div className="card__deadline-quick-actions" onPointerDown={stopInteractivePointer}>
                  <button type="button" className="card__deadline-quick-button" onClick={() => updateExistingCard(card.id, { targetAt: buildQuickDeadline("tomorrow"), timezone: "local" })}>
                    Tomorrow 9am
                  </button>
                  <button type="button" className="card__deadline-quick-button" onClick={() => updateExistingCard(card.id, { targetAt: buildQuickDeadline("next-week"), timezone: "local" })}>
                    Next week
                  </button>
                  <button type="button" className="card__deadline-quick-button" onClick={() => updateExistingCard(card.id, { targetAt: buildQuickDeadline("month-end"), timezone: "local" })}>
                    Month end
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(DeadlineTile);
