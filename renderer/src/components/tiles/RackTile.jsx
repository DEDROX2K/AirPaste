import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { RACK_PREVIEW_HEIGHT, RACK_PREVIEW_WIDTH, getRackSize } from "../../lib/workspace";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  RACK_DEFAULT_TITLE,
  RACK_NAME_MAX_LENGTH,
  RACK_PLASTICS,
  normalizeRackName,
  normalizeRackPlasticColor,
} from "../../tiles/rack/model";
import TileShell from "./TileShell";
import "./RackTile.css";

const EMPTY_CHILD_TILES = [];
// Pointer leaving a card waits this long before it drops back, so moving
// between neighbouring cards doesn't flicker.
const CARD_LEAVE_DELAY_MS = 70;
// A card is the real tile scaled to the card width, so it keeps the tile's
// shape: as tall as that makes it, up to the full card height. Short tiles
// stand higher so at least this much of them rises above the plastic,
// their foot still tucked behind it.
const CARD_SHOWN_MIN_HEIGHT = 150;
const CARD_BASE_BOTTOM = 34;
const CARD_MAX_BOTTOM = 95;
// Rest-pose variety, cycled left to right: [lean back, rotateZ].
const CARD_REST_POSES = [[42, -1.2], [40, 0.6], [44, -0.8]];
// "rackId:tileId" of every card already shown this session: only cards that
// are new (app load, freshly racked) play the drop-in intro, not every
// remount from panning or zooming.
const introducedCardKeys = new Set();

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
  link: "Link",
  note: "Note",
  "paper-note": "Paper note",
  progress: "Progress",
  table: "Table",
  "text-box": "Text",
  weather: "Weather",
});

function getTileTypeLabel(tile) {
  return TILE_TYPE_LABELS[tile?.type] ?? "Tile";
}

function getTileTitle(tile) {
  const candidates = [
    tile?.title,
    tile?.repo?.name,
    tile?.city,
    tile?.file?.fileName,
    tile?.url,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

/* ---------- a tile standing in the rack ---------- */

function RackCard({
  rackId,
  tile,
  index,
  count,
  activeIndex,
  renderTilePreview,
  onActivate,
  onDeactivate,
  onBeginDrag,
  onPullFromRack,
}) {
  const cardRef = useRef(null);
  const tiltRef = useRef(null);
  const tileWidth = Math.max(1, tile.width || RACK_PREVIEW_WIDTH);
  const tileHeight = Math.max(1, tile.height || RACK_PREVIEW_HEIGHT);
  const previewScale = RACK_PREVIEW_WIDTH / tileWidth;
  const cardHeight = Math.min(RACK_PREVIEW_HEIGHT, Math.round(tileHeight * previewScale));
  const cardBottom = Math.min(CARD_MAX_BOTTOM, CARD_BASE_BOTTOM + Math.max(0, CARD_SHOWN_MIN_HEIGHT - cardHeight));
  const introKey = `${rackId}:${tile.id}`;
  const [playsIntro] = useState(() => !introducedCardKeys.has(introKey));
  const isActive = activeIndex === index;
  const [lean, rotateZ] = CARD_REST_POSES[index % CARD_REST_POSES.length];
  const column = index - ((count - 1) / 2);
  const typeLabel = getTileTypeLabel(tile);
  const title = getTileTitle(tile);

  useEffect(() => {
    introducedCardKeys.add(introKey);
  }, [introKey]);

  const gesture = useTileGesture({
    card: tile,
    onDragStart: onBeginDrag,
    onActivate: onPullFromRack,
  });

  const resetTilt = () => {
    tiltRef.current?.style.removeProperty("--rack-tilt-x");
    tiltRef.current?.style.removeProperty("--rack-tilt-y");
  };

  // Pointer-follow tilt + glare, written straight to CSS variables so a
  // pointermove never re-renders the rack.
  const handlePointerMove = (event) => {
    gesture.onPointerMove(event);

    if (!isActive || !cardRef.current || !tiltRef.current) {
      return;
    }

    const rect = cardRef.current.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    tiltRef.current.style.setProperty("--rack-tilt-y", `${((px - 0.5) * 10).toFixed(2)}deg`);
    tiltRef.current.style.setProperty("--rack-tilt-x", `${((0.5 - py) * 6).toFixed(2)}deg`);
    cardRef.current.style.setProperty("--rack-glare-x", `${(px * 100).toFixed(1)}%`);
    cardRef.current.style.setProperty("--rack-glare-y", `${(py * 100).toFixed(1)}%`);
  };

  const neighbourShift = activeIndex === null || isActive ? 0 : (index > activeIndex ? 12 : -12);

  return (
    <div
      ref={cardRef}
      className={[
        "rack-tile__card",
        isActive ? "rack-tile__card--active" : "",
        playsIntro ? "rack-tile__card--intro" : "",
      ].filter(Boolean).join(" ")}
      role="button"
      tabIndex={0}
      title={title ? `${typeLabel}: ${title}` : typeLabel}
      aria-label={`Take ${title || typeLabel} out of the rack`}
      style={{
        "--rack-col": column,
        "--rack-n": index,
        "--rack-lean": `${lean}deg`,
        "--rack-ry": `${Math.max(-8, Math.min(8, -column * 8))}deg`,
        "--rack-rz": `${rotateZ}deg`,
        "--rack-dx": `${neighbourShift}px`,
        height: `${cardHeight}px`,
        bottom: `${cardBottom}px`,
      }}
      {...gesture}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => onActivate(index)}
      onPointerLeave={() => {
        resetTilt();
        onDeactivate(index);
      }}
      onFocus={() => onActivate(index, { immediate: true })}
      onBlur={() => onDeactivate(index, { immediate: true })}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPullFromRack?.(tile);
        }
      }}
    >
      <div ref={tiltRef} className="rack-tile__tilt">
        <div className="rack-tile__face">
          {/* Look, never touch: the card is the handle, the tile inside is
              inert. */}
          <div
            className="rack-tile__tile"
            inert
            aria-hidden="true"
            style={{
              width: `${tileWidth}px`,
              height: `${tileHeight}px`,
              transform: `scale(${previewScale})`,
            }}
          >
            {renderTilePreview?.(tile)}
          </div>
          <div className="rack-tile__dim" />
          <div className="rack-tile__sheen" />
          <div className="rack-tile__glare" />
        </div>
      </div>
    </div>
  );
}

