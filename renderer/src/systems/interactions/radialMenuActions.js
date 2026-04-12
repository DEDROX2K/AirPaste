const CANVAS_ACTION_ORDER = [
  "snapping",
  "folder",
  "rack",
  "link",
];

const TILE_ACTION_ORDER = [
  "folder",
  "rack",
  "link",
  "delete",
];

export function buildRadialMenuActions({
  menu,
  snapEnabled,
  deleteDisabled,
  handlers,
}) {
  const selectionCount = menu?.selectionIds?.length ?? 0;
  const actionOrder = menu?.kind === "canvas" ? CANVAS_ACTION_ORDER : TILE_ACTION_ORDER;
  const deleteLabel = selectionCount > 1 ? `Delete ${selectionCount} tiles` : "Delete tile";

  // Extend this switch with new ids as the canvas command surface grows.
  return actionOrder.map((id) => {
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
