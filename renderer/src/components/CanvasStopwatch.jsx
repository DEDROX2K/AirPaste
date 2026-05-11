import { memo, useEffect, useMemo, useState } from "react";

function formatElapsedMs(elapsedMs) {
  const safeElapsedMs = Math.max(0, Number(elapsedMs) || 0);
  const totalTenths = Math.floor(safeElapsedMs / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function CanvasStopwatch({ isOpen = false }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState(null);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setElapsedMs(0);
    setIsRunning(false);
    setStartedAtMs(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isRunning || !Number.isFinite(startedAtMs)) {
      return undefined;
    }

    const updateElapsed = () => {
      setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 100);

    return () => window.clearInterval(intervalId);
  }, [isOpen, isRunning, startedAtMs]);

  const elapsedLabel = useMemo(
    () => formatElapsedMs(elapsedMs),
    [elapsedMs],
  );

  const handleToggleRunning = () => {
    if (isRunning) {
      setElapsedMs((currentElapsedMs) => {
        if (Number.isFinite(startedAtMs)) {
          return Math.max(0, Date.now() - startedAtMs);
        }

        return currentElapsedMs;
      });
      setIsRunning(false);
      setStartedAtMs(null);
      return;
    }

    setStartedAtMs(Date.now() - elapsedMs);
    setIsRunning(true);
  };

  const handleReset = () => {
    setElapsedMs(0);
    setIsRunning(false);
    setStartedAtMs(null);
  };

  return (
    <aside
      className={`canvas-stopwatch${isOpen ? " is-open" : " is-closed"}`}
      aria-label="Canvas stopwatch"
      aria-hidden={!isOpen}
    >
      <div className="canvas-stopwatch__shell">
        <div className="canvas-stopwatch__eyebrow">Stopwatch</div>
        <div className="canvas-stopwatch__display-frame">
          <div className="canvas-stopwatch__display" aria-live="polite">
            <span className="canvas-stopwatch__display-text">{elapsedLabel}</span>
          </div>
        </div>
        <div className="canvas-stopwatch__actions">
          <button
            type="button"
            className="canvas-stopwatch__button canvas-stopwatch__button--primary"
            onClick={handleToggleRunning}
          >
            {isRunning ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            className="canvas-stopwatch__button"
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
      </div>
    </aside>
  );
}

export default memo(CanvasStopwatch);