/* ---------- the editable name label ---------- */

function RackName({ title, onCommit }) {
  const nameRef = useRef(null);
  const committedRef = useRef(title);

  // Uncontrolled while editing: React only writes the name in when the user
  // isn't typing in it.
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
    <div className="rack-tile__label" onPointerDown={stopPointer} onDoubleClick={stopPointer}>
      <h2>
        <span
          ref={nameRef}
          className="rack-tile__name"
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
              // A stray <br> would defeat the :empty placeholder.
              element.innerHTML = "";
            } else if (element.textContent.length > RACK_NAME_MAX_LENGTH) {
              element.textContent = element.textContent.slice(0, RACK_NAME_MAX_LENGTH);
              placeCaretAtEnd(element);
            }
          }}
          onBlur={(event) => {
            // A rack always has a name: emptying it reverts.
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

/* ---------- the rack ---------- */

function RackTile({
  card,
  tileMeta,
  childTiles = EMPTY_CHILD_TILES,
  dragVisualDelta,
  dragVisualTileIdSet,
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
  const { updateExistingCard } = useAppContext();
  const [activeTileId, setActiveTileId] = useState(null);
  const leaveTimerRef = useRef(0);
  const plastic = RACK_PLASTICS[normalizeRackPlasticColor(card.plasticColor)];
  const title = card.title || RACK_DEFAULT_TITLE;
  const isDropTarget = tileMeta?.isRackDropTarget === true;
  // While a tile hovers over the rack, the cards make room for it and the
  // plastic previews the width it will grow to.
  const slotCount = childTiles.length + (isDropTarget ? 1 : 0);
  const previewWidth = isDropTarget ? getRackSize({ tileIds: Array.from({ length: slotCount }) }).width : null;
  const activeIndex = activeTileId ? childTiles.findIndex((tile) => tile.id === activeTileId) : -1;

  const rackGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });

  useEffect(() => () => window.clearTimeout(leaveTimerRef.current), []);

  const activateCard = useCallback((index) => {
    window.clearTimeout(leaveTimerRef.current);
    setActiveTileId(childTiles[index]?.id ?? null);
  }, [childTiles]);

  const deactivateCard = useCallback((index, { immediate = false } = {}) => {
    const tileId = childTiles[index]?.id;
    window.clearTimeout(leaveTimerRef.current);
    const release = () => setActiveTileId((current) => (current === tileId ? null : current));

    if (immediate) {
      release();
    } else {
      leaveTimerRef.current = window.setTimeout(release, CARD_LEAVE_DELAY_MS);
    }
  }, [childTiles]);

  const commitName = useCallback((nextName) => {
    updateExistingCard(card.id, { title: nextName });
  }, [card.id, updateExistingCard]);

  return (
    <TileShell
      card={card}
      renderHint={renderHint}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--rack"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <article
        className="rack-tile"
        aria-label={`${title} rack`}
        style={{
          "--pl": plastic.tint,
          "--pl-deep": plastic.deep,
          width: previewWidth ? `${previewWidth}px` : undefined,
        }}
        {...rackGesture}
      >
        <div className="rack-tile__stage" data-active={activeIndex >= 0 ? "true" : undefined}>
          <div className="rack-tile__cards">
            {childTiles.map((tile, index) => (
              <RackCard
                key={tile.id}
                rackId={card.id}
                tile={tile}
                index={index}
                count={slotCount}
                activeIndex={activeIndex >= 0 ? activeIndex : null}
                renderTilePreview={renderTilePreview}
                onActivate={activateCard}
                onDeactivate={deactivateCard}
                onBeginDrag={onBeginDrag}
                onPullFromRack={onPullFromRack}
              />
            ))}
            {isDropTarget ? (
              <div
                className="rack-tile__ghost"
                aria-hidden="true"
                style={{
                  "--rack-col": childTiles.length - ((slotCount - 1) / 2),
                  "--rack-lean": `${CARD_REST_POSES[childTiles.length % CARD_REST_POSES.length][0]}deg`,
                }}
              />
            ) : null}
          </div>

          <div className="rack-tile__sheet">
            <span className="rack-tile__pin rack-tile__pin--left" aria-hidden="true" />
            <RackName title={title} onCommit={commitName} />
            <span className="rack-tile__pin rack-tile__pin--right" aria-hidden="true" />
          </div>
        </div>
      </article>
    </TileShell>
  );
}

export default memo(RackTile);
