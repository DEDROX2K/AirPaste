import { useEffect } from "react";
import CanvasWorkspaceView from "./components/CanvasWorkspaceView";
import { DevConsole } from "./components/DevConsole";
import HomeShell from "./components/HomeShell";
import PageEditorView from "./components/PageEditorView";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useLog } from "./hooks/useLog";
import { useToast } from "./hooks/useToast";
import { desktop } from "./lib/desktop";

function IconMinus() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect y="4.5" width="10" height="1" rx="0.5" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const STARTUP_SPLASH_IMAGE_SRC = encodeURI("/Splash screen/Keyboard keycap with _airpaste_ text.png");

const STARTUP_ACTIONS = [
  {
    id: "open-workspace",
    title: "Open Existing Workspace",
    description: "Choose an existing AirPaste folder-backed workspace and continue where you left off.",
  },
  {
    id: "create-workspace",
    title: "Create New Workspace",
    description: "Initialize a folder on this machine as a fresh AirPaste workspace.",
  },
];

function WindowTitlebar({ usesCustomTitlebar }) {
  if (!usesCustomTitlebar) {
    return null;
  }

  return (
    <header className="titlebar">
      <div className="titlebar__spacer" />
      <div className="titlebar__actions">
        <button
          id="titlebar-minimize"
          className="titlebar__icon-btn titlebar__icon-btn--min"
          type="button"
          title="Minimize"
          onClick={() => desktop.window.minimize()}
        >
          <IconMinus />
        </button>
        <button
          id="titlebar-close"
          className="titlebar__icon-btn titlebar__icon-btn--close"
          type="button"
          title="Close"
          onClick={() => desktop.window.close()}
        >
          <IconClose />
        </button>
      </div>
    </header>
  );
}

function StartupSplash({ isLoading, onCreateNewWorkspace, onOpenExistingWorkspace }) {
  const actionHandlers = {
    "open-workspace": onOpenExistingWorkspace,
    "create-workspace": onCreateNewWorkspace,
  };

  return (
    <main className="startup-splash">
      <div className="startup-splash__glow startup-splash__glow--left" aria-hidden="true" />
      <div className="startup-splash__glow startup-splash__glow--right" aria-hidden="true" />
      <div className="startup-splash__noise" aria-hidden="true" />

      <div className="startup-splash__inner">
        <section className="startup-splash__content">
          <p className="startup-splash__eyebrow">AirPaste</p>
          <h1 className="startup-splash__title">Paste first. Organize when you&rsquo;re ready.</h1>
          <p className="startup-splash__description">
            A local-first desktop canvas for collecting links, notes, and references without sending
            them anywhere else.
          </p>

          <div className="startup-splash__actions">
            {STARTUP_ACTIONS.map((action) => (
              <button
                key={action.id}
                className="startup-splash__action"
                type="button"
                onClick={actionHandlers[action.id]}
                disabled={isLoading}
              >
                <span className="startup-splash__action-icon" aria-hidden="true" />
                <span className="startup-splash__action-copy">
                  <span className="startup-splash__action-title">{action.title}</span>
                  <span className="startup-splash__action-description">{action.description}</span>
                </span>
              </button>
            ))}
          </div>

          <p className="startup-splash__caption">Every workspace stays tied to a folder on your machine.</p>
        </section>

        <aside className="startup-splash__hero" aria-hidden="true">
          <div className="startup-splash__hero-card">
            <img className="startup-splash__hero-image" src={STARTUP_SPLASH_IMAGE_SRC} alt="" />
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function App() {
  const usesCustomTitlebar = desktop.window.usesCustomTitlebar;
  const {
    booting,
    createNewWorkspace,
    currentEditor,
    error,
    folderLoading,
    folderPath,
    openExistingWorkspace,
    setError,
  } = useAppContext();
  const { log } = useLog();
  const { toast } = useToast();

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
        <div className="launch-panel">
          <p className="launch-panel__eyebrow">AirPaste</p>
          <h1>Restoring your workspace</h1>
          <p>Reopening the last local workspace if one is available.</p>
        </div>
      </div>
    );
  }

  if (!folderPath) {
    return (
      <div className={`app-shell app-shell--startup ${usesCustomTitlebar ? "app-shell--custom-titlebar" : "app-shell--native-frame"}`}>
        <WindowTitlebar usesCustomTitlebar={usesCustomTitlebar} />
        <StartupSplash
          isLoading={folderLoading}
          onCreateNewWorkspace={createNewWorkspace}
          onOpenExistingWorkspace={openExistingWorkspace}
        />
        <ToastStack />
        <DevConsole />
      </div>
    );
  }

  return (
    <div className={`app-shell ${usesCustomTitlebar ? "app-shell--custom-titlebar" : "app-shell--native-frame"}`}>
      <WindowTitlebar usesCustomTitlebar={usesCustomTitlebar} />

      {currentEditor.kind === "canvas" ? <CanvasWorkspaceView /> : null}
      {currentEditor.kind === "page" ? <PageEditorView /> : null}
      {currentEditor.kind === "home" ? <HomeShell /> : null}

      <ToastStack />
      {import.meta.env.DEV && <DevConsole />}
    </div>
  );
}
