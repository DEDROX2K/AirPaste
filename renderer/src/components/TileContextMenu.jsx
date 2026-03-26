const PRIMARY_ACTIONS = [
  { id: "tags", label: "Add tags" },
  { id: "space", label: "Add to space" },
  { id: "top-of-mind", label: "Top of Mind" },
];

export default function TileContextMenu({
  menu,
  onAction,
  onToggleSnapping,
  onDelete,
  snapEnabled,
}) {
  if (!menu) {
    return null;
  }

  const isCanvasMenu = menu.kind === "canvas";
  const deleteLabel = menu.selectionIds?.length > 1
    ? `Delete ${menu.selectionIds.length} tiles`
    : "Delete tile";

  function handleActionClick(event, actionId) {
    event.preventDefault();
    event.stopPropagation();
    onAction(actionId, menu.card);
  }

  function handleDeleteClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onDelete(menu);
  }

  function handleSnappingClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onToggleSnapping?.();
  }

  return (
    <div
      className="tile-context-menu"
      data-context-menu-root="true"
      style={{
        "--context-menu-x": `${menu.x}px`,
        "--context-menu-y": `${menu.y}px`,
      }}
      role="menu"
      aria-label="Tile actions"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {isCanvasMenu ? (
        <div className="tile-context-menu__group">
          <button
            className="tile-context-menu__item"
            type="button"
            role="menuitemcheckbox"
            aria-checked={snapEnabled === true}
            onClick={handleSnappingClick}
          >
            <span className="tile-context-menu__icon tile-context-menu__icon--snap" aria-hidden="true" />
            <span>{snapEnabled ? "Disable snapping" : "Enable snapping"}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="tile-context-menu__group">
            {PRIMARY_ACTIONS.map((action) => (
              <button
                key={action.id}
                className="tile-context-menu__item"
                type="button"
                role="menuitem"
                onClick={(event) => handleActionClick(event, action.id)}
              >
                <span className={`tile-context-menu__icon tile-context-menu__icon--${action.id}`} aria-hidden="true" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>

          <div className="tile-context-menu__footer">
            <button
              className="tile-context-menu__item tile-context-menu__item--danger"
              type="button"
              role="menuitem"
              onClick={handleDeleteClick}
            >
              <span className="tile-context-menu__icon tile-context-menu__icon--delete" aria-hidden="true" />
              <span>{deleteLabel}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
