import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { createPortal } from "react-dom";
import { useRadialMenu } from "../hooks/useRadialMenu";
import {
  RADIAL_MENU_ACTION_HEIGHT,
  RADIAL_MENU_ACTION_WIDTH,
  RADIAL_MENU_CLOSE_DURATION,
  RADIAL_MENU_CORE_SIZE,
  RADIAL_MENU_EASE,
  RADIAL_MENU_GLOW_SIZE,
  RADIAL_MENU_PARALLAX_INTENSITY,
  RADIAL_MENU_REVEAL_DURATION,
  RADIAL_MENU_STAGGER,
  RADIAL_MENU_TILT_INTENSITY,
  RADIAL_MENU_TOGGLE_HEIGHT,
  RADIAL_MENU_TOGGLE_WIDTH,
  RADIAL_MENU_TOGGLE_WIDTH_ACTIVE,
} from "../systems/interactions/radialMenuConstants";

export default function RadialContextMenu({ menu, actions = [], onClose }) {
  const radialMenu = useRadialMenu(menu, actions.length);
  const [parallaxEnabled, setParallaxEnabled] = useState(false);
  const [pendingActionId, setPendingActionId] = useState(null);
  const frameRef = useRef(0);
  const pointerStateRef = useRef({ x: 0, y: 0 });

  const targetTiltX = useMotionValue(0);
  const targetTiltY = useMotionValue(0);
  const targetShiftX = useMotionValue(0);
  const targetShiftY = useMotionValue(0);

  const tiltX = useSpring(targetTiltX, { stiffness: 180, damping: 24, mass: 0.8 });
  const tiltY = useSpring(targetTiltY, { stiffness: 180, damping: 24, mass: 0.8 });
  const shiftX = useSpring(targetShiftX, { stiffness: 190, damping: 26, mass: 0.8 });
  const shiftY = useSpring(targetShiftY, { stiffness: 190, damping: 26, mass: 0.8 });

  const parallaxXVar = useMotionTemplate`${shiftX}px`;
  const parallaxYVar = useMotionTemplate`${shiftY}px`;
  const portalRoot = typeof document !== "undefined" ? document.body : null;

  const mergedActions = useMemo(() => actions.map((action, index) => ({
    ...radialMenu.items[index],
    ...action,
  })), [actions, radialMenu.items]);

  const orbitTransition = useMemo(() => ({
    duration: RADIAL_MENU_REVEAL_DURATION,
    ease: RADIAL_MENU_EASE,
  }), []);

  const resetTilt = useCallback(() => {
    targetTiltX.set(0);
    targetTiltY.set(0);
    targetShiftX.set(0);
    targetShiftY.set(0);
  }, [targetShiftX, targetShiftY, targetTiltX, targetTiltY]);

  useEffect(() => {
    setParallaxEnabled(false);
    setPendingActionId(null);
    resetTilt();
    let enableParallaxTimeoutId = 0;

    if (menu?.id) {
      enableParallaxTimeoutId = window.setTimeout(() => {
        setParallaxEnabled(true);
      }, 820);
    }

    return () => {
      if (enableParallaxTimeoutId) {
        window.clearTimeout(enableParallaxTimeoutId);
      }

      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [menu?.id, resetTilt]);

  const schedulePointerUpdate = useCallback((event) => {
    if (!parallaxEnabled || !radialMenu.position) {
      return;
    }

    pointerStateRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    if (frameRef.current) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;

      const offsetX = pointerStateRef.current.x - radialMenu.position.x;
      const offsetY = pointerStateRef.current.y - radialMenu.position.y;
      const distance = Math.max(1, RADIAL_MENU_GLOW_SIZE * 0.5);
      const normalizedX = clamp(offsetX / distance, -1, 1);
      const normalizedY = clamp(offsetY / distance, -1, 1);

      targetTiltX.set(normalizedY * -RADIAL_MENU_TILT_INTENSITY);
      targetTiltY.set(normalizedX * RADIAL_MENU_TILT_INTENSITY);
      targetShiftX.set(normalizedX * RADIAL_MENU_PARALLAX_INTENSITY);
      targetShiftY.set(normalizedY * RADIAL_MENU_PARALLAX_INTENSITY);
    });
  }, [
    parallaxEnabled,
    radialMenu.position,
    targetShiftX,
    targetShiftY,
    targetTiltX,
    targetTiltY,
  ]);

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
          animate={{ opacity: 1, transition: { duration: 0.14, ease: RADIAL_MENU_EASE } }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: RADIAL_MENU_EASE } }}
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
            aria-label="Canvas radial menu"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            style={{
              left: radialMenu.position.x,
              top: radialMenu.position.y,
              rotateX: tiltX,
              rotateY: tiltY,
              "--radial-parallax-x": parallaxXVar,
              "--radial-parallax-y": parallaxYVar,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={schedulePointerUpdate}
            onPointerLeave={resetTilt}
          >
            <div className="radial-context-menu__glow" aria-hidden="true" />

            <motion.div
              className="radial-context-menu__core"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: {
                  duration: 0.22,
                  ease: RADIAL_MENU_EASE,
                },
              }}
              exit={{
                opacity: 0,
                scale: 0.9,
                transition: {
                  duration: RADIAL_MENU_CLOSE_DURATION,
                  ease: RADIAL_MENU_EASE,
                  delay: 0.04,
                },
              }}
              style={{
                width: RADIAL_MENU_CORE_SIZE,
                height: RADIAL_MENU_CORE_SIZE,
                marginLeft: -(RADIAL_MENU_CORE_SIZE / 2),
                marginTop: -(RADIAL_MENU_CORE_SIZE / 2),
              }}
            >
              <span className="radial-context-menu__core-inner" aria-hidden="true" />
            </motion.div>

            {mergedActions.map((action, index) => {
              const isToggle = action.kind === "toggle";
              const width = isToggle
                ? (action.isActive ? RADIAL_MENU_TOGGLE_WIDTH_ACTIVE : RADIAL_MENU_TOGGLE_WIDTH)
                : RADIAL_MENU_ACTION_WIDTH;
              const height = isToggle ? RADIAL_MENU_TOGGLE_HEIGHT : RADIAL_MENU_ACTION_HEIGHT;
              const isPending = pendingActionId === action.id;

              return (
                <motion.button
                  key={action.id}
                  layout
                  className={[
                    "radial-context-menu__orbit",
                    isToggle ? "radial-context-menu__orbit--toggle" : "",
                    action.isActive ? "radial-context-menu__orbit--active" : "",
                    action.isDisabled ? "radial-context-menu__orbit--disabled" : "",
                    isPending ? "radial-context-menu__orbit--pending" : "",
                  ].filter(Boolean).join(" ")}
                  type="button"
                  role={isToggle ? "menuitemcheckbox" : "menuitem"}
                  aria-label={action.label}
                  aria-checked={isToggle ? action.isActive : undefined}
                  disabled={action.isDisabled || isPending}
                  initial={{
                    opacity: 0,
                    scale: 0.92,
                    x: action.introX,
                    y: action.introY,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    x: action.x,
                    y: action.y,
                    transition: {
                      ...orbitTransition,
                      delay: 0.18 + (index * RADIAL_MENU_STAGGER),
                    },
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.94,
                    x: action.introX,
                    y: action.introY,
                    transition: {
                      duration: RADIAL_MENU_CLOSE_DURATION,
                      ease: RADIAL_MENU_EASE,
                      delay: (mergedActions.length - 1 - index) * 0.02,
                    },
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleActionSelect(action);
                  }}
                  style={{
                    width,
                    height,
                    marginLeft: -(width / 2),
                    marginTop: -(height / 2),
                  }}
                >
                  <span
                    className="radial-context-menu__orbit-inner"
                    aria-hidden="true"
                    style={{
                      "--radial-node-shift-x": `calc(var(--radial-parallax-x) * ${0.68 + (Math.abs(action.unitX) * 0.16)})`,
                      "--radial-node-shift-y": `calc(var(--radial-parallax-y) * ${0.68 + (Math.abs(action.unitY) * 0.16)})`,
                    }}
                  />
                  <span className="radial-context-menu__content">
                    <span className="radial-context-menu__label-wrap">
                      <span className="radial-context-menu__label">{action.label}</span>
                      {action.activeLabel ? (
                        <span className="radial-context-menu__meta">{action.activeLabel}</span>
                      ) : null}
                    </span>
                    {isToggle ? (
                      <span className="radial-context-menu__toggle-state" aria-hidden="true">
                        <span className="radial-context-menu__toggle-track" />
                        <span className="radial-context-menu__toggle-core" />
                      </span>
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

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}
