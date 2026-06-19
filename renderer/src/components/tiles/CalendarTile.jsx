import { memo, useMemo } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

const CALENDAR_THEMES = {
  mist: {
    accent: "#ff5a52",
    accentSoft: "rgba(255, 90, 82, 0.16)",
    accentText: "#b42318",
    shell: "linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 247, 249, 0.96))",
    panel: "rgba(255, 255, 255, 0.82)",
    panelStrong: "rgba(255, 255, 255, 0.94)",
    border: "rgba(15, 23, 42, 0.08)",
    text: "#111827",
    muted: "#6b7280",
  },
  sand: {
    accent: "#ff7a45",
    accentSoft: "rgba(255, 122, 69, 0.16)",
    accentText: "#b54708",
    shell: "linear-gradient(180deg, rgba(255, 252, 247, 0.97), rgba(246, 240, 230, 0.96))",
    panel: "rgba(255, 250, 244, 0.84)",
    panelStrong: "rgba(255, 253, 249, 0.94)",
    border: "rgba(92, 72, 45, 0.1)",
    text: "#35281d",
    muted: "#7c6b57",
  },
  sage: {
    accent: "#2f9d72",
    accentSoft: "rgba(47, 157, 114, 0.16)",
    accentText: "#176448",
    shell: "linear-gradient(180deg, rgba(248, 252, 249, 0.97), rgba(234, 243, 238, 0.96))",
    panel: "rgba(247, 252, 248, 0.84)",
    panelStrong: "rgba(252, 255, 253, 0.94)",
    border: "rgba(26, 76, 55, 0.1)",
    text: "#163326",
    muted: "#5f796c",
  },
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMPACT_HEIGHT = 468;
const TALL_HEIGHT = 620;

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatFullDate(date) {
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getMonthGrid(month, year, view) {
  const today = startOfDay(new Date());
  const monthStart = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - monthStart.getDay());
  const monthCells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const inCurrentMonth = date.getMonth() === month;

    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      date,
      dayNumber: date.getDate(),
      inCurrentMonth,
      isToday: isSameDay(date, today),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    };
  });

  if (view !== "week") {
    return monthCells;
  }

  const anchor = today.getMonth() === month && today.getFullYear() === year
    ? today
    : startOfDay(monthStart);
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() - anchor.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      date,
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
      isToday: isSameDay(date, today),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    };
  });
}

function getTheme(themeId) {
  return CALENDAR_THEMES[themeId] ?? CALENDAR_THEMES.mist;
}

