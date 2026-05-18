import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTabs } from "../context/useTabs";
import { useAppContext } from "../context/useAppContext";
import { desktop } from "../lib/desktop";
import { AppContextMenu, AppContextMenuContent, AppContextMenuItem, AppContextMenuTrigger } from "./ui/app";
import "./TopTabBar.css";

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconHomeFilled() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.1 2.5 10.7h2.6V21h6.2v-6.1h1.4V21h6.2V10.7h2.6L12 3.1Z" />
    </svg>
  );
}

function IconWindowsMinimize() {
  return (
    <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
      <path d="M0 0.5 H10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function IconWindowsMaximize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function IconWindowsClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TitleBarControls({ isMac }) {
  if (isMac) {
    return (
      <div className="titlebar-controls titlebar-controls--mac">
        <button
          className="titlebar-btn titlebar-btn--mac is-close"
          type="button"
          title="Close"
          aria-label="Close"
          onClick={() => desktop.window.close()}
        />
        <button
          className="titlebar-btn titlebar-btn--mac is-minimize"
          type="button"
          title="Minimize"
          aria-label="Minimize"
          onClick={() => desktop.window.minimize()}
        />
        <button
          className="titlebar-btn titlebar-btn--mac is-maximize"
          type="button"
          title="Maximize"
          aria-label="Maximize"
          onClick={() => desktop.window.maximize()}
        />
      </div>
    );
  }

  return (
    <div className="titlebar-controls titlebar-controls--win">
      <button
        className="titlebar-btn titlebar-btn--win is-minimize"
        type="button"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => desktop.window.minimize()}
      >
        <IconWindowsMinimize />
      </button>

      <button
        className="titlebar-btn titlebar-btn--win is-maximize"
        type="button"
        title="Maximize"
        aria-label="Maximize"
        onClick={() => desktop.window.maximize()}
      >
        <IconWindowsMaximize />
      </button>

      <button
        className="titlebar-btn titlebar-btn--win is-close"
        type="button"
        title="Close"
        aria-label="Close"
        onClick={() => desktop.window.close()}
      >
        <IconWindowsClose />
      </button>
    </div>
  );
}

function CursorEye() {
  const eyeRef = useRef(null);
  const pupilRef = useRef(null);

  useEffect(() => {
    const eye = eyeRef.current;
    const pupil = pupilRef.current;
    if (!eye || !pupil) return undefined;

    let rafId = 0;
    let target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let current = { x: target.x, y: target.y };
    let targetAngle = 0;
    let currentAngle = 0;
    let currentPupil = { x: 0, y: 0 };

    const lerp = (from, to, t) => from + (to - from) * t;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const normalizeAngle = (degrees) => {
      let value = degrees % 360;
      if (value > 180) value -= 360;
      if (value < -180) value += 360;
      return value;
    };

    const tick = () => {
      rafId = window.requestAnimationFrame(tick);

      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      current.x = lerp(current.x, target.x, 0.16);
      current.y = lerp(current.y, target.y, 0.16);

      const dx = current.x - cx;
      const dy = current.y - cy;

      // Match the original site's orientation (atan2 arguments swapped + inverted).
      const rad = Math.atan2(current.x - cx, current.y - cy);
      targetAngle = normalizeAngle((rad * (180 / Math.PI) * -1));

      const delta = normalizeAngle(targetAngle - currentAngle);
      currentAngle = normalizeAngle(currentAngle + delta * 0.18);
      eye.style.setProperty("--eye-rot", `${currentAngle}deg`);

      const dist = Math.hypot(dx, dy);
      const travel = clamp(dist / 50, 0, 1) * 7;
      const angle = Math.atan2(dy, dx);
      const px = Math.cos(angle) * travel;
      const py = Math.sin(angle) * travel;
      currentPupil.x = lerp(currentPupil.x, px, 0.22);
      currentPupil.y = lerp(currentPupil.y, py, 0.22);
      pupil.style.transform = `translate(${currentPupil.x.toFixed(2)}px, ${currentPupil.y.toFixed(2)}px)`;
    };

    const onMove = (event) => {
      target = { x: event.clientX, y: event.clientY };
    };

    const onLeave = () => {
      target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="titlebar-eye" aria-hidden="true">
      <div className="titlebar-eye__eye" ref={eyeRef}>
        <div className="titlebar-eye__content">
          <div className="titlebar-eye__pupil" ref={pupilRef} />
        </div>
      </div>
    </div>
  );
}

function TabItem({
  tab,
  isActive,
  canReopenClosedTab,
  onActivate,
  onClose,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onReopenClosedTab,
  onDragStart,
  onDragOver,
  onDragEnd,
}) {
  const isHome = tab.id === "home";
  const tabClassName = `titlebar-tab ${isHome ? "titlebar-tab--home" : "titlebar-tab--file"} ${isActive ? "titlebar-tab--active" : ""}`;

  return (
    <AppContextMenu>
      <AppContextMenuTrigger asChild>
        <div
          data-tab-id={tab.id}
          className={tabClassName}
          draggable={tab.closable}
          onClick={onActivate}
          onMouseDown={(event) => {
            if (event.button === 1 && tab.closable) {
              event.preventDefault();
              onClose();
            }
          }}
          onDragStart={(event) => onDragStart(event, tab.id)}
          onDragOver={(event) => onDragOver(event, tab.id)}
          onDragEnd={onDragEnd}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onActivate();
            }
          }}
          title={tab.title}
          aria-label={tab.title}
        >
          {isHome ? (
            <span className="titlebar-home-icon" aria-hidden="true">
              <IconHomeFilled />
            </span>
          ) : (
            <>
              <span className="titlebar-tab-label">{tab.title}</span>
              {tab.closable ? (
                <button
                  type="button"
                  className="titlebar-tab-close"
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                  }}
                  title="Close tab"
                  aria-label="Close tab"
                >
                  <IconClose />
                </button>
              ) : null}
            </>
          )}
        </div>
      </AppContextMenuTrigger>

      <AppContextMenuContent className="titlebar-tab-menu">
        <AppContextMenuItem disabled={!tab.closable} onSelect={onClose}>
          Close Tab
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={onCloseOtherTabs}>
          Close Other Tabs
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={onCloseTabsToRight}>
          Close Tabs to the Right
        </AppContextMenuItem>
        <AppContextMenuItem disabled={!canReopenClosedTab} onSelect={onReopenClosedTab}>
          Reopen Closed Tab
        </AppContextMenuItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
}

