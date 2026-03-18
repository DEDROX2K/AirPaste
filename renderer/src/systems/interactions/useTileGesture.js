import { useCallback, useRef } from "react";

const DRAG_START_THRESHOLD = 8;

export function useTileGesture({
  card,
  canDrag = true,
  onActivate,
  onDoubleActivate,
  onDragStart,
  onPressStart,
}) {
  const pressStateRef = useRef(null);

  const clearPressState = useCallback((event) => {
    const pressState = pressStateRef.current;

    if (!pressState) {
      return null;
    }

    if (event && pressState.pointerId !== event.pointerId) {
      return null;
    }

    pressState.target?.releasePointerCapture?.(pressState.pointerId);
    pressStateRef.current = null;
    return pressState;
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    pressStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hasTriggeredDrag: false,
      suppressActivation: Boolean(onPressStart?.(card, event)),
      target: event.currentTarget,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [card, onPressStart]);

  const handlePointerMove = useCallback((event) => {
    const pressState = pressStateRef.current;

    if (!pressState || pressState.pointerId !== event.pointerId || pressState.hasTriggeredDrag || !canDrag) {
      return;
    }

    const deltaX = event.clientX - pressState.startX;
    const deltaY = event.clientY - pressState.startY;

    if (Math.hypot(deltaX, deltaY) < DRAG_START_THRESHOLD) {
      return;
    }

    pressState.hasTriggeredDrag = true;
    onDragStart?.(card, event);
  }, [canDrag, card, onDragStart]);

  const handlePointerUp = useCallback((event) => {
    const pressState = clearPressState(event);

    if (!pressState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (pressState.hasTriggeredDrag) {
      return;
    }

    if (!pressState.suppressActivation) {
      onActivate?.(card, event);
    }
  }, [card, clearPressState, onActivate]);

  const handlePointerCancel = useCallback((event) => {
    clearPressState(event);
  }, [clearPressState]);

  const handleDoubleClick = useCallback((event) => {
    if (!onDoubleActivate) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onDoubleActivate(card, event);
  }, [card, onDoubleActivate]);

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onDoubleClick: onDoubleActivate ? handleDoubleClick : undefined,
  };
}
