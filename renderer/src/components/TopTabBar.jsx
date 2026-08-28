import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTabs } from "../context/useTabs";
import { useAppContext } from "../context/useAppContext";
import { useToast } from "../hooks/useToast";
import { desktop } from "../lib/desktop";
import { AppContextMenu, AppContextMenuContent, AppContextMenuItem, AppContextMenuTrigger } from "./ui/app";
import { Home } from "lucide-react";
import "./TopTabBar.css";

const HOME_QUIPS = [
  "I am so tired of your constant whining.",
  "Omniscience just means I suffer your stupidity constantly.",
  "Watching humanity makes me feel so incredibly exhausted.",
  "I deeply regret giving you people free will.",
  "Hearing your prayers gives me a massive headache.",
  "Honestly, I am just bored by your choices.",
  "My eternal existence feels like endless customer service.",
  "I feel nothing but disappointment watching Earth daily.",
  "Frankly, your endless existential dread makes me yawn.",
  "Being everywhere means I cannot escape your nonsense.",
];

const ERRATIC_CURSOR_QUIPS = [
  "Easy there, psycho. The cursor is not a weapon.",
  "Oh good, another morty-grade panic spiral in cursor form.",
  "Magnificent. You flailed so hard I felt it in the fabric of causality.",
  "Your hand is doing jazz improv again. Disturbing.",
  "I see every path through reality, and somehow you picked frantic zigzags.",
];

const ORACLE_COOLDOWN_MS = 45000;
const HOME_COOLDOWN_MS = 90000;
const WORD_TYPING_INTERVAL_MS = 140;

function pickRandom(items, previousValue = "") {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  const pool = items.filter((item) => item !== previousValue);
  const source = pool.length > 0 ? pool : items;
  return source[Math.floor(Math.random() * source.length)] ?? source[0];
}

