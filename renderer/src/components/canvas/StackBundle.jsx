import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { STACK_RELEASE_STAGGER_MS } from "../../systems/stack/tileStack";
import "./StackBundle.css";

// A stack (systems/stack/tileStack.js) drawn as a real 3D pile: each tile is
// a layer 12px above the one below, scaled to fit one footprint, a touch
// askew, with thin edge slices in the tile's own colour underneath so the
// pile reads as a physical block. No shadows.
//
// The pile is one object: click selects it, drag moves it, double-click
// unstacks. New piles fly in (each tile from where it sat, staggered) and
// squash on landing; unstacking plays that in reverse before the tiles come
// back as normal tiles.
const LAYER_GAP = 12;
const SLICES = 4;
const FIT = Object.freeze({ w: 250, h: 220 });
const MAX_LAYERS = 14;
const FLY_STAGGER_MS = 40;
const RELEASE_STAGGER_MS = STACK_RELEASE_STAGGER_MS;
const PERSPECTIVE_PX = 650;
const DRAG_SLOP_PX = 3;
const FALLBACK_EDGE = "#D9D5CE";

function layerGeometry(cards) {
  const n = cards.length;
  const top = cards[n - 1];
  const cx = top.x + top.width / 2;
  const cy = top.y + top.height / 2;
  const layersN = Math.min(n, MAX_LAYERS);

  return {
    cx,
    cy,
    layers: cards.map((card, index) => {
      const w = Math.max(1, card.width);
      const h = Math.max(1, card.height);
      const level = Math.max(0, index - (n - layersN));
      const homeX = Number.isFinite(card.stack?.homeX) ? card.stack.homeX : card.x;
      const homeY = Number.isFinite(card.stack?.homeY) ? card.stack.homeY : card.y;
      return {
        card,
        w,
        h,
        s: Math.min(FIT.w / w, FIT.h / h, 1.1),
        jx: card.x + w / 2 - cx,
        jy: card.y + h / 2 - cy,
        rot: card.stack?.tilt ?? 0,
        z: level * LAYER_GAP,
        shade: Math.max(0, (layersN - 1 - level) * 0.025),
        flatX: homeX + w / 2 - cx,
        flatY: homeY + h / 2 - cy,
        top: index === n - 1,
      };
    }),
  };
}

const stackedTransform = (L) => `translate3d(${L.jx}px, ${L.jy}px, ${L.z}px) rotate(${L.rot}deg) scale(${L.s}) translate(-50%, -50%)`;
const flatTransform = (L) => `translate3d(${L.flatX}px, ${L.flatY}px, 0px) rotate(0deg) scale(1) translate(-50%, -50%)`;

// The tile's own colour, darkened a little, for the pile's edge slices.
// Read once per pile from the rendered tile, never per frame.
function readEdgeColor(face) {
  let node = face?.querySelector(".card");
  for (let depth = 0; node && depth < 5; depth += 1) {
    const color = getComputedStyle(node).backgroundColor;
    const parts = color.match(/[\d.]+/g)?.map(Number);
    if (parts && (parts.length < 4 || parts[3] > 0.5)) {
      const [r, g, b] = parts;
      return `rgb(${Math.round(r * 0.86)}, ${Math.round(g * 0.86)}, ${Math.round(b * 0.86)})`;
    }
    node = node.firstElementChild;
  }
  return FALLBACK_EDGE;
}

