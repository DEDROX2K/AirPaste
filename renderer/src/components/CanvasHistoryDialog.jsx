import { useEffect, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import { desktop } from "../lib/desktop";
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "./ui/app";

function formatEntryTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// A handful of checkpoints saveCanvas keeps automatically (roughly one every
// few minutes of active editing, plus always right before a conflict is
// explicitly overwritten or a version is restored) -- not a full undo log,
// just enough to recover from a bad sync, a mistaken overwrite, or an
// accidental edit a session or two back.
export default function CanvasHistoryDialog({ open, canvasPath, canvasTitle, onClose }) {
  const { restoreCanvasVersion } = useAppContext();
  const [entries, setEntries] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open || !canvasPath) {
      setEntries(null);
      setConfirmingId(null);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setEntries(null);
    setLoadError("");
    desktop.workspace.listCanvasHistory(canvasPath)
      .then((list) => { if (!cancelled) setEntries(Array.isArray(list) ? list : []); })
      .catch((error) => { if (!cancelled) setLoadError(error?.message || "Unable to load version history."); });

    return () => { cancelled = true; };
  }, [open, canvasPath]);

  async function handleRestore(entryId) {
    setRestoring(true);
    try {
      await restoreCanvasVersion(canvasPath, entryId);
      onClose();
    } catch (error) {
      setLoadError(error?.message || "Unable to restore that version.");
    } finally {
      setRestoring(false);
      setConfirmingId(null);
    }
  }

  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AppDialogContent className="max-w-md">
        <AppDialogHeader>
          <AppDialogTitle>Version History</AppDialogTitle>
          <AppDialogDescription>
            Checkpoints of &ldquo;{canvasTitle}&rdquo; saved automatically as you work. Restoring one
            replaces the current content, but saves what&apos;s there now to history first.
          </AppDialogDescription>
        </AppDialogHeader>

        {loadError ? <p className="text-sm" style={{ color: "hsl(var(--ap-status-danger-text))" }}>{loadError}</p> : null}

        {entries === null && !loadError ? (
          <p className="text-sm text-ap-text-secondary">Loading…</p>
        ) : null}

        {entries && entries.length === 0 ? (
          <p className="text-sm text-ap-text-secondary">
            No checkpoints yet -- history builds up automatically as you keep editing this canvas.
          </p>
        ) : null}

        {entries && entries.length > 0 ? (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 rounded-ap-md border border-ap-border-subtle px-3 py-2">
                <span className="text-sm text-ap-text-primary">{formatEntryTimestamp(entry.createdAt)}</span>
                {confirmingId === entry.id ? (
                  <span className="flex items-center gap-2">
                    <AppButton type="button" tone="surface" disabled={restoring} onClick={() => setConfirmingId(null)}>
                      Cancel
                    </AppButton>
                    <AppButton type="button" tone="accent" disabled={restoring} onClick={() => handleRestore(entry.id)}>
                      Confirm Restore
                    </AppButton>
                  </span>
                ) : (
                  <AppButton type="button" tone="surface" disabled={restoring} onClick={() => setConfirmingId(entry.id)}>
                    Restore
                  </AppButton>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <AppDialogFooter>
          <AppButton type="button" tone="surface" onClick={onClose}>Close</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
