import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { renderSimpleMarkdown } from "../../lib/renderSimpleMarkdown";
import { DRAWING_TOOL_MODE_SELECT } from "../../systems/drawing/drawingTypes";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import PaperNoteFullscreenEditor from "../PaperNoteFullscreenEditor";
import TileShell from "./TileShell";
import "./PaperNoteTile.css";

// How tall a page's body area can look before another sheet visually peeks
// out from underneath -- purely decorative pagination, not a real page
// break (the fullscreen editor is one continuous scrollable document).
const PAGE_CONTENT_CAPACITY_PX = 220;
const MAX_STACK_PAGES = 3;
const TRAIL_LAG_FACTORS = [0.22, 0.13];

function hashUnitInterval(seed) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

// Makes the extra stacked pages lag behind the front page while it's being
// dragged, then settle back into place after the drop -- a lightweight
// spring-follow written directly to each ghost node's style per animation
// frame (no React state) so it stays cheap even during a fast drag.
//
// Tracks the front page's continuous ABSOLUTE position (card.x/y plus the
// live drag offset while dragging), not the drag offset alone: the drag
// offset itself resets to 0 the instant a drop commits (card.x jumps by the
// same amount at the same moment, so the *sum* never jumps), but a lagged
// value chasing the offset in isolation would see that reset as a real,
// sudden change and visibly snap.
function useTrailingGhostRefs(frontX, frontY, pageCount) {
  const refs = useRef([null, null]).current;
  const laggedRef = useRef([{ x: frontX, y: frontY }, { x: frontX, y: frontY }]);
  const targetRef = useRef({ x: frontX, y: frontY });
  targetRef.current = { x: frontX, y: frontY };

  useEffect(() => {
    if (pageCount < 2) {
      return undefined;
    }

    let frameId = 0;

    function tick() {
      const target = targetRef.current;

      for (let index = 0; index < 2; index += 1) {
        const lagged = laggedRef.current[index];
        const factor = TRAIL_LAG_FACTORS[index];
        lagged.x += (target.x - lagged.x) * factor;
        lagged.y += (target.y - lagged.y) * factor;

        const node = refs[index];
        if (node) {
          node.style.setProperty("--pn-trail-x", `${lagged.x - target.x}px`);
          node.style.setProperty("--pn-trail-y", `${lagged.y - target.y}px`);
        }
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [pageCount, refs]);

  return refs;
}

function PaperNoteTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  renderHint,
  canvasToolMode,
}) {
  const { updateExistingCard, setCanvasInteractionState } = useAppContext();
  const isSelectToolActive = canvasToolMode === DRAWING_TOOL_MODE_SELECT;
  const [fullscreen, setFullscreen] = useState(null);
  const [pageCount, setPageCount] = useState(1);
  const pageRef = useRef(null);
  const measureRef = useRef(null);

  const title = typeof card.title === "string" ? card.title : "";
  const subtitle = typeof card.subtitle === "string" ? card.subtitle : "";
  const text = typeof card.text === "string" ? card.text : "";
  const hasTitle = title.trim().length > 0;
  const hasSubtitle = subtitle.trim().length > 0;
  const hasBody = text.trim().length > 0;
  const bodyPreview = useMemo(() => renderSimpleMarkdown(text), [text]);

  useLayoutEffect(() => {
    const measuredHeight = measureRef.current?.getBoundingClientRect?.().height ?? 0;
    const nextPageCount = Math.max(
      1,
      Math.min(MAX_STACK_PAGES, Math.ceil(measuredHeight / PAGE_CONTENT_CAPACITY_PX)),
    );
    setPageCount((current) => (current === nextPageCount ? current : nextPageCount));
  }, [text, card.width, bodyPreview]);

  const openFullscreen = useCallback(() => {
    const rect = pageRef.current?.getBoundingClientRect?.();
    if (!rect) {
      return;
    }

    setFullscreen({
      startRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  }, []);

  const handleSave = useCallback((patch) => {
    updateExistingCard(card.id, patch);
  }, [card.id, updateExistingCard]);

  const handleClosed = useCallback(() => {
    setFullscreen(null);
  }, []);

  useEffect(() => {
    setCanvasInteractionState?.(Boolean(fullscreen));
    return () => {
      setCanvasInteractionState?.(false);
    };
  }, [fullscreen, setCanvasInteractionState]);

  const surfaceGesture = useTileGesture({
    card,
    canDrag: isSelectToolActive && !fullscreen,
    onDoubleActivate: openFullscreen,
    onDragStart: onBeginDrag,
    onPressStart,
  });

  const dragDelta = dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null;
  const frontAbsoluteX = card.x + (dragDelta ? dragDelta.x : 0);
  const frontAbsoluteY = card.y + (dragDelta ? dragDelta.y : 0);
  const trailRefs = useTrailingGhostRefs(frontAbsoluteX, frontAbsoluteY, pageCount);

  const ghostSeeds = useMemo(() => {
    const base = hashUnitInterval(card.id);
    return [1, 2].map((depth) => {
      const seed = (base + depth * 0.37) % 1;
      return {
        offsetX: 7 + seed * 9 + depth * 2,
        offsetY: 11 + depth * 8 + seed * 6,
        rotation: (seed - 0.5) * 9 * depth,
      };
    });
  }, [card.id]);

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--paper-note"
      renderHint={renderHint}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className="paper-note">
          {pageCount >= 3 ? (
            <div
              ref={(node) => { trailRefs[1] = node; }}
              className="paper-note__page paper-note__page--ghost paper-note__page--ghost-2"
              style={{
                "--pn-ox": `${ghostSeeds[1].offsetX}px`,
                "--pn-oy": `${ghostSeeds[1].offsetY}px`,
                "--pn-rot": `${ghostSeeds[1].rotation}deg`,
              }}
              aria-hidden="true"
            />
          ) : null}
          {pageCount >= 2 ? (
            <div
              ref={(node) => { trailRefs[0] = node; }}
              className="paper-note__page paper-note__page--ghost paper-note__page--ghost-1"
              style={{
                "--pn-ox": `${ghostSeeds[0].offsetX}px`,
                "--pn-oy": `${ghostSeeds[0].offsetY}px`,
                "--pn-rot": `${ghostSeeds[0].rotation}deg`,
              }}
              aria-hidden="true"
            />
          ) : null}

          <section
            ref={pageRef}
            className="paper-note__page paper-note__page--front"
            aria-label="Paper note"
            {...surfaceGesture}
          >
            <header className="paper-note__head">
              <div className={`paper-note__title${hasTitle ? "" : " paper-note__title--placeholder"}`}>
                {hasTitle ? title : "Untitled"}
              </div>
              {hasSubtitle ? <div className="paper-note__subtitle">{subtitle}</div> : null}
            </header>
            <div className="paper-note__body">
              {hasBody ? bodyPreview : <p className="paper-note__empty">Double-click to start writing</p>}
            </div>
            {hasBody ? <div className="paper-note__fade" aria-hidden="true" /> : null}
          </section>

          <div ref={measureRef} className="paper-note__measure" aria-hidden="true">
            {hasBody ? bodyPreview : null}
          </div>
        </div>
      </div>

      {fullscreen ? (
        <PaperNoteFullscreenEditor
          card={card}
          startRect={fullscreen.startRect}
          onSave={handleSave}
          onClosed={handleClosed}
        />
      ) : null}
    </TileShell>
  );
}

export default memo(PaperNoteTile);
