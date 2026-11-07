// Reader view for link tiles: like a webclip, a preview mode of a link. The
// main process extracts the page's article with Readability and saves it in
// the canvas folder (.airpaste/articles); the card keeps this `article`
// summary. In "article" mode the tile is a sheet with the headline and
// excerpt, and opening it shows the full text without ads or clutter.
//
// main/ipc/linkPreview.js keeps its own copy of normalizeLinkArticle.

export const ARTICLE_TILE_WIDTH = 340;
export const ARTICLE_TILE_HEIGHT = 420;
const ARTICLE_STATUSES = ["idle", "capturing", "ready", "error"];
const ARTICLE_WORDS_PER_MINUTE = 230;

function cleanString(value, maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0 ? Number(value) : null;
}

export function normalizeLinkArticle(article) {
  if (!article || typeof article !== "object") {
    return null;
  }

  return {
    path: cleanString(article.path, 512),
    status: ARTICLE_STATUSES.includes(article.status) ? article.status : "idle",
    title: cleanString(article.title, 500),
    byline: cleanString(article.byline, 200),
    siteName: cleanString(article.siteName, 200),
    excerpt: cleanString(article.excerpt, 1000),
    wordCount: Number.isFinite(article.wordCount) && article.wordCount > 0 ? Math.round(article.wordCount) : 0,
    previousWidth: finitePositive(article.previousWidth),
    previousHeight: finitePositive(article.previousHeight),
  };
}

export function getArticleReadMinutes(wordCount) {
  return Math.max(1, Math.round((Number(wordCount) || 0) / ARTICLE_WORDS_PER_MINUTE));
}

// The size a link tile has in its standard preview, whichever mode it's in
// now, so switching modes always comes back to the same card.
export function getStandardLinkTileSize(tile) {
  if (tile?.previewMode === "article") {
    return {
      width: tile.article?.previousWidth ?? tile.width,
      height: tile.article?.previousHeight ?? tile.height,
    };
  }

  if (tile?.previewMode === "webclip") {
    return {
      width: tile.width,
      height: Number.isFinite(tile.webclipPreviousHeight) ? tile.webclipPreviousHeight : tile.height,
    };
  }

  return { width: tile?.width, height: tile?.height };
}

export function getArticleModePatch(tile, articlePatch = {}) {
  const standardSize = getStandardLinkTileSize(tile);

  return {
    previewMode: "article",
    width: ARTICLE_TILE_WIDTH,
    height: ARTICLE_TILE_HEIGHT,
    article: normalizeLinkArticle({
      ...tile.article,
      ...articlePatch,
      previousWidth: standardSize.width,
      previousHeight: standardSize.height,
    }),
  };
}
