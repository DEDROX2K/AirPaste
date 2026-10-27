import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStableCallback } from "../../hooks/useStableCallback";
import {
  NODE_MODE_FLOAT,
  NODE_MODE_HELD,
  NODE_MODE_REST,
  advance,
  attachLink,
  createNode,
  createTetherWorld,
  detachLink,
  disturb,
  findLink,
  getLinkRestLength,
  getNodeVisual,
  getThrowVelocity,
  isNodeMoving,
  recountDegrees,
} from "./tetherPhysics";

const EMPTY_LIST = [];
const CUT_FADE_S = 0.18;
const CUT_PARTICLES_S = 0.26;
const CUT_GRAVITY = 700;

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

function setLine(element, x1, y1, x2, y2) {
  element.setAttribute("x1", x1.toFixed(1));
  element.setAttribute("y1", y1.toFixed(1));
  element.setAttribute("x2", x2.toFixed(1));
  element.setAttribute("y2", y2.toFixed(1));
}

function setRect(element, node, inset) {
  element.setAttribute("x", (node.x - node.w / 2 - inset).toFixed(1));
  element.setAttribute("y", (node.y - node.h / 2 - inset).toFixed(1));
  element.setAttribute("width", Math.max(0, node.w + inset * 2).toFixed(1));
  element.setAttribute("height", Math.max(0, node.h + inset * 2).toFixed(1));
}

// Drops the offset once the tile's saved spot has caught up. The card's own
// 260ms transform transition stays off for two more frames: React writes
// the new --tile-x a moment before this runs, and anything that reads
// layout in between sees the offset counted twice. With the transition on,
// that moment would start a visible slide back (a twitch, or a tile
// flying in from far away).
function clearCardStyle(card) {
  ["--tether-x", "--tether-y", "--tether-rise", "--tether-rot", "--tether-scale", "filter"]
    .forEach((property) => card.style.removeProperty(property));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!card.dataset.tetherStyled) {
      card.style.removeProperty("transition");
    }
  }));
}

