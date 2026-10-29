import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useToast } from "../../hooks/useToast";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  GITHUB_REPO_CARD_SIZE,
  formatLanguagePercent,
  formatRepoCount,
  formatUpdatedAgo,
  getLanguageSegments,
  normalizeGitHubRepoData,
} from "../../tiles/github/model";
import TileShell from "./TileShell";
import { Fork, GitHubMark as PixelGitHubMark, Info, Star } from "../ui/icons";
import "./GitHubRepoTile.css";

function stopTilePointer(event) {
  event.stopPropagation();
}

function pluralize(value, singular, plural) {
  return value === 1 ? singular : plural;
}

function StarIcon() {
  return <Star className="github-tile__star" fill="currentColor" aria-hidden="true" />;
}

function ForkIcon() {
  return <Fork aria-hidden="true" />;
}

function IssueIcon() {
  return <Info aria-hidden="true" />;
}

function GitHubMark() {
  return <PixelGitHubMark aria-hidden="true" />;
}

function OwnerAvatar({ owner }) {
  // Keyed by owner by the caller, so a new owner starts with a fresh
  // load state. The image is github.com/<owner>.png -- not a rate-limited
  // API call -- with the owner's initial underneath until it loads.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className="github-tile__avatar" aria-hidden="true">
      <span>{(owner.charAt(0) || "?").toUpperCase()}</span>
      {owner && !failed ? (
        <img
          src={`https://github.com/${encodeURIComponent(owner)}.png?size=64`}
          alt=""
          draggable={false}
          hidden={!loaded}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

function RepoStat({ icon, value, singular, plural }) {
  return (
    <span className="github-tile__stat">
      {icon}
      <span>
        <b>{formatRepoCount(value)}</b> {pluralize(value, singular, plural)}
      </span>
    </span>
  );
}

function LanguageRibbon({ segments, emptyNote }) {
  // The tile's one moment of motion: segments grow in from the left each
  // time a language breakdown renders.
  const [isIn, setIsIn] = useState(false);
  const signature = segments ? segments.map((segment) => `${segment.name}:${segment.pct.toFixed(2)}`).join("|") : emptyNote;

  useLayoutEffect(() => {
    setIsIn(false);
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => setIsIn(true));
    });

    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [signature]);

  const hasSegments = segments && segments.length > 0;

  return (
    <>
      <div
        className="github-tile__ribbon"
        data-in={isIn ? "true" : "false"}
        role="img"
        aria-label={hasSegments
          ? `Language breakdown: ${segments.map((segment) => `${segment.name} ${formatLanguagePercent(segment.pct)}`).join(", ")}`
          : emptyNote || "Language breakdown"}
      >
        {hasSegments ? segments.map((segment) => (
          <span
            key={segment.name}
            className="github-tile__segment"
            style={{ flexGrow: segment.pct, background: segment.color }}
            title={`${segment.name} ${formatLanguagePercent(segment.pct)}`}
          />
        )) : (
          <span className="github-tile__segment github-tile__segment--empty" style={{ flexGrow: 1 }} />
        )}
      </div>
      {hasSegments || emptyNote ? (
        <ul className="github-tile__legend">
          {hasSegments ? segments.map((segment) => (
            <li key={segment.name}>
              <i className="github-tile__dot" style={{ background: segment.color }} />
              <span>{segment.name}</span>
              <span className="github-tile__muted">{formatLanguagePercent(segment.pct)}</span>
            </li>
          )) : (
            <li className="github-tile__muted">{emptyNote}</li>
          )}
        </ul>
      ) : null}
    </>
  );
}

function GitHubRepoTile({
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
  const { updateExistingCard } = useAppContext();
  const { toast } = useToast();
  const surfaceRef = useRef(null);
  const repo = useMemo(() => normalizeGitHubRepoData(card.repo, card.url), [card.repo, card.url]);
  const isLoading = card.status === "loading";
  const repoUrl = card.resolvedUrl || card.url || `https://github.com/${repo.owner}/${repo.name}`;
  const segments = useMemo(() => getLanguageSegments(repo.languages), [repo.languages]);
  const updatedLabel = formatUpdatedAgo(repo.pushedAt);
  const description = repo.error ? "" : (card.description ?? "").trim();
  // Before the first fetch lands there is nothing to say about languages yet.
  const hasNoDataYet = isLoading && !repo.fetchedAt;
  const emptyNote = hasNoDataYet
    ? ""
    : segments === null || repo.error
      ? "Language data unavailable"
      : "No code detected";

  const openRepo = async () => {
    try {
      await onOpenLink?.(card);
    } catch {
      toast("error", "Could not open GitHub");
    }
  };

  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
    onDoubleActivate: () => void openRepo(),
  });

  // Height is auto (the description and legend vary), but card.height is
  // what selection, hit-testing and layout use, so write the rendered height
  // back. offsetHeight is layout size, unaffected by canvas zoom.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const measuredHeight = Math.ceil(surface.offsetHeight);
    const currentHeight = Number.isFinite(card.height) ? card.height : GITHUB_REPO_CARD_SIZE.height;

    if (measuredHeight > 0 && Math.abs(measuredHeight - currentHeight) > 1) {
      updateExistingCard(card.id, { height: measuredHeight });
    }
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--github-repo"
      renderHint={renderHint}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <article
        ref={surfaceRef}
        className="github-tile"
        data-state={isLoading ? "loading" : "ready"}
        aria-label={`GitHub repository ${repo.owner}/${repo.name}`}
        {...surfaceGesture}
      >
        <div className="github-tile__byline">
          <OwnerAvatar key={repo.owner} owner={repo.owner} />
          <span className="github-tile__owner">{repo.owner}</span>
        </div>

        <h2 className="github-tile__repo">{repo.name}</h2>
        {description ? <p className="github-tile__desc">{description}</p> : null}

        <div className="github-tile__stats">
          <RepoStat icon={<StarIcon />} value={repo.stars} singular="star" plural="stars" />
          <RepoStat icon={<ForkIcon />} value={repo.forks} singular="fork" plural="forks" />
          <RepoStat icon={<IssueIcon />} value={repo.issues} singular="issue" plural="issues" />
        </div>

        <LanguageRibbon segments={repo.error ? null : segments} emptyNote={emptyNote} />

        <div className="github-tile__footer">
          {updatedLabel && !repo.error ? <span className="github-tile__updated">{updatedLabel}</span> : null}
          <a
            className="github-tile__open"
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onPointerDown={stopTilePointer}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void openRepo();
            }}
          >
            <GitHubMark />
            <span>Open on GitHub</span>
          </a>
        </div>
      </article>
    </TileShell>
  );
}

export default memo(GitHubRepoTile);
