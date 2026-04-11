import { memo, useEffect, useState } from "react";
import { formatCardSubtitle, LINK_CONTENT_KIND_IMAGE } from "../../lib/workspace";
import { useAppContext } from "../../context/useAppContext";
import { useToast } from "../../hooks/useToast";
import { desktop } from "../../lib/desktop";
import { recordImageSample } from "../../lib/perf";
import TileShell from "./TileShell";
import TileImageReveal from "./TileImageReveal";
import { useTileGesture } from "../../systems/interactions/useTileGesture";

function formatShortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function getCardLabel(card) {
  return card.title.trim() || formatCardSubtitle(card);
}

function resolveIconPath(relativePath) {
  return `${import.meta.env.BASE_URL}${relativePath}`;
}

function stopTileActionEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function stopTileActionPointerEvent(event) {
  event.stopPropagation();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(input);
  }
}

function LinkTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onOpenLink,
  onPressStart,
  onMediaLoad,
  onRetry,
}) {
  const { toast } = useToast();
  const { folderPath } = useAppContext();
  const [hasImageError, setHasImageError] = useState(false);
  const [hasLoadedImage, setHasLoadedImage] = useState(false);
  const [resolvedImageSrc, setResolvedImageSrc] = useState("");
  const isImageTile = card.contentKind === LINK_CONTENT_KIND_IMAGE;
  const isMusicCard = card.previewKind === "music" && Boolean(card.image);
  const mediaSrc = isImageTile ? (resolvedImageSrc || card.image) : card.image;
  const shouldRenderImage = Boolean(mediaSrc) && !hasImageError;
  const isPreviewLoading = !isImageTile && card.status === "loading" && !shouldRenderImage;
  const enableReveal = true;
  const label = getCardLabel(card);
  const linkTitle = card.title || formatShortUrl(card.url) || (isImageTile ? "Imported image" : "Untitled link");
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    isMusicCard ? "card__surface-frame--music" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const handleOpenLinkClick = async (event) => {
    stopTileActionEvent(event);

    try {
      await onOpenLink?.(card);
    } catch {
      toast("error", "Could not open link");
    }
  };
  const handleCopyLinkClick = async (event) => {
    stopTileActionEvent(event);

    try {
      await copyTextToClipboard(card.url);
      toast("success", "Link copied");
    } catch {
      toast("error", "Could not copy link");
    }
  };

  useEffect(() => {
    setHasImageError(false);
    setHasLoadedImage(false);
  }, [card.id, card.image, resolvedImageSrc]);

  useEffect(() => {
    let cancelled = false;

    async function resolveImageSource() {
      if (!isImageTile || !card.asset?.relativePath || !folderPath) {
        setResolvedImageSrc("");
        return;
      }

      try {
        const assetUrl = await desktop.workspace.resolveAssetUrl(folderPath, card.asset.relativePath);

        if (!cancelled) {
          setResolvedImageSrc(assetUrl || "");
        }
      } catch {
        if (!cancelled) {
          setResolvedImageSrc("");
        }
      }
    }

    void resolveImageSource();

    return () => {
      cancelled = true;
    };
  }, [card.asset?.relativePath, folderPath, isImageTile]);

  const handleMediaLoad = (event) => {
    setHasLoadedImage(true);

    const renderedWidth = event.currentTarget.clientWidth;
    const renderedHeight = event.currentTarget.clientHeight;
    const naturalWidth = event.currentTarget.naturalWidth;
    const naturalHeight = event.currentTarget.naturalHeight;
    const oversizeRatio = Math.max(
      naturalWidth / Math.max(1, renderedWidth || 1),
      naturalHeight / Math.max(1, renderedHeight || 1),
    );

    recordImageSample({
      cardId: card.id,
      cardType: card.type,
      naturalWidth,
      naturalHeight,
      renderedWidth,
      renderedHeight,
      oversizeRatio,
      src: mediaSrc,
    });

    onMediaLoad?.(card, naturalWidth, naturalHeight);
  };

  const mediaMarkup = (
    <>
      {isImageTile ? null : (
        <div className="card__link-actions" aria-label="Link actions">
          <button
            className="card__link-action"
            type="button"
            aria-label={`Copy link for ${linkTitle}`}
            onPointerDown={stopTileActionPointerEvent}
            onPointerUp={stopTileActionPointerEvent}
            onClick={handleCopyLinkClick}
          >
            <img
              src={resolveIconPath("icons/copylink.png")}
              alt=""
              className="card__link-action-icon"
            />
          </button>
          <button
            className="card__link-action card__link-action--primary"
            type="button"
            aria-label={`Open ${linkTitle}`}
            onPointerDown={stopTileActionPointerEvent}
            onPointerUp={stopTileActionPointerEvent}
            onClick={handleOpenLinkClick}
          >
            <img
              src={resolveIconPath("icons/openlink.png")}
              alt=""
              className="card__link-action-icon"
            />
          </button>
        </div>
      )}
      {isMusicCard && shouldRenderImage ? (
        <div className="card__record-shell">
          <div className="card__record-disc" aria-hidden="true" />
          <div className="card__record-sleeve">
            <TileImageReveal
              className="card__image card__image--music"
              src={mediaSrc}
              alt={linkTitle}
              enableReveal={enableReveal}
              onError={() => {
                if (!hasLoadedImage) {
                  setHasImageError(true);
                }
              }}
              onLoad={handleMediaLoad}
            />
          </div>
        </div>
      ) : shouldRenderImage ? (
        <TileImageReveal
          className="card__image"
          src={mediaSrc}
          alt={linkTitle}
          enableReveal={enableReveal}
          onError={() => {
            if (!hasLoadedImage) {
              setHasImageError(true);
            }
          }}
          onLoad={handleMediaLoad}
        />
      ) : isPreviewLoading ? (
        <div className="card__link-loading" aria-hidden="true">
          <div className="card__link-loading-ring card__link-loading-ring--outer" />
          <div className="card__link-loading-ring card__link-loading-ring--middle" />
          <div className="card__link-loading-ring card__link-loading-ring--inner" />
          <div className="card__link-loading-core" />
          <div className="card__link-loading-boom" />
          <div className="card__link-loading-sheen" />
          <p className="card__link-loading-label">Loading preview</p>
        </div>
      ) : (
        <div className="card__placeholder">
          <p className="card__placeholder-title">{linkTitle}</p>
          <p className="card__placeholder-subtitle">{isImageTile ? (card.asset?.fileName || "Imported image") : formatShortUrl(card.url)}</p>
        </div>
      )}
    </>
  );

  return (
    <TileShell
      card={card}
      tileMeta={{ ...tileMeta, isMusic: isMusicCard }}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className={isMusicCard ? "card--music" : ""}
      toolbar={(
        <div className="card__toolbar" {...surfaceGesture}>
          <p className="card__label">{label}</p>
        </div>
      )}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          {isImageTile ? (
            <div
              className={`card__surface card__surface--link${isMusicCard ? " card__surface--music" : ""}`}
              title={linkTitle}
              aria-label={linkTitle}
            >
              {mediaMarkup}
            </div>
          ) : (
            <a
              className={`card__surface card__surface--link${isMusicCard ? " card__surface--music" : ""}`}
              href={card.url}
              target="_blank"
              rel="noreferrer"
              title={linkTitle}
              aria-label={`Open ${linkTitle}`}
              draggable={false}
              onClick={(event) => event.preventDefault()}
            >
              {mediaMarkup}
            </a>
          )}
        </div>

        {!isImageTile && card.status === "failed" ? (
          <button
            className="card__retry"
            type="button"
            onClick={() => onRetry(card)}
          >
            Retry preview
          </button>
        ) : null}
      </div>
    </TileShell>
  );
}

export default memo(LinkTile);
