import { useState } from "react";
import { useAppContext } from "../context/useAppContext";
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogTitle,
} from "./ui/app";
import { FolderOpen, FolderPlus, Sparkles } from "lucide-react";

// A standard placeholder for the Blender-style "pick up where you left off"
// launch splash -- a small centered panel over a blurred backdrop, shown
// once per app session right after boot. The final visual design (per the
// user) will replace this; this establishes the pattern (AppDialog +
// recent-workspace list, reusing the same data as the Home launch screen)
// so swapping in the real UI later is a content-only change.
export default function AppLaunchSplash() {
  const [dismissed, setDismissed] = useState(false);
  const {
    activeDome,
    domes,
    folderLoading,
    createNewDome,
    openExistingWorkspace,
    switchDome,
  } = useAppContext();

  const recentDomes = Array.isArray(domes) ? domes.slice(0, 4) : [];

  return (
    <AppDialog open={!dismissed} onOpenChange={(next) => setDismissed(!next)}>
      <AppDialogContent className="max-w-sm gap-5 p-7 text-center">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.png" alt="" aria-hidden="true" className="h-14 w-14 object-contain" />
          <div>
            <AppDialogTitle className="text-xl">AirPaste</AppDialogTitle>
            <AppDialogDescription className="mt-1">
              Save everything. Arrange it beautifully.
            </AppDialogDescription>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <AppButton
            type="button"
            tone="accent"
            block
            disabled={folderLoading}
            onClick={() => {
              setDismissed(true);
              void openExistingWorkspace();
            }}
          >
            <FolderOpen size={16} aria-hidden="true" />
            Open Workspace
          </AppButton>
          <AppButton
            type="button"
            tone="surface"
            block
            disabled={folderLoading}
            onClick={() => {
              setDismissed(true);
              void createNewDome("New Workspace");
            }}
          >
            <FolderPlus size={16} aria-hidden="true" />
            Create Workspace
          </AppButton>
        </div>

        {recentDomes.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-ap-border-subtle pt-4 text-left">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ap-text-tertiary">
              <Sparkles size={12} aria-hidden="true" />
              Recent
            </span>
            {recentDomes.map((dome) => (
              <button
                key={dome.id}
                type="button"
                disabled={folderLoading}
                className={`truncate rounded-ap-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-black/5 ${dome.id === activeDome?.id ? "font-semibold text-ap-text-primary" : "text-ap-text-secondary"}`}
                onClick={() => {
                  setDismissed(true);
                  void switchDome(dome.id);
                }}
              >
                {dome.name}
              </button>
            ))}
          </div>
        ) : null}
      </AppDialogContent>
    </AppDialog>
  );
}
