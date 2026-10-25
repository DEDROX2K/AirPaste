import { useState } from "react";
import { useAppContext } from "../context/useAppContext";
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "./ui/app";

// Shown whenever the canvas currently open in the active tab couldn't save
// because its file changed on disk since this session last synced with it
// (most often: the same Dome edited from another PC, with the edit arriving
// here via cloud sync while this canvas was also open). Deliberately has no
// "just dismiss" escape hatch -- the user's local edits stay safely pending
// in memory either way, but moving forward requires an explicit choice so
// nothing is ever silently overwritten.
export default function ConflictDialog() {
  const {
    canvasConflicts,
    currentEditor,
    resolveCanvasConflictKeepMine,
    resolveCanvasConflictUseTheirs,
  } = useAppContext();
  const [resolving, setResolving] = useState(false);

  const canvasPath = currentEditor.kind === "canvas" ? currentEditor.filePath : null;
  const conflict = canvasPath ? canvasConflicts[canvasPath] : null;

  if (!conflict) {
    return null;
  }

  const title = currentEditor.name || "This canvas";

  async function handleKeepMine() {
    setResolving(true);
    try {
      await resolveCanvasConflictKeepMine(canvasPath);
    } finally {
      setResolving(false);
    }
  }

  async function handleUseTheirs() {
    setResolving(true);
    try {
      await resolveCanvasConflictUseTheirs(canvasPath);
    } finally {
      setResolving(false);
    }
  }

  return (
    <AppDialog open>
      <AppDialogContent
        className="max-w-sm [&>button]:hidden"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <AppDialogHeader>
          <AppDialogTitle>&ldquo;{title}&rdquo; changed elsewhere</AppDialogTitle>
          <AppDialogDescription>
            This canvas was changed on disk since you opened it here -- most likely edited on another
            computer and synced in. Your unsaved changes are safe in memory, but saving is paused until
            you choose which version to keep. Nothing has been overwritten yet.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogFooter>
          <AppButton type="button" tone="surface" disabled={resolving} onClick={handleUseTheirs}>
            Use their version
          </AppButton>
          <AppButton type="button" tone="accent" disabled={resolving} onClick={handleKeepMine}>
            Keep mine
          </AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
