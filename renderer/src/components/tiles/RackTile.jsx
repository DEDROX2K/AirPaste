import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  OPEN_RACK_STYLE_EVENT,
  RACK_DEFAULT_TITLE,
  RACK_FRAME_STYLES,
  RACK_FRAME_STYLE_IDS,
  RACK_MATERIALS,
  RACK_MATERIAL_IDS,
  RACK_NAME_MAX_LENGTH,
  normalizeRackFrameStyle,
  normalizeRackMaterial,
  normalizeRackName,
} from "../../tiles/rack/model";
import {
  RACK_TEAR_DISTANCE,
  SHELF_SCALE,
  SHELF_SVG_HEIGHT,
  SLOT_FRAME_PADDING,
  getRackSlotMetrics,
  getShelfPath,
  rubberBand,
} from "../../tiles/rack/geometry";
import {
  getRackLayout,
  normalizeRackTiers,
} from "../../tiles/rack/layout";
import { Spring, isRackReducedMotion, takeRackDockHint } from "../../tiles/rack/rackMotion";
import TileShell from "./TileShell";
import "./RackTile.css";

// The rack: shelves with tiles standing on them in frames, captioned with
// their source -- up to five a shelf, more shelves below joined by posts.
// Everything that moves runs on one spring loop per rack that writes
// straight to the DOM, and only while something is moving. React only
// renders when membership, style or the drop preview change.
// Rules: docs/rules/rack-rules.md.

const EMPTY_CHILD_TILES = [];
const SUBSTEP_S = 1 / 480;
const MAX_FRAME_S = 0.05;
const LANDING_TIMEOUT_MS = 650;
const MOVE_SLOP = 4;
const RIPPLE_DELAY_MS = 46;

// Racks whose full shelf has already shaken this session. The refusal
// shake is a one-time hint: after that a full shelf just passes the tile
// down quietly.
const shakenRackIds = new Set();

function stopPointer(event) {
  event.stopPropagation();
}

// Not read from tileRegistry: it imports this file, so that would be a cycle.
const TILE_TYPE_LABELS = Object.freeze({
  "amazon-product": "Product",
  calendar: "Calendar",
  "canvas-text": "Text",
  checklist: "Checklist",
  code: "Code",
  counter: "Counter",
  deadline: "Deadline",
  file: "File",
  "github-repo": "GitHub",
  "x-post": "X post",
  "x-profile": "X profile",
  link: "Link",
  note: "Note",
  "paper-note": "Paper note",
  progress: "Progress",
  table: "Table",
  "text-box": "Text",
  weather: "Weather",
});

