import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { moveKey } from "../../lib/homeLayout";

// Drag-to-reorder (and drop-to-group) for the Home card grid.
//
// Everything during the drag is direct DOM writes. The preview order is
// applied with the CSS `order` property, so the grid lays itself out exactly
// (cards of different sizes, e.g. a two-row group card, included), and the
// cards that move glide there (FLIP). The dragged card follows the pointer
// with a transform; a drop target gets a class. React state changes exactly
// once, on drop (flushSync, so the committed DOM order and the cleared
// `order` styles land in the same frame -- no flash).
//
// Cards are found by delegation: any element in the grid with
// `data-drag-key`. Elements inside a card marked `data-no-drag` (buttons,
// inputs) never start a drag.
//
// options (read through a ref, so they can change every render):
//   enabled            boolean
//   keys               entry keys in on-screen order
//   canMerge(src, dst) may `src` be dropped onto `dst` to group them?
//   onReorder(keys, draggedKey)
//   onMerge(sourceKey, targetKey)
//   resolveMergedKey() key of the card that holds the merge, after commit
//   onDragStart()

const DRAG_THRESHOLD_PX = 5;
const SHIFT_MS = 240;
const SETTLE_MS = 260;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const AUTOSCROLL_EDGE_PX = 56;
const AUTOSCROLL_MAX_PX = 18;
const SHIFT_ANIMATION_ID = "ap-home-drag-shift";
const REORDER_HYSTERESIS_PX = 12;

