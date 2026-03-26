import { memo, useEffect, useRef, useState } from "react";

const FINAL_REVEAL_DELAY_MS = 140;

function TileImageReveal({
  src,
  alt,
  className = "",
  enableReveal = true,
  onError,
  onLoad,
}) {
  const finalRevealTimeoutRef = useRef(null);
  const [phase, setPhase] = useState(src ? "loading" : "idle");

  useEffect(() => {
    window.clearTimeout(finalRevealTimeoutRef.current);
    finalRevealTimeoutRef.current = null;
    setPhase(src ? "loading" : "idle");

    return () => {
      window.clearTimeout(finalRevealTimeoutRef.current);
      finalRevealTimeoutRef.current = null;
    };
  }, [src]);

  function handlePreviewLoad() {
    setPhase((currentPhase) => (currentPhase === "final" ? currentPhase : "preview"));
  }

  function handleFinalLoad(event) {
    onLoad?.(event);

    if (!enableReveal) {
      setPhase("final");
      return;
    }

    setPhase((currentPhase) => (currentPhase === "loading" ? "preview" : currentPhase));
    window.clearTimeout(finalRevealTimeoutRef.current);
    finalRevealTimeoutRef.current = window.setTimeout(() => {
      setPhase("final");
    }, FINAL_REVEAL_DELAY_MS);
  }

  function handleImageError(event) {
    window.clearTimeout(finalRevealTimeoutRef.current);
    finalRevealTimeoutRef.current = null;
    setPhase("error");
    onError?.(event);
  }

  if (!src) {
    return null;
  }

  return (
    <div className={`card__image-reveal card__image-reveal--${phase}${enableReveal ? "" : " card__image-reveal--disabled"}`}>
      <div className="card__image-reveal__placeholder" aria-hidden="true" />
      <img
        className={`card__image-reveal__preview ${className}`.trim()}
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        onLoad={handlePreviewLoad}
        onError={handleImageError}
      />
      <div className="card__image-reveal__pixel-grid" aria-hidden="true" />
      <img
        className={`card__image-reveal__final ${className}`.trim()}
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        onLoad={handleFinalLoad}
        onError={handleImageError}
      />
    </div>
  );
}

export default memo(TileImageReveal);