// The caption: where the tile came from (its URL without the protocol),
// else its name, else its kind.
function getSlotCaption(tile) {
  const url = typeof tile?.url === "string" ? tile.url.trim() : "";

  if (url) {
    return url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  }

  const candidates = [tile?.title, tile?.repo?.name, tile?.city, tile?.file?.fileName];
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim()
    ?? TILE_TYPE_LABELS[tile?.type]
    ?? "Tile";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* ---------- motion engine ---------- */

function createSlotMotion(x, y, tier) {
  return {
    x: new Spring(x, 0.38, 0.8),
    y: new Spring(y, 0.38, 0.8),
    s: new Spring(1, 0.4, 0.78),
    r: new Spring(0, 0.4, 0.6),
    p: new Spring(1, 0.36, 0.9),
    op: new Spring(1, 0.3, 1),
    lift: new Spring(0, 0.3, 1),
    hov: new Spring(0, 0.22, 0.9),
    sq: new Spring(0, 0.26, 0.42),
    tier,
    landing: false,
    landT: 0,
    dockT: 0,
    held: null,
    gone: false,
    el: null,
    bodyEl: null,
  };
}

function createSupportMotion(support) {
  return {
    kind: support.kind,
    tier: support.tier,
    x: new Spring(support.x, 0.42, 0.82),
    y: new Spring(support.y, 0.4, 0.8),
    w: new Spring(support.w, 0.42, 0.82),
    h: new Spring(support.h, 0.42, 0.82),
    op: new Spring(1, 0.3, 1),
    el: null,
  };
}

function createTierMotion() {
  return {
    dip: new Spring(0, 0.32, 0.32),
    shake: new Spring(0, 0.18, 0.22),
  };
}

function createEngine() {
  return {
    slots: new Map(),
    supports: new Map(),
    tiers: new Map(),
    ghostX: new Spring(0, 0.3, 0.9),
    ghostY: new Spring(0, 0.3, 0.9),
    ghostOp: new Spring(0, 0.22, 1),
    ghostW: 0,
    ghostH: 0,
    ghostTier: 0,
    ghostShown: false,
    emptyOp: new Spring(1, 0.3, 1),
    nameX: new Spring(0, 0.42, 0.82),
    nameY: new Spring(0, 0.42, 0.82),
    nameTier: 0,
    empty: { x: 0, y: 0 },
    booted: false,
    raf: 0,
    last: 0,
    centerX: 0,
    order: [],
    nodes: {},
    supportNodes: {},
    refusedTier: null,
  };
}

function slotSprings(motion) {
  return [motion.x, motion.y, motion.s, motion.r, motion.p, motion.op, motion.lift, motion.hov, motion.sq];
}

function supportSprings(motion) {
  return [motion.x, motion.y, motion.w, motion.h, motion.op];
}

function getTier(engine, tier) {
  if (!Number.isFinite(tier)) {
    return null;
  }

  let motion = engine.tiers.get(tier);

  if (!motion) {
    motion = createTierMotion();
    engine.tiers.set(tier, motion);
  }

  return motion;
}

/* ---------- a racked tile ---------- */

const RackSlot = memo(function RackSlot({
  tile,
  metrics,
  rect,
  renderTilePreview,
  registerSlot,
  onSlotPointerDown,
  onSlotHover,
  onPullFromRack,
}) {
  const caption = getSlotCaption(tile);
  const contentWidth = tile.width * metrics.scale;
  const contentOffsetX = (metrics.imageWidth - contentWidth) / 2;

  return (
    <div
      ref={(node) => registerSlot(tile.id, node)}
      className="rack-slot"
      role="button"
      tabIndex={0}
      aria-label={`${caption}. Drag to take it off the rack.`}
      style={{ width: `${rect.w}px`, height: `${rect.h}px` }}
      onPointerDown={(event) => onSlotPointerDown(tile, event)}
      onPointerEnter={() => onSlotHover(tile.id, true)}
      onPointerLeave={() => onSlotHover(tile.id, false)}
      onDoubleClick={stopPointer}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " " || event.key === "r" || event.key === "R") {
          event.preventDefault();
          event.stopPropagation();
          onPullFromRack?.(tile);
        }
      }}
    >
      <div className="rack-slot__body">
        <div className="rack-slot__frame">
            <div
              className="rack-slot__media"
              style={{ width: `${metrics.imageWidth}px`, height: `${metrics.imageHeight}px` }}
            >
              {/* Look, never touch: the slot is the handle, the tile is inert. */}
              <div
                className="rack-slot__tile"
                inert
                aria-hidden="true"
                style={{
                  width: `${tile.width}px`,
                  height: `${tile.height}px`,
                  transform: `translateX(${contentOffsetX.toFixed(2)}px) scale(${metrics.scale.toFixed(4)})`,
                }}
              >
                {renderTilePreview?.(tile)}
              </div>
            </div>
            <div className="rack-slot__cap">{caption}</div>
        </div>
      </div>
    </div>
  );
});

/* ---------- shelves and posts ---------- */

function RackSupport({ support, gradientId, material, registerSupport }) {
  if (support.kind === "shelf") {
    const svgWidth = support.w / SHELF_SCALE;
    return (
      <div ref={(node) => registerSupport(support.key, node)} className="rack__shelf" style={{ height: `${support.h}px` }}>
        <svg
          className="rack__shelf-svg"
          xmlns="http://www.w3.org/2000/svg"
          width={support.w}
          height={support.h}
          viewBox={`0 0 ${svgWidth} ${SHELF_SVG_HEIGHT}`}
          aria-hidden="true"
        >
          <path
            className="rack__shelf-path"
            d={getShelfPath(svgWidth)}
            fill={`url(#${gradientId})`}
            stroke={material.edge ?? undefined}
            strokeWidth={material.edge ? 0.5 : undefined}
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={(node) => registerSupport(support.key, node)}
      className="rack__post"
      style={{ width: `${support.w}px`, height: `${support.h}px` }}
      aria-hidden="true"
    />
  );
}

/* ---------- the editable name, pressed into the shelf's lip ---------- */

function RackName({ title, onCommit, nameRef: outerRef }) {
  const nameRef = useRef(null);
  const committedRef = useRef(title);

  useLayoutEffect(() => {
    committedRef.current = title;

    if (nameRef.current && document.activeElement !== nameRef.current) {
      nameRef.current.textContent = title;
    }
  }, [title]);

  const placeCaretAtEnd = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  return (
    <div ref={outerRef} className="rack__label" onPointerDown={stopPointer} onDoubleClick={stopPointer}>
      <h2>
        <span
          ref={nameRef}
          className="rack__name"
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          role="textbox"
          aria-label="Rack name"
          data-placeholder="Name"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.currentTarget.textContent = committedRef.current;
              event.currentTarget.blur();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = event.clipboardData?.getData("text") ?? "";
            document.execCommand("insertText", false, pasted.replace(/\s*\n+\s*/g, " "));
          }}
          onInput={(event) => {
            const element = event.currentTarget;

            if (!element.textContent) {
              element.innerHTML = "";
            } else if (element.textContent.length > RACK_NAME_MAX_LENGTH) {
              element.textContent = element.textContent.slice(0, RACK_NAME_MAX_LENGTH);
              placeCaretAtEnd(element);
            }
          }}
          onBlur={(event) => {
            const nextName = normalizeRackName(event.currentTarget.textContent) || committedRef.current;
            event.currentTarget.textContent = nextName;

            if (nextName !== committedRef.current) {
              committedRef.current = nextName;
              onCommit(nextName);
            }
          }}
        />
      </h2>
    </div>
  );
}

