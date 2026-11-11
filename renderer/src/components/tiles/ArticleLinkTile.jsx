import { lazy, memo, Suspense, useCallback, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
import { DRAWING_TOOL_MODE_SELECT } from "../../systems/drawing/drawingTypes";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { useTilePreviewSource } from "../../systems/canvas/useTilePreviewSource";
import { getArticleReadMinutes } from "../../tiles/link/articleView";
import TileShell from "./TileShell";
import "./ArticleLinkTile.css";

const ArticleReader = lazy(() => import("../ArticleReader"));

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stopTilePointer(event) {
  event.stopPropagation();
}

// A link in reader view (see tiles/link/articleView.js): a sheet with the
// article's lead image, headline and opening lines. Double-click or Read
// opens the full article without the page's ads and clutter.
function ArticleLinkTile({
  card,
  tileMeta,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  renderHint,
  canvasToolMode,
}) {
  const { folderPath } = useTileAppContext();
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const isSelectToolActive = canvasToolMode === DRAWING_TOOL_MODE_SELECT;
  const article = card.article ?? {};
  const title = article.title || card.title || "Untitled article";
  const siteName = article.siteName || card.siteName || getDomain(card.url);
  const excerpt = article.excerpt || card.description || "";
  const readMinutes = article.wordCount > 0 ? getArticleReadMinutes(article.wordCount) : 0;
  const { src: leadImageSrc } = useTilePreviewSource({
    card,
    folderPath,
    previewTier: renderHint?.previewTier ?? "original",
    imageEnabled: renderHint?.imageEnabled !== false,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  });
  const [hasImageError, setHasImageError] = useState(false);
  const showLeadImage = Boolean(leadImageSrc) && !hasImageError;

  const openReader = useCallback(() => {
    setIsReaderOpen(true);
  }, []);

  const closeReader = useCallback(() => {
    setIsReaderOpen(false);
  }, []);

  const surfaceGesture = useTileGesture({
    card,
    canDrag: isSelectToolActive && !isReaderOpen,
    onDoubleActivate: openReader,
    onDragStart: onBeginDrag,
    onPressStart,
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className="card--article"
      renderHint={renderHint}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <section className="article-tile" aria-label={title} {...surfaceGesture}>
          {showLeadImage ? (
            <div className="article-tile__image">
              <img
                src={leadImageSrc}
                alt=""
                draggable={false}
                onError={() => setHasImageError(true)}
              />
            </div>
          ) : null}
          <div className="article-tile__text">
            {siteName ? <div className="article-tile__site">{siteName}</div> : null}
            <h3 className="article-tile__title">{title}</h3>
            {article.byline ? <div className="article-tile__byline">{article.byline}</div> : null}
            {excerpt ? <p className="article-tile__excerpt">{excerpt}</p> : null}
          </div>
          <footer className="article-tile__footer">
            <span className="article-tile__time">{readMinutes > 0 ? `${readMinutes} min read` : "Article"}</span>
            <button
              type="button"
              className="article-tile__read"
              onPointerDown={stopTilePointer}
              onClick={openReader}
            >
              Read
            </button>
          </footer>
        </section>
      </div>

      {isReaderOpen ? (
        <Suspense fallback={null}>
          <ArticleReader card={card} onClosed={closeReader} />
        </Suspense>
      ) : null}
    </TileShell>
  );
}

export default memo(ArticleLinkTile);
