import { memo, useEffect, useMemo, useState } from "react";
import {
  canRefreshLinkPreviewCard,
  formatCardSubtitle,
  LINK_CONTENT_KIND_IMAGE,
  shouldRecoverLinkPreviewCard,
} from "../../lib/workspace";
import { useAppContext } from "../../context/useAppContext";
import { useToast } from "../../hooks/useToast";
import { recordImageSample, recordPreviewTierSelection } from "../../lib/perf";
import {
  isPreviewDebugModeEnabled,
  isTestingTilesCanvasEditor,
} from "../../lib/testingTiles";
import TileShell from "./TileShell";
import TileImageReveal from "./TileImageReveal";
import {
  formatVideoDuration,
  getVideoTileRecipe,
  resolveVideoAspectRatio,
} from "./videoTileRecipe";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { useTilePreviewSource } from "../../systems/canvas/useTilePreviewSource";

function formatShortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function isYouTubeUrl(url) {
  if (typeof url !== "string" || url.trim().length === 0) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    return (
      hostname === "youtu.be"
      || hostname === "youtube.com"
      || hostname.endsWith(".youtube.com")
      || hostname === "youtube-nocookie.com"
      || hostname.endsWith(".youtube-nocookie.com")
    );
  } catch {
    return false;
  }
}

function getCardLabel(card) {
  return card.title.trim() || formatCardSubtitle(card);
}

function findPreviewDiagnosticReason(card) {
  const diagnostics = card?.previewDiagnostics;
  const resolverMetadata = diagnostics?.resolverMetadata;

  return [
    diagnostics?.fallbackReason,
    diagnostics?.embedBlockReason,
    diagnostics?.embedBlocked ? "embed-blocked" : "",
    diagnostics?.cookieWallDetected ? "cookie-wall" : "",
    diagnostics?.loginWallDetected ? "login-wall" : "",
    diagnostics?.captchaDetected ? "captcha" : "",
    resolverMetadata?.fallbackReason,
    resolverMetadata?.embedFailureReason,
    resolverMetadata?.iframeFailureReason,
    resolverMetadata?.blockedReason,
    diagnostics?.reason,
    diagnostics?.rejectionReason,
    card?.previewError,
  ]
    .find((value) => typeof value === "string" && value.trim().length > 0)
    ?.trim() ?? "";
}

function formatPreviewFallbackReason(card, hasImageError) {
  if (hasImageError) {
    return "The preview image failed to load.";
  }

  const diagnostics = card?.previewDiagnostics;
  const diagnosticReason = findPreviewDiagnosticReason(card);

  if (!diagnosticReason) {
    return "";
  }

  const normalizedReason = diagnosticReason.toLowerCase();

  if (
    diagnostics?.embedBlocked === true
    && (
      diagnostics?.embedBlockReason === "x-frame-options"
      || diagnostics?.embedBlockReason === "content-security-policy-frame-ancestors"
    )
  ) {
    return "This site blocks embedded previews.";
  }

  if (diagnostics?.cookieWallDetected === true) {
    return "This page is behind a cookie or consent screen.";
  }

  if (diagnostics?.loginWallDetected === true) {
    return "This preview is blocked behind sign-in.";
  }

  if (diagnostics?.captchaDetected === true) {
    return "This preview is blocked by site verification.";
  }

  if (
    normalizedReason.includes("x-frame")
    || normalizedReason.includes("frame-options")
    || normalizedReason.includes("iframe")
    || normalizedReason.includes("embedblocked")
    || normalizedReason.includes("embed blocked")
  ) {
    return "This site blocks embedded previews.";
  }

  if (
    normalizedReason.includes("cookie")
    || normalizedReason.includes("consent")
    || normalizedReason.includes("privacy notice")
  ) {
    return "This page is behind a cookie or consent screen.";
  }

  if (
    normalizedReason.includes("sign in")
    || normalizedReason.includes("login")
    || normalizedReason.includes("log in")
  ) {
    return "This preview is blocked behind sign-in.";
  }

  if (
    normalizedReason.includes("captcha")
    || normalizedReason.includes("verify you are human")
    || normalizedReason.includes("robot check")
  ) {
    return "This preview is blocked by site verification.";
  }

  if (normalizedReason === "blocked" || normalizedReason === "preview blocked") {
    return "This site blocks rich previews.";
  }

  return diagnosticReason;
}

