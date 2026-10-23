import { useMemo, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import { useToast } from "../hooks/useToast";
import { desktop } from "../lib/desktop";
import { AppDialog, AppDialogContent, AppDialogTitle } from "./ui/app";
import { Eye, FileText, Folder, Frame, Globe, HeartHandshake, List } from "lucide-react";
import "./AppLaunchSplash.css";

// The project's own declared bug tracker (package.json "bugs.url") -- a
// real, project-provided link, not a guessed one. "What's cooking?" and
// "Donate" have no equivalent source yet, so they're presentational only
// until the user gives us real destinations for them.
const REPORT_BUGS_URL = "https://github.com/DEDROX2K/AirPaste/issues";

function RecentFileIcon({ type }) {
  if (type === "folder") {
    return <Folder size={16} aria-hidden="true" />;
  }

  return <FileText size={16} aria-hidden="true" />;
}

// The real launch splash design (replacing the earlier placeholder dialog):
// a two-column panel -- file actions / recent files / utility links on the
// left, a full-bleed brand hero on the right -- shown once per app session
// right after boot, dismissed by any action, outside click, or Escape.
export default function AppLaunchSplash() {
  const [dismissed, setDismissed] = useState(false);
  const {
    homeData,
    folderLoading,
    createNewDome,
    openHomeItem,
  } = useAppContext();
  const { toast } = useToast();

  const recentFiles = useMemo(() => (
    Array.isArray(homeData?.recentItems) ? homeData.recentItems.slice(0, 5) : []
  ), [homeData?.recentItems]);

  function dismiss() {
    setDismissed(true);
  }

  return (
    <AppDialog open={!dismissed} onOpenChange={(next) => setDismissed(!next)}>
      <AppDialogContent className="app-launch-splash__dialog">
        <AppDialogTitle className="sr-only">AirPaste</AppDialogTitle>
        <div className="app-launch-splash">
          <div className="app-launch-splash__panel">
            <section className="app-launch-splash__card app-launch-splash__card--new">
              <h2 className="app-launch-splash__label">New file</h2>
              <button
                type="button"
                className="app-launch-splash__item"
                disabled={folderLoading}
                onClick={() => {
                  dismiss();
                  void createNewDome("New Workspace");
                }}
              >
                <Frame size={16} aria-hidden="true" />
                Canvas
              </button>
              <button
                type="button"
                className="app-launch-splash__item"
                onClick={() => toast("info", "List files are coming soon.")}
              >
                <List size={16} aria-hidden="true" />
                List
              </button>
            </section>

            <section className="app-launch-splash__card app-launch-splash__card--recent">
              <h2 className="app-launch-splash__label">Recent Files</h2>
              {recentFiles.length > 0 ? (
                recentFiles.map((item) => (
                  <button
                    key={item.filePath || item.id || item.name}
                    type="button"
                    className="app-launch-splash__item"
                    disabled={folderLoading}
                    onClick={() => {
                      dismiss();
                      void openHomeItem(item);
                    }}
                  >
                    <RecentFileIcon type={item.type} />
                    <span className="app-launch-splash__item-name">{item.name}</span>
                  </button>
                ))
              ) : (
                <p className="app-launch-splash__empty">No recent files yet.</p>
              )}
            </section>

            <section className="app-launch-splash__card app-launch-splash__card--utility">
              <button
                type="button"
                className="app-launch-splash__item"
                onClick={() => void desktop.shell.openExternal(REPORT_BUGS_URL)}
              >
                <Eye size={16} aria-hidden="true" />
                Report Bugs
              </button>
              <button
                type="button"
                className="app-launch-splash__item"
                onClick={() => toast("info", "Coming soon.")}
              >
                <Globe size={16} aria-hidden="true" />
                What&rsquo;s cooking?
              </button>
              <button
                type="button"
                className="app-launch-splash__item"
                onClick={() => toast("info", "Coming soon.")}
              >
                <HeartHandshake size={16} aria-hidden="true" />
                Donate to Airpaste
              </button>
            </section>

            <div className="app-launch-splash__tagline">Ideas meant to be played with</div>
          </div>

          <div className="app-launch-splash__hero">
            <div className="app-launch-splash__keycap" aria-hidden="true">
              <span className="app-launch-splash__keycap-label">airpaste</span>
            </div>
            <div className="app-launch-splash__version">V 1.08</div>
          </div>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
