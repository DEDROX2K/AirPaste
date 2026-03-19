import { useEffect, useMemo, useRef, useState } from "react";

const ZOOM_PRESETS = [50, 100, 200];

function formatZoomLabel(zoom) {
  return `${Math.round(zoom * 100)}%`;
}

function normalizeZoomPercent(value) {
  const numericValue = Number.parseFloat(String(value).replace(/[^\d.]/g, ""));

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue / 100;
}

export default function CanvasZoomMenu({
  zoom,
  canFitAll,
  canFitSelection,
  onZoomIn,
  onZoomOut,
  onZoomToFitAll,
  onZoomToFitSelection,
  onSetZoom,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(formatZoomLabel(zoom));
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const zoomLabel = useMemo(() => formatZoomLabel(zoom), [zoom]);

  useEffect(() => {
    setInputValue(formatZoomLabel(zoom));
  }, [zoom]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleEscape(event) {
      if (event.key !== "Escape") {
        return;
      }

      setIsOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isOpen]);

  function commitInputValue() {
    const nextZoom = normalizeZoomPercent(inputValue);

    if (nextZoom) {
      onSetZoom(nextZoom);
    }

    setInputValue(formatZoomLabel(nextZoom ?? zoom));
  }

  function runMenuAction(action) {
    action?.();
    setIsOpen(false);
  }

  return (
    <div ref={rootRef} className="zoom-menu">
      <button
        className={`zoom-menu__trigger${isOpen ? " zoom-menu__trigger--open" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        <span>{zoomLabel}</span>
        <span className="zoom-menu__caret" aria-hidden="true">⌄</span>
      </button>

      {isOpen ? (
        <div className="zoom-menu__panel" role="menu" onPointerDown={(event) => event.stopPropagation()}>
          <div className="zoom-menu__section">
            <input
              ref={inputRef}
              className="zoom-menu__input"
              type="text"
              value={inputValue}
              aria-label="Zoom percentage"
              onChange={(event) => setInputValue(event.target.value)}
              onBlur={commitInputValue}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitInputValue();
                  setIsOpen(false);
                }
              }}
            />
          </div>

          <div className="zoom-menu__section">
            <button className="zoom-menu__action" type="button" onClick={() => runMenuAction(onZoomIn)}>
              <span>Zoom in</span>
              <kbd>Ctrl++</kbd>
            </button>
            <button className="zoom-menu__action" type="button" onClick={() => runMenuAction(onZoomOut)}>
              <span>Zoom out</span>
              <kbd>Ctrl+-</kbd>
            </button>
            <button className="zoom-menu__action" type="button" onClick={() => runMenuAction(onZoomToFitAll)} disabled={!canFitAll}>
              <span>Zoom to fit</span>
              <kbd>Shift+1</kbd>
            </button>
            <button className="zoom-menu__action" type="button" onClick={() => runMenuAction(onZoomToFitSelection)} disabled={!canFitSelection}>
              <span>Zoom to selection</span>
            </button>
          </div>

          <div className="zoom-menu__section">
            {ZOOM_PRESETS.map((preset) => (
              <button
                key={preset}
                className="zoom-menu__action"
                type="button"
                onClick={() => runMenuAction(() => onSetZoom(preset / 100))}
              >
                <span>{`Zoom to ${preset}%`}</span>
                {preset === 100 ? <kbd>Ctrl+0</kbd> : <span />}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