function getPreviewDiagnosticBadges(card) {
  const diagnostics = card?.previewDiagnostics ?? {};
  const badges = [];

  if (diagnostics.finalPreviewStatus === "ready" && diagnostics.fallbackUsed !== true) {
    badges.push({ key: "success", label: "success", tone: "success" });
  }

  if (diagnostics.finalPreviewStatus === "fallback" || diagnostics.fallbackUsed === true || card?.status === "fallback") {
    badges.push({ key: "fallback", label: "fallback", tone: "fallback" });
  }

  if (diagnostics.embedBlocked === true) {
    badges.push({ key: "embed-blocked", label: "embed blocked", tone: "blocked" });
  }

  if (diagnostics.cookieWallDetected === true) {
    badges.push({ key: "cookie-wall", label: "cookie wall", tone: "warning" });
  }

  if (diagnostics.loginWallDetected === true) {
    badges.push({ key: "login-wall", label: "login wall", tone: "warning" });
  }

  if (diagnostics.captchaDetected === true) {
    badges.push({ key: "captcha", label: "captcha", tone: "danger" });
  }

  if (
    diagnostics.metadataFetchStatus === "network-error"
    || diagnostics.metadataFetchStatus === "http-error"
    || diagnostics.openGraphStatus === "error"
  ) {
    badges.push({ key: "metadata-failed", label: "metadata failed", tone: "danger" });
  }

  if (
    diagnostics.thumbnailStatus === "missing"
    || diagnostics.thumbnailStatus === "rejected"
    || diagnostics.thumbnailStatus === "blocked"
  ) {
    badges.push({ key: "thumbnail-missing", label: "thumbnail missing", tone: "neutral" });
  }

  return badges;
}

function hasTerminalPreviewState(card) {
  const diagnosticsStatus = typeof card?.previewDiagnostics?.finalPreviewStatus === "string"
    ? card.previewDiagnostics.finalPreviewStatus.trim().toLowerCase()
    : "";
  const status = typeof card?.status === "string" ? card.status.trim().toLowerCase() : "";
  const previewStatus = typeof card?.previewStatus === "string" ? card.previewStatus.trim().toLowerCase() : "";

  return ["ready", "fallback", "blocked", "error"].includes(status)
    || ["ready", "fallback", "blocked", "error"].includes(previewStatus)
    || ["ready", "fallback", "blocked", "error"].includes(diagnosticsStatus);
}

function resolveIconPath(relativePath) {
  return `${import.meta.env.BASE_URL}${relativePath}`;
}

const VIDEO_PREVIEW_DEBUG_ENABLED = (
  String(import.meta.env.VITE_PREVIEW_DEBUG ?? "").trim() === "1"
  || (typeof window !== "undefined" && window.__AIRPASTE_PREVIEW_DEBUG === true)
);