// Runs the tether simulation for the canvas tiles (see tetherPhysics.js)
// and draws it straight onto the DOM, outside React, while anything moves:
//  - each tile's .card gets --tether-x / -y (offset from its saved spot)
//    and the float lift / tilt vars;
//  - the SVG layer's lines follow the tile centres.
// Once everything is still, the new spots are saved in one change and the
// offsets drop back to zero. The loop never runs while nothing moves.
//
// Dragging stays with the interaction system; this only watches it: a held
// tile keeps its group awake, and on release it keeps its throw velocity
// (untethered tiles glide to a stop like a flicked sheet of paper).
export function useTetherSystem({
  entries,
  tethers,
  resetKey,
  draggingTileIds = EMPTY_LIST,
  dragDelta = null,
  flickEnabled = true,
  contentRef,
  svgRef,
  clientToWorldPoint,
  getZoom,
  onCreateTether,
  onCutTether,
  onCommitPositions,
}) {
  const worldRef = useRef(null);
  const resetKeyRef = useRef(undefined);
  const initializedRef = useRef(false);
  const cardElementsRef = useRef(new Map());
  const linkElementsRef = useRef(new Map());
  const linkElementsSourceRef = useRef({ tethers: null, svg: null });
  const bornLinkIdsRef = useRef(new Set());
  const snapsRef = useRef([]);
  const gestureRef = useRef(null);
  const hotLinkIdRef = useRef(null);
  const loopRef = useRef({ running: false, rafId: 0, last: 0, accumulator: 0, timeScale: 1 });
  const reduceMotionRef = useRef(prefersReducedMotion());
  const entriesRef = useRef(entries);
  const [gesture, setGesture] = useState(null);
  const [hotLinkId, setHotLinkIdState] = useState(null);

  entriesRef.current = entries;

  if (!worldRef.current || resetKeyRef.current !== resetKey) {
    worldRef.current = createTetherWorld();
    resetKeyRef.current = resetKey;
    initializedRef.current = false;
    cardElementsRef.current = new Map();
  }

  const getCardElement = useCallback((tileId) => {
    const cached = cardElementsRef.current.get(tileId);

    if (cached?.isConnected) {
      return cached;
    }

    const element = contentRef.current?.querySelector(`[data-tether-tile="${escapeAttribute(tileId)}"] > .card`) ?? null;
    cardElementsRef.current.set(tileId, element);
    return element;
  }, [contentRef]);

  // Styles one tile's card for this frame. The DOM is only touched for a
  // tile that is actually offset or lifted (node.styledCard remembers which
  // element carries the styles), so a frame costs nothing for the rest of
  // the board -- looking up every card each frame made drags stutter.
  const writeNode = useCallback((node, dtReal, time) => {
    const offsetX = node.x - node.baseX;
    const offsetY = node.y - node.baseY;
    const visual = getNodeVisual(node, dtReal, time, reduceMotionRef.current);
    const isNeutral = Math.abs(offsetX) < 0.01
      && Math.abs(offsetY) < 0.01
      && visual.lift === 0
      && visual.rot === 0;

    if (isNeutral) {
      if (node.styledCard) {
        delete node.styledCard.dataset.tetherStyled;
        clearCardStyle(node.styledCard);
        node.styledCard = null;
      }
      return;
    }

    const card = getCardElement(node.id);

    if (node.styledCard && node.styledCard !== card) {
      delete node.styledCard.dataset.tetherStyled;
      clearCardStyle(node.styledCard);
      node.styledCard = null;
    }

    if (!card) {
      return;
    }

    node.styledCard = card;
    card.dataset.tetherStyled = "1";
    card.style.setProperty("transition", "none");
    card.style.setProperty("--tether-x", `${offsetX.toFixed(2)}px`);
    card.style.setProperty("--tether-y", `${offsetY.toFixed(2)}px`);
    card.style.setProperty("--tether-rise", `${visual.rise.toFixed(2)}px`);
    card.style.setProperty("--tether-rot", `${visual.rot.toFixed(2)}deg`);
    card.style.setProperty("--tether-scale", visual.scale.toFixed(4));

    if (visual.lift > 0.02) {
      const lift = visual.lift;
      card.style.setProperty(
        "filter",
        `drop-shadow(0 ${(4 + lift * 14).toFixed(1)}px ${(6 + lift * 16).toFixed(1)}px rgba(0, 0, 0, ${(lift * 0.2).toFixed(3)}))`,
      );
    } else {
      card.style.removeProperty("filter");
    }
  }, [getCardElement]);

  const writeLinks = useCallback(() => {
    const world = worldRef.current;

    world.links.forEach((link) => {
      const elements = linkElementsRef.current.get(link.id);

      if (!elements) {
        return;
      }

      setLine(elements.line, link.a.x, link.a.y, link.b.x, link.b.y);
      setLine(elements.hit, link.a.x, link.a.y, link.b.x, link.b.y);
      elements.line.style.opacity = Math.min(1, 0.5 + Math.abs(link.stretch ?? 0) * 0.8).toFixed(2);
    });
  }, []);

  const writeGesture = useCallback(() => {
    const svg = svgRef.current;
    const currentGesture = gestureRef.current;

    if (!svg || !currentGesture) {
      return;
    }

    const world = worldRef.current;
    const from = world.nodeById.get(currentGesture.fromId);
    const target = currentGesture.targetId ? world.nodeById.get(currentGesture.targetId) : null;

    if (!from) {
      return;
    }

    const endX = target ? target.x : currentGesture.x;
    const endY = target ? target.y : currentGesture.y;
    const preview = svg.querySelector("[data-tether-preview]");
    const dot = svg.querySelector("[data-tether-preview-dot]");

    if (preview) {
      setLine(preview, from.x, from.y, endX, endY);
    }

    if (dot) {
      dot.setAttribute("cx", endX.toFixed(1));
      dot.setAttribute("cy", endY.toFixed(1));
    }

    const zoom = getZoom() || 1;
    const sourceRing = svg.querySelector("[data-tether-ring=\"source\"]");
    const targetRing = svg.querySelector("[data-tether-ring=\"target\"]");
    const targetGlow = svg.querySelector("[data-tether-ring=\"glow\"]");

    if (sourceRing) {
      setRect(sourceRing, from, 4 / zoom);
    }

    if (target && targetRing) {
      setRect(targetRing, target, 4 / zoom);
    }

    if (target && targetGlow) {
      setRect(targetGlow, target, 6 / zoom);
    }
  }, [getZoom, svgRef]);

  // The cut effect: the two severed halves drop and fade; two particles
  // burst from the cut point and fall. Sizes are screen px (/ zoom); time
  // is frame time, starting at the first frame after the cut.
  const writeSnaps = useCallback((frameTime) => {
    snapsRef.current = snapsRef.current.filter((snap) => {
      snap.startedAt ??= frameTime;
      const age = Math.max(0, (frameTime - snap.startedAt) / 1000);
      const progress = Math.min(1, age / CUT_FADE_S);
      const drop = (14 * progress * progress) / snap.zoom;
      setLine(snap.halfA, snap.a.x, snap.a.y + drop, snap.x, snap.y + drop);
      setLine(snap.halfB, snap.b.x, snap.b.y + drop, snap.x, snap.y + drop);
      snap.halfA.style.opacity = (1 - progress).toFixed(2);
      snap.halfB.style.opacity = (1 - progress).toFixed(2);

      const particleProgress = Math.min(1, age / CUT_PARTICLES_S);
      snap.particles.forEach((particle) => {
        particle.element.setAttribute("cx", (snap.x + (particle.vx * age) / snap.zoom).toFixed(1));
        particle.element.setAttribute("cy", (snap.y + (particle.vy * age + 0.5 * CUT_GRAVITY * age * age) / snap.zoom).toFixed(1));
        particle.element.style.opacity = (0.7 * (1 - particleProgress)).toFixed(2);
      });

      if (age > 0.3) {
        snap.group.remove();
        return false;
      }

      return true;
    });
  }, []);

  const writeAll = useCallback((dtReal) => {
    const world = worldRef.current;
    world.nodes.forEach((node) => {
      if (
        isNodeMoving(node)
        || node.lift !== 0
        || node.rot !== 0
        || Math.abs(node.x - node.baseX) >= 0.01
        || Math.abs(node.y - node.baseY) >= 0.01
        || node.styledCard
      ) {
        writeNode(node, dtReal, world.clock);
      }
    });
    writeLinks();
    writeGesture();
  }, [writeGesture, writeLinks, writeNode]);

  // Saves where the simulation left the tiles it moved (top-left, world px).
  const commitPositions = useStableCallback(() => {
    const world = worldRef.current;
    const positions = {};

    world.nodes.forEach((node) => {
      if (!node.dirty || node.mode === NODE_MODE_HELD) {
        return;
      }

      node.dirty = false;

      if (Math.abs(node.x - node.baseX) > 0.5 || Math.abs(node.y - node.baseY) > 0.5) {
        positions[node.id] = {
          x: Math.round(node.x - node.w / 2),
          y: Math.round(node.y - node.h / 2),
        };
      }
    });

    if (Object.keys(positions).length > 0) {
      onCommitPositions(positions);
    }
  });

  const isActive = useCallback(() => {
    const loop = loopRef.current;

    if (gestureRef.current || snapsRef.current.length > 0 || Math.abs(loop.timeScale - 1) > 0.01 || hotLinkIdRef.current) {
      return true;
    }

    return worldRef.current.nodes.some((node) => isNodeMoving(node) || node.lift !== 0 || node.rot !== 0);
  }, []);

  const frame = useStableCallback((timestamp) => {
    const loop = loopRef.current;
    const world = worldRef.current;
    const dtReal = Math.min(0.05, Math.max(0, (timestamp - loop.last) / 1000) || 0.016);
    loop.last = timestamp;

    // Hover slow-mo: with a line under the pointer the world eases to 15%
    // speed, so a line that is still settling is easy to click.
    const targetScale = hotLinkIdRef.current ? 0.15 : 1;
    loop.timeScale += (targetScale - loop.timeScale) * Math.min(1, dtReal * 10);

    // A held tile keeps its group awake and responsive.
    world.nodes.forEach((node) => {
      if (node.mode === NODE_MODE_HELD && node.deg > 0) {
        disturb(world, node);
      }
    });

    loop.accumulator = advance(world, dtReal, loop.timeScale, loop.accumulator);
    world.nodes.forEach((node) => {
      if (isNodeMoving(node)) {
        node.dirty = true;
      }
    });
    writeAll(dtReal);
    writeSnaps(timestamp);

    if (isActive()) {
      loop.rafId = requestAnimationFrame(frame);
      return;
    }

    loop.running = false;
    loop.rafId = 0;
    commitPositions();
  });

  const wake = useCallback(() => {
    const loop = loopRef.current;

    if (loop.running) {
      return;
    }

    loop.running = true;
    loop.last = performance.now();
    loop.rafId = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(() => () => {
    cancelAnimationFrame(loopRef.current.rafId);
    loopRef.current.running = false;
  }, []);

  // ---- Sync the world with the saved tiles and tethers (every render that
  // changes them, before paint, so offsets and saved spots never disagree
  // on screen).
  const heldKey = draggingTileIds.join("|");

  useLayoutEffect(() => {
    const world = worldRef.current;
    const isInitialized = initializedRef.current;
    const isRunning = loopRef.current.running;
    const draggingSet = new Set(draggingTileIds);
    const hasDragDelta = Boolean(dragDelta && (dragDelta.x !== 0 || dragDelta.y !== 0));
    const now = performance.now();
    const seenIds = new Set();
    let shouldWake = false;

    entries.forEach((entry) => {
      const tileId = entry.tile.id;
      let node = world.nodeById.get(tileId);
      const isHeld = draggingSet.has(tileId) && (hasDragDelta || node?.mode === NODE_MODE_HELD);
      const baseX = entry.x + entry.width / 2 + (isHeld && dragDelta ? dragDelta.x : 0);
      const baseY = entry.y + entry.height / 2 + (isHeld && dragDelta ? dragDelta.y : 0);
      seenIds.add(tileId);

      if (!node) {
        // At its saved spot: a drag already under way is added below.
        node = createNode(tileId, entry.x + entry.width / 2, entry.y + entry.height / 2, entry.width, entry.height);
        world.nodes.push(node);
        world.nodeById.set(tileId, node);
      }

      node.w = entry.width;
      node.h = entry.height;

      if (isHeld) {
        if (node.mode !== NODE_MODE_HELD) {
          // Picked up mid-flight: keep it where it is on screen. The drag
          // moves the saved spot, so remember how far the tile is from the
          // saved spot itself (not from the already-dragged one).
          node.holdX = node.x - (baseX - dragDelta.x);
          node.holdY = node.y - (baseY - dragDelta.y);
          node.mode = NODE_MODE_HELD;
          node.asleep = false;
          node.vx = 0;
          node.vy = 0;
          node.samples = [];
          node.dirty = true;
          disturb(world, node);
        }

        node.x = baseX + node.holdX;
        node.y = baseY + node.holdY;
        node.samples.push({ t: now, x: node.x, y: node.y });

        if (node.samples.length > 5) {
          node.samples.shift();
        }

        // A plain drag needs no simulation (the drag itself moves the
        // tile); only a tethered tile pulls its group along.
        if (node.deg > 0) {
          shouldWake = true;
        }
      } else if (node.mode === NODE_MODE_HELD) {
        // Dropped: the drop saved the dragged spot; the hold offset rides on top.
        node.x = baseX + node.holdX;
        node.y = baseY + node.holdY;
        // Only an untethered tile is flicked. A tethered one is let go in
        // place and its group floats and settles around it: a throw would
        // carry the whole group across the canvas (there are no walls).
        const throwVelocity = flickEnabled && node.deg === 0
          ? getThrowVelocity(node.samples, now)
          : { vx: 0, vy: 0 };
        node.vx = throwVelocity.vx;
        node.vy = throwVelocity.vy;
        node.mode = node.deg > 0 ? NODE_MODE_FLOAT : NODE_MODE_REST;
        node.samples = [];
        disturb(world, node);
        shouldWake = true;
      } else if (!node.dirty && !isNodeMoving(node)) {
        // At rest and nothing pending: follow the saved spot (undo, nudges,
        // other edits).
        node.x = baseX;
        node.y = baseY;
      }

      node.baseX = baseX;
      node.baseY = baseY;
    });

    if (seenIds.size !== world.nodes.length) {
      world.nodes = world.nodes.filter((node) => seenIds.has(node.id));
      world.nodeById = new Map(world.nodes.map((node) => [node.id, node]));
    }

    // Links: keep the ones still saved, add new ones, drop the rest.
    const currentLinkById = new Map(world.links.map((link) => [link.id, link]));
    const keptLinks = [];
    const newLinks = [];

    (Array.isArray(tethers) ? tethers : []).forEach((tether) => {
      const a = world.nodeById.get(tether.a);
      const b = world.nodeById.get(tether.b);

      if (!a || !b) {
        return;
      }

      const existing = currentLinkById.get(tether.id);

      if (existing && existing.a === a && existing.b === b) {
        keptLinks.push(existing);
      } else {
        newLinks.push({ id: tether.id, a, b, stretch: 0 });
      }
    });

    const droppedLinks = world.links.filter((link) => !keptLinks.includes(link));
    world.links = keptLinks;
    recountDegrees(world);

    newLinks.forEach((link) => {
      if (isInitialized) {
        attachLink(world, link);
        bornLinkIdsRef.current.add(link.id);
        shouldWake = true;
      } else {
        world.links.push(link);
        link.a.deg += 1;
        link.b.deg += 1;
      }
    });

    world.nodes.forEach((node) => {
      if (node.deg > 0 && node.mode === NODE_MODE_REST) {
        // Tethered on load: already settled.
        node.mode = NODE_MODE_FLOAT;
        node.asleep = true;
        node.calm = 1;
      } else if (node.deg === 0 && node.mode === NODE_MODE_FLOAT) {
        node.mode = NODE_MODE_REST;
        node.asleep = false;
      }
    });

    droppedLinks.forEach((link) => {
      // Removed from outside the canvas gesture (radial menu, undo).
      [link.a, link.b].forEach((node) => {
        if (world.nodeById.get(node.id) === node) {
          disturb(world, node);
          shouldWake = true;
        }
      });
    });

    world.links.forEach((link) => {
      if (link.stretch === 0) {
        const { distance, rest } = getLinkRestLength(link);
        link.stretch = (distance - rest) / rest;
      }
    });

    initializedRef.current = true;

    // Line elements (the layer renders one <g> per saved tether): only
    // re-read when the tethers change, not on every drag frame.
    const linkSource = linkElementsSourceRef.current;

    if (linkSource.tethers !== tethers || linkSource.svg !== svgRef.current) {
      linkElementsSourceRef.current = { tethers, svg: svgRef.current };
      const nextLinkElements = new Map();
      svgRef.current?.querySelectorAll("[data-tether-link]").forEach((group) => {
        const line = group.querySelector("[data-role=\"line\"]");
        const hit = group.querySelector("[data-role=\"hit\"]");

        if (line && hit) {
          nextLinkElements.set(group.getAttribute("data-tether-link"), { line, hit });
        }
      });
      linkElementsRef.current = nextLinkElements;
    }

    const nextLinkElements = linkElementsRef.current;

    if (bornLinkIdsRef.current.size > 0 && !reduceMotionRef.current) {
      const zoom = getZoom() || 1;
      bornLinkIdsRef.current.forEach((linkId) => {
        nextLinkElements.get(linkId)?.line.animate?.(
          [
            { strokeWidth: `${4 / zoom}px`, opacity: 0 },
            { strokeWidth: `${1.4 / zoom}px`, opacity: 1 },
          ],
          { duration: 300, easing: "ease-out" },
        );
      });
    }
    bornLinkIdsRef.current.clear();

    writeAll(0);

    if (shouldWake || (isRunning && isActive())) {
      wake();
    }
  }, [entries, tethers, heldKey, dragDelta, flickEnabled, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Hover slow-mo
  const setHotLinkId = useCallback((linkId) => {
    hotLinkIdRef.current = linkId;
    setHotLinkIdState(linkId);

    if (linkId) {
      wake();
    }
  }, [wake]);

  // ---- Making a tether: drag from a tile to another tile.
  const hitTestTile = useCallback((clientX, clientY, excludeId = null) => {
    const world = worldRef.current;
    const stack = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(clientX, clientY)
      : [];

    for (const element of stack) {
      const tileId = element.closest?.("[data-tether-tile]")?.getAttribute("data-tether-tile");

      if (tileId && tileId !== excludeId && world.nodeById.has(tileId)) {
        return tileId;
      }
    }

    // Tiles drawn by the zoomed-out scene surface have no DOM: use boxes.
    const point = clientToWorldPoint(clientX, clientY);
    const list = entriesRef.current;

    for (let index = list.length - 1; index >= 0; index -= 1) {
      const entry = list[index];

      if (
        entry.tile.id !== excludeId
        && Math.abs(point.x - (entry.x + entry.width / 2)) <= entry.width / 2 + 4
        && Math.abs(point.y - (entry.y + entry.height / 2)) <= entry.height / 2 + 4
      ) {
        return entry.tile.id;
      }
    }

    return null;
  }, [clientToWorldPoint]);

  const pulseLink = useCallback((linkId) => {
    const line = linkElementsRef.current.get(linkId)?.line;

    if (!line?.animate) {
      return;
    }

    const zoom = getZoom() || 1;
    line.animate(
      [
        { strokeWidth: `${1.4 / zoom}px` },
        { strokeWidth: `${4 / zoom}px`, stroke: "#7C5CFF", offset: 0.4 },
        { strokeWidth: `${1.4 / zoom}px` },
      ],
      { duration: 500, easing: "ease" },
    );
  }, [getZoom]);

  const cancelGesture = useCallback(() => {
    const currentGesture = gestureRef.current;

    if (!currentGesture) {
      return false;
    }

    currentGesture.detach();
    gestureRef.current = null;
    setGesture(null);
    return true;
  }, []);

  const beginGesture = useStableCallback((tileId, event) => {
    if (!worldRef.current.nodeById.has(tileId)) {
      return false;
    }

    cancelGesture();
    const pointerId = event.pointerId;
    const point = clientToWorldPoint(event.clientX, event.clientY);

    const handleMove = (moveEvent) => {
      const currentGesture = gestureRef.current;

      if (!currentGesture || moveEvent.pointerId !== pointerId) {
        return;
      }

      const movePoint = clientToWorldPoint(moveEvent.clientX, moveEvent.clientY);
      currentGesture.x = movePoint.x;
      currentGesture.y = movePoint.y;
      const targetId = hitTestTile(moveEvent.clientX, moveEvent.clientY, currentGesture.fromId);

      if (targetId !== currentGesture.targetId) {
        currentGesture.targetId = targetId;
        setGesture({ fromId: currentGesture.fromId, targetId });
      }

      writeGesture();
    };
    const handleUp = (upEvent) => {
      const currentGesture = gestureRef.current;

      if (!currentGesture || upEvent.pointerId !== pointerId) {
        return;
      }

      const { fromId, targetId } = currentGesture;
      cancelGesture();

      // Release on a tile = tether; anywhere else = cancel. A pair that is
      // already linked just pulses its line.
      if (targetId) {
        const world = worldRef.current;
        const existing = findLink(world, world.nodeById.get(fromId), world.nodeById.get(targetId));

        if (existing) {
          pulseLink(existing.id);
        } else {
          onCreateTether(fromId, targetId);
        }
      }
    };
    const handleCancel = (cancelEvent) => {
      if (cancelEvent.pointerId === pointerId) {
        cancelGesture();
      }
    };

    gestureRef.current = {
      fromId: tileId,
      targetId: null,
      x: point.x,
      y: point.y,
      detach: () => {
        window.removeEventListener("pointermove", handleMove, true);
        window.removeEventListener("pointerup", handleUp, true);
        window.removeEventListener("pointercancel", handleCancel, true);
      },
    };
    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleCancel, true);
    setGesture({ fromId: tileId, targetId: null });
    wake();
    return true;
  });

  useLayoutEffect(() => {
    writeGesture();
  }, [gesture, writeGesture]);

  useEffect(() => () => {
    gestureRef.current?.detach();
  }, []);

  // ---- Cutting: click a line.
  const cutLink = useStableCallback((linkId, event) => {
    const world = worldRef.current;
    const link = world.links.find((candidate) => candidate.id === linkId);
    const svg = svgRef.current;

    hotLinkIdRef.current = null;
    setHotLinkIdState(null);

    if (!link) {
      onCutTether(linkId);
      return;
    }

    detachLink(world, link);

    if (svg) {
      const snapsGroup = svg.querySelector("[data-tether-snaps]") ?? svg;
      const point = clientToWorldPoint(event.clientX, event.clientY);
      const namespace = "http://www.w3.org/2000/svg";
      const group = document.createElementNS(namespace, "g");
      const makeHalf = () => {
        const line = document.createElementNS(namespace, "line");
        line.setAttribute("class", "tether-layer__snap");
        group.appendChild(line);
        return line;
      };
      const zoom = getZoom() || 1;
      const halfA = makeHalf();
      const halfB = makeHalf();
      const particles = [[-55, -70], [55, -50]].map(([vx, vy]) => {
        const jitter = 0.85 + Math.random() * 0.3;
        const circle = document.createElementNS(namespace, "circle");
        circle.setAttribute("class", "tether-layer__spark");
        circle.setAttribute("r", (2 / zoom).toFixed(2));
        group.appendChild(circle);
        return { element: circle, vx: vx * jitter, vy: vy * jitter };
      });

      snapsGroup.appendChild(group);
      snapsRef.current.push({
        group,
        halfA,
        halfB,
        particles,
        a: link.a,
        b: link.b,
        x: point.x,
        y: point.y,
        zoom,
        startedAt: null,
      });
    }

    const cutElements = linkElementsRef.current.get(linkId);

    if (cutElements) {
      cutElements.line.parentNode.style.display = "none";
      linkElementsRef.current.delete(linkId);
    }

    onCutTether(linkId);
    wake();
  });

  return {
    gesture,
    hotLinkId,
    setHotLinkId,
    beginGesture,
    cancelGesture,
    cutLink,
    hitTestTile,
    isGestureActive: () => Boolean(gestureRef.current),
  };
}
