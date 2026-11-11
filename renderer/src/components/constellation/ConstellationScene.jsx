/* eslint-disable react/no-unknown-property -- react-three-fiber elements take three.js props */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { isLiteGraphics } from "../../lib/graphicsMode";
import {
  BLANKET_HEIGHT,
  BLANKET_WIDTH,
  getAdjacentSlot,
  getSlotCount,
  layoutBlanket,
  warpPoint,
  wrapCoordinate,
} from "../../systems/constellation/constellationLayout";
import {
  createBitmapCache,
  createLoadQueue,
  getTileCanvasSize,
  hasTileImage,
  paintTile,
} from "../../systems/constellation/constellationTextures";

// The 3D part of Constellation: a blanket of upright tiles. The grid wraps
// round on itself, so it goes on forever in every direction, and it is seen
// through a warp (see constellationLayout.js): tiles are full size in the
// middle and the cloth stretches away toward the edges, bunching up and
// shrinking. You pan it in any direction by dragging; a flick coasts. The
// night sky behind it is a separate layer (ConstellationSky) that follows the
// pan through `panRef`; this canvas is transparent.
//
// The blanket always has the same set of slots, filled from the workspace's
// tiles (repeating them when there are fewer). A slot that wraps round the far
// side is refilled with the next tile from the deck. The pictures of the tiles
// coming up are fetched AHEAD of time and each refill is uploaded to the GPU
// the moment it is painted, so a tile is ready and complete long before it
// slides into view, however fast you pan.
//
// Built for a steady 60fps with a few hundred slots:
//   - one shared plane geometry, one small canvas texture per slot;
//   - ONE frame loop for everything (no per-tile hooks); tiles off screen are
//     skipped;
//   - the pointer only raycasts when it moves, and the DOM never re-renders
//     while the blanket drifts or is dragged.

const FOV = 40;
// The camera distance at which the z = 0 plane is exactly 2 units tall: the
// blanket's units are screen heights.
const CAMERA_DISTANCE = 1 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
// An opened tile floats this far toward the camera.
const FOCUS_Z = 0.6;
const FLY_SECONDS = 0.95;
const INTRO_SECONDS = 2.8;
const REVEAL_SECONDS = 1.2;
const DRIFT_X = 0.045;
const DRIFT_Y_AMOUNT = 0.9;
const DRIFT_Y_RATE = 0.045;
const COAST_FRICTION = 2.4;
const MAX_PAN_SPEED = 8;
const CLICK_SLOP_PX = 6;
const REFRESH_PER_FRAME = 8;
// Time per frame the first fill may spend painting and uploading tiles.
const FILL_BUDGET_MS = 5;
// How many of the next tiles' pictures are kept ready.
const PREFETCH_AHEAD = 70;
// Past this (in screen heights, from the middle) a tile is out of view.
const CULL_Y = 1.35;
const SKY_INTRO_PAN = 3.5;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeOutCubic = (value) => 1 - (1 - clamp01(value)) ** 3;
const easeInOutCubic = (value) => {
  const x = clamp01(value);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
};
const noRaycast = () => {};
const defaultRaycast = THREE.Mesh.prototype.raycast;

function createSlots(items) {
  const count = getSlotCount();
  const initialItem = (index) => index % items.length;
  const layout = layoutBlanket(Array.from({ length: count }, (_, index) => items[initialItem(index)].aspect));

  return layout.map((slot) => {
    const size = getTileCanvasSize(slot.width / slot.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    // Where it starts when the blanket slides in from the left.
    const startX = wrapCoordinate(slot.x - SKY_INTRO_PAN, BLANKET_WIDTH);

    return {
      index: slot.index,
      itemIndex: initialItem(slot.index),
      aspect: slot.width / slot.height,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      canvas,
      texture,
      material: new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }),
      // The first appearance sweeps left to right; refills later are instant.
      delay: 0.4 + clamp01((startX + 2.6) / 5.2) * 1.3 + Math.random() * 0.3,
      painted: false,
      wrapX: null,
      wrapY: null,
      version: 0,
      hover: 0,
      hide: 0,
      fly: 0,
    };
  });
}