export function TopTabBar({ usesCustomTitlebar }) {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    moveTab,
    closeTab,
    reopenClosedTab,
    closeOtherTabs,
    closeTabsToRight,
    canReopenClosedTab,
  } = useTabs();
  const { showHome } = useAppContext();
  const tabRefs = useRef(new Map());
  const previousRectsRef = useRef(new Map());
  const [draggedTabId, setDraggedTabId] = useState(null);

  const orderedTabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  useLayoutEffect(() => {
    const nextRects = new Map();

    orderedTabIds.forEach((tabId) => {
      const node = tabRefs.current.get(tabId);
      if (!node) {
        return;
      }

      const nextRect = node.getBoundingClientRect();
      nextRects.set(tabId, nextRect);

      const previousRect = previousRectsRef.current.get(tabId);
      if (!previousRect) {
        return;
      }

      const deltaX = previousRect.left - nextRect.left;
      if (Math.abs(deltaX) < 1) {
        return;
      }

      node.style.transition = "none";
      node.style.transform = `translateX(${deltaX}px)`;

      requestAnimationFrame(() => {
        node.style.transition = "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        node.style.transform = "";
      });
    });

    previousRectsRef.current = nextRects;
  }, [orderedTabIds]);

  if (!usesCustomTitlebar) {
    return null;
  }

  function registerTabRef(tabId, node) {
    if (!node) {
      tabRefs.current.delete(tabId);
      return;
    }

    tabRefs.current.set(tabId, node);
  }

  function handleDragStart(event, tabId) {
    if (tabId === "home") {
      event.preventDefault();
      return;
    }

    setDraggedTabId(tabId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tabId);
  }

  function handleDragOver(event, targetTabId) {
    if (!draggedTabId || draggedTabId === targetTabId) {
      return;
    }

    event.preventDefault();
    const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId);
    if (targetIndex === -1) {
      return;
    }

    const targetRect = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientX > targetRect.left + (targetRect.width / 2);
    moveTab(draggedTabId, targetIndex + (insertAfter ? 1 : 0));
  }

  function handleDragEnd() {
    setDraggedTabId(null);
  }

  const isMac = typeof window !== "undefined" && navigator.userAgent.includes("Mac");

  return (
    <div
      className="titlebar-root"
      onDoubleClick={() => {
        desktop.window?.maximize?.();
      }}
    >
      <div className="titlebar-left">
        {isMac && <TitleBarControls isMac={true} />}
        <div className="titlebar-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              ref={(node) => registerTabRef(tab.id, node)}
              className={`titlebar-tab-shell ${draggedTabId === tab.id ? "titlebar-tab-shell--dragging" : ""}`}
            >
              <TabItem
                tab={tab}
                isActive={tab.id === activeTabId}
                canReopenClosedTab={canReopenClosedTab}
                onActivate={() => {
                  if (tab.id === "home") {
                    void showHome();
                    return;
                  }
                  setActiveTab(tab.id);
                }}
                onClose={() => closeTab(tab.id)}
                onCloseOtherTabs={() => closeOtherTabs(tab.id)}
                onCloseTabsToRight={() => closeTabsToRight(tab.id)}
                onReopenClosedTab={reopenClosedTab}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              />
            </div>
          ))}
        </div>
      </div>

      <div id="titlebar-center-slot">
        <CursorEye />
      </div>

      <div className="titlebar-right">
        <div id="titlebar-right-slot" />
        {!isMac && <div style={{ width: 138, flexShrink: 0 }} />}
      </div>
    </div>
  );
}
