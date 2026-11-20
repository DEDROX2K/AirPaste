import { Fragment, useEffect, useRef } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
import { X_BADGE_COLORS, splitXText } from "../../tiles/x/model";
import "./XTileParts.css";

export function stopTilePointer(event) {
  event.stopPropagation();
}

const X_LOGO_PATH = "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.96 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z";

export function XLogo({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={X_LOGO_PATH} />
    </svg>
  );
}

// 12-lobe rosette, built once.
const ROSETTE_PATH = (() => {
  const cx = 11;
  const cy = 11;
  const lobes = 12;
  const points = [];

  for (let index = 0; index < lobes * 2; index += 1) {
    const angle = (Math.PI * index) / lobes - Math.PI / 2;
    const radius = index % 2 ? 9.1 : 10.6;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }

  let path = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;

  for (let index = 1; index <= points.length; index += 2) {
    const control = points[index % points.length];
    const end = points[(index + 1) % points.length];
    path += ` Q${control[0].toFixed(2)} ${control[1].toFixed(2)} ${end[0].toFixed(2)} ${end[1].toFixed(2)}`;
  }

  return `${path}Z`;
})();

export function VerifiedBadge({ kind, className = "" }) {
  const color = X_BADGE_COLORS[kind];

  if (!color) {
    return null;
  }

  return (
    <svg className={`x-tile__badge ${className}`} viewBox="0 0 22 22" role="img" aria-label="Verified account">
      <path d={ROSETTE_PATH} fill={color} />
      <path d="M6.6 11.2l3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XAvatar({ src, initials, className }) {
  return (
    <span className={className} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <span>{initials}</span>}
    </span>
  );
}

// Post/bio text with @mentions, #tags and links coloured and clickable.
export function XRichText({ text, entities = null, className, onOpenUrl }) {
  const segments = splitXText(text, entities);

  if (!segments.length) {
    return null;
  }

  return (
    <div className={className}>
      {segments.map((segment, index) => (segment.href ? (
        <a
          key={index}
          href={segment.href}
          draggable={false}
          onPointerDown={stopTilePointer}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenUrl(segment.href);
          }}
        >
          {segment.text}
        </a>
      ) : (
        <Fragment key={index}>{segment.text}</Fragment>
      )))}
    </div>
  );
}

// Height is content-driven, but card.height is what selection, hit-testing
// and layout use, so write the rendered height back (same approach as the
// GitHub repo tile). offsetHeight is layout size, unaffected by zoom; a
// rack's static preview is drawn at another size and is skipped. Width is
// fixed at the standard tile width; cards saved wider (the first X tiles
// were 480) are put back.
export function useMeasuredTileHeight(surfaceRef, card, fallbackSize, isStaticPreview) {
  const fallbackHeight = fallbackSize.height;
  const { updateExistingCard } = useTileAppContext();
  const cardRef = useRef(card);
  cardRef.current = card;
  const measuredHeightRef = useRef(null);

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface || isStaticPreview || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const current = cardRef.current;
      const measuredHeight = Math.ceil(surface.offsetHeight);
      const currentHeight = Number.isFinite(current.height) ? current.height : fallbackHeight;
      measuredHeightRef.current = measuredHeight;

      if (measuredHeight > 0 && Math.abs(measuredHeight - currentHeight) > 1) {
        updateExistingCard(current.id, { height: measuredHeight });
      }
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [fallbackHeight, isStaticPreview, surfaceRef, updateExistingCard]);

  useEffect(() => {
    if (!isStaticPreview && Number.isFinite(card.width) && card.width !== fallbackSize.width) {
      updateExistingCard(card.id, { width: fallbackSize.width });
    }
  }, [card.id, card.width, fallbackSize.width, isStaticPreview, updateExistingCard]);

  useEffect(() => {
    const measuredHeight = measuredHeightRef.current;

    if (isStaticPreview || !measuredHeight || !Number.isFinite(card.height)) {
      return;
    }

    if (Math.abs(measuredHeight - card.height) > 1) {
      updateExistingCard(card.id, { height: measuredHeight });
    }
  }, [card.height, card.id, isStaticPreview, updateExistingCard]);
}

// Opens any URL through the app's existing open-link handler.
export function useOpenXUrl(card, onOpenLink, toast) {
  const cardRef = useRef(card);
  cardRef.current = card;

  return async (url) => {
    if (!url) {
      return;
    }

    try {
      await onOpenLink?.({ ...cardRef.current, url });
    } catch {
      toast("error", "Could not open link");
    }
  };
}

// Same Open / Copy bar the link tile shows when it is the one selected tile.
export function XQuickActions({ card, tileMeta, onOpen, toast }) {
  const show = tileMeta?.isSelected
    && tileMeta?.isMultiSelect !== true
    && !tileMeta?.isDragging
    && Boolean(card.url);

  if (!show) {
    return null;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.url);
      toast("success", "Link copied");
    } catch {
      toast("error", "Could not copy link");
    }
  };

  return (
    <div className="card__quick-actions" data-canvas-text-action-root="true" onPointerDown={stopTilePointer}>
      <button type="button" className="card__quick-action" onClick={() => void onOpen()}>Open</button>
      <button type="button" className="card__quick-action" onClick={() => void copy()}>Copy</button>
    </div>
  );
}
