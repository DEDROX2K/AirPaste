import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useTileAppContext } from "../../context/TileAppContext";
import { recordPreviewTierSelection } from "../../lib/perf";
import { pickLoadingGif } from "../../lib/loadingGif";
import { PRODUCT_TILE_DESIGN_SIZE } from "../../tiles/link/model";
import { formatProductPrice, formatProductSource } from "../../tiles/link/product";
import TileShell from "./TileShell";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { useTilePreviewSource } from "../../systems/canvas/useTilePreviewSource";
import "./AmazonProductTile.css";

// The product tile (type "amazon-product", kept so saved tiles still load):
// any shop link whose page has a product -- Amazon, eBay, or a page with
// structured product data (preview/product.js). One fixed shape, drawn at
// 470 x 625 and scaled to the tile's width (--product-k):
//   - the name in the top lobe; a long one fades at the right edge and
//     rolls left on hover
//   - the product photo in the window (cropped to fill; #FD5B60 when empty)
//   - the price in the bottom tab, shrunk to fit
//   - the shop in the pill below
// All of it shows at every zoom level.
// Nothing inside is a control: the whole tile drags. Double-click (or
// right-click -> Open) opens the product.

const ROLL_SPEED = 70; // design px per second
const PRICE_BOX_WIDTH = 300;
const PRICE_MAX_SIZE = 56;
const PRICE_MIN_SIZE = 28;
const FRAME_PATH = "M389.202 31.1206C389.202 48.308 403.135 62.2412 420.323 62.2412H435.103C453.88 62.2413 469.103 77.4636 469.103 96.2412V497.344C469.103 516.121 453.88 531.344 435.103 531.344H423.993C412.763 531.344 403.66 540.447 403.66 551.676C403.66 562.906 394.557 572.009 383.328 572.009H381.417C369.132 572.009 359.174 581.967 359.174 594.252V598.381C359.174 612.947 347.366 624.754 332.801 624.754H136.301C121.736 624.754 109.929 612.947 109.929 598.381V594.252C109.929 581.967 99.9701 572.009 87.6855 572.009H85.7749C74.5456 572.009 65.4424 562.906 65.4424 551.676C65.4424 540.447 56.3392 531.344 45.1099 531.344H34C15.2223 531.344 0 516.121 0 497.344V96.2412C0 77.4637 15.2216 62.2415 33.999 62.2412H48.7798C65.9672 62.2412 79.9004 48.308 79.9004 31.1206C79.9004 13.9332 93.8336 0 111.021 0H358.082C375.269 0 389.202 13.9332 389.202 31.1206ZM40.6904 92.2061C33.5107 92.2061 27.6904 98.0264 27.6904 105.206V488.379C27.6904 495.559 33.5107 501.379 40.6904 501.379H48.0122C57.6386 501.379 65.4424 493.575 65.4424 483.949C65.4424 474.322 73.2461 466.519 82.8726 466.519H386.23C395.856 466.519 403.66 474.322 403.66 483.949C403.66 493.575 411.464 501.379 421.09 501.379H428.412C435.592 501.379 441.412 495.559 441.412 488.379V105.206C441.412 98.0264 435.592 92.2062 428.412 92.2061H40.6904Z";

// The frame's outside edge only (its first subpath), for the hover and
// selection ring.
const FRAME_OUTLINE_PATH = `${FRAME_PATH.slice(0, FRAME_PATH.indexOf("Z") + 1)}`;

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

async function openProductLink({ card, onOpenLink, toast }) {
  try {
    await onOpenLink?.(card);
  } catch {
    toast("error", "Could not open product");
  }
}

