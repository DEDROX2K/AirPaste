import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTabs } from "../context/useTabs";
import { useAppContext } from "../context/useAppContext";
import { useToast } from "../hooks/useToast";
import { desktop } from "../lib/desktop";
import { openLaunchSplash } from "../lib/launchSplash";
import CanvasHistoryDialog from "./CanvasHistoryDialog";
import { AppContextMenu, AppContextMenuContent, AppContextMenuItem, AppContextMenuTrigger } from "./ui/app";
import { Check, ErrorIcon, Home, Info, Minus, Square, Warning, X } from "./ui/icons";
import { canRemarkNow, ERRATIC_CURSOR_QUIPS, HOME_QUIPS, pickRandom, speakOracle } from "../lib/eyeCommentary";
import "./TopTabBar.css";

const HOME_COOLDOWN_MS = 90000;
const WORD_TYPING_INTERVAL_MS = 140;
const TOAST_EXIT_MS = 160;
const EYE_CLOSE_MS = 1000;

// Empty titlebar space moves the window (main/windows.js moves it; a CSS
// drag region would force the native cursor). Controls stay clickable.
const NO_WINDOW_DRAG_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[role='tab']",
  "[contenteditable='true']",
  ".titlebar-eye",
  ".titlebar-eye-toast-shell",
  "[data-no-window-drag]",
].join(", ");

function handleTitlebarPointerDown(event) {
  if (event.button !== 0 || event.target.closest(NO_WINDOW_DRAG_SELECTOR)) {
    return;
  }

  const target = event.currentTarget;
  const pointerId = event.pointerId;
  target.setPointerCapture?.(pointerId);
  desktop.window?.moveStart?.();

  const endMove = () => {
    desktop.window?.moveEnd?.();
    target.releasePointerCapture?.(pointerId);
    target.removeEventListener("pointerup", endMove);
    target.removeEventListener("pointercancel", endMove);
    window.removeEventListener("blur", endMove);
  };

  target.addEventListener("pointerup", endMove);
  target.addEventListener("pointercancel", endMove);
  window.addEventListener("blur", endMove);
}

function IconClose() {
  return <X size={12} aria-hidden="true" />;
}

function IconHomeFilled() {
  return (
    <Home size={18} aria-hidden="true" />
  );
}

function IconWindowsMinimize() {
  return <Minus size={12} aria-hidden="true" />;
}

function IconWindowsMaximize() {
  return <Square size={12} aria-hidden="true" />;
}

function IconWindowsClose() {
  return <X size={12} aria-hidden="true" />;
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
  success: <Check size={15} aria-hidden="true" />,
  error: <ErrorIcon size={15} aria-hidden="true" />,
  warn: <Warning size={15} aria-hidden="true" />,
  info: <Info size={15} aria-hidden="true" />,
};

function EyeNotificationBubble({ onRequestClose }) {
  const { toasts, dismiss } = useToast();
  const activeToast = toasts.length > 0 ? toasts[toasts.length - 1] : null;
  const [renderedToast, setRenderedToast] = useState(null);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef(null);
  const [visibleWordCount, setVisibleWordCount] = useState(0);

  // The toast is dismissed by removing it from the toasts array -- but a
  // fade-out needs the bubble to stay mounted a little longer than that, so
  // we keep showing the last toast we rendered until the exit fade finishes.
  useEffect(() => {
    if (activeToast) {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setIsExiting(false);
      setRenderedToast(activeToast);
      return undefined;
    }

    if (!renderedToast) {
      return undefined;
    }

    setIsExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      setRenderedToast(null);
      setIsExiting(false);
      exitTimerRef.current = null;
    }, TOAST_EXIT_MS);

    return () => {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeToast]);

  useEffect(() => {
    if (!renderedToast?.message) {
      setVisibleWordCount(0);
      return undefined;
    }

    const words = String(renderedToast.message).trim().split(/\s+/).filter(Boolean);
    if (!renderedToast.wordByWord || words.length <= 1) {
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
  }, [renderedToast?.id, renderedToast?.message, renderedToast?.wordByWord]);

  if (!renderedToast) {
    return null;
  }

  const words = String(renderedToast.message).trim().split(/\s+/).filter(Boolean);
  const resolvedWordCount = renderedToast.wordByWord ? Math.min(visibleWordCount, words.length) : words.length;
  const displayMessage = words.slice(0, resolvedWordCount).join(" ");
  const isSpeaking = renderedToast.wordByWord && resolvedWordCount < words.length;
  const showRays = renderedToast.rays && isSpeaking;

  function handleActivate() {
    onRequestClose?.();
    if (activeToast) {
      dismiss(activeToast.id);
    }
  }

  return (
    <div
      className={`titlebar-eye-toast-shell${showRays ? " is-speaking" : ""}${isExiting ? " is-exiting" : ""}`}
      aria-live="polite"
    >
      {showRays ? <div className="titlebar-eye-rays" aria-hidden="true" /> : null}
      <div
        className={`titlebar-eye-toast titlebar-eye-toast--${renderedToast.level}${renderedToast.presentation === "oracle" ? " titlebar-eye-toast--oracle" : ""}`}
        role="status"
        data-speaking={showRays ? "true" : "false"}
        onClick={handleActivate}
      >
        <span className="titlebar-eye-toast__icon" aria-hidden="true">
          {TOAST_ICONS[renderedToast.level] ?? TOAST_ICONS.info}
        </span>
        <span className="titlebar-eye-toast__message">{displayMessage}</span>
      </div>
    </div>
  );
}

