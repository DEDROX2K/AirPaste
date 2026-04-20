import { memo, useEffect, useState } from "react";

const loadedImageSources = new Set();

function TileImageReveal({
  src,
  alt,
  className = "",
  enableReveal = true,
  onError,
  onLoad,
}) {
  const [isLoaded, setIsLoaded] = useState(() => loadedImageSources.has(src));

  useEffect(() => {
    setIsLoaded(loadedImageSources.has(src));
  }, [src]);

  function handleImageLoad(event) {
    if (src) {
      loadedImageSources.add(src);
    }

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
        loading="lazy"
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
    </div>
  );
}

export default memo(TileImageReveal);
