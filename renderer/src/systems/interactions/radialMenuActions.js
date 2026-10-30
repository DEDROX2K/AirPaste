const CANVAS_ACTION_ORDER = [
  "refresh-failed-previews",
  "snapping",
  "text",
  "checklist",
  "paper-note",
  "rack",
  "link",
];

const TILE_ACTION_ORDER = [
  "edit-text",
  "link-note",
  "file-color",
  "refresh-preview",
  "webclip",
  "copy-preview-diagnostics",
  "copy-codex-report",
  "tether",
  "untether",
  "rack",
  "link",
  "delete",
];

const GROUP_ACTION_ORDER = [
  "delete",
];

export function buildRadialMenuActions({
  menu,
  snapEnabled,
  deleteDisabled,
  failedPreviewRefreshCount = 0,
  singlePreviewRefreshDisabled = false,
  showSinglePreviewRefresh = false,
  showWebclip = false,
  isWebclipActive = false,
  webclipPending = false,
  showCopyPreviewDiagnostics = false,
  showCopyCodexReport = false,
  showEditText = false,
  showFileColor = false,
  linkNoteState = null,
  showTether = false,
  tetherCount = 0,
  showUntether = false,
  handlers,
}) {
  const selectionCount = menu?.selectionIds?.length ?? 0;
  const actionOrder = menu?.kind === "canvas"
    ? CANVAS_ACTION_ORDER
    : menu?.kind === "group"
      ? GROUP_ACTION_ORDER
      : TILE_ACTION_ORDER;
  const deleteLabel = menu?.kind === "group"
    ? (selectionCount > 1 ? `Delete ${selectionCount} groups` : "Delete group")
    : (selectionCount > 1 ? `Delete ${selectionCount} tiles` : "Delete tile");

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

    if (id === "webclip") {
      if (!showWebclip) {
        return null;
      }

      return {
        id,
        label: isWebclipActive ? "Standard preview" : "Webclip",
        kind: "toggle",
        placement: "pill",
        isActive: isWebclipActive,
        isDisabled: webclipPending,
        activeLabel: webclipPending ? "Capturing" : "",
        onTrigger: handlers.onToggleWebclip,
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

    if (id === "text") {
      return {
        id,
        label: "Add quick text",
        kind: "action",
        activeLabel: "Label",
        onTrigger: handlers.onCreateText,
      };
    }

    // linkNoteState: "closed" offers Add note, "open" offers Remove note.
    if (id === "link-note") {
      if (!linkNoteState) {
        return null;
      }

      return {
        id,
        label: linkNoteState === "open" ? "Remove note" : "Add note",
        kind: "action",
        onTrigger: handlers.onToggleLinkNote,
      };
    }

    if (id === "file-color") {
      if (!showFileColor) {
        return null;
      }

      return {
        id,
        label: "Change colour",
        kind: "action",
        onTrigger: handlers.onChangeFileColor,
      };
    }

    if (id === "edit-text") {
      if (!showEditText) {
        return null;
      }

      return {
        id,
        label: "Edit text",
        kind: "action",
        activeLabel: "Enter",
        onTrigger: handlers.onEditText,
      };
    }

    if (id === "checklist") {
      return {
        id,
        label: "Add checklist",
        kind: "action",
        activeLabel: "Note",
        onTrigger: handlers.onCreateChecklist,
      };
    }

    if (id === "paper-note") {
      return {
        id,
        label: "Add paper note",
        kind: "action",
        activeLabel: "Note",
        onTrigger: handlers.onCreatePaperNote,
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

    if (id === "tether") {
      if (!showTether) {
        return null;
      }

      return {
        id,
        label: `Tether ${tetherCount} tiles`,
        kind: "action",
        activeLabel: "Float",
        onTrigger: handlers.onTether,
      };
    }

    if (id === "untether") {
      if (!showUntether) {
        return null;
      }

      return {
        id,
        label: "Cut tethers",
        kind: "action",
        onTrigger: handlers.onUntether,
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
