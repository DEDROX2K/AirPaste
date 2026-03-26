export const RADIAL_MENU_ACTION_ORDER = [
  "note",
  "snapping",
  "delete",
  "folder",
  "rack",
  "link",
];

export function buildRadialMenuActions({
  menu,
  snapEnabled,
  deleteDisabled,
  folderDisabled = false,
  handlers,
}) {
  const selectionCount = menu?.selectionIds?.length ?? 0;

  // Extend this switch with new ids as the canvas command surface grows.
  return RADIAL_MENU_ACTION_ORDER.map((id) => {
    if (id === "note") {
      return {
        id,
        label: "Note",
        kind: "action",
        icon: "note",
        onTrigger: handlers.onCreateNote,
      };
    }

    if (id === "snapping") {
      return {
        id,
        label: "Snapping",
        kind: "toggle",
        icon: "snapping",
        specialStyle: "toggle",
        activeLabel: snapEnabled ? "Grid On" : "Grid Off",
        isActive: snapEnabled,
        onTrigger: handlers.onToggleSnapping,
      };
    }

    if (id === "delete") {
      return {
        id,
        label: "Delete",
        kind: "action",
        icon: "delete",
        isDisabled: deleteDisabled,
        activeLabel: selectionCount > 1 ? `${selectionCount} selected` : "",
        onTrigger: handlers.onDeleteSelection,
      };
    }

    if (id === "folder") {
      return {
        id,
        label: "Folder",
        kind: "action",
        icon: "folder",
        isDisabled: folderDisabled,
        activeLabel: selectionCount > 0 ? `${selectionCount} selected` : "Create",
        onTrigger: handlers.onCreateFolder,
      };
    }

    if (id === "rack") {
      return {
        id,
        label: "Rack",
        kind: "action",
        icon: "rack",
        onTrigger: handlers.onCreateRack,
      };
    }

    return {
      id,
      label: "Link",
      kind: "action",
      icon: "link",
      activeLabel: "Clipboard",
      onTrigger: handlers.onCreateLink,
    };
  });
}