function TitlebarEye({ currentEditorKind }) {
  const eyeRef = useRef(null);
  const pupilRef = useRef(null);
  const { toast, toasts, dismiss } = useToast();
  const previousEditorKindRef = useRef(currentEditorKind);
  const lastHomeRemarkAtRef = useRef(0);
  const lastHomeRemarkRef = useRef("");
  const lastCursorRemarkRef = useRef("");
  const [isEyeClosed, setIsEyeClosed] = useState(false);
  const eyeCloseTimerRef = useRef(null);
  const previousMoveRef = useRef({
    x: 0,
    y: 0,
    time: 0,
    angle: 0,
    directionSwitches: 0,
  });

  const handleEyeActivate = useCallback(() => {
    if (toasts.length > 0) {
      dismiss(toasts[toasts.length - 1].id);
    }

    setIsEyeClosed(true);
    if (eyeCloseTimerRef.current) {
      window.clearTimeout(eyeCloseTimerRef.current);
    }
    eyeCloseTimerRef.current = window.setTimeout(() => {
      setIsEyeClosed(false);
      eyeCloseTimerRef.current = null;
    }, EYE_CLOSE_MS);
  }, [dismiss, toasts]);

  useEffect(() => () => {
    if (eyeCloseTimerRef.current) {
      window.clearTimeout(eyeCloseTimerRef.current);
    }
  }, []);

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
        && canRemarkNow()
        && Math.random() < 0.24
      ) {
        const message = pickRandom(ERRATIC_CURSOR_QUIPS, lastCursorRemarkRef.current);
        lastCursorRemarkRef.current = message;
        speakOracle(toast, message);
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
      || !canRemarkNow()
      || now - lastHomeRemarkAtRef.current < HOME_COOLDOWN_MS
      || Math.random() >= 0.34
    ) {
      return;
    }

    const message = pickRandom(HOME_QUIPS, lastHomeRemarkRef.current);
    lastHomeRemarkAtRef.current = now;
    lastHomeRemarkRef.current = message;
    speakOracle(toast, message);
  }, [currentEditorKind, toast, toasts.length]);

  return (
    <div className="titlebar-eye-anchor">
      <EyeNotificationBubble onRequestClose={handleEyeActivate} />
      <div className="titlebar-eye" aria-hidden="true" onClick={handleEyeActivate}>
        <div className={`titlebar-eye__eye${isEyeClosed ? " titlebar-eye__eye--closed" : ""}`} ref={eyeRef}>
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
  onShowHistory,
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
          onClick={() => {
            // Home logo clicked while already on Home: show the splash.
            if (isHome && isActive) {
              openLaunchSplash();
              return;
            }
            onActivate();
          }}
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
        {tab.type === "canvas" ? (
          <AppContextMenuItem onSelect={onShowHistory}>
            Version History
          </AppContextMenuItem>
        ) : null}
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
  const [historyDialogTab, setHistoryDialogTab] = useState(null);

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
      className={`titlebar-root${desktop.window.usesCustomWindowMove ? "" : " titlebar-root--native-drag"}`}
      onPointerDown={desktop.window.usesCustomWindowMove ? handleTitlebarPointerDown : undefined}
      onDoubleClick={(event) => {
        if (!event.target.closest(NO_WINDOW_DRAG_SELECTOR)) {
          desktop.window?.maximize?.();
        }
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
                onShowHistory={() => setHistoryDialogTab(tab)}
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

      <CanvasHistoryDialog
        open={Boolean(historyDialogTab)}
        canvasPath={historyDialogTab?.entityId ?? null}
        canvasTitle={historyDialogTab?.title ?? ""}
        onClose={() => setHistoryDialogTab(null)}
      />
    </div>
  );
}
