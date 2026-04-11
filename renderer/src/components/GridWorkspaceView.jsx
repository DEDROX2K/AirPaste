import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import { useToast } from "../hooks/useToast";
import { LINK_CONTENT_KIND_IMAGE, formatCardSubtitle } from "../lib/workspace";
import { desktop } from "../lib/desktop";
import { loadedImageSources } from "./tiles/TileImageReveal";
import { AppEmptyState } from "./ui/app";
import { filterTiles } from "../utils/searchTiles";

// ── Constants ──────────────────────────────────────────────────────────────────

const COLUMN_WIDTH_MIN = 200;
const COLUMN_WIDTH_MAX = 320;
const COLUMN_GAP = 18;
const ITEM_GAP = 24;
const PADDING = 20;

// ── Masonry layout engine ──────────────────────────────────────────────────────

function computeMasonryLayout(tiles, columnCount, containerWidth) {
  if (columnCount <= 0 || containerWidth <= 0) return { positions: {}, totalHeight: 0 };

  const usableWidth = containerWidth - PADDING * 2;
  const colWidth = Math.floor((usableWidth - COLUMN_GAP * (columnCount - 1)) / columnCount);
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  const positions = {};

  for (const tile of tiles) {
    const col = columnHeights.indexOf(Math.min(...columnHeights));
    const x = PADDING + col * (colWidth + COLUMN_GAP);
    const y = columnHeights[col] === 0 ? 0 : columnHeights[col] + ITEM_GAP;
    positions[tile.id] = { x, y, width: colWidth };
    columnHeights[col] = y + (positions[tile.id].measuredHeight ?? 180);
  }

  const totalHeight = Math.max(...columnHeights) + PADDING;
  return { positions, totalHeight, colWidth };
}

function getColumnCount(containerWidth) {
  if (containerWidth <= 0) return 1;
  const raw = Math.floor((containerWidth - PADDING * 2 + COLUMN_GAP) / (COLUMN_WIDTH_MIN + COLUMN_GAP));
  const max = Math.floor((containerWidth - PADDING * 2 + COLUMN_GAP) / (COLUMN_WIDTH_MAX + COLUMN_GAP));
  return Math.max(1, Math.min(raw, Math.max(1, max)));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ── Grid cards ─────────────────────────────────────────────────────────────────
// Each card component returns a React fragment:
//   <article class="grid-card">  (the bordered tile)
//   <p class="grid-item__label"> (text below, on background)

function GridLinkCard({ card, isSelected, onSelect, onOpenLink }) {
  const { folderPath } = useAppContext();
  const { toast } = useToast();
  const isImageTile = card.contentKind === LINK_CONTENT_KIND_IMAGE;
  const [resolvedImageSrc, setResolvedImageSrc] = useState("");
  const [hasImageError, setHasImageError] = useState(false);
  // Initialise as already-loaded if TileImageReveal saw this src before
  const [imgLoaded, setImgLoaded] = useState(() => Boolean(card.image && loadedImageSources.has(card.image)));
  const imgRef = useRef(null);

  const mediaSrc = isImageTile ? resolvedImageSrc : card.image;
  const shouldRenderImage = Boolean(mediaSrc) && !hasImageError;
  const domain = formatDomain(card.url || "");
  const linkTitle = card.title || domain || (isImageTile ? "Imported image" : "Untitled link");

  // Reset on src change
  useEffect(() => {
    const alreadyKnown = Boolean(mediaSrc && loadedImageSources.has(mediaSrc));
    setHasImageError(false);
    setImgLoaded(alreadyKnown);
  }, [card.id, mediaSrc]);

  // Catch already-complete images (browser cache — onLoad won't fire again)
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || imgLoaded) return;
    if (img.complete && img.naturalWidth > 0) {
      if (mediaSrc) loadedImageSources.add(mediaSrc);
      setImgLoaded(true);
    }
  });

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!isImageTile || !card.asset?.relativePath || !folderPath) {
        setResolvedImageSrc("");
        return;
      }
      try {
        const url = await desktop.workspace.resolveAssetUrl(folderPath, card.asset.relativePath);
        if (!cancelled) setResolvedImageSrc(url || "");
      } catch {
        if (!cancelled) setResolvedImageSrc("");
      }
    }
    void resolve();
    return () => { cancelled = true; };
  }, [card.asset?.relativePath, folderPath, isImageTile]);

  const handleClick = useCallback(async (event) => {
    event.stopPropagation();
    onSelect?.(card.id, event);
    if (!isImageTile && card.url) {
      try { await onOpenLink?.(card); } catch { toast("error", "Could not open link"); }
    }
  }, [card, isImageTile, onOpenLink, onSelect, toast]);

  return (
    <>
      <article
        className={[
          "grid-card",
          "grid-card--link",
          isSelected ? "grid-card--selected" : "",
        ].filter(Boolean).join(" ")}
        onClick={handleClick}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void handleClick(e); } }}
        role="button"
        aria-pressed={isSelected}
        aria-label={linkTitle}
      >
        {/* Full-bleed image — sizes the card naturally */}
        {shouldRenderImage ? (
          <div className={`grid-card__media${imgLoaded ? " grid-card__media--loaded" : ""}`}>
            <img
              ref={imgRef}
              className="grid-card__image"
              src={mediaSrc}
              alt={linkTitle}
              draggable={false}
              decoding="async"
              onLoad={() => { if (mediaSrc) loadedImageSources.add(mediaSrc); setImgLoaded(true); }}
              onError={() => { if (!imgLoaded) setHasImageError(true); }}
            />
          </div>
        ) : (
          <div className="grid-card__placeholder">
            <span className="grid-card__placeholder-domain">{domain || linkTitle}</span>
          </div>
        )}

        {/* Hover URL pill — appears at top of tile on hover */}
        {domain && (
          <div className="grid-card__url-pill" aria-hidden="true">
            <span className="grid-card__url-pill-text">{linkTitle !== domain ? linkTitle : domain}</span>
          </div>
        )}

        {isSelected && <div className="grid-card__selection-ring" aria-hidden />}
      </article>

      {/* Label sits below the card border, on the background */}
      <p className="grid-item__label" title={linkTitle}>{linkTitle}</p>
    </>
  );
}

