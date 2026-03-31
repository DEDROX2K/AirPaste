import { memo, useEffect, useState } from "react";

function TileImageReveal({
  src,
  alt,
  className = "",
  enableReveal = true,
  onError,
  onLoad,
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [src]);

  function handleImageLoad(event) {
    setIsLoaded(true);
    onLoad?.(event);
  }

  function handleImageError(event) {
    onError?.(event);
  }

  if (!src) {
    return null;
  }

  return (
    <div className={`card__image-reveal${isLoaded ? " card__image-reveal--final" : " card__image-reveal--loading"}${enableReveal ? "" : " card__image-reveal--disabled"}`}>
      <div className="card__image-reveal__placeholder" aria-hidden="true" />
      <img
        className={`card__image-reveal__final ${className}`.trim()}
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
    </div>
  );
}

export default memo(TileImageReveal);
