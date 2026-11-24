import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTabs } from "../context/useTabs";
import { getDragSlot } from "../context/tabOrder";
import { useAppContext } from "../context/useAppContext";
import { useToast } from "../hooks/useToast";
import { desktop } from "../lib/desktop";
import { openLaunchSplash } from "../lib/launchSplash";
import CanvasHistoryDialog from "./CanvasHistoryDialog";
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "./ui/app";
import { Check, ChevronRight, CurvedView, ErrorIcon, Feedback, Home, HomeGlyph, Info, Minus, PaneLeft, PaneRight, Pencil, RefreshCw, Share, SplitColumns, SplitRows, SwapHorizontal, Timer, Unlink, Warning, X } from "./ui/icons";
import { toggleCurvedView, useCurvedView } from "../lib/curvedView";
import { canRemarkNow, ERRATIC_CURSOR_QUIPS, HOME_QUIPS, pickRandom, speakOracle } from "../lib/eyeCommentary";
import { useSplitView } from "../context/SplitViewContext";
import TabDetachOverlay from "./canvas/TabDetachOverlay";
import "./TopTabBar.css";

const HOME_COOLDOWN_MS = 90000;
const WORD_TYPING_INTERVAL_MS = 140;
const TOAST_EXIT_MS = 160;
const EYE_CLOSE_MS = 1000;
// The cursor-following eye is hidden for now; toasts show in ToastStack.
const SHOW_TITLEBAR_EYE = false;

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

// macOS traffic lights, drawn in-app. Windows uses the system's own
// minimize / maximize / close buttons (main/windows.js titleBarOverlay),
// tinted to blend into this bar; the bar leaves room for them on the right.
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

  return null;
}

