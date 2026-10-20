import { useCallback, useRef } from "react";

// Distance the pointer must travel from the press point before a press
// turns into a drag -- exists purely to disambiguate "clicked" from
// "dragged" (a perfectly still click still has a pixel or two of jitter).
// Until this is crossed, onDragStart never fires, so the tile shows
// literally zero visual response to pointer movement; the previous value
// of 8px made that dead zone big enough to read as "the tile doesn't
// move for a moment, then snaps to the cursor" -- Figma/Obsidian-style
// canvases use something closer to this.
const DRAG_START_THRESHOLD = 3;

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

    if (
      !pressState
      || pressState.pointerId !== event.pointerId
      || pressState.hasTriggeredDrag
      || pressState.suppressActivation
      || !canDrag
    ) {
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
