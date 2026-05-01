import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

const CALENDAR_THEMES = {
  mist: {
    shell: "#d7d3d2",
    panel: "#f8f7f7",
    panelMuted: "#ece9e8",
    text: "#383434",
    textMuted: "#7f7b79",
    accent: "#ff5b46",
    control: "#ffffff",
    controlText: "#383434",
    outline: "rgba(56, 189, 248, 0.34)",
  },
  sand: {
    shell: "#ddd4c7",
    panel: "#fcfaf5",
    panelMuted: "#f1ebdf",
    text: "#433a2d",
    textMuted: "#8d816f",
    accent: "#ff7a59",
    control: "#fff8ec",
    controlText: "#433a2d",
    outline: "rgba(217, 119, 6, 0.3)",
  },
  sage: {
    shell: "#cfd8ce",
    panel: "#f7fbf7",
    panelMuted: "#e7efe6",
    text: "#294038",
    textMuted: "#6f847c",
    accent: "#ff6b57",
    control: "#f6fff6",
    controlText: "#294038",
    outline: "rgba(16, 185, 129, 0.3)",
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
const COMPACT_HEIGHT = 412;
const TALL_HEIGHT = 640;

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

function getTheme(themeId) {
  return CALENDAR_THEMES[themeId] ?? CALENDAR_THEMES.mist;
}

function buildMonthCells(month, year) {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - startOffset + 1;

    if (dayNumber <= 0) {
      cells.push({
        key: `prev-${index}`,
        dayLabel: daysInPrevMonth + dayNumber,
        muted: true,
        accent: false,
      });
      continue;
    }

    if (dayNumber > daysInMonth) {
      cells.push({
        key: `next-${index}`,
        dayLabel: dayNumber - daysInMonth,
        muted: true,
        accent: false,
      });
      continue;
    }

    cells.push({
      key: `current-${dayNumber}`,
      dayLabel: dayNumber,
      muted: false,
      accent: month === 1 && year === 2023 && dayNumber === 1,
    });
  }

  return cells;
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
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const containerRef = useRef(null);
  const theme = getTheme(card.themeId);
  const month = Number.isFinite(card.month) ? card.month : 1;
  const year = Number.isFinite(card.year) ? card.year : 2023;
  const monthCells = useMemo(() => buildMonthCells(month, year), [month, year]);
  const isTall = card.heightPreset === "tall";

  const surfaceGesture = useTileGesture({
    card,
    onActivate: () => {
      setIsControlsOpen(true);
    },
    onDragStart: onBeginDrag,
    onPressStart,
  });

  useEffect(() => {
    if (!isControlsOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsControlsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsControlsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isControlsOpen]);

  useEffect(() => {
    if (isControlsOpen && !tileMeta?.isSelected) {
      setIsControlsOpen(false);
    }
  }, [isControlsOpen, tileMeta?.isSelected]);

  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const styleVars = {
    "--calendar-shell": theme.shell,
    "--calendar-panel": theme.panel,
    "--calendar-panel-muted": theme.panelMuted,
    "--calendar-text": theme.text,
    "--calendar-text-muted": theme.textMuted,
    "--calendar-accent": theme.accent,
    "--calendar-control": theme.control,
    "--calendar-control-text": theme.controlText,
    "--calendar-outline": theme.outline,
  };

  const cycleTheme = () => {
    const themeIds = Object.keys(CALENDAR_THEMES);
    const currentIndex = Math.max(0, themeIds.indexOf(card.themeId));
    const nextThemeId = themeIds[(currentIndex + 1) % themeIds.length];
    updateExistingCard(card.id, { themeId: nextThemeId });
  };

  const toggleHeight = () => {
    updateExistingCard(card.id, {
      heightPreset: isTall ? "compact" : "tall",
      height: isTall ? COMPACT_HEIGHT : TALL_HEIGHT,
    });
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
      <div className="card__content" ref={containerRef}>
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section
            className={`card__surface card__surface--calendar${isTall ? " card__surface--calendar-tall" : ""}`}
            style={styleVars}
            aria-label={card.title || "Calendar"}
          >
            {isControlsOpen ? (
              <div className="card__calendar-popup" onPointerDown={stopInteractivePointer}>
                <button
                  type="button"
                  className="card__calendar-popup-button"
                  title="Swap theme"
                  aria-label="Swap theme"
                  onClick={cycleTheme}
                  onKeyDown={stopInteractiveKey}
                >
                  <span className="card__calendar-popup-dot" />
                </button>
                <button
                  type="button"
                  className="card__calendar-popup-button"
                  title="Toggle height"
                  aria-label="Toggle calendar height"
                  onClick={toggleHeight}
                  onKeyDown={stopInteractiveKey}
                >
                  <span className="card__calendar-popup-lines" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
              </div>
            ) : null}

            <header className="card__calendar-header">
              <div className="card__calendar-title-block">
                <input
                  className="card__calendar-title"
                  type="text"
                  value={card.title ?? ""}
                  placeholder="Calendar"
                  aria-label="Calendar title"
                  onPointerDown={stopInteractivePointer}
                  onKeyDown={stopInteractiveKey}
                  onChange={(event) => updateExistingCard(card.id, { title: event.target.value })}
                />
                <p className="card__calendar-month">{`${MONTH_NAMES[month]} ${year}`}</p>
              </div>

              <div className="card__calendar-toolbar" onPointerDown={stopInteractivePointer}>
                <div className="card__calendar-view-toggle">
                  <button
                    type="button"
                    className={`card__calendar-view-button${card.view === "week" ? " card__calendar-view-button--active" : ""}`}
                    onClick={() => updateExistingCard(card.id, { view: "week" })}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    className={`card__calendar-view-button${card.view !== "week" ? " card__calendar-view-button--active" : ""}`}
                    onClick={() => updateExistingCard(card.id, { view: "month" })}
                  >
                    Month
                  </button>
                </div>

                <div className="card__calendar-nav">
                  <button type="button" className="card__calendar-nav-button" onClick={() => shiftMonth(-1)} aria-label="Previous month">◀</button>
                  <button type="button" className="card__calendar-nav-button card__calendar-nav-button--today" onClick={resetToToday}>Today</button>
                  <button type="button" className="card__calendar-nav-button" onClick={() => shiftMonth(1)} aria-label="Next month">▶</button>
                </div>
              </div>
            </header>

            <div className={`card__calendar-grid${card.view === "week" ? " card__calendar-grid--week" : ""}`}>
              {WEEKDAY_NAMES.map((weekday) => (
                <div key={weekday} className="card__calendar-weekday">{weekday}</div>
              ))}
              {(card.view === "week" ? monthCells.slice(0, 7) : monthCells).map((cell) => (
                <div
                  key={cell.key}
                  className={`card__calendar-day${cell.muted ? " card__calendar-day--muted" : ""}`}
                >
                  <span className="card__calendar-day-label">{cell.dayLabel}</span>
                  {cell.accent ? <span className="card__calendar-event-chip">eb</span> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(CalendarTile);