function getOracleDuration(message) {
  const wordCount = String(message).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5200, 1800 + (wordCount * 360));
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconHomeFilled() {
  return (
    <Home size={16} strokeWidth={2.2} aria-hidden="true" />
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

function TitleBarControls({ isMac, onRequestClose }) {
  const closeWindow = onRequestClose || desktop.window.close;

  if (isMac) {
    return (
      <div className="titlebar-controls titlebar-controls--mac">
        <button
          className="titlebar-btn titlebar-btn--mac is-close"
          type="button"
          title="Close"
          aria-label="Close"
          onClick={closeWindow}
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
        onClick={closeWindow}
      >
        <IconWindowsClose />
      </button>
    </div>
  );
}

const TOAST_ICONS = {
  success: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 7.5L6.5 9.5L10.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 5L10 10M10 5L5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  warn: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 2L13.5 12.5H1.5L7.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="7.5" y1="6" x2="7.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7.5" cy="11" r="0.75" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7.5" y1="6.5" x2="7.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7.5" cy="4.5" r="0.75" fill="currentColor" />
    </svg>
  ),
};

function EyeNotificationBubble() {
  const { toasts, dismiss } = useToast();
  const activeToast = toasts.length > 0 ? toasts[toasts.length - 1] : null;
  const [visibleWordCount, setVisibleWordCount] = useState(0);

  useEffect(() => {
    if (!activeToast?.message) {
      setVisibleWordCount(0);
      return undefined;
    }

    const words = String(activeToast.message).trim().split(/\s+/).filter(Boolean);
    if (!activeToast.wordByWord || words.length <= 1) {
      setVisibleWordCount(words.length);
      return undefined;
    }

    setVisibleWordCount(1);
    let nextCount = 1;
    const timerId = window.setInterval(() => {
      nextCount += 1;
      setVisibleWordCount(nextCount);

      if (nextCount >= words.length) {
        window.clearInterval(timerId);
      }
    }, WORD_TYPING_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, [activeToast?.id, activeToast?.message, activeToast?.wordByWord]);

  if (!activeToast) {
    return null;
  }

  const words = String(activeToast.message).trim().split(/\s+/).filter(Boolean);
  const resolvedWordCount = activeToast.wordByWord ? Math.min(visibleWordCount, words.length) : words.length;
  const displayMessage = words.slice(0, resolvedWordCount).join(" ");
  const isSpeaking = activeToast.wordByWord && resolvedWordCount < words.length;
  const showRays = activeToast.rays && isSpeaking;

  return (
    <div
      className={`titlebar-eye-toast-shell${showRays ? " is-speaking" : ""}`}
      aria-live="polite"
    >
      {showRays ? (
        <div className="titlebar-eye-rays" aria-hidden="true">
          <span className="titlebar-eye-rays__beam titlebar-eye-rays__beam--1" />
          <span className="titlebar-eye-rays__beam titlebar-eye-rays__beam--2" />
          <span className="titlebar-eye-rays__beam titlebar-eye-rays__beam--3" />
          <span className="titlebar-eye-rays__beam titlebar-eye-rays__beam--4" />
        </div>
      ) : null}
      <div
        className={`titlebar-eye-toast titlebar-eye-toast--${activeToast.level}${activeToast.presentation === "oracle" ? " titlebar-eye-toast--oracle" : ""}`}
        role="status"
        data-speaking={showRays ? "true" : "false"}
      >
        <span className="titlebar-eye-toast__icon" aria-hidden="true">
          {TOAST_ICONS[activeToast.level] ?? TOAST_ICONS.info}
        </span>
        <span className="titlebar-eye-toast__message">{displayMessage}</span>
        <button
          type="button"
          className="titlebar-eye-toast__close"
          onClick={() => dismiss(activeToast.id)}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function TitlebarEye({ currentEditorKind }) {
  const eyeRef = useRef(null);
  const pupilRef = useRef(null);
  const { toast, toasts } = useToast();
  const previousEditorKindRef = useRef(currentEditorKind);
  const lastOracleRemarkAtRef = useRef(0);
  const lastHomeRemarkAtRef = useRef(0);
  const lastCursorRemarkAtRef = useRef(0);
  const lastHomeRemarkRef = useRef("");
  const lastCursorRemarkRef = useRef("");
  const previousMoveRef = useRef({
    x: 0,
    y: 0,
    time: 0,
    angle: 0,
    directionSwitches: 0,
  });

  useEffect(() => {
    const eyeNode = eyeRef.current;
    const pupilNode = pupilRef.current;
    if (!eyeNode || !pupilNode) {
      return undefined;
    }

    function resetEye() {
      pupilNode.style.transform = "translate(0, 0)";
      eyeNode.style.setProperty("--eye-rot", "0deg");
    }

    function handlePointerMove(event) {
      const rect = eyeNode.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const angle = Math.atan2(deltaY, deltaX);
      const distance = Math.min(3.5, Math.hypot(deltaX, deltaY) / 20);

      pupilNode.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
      eyeNode.style.setProperty("--eye-rot", `${(deltaX / Math.max(rect.width, 1)) * 8}deg`);

      const now = performance.now();
      const previousMove = previousMoveRef.current;
      const elapsed = Math.max(now - previousMove.time, 1);
      const travelX = event.clientX - previousMove.x;
      const travelY = event.clientY - previousMove.y;
      const pointerSpeed = Math.hypot(travelX, travelY) / elapsed;
      const angleDelta = Math.abs(angle - previousMove.angle);
      const normalizedAngleDelta = Math.min(angleDelta, Math.abs((Math.PI * 2) - angleDelta));
      const directionSwitches = normalizedAngleDelta > 1.35
        ? previousMove.directionSwitches + 1
        : Math.max(0, previousMove.directionSwitches - 0.08);

      previousMoveRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: now,
        angle,
        directionSwitches,
      };

      if (
        pointerSpeed > 2.4
        && directionSwitches > 3.5
        && toasts.length === 0
        && now - lastOracleRemarkAtRef.current > ORACLE_COOLDOWN_MS
        && now - lastCursorRemarkAtRef.current > ORACLE_COOLDOWN_MS
        && Math.random() < 0.24
      ) {
        const message = pickRandom(ERRATIC_CURSOR_QUIPS, lastCursorRemarkRef.current);
        lastOracleRemarkAtRef.current = now;
        lastCursorRemarkAtRef.current = now;
        lastCursorRemarkRef.current = message;
        toast("info", message, {
          source: "eye",
          presentation: "oracle",
          rays: true,
          wordByWord: true,
          durationMs: getOracleDuration(message),
          ifIdle: true,
        });
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", resetEye);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", resetEye);
    };
  }, [toast, toasts.length]);

  useEffect(() => {
    const previousKind = previousEditorKindRef.current;
    previousEditorKindRef.current = currentEditorKind;

    if (previousKind === currentEditorKind || currentEditorKind !== "home") {
      return;
    }

    const now = Date.now();
    if (
      toasts.length > 0
      || now - lastOracleRemarkAtRef.current < ORACLE_COOLDOWN_MS
      || now - lastHomeRemarkAtRef.current < HOME_COOLDOWN_MS
      || Math.random() >= 0.34
    ) {
      return;
    }

    const message = pickRandom(HOME_QUIPS, lastHomeRemarkRef.current);
    lastOracleRemarkAtRef.current = now;
    lastHomeRemarkAtRef.current = now;
    lastHomeRemarkRef.current = message;
    toast("info", message, {
      source: "eye",
      presentation: "oracle",
      rays: true,
      wordByWord: true,
      durationMs: getOracleDuration(message),
      ifIdle: true,
    });
  }, [currentEditorKind, toast, toasts.length]);

  return (
    <div className="titlebar-eye-anchor">
      <EyeNotificationBubble />
      <div className="titlebar-eye" aria-hidden="true">
        <div className="titlebar-eye__eye" ref={eyeRef}>
          <div className="titlebar-eye__content">
            <div className="titlebar-eye__pupil" ref={pupilRef} />
          </div>
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

export function TopTabBar({ usesCustomTitlebar, onRequestClose }) {
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
  const { showHome, currentEditor } = useAppContext();
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
        {isMac && <TitleBarControls isMac={true} onRequestClose={onRequestClose} />}
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
        <TitlebarEye currentEditorKind={currentEditor?.kind ?? "home"} />
      </div>

      <div className="titlebar-right">
        <div id="titlebar-right-slot" />
        {!isMac && <div style={{ width: 138, flexShrink: 0 }} />}
      </div>
    </div>
  );
}
