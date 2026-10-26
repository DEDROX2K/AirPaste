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
import "./GitHubRepoTile.css";

function stopTilePointer(event) {
  event.stopPropagation();
}

function pluralize(value, singular, plural) {
  return value === 1 ? singular : plural;
}

function StarIcon() {
  return (
    <svg className="github-tile__star" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
      <path d="M12 12v3" />
    </svg>
  );
}

function IssueIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
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