/* ---------- style panel (right-click > Rack style) ---------- */

// Lives in canvas space, so it is counter-scaled to stay a readable size
// at any zoom.
function RackStylePanel({ material, frameStyle, zoom = 1, onPick, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const handlePointer = (event) => {
      if (!panelRef.current?.contains(event.target)) {
        onClose();
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointer, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointer, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="rack-style"
      style={{ "--rack-style-scale": clamp(1 / Math.max(0.05, zoom), 1, 5) }}
      role="dialog"
      aria-label="Rack style"
      onPointerDown={stopPointer}
      onDoubleClick={stopPointer}
    >
      <div className="rack-style__row" role="radiogroup" aria-label="Shelf material">
        {RACK_MATERIAL_IDS.map((id) => {
          const stops = RACK_MATERIALS[id].stops;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={material === id}
              title={RACK_MATERIALS[id].label}
              className={material === id ? "rack-style__chip rack-style__chip--on" : "rack-style__chip"}
              style={{ "--chip": `linear-gradient(180deg, ${stops[0]}, ${stops[2]} 60%, ${stops[3]} 80%, ${stops[4]})` }}
              onClick={() => onPick({ material: id })}
            />
          );
        })}
      </div>
      <div className="rack-style__row" role="radiogroup" aria-label="Frame">
        {RACK_FRAME_STYLE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={frameStyle === id}
            title={RACK_FRAME_STYLES[id].label}
            className={frameStyle === id ? `rack-style__frame rack-style__frame--${id} rack-style__frame--on` : `rack-style__frame rack-style__frame--${id}`}
            onClick={() => onPick({ frameStyle: id })}
          >
            <span />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- the rack ---------- */

function RackTile({
  card,
  tileMeta,
  childTiles = EMPTY_CHILD_TILES,
  rackState = null,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  onPullFromRack,
  renderHint,
  renderTilePreview,
}) {
  const { updateExistingCard } = useTileAppContext();
  const title = card.title || RACK_DEFAULT_TITLE;
  const isStaticPreview = Boolean(renderHint?.isStaticPreview);
  const materialId = normalizeRackMaterial(card.material);
  const material = RACK_MATERIALS[materialId];
  const frameStyle = normalizeRackFrameStyle(card.frameStyle);
  const gapIndex = Number.isFinite(rackState?.slotPreviewIndex) ? rackState.slotPreviewIndex : null;
  const gapWidth = gapIndex === null ? 0 : (rackState?.gapWidth ?? 0);
  const gapTier = gapIndex === null ? null : (Number.isFinite(rackState?.gapTier) ? rackState.gapTier : null);
  const refusedTier = gapIndex === null ? null : (Number.isFinite(rackState?.refusedTier) ? rackState.refusedTier : null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleZoom, setStyleZoom] = useState(1);
  const engineRef = useRef(null);
  const articleRef = useRef(null);
  const ghostRef = useRef(null);
  const emptyRef = useRef(null);
  const nameRef = useRef(null);
  const propsRef = useRef(null);
  const gradientId = `rack-grad-${card.id}`;

  if (!engineRef.current) {
    engineRef.current = createEngine();
  }

  const metricsById = useMemo(() => new Map(
    childTiles.map((tile) => [tile.id, getRackSlotMetrics(tile)]),
  ), [childTiles]);

  const spec = useMemo(() => ({
    slotWidths: childTiles.map((tile) => metricsById.get(tile.id).frameWidth),
    tiers: normalizeRackTiers(card.tiers, childTiles.length),
  }), [card.tiers, childTiles, metricsById]);

  const layout = useMemo(() => getRackLayout(
    spec,
    gapIndex === null
      ? null
      : {
        tier: gapTier ?? Math.max(0, spec.tiers.length - 1),
        index: gapIndex,
        width: gapWidth,
      },
  ), [gapIndex, gapTier, gapWidth, spec]);

  const restLayout = useMemo(() => getRackLayout(spec), [spec]);

  propsRef.current = { card, childTiles, metricsById, onBeginDrag, layout };

  const rackGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });

  /* ----- drawing ----- */

  const render = useCallback(() => {
    const engine = engineRef.current;
    const centerX = engine.centerX;
    const tierOffset = (tier) => {
      const motion = Number.isFinite(tier) ? engine.tiers.get(tier) : null;
      return { x: motion?.shake.v ?? 0, y: motion?.dip.v ?? 0 };
    };

    engine.supports.forEach((motion) => {
      const el = motion.el;

      if (!el) {
        return;
      }

      const offset = motion.kind === "shelf" ? tierOffset(motion.tier) : { x: 0, y: 0 };
      const width = Math.max(0, motion.w.v);
      el.style.transform = `translate3d(${(centerX + motion.x.v + offset.x).toFixed(2)}px, ${(motion.y.v + offset.y).toFixed(2)}px, 0)`;
      el.style.opacity = clamp(motion.op.v, 0, 1).toFixed(3);

      if (motion.kind === "shelf") {
        const svg = el.firstElementChild;
        const path = svg?.firstElementChild;
        const svgWidth = width / SHELF_SCALE;
        el.style.width = `${width.toFixed(2)}px`;
        svg?.setAttribute("viewBox", `0 0 ${svgWidth.toFixed(3)} ${SHELF_SVG_HEIGHT}`);
        svg?.setAttribute("width", width.toFixed(2));
        path?.setAttribute("d", getShelfPath(svgWidth));
      } else {
        el.style.height = `${Math.max(0, motion.h.v).toFixed(2)}px`;
      }
    });

    if (emptyRef.current) {
      const offset = tierOffset(0);
      emptyRef.current.style.opacity = clamp(engine.emptyOp.v, 0, 1).toFixed(3);
      emptyRef.current.style.transform = `translate3d(${(centerX + engine.empty.x).toFixed(2)}px, ${(engine.empty.y + offset.y).toFixed(2)}px, 0) translateX(-50%)`;
    }

    if (ghostRef.current) {
      const ghostOpacity = clamp(engine.ghostOp.v, 0, 1);
      ghostRef.current.style.opacity = ghostOpacity.toFixed(3);

      if (engine.ghostShown) {
        const offset = tierOffset(engine.ghostTier);
        ghostRef.current.style.width = `${engine.ghostW}px`;
        ghostRef.current.style.height = `${engine.ghostH}px`;
        ghostRef.current.style.transform = `translate3d(${(centerX + engine.ghostX.v + offset.x).toFixed(2)}px, ${(engine.ghostY.v + offset.y).toFixed(2)}px, 0) scale(${(0.96 + 0.04 * ghostOpacity).toFixed(4)})`;
      }
    }

    if (nameRef.current) {
      const offset = tierOffset(engine.nameTier);
      nameRef.current.style.transform = `translate3d(${(centerX + engine.nameX.v + offset.x).toFixed(2)}px, ${(engine.nameY.v + offset.y).toFixed(2)}px, 0) translate(-50%, -50%)`;
    }

    const order = engine.order;
    engine.slots.forEach((motion, tileId) => {
      const el = motion.el;

      if (!el) {
        return;
      }

      const offset = motion.held ? { x: 0, y: 0 } : tierOffset(motion.tier);
      const hoverY = (-4 * motion.hov.v) - (6 * clamp(motion.lift.v, 0, 1.2));
      const grabX = motion.held?.originX ?? 0;
      const grabY = motion.held?.originY ?? 0;
      el.style.transform = `translate3d(${(centerX + motion.x.v + offset.x).toFixed(2)}px, ${(motion.y.v + offset.y + hoverY).toFixed(2)}px, 0) translate(${grabX}px, ${grabY}px) rotate(${motion.r.v.toFixed(3)}deg) translate(${-grabX}px, ${-grabY}px) scale(${motion.s.v.toFixed(4)})`;
      el.style.opacity = motion.gone ? "0" : clamp(motion.op.v, 0, 1).toFixed(3);
      el.style.setProperty("--p", clamp(motion.p.v, 0, 1).toFixed(3));
      el.style.setProperty("--lift", clamp(motion.lift.v, 0, 1).toFixed(3));
      el.style.zIndex = motion.held ? "30" : motion.landing ? "20" : String(10 + Math.max(0, order.indexOf(tileId)));

      if (motion.bodyEl) {
        const q = motion.sq.v;
        motion.bodyEl.style.transform = Math.abs(q) < 0.0005 ? "" : `scale(${(1 - q * 0.6).toFixed(4)}, ${(1 + q).toFixed(4)})`;
      }
    });
  }, []);

  /* ----- the loop ----- */

  const landRef = useRef(null);

  const frame = useCallback((timestamp) => {
    const engine = engineRef.current;
    const dt = Math.min(MAX_FRAME_S, Math.max(0.001, (timestamp - engine.last) / 1000) || 0.016);
    engine.last = timestamp;
    const reduced = isRackReducedMotion();
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP_S));
    const h = dt / steps;
    const rackSprings = [
      engine.ghostX, engine.ghostY, engine.ghostOp, engine.emptyOp,
      engine.nameX, engine.nameY,
    ];
    const tierSprings = [...engine.tiers.values()].flatMap((motion) => [motion.dip, motion.shake]);
    const supportList = [...engine.supports.values()];

    for (let index = 0; index < steps; index += 1) {
      rackSprings.forEach((spring) => spring.step(h, reduced));
      tierSprings.forEach((spring) => spring.step(h, reduced));
      supportList.forEach((motion) => supportSprings(motion).forEach((spring) => spring.step(h, reduced)));
      engine.slots.forEach((motion) => slotSprings(motion).forEach((spring) => spring.step(h, reduced)));
    }

    const now = performance.now();
    engine.slots.forEach((motion) => {
      if (motion.landing && !motion.held) {
        if ((motion.y.v >= motion.y.t - 0.6 && motion.y.vel > 0) || now - motion.landT > LANDING_TIMEOUT_MS) {
          landRef.current?.(motion, clamp(motion.y.vel, 0, 2400));
        }
      }
    });

    if (engine.ghostOp.v < 0.02 && engine.ghostOp.t === 0) {
      engine.ghostShown = false;
    }

    render();

    const busy = rackSprings.some((spring) => !spring.isAtRest(0.05))
      || tierSprings.some((spring) => !spring.isAtRest(0.05))
      || supportList.some((motion) => supportSprings(motion).some((spring) => !spring.isAtRest(0.01)))
      || [...engine.slots.values()].some((motion) => (
        motion.held || motion.landing || slotSprings(motion).some((spring) => !spring.isAtRest(0.002))
      ));

    engine.raf = busy ? requestAnimationFrame(frame) : 0;
  }, [render]);

  const kick = useCallback(() => {
    const engine = engineRef.current;

    if (!engine.raf) {
      engine.last = performance.now();
      engine.raf = requestAnimationFrame(frame);
    }
  }, [frame]);

  // Landing: the tile's shelf dips (everything on it rides the dip), the
  // tile squashes and the squash ripples out along its shelf.
  landRef.current = (motion, impact) => {
    const engine = engineRef.current;
    motion.landing = false;
    const tierMotion = getTier(engine, motion.tier);

    if (tierMotion) {
      tierMotion.dip.vel += 40 + (impact * 0.1);
    }

    motion.sq.vel -= 0.7 + (impact * 0.00045);

    const landedId = [...engine.slots.entries()].find(([, value]) => value === motion)?.[0];
    const sameTier = engine.order.filter((tileId) => engine.slots.get(tileId)?.tier === motion.tier);
    const from = sameTier.indexOf(landedId);

    sameTier.forEach((tileId, index) => {
      const distance = Math.abs(index - from);

      if (distance === 0 || from < 0) {
        return;
      }

      window.setTimeout(() => {
        const neighbour = engineRef.current.slots.get(tileId);

        if (neighbour && !neighbour.held) {
          neighbour.sq.vel -= 0.42 / distance;
          kick();
        }
      }, RIPPLE_DELAY_MS * distance);
    });
  };

  /* ----- targets ----- */

  useLayoutEffect(() => {
    const engine = engineRef.current;
    const { card: currentCard, childTiles: tiles, metricsById: metrics, layout: current } = propsRef.current;
    engine.centerX = currentCard.width / 2;
    engine.order = tiles.map((tile) => tile.id);
    const reduced = isRackReducedMotion() || isStaticPreview;
    const instant = reduced || !engine.booted;
    const now = performance.now();
    const liveIds = new Set(engine.order);

    [...engine.slots.keys()].forEach((tileId) => {
      if (!liveIds.has(tileId)) {
        engine.slots.delete(tileId);
      }
    });

    /* supports: shelves and posts */
    const liveSupports = new Set(current.supports.map((support) => support.key));
    [...engine.supports.keys()].forEach((key) => {
      if (!liveSupports.has(key)) {
        engine.supports.delete(key);
      }
    });

    current.supports.forEach((support) => {
      let motion = engine.supports.get(support.key);

      if (!motion) {
        motion = createSupportMotion(support);
        engine.supports.set(support.key, motion);

        if (!instant) {
          // A new shelf drops in from just above; posts grow.
          motion.op.snap(0);
          if (support.kind === "shelf") {
            motion.y.snap(support.y - 36);
          } else {
            motion.h.snap(0);
          }
        }
      }

      motion.tier = support.tier;
      motion.x.set(support.x);
      motion.y.set(support.y);
      motion.w.set(support.w);
      motion.h.set(support.h);
      motion.op.set(1);
    });

    /* slots */
    current.slots.forEach((slot, index) => {
      const tile = tiles[index];

      if (!tile || !slot) {
        return;
      }

      let motion = engine.slots.get(tile.id);

      if (!motion) {
        motion = createSlotMotion(slot.x, slot.y, slot.tier);
        engine.slots.set(tile.id, motion);
        const hint = engine.booted && !reduced ? takeRackDockHint(tile.id) : null;
        const tileMetrics = metrics.get(tile.id);

        if (hint && hint.width > 0) {
          // Fly in from where it was on screen, at the size it was, with
          // its momentum; frame and caption grow in on the way.
          const contentWidth = tile.width * tileMetrics.scale;
          const contentOffsetX = (tileMetrics.imageWidth - contentWidth) / 2;
          const startScale = hint.width / contentWidth;
          const localX = hint.x - currentCard.x - ((SLOT_FRAME_PADDING + contentOffsetX) * startScale);
          const localY = hint.y - currentCard.y - (SLOT_FRAME_PADDING * startScale);

          motion.x.snap(localX - engine.centerX);
          motion.y.snap(localY);
          motion.s.snap(startScale);
          motion.p.snap(0);
          motion.x.vel = hint.vx ?? 0;
          motion.y.vel = hint.vy ?? 0;
          motion.r.set(0, 0.5, 0.55);
          motion.landing = true;
          motion.landT = now;
          motion.dockT = now;
        } else if (engine.booted && !reduced) {
          motion.s.snap(0.6);
          motion.op.snap(0);
          motion.r.snap((Math.random() - 0.5) * 14);
        }
      }

      motion.tier = slot.tier;

      if (motion.held) {
        motion.held.slotX = slot.x;
        motion.held.slotY = slot.y;
        return;
      }

      const fresh = motion.landing && now - motion.dockT < 900;
      motion.x.set(slot.x, fresh ? 0.46 : 0.38, fresh ? 0.7 : 0.8);
      motion.y.set(slot.y, fresh ? 0.46 : 0.38, fresh ? 0.7 : 0.8);
      motion.s.set(1, fresh ? 0.4 : 0.42, fresh ? 0.78 : 0.62);
      motion.p.set(1, 0.36, 0.9);
      motion.op.set(1);
      motion.r.set(0, 0.6, 0.5);

      if (instant) {
        slotSprings(motion).forEach((spring) => spring.snap(spring.t));
        motion.landing = false;
      }
    });

    /* ghost */
    if (current.gap) {
      if (!engine.ghostShown) {
        engine.ghostX.snap(current.gap.x);
        engine.ghostY.snap(current.gap.y);
      }

      engine.ghostShown = true;
      engine.ghostW = current.gap.w;
      engine.ghostH = current.gap.h;
      engine.ghostTier = current.gap.tier;
      engine.ghostX.set(current.gap.x);
      engine.ghostY.set(current.gap.y);
      engine.ghostOp.set(1);
    } else {
      engine.ghostOp.set(0);
    }

    engine.empty = current.empty;
    engine.emptyOp.set(tiles.length === 0 && !current.gap ? 1 : 0);
    engine.nameTier = current.name.tier;
    engine.nameX.set(current.name.x);
    engine.nameY.set(current.name.y);

    const springs = [engine.ghostX, engine.ghostY, engine.ghostOp, engine.emptyOp, engine.nameX, engine.nameY];

    if (instant) {
      springs.forEach((spring) => spring.snap(spring.t));
      engine.supports.forEach((motion) => supportSprings(motion).forEach((spring) => spring.snap(spring.t)));
      engine.booted = true;
      render();
      return;
    }

    render();
    kick();
  }, [card.width, childTiles, isStaticPreview, kick, layout, metricsById, render]);

  // A full shelf refuses: the first time only, it shakes and hops as a hint.
  // The gap always just opens on the shelf below.
  useEffect(() => {
    const engine = engineRef.current;

    if (
      refusedTier === null
      || refusedTier === engine.refusedTier
      || shakenRackIds.has(card.id)
      || isRackReducedMotion()
    ) {
      engine.refusedTier = refusedTier;
      return;
    }

    engine.refusedTier = refusedTier;
    shakenRackIds.add(card.id);
    const tierMotion = getTier(engine, refusedTier);
    tierMotion.shake.vel += 1100;
    tierMotion.dip.vel -= 150;
    engine.slots.forEach((motion) => {
      if (motion.tier === refusedTier && !motion.held) {
        motion.sq.vel += 0.35;
      }
    });
    kick();
  }, [card.id, kick, refusedTier]);

  useLayoutEffect(() => () => {
    cancelAnimationFrame(engineRef.current.raf);
    engineRef.current.raf = 0;
  }, []);

  /* ----- DOM refs ----- */

  const registerSlot = useCallback((tileId, node) => {
    const engine = engineRef.current;
    const motion = engine.slots.get(tileId);

    if (node) {
      engine.nodes[tileId] = node;
    } else {
      delete engine.nodes[tileId];
    }

    if (motion) {
      motion.el = node;
      motion.bodyEl = node?.firstElementChild ?? null;
    }
  }, []);

  const registerSupport = useCallback((key, node) => {
    const engine = engineRef.current;

    if (node) {
      engine.supportNodes[key] = node;
    } else {
      delete engine.supportNodes[key];
    }

    const motion = engine.supports.get(key);
    if (motion) {
      motion.el = node;
    }
  }, []);

  // Motions are made in the targets effect, after the ref callbacks of a
  // first render: attach any node that is waiting.
  useLayoutEffect(() => {
    const engine = engineRef.current;
    engine.slots.forEach((motion, tileId) => {
      const node = engine.nodes[tileId];
      if (node && motion.el !== node) {
        motion.el = node;
        motion.bodyEl = node.firstElementChild;
      }
    });
    engine.supports.forEach((motion, key) => {
      const node = engine.supportNodes[key];
      if (node && motion.el !== node) {
        motion.el = node;
      }
    });
    render();
  });

  /* ----- hover ----- */

  const handleSlotHover = useCallback((tileId, isOver) => {
    const motion = engineRef.current.slots.get(tileId);

    if (!motion || motion.held) {
      return;
    }

    motion.hov.set(isOver ? 1 : 0);
    motion.el?.classList.toggle("rack-slot--hover", isOver);
    kick();
  }, [kick]);

  /* ----- press, rubber band, tear-off ----- */

  const handleSlotPointerDown = useCallback((tile, event) => {
    if (event.button !== 0 || isStaticPreview) {
      return;
    }

    const engine = engineRef.current;
    const motion = engine.slots.get(tile.id);
    const article = articleRef.current;
    const metrics = propsRef.current.metricsById.get(tile.id);

    if (!motion || !article || !metrics) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });

    const articleRect = article.getBoundingClientRect();
    const zoom = article.offsetWidth > 0 ? articleRect.width / article.offsetWidth : 1;
    const frameLeft = engine.centerX + motion.x.v;
    const frameTop = motion.y.v;
    const localX = (event.clientX - articleRect.left) / zoom;
    const localY = (event.clientY - articleRect.top) / zoom;
    // Grab point on the real tile (0-1), through the frame and the crop.
    const contentWidth = tile.width * metrics.scale;
    const contentOffsetX = (metrics.imageWidth - contentWidth) / 2;
    const fx = clamp((localX - frameLeft - SLOT_FRAME_PADDING - contentOffsetX) / contentWidth, 0, 1);
    const fy = clamp((localY - frameTop - SLOT_FRAME_PADDING) / (tile.height * metrics.scale), 0, 1);
    const pointerId = event.pointerId;
    const target = event.currentTarget;

    motion.held = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      zoom,
      slotX: motion.x.t,
      slotY: motion.y.t,
      originX: localX - frameLeft,
      originY: localY - frameTop,
      moved: false,
      vx: 0,
      lastX: event.clientX,
      lastT: performance.now(),
    };
    motion.hov.set(0);
    motion.lift.set(1, 0.25, 1);
    motion.s.set(1.03, 0.25, 0.8);
    target.setPointerCapture?.(pointerId);
    kick();

    const finish = (upEvent, tornOff) => {
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", handleUp);
      target.removeEventListener("pointercancel", handleUp);
      target.releasePointerCapture?.(pointerId);
      const held = motion.held;
      motion.held = null;

      if (tornOff) {
        motion.gone = true;
        motion.lift.snap(0);
        motion.s.snap(1);
        render();
        propsRef.current.onBeginDrag?.(tile, upEvent, { clientX: held.startX, clientY: held.startY }, {
          fx,
          fy,
          scale: metrics.scale,
        });
        return;
      }

      motion.x.set(held.slotX, 0.38, 0.8);
      motion.y.set(held.slotY, 0.38, 0.8);
      motion.s.set(1, 0.4, 0.78);
      motion.lift.set(0, 0.35, 1);
      motion.r.set(0, 0.5, 0.55);

      if (held.moved) {
        motion.landing = true;
        motion.landT = performance.now();
        motion.dockT = 0;
      }

      kick();
    };

    function handleMove(moveEvent) {
      const held = motion.held;

      if (!held || moveEvent.pointerId !== pointerId) {
        return;
      }

      const dx = (moveEvent.clientX - held.startX) / held.zoom;
      const dy = (moveEvent.clientY - held.startY) / held.zoom;
      const distance = Math.hypot(dx, dy);
      const now = performance.now();
      const instant = ((moveEvent.clientX - held.lastX) / held.zoom) / Math.max(0.004, (now - held.lastT) / 1000);
      held.vx += (instant - held.vx) * 0.25;
      held.lastX = moveEvent.clientX;
      held.lastT = now;

      if (distance > MOVE_SLOP) {
        held.moved = true;
      }

      if (distance > RACK_TEAR_DISTANCE) {
        finish(moveEvent, true);
        return;
      }

      motion.x.set(held.slotX + rubberBand(dx), 0.05, 1);
      motion.y.set(held.slotY + rubberBand(dy), 0.05, 1);
      motion.r.set(clamp(held.vx * 0.011, -7, 7), 0.3, 0.7);
      kick();
    }

    function handleUp(upEvent) {
      if (upEvent.pointerId === pointerId) {
        finish(upEvent, false);
      }
    }

    target.addEventListener("pointermove", handleMove);
    target.addEventListener("pointerup", handleUp);
    target.addEventListener("pointercancel", handleUp);
  }, [isStaticPreview, kick, render]);

  /* ----- edits ----- */

  const commitName = useCallback((nextName) => {
    updateExistingCard(card.id, { title: nextName });
  }, [card.id, updateExistingCard]);

  const pickStyle = useCallback((patch) => {
    updateExistingCard(card.id, patch);
  }, [card.id, updateExistingCard]);

  const closeStyle = useCallback(() => setStyleOpen(false), []);

  useEffect(() => {
    const handleOpen = (event) => {
      if (event.detail?.tileId === card.id) {
        const article = articleRef.current;
        const rect = article?.getBoundingClientRect();
        setStyleZoom(article?.offsetWidth ? rect.width / article.offsetWidth : 1);
        setStyleOpen(true);
      }
    };

    window.addEventListener(OPEN_RACK_STYLE_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_RACK_STYLE_EVENT, handleOpen);
  }, [card.id]);

  return (
    <TileShell
      card={card}
      renderHint={renderHint}
      tileMeta={tileMeta}
      className="card--rack"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <article
        ref={articleRef}
        className={[
          "rack",
          `rack--${materialId}`,
          `rack--frame-${frameStyle}`,
        ].join(" ")}
        aria-label={`${title} rack`}
        style={{
          height: `${restLayout.height}px`,
          "--rack-rail-hi": material.rail[0],
          "--rack-rail-lo": material.rail[1],
          "--rack-name-ink": material.ink,
          "--rack-name-hi": material.highlight,
        }}
        {...rackGesture}
      >
        <svg className="rack__defs" width="0" height="0" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="56.8709" y1="-21.6358" x2="56.8709" y2="30.3645" gradientUnits="userSpaceOnUse">
              <stop stopColor={material.stops[0]} />
              <stop offset="0.349073" stopColor={material.stops[1]} />
              <stop offset="0.740446" stopColor={material.stops[2]} />
              <stop offset="0.831795" stopColor={material.stops[3]} />
              <stop offset="1" stopColor={material.stops[4]} />
            </linearGradient>
          </defs>
        </svg>

        {layout.supports.map((support) => (
          <RackSupport
            key={support.key}
            support={support}
            gradientId={gradientId}
            material={material}
            registerSupport={registerSupport}
          />
        ))}

        <div ref={emptyRef} className="rack__empty" aria-hidden={childTiles.length > 0}>
          Drop tiles here
        </div>
        <div ref={ghostRef} className="rack__ghost" aria-hidden="true" />

        {childTiles.map((tile, index) => (
          <RackSlot
            key={tile.id}
            tile={tile}
            metrics={metricsById.get(tile.id)}
            rect={restLayout.slots[index] ?? { w: 0, h: 0 }}
            renderTilePreview={renderTilePreview}
            registerSlot={registerSlot}
            onSlotPointerDown={handleSlotPointerDown}
            onSlotHover={handleSlotHover}
            onPullFromRack={onPullFromRack}
          />
        ))}

        <RackName title={title} onCommit={commitName} nameRef={nameRef} />

        {styleOpen && !isStaticPreview ? (
          <RackStylePanel material={materialId} frameStyle={frameStyle} zoom={styleZoom} onPick={pickStyle} onClose={closeStyle} />
        ) : null}
      </article>
    </TileShell>
  );
}

export default memo(RackTile);
