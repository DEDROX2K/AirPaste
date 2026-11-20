import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  X_POST_CARD_SIZE,
  formatXCount,
  formatXDuration,
  formatXPosted,
  formatXShortDate,
  getXInitials,
  getXProfileUrl,
  normalizeXPost,
} from "../../tiles/x/model";
import TileShell from "./TileShell";
import {
  VerifiedBadge,
  XAvatar,
  XLogo,
  XQuickActions,
  XRichText,
  stopTilePointer,
  useMeasuredTileHeight,
  useOpenXUrl,
} from "./XTileParts";

function Pin() {
  // return (
  //   <svg className="x-tile__pin" viewBox="0 0 36 36" aria-hidden="true">
  //     <circle cx="18" cy="18" r="14" fill="#2F3336" />
  //     <circle cx="18" cy="18" r="9" fill="#3E4246" />
  //     <circle cx="14.5" cy="14.5" r="3" fill="#5B6066" />
  //   </svg> 
  // );
  return null;
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21.6S2 15.6 2 8.8A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 10 2.8c0 6.8-10 12.8-10 12.8Z" />
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5C6.5 2.5 2 6.4 2 11.3c0 2.6 1.3 4.9 3.3 6.5L4.5 21.5l4.6-2.2c.9.2 1.9.3 2.9.3 5.5 0 10-3.9 10-8.8S17.5 2.5 12 2.5Z" />
    </svg>
  );
}

function clampedRatio(media) {
  // One image keeps its own shape, clamped between 3:4 and 16:9.
  if (!media.width || !media.height) {
    return 16 / 10;
  }

  return Math.min(16 / 9, Math.max(3 / 4, media.width / media.height));
}

// Photos are part of the drag surface (grab to move the tile); a double
// click on one opens that photo on X.
function MediaCell({ media, index }) {
  return (
    <div className="x-post__cell" data-photo-index={index}>
      {media.asset ? <img src={media.asset} alt="" draggable={false} /> : null}
    </div>
  );
}

// Inline player: poster until clicked, then a real <video> (best mp4 the
// resolver found). Never autoplays; pauses when the tile goes still
// (compact, simplified) or scrolls out of view. The frame is part of the
// drag surface: the tile's own gesture calls toggle (through controlRef)
// on a click that did not turn into a drag.
function VideoMedia({ media, isStill, onOpenFallback, controlRef }) {
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [remaining, setRemaining] = useState(media.durationMs / 1000);
  const isGif = media.kind === "gif";

  useEffect(() => {
    if (isStill) {
      videoRef.current?.pause();
    }
  }, [isStill]);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        videoRef.current?.pause();
      }
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    if (!media.videoUrl) {
      onOpenFallback();
      return;
    }

    if (!started) {
      setStarted(true);
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  };
  controlRef.current = toggle;

  return (
    <div
      ref={frameRef}
      className="x-post__media x-post__media--video"
      data-playing={playing ? "true" : "false"}
      data-video-frame="true"
    >
      {media.asset ? <img className="x-post__poster" src={media.asset} alt="" draggable={false} /> : null}
      {started ? (
        <video
          ref={videoRef}
          className="x-post__video"
          src={media.videoUrl}
          poster={media.asset || undefined}
          autoPlay
          loop={isGif}
          muted={isGif}
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
            setRemaining(media.durationMs / 1000);
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : media.durationMs / 1000;

            if (total > 0) {
              setProgress(Math.min(1, video.currentTime / total));
              setRemaining(Math.max(0, total - video.currentTime));
            }
          }}
        />
      ) : null}
      {isGif ? (
        <span className="x-post__dur">GIF</span>
      ) : media.durationMs > 0 ? (
        <span className="x-post__dur">{formatXDuration(Math.ceil(remaining))}</span>
      ) : null}
      {!isGif ? (
        <span className="x-post__bar" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></span>
      ) : null}
    </div>
  );
}

