import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTabs } from "../context/useTabs";
import { desktop } from "../lib/desktop";
import {
  AppButton,
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from "./ui/app";
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

function IconWindowToggle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3.25" y="3.25" width="7.5" height="7.5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconWindowMinimize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 7H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconWindowClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TitleBarControls() {
  return (
    <div className="titlebar-controls">
      <AppButton
        tone="unstyled"
        className="titlebar-btn titlebar-btn--minimize"
        type="button"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => desktop.window.minimize()}
      >
        <IconWindowMinimize />
      </AppButton>

      <AppButton
        tone="unstyled"
        className="titlebar-btn titlebar-btn--maximize"
        type="button"
        title="Toggle maximize"
        aria-label="Toggle maximize"
        onClick={() => desktop.window.maximize()}
      >
        <IconWindowToggle />
      </AppButton>

      <AppButton
        tone="unstyled"
        className="titlebar-btn titlebar-btn--close"
        type="button"
        title="Close"
        aria-label="Close"
        onClick={() => desktop.window.close()}
      >
        <IconWindowClose />
      </AppButton>
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
                <AppButton
                  tone="unstyled"
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
                </AppButton>
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

  return (
    <div
      className="titlebar-root"
      onDoubleClick={() => {
        desktop.window?.maximize?.();
      }}
    >
      <div className="titlebar-left">
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
                onActivate={() => setActiveTab(tab.id)}
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

      <div id="titlebar-center-slot" />

      <div className="titlebar-right">
        <div id="titlebar-right-slot" />
        <TitleBarControls />
      </div>
    </div>
  );
}