function World({ items, folderPath, focusedSlot, removedItems, onPick, onReady, apiRef, panRef, reducedMotion }) {
  const { camera, gl } = useThree();
  const slots = useMemo(() => createSlots(items), [items]);
  const planeGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const meshesRef = useRef([]);
  const loadQueue = useMemo(() => createLoadQueue(8), []);
  const prefetchQueue = useMemo(() => createLoadQueue(3), []);
  const bitmaps = useMemo(() => createBitmapCache(220), []);
  const state = useRef({
    time: 0,
    ambient: 0,
    speed: 1,
    dim: 0,
    hovered: -1,
    leanX: 0,
    leanY: 0,
    panX: 0,
    panY: 0,
    velX: 0,
    velY: 0,
    dragging: null,
    ready: false,
    cursor: 0,
    prefetchedTo: -1,
    target: null,
  });
  const props = useRef({ focusedSlot, removedItems });
  props.current = { focusedSlot, removedItems };

  // Paints a slot with an item and puts it on the GPU at once. A tile whose
  // picture is already loaded is painted complete; otherwise it is a quiet
  // placeholder first and the picture replaces it when it arrives.
  const fillSlot = useMemo(() => (slot, itemIndex, folder) => {
    const entry = items[itemIndex];
    slot.itemIndex = itemIndex;
    slot.version += 1;
    const { version } = slot;
    const hasImage = hasTileImage(entry.card);
    const cached = hasImage ? bitmaps.peek(itemIndex) : undefined;

    if (cached) {
      paintTile(slot.canvas, entry, cached.bitmap, !cached.bitmap);
    } else {
      paintTile(slot.canvas, entry);
    }

    slot.texture.needsUpdate = true;
    // Upload now rather than when it first appears on screen.
    gl.initTexture(slot.texture);
    slot.painted = true;

    if (!hasImage || cached) {
      return;
    }

    loadQueue.add(async () => {
      const { bitmap } = await bitmaps.load(itemIndex, entry, folder);

      // Refilled with something else meanwhile.
      if (slot.version !== version) {
        return;
      }

      paintTile(slot.canvas, entry, bitmap, !bitmap);
      slot.texture.needsUpdate = true;
      gl.initTexture(slot.texture);
    });
  }, [bitmaps, gl, items, loadQueue]);

  // Keeps the next PREFETCH_AHEAD tiles' pictures loaded.
  const prefetch = (folder) => {
    const s = state.current;

    if (s.cursor === s.prefetchedTo) {
      return;
    }

    s.prefetchedTo = s.cursor;

    for (let step = 0; step < Math.min(PREFETCH_AHEAD, items.length); step += 1) {
      const itemIndex = (s.cursor + step) % items.length;
      const entry = items[itemIndex];

      if (hasTileImage(entry.card) && !bitmaps.has(itemIndex)) {
        prefetchQueue.add(() => bitmaps.load(itemIndex, entry, folder));
      }
    }
  };

  // The next tile to show: the next few in the deck, whichever fits this
  // slot's shape best, skipping deleted ones.
  const pickItem = (slot) => {
    const s = state.current;
    const removed = props.current.removedItems;
    let best = -1;
    let bestScore = Infinity;

    for (let step = 0; step < Math.min(8, items.length); step += 1) {
      const candidate = (s.cursor + step) % items.length;

      if (removed.has(candidate)) {
        continue;
      }

      const score = Math.abs(Math.log(items[candidate].aspect / slot.aspect)) + step * 0.03;

      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    s.cursor = (s.cursor + 1) % items.length;
    return best;
  };

  // The first fill: in reveal order, a few per frame, so nothing blocks a
  // frame for long. The deck carries on from where the blanket left off.
  useEffect(() => {
    const order = [...slots].sort((a, b) => a.delay - b.delay);
    let cursor = 0;
    let rafId = 0;
    state.current.cursor = slots.length % items.length;
    state.current.prefetchedTo = -1;

    // Each fill paints a tile and uploads it (with mipmaps) to the GPU, so
    // the first fill runs to a time budget rather than a fixed count: a slow
    // machine spreads it over more frames instead of stuttering the intro.
    function fillBatch() {
      const startedAt = performance.now();

      while (cursor < order.length) {
        fillSlot(order[cursor], order[cursor].itemIndex, folderPath);
        cursor += 1;

        if (performance.now() - startedAt >= FILL_BUDGET_MS) {
          break;
        }
      }

      if (cursor < order.length) {
        rafId = requestAnimationFrame(fillBatch);
      } else {
        prefetch(folderPath);
      }
    }

    rafId = requestAnimationFrame(fillBatch);

    return () => {
      cancelAnimationFrame(rafId);
      loadQueue.clear();
      prefetchQueue.clear();
    };
    // `prefetch` only reads refs and stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, items, folderPath, fillSlot, loadQueue, prefetchQueue]);

  useEffect(() => () => {
    slots.forEach((slot) => {
      slot.version += 1;
      slot.texture.dispose();
      slot.material.dispose();
    });
    bitmaps.clear();
  }, [slots, bitmaps]);

  useEffect(() => () => {
    planeGeometry.dispose();
  }, [planeGeometry]);

  // What the view needs from the scene: which tile a slot shows, who its
  // neighbours are, and where the opened tile should land (its picture's
  // rectangle on screen, so the tile glides exactly onto it).
  useEffect(() => {
    if (!apiRef) {
      return undefined;
    }

    apiRef.current = {
      getItem: (slotIndex) => slots[slotIndex]?.itemIndex ?? -1,
      getAdjacent: (slotIndex, direction) => {
        const removed = props.current.removedItems;
        const hidden = new Set(slots.filter((slot) => removed.has(slot.itemIndex)).map((slot) => slot.index));
        const next = getAdjacentSlot(slotIndex, direction, hidden);
        return next === null ? null : { slot: next, item: slots[next].itemIndex };
      },
      setFocusTarget: (rect) => {
        state.current.target = rect;
      },
    };

    return () => {
      apiRef.current = null;
    };
  }, [apiRef, slots]);

  // Grab and pan: drag moves the blanket under the pointer, in any direction;
  // letting go while moving flicks it.
  useEffect(() => {
    const element = gl.domElement;
    const s = state.current;

    function handleDown(event) {
      if (event.button !== 0 || props.current.focusedSlot >= 0) {
        return;
      }

      s.dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), moved: 0 };
      s.velX = 0;
      s.velY = 0;
    }

    function handleMove(event) {
      const drag = s.dragging;

      if (!drag || event.pointerId !== drag.id) {
        return;
      }

      const now = performance.now();
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);

      if (drag.moved < CLICK_SLOP_PX && !drag.active) {
        return;
      }

      if (!drag.active) {
        drag.active = true;
        element.setPointerCapture?.(event.pointerId);
        element.style.cursor = "grabbing";
        s.hovered = -1;
      }

      // Units are screen heights: one screen height of drag moves the cloth
      // one unit (at the middle, where the warp is 1:1).
      const k = 2 / element.clientHeight;
      const seconds = Math.max(0.004, (now - drag.t) / 1000);
      // Dragging right moves the cloth right: the pan goes the other way.
      s.panX -= dx * k;
      s.panY += dy * k;
      s.velX += ((-dx * k) / seconds - s.velX) * 0.4;
      s.velY += ((dy * k) / seconds - s.velY) * 0.4;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.t = now;
    }

    function handleUp(event) {
      const drag = s.dragging;

      if (!drag || event.pointerId !== drag.id) {
        return;
      }

      // Stopped before letting go: no flick.
      if (performance.now() - drag.t > 90) {
        s.velX = 0;
        s.velY = 0;
      }

      if (drag.active) {
        element.releasePointerCapture?.(event.pointerId);
        element.style.cursor = "";
      }

      s.dragging = null;
    }

    element.addEventListener("pointerdown", handleDown);
    element.addEventListener("pointermove", handleMove);
    element.addEventListener("pointerup", handleUp);
    element.addEventListener("pointercancel", handleUp);

    return () => {
      element.removeEventListener("pointerdown", handleDown);
      element.removeEventListener("pointermove", handleMove);
      element.removeEventListener("pointerup", handleUp);
      element.removeEventListener("pointercancel", handleUp);
    };
  }, [gl]);

  useFrame((frameState, deltaRaw) => {
    const dt = Math.min(deltaRaw, 0.05);
    const s = state.current;
    const { focusedSlot: focused, removedItems: removed } = props.current;
    const { width: viewWidth, height: viewHeight } = frameState.size;
    const aspect = viewWidth / viewHeight;
    s.time += dt;

    if (!s.ready && s.time > 0.05) {
      s.ready = true;
      onReady?.();
    }

    const isDragging = Boolean(s.dragging?.active);
    const coasting = Math.abs(s.velX) + Math.abs(s.velY) > 0.03;

    // Coast after a flick; the ambient drift pauses while you are moving the
    // blanket or have a tile open, and slows when you hover one.
    if (!isDragging) {
      const speed = Math.hypot(s.velX, s.velY);
      const limit = speed > MAX_PAN_SPEED ? MAX_PAN_SPEED / speed : 1;
      s.panX += s.velX * limit * dt;
      s.panY += s.velY * limit * dt;
      const friction = Math.exp(-COAST_FRICTION * dt);
      s.velX *= friction;
      s.velY *= friction;
    }

    const speedTarget = focused >= 0 || isDragging || coasting ? 0 : s.hovered >= 0 ? 0.2 : 1;
    s.speed += (speedTarget - s.speed) * Math.min(1, dt * 3);
    s.ambient += reducedMotion ? 0 : dt * s.speed;
    const intro = reducedMotion ? 0 : 1 - easeOutCubic(s.time / INTRO_SECONDS);
    // Right to left, with a slow tide up and down. The intro starts the cloth
    // shifted left and slides it in, so it sweeps from left to right.
    const panX = s.panX + s.ambient * DRIFT_X + intro * SKY_INTRO_PAN;
    const panY = s.panY + Math.sin(s.ambient * DRIFT_Y_RATE) * DRIFT_Y_AMOUNT;

    // The night sky behind follows the same pan.
    if (panRef) {
      panRef.current = { x: panX, y: panY };
    }

    const fov = FOV + intro * 16;

    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // The camera leans a little toward the pointer.
    const lean = focused >= 0 ? 0.3 : 1;
    s.leanX += (frameState.pointer.x * 0.05 * lean - s.leanX) * Math.min(1, dt * 2);
    s.leanY += (frameState.pointer.y * 0.03 * lean - s.leanY) * Math.min(1, dt * 2);
    camera.position.set(s.leanX, s.leanY, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);

    s.dim += ((focused >= 0 ? 1 : 0) - s.dim) * Math.min(1, dt * 4);
    const brightness = 1 - 0.62 * s.dim;

    // Where the opened tile lands (world units on the focus plane).
    const focusScale = (CAMERA_DISTANCE - FOCUS_Z) / CAMERA_DISTANCE;
    const target = s.target && s.target.width > 20 && s.target.height > 20
      ? {
        x: ((s.target.cx - viewWidth / 2) / (viewHeight / 2)) * focusScale,
        y: (-(s.target.cy - viewHeight / 2) / (viewHeight / 2)) * focusScale,
        width: (s.target.width / (viewHeight / 2)) * focusScale,
        height: (s.target.height / (viewHeight / 2)) * focusScale,
      }
      : { x: 0, y: 0, width: 0.8 * focusScale, height: 1 * focusScale };

    let refreshBudget = focused >= 0 ? 0 : REFRESH_PER_FRAME;
    let refilled = false;
    const cullX = aspect + 0.45;

    slots.forEach((slot) => {
      const mesh = meshesRef.current[slot.index];

      if (!mesh) {
        return;
      }

      // Where this slot is on the cloth right now, and the cloth wrapping
      // round: a slot that has just wrapped is far off screen, so it is
      // refilled with another tile without anyone seeing.
      const rawX = slot.x - panX;
      const rawY = slot.y - panY;
      const wrappedX = Math.floor(rawX / BLANKET_WIDTH + 0.5);
      const wrappedY = Math.floor(rawY / BLANKET_HEIGHT + 0.5);
      const didWrap = slot.wrapX !== null && (wrappedX !== slot.wrapX || wrappedY !== slot.wrapY);
      slot.wrapX = wrappedX;
      slot.wrapY = wrappedY;

      if (didWrap && slot.painted && slot.fly < 0.01 && refreshBudget > 0 && !reducedMotion) {
        const next = pickItem(slot);

        if (next >= 0) {
          fillSlot(slot, next, folderPath);
          // Refills are complete when they arrive: no reveal.
          slot.delay = -1e9;
          slot.hide = 0;
          refreshBudget -= 1;
          refilled = true;
        }
      }

      // The opened tile glides to its place (and back), slowly and evenly.
      const flyTarget = focused === slot.index ? 1 : 0;
      const flyStep = reducedMotion ? 1 : dt / FLY_SECONDS;
      slot.fly += Math.max(-flyStep, Math.min(flyStep, flyTarget - slot.fly));
      const fly = easeInOutCubic(slot.fly);

      const blanketX = wrapCoordinate(rawX, BLANKET_WIDTH);
      const blanketY = wrapCoordinate(rawY, BLANKET_HEIGHT);
      const warped = warpPoint(blanketX, blanketY);
      const onScreen = Math.abs(warped.x) < cullX + slot.width && Math.abs(warped.y) < CULL_Y + slot.height;

      const reveal = reducedMotion ? 1 : clamp01((s.time - slot.delay) / REVEAL_SECONDS);
      const appear = reveal <= 0 ? 0 : easeOutCubic(reveal);

      slot.hover += ((s.hovered === slot.index && focused < 0 && !isDragging ? 1 : 0) - slot.hover) * Math.min(1, dt * 9);

      // Deleted tiles shrink away and are replaced.
      const deleted = removed.has(slot.itemIndex);
      slot.hide += ((deleted ? 1 : 0) - slot.hide) * Math.min(1, dt * 8);

      if (deleted && slot.hide > 0.97 && refreshBudget > 0 && slot.fly < 0.01) {
        const next = pickItem(slot);

        if (next >= 0) {
          fillSlot(slot, next, folderPath);
          slot.delay = -1e9;
          slot.hide = 0;
          refreshBudget -= 1;
          refilled = true;
        }
      }

      const opacity = fly > 0 ? 1 : appear * (1 - slot.hide);
      const visible = slot.painted && (onScreen || fly > 0) && opacity > 0.01;

      if (mesh.visible !== visible) {
        mesh.visible = visible;
        // Hidden tiles must not catch the pointer either.
        mesh.raycast = visible ? defaultRaycast : noRaycast;
      }

      if (!visible) {
        return;
      }

      const grow = (0.6 + 0.4 * appear) * (1 + 0.06 * slot.hover) * (1 - 0.25 * slot.hide);
      const baseWidth = slot.width * warped.scale * grow;
      const baseHeight = slot.height * warped.scale * grow;
      // Nearer the middle sits on top; a hovered tile lifts a touch.
      const baseZ = -Math.hypot(warped.x, warped.y) * 0.02 + 0.08 * slot.hover;

      mesh.position.set(
        THREE.MathUtils.lerp(warped.x, target.x, fly),
        THREE.MathUtils.lerp(warped.y, target.y, fly),
        THREE.MathUtils.lerp(baseZ, FOCUS_Z, fly),
      );
      mesh.scale.set(
        THREE.MathUtils.lerp(baseWidth, target.width, fly),
        THREE.MathUtils.lerp(baseHeight, target.height, fly),
        1,
      );
      mesh.renderOrder = fly > 0 ? 5 : 0;
      slot.material.opacity = opacity;
      slot.material.color.setScalar(THREE.MathUtils.lerp(brightness * (1 + 0.45 * slot.hover), 1, fly));
    });

    // Keep the pictures of the next tiles coming.
    if (refilled) {
      prefetch(folderPath);
    }
  });

  const handleClick = (event, slot) => {
    event.stopPropagation();

    // A drag that ended on a tile is not a click on it.
    if (event.delta > CLICK_SLOP_PX) {
      return;
    }

    onPick(slot.index, slot.itemIndex);
  };

  return (
    <>
      {slots.map((slot) => (
        <mesh
          key={slot.index}
          ref={(element) => {
            meshesRef.current[slot.index] = element;

            if (element && element.visible === false) {
              element.raycast = noRaycast;
            }
          }}
          geometry={planeGeometry}
          material={slot.material}
          visible={false}
          onPointerOver={(event) => {
            event.stopPropagation();

            if (state.current.dragging?.active || props.current.focusedSlot >= 0) {
              return;
            }

            state.current.hovered = slot.index;
            gl.domElement.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            if (state.current.hovered === slot.index) {
              state.current.hovered = -1;
            }

            if (!state.current.dragging?.active) {
              gl.domElement.style.cursor = "";
            }
          }}
          onClick={(event) => handleClick(event, slot)}
        />
      ))}
    </>
  );
}

export default function ConstellationScene(props) {
  const lite = useMemo(isLiteGraphics, []);

  return (
    <Canvas
      // Full screen on a HiDPI display is a lot of pixels to fill with
      // overlapping transparent tiles; 1.5x is indistinguishable here. Lite
      // graphics (software / crashed GPU) draws at 1x without antialiasing.
      dpr={lite ? 1 : [1, 1.5]}
      gl={{ antialias: !lite, powerPreference: "high-performance", alpha: true }}
      camera={{ fov: FOV + 16, near: 0.1, far: 60, position: [0, 0, CAMERA_DISTANCE] }}
      style={{ position: "absolute", inset: 0, cursor: "grab", touchAction: "none" }}
    >
      <World {...props} />
    </Canvas>
  );
}
