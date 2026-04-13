import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppButton } from "./ui/app";

const MENU_GAP = 12;
const MENU_MIN_WIDTH = 220;

function getMenuTitle(menu) {
  if (menu?.kind === "canvas") {
    return "Canvas";
  }

  const selectionCount = menu?.selectionIds?.length ?? 0;
  return selectionCount > 1 ? `${selectionCount} selected` : "Tile";
}

function buildMenuSections(actions) {
  const visibleActions = Array.isArray(actions) ? actions.filter(Boolean) : [];
  const normalActions = visibleActions.filter((action) => action.tone !== "danger");
  const destructiveActions = visibleActions.filter((action) => action.tone === "danger");

  if (normalActions.length === 0 && destructiveActions.length === 0) {
    return [];
  }

  return [
    normalActions.length > 0 ? { id: "primary", items: normalActions } : null,
    destructiveActions.length > 0 ? { id: "danger", items: destructiveActions } : null,
  ].filter(Boolean);
}

function getClampedPosition(x, y, width, height) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return {
    x: Math.min(Math.max(MENU_GAP, x), Math.max(MENU_GAP, viewportWidth - width - MENU_GAP)),
    y: Math.min(Math.max(MENU_GAP, y), Math.max(MENU_GAP, viewportHeight - height - MENU_GAP)),
  };
}

function ContextMenuDivider() {
  return <div className="tile-context-menu__divider" role="separator" />;
}

function ContextMenuItem({ action, isPending, onSelect }) {
  const className = [
    "tile-context-menu__item",
    action.kind === "toggle" ? "tile-context-menu__item--toggle" : "",
    action.tone === "danger" ? "tile-context-menu__item--danger" : "",
    action.isDisabled ? "tile-context-menu__item--disabled" : "",
    isPending ? "tile-context-menu__item--pending" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppButton tone="unstyled"
      className={className}
      type="button"
      role={action.kind === "toggle" ? "menuitemcheckbox" : "menuitem"}
      aria-checked={action.kind === "toggle" ? action.isActive === true : undefined}
      disabled={action.isDisabled || isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void onSelect(action);
      }}
    >
      <span className="tile-context-menu__item-copy">
        <span className="tile-context-menu__item-label">{action.label}</span>
        {action.activeLabel ? (
          <span className="tile-context-menu__item-description">{action.activeLabel}</span>
        ) : null}
      </span>
      <span className="tile-context-menu__item-shortcut" aria-hidden="true">
        {action.kind === "toggle" ? (action.isActive ? "On" : "Off") : ""}
      </span>
    </AppButton>
  );
}

function ContextMenuList({ actions, pendingActionId, onSelect }) {
  const sections = useMemo(() => buildMenuSections(actions), [actions]);

  return (
    <div className="tile-context-menu__sections">
      {sections.map((section, index) => (
        <div key={section.id} className="tile-context-menu__section" role="group">
          {index > 0 ? <ContextMenuDivider /> : null}
          {section.items.map((action) => (
            <ContextMenuItem
              key={action.id}
              action={action}
              isPending={pendingActionId === action.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function TileContextMenu({ menu, actions = [], onClose }) {
  const portalRoot = typeof document !== "undefined" ? document.body : null;
  const menuRef = useRef(null);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [position, setPosition] = useState(() => ({
    x: menu?.x ?? MENU_GAP,
    y: menu?.y ?? MENU_GAP,
  }));

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    setPosition(getClampedPosition(menu.x, menu.y, Math.max(MENU_MIN_WIDTH, rect.width), rect.height));
  }, [menu, actions]);

  const handleActionSelect = useCallback(async (action) => {
    if (!action?.onTrigger || action.isDisabled || pendingActionId) {
      return;
    }

    setPendingActionId(action.id);

    try {
      const result = await action.onTrigger();

      if (result !== false) {
        onClose?.();
      }
    } finally {
      setPendingActionId(null);
    }
  }, [onClose, pendingActionId]);

  if (!menu || !portalRoot) {
    return null;
  }

  return createPortal(
    <div
      className="tile-context-menu__overlay"
      data-context-menu-root="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={menuRef}
        className="tile-context-menu"
        role="menu"
        aria-label={menu.kind === "canvas" ? "Canvas actions" : "Tile actions"}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          minWidth: `${MENU_MIN_WIDTH}px`,
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="tile-context-menu__header">
          <span className="tile-context-menu__title">{getMenuTitle(menu)}</span>
        </div>
        <ContextMenuList
          actions={actions}
          pendingActionId={pendingActionId}
          onSelect={handleActionSelect}
        />
      </div>
    </div>,
    portalRoot,
  );
}