function StackBundle({
  stackId,
  cards,
  zIndex,
  fresh = false,
  releasing = false,
  selected = false,
  renderCard,
  getZoom,
  subscribeViewportTransform,
  getBoardSize,
  onSelect,
  onMove,
  onUnstack,
  onContextMenu,
  onFlyInDone,
}) {
  const rootRef = useRef(null);
  const anchorRef = useRef(null);
  const pileRef = useRef(null);
  const layerRefs = useRef([]);
  const dragRef = useRef(null);
  const geometry = useMemo(() => layerGeometry(cards), [cards]);
  const { cx, cy, layers } = geometry;
  const count = cards.length;
  const topCard = cards[count - 1];

  // Camera: the perspective origin follows the middle of the view, so piles
  // off to one side show that side, as if seen from where you're looking.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof subscribeViewportTransform !== "function") return undefined;
    return subscribeViewportTransform((viewport) => {
      const zoom = viewport?.zoom || 1;
      const size = getBoardSize?.() ?? { width: 0, height: 0 };
      const centreX = (size.width / 2 - viewport.x) / zoom;
      const centreY = (size.height / 2 - viewport.y) / zoom;
      root.style.perspective = `${PERSPECTIVE_PX / zoom}px`;
      root.style.perspectiveOrigin = `${centreX - cx}px ${centreY - cy}px`;
    });
  }, [cx, cy, getBoardSize, subscribeViewportTransform]);

  // Edge colour per layer, from each tile's own background.
  useLayoutEffect(() => {
    layerRefs.current.forEach((layer) => {
      if (layer) layer.style.setProperty("--stack-edge", readEdgeColor(layer.querySelector(".canvas-stack__face")));
    });
  }, [cards]);

  // Fly in: every layer starts where its tile sat, then lands on the pile.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const elements = layerRefs.current;
    if (!root) return undefined;

    if (!fresh) {
      root.classList.add("is-landed");
      return undefined;
    }

    elements.forEach((el, index) => {
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = flatTransform(layers[index]);
    });
    void root.offsetWidth;
    elements.forEach((el, index) => {
      if (!el) return;
      el.style.transition = "";
      el.style.transitionDelay = `${index * FLY_STAGGER_MS}ms`;
      el.style.transform = stackedTransform(layers[index]);
    });
    const land = elements.length * FLY_STAGGER_MS + 430;
    const timers = [
      window.setTimeout(() => root.classList.add("is-landed"), land - 260),
      window.setTimeout(() => {
        root.classList.add("is-squash");
        elements.forEach((el) => { if (el) el.style.transitionDelay = "0ms"; });
        onFlyInDone?.(stackId);
      }, land - 60),
      window.setTimeout(() => root.classList.remove("is-squash"), land + 400),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // Only on mount: a pile flies in once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unstack: the layers fly back to where each tile goes, top first.
  useLayoutEffect(() => {
    if (!releasing) return;
    const root = rootRef.current;
    root?.classList.remove("is-landed");
    const n = layerRefs.current.length;
    layerRefs.current.forEach((el, index) => {
      if (!el) return;
      el.style.transitionDelay = `${(n - 1 - index) * RELEASE_STAGGER_MS}ms`;
      el.style.transform = flatTransform(layers[index]);
    });
  }, [layers, releasing]);

  // A committed move lands the pile where the drag left it: drop the offset.
  useLayoutEffect(() => {
    if (rootRef.current) rootRef.current.style.translate = "";
  }, [cx, cy]);

  const moveWarpBox = (dx, dy) => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchor.dataset.warpX = String(cx - FIT.w / 2 + dx);
    anchor.dataset.warpY = String(cy - FIT.h / 2 + dy);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 || releasing) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(stackId);
    const root = rootRef.current;
    const zoom = getZoom?.() || 1;
    const drag = { sx: event.clientX, sy: event.clientY, dx: 0, dy: 0, moved: false };
    dragRef.current = drag;

    const move = (moveEvent) => {
      const px = moveEvent.clientX - drag.sx;
      const py = moveEvent.clientY - drag.sy;
      if (!drag.moved && Math.hypot(px, py) < DRAG_SLOP_PX) return;
      drag.moved = true;
      drag.dx = px / zoom;
      drag.dy = py / zoom;
      root.classList.add("is-dragging");
      root.style.translate = `${drag.dx}px ${drag.dy}px`;
      // Curved view: the warp box travels with the pile (CurvedCanvas
      // picks up the attribute change next frame).
      moveWarpBox(drag.dx, drag.dy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      root.classList.remove("is-dragging");
      dragRef.current = null;
      const dx = Math.round(drag.dx);
      const dy = Math.round(drag.dy);
      if (!drag.moved || (!dx && !dy) || !onMove?.(stackId, dx, dy)) {
        root.style.translate = "";
        moveWarpBox(0, 0);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div
      ref={anchorRef}
      className="canvas-stack-anchor"
      data-warp-item=""
      data-warp-x={cx - FIT.w / 2}
      data-warp-y={cy - FIT.h / 2}
      data-warp-w={FIT.w}
      data-warp-h={FIT.h}
      style={{ zIndex }}
    >
      <div
        ref={rootRef}
        className={`canvas-stack${selected ? " is-selected" : ""}${releasing ? " is-releasing" : ""}`}
        style={{ left: `${cx}px`, top: `${cy}px` }}
        role="button"
        tabIndex={-1}
        aria-label={`Stack of ${count} tiles`}
        onPointerDown={handlePointerDown}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onUnstack?.(stackId);
        }}
        onContextMenu={(event) => onContextMenu?.(topCard, event)}
      >
        <div ref={pileRef} className="canvas-stack__pile">
          {layers.map((L, index) => (
            <div
              key={L.card.id}
              ref={(el) => { layerRefs.current[index] = el; }}
              className={`canvas-stack__layer${L.top ? " is-top" : ""}`}
              style={{
                width: `${L.w}px`,
                height: `${L.h}px`,
                transform: stackedTransform(L),
                "--stack-s": L.s,
                "--stack-shade": L.shade,
              }}
            >
              {Array.from({ length: SLICES }, (_, k) => (
                <div
                  key={k}
                  className="canvas-stack__slice"
                  style={{ transform: `translateZ(${-(LAYER_GAP / L.s) * (SLICES - k) / (SLICES + 1)}px)` }}
                />
              ))}
              <div className="canvas-stack__face">
                <div className="canvas-stack__host" style={{ transform: `translate(${-L.card.x}px, ${-L.card.y}px)` }}>
                  {renderCard(L.card)}
                </div>
              </div>
              {L.top ? <div className="canvas-stack__ring" /> : null}
              {L.top ? <div className="canvas-stack__count">{count}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(StackBundle);
