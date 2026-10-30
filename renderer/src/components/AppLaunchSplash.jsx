import { useEffect, useMemo, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import { useToast } from "../hooks/useToast";
import { desktop } from "../lib/desktop";
import { OPEN_LAUNCH_SPLASH_EVENT } from "../lib/launchSplash";
import { AppDialog, AppDialogContent, AppDialogTitle } from "./ui/app";
import { Eye, FileText, Folder, Frame, Globe, HeartHandshake, List } from "./ui/icons";
import "./AppLaunchSplash.css";

// The project's own declared bug tracker (package.json "bugs.url") -- a
// real, project-provided link, not a guessed one. "What's cooking?" and
// "Donate" have no equivalent source yet, so they're presentational only
// until the user gives us real destinations for them.
const REPORT_BUGS_URL = "https://github.com/DEDROX2K/AirPaste/issues";

// One of these photos fills the left of the splash: a random one each time
// the app opens, then clicking the photo steps to the next (public/splash/).
const SPLASH_IMAGES = [
  "splash/splash-1.png",
  "splash/splash-2.png",
  "splash/splash-3.png",
  "splash/splash-4.png",
  "splash/splash-5.png",
  "splash/splash-6.png",
    "splash/splash-7.png",
      "splash/splash-8.png",  "splash/splash-9.png",
];

function pickSplashIndex() {
  return Math.floor(Math.random() * SPLASH_IMAGES.length);
}

function getSplashImageUrl(index) {
  return `${import.meta.env.BASE_URL}${SPLASH_IMAGES[index % SPLASH_IMAGES.length]}`;
}

function RecentFileIcon({ type }) {
  if (type === "folder") {
    return <Folder size={12} aria-hidden="true" />;
  }

  return <FileText size={12} aria-hidden="true" />;
}

// The launch splash: a plain panel on the left (new file / recent files /
// links) and an 823 x 948 photo on
// the right. Shown once per session after boot (and from the home logo),
// dismissed by any action, outside click, or Escape.
export default function AppLaunchSplash() {
  const [dismissed, setDismissed] = useState(false);
  const [splashIndex, setSplashIndex] = useState(pickSplashIndex);
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

  // Reopened from elsewhere (the home logo): show the next photo.
  useEffect(() => {
    const handleOpen = () => {
      setSplashIndex((index) => (index + 1) % SPLASH_IMAGES.length);
      setDismissed(false);
    };

    window.addEventListener(OPEN_LAUNCH_SPLASH_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_LAUNCH_SPLASH_EVENT, handleOpen);
  }, []);

  // Preload the next photo so a click swaps instantly.
  useEffect(() => {
    const next = new window.Image();
    next.src = getSplashImageUrl(splashIndex + 1);
  }, [splashIndex]);

  function dismiss() {
    setDismissed(true);
  }

  function showNextImage() {
    setSplashIndex((index) => (index + 1) % SPLASH_IMAGES.length);
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
                <Frame size={12} aria-hidden="true" />
                Canvas
              </button>
              <button
                type="button"
                className="app-launch-splash__item"
                onClick={() => toast("info", "List files are coming soon.")}
              >
                <List size={12} aria-hidden="true" />
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
                <Eye size={12} aria-hidden="true" />
                Report Bugs
              </button>
              <button
                type="button"
                className="app-launch-splash__item"
                onClick={() => toast("info", "Coming soon.")}
              >
                <Globe size={12} aria-hidden="true" />
                What&rsquo;s cooking?
              </button>
              <button
                type="button"
                className="app-launch-splash__item"
                onClick={() => toast("info", "Coming soon.")}
              >
                <HeartHandshake size={12} aria-hidden="true" />
                Donate to Airpaste
              </button>
            </section>
          </div>

          <button
            type="button"
            className="app-launch-splash__hero"
            aria-label="Show next splash image"
            onClick={showNextImage}
          >
            <img
              key={splashIndex}
              className="app-launch-splash__image"
              src={getSplashImageUrl(splashIndex)}
              alt=""
              draggable={false}
            />
            {/* <div className="app-launch-splash__version">V 1.08</div> */}
          </button>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