function logVideoPreviewDebug(event, payload = {}) {
  if (!VIDEO_PREVIEW_DEBUG_ENABLED) {
    return;
  }

  console.debug(`[tile:video] ${event}`, payload);
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
  renderHint,
}) {
  const { toast } = useToast();
  const { currentEditor, folderPath } = useAppContext();
  const [hasImageError, setHasImageError] = useState(false);
  const [hasLoadedImage, setHasLoadedImage] = useState(false);
  const [loadedVideoAspectRatio, setLoadedVideoAspectRatio] = useState(null);
  const [videoImageIndex, setVideoImageIndex] = useState(0);
  const isImageTile = card.contentKind === LINK_CONTENT_KIND_IMAGE;
  const isVideoCard = card.contentType === "video";
  const isMusicCard = card.previewKind === "music" && Boolean(card.image);
  const previewTier = renderHint?.previewTier ?? "original";
  const showDeveloperQaBadges = (
    isPreviewDebugModeEnabled()
    && isTestingTilesCanvasEditor(currentEditor)
    && !isImageTile
  );
  const previewDiagnosticBadges = useMemo(
    () => (showDeveloperQaBadges ? getPreviewDiagnosticBadges(card) : []),
    [card, showDeveloperQaBadges],
  );
  const videoRecipe = useMemo(() => getVideoTileRecipe(card.sourceType), [card.sourceType]);
  const videoDurationLabel = useMemo(() => formatVideoDuration(card.duration), [card.duration]);
  const isYouTubeVideoSource = card.sourceType === "youtube" || card.sourceType === "youtube-shorts";
  const isYouTubeVideoUrl = isYouTubeUrl(card.url);
  const isYouTubeLink = isYouTubeVideoSource || isYouTubeVideoUrl;
  const isPlainVideoLink = isVideoCard && isYouTubeLink;
  const useYouTubeThumbnailCrop = isYouTubeLink;
  const videoAspectRatio = useMemo(
    () => resolveVideoAspectRatio(card, loadedVideoAspectRatio),
    [card, loadedVideoAspectRatio],
  );
  const { src: previewSource } = useTilePreviewSource({
    card,
    folderPath,
    previewTier,
    imageEnabled: renderHint?.imageEnabled !== false,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  });
  const mediaSrc = isImageTile ? (previewSource || card.image) : previewSource;
  const videoCandidateUrls = useMemo(() => {
    if (!isVideoCard) {
      return [];
    }

    const diagnosticsCandidates = Array.isArray(card?.previewDiagnostics?.candidateImageUrls)
      ? card.previewDiagnostics.candidateImageUrls
      : [];

    return [...new Set(
      [card.image, ...diagnosticsCandidates]
        .filter((candidate) => typeof candidate === "string")
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length > 0),
    )];
  }, [card.image, card.previewDiagnostics?.candidateImageUrls, isVideoCard]);
  const activeVideoImageSrc = isVideoCard
    ? (videoCandidateUrls[videoImageIndex] || mediaSrc)
    : mediaSrc;
  const shouldRenderImage = Boolean(activeVideoImageSrc) && !hasImageError && renderHint?.imageEnabled !== false;
  const isPreviewLoading = !isImageTile && card.status === "loading" && !hasTerminalPreviewState(card) && !shouldRenderImage;
  const previewFallbackReason = formatPreviewFallbackReason(card, hasImageError);
  const enableReveal = renderHint?.disableImageReveal !== true;
  const showLinkActions = !isImageTile && (renderHint?.showActions ?? true);
  const label = getCardLabel(card);
  const linkTitle = card.title || formatShortUrl(card.url) || (isImageTile ? "Imported image" : "Untitled link");
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    isMusicCard ? "card__surface-frame--music" : "",
    isVideoCard && !isPlainVideoLink ? "card__surface-frame--video" : "",
    isVideoCard && !isPlainVideoLink ? `card__surface-frame--video-${videoRecipe.key}` : "",
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
    setLoadedVideoAspectRatio(null);
    setVideoImageIndex(0);
  }, [card.id, card.image, previewSource]);

  useEffect(() => {
    if (!isVideoCard) {
      return;
    }

    logVideoPreviewDebug("candidates", {
      cardId: card.id,
      status: card.status,
      sourceType: card.sourceType,
      chosenIndex: videoImageIndex,
      candidateCount: videoCandidateUrls.length,
      candidates: videoCandidateUrls,
      diagnostics: card.previewDiagnostics?.trace?.slice(-4) ?? [],
    });
  }, [
    card.id,
    card.previewDiagnostics?.trace,
    card.sourceType,
    card.status,
    isVideoCard,
    videoCandidateUrls,
    videoImageIndex,
  ]);

  useEffect(() => {
    recordPreviewTierSelection(card.id, previewTier);
  }, [card.id, previewTier]);

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
      src: activeVideoImageSrc,
    });

    if (isVideoCard && Number.isFinite(naturalWidth) && Number.isFinite(naturalHeight) && naturalWidth > 0 && naturalHeight > 0) {
      setLoadedVideoAspectRatio(naturalWidth / naturalHeight);
    }

    if (isVideoCard) {
      logVideoPreviewDebug("image-load", {
        cardId: card.id,
        imageIndex: videoImageIndex,
        src: activeVideoImageSrc,
        naturalWidth,
        naturalHeight,
      });
    }

    onMediaLoad?.(card, naturalWidth, naturalHeight);
  };

  const mediaMarkup = (
    <>
      {isImageTile ? null : (
        <div
          className={`card__link-actions${showLinkActions ? "" : " card__link-actions--hidden"}`}
          aria-label="Link actions"
        >
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
      {isVideoCard && !isPlainVideoLink ? (
        <div className={`card__video card__video--${videoRecipe.key}`}>
          <div className="card__video-media-region">
            <div
              className={`card__video-frame card__video-frame--${card.status}`}
              style={{ "--video-media-aspect": String(videoAspectRatio) }}
            >
              <div className="card__video-screen">
                {shouldRenderImage ? (
                  <TileImageReveal
                    className="card__image card__image--video"
                    src={activeVideoImageSrc}
                    alt={linkTitle}
                    enableReveal={enableReveal}
                    onError={() => {
                      logVideoPreviewDebug("image-error", {
                        cardId: card.id,
                        imageIndex: videoImageIndex,
                        currentSrc: activeVideoImageSrc,
                        hasLoadedImage,
                        candidateCount: videoCandidateUrls.length,
                      });
                      if (!hasLoadedImage && videoImageIndex < videoCandidateUrls.length - 1) {
                        setVideoImageIndex((currentIndex) => Math.min(currentIndex + 1, videoCandidateUrls.length - 1));
                        logVideoPreviewDebug("candidate-fallback", {
                          cardId: card.id,
                          fromIndex: videoImageIndex,
                          toIndex: Math.min(videoImageIndex + 1, videoCandidateUrls.length - 1),
                        });
                        return;
                      }

                      if (!hasLoadedImage) {
                        setHasImageError(true);
                        logVideoPreviewDebug("image-failed-terminal", {
                          cardId: card.id,
                          currentSrc: activeVideoImageSrc,
                          previewError: card.previewError,
                        });
                      }
                    }}
                    onLoad={handleMediaLoad}
                  />
                ) : isPreviewLoading ? (
                  <div className="card__video-loading" aria-hidden="true">
                    <div className="card__video-loading-bar card__video-loading-bar--one" />
                    <div className="card__video-loading-bar card__video-loading-bar--two" />
                    <div className="card__video-loading-bar card__video-loading-bar--three" />
                  </div>
                ) : (
                  <div className="card__video-placeholder">
                    <p className="card__video-placeholder-title">{linkTitle}</p>
                    <p className="card__video-placeholder-subtitle">
                      {previewFallbackReason || formatShortUrl(card.url) || videoRecipe.badge}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="card__video-meta">
            <div className="card__video-badge-row">
              <span className="card__video-badge">{videoRecipe.badge}</span>
              {videoDurationLabel ? <span className="card__video-duration">{videoDurationLabel}</span> : null}
            </div>
            <p className="card__video-title">{linkTitle}</p>
            <p className="card__video-subtitle">
              {card.channelName || card.author || card.siteName || formatShortUrl(card.url)}
            </p>
          </div>
        </div>
      ) : isMusicCard ? (
        <div className="card__record-shell">
          <div className="card__record-disc" aria-hidden="true" />
          <div className="card__record-sleeve">
            {shouldRenderImage ? (
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
            ) : (
              <div className="card__placeholder card__placeholder--simplified">
                <p className="card__placeholder-title">{linkTitle}</p>
                <p className="card__placeholder-subtitle">
                  {previewFallbackReason || formatShortUrl(card.url)}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : shouldRenderImage ? (
        <TileImageReveal
          className={`card__image${useYouTubeThumbnailCrop ? " card__image--youtube-crop" : ""}`}
          src={isPlainVideoLink ? activeVideoImageSrc : mediaSrc}
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
        <div className={`card__placeholder${renderHint?.simplify ? " card__placeholder--simplified" : ""}`}>
          <p className="card__placeholder-title">{linkTitle}</p>
          <p className="card__placeholder-subtitle">
            {isImageTile
              ? (card.asset?.fileName || "Imported image")
              : (previewFallbackReason || formatShortUrl(card.url))}
          </p>
        </div>
      )}
    </>
  );

  return (
    <TileShell
      card={card}
      renderHint={renderHint}
      tileMeta={{ ...tileMeta, isMusic: isMusicCard }}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className={isMusicCard ? "card--music" : ""}
      toolbar={renderHint?.showToolbar === false ? null : (
        <div className="card__toolbar" {...surfaceGesture}>
          <p className="card__label">{label}</p>
          {previewDiagnosticBadges.length > 0 ? (
            <div className="card__debug-badges" aria-label="Preview diagnostics badges">
              {previewDiagnosticBadges.map((badge) => (
                <span
                  key={`${card.id}-${badge.key}`}
                  className={`card__debug-badge card__debug-badge--${badge.tone}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
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
              className={`card__surface card__surface--link${isMusicCard ? " card__surface--music" : ""}${isVideoCard && !isPlainVideoLink ? " card__surface--video" : ""}${isPlainVideoLink ? " card__surface--link-plain" : ""}`}
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

        {!isImageTile && shouldRecoverLinkPreviewCard(card) ? (
          <button
            className="card__retry"
            type="button"
            disabled={!canRefreshLinkPreviewCard(card)}
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
