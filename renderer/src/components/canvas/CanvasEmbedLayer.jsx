import { useEffect, useMemo, useRef, useState } from "react";

const MAX_ACTIVE_EMBEDS = 2;
const MIN_EMBED_ZOOM = 0.72;
const MIN_SCREEN_SIZE = 180;

function parseCssPixel(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function getTileWorldBounds(card, tileMeta) {
  const styleVars = tileMeta?.styleVars ?? {};
  const width = Number.isFinite(tileMeta?.renderWidth) ? tileMeta.renderWidth : Math.max(1, card?.width ?? 1);
  const height = Number.isFinite(tileMeta?.renderHeight) ? tileMeta.renderHeight : Math.max(1, card?.height ?? 1);
  const x = parseCssPixel(styleVars["--tile-x"], Number.isFinite(card?.x) ? card.x : 0);
  const y = parseCssPixel(styleVars["--tile-y"], Number.isFinite(card?.y) ? card.y : 0);

  return {
    x,
    y,
    width,
    height,
  };
}

function isLiveEmbedCard(card) {
  return Boolean(
    card
    && typeof card.url === "string"
    && card.url.trim().length > 0
    && card?.airpaste?.embed?.mode === "live",
  );
}

function intersectsViewport(bounds, viewport, width, height) {
  const left = viewport.x + (bounds.x * viewport.zoom);
  const top = viewport.y + (bounds.y * viewport.zoom);
  const right = left + (bounds.width * viewport.zoom);
  const bottom = top + (bounds.height * viewport.zoom);

  return !(
    right < 0
    || bottom < 0
    || left > width
    || top > height
  );
}

function EmbedSurface({ entry, useWebview }) {
  const elementRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setStatus("loading");
    setErrorMessage("");
  }, [entry.card.id, entry.card.url]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !useWebview) {
      return undefined;
    }

    element.setAttribute("allowpopups", "false");
    element.setAttribute("partition", `persist:airpaste-canvas-${entry.card.id}`);

    const handleStart = () => {
      setStatus("loading");
      setErrorMessage("");
    };
    const handleStop = () => {
      setStatus("live");
    };
    const handleFail = (event) => {
      setStatus("placeholder");
      setErrorMessage(event?.errorDescription || "This site could not be embedded.");
    };

    element.addEventListener("did-start-loading", handleStart);
    element.addEventListener("did-stop-loading", handleStop);
    element.addEventListener("did-fail-load", handleFail);

    return () => {
      element.removeEventListener("did-start-loading", handleStart);
      element.removeEventListener("did-stop-loading", handleStop);
      element.removeEventListener("did-fail-load", handleFail);
    };
  }, [entry.card.id, useWebview]);

  return (
    <div
      className={`canvas-embed-layer__surface canvas-embed-layer__surface--${status}`}
      style={{
        position: "absolute",
        overflow: "hidden",
        borderRadius: "18px",
        border: "1px solid rgba(126, 112, 94, 0.28)",
        background: "rgba(255, 250, 242, 0.98)",
        boxShadow: "0 18px 48px rgba(75, 56, 36, 0.18)",
        pointerEvents: "auto",
        ...entry.style,
      }}
    >
      <div className="canvas-embed-layer__viewport" style={{ position: "relative", height: "100%", background: "#f7f2eb" }}>
        {useWebview ? (
          <webview
            ref={elementRef}
            className="canvas-embed-layer__webview"
            src={entry.card.url}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <iframe
            ref={elementRef}
            className="canvas-embed-layer__frame"
            src={entry.card.url}
            title={entry.card.title || entry.card.siteName || "Embedded page"}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => setStatus("live")}
            onError={() => {
              setStatus("placeholder");
              setErrorMessage("This site could not be embedded.");
            }}
            style={{ width: "100%", height: "100%", border: "0" }}
          />
        )}
        {status !== "live" ? (
          <div
            className="canvas-embed-layer__placeholder"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
              padding: "20px",
              textAlign: "center",
              background: "rgba(247, 242, 235, 0.92)",
              color: "#6d5b49",
            }}
          >
            <strong>{status === "loading" ? "Loading embed" : "Embed unavailable"}</strong>
            <span style={{ fontSize: "12px", lineHeight: 1.4 }}>{errorMessage || "Interactive content is suspended until the card is active and stable."}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function CanvasEmbedLayer({
  cards,
  tileMetaById,
  viewport,
  canvasSize,
  isCanvasMoving,
}) {
  const useWebview = typeof window !== "undefined" && window.location?.protocol === "file:";
  const activeEntries = useMemo(() => {
    if (!Array.isArray(cards) || !canvasSize) {
      return [];
    }

    const width = Math.max(1, canvasSize.width ?? 0);
    const height = Math.max(1, canvasSize.height ?? 0);

    return cards
      .filter((card) => isLiveEmbedCard(card))
      .map((card) => {
        const bounds = getTileWorldBounds(card, tileMetaById?.[card.id]);
        const screenLeft = viewport.x + (bounds.x * viewport.zoom);
        const screenTop = viewport.y + (bounds.y * viewport.zoom);
        const screenWidth = bounds.width * viewport.zoom;
        const screenHeight = bounds.height * viewport.zoom;
        const distanceScore = Math.abs((screenLeft + (screenWidth / 2)) - (width / 2))
          + Math.abs((screenTop + (screenHeight / 2)) - (height / 2));

        return {
          card,
          distanceScore,
          visible: intersectsViewport(bounds, viewport, width, height),
          screenWidth,
          screenHeight,
          style: {
            left: `${screenLeft}px`,
            top: `${screenTop}px`,
            width: `${screenWidth}px`,
            height: `${screenHeight}px`,
          },
        };
      })
      .filter((entry) => (
        entry.visible
        && entry.screenWidth >= MIN_SCREEN_SIZE
        && entry.screenHeight >= MIN_SCREEN_SIZE
        && viewport.zoom >= MIN_EMBED_ZOOM
        && !isCanvasMoving
      ))
      .sort((left, right) => left.distanceScore - right.distanceScore)
      .slice(0, MAX_ACTIVE_EMBEDS);
  }, [canvasSize, cards, isCanvasMoving, tileMetaById, viewport]);

  if (!activeEntries.length) {
    return null;
  }

  return (
    <div
      className="canvas-embed-layer"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 6,
      }}
    >
      {activeEntries.map((entry) => (
        <EmbedSurface key={entry.card.id} entry={entry} useWebview={useWebview} />
      ))}
    </div>
  );
}
