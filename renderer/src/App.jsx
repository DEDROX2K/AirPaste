import { useEffect } from "react";
import CanvasWorkspaceView from "./components/CanvasWorkspaceView";
import { DevConsole } from "./components/DevConsole";
import GlobalLoadingCursor from "./components/GlobalLoadingCursor";
import HomeShell from "./components/HomeShell";
import LeftPagesPanel from "./components/LeftPagesPanel";
import { TopTabBar } from "./components/TopTabBar";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useLog } from "./hooks/useLog";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { desktop } from "./lib/desktop";

const BOOT_SPLASH_IMAGE_SRC = encodeURI("/Splash screen/Keyboard keycap with _airpaste_ text.png");
const LAST_POINTER_POSITION_KEY = "__airpasteLastPointerPosition";
const RESIZE_HANDLE_DIRECTIONS = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

function BootSplash() {
  return (
    <main className="boot-splash" aria-label="Restoring workspace">
      <div className="boot-splash__texture" aria-hidden="true" />
      <div className="boot-splash__corner" aria-hidden="true" />
      <div className="boot-splash__hero">
        <img className="boot-splash__image" src={BOOT_SPLASH_IMAGE_SRC} alt="AirPaste splash" />
      </div>
      <div className="boot-splash__status">
        <span className="boot-splash__eyebrow">AirPaste</span>
        <span className="boot-splash__message">Restoring your workspace</span>
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

export default function App() {
  useTheme();

  const usesCustomTitlebar = desktop.window.usesCustomTitlebar;
  const usesCustomWindowResize = desktop.window.usesCustomWindowResize;
  const {
    booting,
    currentEditor,
    error,
    isLoading,
    setError,
  } = useAppContext();
  const { log } = useLog();
  const { toast } = useToast();

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
        <BootSplash />
      </div>
    );
  }

  return (
    <div className={`app-shell app-shell--with-tabs ${usesCustomTitlebar ? "app-shell--custom-titlebar" : "app-shell--native-frame"} ${isLoading ? "app-shell--loading" : ""}`}>
      {usesCustomTitlebar && usesCustomWindowResize ? <WindowResizeHandles /> : null}
      <div className="app-window">
        <TopTabBar usesCustomTitlebar={usesCustomTitlebar} />

        <div className="app-shell__view-container">
          {currentEditor.kind === "canvas" ? (
            <div className="app-shell__workspace-layout">
              <LeftPagesPanel />
              <CanvasWorkspaceView />
            </div>
          ) : null}
          {currentEditor.kind === "home" ? <HomeShell /> : null}
        </div>
      </div>

      <ToastStack />
      {isLoading ? <GlobalLoadingCursor /> : null}
      {import.meta.env.DEV && <DevConsole />}
    </div>
  );
}
