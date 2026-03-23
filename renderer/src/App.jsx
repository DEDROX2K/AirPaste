import { useEffect } from "react";
import CanvasWorkspaceView from "./components/CanvasWorkspaceView";
import { DevConsole } from "./components/DevConsole";
import HomeShell from "./components/HomeShell";
import PageEditorView from "./components/PageEditorView";
import { TopTabBar } from "./components/TopTabBar";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useLog } from "./hooks/useLog";
import { useToast } from "./hooks/useToast";
import { desktop } from "./lib/desktop";

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
      <div className="app-shell app-shell--startup">
        <TopTabBar usesCustomTitlebar={usesCustomTitlebar} />
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
    <div className={`app-shell app-shell--with-tabs ${usesCustomTitlebar ? "app-shell--custom-titlebar" : "app-shell--native-frame"}`}>
      <TopTabBar usesCustomTitlebar={usesCustomTitlebar} />
      
      <div className="app-shell__view-container">
        {currentEditor.kind === "canvas" ? <CanvasWorkspaceView /> : null}
        {currentEditor.kind === "page" ? <PageEditorView /> : null}
        {currentEditor.kind === "home" ? <HomeShell /> : null}
      </div>

      <ToastStack />
      {import.meta.env.DEV && <DevConsole />}
    </div>
  );
}
