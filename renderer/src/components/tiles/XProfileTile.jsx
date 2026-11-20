import { memo, useMemo, useRef } from "react";
import { useToast } from "../../hooks/useToast";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  X_PROFILE_CARD_SIZE,
  formatXCount,
  formatXJoined,
  getXInitials,
  getXProfileUrl,
  normalizeXProfile,
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

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.2 1.2" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.2-1.2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

// The ID-badge clip the card hangs from: a rounded tab with a slot punched out.
function Clip() {
  return (
    <svg className="x-tile__clip" viewBox="0 0 104 40" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 0 H92 Q104 0 104 12 V40 H0 V12 Q0 0 12 0 Z M30 11 Q26 11 26 15 Q26 19 30 19 H74 Q78 19 78 15 Q78 11 74 11 Z"
      />
    </svg>
  );
}

function XProfileTile({
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
  const profile = useMemo(() => normalizeXProfile(card.xProfile, card.url), [card.xProfile, card.url]);
  const isLoading = card.status === "loading" && !profile.fetchedAt;
  const profileUrl = getXProfileUrl(profile.handle);
  const openUrl = useOpenXUrl(card, onOpenLink, toast);
  const joined = formatXJoined(profile.joined);
  const isStaticPreview = renderHint?.isStaticPreview === true;

  useMeasuredTileHeight(surfaceRef, card, X_PROFILE_CARD_SIZE, isStaticPreview);

  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
    onDoubleActivate: () => void openUrl(profileUrl),
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className="card--x-tile"
      renderHint={renderHint}
      actionStrip={<XQuickActions card={card} tileMeta={tileMeta} toast={toast} onOpen={() => openUrl(profileUrl)} />}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div
        ref={surfaceRef}
        className="x-tile x-profile"
        data-state={isLoading ? "loading" : "ready"}
        aria-label={`X profile @${profile.handle}`}
        {...surfaceGesture}
      >
        <Clip />
        <div className="x-tile__card">
          <div className="x-profile__banner" data-has-image={profile.bannerAsset ? "true" : "false"}>
            {profile.bannerAsset ? <img src={profile.bannerAsset} alt="" draggable={false} /> : null}
          </div>
          <XAvatar
            className="x-profile__avatar"
            src={profile.avatarAsset}
            initials={isLoading ? "" : getXInitials(profile.name || profile.handle)}
          />
          <button
            type="button"
            className="x-tile__pill x-profile__view"
            onPointerDown={stopTilePointer}
            onClick={(event) => {
              event.stopPropagation();
              void openUrl(profileUrl);
            }}
          >
            <XLogo />
            <span>View</span>
          </button>

          <div className="x-profile__body">
            <div className="x-profile__name-row">
              <span className="x-profile__name">{profile.name || (isLoading ? "" : profile.handle)}</span>
              <VerifiedBadge kind={profile.verified} />
            </div>
            <div className="x-profile__handle">@{profile.handle}</div>
            {profile.bio ? (
              <XRichText className="x-profile__bio" text={profile.bio} onOpenUrl={openUrl} />
            ) : null}
            {profile.location || profile.website || joined ? (
              <div className="x-profile__meta">
                {profile.location ? <span><PinIcon />{profile.location}</span> : null}
                {profile.website ? (
                  <span>
                    <LinkIcon />
                    <a
                      href={profile.websiteUrl || `https://${profile.website}`}
                      draggable={false}
                      onPointerDown={stopTilePointer}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void openUrl(profile.websiteUrl || `https://${profile.website}`);
                      }}
                    >
                      {profile.website}
                    </a>
                  </span>
                ) : null}
                {joined ? <span><CalendarIcon />{joined}</span> : null}
              </div>
            ) : null}
            {profile.fetchedAt ? (
              <div className="x-profile__stats">
                <span><b>{formatXCount(profile.following)}</b> Following</span>
                <span><b>{formatXCount(profile.followers)}</b> Followers</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(XProfileTile);