function CalendarTile({
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
  const month = Number.isFinite(card.month) ? card.month : new Date().getMonth();
  const year = Number.isFinite(card.year) ? card.year : new Date().getFullYear();
  const isTall = card.heightPreset === "tall";
  const theme = getTheme(card.themeId);
  const gridCells = useMemo(() => getMonthGrid(month, year, card.view), [card.view, month, year]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const title = typeof card.title === "string" ? card.title : "";
  const visibleRangeLabel = useMemo(() => {
    const first = gridCells[0]?.date;
    const last = gridCells[gridCells.length - 1]?.date;

    if (!first || !last) {
      return "";
    }

    const firstLabel = first.toLocaleDateString([], { month: "short", day: "numeric" });
    const lastLabel = last.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${firstLabel} - ${lastLabel}`;
  }, [gridCells]);

  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const todayLabel = formatFullDate(today);

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

  const styleVars = {
    "--calendar-accent": theme.accent,
    "--calendar-accent-soft": theme.accentSoft,
    "--calendar-accent-text": theme.accentText,
    "--calendar-shell": theme.shell,
    "--calendar-panel": theme.panel,
    "--calendar-panel-strong": theme.panelStrong,
    "--calendar-border": theme.border,
    "--calendar-text": theme.text,
    "--calendar-muted": theme.muted,
  };

  const shiftMonth = (delta) => {
    const nextDate = new Date(year, month + delta, 1);
    updateExistingCard(card.id, {
      month: nextDate.getMonth(),
      year: nextDate.getFullYear(),
    });
  };

  const resetToToday = () => {
    const now = new Date();
    updateExistingCard(card.id, {
      month: now.getMonth(),
      year: now.getFullYear(),
    });
  };

  const setView = (view) => updateExistingCard(card.id, { view });

  const setHeightPreset = (heightPreset) => updateExistingCard(card.id, {
    heightPreset,
    height: heightPreset === "tall" ? TALL_HEIGHT : COMPACT_HEIGHT,
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--calendar"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section
            className={`card__surface card__surface--calendar${isTall ? " card__surface--calendar-tall" : ""}`}
            aria-label={title || "Calendar"}
          >
            <div className="card__calendar-shell" style={styleVars}>
              <header className="card__calendar-topbar">
                <div className="card__calendar-heading">
                  <span className="card__calendar-eyebrow">Calendar</span>
                  <input
                    className="card__calendar-title"
                    type="text"
                    value={title}
                    placeholder="Team calendar"
                    aria-label="Calendar title"
                    onPointerDown={stopInteractivePointer}
                    onKeyDown={stopInteractiveKey}
                    onChange={(event) => updateExistingCard(card.id, { title: event.target.value })}
                  />
                  <p className="card__calendar-month">{monthLabel}</p>
                </div>

                <div className="card__calendar-controls" onPointerDown={stopInteractivePointer}>
                  <div className="card__calendar-view-toggle" role="tablist" aria-label="Calendar view">
                    <button
                      type="button"
                      className={`card__calendar-view-button${card.view === "month" ? " card__calendar-view-button--active" : ""}`}
                      onClick={() => setView("month")}
                    >
                      Month
                    </button>
                    <button
                      type="button"
                      className={`card__calendar-view-button${card.view === "week" ? " card__calendar-view-button--active" : ""}`}
                      onClick={() => setView("week")}
                    >
                      Week
                    </button>
                  </div>

                  <div className="card__calendar-nav">
                    <button type="button" className="card__calendar-nav-button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                      Prev
                    </button>
                    <button type="button" className="card__calendar-nav-button card__calendar-nav-button--today" onClick={resetToToday}>
                      Today
                    </button>
                    <button type="button" className="card__calendar-nav-button" onClick={() => shiftMonth(1)} aria-label="Next month">
                      Next
                    </button>
                  </div>
                </div>
              </header>

              <div className="card__calendar-body">
                <div className="card__calendar-main">
                  <div className="card__calendar-summary">
                    <span>{visibleRangeLabel}</span>
                    <span>{card.view === "week" ? "Focused week" : "Full month"}</span>
                  </div>

                  <div className={`card__calendar-grid${card.view === "week" ? " card__calendar-grid--week" : ""}`}>
                    {WEEKDAY_NAMES.map((weekday) => (
                      <div key={weekday} className="card__calendar-weekday">
                        {weekday}
                      </div>
                    ))}

                    {gridCells.map((cell) => (
                      <div
                        key={cell.key}
                        className={[
                          "card__calendar-day",
                          cell.inCurrentMonth ? "" : "card__calendar-day--muted",
                          cell.isToday ? "card__calendar-day--today" : "",
                          cell.isWeekend ? "card__calendar-day--weekend" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <span className="card__calendar-day-label">{cell.dayNumber}</span>
                        {cell.isToday ? <span className="card__calendar-day-chip">Today</span> : null}
                      </div>
                    ))}
                  </div>
                </div>

                <aside className="card__calendar-sidebar" onPointerDown={stopInteractivePointer}>
                  <div className="card__calendar-sidebar-card">
                    <span className="card__calendar-sidebar-label">Today</span>
                    <strong>{todayLabel}</strong>
                    <p>{card.view === "week" ? "Week view follows the active week." : "Month view keeps the full grid in place."}</p>
                  </div>

                  <div className="card__calendar-sidebar-card">
                    <span className="card__calendar-sidebar-label">Appearance</span>
                    <div className="card__calendar-theme-picker">
                      {Object.entries(CALENDAR_THEMES).map(([themeId, themeOption]) => (
                        <button
                          key={themeId}
                          type="button"
                          className={`card__calendar-theme-dot${card.themeId === themeId ? " card__calendar-theme-dot--active" : ""}`}
                          aria-label={`Use ${themeId} theme`}
                          style={{ "--calendar-theme-swatch": themeOption.accent }}
                          onClick={() => updateExistingCard(card.id, { themeId })}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="card__calendar-sidebar-card">
                    <span className="card__calendar-sidebar-label">Density</span>
                    <div className="card__calendar-density-toggle">
                      <button
                        type="button"
                        className={`card__calendar-density-button${!isTall ? " card__calendar-density-button--active" : ""}`}
                        onClick={() => setHeightPreset("compact")}
                      >
                        Compact
                      </button>
                      <button
                        type="button"
                        className={`card__calendar-density-button${isTall ? " card__calendar-density-button--active" : ""}`}
                        onClick={() => setHeightPreset("tall")}
                      >
                        Expanded
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(CalendarTile);
