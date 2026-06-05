import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { DevConsole } from "./components/DevConsole";
import GlobalLoadingCursor from "./components/GlobalLoadingCursor";
import { TopTabBar } from "./components/TopTabBar";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useLog } from "./hooks/useLog";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { desktop } from "./lib/desktop";

const LAST_POINTER_POSITION_KEY = "__airpasteLastPointerPosition";
const RESIZE_HANDLE_DIRECTIONS = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
const CanvasWorkspaceView = lazy(() => import("./components/CanvasWorkspaceView"));
const HomeShell = lazy(() => import("./components/HomeShell"));
const LeftPagesPanel = lazy(() => import("./components/LeftPagesPanel"));

function BootSplash({ label = "Preparing workspace" }) {
  const displayLabel = !label || label === "Loading" ? "Preparing workspace" : label;

  return (
    <main className="boot-splash" aria-label="Starting AirPaste">
      <div className="boot-splash__ambient" aria-hidden="true" />
      <div className="boot-splash__stage">
        <div className="boot-splash__mark" aria-hidden="true">
          <span>A</span>
        </div>
        <h1 className="boot-splash__wordmark">AirPaste</h1>
        <div className="boot-splash__progress" aria-hidden="true">
          <span />
        </div>
      </div>
      <div className="boot-splash__status">
        <span className="boot-splash__message">{displayLabel}</span>
      </div>
    </main>
  );
}

function WindowResizeHandles() {
  function beginResize(direction, event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    desktop.window.resizeStart?.(direction);

    const handlePointerMove = (moveEvent) => {
      desktop.window.resizeMove?.(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY);
    };

    const finishResize = () => {
      desktop.window.resizeEnd?.();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      window.removeEventListener("blur", finishResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    window.addEventListener("blur", finishResize);
  }

  return (
    <div className="window-resize-handles" aria-hidden="true">
      {RESIZE_HANDLE_DIRECTIONS.map((direction) => (
        <div
          key={direction}
          className={`window-resize-handle window-resize-handle--${direction}`}
          onPointerDown={(event) => beginResize(direction, event)}
        />
      ))}
    </div>
  );
}

function AppViewFallback() {
  return (
    <div className="app-shell__view-loading" aria-live="polite">
      <span className="app-shell__view-loading-label">Loading workspace</span>
    </div>
  );
}

export default function App() {
  useTheme();
  const isNarrowDesktop = useMediaQuery("(max-width: 1079px)");
  const [isClosing, setIsClosing] = useState(false);

  const usesCustomTitlebar = desktop.window.usesCustomTitlebar;
  const usesCustomWindowResize = desktop.window.usesCustomWindowResize;
  const {
    booting,
    currentEditor,
    error,
    isLoading,
    loadingLabel,
    setError,
  } = useAppContext();
  const { log } = useLog();
  const { toast } = useToast();

  const markWindowClosing = useCallback(() => {
    if (isClosing) {
      return;
    }

    setIsClosing(true);
  }, [isClosing]);

  const requestWindowClose = useCallback(() => {
    markWindowClosing();
    desktop.window.close();
  }, [markWindowClosing]);

  useEffect(() => desktop.window.onPrepareClose(markWindowClosing), [markWindowClosing]);

  useEffect(() => {
    const updatePointerPosition = (event) => {
      window[LAST_POINTER_POSITION_KEY] = {
        x: event.clientX,
        y: event.clientY,
      };
    };

    window.addEventListener("pointermove", updatePointerPosition);
    window.addEventListener("pointerdown", updatePointerPosition);

    return () => {
      window.removeEventListener("pointermove", updatePointerPosition);
      window.removeEventListener("pointerdown", updatePointerPosition);
    };
  }, []);

  useEffect(() => {
    if (!error) {
      return;
    }

    log("error", error);
    toast("error", error);
    setError("");
  }, [error, log, setError, toast]);

  if (booting) {
    return (
      <div className="app-shell app-shell--booting">
        <BootSplash label={loadingLabel || "Preparing workspace"} />
      </div>
    );
  }

  return (
    <div className={`app-shell app-shell--with-tabs app-shell--ready ${usesCustomTitlebar ? "app-shell--custom-titlebar" : "app-shell--native-frame"} ${isLoading ? "app-shell--loading" : ""} ${isClosing ? "app-shell--closing" : ""}`}>
      {usesCustomTitlebar && usesCustomWindowResize ? <WindowResizeHandles /> : null}
      <div className="app-window">
        <TopTabBar usesCustomTitlebar={usesCustomTitlebar} onRequestClose={requestWindowClose} />

        <div className="app-shell__view-container">
          <Suspense fallback={<AppViewFallback />}>
            {currentEditor.kind === "canvas" ? (
              <div className={`app-shell__workspace-layout${isNarrowDesktop ? " app-shell__workspace-layout--narrow" : ""}`}>
                <LeftPagesPanel isNarrowDesktop={isNarrowDesktop} />
                <CanvasWorkspaceView />
              </div>
            ) : null}
            {currentEditor.kind === "home" ? <HomeShell /> : null}
          </Suspense>
        </div>
      </div>

      <ToastStack />
      {isLoading ? <GlobalLoadingCursor /> : null}
      {import.meta.env.DEV && <DevConsole />}
    </div>
  );
}
