import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useRadialMenu } from "../hooks/useRadialMenu";
import {
  RADIAL_MENU_ACTION_RADIUS,
  RADIAL_MENU_ACTION_SIZE,
  RADIAL_MENU_CLOSE_DURATION,
  RADIAL_MENU_CORE_SIZE,
  RADIAL_MENU_EASE,
  RADIAL_MENU_GLOW_SIZE,
  RADIAL_MENU_REVEAL_DURATION,
  RADIAL_MENU_SNAP_PILL_HEIGHT,
  RADIAL_MENU_SNAP_PILL_OFFSET,
  RADIAL_MENU_SNAP_PILL_MIN_WIDTH,
  RADIAL_MENU_STAGGER,
} from "../systems/interactions/radialMenuConstants";

function getActionGlyph(actionId) {
  if (actionId === "folder") {
    return "F";
  }

  if (actionId === "rack") {
    return "R";
  }

  if (actionId === "link") {
    return "L";
  }

  if (actionId === "delete") {
    return "D";
  }

  if (actionId === "snapping") {
    return "S";
  }

  return "?";
}

export default function RadialContextMenu({ menu, actions = [], onClose }) {
  const radialMenu = useRadialMenu(menu, actions.length);
  const [pendingActionId, setPendingActionId] = useState(null);
  const portalRoot = typeof document !== "undefined" ? document.body : null;
  const restoreFocusRef = useRef(null);

  const orbitActions = useMemo(
    () => actions.filter((action) => action.placement !== "pill"),
    [actions],
  );
  const snapAction = useMemo(
    () => actions.find((action) => action.placement === "pill") ?? null,
    [actions],
  );
  const mergedActions = useMemo(() => orbitActions.map((action, index) => ({
    ...radialMenu.items[index],
    ...action,
  })), [orbitActions, radialMenu.items]);

  useEffect(() => {
    if (!menu?.id) {
      return undefined;
    }

    restoreFocusRef.current = document.activeElement;
    return () => {
      if (restoreFocusRef.current instanceof HTMLElement) {
        restoreFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, [menu?.id]);

  const handleActionSelect = useCallback(async (action) => {
    if (!action?.onTrigger || action.isDisabled || pendingActionId) {
      return;
    }

    setPendingActionId(action.id);

    try {
      const result = await action.onTrigger();

      if (result !== false) {
        onClose();
      }
    } finally {
      setPendingActionId(null);
    }
  }, [onClose, pendingActionId]);

  if (!portalRoot) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {radialMenu.isOpen ? (
        <motion.div
          key={menu.id}
          className="radial-context-menu__overlay"
          data-context-menu-root="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.12, ease: RADIAL_MENU_EASE } }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: RADIAL_MENU_EASE } }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <motion.div
            className="radial-context-menu"
            role="menu"
            aria-label={menu.kind === "canvas" ? "Canvas actions" : "Tile actions"}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            style={{
              left: radialMenu.position.x,
              top: radialMenu.position.y,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div
              className="radial-context-menu__glow"
              aria-hidden="true"
              style={{
                width: RADIAL_MENU_GLOW_SIZE,
                height: RADIAL_MENU_GLOW_SIZE,
                marginLeft: -(RADIAL_MENU_GLOW_SIZE / 2),
                marginTop: -(RADIAL_MENU_GLOW_SIZE / 2),
              }}
            />

            {snapAction ? (
              <motion.button
                className={[
                  "radial-context-menu__snap-pill",
                  snapAction.isActive ? "radial-context-menu__snap-pill--active" : "",
                ].filter(Boolean).join(" ")}
                type="button"
                role="menuitemcheckbox"
                aria-label={snapAction.label}
                aria-checked={snapAction.isActive}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    duration: RADIAL_MENU_REVEAL_DURATION,
                    ease: RADIAL_MENU_EASE,
                    delay: 0.02,
                  },
                }}
                exit={{
                  opacity: 0,
                  y: 6,
                  scale: 0.98,
                  transition: {
                    duration: RADIAL_MENU_CLOSE_DURATION,
                    ease: RADIAL_MENU_EASE,
                  },
                }}
                style={{
                  minWidth: RADIAL_MENU_SNAP_PILL_MIN_WIDTH,
                  height: RADIAL_MENU_SNAP_PILL_HEIGHT,
                  left: 0,
                  top: -RADIAL_MENU_SNAP_PILL_OFFSET,
                  transform: "translate(-50%, -100%)",
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleActionSelect(snapAction);
                }}
              >
                <span className="radial-context-menu__snap-label-wrap">
                  <span className="radial-context-menu__snap-title">Snapping</span>
                  <span className="radial-context-menu__snap-meta">{snapAction.activeLabel}</span>
                </span>
                <span className="radial-context-menu__snap-switch" aria-hidden="true">
                  <span className="radial-context-menu__snap-switch-track" />
                  <span className="radial-context-menu__snap-switch-thumb" />
                </span>
              </motion.button>
            ) : null}

            <motion.div
              className="radial-context-menu__core"
              initial={{ opacity: 0, scale: 0.84 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: {
                  duration: 0.18,
                  ease: RADIAL_MENU_EASE,
                  delay: 0.04,
                },
              }}
              exit={{
                opacity: 0,
                scale: 0.9,
                transition: {
                  duration: RADIAL_MENU_CLOSE_DURATION,
                  ease: RADIAL_MENU_EASE,
                },
              }}
              style={{
                width: RADIAL_MENU_CORE_SIZE,
                height: RADIAL_MENU_CORE_SIZE,
                marginLeft: -(RADIAL_MENU_CORE_SIZE / 2),
                marginTop: -(RADIAL_MENU_CORE_SIZE / 2),
              }}
            >
              <span className="radial-context-menu__core-ring" aria-hidden="true" />
              <span className="radial-context-menu__core-dot" aria-hidden="true" />
            </motion.div>

            {mergedActions.map((action, index) => {
              const isPending = pendingActionId === action.id;

              return (
                <motion.button
                  key={action.id}
                  className={[
                    "radial-context-menu__action",
                    action.tone === "danger" ? "radial-context-menu__action--danger" : "",
                    action.isDisabled ? "radial-context-menu__action--disabled" : "",
                    isPending ? "radial-context-menu__action--pending" : "",
                  ].filter(Boolean).join(" ")}
                  type="button"
                  role="menuitem"
                  aria-label={action.label}
                  disabled={action.isDisabled || isPending}
                  initial={{
                    opacity: 0,
                    scale: 0.78,
                    x: action.introX,
                    y: action.introY,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    x: action.x,
                    y: action.y,
                    transition: {
                      duration: RADIAL_MENU_REVEAL_DURATION,
                      ease: RADIAL_MENU_EASE,
                      delay: 0.08 + (index * RADIAL_MENU_STAGGER),
                    },
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.86,
                    x: action.introX,
                    y: action.introY,
                    transition: {
                      duration: RADIAL_MENU_CLOSE_DURATION,
                      ease: RADIAL_MENU_EASE,
                      delay: (mergedActions.length - index - 1) * 0.018,
                    },
                  }}
                  style={{
                    width: RADIAL_MENU_ACTION_SIZE,
                    height: RADIAL_MENU_ACTION_SIZE,
                    marginLeft: -(RADIAL_MENU_ACTION_SIZE / 2),
                    marginTop: -(RADIAL_MENU_ACTION_SIZE / 2),
                    borderRadius: RADIAL_MENU_ACTION_RADIUS,
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleActionSelect(action);
                  }}
                >
                  <span className="radial-context-menu__action-shell" aria-hidden="true" />
                  <span className="radial-context-menu__action-glyph" aria-hidden="true">
                    {getActionGlyph(action.id)}
                  </span>
                  <span className="radial-context-menu__action-copy">
                    <span className="radial-context-menu__action-label">{action.label}</span>
                    {action.activeLabel ? (
                      <span className="radial-context-menu__action-meta">{action.activeLabel}</span>
                    ) : null}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    portalRoot,
  );
}
