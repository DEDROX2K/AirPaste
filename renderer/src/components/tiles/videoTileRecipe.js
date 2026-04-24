const VIDEO_SOURCE_TYPE = Object.freeze({
  YOUTUBE: "youtube",
  YOUTUBE_SHORTS: "youtube-shorts",
  VIMEO: "vimeo",
  X: "x",
  GENERIC: "video-generic",
});

const VIDEO_DEFAULT_ASPECT_RATIO = Object.freeze({
  [VIDEO_SOURCE_TYPE.YOUTUBE]: 16 / 9,
  [VIDEO_SOURCE_TYPE.YOUTUBE_SHORTS]: 9 / 16,
  [VIDEO_SOURCE_TYPE.VIMEO]: 16 / 9,
  [VIDEO_SOURCE_TYPE.X]: 16 / 9,
  [VIDEO_SOURCE_TYPE.GENERIC]: 16 / 9,
});

export function normalizeVideoSourceType(value) {
  if (value === VIDEO_SOURCE_TYPE.YOUTUBE) {
    return VIDEO_SOURCE_TYPE.YOUTUBE;
  }

  if (value === VIDEO_SOURCE_TYPE.YOUTUBE_SHORTS) {
    return VIDEO_SOURCE_TYPE.YOUTUBE_SHORTS;
  }

  if (value === VIDEO_SOURCE_TYPE.VIMEO) {
    return VIDEO_SOURCE_TYPE.VIMEO;
  }

  if (value === VIDEO_SOURCE_TYPE.X) {
    return VIDEO_SOURCE_TYPE.X;
  }

  return VIDEO_SOURCE_TYPE.GENERIC;
}

export function getVideoTileRecipe(sourceType) {
  const normalizedSourceType = normalizeVideoSourceType(sourceType);

  if (normalizedSourceType === VIDEO_SOURCE_TYPE.YOUTUBE_SHORTS) {
    return {
      key: "youtube-shorts",
      badge: "YouTube Shorts",
      defaultAspectRatio: VIDEO_DEFAULT_ASPECT_RATIO[VIDEO_SOURCE_TYPE.YOUTUBE_SHORTS],
    };
  }

  if (normalizedSourceType === VIDEO_SOURCE_TYPE.YOUTUBE) {
    return {
      key: "youtube",
      badge: "YouTube",
      defaultAspectRatio: VIDEO_DEFAULT_ASPECT_RATIO[VIDEO_SOURCE_TYPE.YOUTUBE],
    };
  }

  if (normalizedSourceType === VIDEO_SOURCE_TYPE.VIMEO) {
    return {
      key: "vimeo",
      badge: "Vimeo",
      defaultAspectRatio: VIDEO_DEFAULT_ASPECT_RATIO[VIDEO_SOURCE_TYPE.VIMEO],
    };
  }

  if (normalizedSourceType === VIDEO_SOURCE_TYPE.X) {
    return {
      key: "x",
      badge: "X",
      defaultAspectRatio: VIDEO_DEFAULT_ASPECT_RATIO[VIDEO_SOURCE_TYPE.X],
    };
  }

  return {
    key: "generic",
    badge: "Video",
    defaultAspectRatio: VIDEO_DEFAULT_ASPECT_RATIO[VIDEO_SOURCE_TYPE.GENERIC],
  };
}

export function resolveVideoAspectRatio(card, loadedAspectRatio = null) {
  if (Number.isFinite(loadedAspectRatio) && loadedAspectRatio > 0) {
    return loadedAspectRatio;
  }

  if (Number.isFinite(card?.mediaAspectRatio) && card.mediaAspectRatio > 0) {
    return card.mediaAspectRatio;
  }

  return getVideoTileRecipe(card?.sourceType).defaultAspectRatio;
}

export function formatVideoDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 1) {
    return "";
  }

  const roundedSeconds = Math.round(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