// Top-left: one Home button. On Home it shows the AirPaste logo (click =
// splash); in a file it shows a house icon (click = back to Home). The clock
// and live pill are removed for now.
function TitlebarCluster({ isHomeActive, isCanvasActive = false, onHome }) {
  const isCurved = useCurvedView();

  return (
    <div className="titlebar-cluster" aria-label="Home">
      <button
        type="button"
        className="titlebar-cluster__chip titlebar-cluster__logo"
        onClick={() => {
          if (isHomeActive) {
            openLaunchSplash();
            return;
          }
          onHome();
        }}
        title={isHomeActive ? "AirPaste" : "Back to Home"}
        aria-label="Home"
        aria-current={isHomeActive ? "page" : undefined}
      >
        {isHomeActive ? <IconHomeFilled /> : <HomeGlyph size={20} aria-hidden="true" />}
      </button>
      {isCanvasActive ? (
        <button
          type="button"
          className={`titlebar-cluster__chip titlebar-cluster__logo titlebar-cluster__curve${isCurved ? " is-on" : ""}`}
          onClick={toggleCurvedView}
          title={isCurved ? "Curved view: on" : "Curved view: off"}
          aria-label="Curved view"
          aria-pressed={isCurved}
        >
          <CurvedView size={20} aria-hidden="true" />
        </button>
      ) : null}
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
  onShare,
  onRename,
  onDragPointerDown,
  shouldIgnoreClick,
  onSeparate,
}) {
  const isHome = tab.id === "home";
  const canRename = !isHome && Boolean(tab.entityId) && typeof onRename === "function";
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const renameInputRef = useRef(null);
  // Set when "Rename" is picked, so the menu closing doesn't hand focus back
  // to the tab (which would blur the field the moment it appears).
  const renameRequestedRef = useRef(false);
  const tabClassName = `titlebar-tab ${isHome ? "titlebar-tab--home" : "titlebar-tab--file"} ${isActive ? "titlebar-tab--active" : ""}${isRenaming ? " titlebar-tab--renaming" : ""}`;

  useEffect(() => {
    if (!isRenaming) {
      return;
    }

    const input = renameInputRef.current;
    input?.focus();
    input?.select();
  }, [isRenaming]);

  function startRename() {
    renameRequestedRef.current = true;
    setDraftName(tab.title ?? "");
    setIsRenaming(true);
  }

  function finishRename(commit) {
    if (!isRenaming) {
      return;
    }

    setIsRenaming(false);
    const name = draftName.trim();

    if (commit && name && name !== tab.title) {
      void onRename(name);
    }
  }

  return (
    <AppContextMenu>
      <AppContextMenuTrigger asChild>
        <div
          data-tab-id={tab.id}
          className={tabClassName}
          onPointerDown={(event) => {
            if (!isRenaming && tab.closable) {
              onDragPointerDown?.(event, tab.id);
            }
          }}
          onClick={() => {
            // A release that ended a drag isn't a click.
            if (isRenaming || shouldIgnoreClick?.()) {
              return;
            }
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
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (isRenaming) {
              return;
            }
            if (event.key === "F2" && canRename) {
              event.preventDefault();
              startRename();
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onActivate();
            }
          }}
          title={tab.title}
          aria-label={tab.title}
        >
          <span className="titlebar-tab__body">
            {isHome ? (
              <span className="titlebar-home-icon" aria-hidden="true">
                <IconHomeFilled />
              </span>
            ) : (
              <>
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="titlebar-tab-rename"
                    value={draftName}
                    aria-label="Rename file"
                    spellCheck={false}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => finishRename(true)}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        finishRename(true);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        finishRename(false);
                      }
                    }}
                  />
                ) : (
                  <span
                    className="titlebar-tab-label"
                    onDoubleClick={(event) => {
                      if (!canRename) {
                        return;
                      }
                      // Double-click the name to rename (not the bar's maximize).
                      event.stopPropagation();
                      startRename();
                    }}
                  >
                    {tab.title}
                  </span>
                )}
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
          </span>
        </div>
      </AppContextMenuTrigger>

      <AppContextMenuContent
        className="titlebar-tab-menu"
        onCloseAutoFocus={(event) => {
          if (renameRequestedRef.current) {
            renameRequestedRef.current = false;
            event.preventDefault();
            renameInputRef.current?.focus();
          }
        }}
      >
        {canRename ? (
          <AppContextMenuItem onSelect={startRename}>
            <Pencil size={15} aria-hidden="true" />
            Rename
          </AppContextMenuItem>
        ) : null}
        {tab.type === "canvas" ? (
          <AppContextMenuItem onSelect={onShowHistory}>
            <Timer size={15} aria-hidden="true" />
            Version History
          </AppContextMenuItem>
        ) : null}
        {tab.type === "canvas" && typeof onShare === "function" ? (
          <AppContextMenuItem onSelect={onShare}>
            <Share size={15} aria-hidden="true" />
            Share as File…
          </AppContextMenuItem>
        ) : null}
        {onSeparate ? (
          <AppContextMenuItem onSelect={onSeparate}>
            <SplitColumns size={15} aria-hidden="true" />
            Separate Tabs
          </AppContextMenuItem>
        ) : null}
        <AppContextMenuItem disabled={!tab.closable} onSelect={onClose}>
          <X size={15} aria-hidden="true" />
          Close Tab
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={onCloseOtherTabs}>
          <Minus size={15} aria-hidden="true" />
          Close Other Tabs
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={onCloseTabsToRight}>
          <ChevronRight size={15} aria-hidden="true" />
          Close Tabs to the Right
        </AppContextMenuItem>
        <AppContextMenuItem disabled={!canReopenClosedTab} onSelect={onReopenClosedTab}>
          <RefreshCw size={15} aria-hidden="true" />
          Reopen Closed Tab
        </AppContextMenuItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
}

const TAB_EXIT_MS = 200;
// Tab reordering (TopTabBar's pointer drag): how far the pointer moves before
// a press becomes a drag, how fast neighbours slide aside, and how the dropped
// tab settles into place.
const TAB_DRAG_THRESHOLD = 4;
const TAB_SHIFT_MS = 180;
const TAB_SETTLE_MS = 200;
// How far below the tab bar a dragged canvas tab goes before it detaches
// into the split screen / floating view drop boxes.
const TAB_DETACH_DISTANCE = 28;

// Tabs to draw: the open ones (new ones flagged `entering`) plus closed ones
// kept for TAB_EXIT_MS (`exiting`, at their old spot) so they can shrink away.
function mergeTabPresence(previousEntries, nextTabs, measureWidth) {
  const nextIds = new Set(nextTabs.map((tab) => tab.id));
  const previousIds = new Set(previousEntries.map((entry) => entry.tab.id));
  const merged = nextTabs.map((tab) => ({ tab, entering: !previousIds.has(tab.id), exiting: false }));

  previousEntries.forEach((entry, index) => {
    if (nextIds.has(entry.tab.id)) {
      return;
    }

    const exitingEntry = entry.exiting
      ? entry
      : { tab: entry.tab, entering: false, exiting: true, width: measureWidth(entry.tab.id) };
    merged.splice(Math.min(index, merged.length), 0, exitingEntry);
  });

  return merged;
}