function AmazonProductTile({
  card,
  tileMeta,
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
  const { folderPath } = useTileAppContext();
  const [loadingGif] = useState(pickLoadingGif);
  const [hasImageError, setHasImageError] = useState(false);
  const nameBoxRef = useRef(null);
  const nameTextRef = useRef(null);
  const priceRef = useRef(null);
  // How far a long name overflows its box, in design px (0 = fits).
  const [nameOverflow, setNameOverflow] = useState(0);
  const [priceSize, setPriceSize] = useState(PRICE_MAX_SIZE);
  const hasLinkUrl = typeof card.url === "string" && card.url.trim().length > 0;
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
    onDoubleActivate: async () => {
      await openProductLink({ card, onOpenLink, toast });
    },
  });
  const k = (Number.isFinite(card.width) && card.width > 0 ? card.width : 340) / PRODUCT_TILE_DESIGN_SIZE.width;
  const name = card.title?.trim() || "Untitled product";
  const price = formatProductPrice(card.productPrice);
  const source = formatProductSource(card.productDomain, card.url);
  const previewTier = renderHint?.previewTier ?? "original";
  const { src: previewSource } = useTilePreviewSource({
    card,
    folderPath,
    previewTier,
    imageEnabled: renderHint?.imageEnabled !== false,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  });
  const isLoading = card.status === "loading" && !previewSource;
  const isStatic = renderHint?.isStaticPreview === true || renderHint?.simplify === true;
  const isRolling = nameOverflow > 0 && !isStatic
    && tileMeta?.isHovered === true && tileMeta?.isDragging !== true;

  useEffect(() => {
    recordPreviewTierSelection(card.id, previewTier);
  }, [card.id, previewTier]);

  useEffect(() => {
    setHasImageError(false);
  }, [previewSource]);

  // Measured in layout px (unaffected by canvas zoom), kept in design px.
  useLayoutEffect(() => {
    const box = nameBoxRef.current;
    const text = nameTextRef.current;

    if (!box || !text) {
      return;
    }

    const over = Math.max(0, text.scrollWidth - box.clientWidth) / k;
    setNameOverflow(over > 0.5 ? over : 0);
  }, [name, k]);

  // The price shrinks in 2px steps until it fits its tab.
  useLayoutEffect(() => {
    const element = priceRef.current;

    if (!element) {
      return;
    }

    let size = PRICE_MAX_SIZE;
    element.style.setProperty("--product-price-size", String(size));

    while (element.scrollWidth > PRICE_BOX_WIDTH * k + 0.5 && size > PRICE_MIN_SIZE) {
      size -= 2;
      element.style.setProperty("--product-price-size", String(size));
    }

    setPriceSize(size);
  }, [price, k]);

  const handleCopyLinkClick = async () => {
    try {
      await copyTextToClipboard(card.url);
      toast("success", "Link copied");
    } catch {
      toast("error", "Could not copy link");
    }
  };

  // One selected tile with a link only (see LinkTile's action row).
  const actionStrip = tileMeta?.isSelected && tileMeta?.isMultiSelect !== true && !tileMeta?.isDragging && hasLinkUrl ? (
    <div className="card__quick-actions" data-canvas-text-action-root="true" onPointerDown={stopTileActionPointerEvent}>
      <button
        type="button"
        className="card__quick-action"
        onClick={() => void openProductLink({ card, onOpenLink, toast })}
      >
        Open
      </button>
      <button type="button" className="card__quick-action" onClick={() => void handleCopyLinkClick()}>
        Copy
      </button>
    </div>
  ) : null;
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const showImage = Boolean(previewSource) && !hasImageError;

  return (
    <TileShell
      card={card}
      renderHint={renderHint}
      tileMeta={tileMeta}
      className="card--amazon-product"
      actionStrip={actionStrip}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <div
            className="product-tile"
            title={name}
            aria-label={[name, price, source].filter(Boolean).join(", ")}
            style={{
              "--product-k": k,
              "--product-roll": `${nameOverflow}`,
              "--product-roll-duration": `${Math.max(0.4, nameOverflow / ROLL_SPEED)}s`,
              "--product-price-size": `${priceSize}`,
            }}
          >
            <div className={`product-tile__shot${showImage ? " product-tile__shot--filled" : ""}`}>
              {showImage ? (
                <img
                  src={previewSource}
                  alt=""
                  draggable={false}
                  decoding="async"
                  onError={() => setHasImageError(true)}
                />
              ) : isLoading ? (
                <div className="product-tile__loading" data-loading-gif={loadingGif} aria-hidden="true" />
              ) : null}
            </div>

            {/* A ring a little outside the shape: a wide stroke of the
                outline, minus a narrower one and the shape itself. */}
            <svg className="product-tile__ring" viewBox="0 0 470 625" aria-hidden="true">
              <defs>
                <mask id={`product-ring-${card.id}`} maskUnits="userSpaceOnUse" x="-60" y="-60" width="590" height="745">
                  <path className="product-tile__ring-outer" d={FRAME_OUTLINE_PATH} />
                  <path className="product-tile__ring-inner" d={FRAME_OUTLINE_PATH} />
                </mask>
              </defs>
              <rect x="-60" y="-60" width="590" height="745" mask={`url(#product-ring-${card.id})`} />
            </svg>

            <svg className="product-tile__frame" viewBox="0 0 470 625" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d={FRAME_PATH} />
            </svg>

            <div
              ref={nameBoxRef}
              className={[
                "product-tile__name",
                nameOverflow > 0 ? "product-tile__name--cut" : "",
                isRolling ? "product-tile__name--roll" : "",
              ].filter(Boolean).join(" ")}
            >
              <span ref={nameTextRef}>{name}</span>
            </div>

            <div ref={priceRef} className={`product-tile__price${price ? "" : " product-tile__price--none"}`}>
              {price || "No price"}
            </div>

            <div className="product-tile__source">{source}</div>
          </div>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(AmazonProductTile);

