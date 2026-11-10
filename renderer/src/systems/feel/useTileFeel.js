import { useEffect, useLayoutEffect, useRef } from "react";
import {
  FEEL,
  createFeel,
  getFeelStyle,
  getNeighbourPush,
  isFeelAtRest,
  stepFeel,
} from "./tileFeelPhysics";

const EMPTY_LIST = [];
const MAX_FRAME_S = 1 / 30;
const POP_IN_MS = 380;
const EXIT_MS = 230;
const MAX_ANIMATED = 12;
// A tile that was just dragged and then leaves the canvas went into a rack
// (or similar), not to the bin: no shrink-away for it.
const RECENT_DRAG_MS = 600;

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function escapeAttribute(value) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : String(value).replace(/["\\]/g, "\\$&");
}

function clampUnit(value) {
  return Math.max(-1, Math.min(1, value));
}

function clearCard(card) {
  if (!card) {
    return;
  }

  delete card.dataset.feel;
  ["--feel-x", "--feel-y", "--feel-transform"].forEach((property) => card.style.removeProperty(property));
}

// Draws the tile "weight" (see tileFeelPhysics.js) straight onto the cards'
// CSS variables, outside React, on its own frame loop. The loop only runs
// while a drag is under way or a tile is still settling; at rest it is idle
// and the cards carry no styles at all. It never touches layout or saved
// positions, only transform, so it costs a few vars on the dragged tile and
// on the handful of tiles near it.
export function useTileFeel({
  entries,
  draggingTileIds = EMPTY_LIST,
  dragDelta = null,
  grabPoint = null,
  contentRef,
  getZoom,
  resetKey,
}) {
  const lifecycleRef = useRef({
    ids: null,
    resetKey: undefined,
    recentlyHeld: new Map(),
    pendingDeleted: new Set(),
    observer: null,
    observed: null,
  });
  const feelsRef = useRef(new Map());
  const loopRef = useRef({ running: false, rafId: 0, last: 0 });
  const velocityRef = useRef({ vx: 0, vy: 0, prev: null, t: 0 });
  const entryByIdRef = useRef(new Map());
  const inputRef = useRef({ draggingTileIds, dragDelta, grabPoint });
  const reduceMotionRef = useRef(prefersReducedMotion());
  const getZoomRef = useRef(getZoom);

  inputRef.current = { draggingTileIds, dragDelta, grabPoint };
  getZoomRef.current = getZoom;

  const getCard = (feel) => {
    if (feel.card?.isConnected) {
      return feel.card;
    }

    feel.card = contentRef.current?.querySelector(`[data-tether-tile="${escapeAttribute(feel.id)}"] > .card`) ?? null;
    return feel.card;
  };

  const frameRef = useRef(null);

  frameRef.current = (timestamp) => {
    const loop = loopRef.current;
    const dt = Math.min(MAX_FRAME_S, Math.max(0.001, (timestamp - loop.last) / 1000) || 0.016);
    loop.last = timestamp;

    const { draggingTileIds: heldIds, dragDelta: delta, grabPoint: grab } = inputRef.current;
    const feels = feelsRef.current;
    const entryById = entryByIdRef.current;
    const zoom = getZoomRef.current?.() || 1;
    const heldSet = new Set(delta ? heldIds : EMPTY_LIST);

    // Pointer velocity in screen px/s. The drag delta only changes when the
    // drag does, so a pointer that stops reads as a velocity that dies off.
    const velocity = velocityRef.current;
    const age = performance.now() - velocity.t;
    const fade = age <= 40 ? 1 : Math.max(0, 1 - (age - 40) / 60);
    const vx = velocity.vx * fade * zoom;
    const vy = velocity.vy * fade * zoom;

    const heldRects = [];
    let anchorId = null;

    heldSet.forEach((tileId) => {
      const entry = entryById.get(tileId);

      if (!entry) {
        return;
      }

      if (!feels.has(tileId)) {
        feels.set(tileId, createFeel(tileId));
      }

      heldRects.push({
        cx: entry.x + entry.width / 2 + delta.x,
        cy: entry.y + entry.height / 2 + delta.y,
        w: entry.width,
        h: entry.height,
      });

      if (
        grab
        && anchorId === null
        && grab.x >= entry.x && grab.x <= entry.x + entry.width
        && grab.y >= entry.y && grab.y <= entry.y + entry.height
      ) {
        anchorId = tileId;
      }
    });

    if (anchorId === null) {
      anchorId = heldIds[0] ?? null;
    }

    // Neighbours near a held tile get a push target; tiles that stop being
    // pushed keep their feel until the spring has brought them home.
    const pushes = new Map();

    if (heldRects.length > 0) {
      const reach = FEEL.NUDGE_RANGE;

      entryById.forEach((entry, tileId) => {
        if (heldSet.has(tileId)) {
          return;
        }

        const rect = {
          cx: entry.x + entry.width / 2,
          cy: entry.y + entry.height / 2,
          w: entry.width,
          h: entry.height,
        };
        const close = heldRects.some((held) => (
          Math.abs(rect.cx - held.cx) < (rect.w + held.w) / 2 + reach
          && Math.abs(rect.cy - held.cy) < (rect.h + held.h) / 2 + reach
        ));

        if (!close) {
          return;
        }

        const push = getNeighbourPush(rect, heldRects);

        if (push.x !== 0 || push.y !== 0) {
          pushes.set(tileId, push);

          if (!feels.has(tileId)) {
            feels.set(tileId, createFeel(tileId));
          }
        }
      });
    }

    feels.forEach((feel, tileId) => {
      const entry = entryById.get(tileId);

      if (!entry) {
        clearCard(feel.card);
        feels.delete(tileId);
        return;
      }

      const held = heldSet.has(tileId);
      const push = pushes.get(tileId);
      const input = held
        ? {
          held: true,
          vx,
          vy,
          grabX: grab ? clampUnit((grab.x - (entry.x + entry.width / 2)) / (entry.width / 2)) : 0,
          grabY: grab ? clampUnit((grab.y - (entry.y + entry.height / 2)) / (entry.height / 2)) : 0,
          trail: heldSet.size > 1 && tileId !== anchorId,
        }
        : { held: false, vx: 0, vy: 0, pushX: push?.x ?? 0, pushY: push?.y ?? 0 };

      // Fixed sub-steps keep the springs stable on a slow frame.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));

      for (let index = 0; index < steps; index += 1) {
        stepFeel(feel, input, dt / steps);
      }

      const card = getCard(feel);

      if (!card) {
        return;
      }

      if (isFeelAtRest(feel)) {
        clearCard(card);
        feels.delete(tileId);
        return;
      }

      const style = getFeelStyle(feel);
      card.dataset.feel = "1";
      card.style.setProperty("--feel-x", style.x);
      card.style.setProperty("--feel-y", style.y);
      card.style.setProperty("--feel-transform", style.transform);
    });

    if (heldSet.size > 0 || feels.size > 0) {
      loop.rafId = requestAnimationFrame(frameRef.current);
      return;
    }

    loop.running = false;
    loop.rafId = 0;
  };

  // Entries by id, rebuilt only when the tiles change (not per drag frame).
  // The same pass spots tiles that appeared (pop in) or disappeared (a ghost
  // of the removed element shrinks away, see the observer below).
  useLayoutEffect(() => {
    const entryById = new Map(entries.map((entry) => [entry.tile.id, entry]));
    entryByIdRef.current = entryById;

    const known = lifecycleRef.current;
    const previousIds = known.ids;
    known.ids = new Set(entryById.keys());

    if (!previousIds || known.resetKey !== resetKey || reduceMotionRef.current) {
      known.resetKey = resetKey;
      return;
    }

    const now = performance.now();
    const isRecentlyHeld = (tileId) => now - (known.recentlyHeld.get(tileId) ?? -Infinity) < RECENT_DRAG_MS;
    const added = [...known.ids].filter((tileId) => !previousIds.has(tileId) && !isRecentlyHeld(tileId));
    const removed = [...previousIds].filter((tileId) => !known.ids.has(tileId) && !isRecentlyHeld(tileId));

    // A bulk change (import, clear, page load) is not worth animating.
    if (added.length > 0 && added.length <= MAX_ANIMATED) {
      added.forEach((tileId) => {
        const card = contentRef.current?.querySelector(`[data-tether-tile="${escapeAttribute(tileId)}"] > .card`);
        // Back-out easing overshoots a touch, then settles: a spring in two keyframes.
        card?.animate?.(
          [{ scale: 0.9, opacity: 0 }, { scale: 1 }],
          { duration: POP_IN_MS, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
        );
      });
    }

    if (removed.length > 0 && removed.length <= MAX_ANIMATED) {
      removed.forEach((tileId) => known.pendingDeleted.add(tileId));
      window.setTimeout(() => removed.forEach((tileId) => known.pendingDeleted.delete(tileId)), 250);
    }
    known.resetKey = resetKey;
  }, [entries, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // React drops a deleted tile's element before anything can animate it. The
  // observer gets the element back right after the commit; it is put back
  // (no longer a live tile) and shrinks away, then goes for good.
  useLayoutEffect(() => {
    const content = contentRef.current;
    const lifecycle = lifecycleRef.current;

    if (!content || lifecycle.observed === content) {
      return;
    }

    lifecycle.observer?.disconnect();
    lifecycle.observed = content;
    lifecycle.observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.removedNodes.forEach((node) => {
          const tileId = node.nodeType === 1 ? node.getAttribute("data-tether-tile") : null;

          if (!tileId || !lifecycle.pendingDeleted.delete(tileId)) {
            return;
          }

          node.removeAttribute("data-tether-tile");
          node.setAttribute("aria-hidden", "true");
          node.style.pointerEvents = "none";
          const card = node.querySelector(":scope > .card");

          if (!card?.animate) {
            return;
          }

          record.target.appendChild(node);
          const tilt = Math.random() < 0.5 ? -3 : 3;
          const animation = card.animate(
            [
              { scale: 1, rotate: "0deg", opacity: 1 },
              { scale: 0.9, rotate: `${tilt}deg`, opacity: 0 },
            ],
            { duration: EXIT_MS, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
          );
          animation.onfinish = () => node.remove();
          animation.oncancel = () => node.remove();
        });
      });
    });
    lifecycle.observer.observe(content, { childList: true, subtree: true });
  });

  // Track the pointer's velocity from the drag delta, and wake the loop.
  useLayoutEffect(() => {
    if (reduceMotionRef.current) {
      return;
    }

    const velocity = velocityRef.current;
    const now = performance.now();
    draggingTileIds.forEach((tileId) => lifecycleRef.current.recentlyHeld.set(tileId, now));

    if (!dragDelta || draggingTileIds.length === 0) {
      velocity.vx = 0;
      velocity.vy = 0;
      velocity.prev = null;
    } else {
      if (velocity.prev) {
        const seconds = Math.max(0.004, (now - velocity.prev.t) / 1000);
        const rawX = (dragDelta.x - velocity.prev.x) / seconds;
        const rawY = (dragDelta.y - velocity.prev.y) / seconds;
        velocity.vx += (rawX - velocity.vx) * 0.45;
        velocity.vy += (rawY - velocity.vy) * 0.45;
      }

      velocity.prev = { x: dragDelta.x, y: dragDelta.y, t: now };
      velocity.t = now;
    }

    const loop = loopRef.current;

    if (!loop.running && draggingTileIds.length > 0 && dragDelta) {
      loop.running = true;
      loop.last = now;
      loop.rafId = requestAnimationFrame(frameRef.current);
    }
  }, [dragDelta, draggingTileIds]);

  useEffect(() => () => {
    lifecycleRef.current.observer?.disconnect();
    cancelAnimationFrame(loopRef.current.rafId);
    loopRef.current.running = false;
    feelsRef.current.forEach((feel) => clearCard(feel.card));
    feelsRef.current.clear();
  }, []);
}