function XPostTile({
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
  const surfaceRef = useRef(null);
  const pressTargetRef = useRef(null);
  const videoControlRef = useRef(null);
  const post = useMemo(() => normalizeXPost(card.xPost, card.url), [card.xPost, card.url]);
  const isLoading = card.status === "loading" && !post.fetchedAt;
  const postUrl = post.url || card.resolvedUrl || card.url;
  const openUrl = useOpenXUrl(card, onOpenLink, toast);
  const isStaticPreview = renderHint?.isStaticPreview === true;
  const isStill = isStaticPreview || renderHint?.simplify === true || renderHint?.renderState === "compact";
  const firstMedia = post.media[0];
  const isVideo = firstMedia && firstMedia.kind !== "photo";
  const photos = isVideo ? [] : post.media;
  const posted = formatXPosted(post.createdAt);

  useMeasuredTileHeight(surfaceRef, card, X_POST_CARD_SIZE, isStaticPreview);

  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
    // A plain click on the video plays/pauses it; dragging from it moves
    // the tile like anywhere else.
    onActivate: () => {
      if (pressTargetRef.current?.closest?.("[data-video-frame]")) {
        videoControlRef.current?.();
      }
    },
    // Pointer capture retargets click/dblclick to the surface, so use the
    // element the press started on.
    onDoubleActivate: () => {
      const target = pressTargetRef.current;
      const cell = target?.closest?.("[data-photo-index]");

      if (cell && post.url) {
        void openUrl(`${post.url}/photo/${Number(cell.dataset.photoIndex) + 1}`);
        return;
      }

      if (!target?.closest?.("[data-video-frame]")) {
        void openUrl(postUrl);
      }
    },
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className="card--x-tile"
      renderHint={renderHint}
      actionStrip={<XQuickActions card={card} tileMeta={tileMeta} toast={toast} onOpen={() => openUrl(postUrl)} />}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div
        ref={surfaceRef}
        className="x-tile x-post"
        data-state={isLoading ? "loading" : "ready"}
        aria-label={`X post by @${post.author.handle}`}
        {...surfaceGesture}
        onPointerDownCapture={(event) => {
          pressTargetRef.current = event.target;
        }}
      >
        <Pin />
        <div className="x-tile__card">
          <div className="x-post__body">
            <div className="x-post__head">
              <XAvatar
                className="x-post__avatar"
                src={post.author.avatarAsset}
                initials={isLoading ? "" : getXInitials(post.author.name || post.author.handle)}
              />
              <div className="x-post__who">
                <div className="x-post__name-row">
                  <span className="x-post__name">{post.author.name || (isLoading ? "" : post.author.handle)}</span>
                  <VerifiedBadge kind={post.author.verified} />
                </div>
                {post.author.handle ? <div className="x-post__handle">@{post.author.handle}</div> : null}
              </div>
              <button
                type="button"
                className="x-post__xlogo"
                aria-label="Open on X"
                onPointerDown={stopTilePointer}
                onClick={(event) => {
                  event.stopPropagation();
                  void openUrl(postUrl);
                }}
              >
                <XLogo />
              </button>
            </div>

            {post.text ? (
              <XRichText className="x-post__text" text={post.text} entities={post.entities} onOpenUrl={openUrl} />
            ) : null}

            {isVideo ? (
              <VideoMedia media={firstMedia} isStill={isStill} controlRef={videoControlRef} onOpenFallback={() => void openUrl(postUrl)} />
            ) : null}

            {photos.length ? (
              <div
                className={`x-post__media x-post__media--n${photos.length}`}
                style={photos.length === 1 ? { aspectRatio: String(clampedRatio(photos[0])) } : undefined}
              >
                {photos.map((media, index) => (
                  <MediaCell key={index} media={media} index={index} />
                ))}
              </div>
            ) : null}

            {post.linkCard ? (
              <button
                type="button"
                className="x-post__linkcard"
                onPointerDown={stopTilePointer}
                onClick={(event) => {
                  event.stopPropagation();
                  void openUrl(post.linkCard.url || postUrl);
                }}
              >
                <span className="x-post__lc-img" data-has-image={post.linkCard.imageAsset ? "true" : "false"}>
                  {post.linkCard.imageAsset ? <img src={post.linkCard.imageAsset} alt="" draggable={false} /> : null}
                </span>
                <span className="x-post__lc-txt">
                  {post.linkCard.domain ? <span className="x-post__lc-dom">From {post.linkCard.domain}</span> : null}
                  <span className="x-post__lc-title">{post.linkCard.title}</span>
                </span>
              </button>
            ) : null}

            {post.quoted ? (
              <button
                type="button"
                className="x-post__quote"
                onPointerDown={stopTilePointer}
                onClick={(event) => {
                  event.stopPropagation();
                  void openUrl(post.quoted.url || getXProfileUrl(post.quoted.author.handle));
                }}
              >
                <span className="x-post__q-head">
                  <span className="x-post__q-av" aria-hidden="true">{getXInitials(post.quoted.author.name || post.quoted.author.handle)}</span>
                  <span className="x-post__q-name">{post.quoted.author.name}</span>
                  <span className="x-post__q-meta">
                    {[post.quoted.author.handle ? `@${post.quoted.author.handle}` : "", formatXShortDate(post.quoted.createdAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {post.quoted.text ? <span className="x-post__q-text">{post.quoted.text}</span> : null}
              </button>
            ) : null}

            {posted ? <div className="x-post__time">{posted}</div> : null}

            <div className="x-post__foot">
              {post.fetchedAt ? (
                <>
                  <span className="x-post__like"><HeartIcon /><b>{formatXCount(post.likes)}</b></span>
                  <span className="x-post__rep"><BubbleIcon /><b>{post.replies ? formatXCount(post.replies) : "Reply"}</b></span>
                </>
              ) : null}
              <button
                type="button"
                className="x-tile__pill x-post__view"
                onPointerDown={stopTilePointer}
                onClick={(event) => {
                  event.stopPropagation();
                  void openUrl(postUrl);
                }}
              >
                <XLogo />
                <span>View</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(XPostTile);