function GridFolderCard({ card, isSelected, onSelect }) {
  const count = card.childIds?.length ?? 0;
  const handleClick = useCallback((event) => {
    event.stopPropagation();
    onSelect?.(card.id, event);
  }, [card.id, onSelect]);

  return (
    <>
      <article
        className={["grid-card", "grid-card--folder", isSelected ? "grid-card--selected" : ""].filter(Boolean).join(" ")}
        onClick={handleClick}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(e); } }}
        role="button"
        aria-pressed={isSelected}
        aria-label={card.title || "Folder"}
      >
        <div className="grid-card__folder-preview" aria-hidden>
          <div className="grid-card__folder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
        </div>
        {isSelected && <div className="grid-card__selection-ring" aria-hidden />}
      </article>

      <p className="grid-item__label" title={card.title || "Folder"}>
        {card.title || "Folder"}
        {count > 0 && <span className="grid-item__label-meta"> · {count}</span>}
      </p>
    </>
  );
}

function GridRackCard({ card, isSelected, onSelect }) {
  const count = card.tileIds?.length ?? 0;
  const handleClick = useCallback((event) => {
    event.stopPropagation();
    onSelect?.(card.id, event);
  }, [card.id, onSelect]);

  return (
    <>
      <article
        className={["grid-card", "grid-card--rack", isSelected ? "grid-card--selected" : ""].filter(Boolean).join(" ")}
        onClick={handleClick}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(e); } }}
        role="button"
        aria-pressed={isSelected}
        aria-label={card.title || "Rack"}
      >
        <div className="grid-card__rack-preview" aria-hidden>
          <div className="grid-card__rack-slots">
            {Array.from({ length: Math.max(3, count) }).map((_, i) => (
              <span key={i} className={`grid-card__rack-slot ${i < count ? "grid-card__rack-slot--filled" : ""}`} />
            ))}
          </div>
        </div>
        {isSelected && <div className="grid-card__selection-ring" aria-hidden />}
      </article>

      <p className="grid-item__label" title={card.title || "Rack"}>
        {card.title || "Rack"}
        {count > 0 && <span className="grid-item__label-meta"> · {count} tiles</span>}
      </p>
    </>
  );
}

const GridCard = memo(function GridCard({ card, isSelected, onSelect, onOpenLink }) {
  if (card.type === "folder") return <GridFolderCard card={card} isSelected={isSelected} onSelect={onSelect} />;
  if (card.type === "rack") return <GridRackCard card={card} isSelected={isSelected} onSelect={onSelect} />;
  return <GridLinkCard card={card} isSelected={isSelected} onSelect={onSelect} onOpenLink={onOpenLink} />;
});

// ── Masonry container ──────────────────────────────────────────────────────────

