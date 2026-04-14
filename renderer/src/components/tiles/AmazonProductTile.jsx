import { memo, useEffect } from "react";
import { useToast } from "../../hooks/useToast";
import { useAppContext } from "../../context/useAppContext";
import { recordPreviewTierSelection } from "../../lib/perf";
import TileShell from "./TileShell";
import TileImageReveal from "./TileImageReveal";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { useTilePreviewSource } from "../../systems/canvas/useTilePreviewSource";

function stopTileActionEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function stopTileActionPointerEvent(event) {
  event.stopPropagation();
}

function formatRating(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number(value).toFixed(1);
}

function formatReviewCount(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return new Intl.NumberFormat().format(Math.max(0, Math.round(value)));
}

function getDomainLabel(card) {
  if (card.productDomain?.trim()) {
    return card.productDomain.trim();
  }

  try {
    return new URL(card.url).hostname.replace(/^www\./, "");
  } catch {
    return "amazon.com";
  }
}

function AmazonProductTile({
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
  renderHint,
}) {
  const { toast } = useToast();
  const { folderPath } = useAppContext();
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const title = card.title?.trim() || "Amazon product";
  const domainLabel = getDomainLabel(card);
  const rating = formatRating(card.productRating);
  const reviewCount = formatReviewCount(card.productReviewCount);
  const previewTier = renderHint?.previewTier ?? "original";
  const { src: previewSource } = useTilePreviewSource({
    card,
    folderPath,
    previewTier,
    imageEnabled: renderHint?.imageEnabled !== false,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  });

  const handleOpenLinkClick = async (event) => {
    stopTileActionEvent(event);

    try {
      await onOpenLink?.(card);
    } catch {
      toast("error", "Could not open product");
    }
  };

  useEffect(() => {
    recordPreviewTierSelection(card.id, previewTier);
  }, [card.id, previewTier]);

  return (
    <TileShell
      card={card}
      renderHint={renderHint}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--amazon-product"
      toolbar={renderHint?.showToolbar === false ? null : (
        <div className="card__toolbar" {...surfaceGesture}>
          <p className="card__label">{title}</p>
        </div>
      )}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className="card__surface-frame card__surface-frame--interactive" {...surfaceGesture}>
          <div className="card__surface card__surface--amazon-product" title={title}>
            <div className="card__amazon-product-media">
              {previewSource ? (
                <TileImageReveal
                  className="card__amazon-product-image"
                  src={previewSource}
                  alt={title}
                  enableReveal={renderHint?.disableImageReveal !== true}
                />
              ) : (
                <div className="card__amazon-product-placeholder">
                  <span>Amazon</span>
                </div>
              )}
            </div>

            <div className="card__amazon-product-body">
              <div className="card__amazon-product-meta">
                <span className="card__amazon-product-domain">{domainLabel}</span>
                {card.productAsin ? (
                  <span className="card__amazon-product-asin">ASIN {card.productAsin}</span>
                ) : null}
              </div>

              <h3 className="card__amazon-product-title">{title}</h3>

              {card.description && renderHint?.simplify !== true ? (
                <p className="card__amazon-product-description">{card.description}</p>
              ) : null}

              <div className="card__amazon-product-footer">
                <div className="card__amazon-product-signals">
                  {card.productPrice ? (
                    <span className="card__amazon-product-price">{card.productPrice}</span>
                  ) : null}
                  {rating ? (
                    <span className="card__amazon-product-rating">
                      {rating}
                      {reviewCount ? ` (${reviewCount})` : ""}
                    </span>
                  ) : null}
                </div>

                {renderHint?.showActions === false ? null : (
                  <button
                    className="card__amazon-product-cta"
                    type="button"
                    onPointerDown={stopTileActionPointerEvent}
                    onPointerUp={stopTileActionPointerEvent}
                    onClick={handleOpenLinkClick}
                  >
                    Open product
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(AmazonProductTile);
