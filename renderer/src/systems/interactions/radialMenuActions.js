const CANVAS_ACTION_ORDER = [
  "refresh-failed-previews",
  "snapping",
  "folder",
  "rack",
  "link",
];

const TILE_ACTION_ORDER = [
  "refresh-preview",
  "copy-preview-diagnostics",
  "copy-codex-report",
  "folder",
  "rack",
  "link",
  "delete",
];

export function buildRadialMenuActions({
  menu,
  snapEnabled,
  deleteDisabled,
  failedPreviewRefreshCount = 0,
  singlePreviewRefreshDisabled = false,
  showSinglePreviewRefresh = false,
  showCopyPreviewDiagnostics = false,
  showCopyCodexReport = false,
  handlers,
}) {
  const selectionCount = menu?.selectionIds?.length ?? 0;
  const actionOrder = menu?.kind === "canvas" ? CANVAS_ACTION_ORDER : TILE_ACTION_ORDER;
  const deleteLabel = selectionCount > 1 ? `Delete ${selectionCount} tiles` : "Delete tile";

  // Extend this switch with new ids as the canvas command surface grows.
  return actionOrder.map((id) => {
    if (id === "refresh-failed-previews") {
      return {
        id,
        label: "Refresh failed previews",
        kind: "action",
        isDisabled: failedPreviewRefreshCount === 0,
        activeLabel: failedPreviewRefreshCount > 0 ? `${failedPreviewRefreshCount} recoverable` : "",
        onTrigger: handlers.onRefreshFailedPreviews,
      };
    }

    if (id === "refresh-preview") {
      if (!showSinglePreviewRefresh) {
        return null;
      }

      return {
        id,
        label: "Refresh preview",
        kind: "action",
        isDisabled: singlePreviewRefreshDisabled,
        activeLabel: singlePreviewRefreshDisabled ? "Loading" : "",
        onTrigger: handlers.onRefreshPreview,
      };
    }

    if (id === "copy-preview-diagnostics") {
      if (!showCopyPreviewDiagnostics) {
        return null;
      }

      return {
        id,
        label: "Copy preview diagnostics",
        kind: "action",
        onTrigger: handlers.onCopyPreviewDiagnostics,
      };
    }

    if (id === "copy-codex-report") {
      if (!showCopyCodexReport) {
        return null;
      }

      return {
        id,
        label: "Copy Codex report",
        kind: "action",
        onTrigger: handlers.onCopyCodexReport,
      };
    }

    if (id === "snapping") {
      return {
        id,
        label: snapEnabled ? "Disable snapping" : "Enable snapping",
        kind: "toggle",
        placement: "pill",
        activeLabel: snapEnabled ? "Grid On" : "Grid Off",
        isActive: snapEnabled,
        onTrigger: handlers.onToggleSnapping,
      };
    }

    if (id === "folder") {
      return {
        id,
        label: "Folder",
        kind: "action",
        activeLabel: selectionCount > 0 ? "Group" : "Create",
        onTrigger: handlers.onCreateFolder,
      };
    }

    if (id === "delete") {
      return {
        id,
        label: deleteLabel,
        kind: "action",
        isDisabled: deleteDisabled,
        tone: "danger",
        activeLabel: selectionCount > 1 ? `${selectionCount} selected` : "",
        onTrigger: handlers.onDeleteSelection,
      };
    }

    if (id === "rack") {
      return {
        id,
        label: "Rack",
        kind: "action",
        onTrigger: handlers.onCreateRack,
      };
    }

    return {
      id,
      label: "Link",
      kind: "action",
      activeLabel: "Clipboard",
      onTrigger: handlers.onCreateLink,
    };
  });
}