function MasonryGrid({ tiles, selectedIds, onSelect, onOpenLink }) {
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState({});
  const [ready, setReady] = useState(false);
  const rafRef = useRef(null);

  // Observe container width
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const columnCount = useMemo(() => getColumnCount(containerWidth), [containerWidth]);

  // Measure item heights after each render
  const measureItems = useCallback(() => {
    const next = {};
    let changed = false;
    for (const [id, el] of Object.entries(itemRefs.current)) {
      if (!el) continue;
      const h = el.offsetHeight;
      next[id] = h;
      if (measuredHeights[id] !== h) changed = true;
    }
    if (changed || Object.keys(next).length !== Object.keys(measuredHeights).length) {
      setMeasuredHeights(next);
    }
    setReady(true);
  }, [measuredHeights]);

  useLayoutEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      measureItems();
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [tiles, columnCount, measureItems]);

  // Compute layout
  const { positions, totalHeight, colWidth } = useMemo(() => {
    const tilesWithHeights = tiles.map((t) => ({
      ...t,
      measuredHeight: measuredHeights[t.id] ?? 180,
    }));

    const result = computeMasonryLayout(tilesWithHeights, columnCount, containerWidth);

    for (const tile of tilesWithHeights) {
      if (result.positions[tile.id]) {
        result.positions[tile.id].measuredHeight = tile.measuredHeight;
      }
    }

    return result;
  }, [tiles, measuredHeights, columnCount, containerWidth]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div
      ref={containerRef}
      className={`masonry-grid ${ready ? "masonry-grid--ready" : ""}`}
      style={{ minHeight: totalHeight || "auto" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null, e);
      }}
    >
      {tiles.map((tile) => {
        const pos = positions[tile.id];
        const style = pos
          ? {
            position: "absolute",
            left: pos.x,
            top: pos.y,
            width: pos.width ?? colWidth,
            opacity: ready ? 1 : 0,
          }
          : { opacity: 0 };

        return (
          <div
            key={tile.id}
            ref={(el) => {
              if (el) itemRefs.current[tile.id] = el;
              else delete itemRefs.current[tile.id];
            }}
            className="masonry-grid__item"
            style={style}
          >
            <GridCard
              card={tile}
              isSelected={selectedIdSet.has(tile.id)}
              onSelect={onSelect}
              onOpenLink={onOpenLink}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── GridWorkspaceView ──────────────────────────────────────────────────────────

export default function GridWorkspaceView({ openTileLink }) {
  const { workspace, folderPath, folderLoading } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setSelectedIds([]);
    setSearchQuery("");
  }, [workspace?.cards]);

  const filteredTiles = useMemo(
    () => filterTiles(workspace.cards ?? [], searchQuery.trim()),
    [workspace.cards, searchQuery],
  );

  const handleSelect = useCallback((cardId, event) => {
    if (!cardId) { setSelectedIds([]); return; }
    if (event?.metaKey || event?.ctrlKey) {
      setSelectedIds((prev) =>
        prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
      );
    } else {
      setSelectedIds((prev) => (prev.length === 1 && prev[0] === cardId ? [] : [cardId]));
    }
  }, []);

  const hasActiveSearch = searchQuery.trim().length > 0;
  const totalCount = workspace.cards?.length ?? 0;

  if (!folderPath && !folderLoading) {
    return (
      <div className="grid-workspace">
        <AppEmptyState
          title="No workspace open"
          description="Open a local folder to start saving links and media."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid-workspace">
      {/* Search bar */}
      <header className="grid-workspace__header">
        <div className="grid-workspace__search">
          <svg className="grid-workspace__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={searchInputRef}
            className="grid-workspace__search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tiles…"
            aria-label="Search tiles"
          />
          {searchQuery && (
            <button
              className="grid-workspace__search-clear"
              type="button"
              aria-label="Clear search"
              onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
            >
              ×
            </button>
          )}
        </div>

        {totalCount > 0 && (
          <p className="grid-workspace__count">
            {hasActiveSearch
              ? `${filteredTiles.length} of ${totalCount}`
              : `${totalCount} ${totalCount === 1 ? "tile" : "tiles"}`}
          </p>
        )}
      </header>

      {/* Grid */}
      <div className="grid-workspace__scroll">
        {totalCount === 0 ? (
          <AppEmptyState
            title="Canvas is empty"
            description="Use the Add button to create a folder or rack. Paste a URL or image to import directly."
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            }
          />
        ) : hasActiveSearch && filteredTiles.length === 0 ? (
          <AppEmptyState
            title={`No results for "${searchQuery.trim()}"`}
            description="Try a title, URL, or tile type."
            actionLabel="Clear Search"
            onAction={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            }
          />
        ) : (
          <MasonryGrid
            tiles={filteredTiles}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onOpenLink={openTileLink}
          />
        )}
      </div>
    </div>
  );
}
