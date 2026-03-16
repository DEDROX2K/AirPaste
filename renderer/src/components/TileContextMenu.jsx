const PRIMARY_ACTIONS = [
  { id: "tags", label: "Add tags" },
  { id: "space", label: "Add to space" },
  { id: "top-of-mind", label: "Top of Mind" },
];

export default function TileContextMenu({
  menu,
  menuRef,
  onAction,
  onDelete,
}) {
  if (!menu) {
    return null;
  }

  function handleActionClick(event, actionId) {
    event.preventDefault();
    event.stopPropagation();
    onAction(actionId, menu.card);
  }

  function handleDeleteClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onDelete(menu.card);
  }

  return (
    <div
      ref={menuRef}
      className="tile-context-menu"
      style={{
        left: `${menu.x}px`,
        top: `${menu.y}px`,
      }}
      role="menu"
      aria-label="Tile actions"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
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
          <span>Delete card</span>
        </button>
      </div>
    </div>
  );
}
