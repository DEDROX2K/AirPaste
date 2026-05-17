import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DOCK_INFLUENCE_RADIUS = 156;
const STACK_CLOSE_DELAY_MS = 140;
const ASSET_BASE_URL = import.meta.env.BASE_URL;

function assetUrl(relativePath) {
  return `${ASSET_BASE_URL}${String(relativePath).replace(/^\/+/, "")}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getDockItemScale(pointerX, itemCenterX) {
  if (!Number.isFinite(pointerX) || !Number.isFinite(itemCenterX)) {
    return 1;
  }

  const distance = Math.abs(pointerX - itemCenterX);
  const intensity = clamp01(1 - (distance / DOCK_INFLUENCE_RADIUS));
  return 1 + (0.38 * (intensity ** 1.6));
}

function getDockItemOffset(scale) {
  if (scale <= 1) {
    return 0;
  }

  return -Math.round((scale - 1) * 26);
}

function DockIcon({ iconSrc }) {
  return (
    <span className="canvas-dock__icon" aria-hidden="true">
      {iconSrc ? (
        <img className="canvas-dock__icon-image" src={iconSrc} alt="" />
      ) : (
        <span className="canvas-dock__icon-placeholder" />
      )}
    </span>
  );
}

function getFanPosition(index) {
  const positions = [
    { offsetX: 0, offsetY: 24, rotation: -2 },
    { offsetX: 12, offsetY: 48, rotation: 3 },
    { offsetX: 28, offsetY: 70, rotation: 8 },
    { offsetX: 46, offsetY: 90, rotation: 12 },
  ];

  return positions[index] ?? positions[positions.length - 1];
}

function DockButton({
  item,
  isDockActive,
  isLabelVisible,
  itemCenterX,
  pointerX,
  onFocusStart,
  onFocusEnd,
  onHoverStart,
  onHoverEnd,
  onToggleStack,
  onSelectChild,
  registerItemRef,
}) {
  const scale = getDockItemScale(pointerX, itemCenterX);
  const translateY = getDockItemOffset(scale);
  const showLabel = isDockActive && isLabelVisible;
  const isStackItem = Array.isArray(item.children) && item.children.length > 0;

  return (
    <div
      className={`canvas-dock__item-wrap${isStackItem ? " canvas-dock__item-wrap--stack" : ""}${item.hasDivider ? " canvas-dock__item-wrap--divider" : ""}${item.isStackOpen ? " canvas-dock__item-wrap--open" : ""}`}
      onPointerEnter={() => onHoverStart(item)}
      onPointerLeave={() => onHoverEnd(item)}
    >
      <button
        ref={(node) => registerItemRef(item.key, node)}
        type="button"
        className={`canvas-dock__item${item.isActive ? " canvas-dock__item--active" : ""}${item.kind === "utility" ? " canvas-dock__item--utility" : ""}${showLabel ? " canvas-dock__item--spotlight" : ""}`}
        disabled={item.disabled}
        aria-label={item.ariaLabel || item.label}
        aria-pressed={item.isToggle ? item.isActive === true : undefined}
        aria-expanded={isStackItem ? item.isStackOpen === true : undefined}
        title={item.label}
        onClick={() => {
          if (isStackItem) {
            onToggleStack(item.key);
            return;
          }

          void item.onSelect?.();
        }}
        onFocus={() => onFocusStart(item.key)}
        onBlur={onFocusEnd}
        style={{
          "--dock-item-scale": String(scale),
          "--dock-item-translate-y": `${translateY}px`,
        }}
      >
        {showLabel ? (
          <span className="canvas-dock__label" aria-hidden="true">
            {item.label}
          </span>
        ) : null}
        <DockIcon iconSrc={item.iconSrc} />
        <span className="canvas-dock__indicator" aria-hidden="true" />
      </button>

      {isStackItem && item.isStackOpen ? (
        <div className="canvas-dock__fan" role="menu" aria-label={`${item.label} stack`}>
          {item.children.map((child, childIndex) => {
            const fanPosition = getFanPosition(childIndex);

            return (
              <button
                key={child.key}
                type="button"
                className="canvas-dock__fan-item"
                role="menuitem"
                title={child.label}
                aria-label={child.label}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectChild(item.key, child.onSelect);
                }}
                style={{
                  "--dock-fan-offset-x": `${fanPosition.offsetX}px`,
                  "--dock-fan-offset-y": `${fanPosition.offsetY}px`,
                  "--dock-fan-rotation": `${fanPosition.rotation}deg`,
                }}
              >
                <span className="canvas-dock__fan-label">{child.label}</span>
                <DockIcon iconSrc={child.iconSrc} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function CanvasDock({
  commands,
  disabled = false,
  isCalculatorOpen = false,
  isStopwatchOpen = false,
  onToggleCalculator,
  onToggleStopwatch,
}) {
  const itemRefs = useRef(new Map());
  const closeTimerRef = useRef(null);
  const [pointerX, setPointerX] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [openStackKey, setOpenStackKey] = useState("");

  const items = useMemo(() => ([
    {
      key: "write",
      label: "Write",
      kind: "stack",
      disabled,
      children: [
        { key: "text-card", label: "Text card", onSelect: () => commands?.createTextCard?.() },
        { key: "vault-note", label: "Vault note", onSelect: () => commands?.addNoteFromVault?.() },
        { key: "checklist", label: "Checklist", onSelect: () => commands?.createChecklist?.() },
        { key: "sticky", label: "Sticky note", onSelect: () => commands?.createSticky?.() },
      ],
    },
    {
      key: "plan",
      label: "Plan",
      kind: "stack",
      disabled,
      children: [
        { key: "progress", label: "Progress", onSelect: () => commands?.createProgress?.() },
        { key: "deadline", label: "Deadline", onSelect: () => commands?.createDeadline?.() },
        { key: "calendar", label: "Calendar", onSelect: () => commands?.createCalendar?.() },
      ],
    },
    { key: "table", label: "Table", kind: "create", onSelect: () => commands?.createTable?.(), disabled },
    { key: "rack", label: "Rack", kind: "create", onSelect: () => commands?.createRack?.(), disabled },
    { key: "code", label: "Code", kind: "create", onSelect: () => commands?.createCode?.(), disabled },
    { key: "counter", label: "Counter", kind: "create", onSelect: () => commands?.createCounter?.(), disabled },
    { key: "link", label: "Link", kind: "create", onSelect: () => commands?.createLinkFromClipboard?.(), disabled },
    {
      key: "stopwatch",
      label: "Stopwatch",
      kind: "utility",
      hasDivider: true,
      iconSrc: assetUrl("tilesimg/Stopwatch.png"),
      isToggle: true,
      isActive: isStopwatchOpen,
      onSelect: onToggleStopwatch,
      disabled: false,
      ariaLabel: isStopwatchOpen ? "Hide stopwatch" : "Show stopwatch",
    },
    {
      key: "calculator",
      label: "Calculator",
      kind: "utility",
      iconSrc: assetUrl("tilesimg/calculator.png"),
      isToggle: true,
      isActive: isCalculatorOpen,
      onSelect: onToggleCalculator,
      disabled: false,
      ariaLabel: isCalculatorOpen ? "Hide calculator" : "Show calculator",
    },
  ]), [
    commands,
    disabled,
    isCalculatorOpen,
    isStopwatchOpen,
    onToggleCalculator,
    onToggleStopwatch,
  ]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  const registerItemRef = useCallback((key, node) => {
    if (!node) {
      itemRefs.current.delete(key);
      return;
    }

    itemRefs.current.set(key, node);
  }, []);

  const handleDockPointerMove = useCallback((event) => {
    let nextActiveIndex = -1;
    let smallestDistance = Number.POSITIVE_INFINITY;

    items.forEach((item, index) => {
      const node = itemRefs.current.get(item.key);
      const rect = node?.getBoundingClientRect?.();

      if (!rect) {
        return;
      }

      const centerX = rect.left + (rect.width / 2);
      const distance = Math.abs(event.clientX - centerX);

      if (distance < smallestDistance) {
        smallestDistance = distance;
        nextActiveIndex = index;
      }
    });

    setPointerX(event.clientX);
    setActiveIndex(nextActiveIndex);
  }, [items]);

  const scheduleStackClose = useCallback((key = "") => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpenStackKey((currentKey) => {
        if (!key || currentKey === key) {
          return "";
        }

        return currentKey;
      });
      closeTimerRef.current = null;
    }, STACK_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const handleDockPointerLeave = useCallback(() => {
    setPointerX(null);
    setActiveIndex(-1);
    scheduleStackClose();
  }, [scheduleStackClose]);

  const handleDockItemFocus = useCallback((key) => {
    clearCloseTimer();
    const itemIndex = items.findIndex((item) => item.key === key);
    const node = itemRefs.current.get(key);
    const rect = node?.getBoundingClientRect?.();
    const focusedItem = items[itemIndex] ?? null;

    setActiveIndex(itemIndex);
    setPointerX(rect ? rect.left + (rect.width / 2) : null);
    setOpenStackKey(focusedItem?.children?.length ? key : "");
  }, [clearCloseTimer, items]);

  const handleDockItemHover = useCallback((item) => {
    clearCloseTimer();
    const itemIndex = items.findIndex((entry) => entry.key === item.key);
    const node = itemRefs.current.get(item.key);
    const rect = node?.getBoundingClientRect?.();

    setActiveIndex(itemIndex);
    setPointerX(rect ? rect.left + (rect.width / 2) : null);
    setOpenStackKey(item.children?.length ? item.key : "");
  }, [clearCloseTimer, items]);

  const handleDockItemLeave = useCallback((item) => {
    if (item.children?.length) {
      scheduleStackClose(item.key);
    }
  }, [scheduleStackClose]);

  const handleStackToggle = useCallback((key) => {
    clearCloseTimer();
    setOpenStackKey((currentKey) => currentKey === key ? "" : key);
  }, [clearCloseTimer]);

  const handleSelectChild = useCallback((stackKey, onSelect) => {
    clearCloseTimer();
    setOpenStackKey("");
    void onSelect?.();
    setTimeout(() => {
      setOpenStackKey((currentKey) => currentKey === stackKey ? "" : currentKey);
    }, 0);
  }, [clearCloseTimer]);

  return (
    <div
      className="canvas-dock"
      aria-label="Canvas dock"
      onPointerMove={handleDockPointerMove}
      onPointerLeave={handleDockPointerLeave}
      onPointerEnter={clearCloseTimer}
    >
      <div className="canvas-dock__scroller">
        <div className="canvas-dock__rail">
          {items.map((item, index) => (
            <DockButton
              key={item.key}
              item={{
                ...item,
                isStackOpen: openStackKey === item.key,
              }}
              isDockActive={activeIndex >= 0}
              isLabelVisible={activeIndex === index}
              itemCenterX={itemRefs.current.get(item.key)?.getBoundingClientRect?.().left != null
                ? (itemRefs.current.get(item.key).getBoundingClientRect().left + (itemRefs.current.get(item.key).getBoundingClientRect().width / 2))
                : null}
              pointerX={pointerX}
              onFocusStart={handleDockItemFocus}
              onFocusEnd={handleDockPointerLeave}
              onHoverStart={handleDockItemHover}
              onHoverEnd={handleDockItemLeave}
              onToggleStack={handleStackToggle}
              onSelectChild={handleSelectChild}
              registerItemRef={registerItemRef}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
