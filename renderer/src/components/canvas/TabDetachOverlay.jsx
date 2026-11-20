import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "../../context/useAppContext";
import { desktop } from "../../lib/desktop";
import { getCanvasThumbnailVersion } from "../../lib/canvasThumbnail";
import { renderCanvasThumbnail } from "../../lib/canvasThumbnailRender";
import { getDetachZone } from "../../systems/canvas/splitView";
import { Canvas } from "../ui/icons";
import "./TabDetachOverlay.css";

const PREVIEW_OFFSET = { x: 14, y: 12 };

// Magnetic drop boxes: each box leans toward the pointer, harder the closer
// it is, and its picture leans a little further than the box.
const MAGNET_MAX = 12; // px a box can move
const MAGNET_HOT_MAX = 18; // px the box under the pointer can move
const MAGNET_INNER = 0.7; // extra lean of the picture inside, x the box's
const MAGNET_SPRING = 0.2;

// Drag out of the tab bar: the tab stretches into the preview card.
const ZOOP_MS = 260;
// Drop on a box: the preview morphs into the box, then everything fades.
const MORPH_MS = 280;
const FADE_MS = 160;
const CANCEL_MS = 140;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The area the drop boxes cover: the canvas (split) area, or the whole view
// under the tab bar.
function measureDropArea() {
  const node = document.querySelector(".canvas-split") ?? document.querySelector(".app-shell__view-container");
  const rect = node?.getBoundingClientRect();
  if (!rect || rect.width < 1 || rect.height < 1) {
    return { left: 0, top: 48, width: window.innerWidth, height: Math.max(1, window.innerHeight - 48) };
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

// The file's picture for the drag preview: the current tab is drawn fresh
// from its tiles; another tab uses its saved Home thumbnail.
function useTabPreviewImage(tab, isCurrent) {
  const { folderPath, homeData, workspace } = useAppContext();
  const [src, setSrc] = useState("");
  const cardsRef = useRef(workspace?.cards ?? []);
  cardsRef.current = workspace?.cards ?? [];

  useEffect(() => {
    let cancelled = false;
    const item = (homeData?.allFiles ?? []).find((entry) => entry.filePath === tab.entityId);
    if (folderPath && item?.thumbnailPath) {
      void Promise.resolve(desktop.workspace.resolveAssetUrl(folderPath, item.thumbnailPath, { previewTier: "original" }))
        .then((resolved) => {
          if (cancelled || !resolved) return;
          const version = getCanvasThumbnailVersion(tab.entityId);
          setSrc((current) => current || (version ? `${resolved}?v=${version}` : resolved));
        })
        .catch(() => {});
    }
    if (isCurrent && folderPath) {
      void renderCanvasThumbnail(cardsRef.current, folderPath)
        .then((dataUrl) => {
          if (!cancelled && dataUrl) setSrc(dataUrl);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [folderPath, homeData, isCurrent, tab.entityId]);

  return src;
}

// The moving dashed border inside each drop box.
function DashedFrame() {
  return (
    <svg className="tab-detach__dash" aria-hidden="true">
      <rect />
    </svg>
  );
}

// A drop box: the whole third of the area is the hit box; in it sits a
// smaller white card with a marching dashed border and a picture of the
// result -- a phone for the floating view, a two-pane screen for split
// left / right.
function DropZone({ id, label, zoneRefs, cardRefs, innerRefs }) {
  return (
    <div
      className={`tab-detach__zone tab-detach__zone--${id}`}
      ref={(node) => { zoneRefs.current[id] = node; }}
    >
      <div className="tab-detach__card" ref={(node) => { cardRefs.current[id] = node; }}>
        <DashedFrame />
        <div className="tab-detach__zone-inner" ref={(node) => { innerRefs.current[id] = node; }}>
          {id === "float" ? (
            <div className="tab-detach__device tab-detach__device--phone">
              <div className="tab-detach__screen is-target">{label}</div>
            </div>
          ) : (
            <div className="tab-detach__device tab-detach__device--split">
              <div className={`tab-detach__screen${id === "left" ? " is-target" : ""}`}>{id === "left" ? label : null}</div>
              <div className={`tab-detach__screen${id === "right" ? " is-target" : ""}`}>{id === "right" ? label : null}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Shown while a tab is dragged below the tab bar: a preview card of the file
// following the pointer, and the drop boxes -- left / right (split screen
// with `partnerName`) and middle (floating view). The drag itself lives in
// TopTabBar, which drives this through the ref (no re-renders).
const TabDetachOverlay = forwardRef(function TabDetachOverlay({ tab, isCurrent, partnerName, from }, ref) {
  const rootRef = useRef(null);
  const previewRef = useRef(null);
  const bodyRef = useRef(null);
  const zoneRefs = useRef({});
  const cardRefs = useRef({});
  const innerRefs = useRef({});
  const [area, setArea] = useState(measureDropArea);
  const areaRef = useRef(area);
  areaRef.current = area;
  const zoneRef = useRef(null);
  const pointerRef = useRef(from ? { x: from.x, y: from.y } : null);
  const magnetRef = useRef({ rects: {}, offsets: {}, frame: 0, running: false });
  const canSplit = Boolean(partnerName);
  const src = useTabPreviewImage(tab, isCurrent);

  useLayoutEffect(() => {
    const handleResize = () => setArea(measureDropArea());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // The cards' resting places, measured before any lean is applied.
  useLayoutEffect(() => {
    const rects = {};
    for (const [id, node] of Object.entries(cardRefs.current)) {
      if (!node) continue;
      node.style.transform = "";
      const rect = node.getBoundingClientRect();
      rects[id] = { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, w: rect.width, h: rect.height };
    }
    magnetRef.current.rects = rects;
  }, [area, canSplit]);

  // Magnet loop: springs every box toward its lean for the current pointer.
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const magnet = magnetRef.current;
    magnet.running = true;

    const tick = () => {
      if (!magnet.running) return;
      const pointer = pointerRef.current;
      for (const [id, rect] of Object.entries(magnet.rects)) {
        const node = cardRefs.current[id];
        if (!node) continue;
        let tx = 0;
        let ty = 0;
        if (pointer) {
          const dx = pointer.x - rect.cx;
          const dy = pointer.y - rect.cy;
          const reach = Math.max(rect.w, rect.h) * 0.9;
          const pull = Math.max(0, 1 - Math.hypot(dx, dy) / reach);
          const hot = zoneRef.current === id;
          const max = hot ? MAGNET_HOT_MAX : MAGNET_MAX;
          const strength = hot ? Math.max(pull, 0.55) : pull;
          tx = Math.max(-1, Math.min(1, dx / (rect.w / 2))) * max * strength;
          ty = Math.max(-1, Math.min(1, dy / (rect.h / 2))) * max * strength;
        }
        const offset = magnet.offsets[id] ?? { x: 0, y: 0 };
        offset.x += (tx - offset.x) * MAGNET_SPRING;
        offset.y += (ty - offset.y) * MAGNET_SPRING;
        magnet.offsets[id] = offset;
        node.style.transform = `translate3d(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px, 0)`;
        const inner = innerRefs.current[id];
        if (inner) {
          inner.style.transform = `translate3d(${(offset.x * MAGNET_INNER).toFixed(2)}px, ${(offset.y * MAGNET_INNER).toFixed(2)}px, 0)`;
        }
      }
      magnet.frame = window.requestAnimationFrame(tick);
    };
    magnet.frame = window.requestAnimationFrame(tick);
    return () => {
      magnet.running = false;
      window.cancelAnimationFrame(magnet.frame);
    };
  }, []);

  // Zoop: the tab stretches down out of the bar into the preview card.
  useLayoutEffect(() => {
    const node = previewRef.current;
    const body = bodyRef.current;
    if (!node || !body || !from) return;
    const left = from.x + PREVIEW_OFFSET.x;
    const top = from.y + PREVIEW_OFFSET.y;
    node.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    node.style.opacity = "1";
    if (prefersReducedMotion() || !from.rect || typeof body.animate !== "function") return;
    const width = body.offsetWidth || 200;
    const height = body.offsetHeight || 150;
    const sx = from.rect.width / width;
    const sy = from.rect.height / height;
    const ox = from.rect.left - left;
    const oy = from.rect.top - top;
    body.animate(
      [
        { transform: `translate(${ox}px, ${oy}px) scale(${sx}, ${sy})`, opacity: 0.5, borderRadius: "999px" },
        { transform: "translate(0, 0) scale(0.94, 1.08)", opacity: 1, borderRadius: "12px", offset: 0.6 },
        { transform: "translate(0, 0) scale(1, 1)", opacity: 1, borderRadius: "10px" },
      ],
      { duration: ZOOP_MS, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
    );
    // Mount-only: `from` is where this drag left the bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMagnet() {
    const magnet = magnetRef.current;
    magnet.running = false;
    window.cancelAnimationFrame(magnet.frame);
  }

  // Fades each part on its own, never the whole overlay: a fading parent
  // would cut the backdrop blur off from the canvas behind it.
  function fadeOut(duration) {
    const root = rootRef.current;
    if (!root || typeof root.animate !== "function") return Promise.resolve();
    const frames = [{ opacity: 1 }, { opacity: 0 }];
    const timing = { duration, easing: "ease-out", fill: "forwards" };
    const area = root.querySelector(".tab-detach__area");
    const animations = [
      area?.animate(frames, { ...timing, pseudoElement: "::before" }),
      ...[...root.querySelectorAll(".tab-detach__zone, .tab-detach__preview")].map((node) => node.animate(frames, timing)),
    ].filter(Boolean);
    return Promise.all(animations.map((animation) => animation.finished)).then(() => {}, () => {});
  }

  useImperativeHandle(ref, () => ({
    // Follows the pointer; returns the drop box under it ("left" | "right"
    // | "float" | null).
    move(clientX, clientY) {
      pointerRef.current = { x: clientX, y: clientY };
      const node = previewRef.current;
      if (node) {
        node.style.transform = `translate3d(${Math.round(clientX + PREVIEW_OFFSET.x)}px, ${Math.round(clientY + PREVIEW_OFFSET.y)}px, 0)`;
        node.style.opacity = "1";
      }
      const zone = getDetachZone(areaRef.current, clientX, clientY, canSplit);
      if (zone !== zoneRef.current) {
        zoneRef.current = zone;
        for (const [id, zoneNode] of Object.entries(zoneRefs.current)) {
          if (!zoneNode) continue;
          if (id === zone) zoneNode.setAttribute("data-hot", "");
          else zoneNode.removeAttribute("data-hot");
        }
        previewRef.current?.setAttribute("data-zone", zone ?? "");
      }
      return zone;
    },
    getZone: () => zoneRef.current,
    // The drop: the preview morphs into the box it landed on, then the
    // overlay fades to show the result. Resolves when it can be removed.
    async finish(zone) {
      stopMagnet();
      const root = rootRef.current;
      const node = previewRef.current;
      const target = zone ? cardRefs.current[zone] : null;
      if (!root || !node || !target || prefersReducedMotion() || typeof node.animate !== "function") {
        await fadeOut(prefersReducedMotion() ? 1 : CANCEL_MS);
        return;
      }
      root.setAttribute("data-morph", zone);
      const r0 = node.getBoundingClientRect();
      const r1 = target.getBoundingClientRect();
      const radius = getComputedStyle(target).borderTopLeftRadius || "24px";
      const morph = node.animate(
        [
          { transform: `translate3d(${r0.left}px, ${r0.top}px, 0)`, width: `${r0.width}px`, height: `${r0.height}px`, borderRadius: "10px" },
          { transform: `translate3d(${r1.left}px, ${r1.top}px, 0)`, width: `${r1.width}px`, height: `${r1.height}px`, borderRadius: radius },
        ],
        { duration: MORPH_MS, easing: "cubic-bezier(0.22, 1.15, 0.36, 1)", fill: "forwards" },
      );
      await morph.finished.catch(() => {});
      await fadeOut(FADE_MS);
    },
  }), [canSplit]);

  const style = {
    left: `${area.left}px`,
    top: `${area.top}px`,
    width: `${area.width}px`,
    height: `${area.height}px`,
  };

  return createPortal(
    <div className="tab-detach" aria-hidden="true" ref={rootRef}>
      <div className="tab-detach__area" style={style}>
        {canSplit ? <DropZone id="left" label="Split left" zoneRefs={zoneRefs} cardRefs={cardRefs} innerRefs={innerRefs} /> : null}
        <DropZone id="float" label="Float tab here" zoneRefs={zoneRefs} cardRefs={cardRefs} innerRefs={innerRefs} />
        {canSplit ? <DropZone id="right" label="Split right" zoneRefs={zoneRefs} cardRefs={cardRefs} innerRefs={innerRefs} /> : null}
      </div>
      <div className="tab-detach__preview" ref={previewRef}>
        <div className="tab-detach__preview-body" ref={bodyRef}>
          <div className="tab-detach__preview-image">
            {src ? <img src={src} alt="" draggable={false} /> : <Canvas size={22} />}
          </div>
          <div className="tab-detach__preview-name">{tab.title}</div>
          {partnerName ? <div className="tab-detach__preview-hint">with {partnerName}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
});

export default TabDetachOverlay;