// `attachKey`: change it when the grid element itself is replaced
// (e.g. the grid appears after an empty state), so listeners re-attach.
export function useHomeCardDrag(gridRef, options, attachKey = "") {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    let pending = null;
    let drag = null;
    let frame = 0;
    let suppressClick = false;

    const cardFor = (key) => grid.querySelector(`[data-drag-key="${CSS.escape(key)}"]`);

    // Layout boxes in grid coordinates, ignoring transforms (the grid is
    // position: relative, so it's every card's offsetParent).
    function measureBoxes() {
      const boxes = new Map();
      for (const [key, element] of drag.elements) {
        boxes.set(key, { x: element.offsetLeft, y: element.offsetTop, w: element.offsetWidth, h: element.offsetHeight });
      }
      return boxes;
    }

    function begin(event) {
      const { keys } = optionsRef.current;
      const elements = new Map();
      for (const key of keys) {
        const element = cardFor(key);
        if (!element) return false;
        elements.set(key, element);
      }
      const element = elements.get(pending.key);
      try {
        element.setPointerCapture(pending.pointerId);
      } catch {
        // Pointer already gone; the drag still works off window events.
      }
      const gridRect = grid.getBoundingClientRect();
      drag = {
        key: pending.key,
        element,
        keys: [...keys],
        preview: [...keys],
        elements,
        boxes: null,
        // Where on the card it was grabbed.
        grabX: pending.startX - gridRect.left - element.offsetLeft,
        grabY: pending.startY - gridRect.top - element.offsetTop,
        clientX: event.clientX,
        clientY: event.clientY,
        mergeTarget: null,
        scroller: grid.closest(".ap-home-content"),
      };
      drag.boxes = measureBoxes();
      element.classList.add("is-drag-source");
      element.style.transition = "none";
      element.style.zIndex = "20";
      grid.classList.add("is-dragging");
      return true;
    }

    function setMergeTarget(key) {
      if (drag.mergeTarget === key) return;
      if (drag.mergeTarget) drag.elements.get(drag.mergeTarget)?.classList.remove("is-merge-target");
      drag.mergeTarget = key;
      if (key) drag.elements.get(key)?.classList.add("is-merge-target");
      drag.element.classList.toggle("is-merging", Boolean(key));
    }

    // Re-lays the grid in the preview order and glides the moved cards.
    function applyPreview(nextPreview) {
      const gridRect = grid.getBoundingClientRect();
      const before = new Map();
      for (const [key, element] of drag.elements) {
        if (key === drag.key) continue;
        const rect = element.getBoundingClientRect();
        before.set(key, { x: rect.left - gridRect.left, y: rect.top - gridRect.top });
      }
      drag.preview = nextPreview;
      nextPreview.forEach((key, index) => {
        drag.elements.get(key).style.order = String(index);
      });
      drag.boxes = measureBoxes();
      for (const [key, from] of before) {
        const element = drag.elements.get(key);
        const to = drag.boxes.get(key);
        element.getAnimations?.().forEach((animation) => {
          if (animation.id === SHIFT_ANIMATION_ID) animation.cancel();
        });
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        const animation = element.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
          { duration: SHIFT_MS, easing: EASE },
        );
        animation.id = SHIFT_ANIMATION_ID;
      }
    }

    function autoscroll() {
      const scroller = drag.scroller;
      if (!scroller) return false;
      const rect = scroller.getBoundingClientRect();
      let delta = 0;
      if (drag.clientY < rect.top + AUTOSCROLL_EDGE_PX) {
        delta = -AUTOSCROLL_MAX_PX * Math.min(1, (rect.top + AUTOSCROLL_EDGE_PX - drag.clientY) / AUTOSCROLL_EDGE_PX);
      } else if (drag.clientY > rect.bottom - AUTOSCROLL_EDGE_PX) {
        delta = AUTOSCROLL_MAX_PX * Math.min(1, (drag.clientY - (rect.bottom - AUTOSCROLL_EDGE_PX)) / AUTOSCROLL_EDGE_PX);
      }
      if (!delta) return false;
      const before = scroller.scrollTop;
      scroller.scrollTop = before + delta;
      return scroller.scrollTop !== before;
    }

    function positionDragged(x, y) {
      const own = drag.boxes.get(drag.key);
      const dx = x - drag.grabX - own.x;
      const dy = y - drag.grabY - own.y;
      drag.element.style.transform = `translate(${dx}px, ${dy}px) scale(${drag.mergeTarget ? 0.9 : 1.03})`;
    }

    function tick() {
      frame = 0;
      if (!drag) return;
      const scrolled = autoscroll();
      const gridRect = grid.getBoundingClientRect();
      const x = drag.clientX - gridRect.left;
      const y = drag.clientY - gridRect.top;

      // The card under the pointer, by its laid-out box (not where it is
      // mid-glide), so the target doesn't flicker while cards move.
      let hit = null;
      for (const [key, box] of drag.boxes) {
        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
          hit = { key, box };
          break;
        }
      }

      if (hit && hit.key !== drag.key) {
        const relX = (x - hit.box.x) / hit.box.w;
        const relY = (y - hit.box.y) / hit.box.h;
        const { canMerge } = optionsRef.current;
        if (relX > 0.22 && relX < 0.78 && relY > 0.12 && relY < 0.88 && canMerge?.(drag.key, hit.key)) {
          setMergeTarget(hit.key);
        } else {
          setMergeTarget(null);
          // After a reflow, a different card can land under a pointer that
          // hasn't moved; wait for real movement before reordering again.
          const last = drag.lastReorderAt;
          const settled = !last || Math.hypot(x - last.x, y - last.y) >= REORDER_HYSTERESIS_PX;
          const without = drag.preview.filter((key) => key !== drag.key);
          const targetIndex = without.indexOf(hit.key);
          const next = moveKey(drag.preview, drag.key, relX < 0.5 ? targetIndex : targetIndex + 1);
          if (settled && next.join("\n") !== drag.preview.join("\n")) {
            applyPreview(next);
            drag.lastReorderAt = { x, y };
          }
        }
      } else if (hit) {
        setMergeTarget(null);
      }

      positionDragged(x, y);
      if (scrolled) frame = window.requestAnimationFrame(tick);
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(tick);
    }

    function clearStyles(element) {
      element.style.transition = "";
      element.style.transform = "";
      element.style.zIndex = "";
      element.style.order = "";
      element.classList.remove("is-drag-source", "is-merging", "is-merge-target");
    }

    function finish(commit) {
      window.cancelAnimationFrame(frame);
      frame = 0;
      const current = drag;
      drag = null;
      pending = null;
      removeWindowListeners();
      if (!current) return;
      suppressClick = true;
      grid.classList.remove("is-dragging");

      const fromRect = current.element.getBoundingClientRect();
      const mergeTarget = commit ? current.mergeTarget : null;
      const changed = commit && current.preview.join("\n") !== current.keys.join("\n");

      // Where every other card is drawn right now (some mid-glide).
      const drawn = new Map();
      for (const [key, element] of current.elements) {
        if (key === current.key) continue;
        drawn.set(key, element.getBoundingClientRect());
        element.getAnimations?.().forEach((animation) => {
          if (animation.id === SHIFT_ANIMATION_ID) animation.cancel();
        });
      }
      for (const element of current.elements.values()) clearStyles(element);
      flushSync(() => {
        const { onMerge, onReorder } = optionsRef.current;
        if (mergeTarget) onMerge?.(current.key, mergeTarget);
        else if (changed) onReorder?.(current.preview, current.key);
      });

      const animateFrom = (element, rect, zIndex = "") => {
        if (!element?.isConnected || typeof element.animate !== "function") return;
        const next = element.getBoundingClientRect();
        const dx = rect.left - next.left;
        const dy = rect.top - next.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        element.animate(
          [{ transform: `translate(${dx}px, ${dy}px)`, zIndex }, { transform: "none", zIndex }],
          { duration: SETTLE_MS, easing: EASE },
        );
      };

      // Cards ease from where they're drawn into their committed place (on a
      // cancelled drag, back where they started).
      for (const [key, rect] of drawn) animateFrom(cardFor(key), rect);
      if (mergeTarget) {
        // The dragged card is gone into the group; the group card pops.
        const target = optionsRef.current.resolveMergedKey?.(mergeTarget) ?? mergeTarget;
        cardFor(target)?.animate?.(
          [{ transform: "scale(0.94)" }, { transform: "scale(1.03)" }, { transform: "none" }],
          { duration: 320, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
        );
      } else {
        animateFrom(cardFor(current.key) ?? current.element, fromRect, "20");
      }
    }

    function onPointerMove(event) {
      if (drag) {
        drag.clientX = event.clientX;
        drag.clientY = event.clientY;
        schedule();
        return;
      }
      if (!pending || event.pointerId !== pending.pointerId) return;
      const dx = event.clientX - pending.startX;
      const dy = event.clientY - pending.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!begin(event)) {
        pending = null;
        removeWindowListeners();
        return;
      }
      optionsRef.current.onDragStart?.();
      schedule();
    }

    function onPointerUp(event) {
      if (drag) {
        // Resolve the drop from where the pointer was released, even if
        // no frame ran since the last move (a quick flick).
        drag.clientX = event.clientX;
        drag.clientY = event.clientY;
        window.cancelAnimationFrame(frame);
        tick();
        finish(true);
      } else {
        pending = null;
        removeWindowListeners();
      }
    }

    function onPointerCancel() {
      if (drag) finish(false);
      pending = null;
      removeWindowListeners();
    }

    function onKeyDown(event) {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    }

    function addWindowListeners() {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("keydown", onKeyDown, true);
    }

    function removeWindowListeners() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown, true);
    }

    function onPointerDown(event) {
      suppressClick = false;
      if (!optionsRef.current.enabled || event.button !== 0 || drag) return;
      if (event.target.closest("[data-no-drag], input, textarea, [contenteditable='true']")) return;
      const card = event.target.closest("[data-drag-key]");
      if (!card || !grid.contains(card)) return;
      pending = {
        key: card.getAttribute("data-drag-key"),
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      addWindowListeners();
    }

    function onClickCapture(event) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }

    // Native image drag would hijack the gesture.
    function onDragStart(event) {
      if (event.target.closest?.("[data-drag-key]")) event.preventDefault();
    }

    grid.addEventListener("pointerdown", onPointerDown);
    grid.addEventListener("click", onClickCapture, true);
    grid.addEventListener("dragstart", onDragStart);
    return () => {
      grid.removeEventListener("pointerdown", onPointerDown);
      grid.removeEventListener("click", onClickCapture, true);
      grid.removeEventListener("dragstart", onDragStart);
      removeWindowListeners();
      window.cancelAnimationFrame(frame);
      if (drag) {
        for (const element of drag.elements.values()) clearStyles(element);
        grid.classList.remove("is-dragging");
      }
      drag = null;
      pending = null;
    };
  }, [gridRef, attachKey]);
}