// The gooey connector between a linked split pair's two tabs. Right-click
// it, or rest the pointer on it for half a second, for the pair's menu.
const PAIR_MENU_HOVER_MS = 500;
const PAIR_MENU_LEAVE_MS = 250;

// Opens a new GitHub issue, pre-titled so split-view feedback is easy to find.
const SPLIT_FEEDBACK_URL = `https://github.com/DEDROX2K/AirPaste/issues/new?${new URLSearchParams({
  title: "Split view: ",
  body: "What happened, or what would you like split view to do?\n\n",
})}`;

function SplitPairLink({ stacked, onSeparate, onCloseLeft, onCloseRight, onToggleStacked, onReverse }) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);

  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const scheduleOpen = () => {
    window.clearTimeout(closeTimer.current);
    if (open) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setOpen(true), PAIR_MENU_HOVER_MS);
  };
  // Leaving the connector or the menu closes it, unless the pointer moves
  // between the two within a moment.
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), PAIR_MENU_LEAVE_MS);
  };

  return (
    <AppDropdownMenu open={open} onOpenChange={(next) => { clearTimers(); setOpen(next); }} modal={false}>
      <AppDropdownMenuTrigger asChild>
        <span
          className={`titlebar-pair-link${open ? " is-open" : ""}`}
          role="button"
          aria-label="Split view options"
          onPointerEnter={scheduleOpen}
          onPointerLeave={scheduleClose}
          // Not the window drag (the bar moves the window on presses), and
          // only right-click or hover opens the menu.
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 2) event.preventDefault();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            clearTimers();
            setOpen(true);
          }}
        />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent
        className="titlebar-tab-menu titlebar-pair-menu"
        side="bottom"
        align="center"
        sideOffset={6}
        onPointerEnter={() => window.clearTimeout(closeTimer.current)}
        onPointerLeave={scheduleClose}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <AppDropdownMenuItem onSelect={onSeparate}>
          <Unlink size={15} aria-hidden="true" />
          Separate views
        </AppDropdownMenuItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem onSelect={onCloseLeft}>
          <PaneLeft size={15} aria-hidden="true" />
          {stacked ? "Close top view" : "Close left view"}
        </AppDropdownMenuItem>
        <AppDropdownMenuItem disabled={!onCloseRight} onSelect={onCloseRight}>
          <PaneRight size={15} aria-hidden="true" />
          {stacked ? "Close bottom view" : "Close right view"}
        </AppDropdownMenuItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem onSelect={onToggleStacked}>
          {stacked ? <SplitColumns size={15} aria-hidden="true" /> : <SplitRows size={15} aria-hidden="true" />}
          {stacked ? "Show side by side" : "Show stacked"}
        </AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={onReverse}>
          <SwapHorizontal size={15} aria-hidden="true" />
          Reverse views
        </AppDropdownMenuItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem onSelect={() => void desktop.shell.openExternal(SPLIT_FEEDBACK_URL)}>
          <Feedback size={15} aria-hidden="true" />
          Send feedback
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
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
  const { showHome, currentEditor, renameItemEntry, exportCanvasShare } = useAppContext();
  const { toast } = useToast();
  const tabRefs = useRef(new Map());
  const previousRectsRef = useRef(new Map());
  const [draggedTabId, setDraggedTabId] = useState(null);
  const [historyDialogTab, setHistoryDialogTab] = useState(null);
  const { getSplitPartner, splitWithTab, floatTab, pairedPaths, activeTabPath, separatePair, reversePair, toggleStacked, stacked } = useSplitView();
  const [detachState, setDetachState] = useState(null);
  const detachOverlayRef = useRef(null);
  const detachSeqRef = useRef(0);
  const rootRef = useRef(null);
  // The linked split pair on screen (both its tabs read as active).
  const shownPair = activeTabPath ? pairedPaths.get(activeTabPath) ?? null : null;

  const orderedTabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const stripTabs = useMemo(() => tabs.filter((tab) => tab.id !== "home"), [tabs]);
  const [tabEntries, setTabEntries] = useState(() => stripTabs.map((tab) => ({ tab, entering: false, exiting: false })));
  const [previousStripTabs, setPreviousStripTabs] = useState(stripTabs);

  // Adjust during render (before commit) so a closed tab never blinks out:
  // its DOM node is still there to measure.
  if (stripTabs !== previousStripTabs) {
    setPreviousStripTabs(stripTabs);
    setTabEntries((current) => mergeTabPresence(
      current,
      stripTabs,
      (tabId) => tabRefs.current.get(tabId)?.getBoundingClientRect().width ?? 0,
    ));
  }

  useEffect(() => {
    if (!tabEntries.some((entry) => entry.exiting)) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setTabEntries((current) => current.filter((entry) => !entry.exiting));
    }, TAB_EXIT_MS);
    return () => window.clearTimeout(timerId);
  }, [tabEntries]);

  // Set when a drag drops a tab in a new place: the next reorder must not
  // slide the tabs from their old spots (they're already shown in the new
  // ones), only settle the dropped tab from where it was let go.
  const dragDropRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  useLayoutEffect(() => {
    const drop = dragDropRef.current;

    if (drop) {
      dragDropRef.current = null;
      const nextRects = new Map();

      orderedTabIds.forEach((tabId) => {
        const node = tabRefs.current.get(tabId);
        if (!node) {
          return;
        }

        node.style.transition = "none";
        node.style.transform = "";
        node.style.zIndex = "";

        if (tabId === drop.tabId) {
          const settledLeft = node.getBoundingClientRect().left;
          const deltaX = drop.visualLeft - settledLeft;

          if (Math.abs(deltaX) >= 1) {
            node.style.transform = `translateX(${deltaX}px)`;
            requestAnimationFrame(() => {
              node.style.transition = `transform ${TAB_SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
              node.style.transform = "";
            });
          }
        }

        nextRects.set(tabId, node.getBoundingClientRect());
      });

      previousRectsRef.current = nextRects;
      return;
    }

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
        node.style.transition = "transform 240ms cubic-bezier(0.34, 1.4, 0.64, 1)";
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

  // Dragging a tab to reorder: pointer-driven, not HTML drag-and-drop. The
  // dragged tab follows the pointer 1:1; the others slide aside to show where
  // it will land, based on where everything was when the drag began (so a
  // tab sliding under the pointer can't flip the order back and forth). The
  // new order is committed once, on release.
  function measureStrip() {
    return stripTabs
      .map((tab) => {
        const node = tabRefs.current.get(tab.id);
        return node ? { id: tab.id, node, rect: node.getBoundingClientRect() } : null;
      })
      .filter(Boolean);
  }

  function getDragOrder(drag, deltaX) {
    const dragged = drag.items.find((item) => item.id === drag.tabId);
    const others = drag.items.filter((item) => item.id !== drag.tabId);
    const slot = getDragSlot(
      others.map((item) => item.rect),
      dragged.rect.left + deltaX,
      dragged.rect.right + deltaX,
      deltaX > 0,
    );
    const order = others.map((item) => item.id);
    order.splice(slot, 0, drag.tabId);
    return order;
  }

  function handleDragPointerDown(event, tabId) {
    if (event.button !== 0 || tabId === "home") {
      return;
    }

    // Keep the press from starting a window move.
    event.stopPropagation();
    const target = event.currentTarget;
    const tab = tabs.find((entry) => entry.id === tabId) ?? null;
    // Canvas tabs can also be pulled down out of the bar, onto the split
    // screen / floating view drop boxes (TabDetachOverlay).
    const canDetach = tab?.type === "canvas" && Boolean(tab.entityId);
    const drag = {
      tabId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      active: false,
      detached: false,
      items: [],
      deltaX: 0,
    };
    dragRef.current = drag;

    function settleStrip() {
      drag.items.forEach((item) => {
        item.node.style.transition = `transform ${TAB_SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        item.node.style.transform = "";
        item.node.style.zIndex = "";
      });
    }

    // Reordering needs two tabs; detaching works with one.
    function activateReorder() {
      const dragged = drag.items.find((item) => item.id === tabId);

      if (!dragged || drag.items.length < 2) {
        return false;
      }

      drag.active = true;
      drag.gap = drag.items.length > 1 ? Math.max(0, drag.items[1].rect.left - drag.items[0].rect.right) : 0;
      drag.minDelta = drag.items[0].rect.left - dragged.rect.left;
      drag.maxDelta = drag.items[drag.items.length - 1].rect.right - dragged.rect.right;
      drag.items.forEach((item) => {
        item.node.style.transition = item.id === tabId ? "none" : `transform ${TAB_SHIFT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      });
      dragged.node.style.zIndex = "5";
      return true;
    }

    function start() {
      drag.started = true;
      drag.items = measureStrip();
      drag.stripBottom = rootRef.current?.getBoundingClientRect().bottom ?? 44;
      // Every move and the release come to this tab wherever the pointer
      // goes (off the strip, over the canvas or an embedded page), so the
      // drag never loses track of it.
      try {
        target.setPointerCapture?.(drag.pointerId);
      } catch {
        // The pointer is already gone; the window listeners still end it.
      }
      setDraggedTabId(tabId);
      activateReorder();
    }

    function enterDetach(clientX, clientY) {
      drag.detached = true;
      // Where the tab sat in the bar, so the preview stretches out of it.
      const tabRect = (drag.items.find((item) => item.id === tabId)?.rect) ?? target.getBoundingClientRect();
      settleStrip();
      const partner = getSplitPartner(tab);
      detachSeqRef.current += 1;
      setDetachState({
        id: detachSeqRef.current,
        tab,
        isCurrent: tab.id === activeTabId,
        partnerName: partner?.title ?? "",
        from: {
          x: clientX,
          y: clientY,
          rect: { left: tabRect.left, top: tabRect.top, width: tabRect.width, height: tabRect.height },
        },
      });
    }

    function leaveDetach() {
      drag.detached = false;
      setDetachState(null);
      // Pick the reorder up again from a fresh measurement.
      drag.items = measureStrip();
      drag.startX = drag.lastX;
      drag.deltaX = 0;
      activateReorder();
    }

    function handleMove(moveEvent) {
      if (moveEvent.pointerId !== drag.pointerId) {
        return;
      }

      const rawDelta = moveEvent.clientX - drag.startX;
      const rawDeltaY = moveEvent.clientY - drag.startY;
      drag.lastX = moveEvent.clientX;

      if (!drag.started) {
        if (Math.hypot(rawDelta, rawDeltaY) < TAB_DRAG_THRESHOLD) {
          return;
        }
        start();
      }

      if (canDetach) {
        const below = moveEvent.clientY - drag.stripBottom;
        if (!drag.detached && below > TAB_DETACH_DISTANCE) {
          enterDetach(moveEvent.clientX, moveEvent.clientY);
        } else if (drag.detached && below < TAB_DETACH_DISTANCE / 2) {
          leaveDetach();
        }
      }

      if (drag.detached) {
        detachOverlayRef.current?.move(moveEvent.clientX, moveEvent.clientY);
        drag.lastClientX = moveEvent.clientX;
        drag.lastClientY = moveEvent.clientY;
        return;
      }

      if (!drag.active) {
        return;
      }

      drag.deltaX = Math.max(drag.minDelta, Math.min(drag.maxDelta, moveEvent.clientX - drag.startX));
      const dragged = drag.items.find((item) => item.id === tabId);
      dragged.node.style.transform = `translateX(${drag.deltaX}px)`;

      const order = getDragOrder(drag, drag.deltaX);
      const shift = dragged.rect.width + drag.gap;
      drag.items.forEach((item, index) => {
        if (item.id === tabId) {
          return;
        }
        const nextIndex = order.indexOf(item.id);
        // Each tab the dragged one has passed slides one place the other way.
        const offset = nextIndex > index ? shift : nextIndex < index ? -shift : 0;
        item.node.style.transform = offset ? `translateX(${offset}px)` : "";
      });
    }

    function finish(endEvent) {
      if (endEvent && endEvent.pointerId !== drag.pointerId) {
        return;
      }

      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      target.removeEventListener("lostpointercapture", finish);
      dragRef.current = null;

      try {
        target.releasePointerCapture?.(drag.pointerId);
      } catch {
        // Already released.
      }

      if (!drag.started) {
        return;
      }

      setDraggedTabId(null);
      // The click that follows this release isn't a tab click.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      if (drag.detached) {
        const isRelease = endEvent?.type === "pointerup";
        const overlay = detachOverlayRef.current;
        const zone = isRelease ? overlay?.move(endEvent.clientX, endEvent.clientY) : null;
        // The preview morphs into the box (or fades when dropped nowhere)
        // while the split / floating view opens underneath.
        const detachId = detachSeqRef.current;
        const clear = () => setDetachState((current) => (current?.id === detachId ? null : current));
        if (overlay?.finish) void overlay.finish(zone).then(clear, clear);
        else clear();
        if (zone === "left" || zone === "right") {
          splitWithTab(tab, zone);
        } else if (zone === "float") {
          floatTab(tab);
        }
        return;
      }

      if (!drag.active) {
        return;
      }

      const dragged = drag.items.find((item) => item.id === tabId);
      const order = getDragOrder(drag, drag.deltaX);
      const unchanged = order.every((id, index) => drag.items[index].id === id);

      if (unchanged) {
        settleStrip();
        return;
      }

      dragDropRef.current = { tabId, visualLeft: dragged.rect.left + drag.deltaX };
      const nextId = order[order.indexOf(tabId) + 1];
      const targetIndex = nextId ? tabs.findIndex((entry) => entry.id === nextId) : tabs.length;
      moveTab(tabId, targetIndex);
    }

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    target.addEventListener("lostpointercapture", finish);
  }

  const isMac = typeof window !== "undefined" && navigator.userAgent.includes("Mac");

  return (
    <div
      ref={rootRef}
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
        <TitlebarCluster
          isHomeActive={activeTabId === "home"}
          isCanvasActive={currentEditor?.kind === "canvas"}
          onHome={() => void showHome()}
        />
      </div>

      {/* Centred on the whole bar, independent of the left/right groups. */}
      <div className="titlebar-tabs">
        {tabEntries.map(({ tab, entering, exiting, width }) => {
          const pairSide = !exiting && tab.type === "canvas" ? pairedPaths.get(tab.entityId)?.side ?? null : null;
          const isShownInPair = Boolean(
            shownPair && tab.type === "canvas"
              && (tab.entityId === shownPair.leftPath || tab.entityId === shownPair.rightPath),
          );
          return (
          <div
            key={tab.id}
            ref={exiting ? undefined : (node) => registerTabRef(tab.id, node)}
            className={`titlebar-tab-shell${draggedTabId === tab.id ? " titlebar-tab-shell--dragging" : ""}${detachState?.tab.id === tab.id ? " titlebar-tab-shell--detached" : ""}${entering ? " titlebar-tab-shell--entering" : ""}${exiting ? " titlebar-tab-shell--exiting" : ""}${pairSide ? ` titlebar-tab-shell--paired titlebar-tab-shell--paired-${pairSide}` : ""}`}
            style={exiting ? { "--tab-exit-w": `${width}px` } : undefined}
            inert={exiting ? true : undefined}
            aria-hidden={exiting ? true : undefined}
            title={pairSide ? "Split screen pair" : undefined}
          >
            <TabItem
              tab={tab}
              isActive={tab.id === activeTabId || isShownInPair}
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
              onShare={() => void exportCanvasShare?.({ type: "canvas", filePath: tab.entityId, name: tab.title })}
              onRename={async (name) => {
                try {
                  await renameItemEntry?.({ type: tab.type, filePath: tab.entityId, name: tab.title }, name);
                } catch (error) {
                  toast?.("error", `Couldn't rename: ${error?.message ?? "unknown error"}`);
                }
              }}
              onDragPointerDown={handleDragPointerDown}
              shouldIgnoreClick={() => suppressClickRef.current}
              onSeparate={pairSide ? () => separatePair(tab.entityId) : undefined}
            />
            {pairSide === "left" ? (() => {
              const pair = pairedPaths.get(tab.entityId);
              const rightTab = tabs.find((entry) => entry.type === "canvas" && entry.entityId === pair?.rightPath);
              return (
                <SplitPairLink
                  stacked={stacked}
                  onSeparate={() => separatePair(tab.entityId)}
                  onCloseLeft={() => closeTab(tab.id)}
                  onCloseRight={rightTab ? () => closeTab(rightTab.id) : undefined}
                  onToggleStacked={toggleStacked}
                  onReverse={() => reversePair(tab.entityId)}
                />
              );
            })() : null}
          </div>
          );
        })}
      </div>

      {detachState ? (
        <TabDetachOverlay
          key={detachState.id}
          ref={detachOverlayRef}
          from={detachState.from}
          tab={detachState.tab}
          isCurrent={detachState.isCurrent}
          partnerName={detachState.partnerName}
        />
      ) : null}

      <div className="titlebar-right">
        {SHOW_TITLEBAR_EYE ? <TitlebarEye currentEditorKind={currentEditor?.kind ?? "home"} /> : null}
        <div id="titlebar-right-slot" />
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
