import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "../context/useAppContext";
import { desktop } from "../lib/desktop";
import { sanitizeArticleHtml } from "../lib/sanitizeArticleHtml";
import { getArticleReadMinutes } from "../tiles/link/articleView";
import { X } from "./ui/icons";
import "./ArticleReader.css";

// Matches the sheet's exit animation in ArticleReader.css.
const CLOSE_ANIMATION_MS = 200;

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatPublishedDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "";
}

// Reader view for an article tile: the saved article (see
// tiles/link/articleView.js) as one clean, scrollable page over the canvas.
// A portal into document.body, so it sits outside the canvas's pan/zoom.
export default function ArticleReader({ card, onClosed }) {
  const { folderPath } = useAppContext();
  const [article, setArticle] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [isClosing, setIsClosing] = useState(false);
  const scrollRef = useRef(null);
  const articlePath = card.article?.path ?? "";

  useEffect(() => {
    let cancelled = false;

    desktop.workspace.readArticle(folderPath, articlePath)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setArticle(result && typeof result.content === "string" ? result : null);
        setLoadState(result && typeof result.content === "string" ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [articlePath, folderPath]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    scrollRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const requestClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  useEffect(() => {
    if (!isClosing) {
      return undefined;
    }

    const timer = setTimeout(() => onClosed?.(), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [isClosing, onClosed]);

  const contentHtml = useMemo(() => sanitizeArticleHtml(article?.content ?? ""), [article?.content]);
  const sourceUrl = article?.url || card.url || "";
  const title = article?.title || card.article?.title || card.title || "Untitled article";
  const siteName = article?.siteName || card.article?.siteName || card.siteName || getDomain(sourceUrl);
  const byline = article?.byline || card.article?.byline || "";
  const wordCount = article?.wordCount || card.article?.wordCount || 0;
  const metaParts = [
    byline,
    formatPublishedDate(article?.publishedTime),
    wordCount > 0 ? `${getArticleReadMinutes(wordCount)} min read` : "",
  ].filter(Boolean);

  const openOriginal = useCallback(() => {
    if (sourceUrl) {
      void desktop.shell.openExternal(sourceUrl);
    }
  }, [sourceUrl]);

  // Links in the article open in the browser, never inside the app.
  const handleBodyClick = useCallback((event) => {
    const link = event.target.closest?.("a");
    if (!link) {
      return;
    }

    event.preventDefault();
    const href = link.getAttribute("href");
    if (href) {
      void desktop.shell.openExternal(href);
    }
  }, []);

  const handleKeyDown = useCallback((event) => {
    // The canvas has its own shortcuts; none of them apply while reading.
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
    }
  }, [requestClose]);

  return createPortal(
    <div
      className={`article-reader${isClosing ? " article-reader--closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="article-reader__backdrop" onClick={requestClose} />
      <div className="article-reader__sheet">
        <div className="article-reader__bar">
          <span className="article-reader__site">{siteName}</span>
          <div className="article-reader__bar-actions">
            {sourceUrl ? (
              <button type="button" className="article-reader__button" onClick={openOriginal}>
                Open original
              </button>
            ) : null}
            <button
              type="button"
              className="article-reader__button article-reader__button--icon"
              aria-label="Close reader"
              title="Close (Esc)"
              onClick={requestClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="article-reader__scroll" tabIndex={-1}>
          <article className="article-reader__page" lang={article?.lang || undefined} dir={article?.dir || undefined}>
            <header className="article-reader__header">
              <h1 className="article-reader__title">{title}</h1>
              {metaParts.length > 0 ? (
                <p className="article-reader__meta">{metaParts.join(" · ")}</p>
              ) : null}
            </header>

            {loadState === "loading" ? (
              <p className="article-reader__status">Opening the article...</p>
            ) : null}
            {loadState === "error" ? (
              <p className="article-reader__status">
                This article is no longer saved. Right-click the tile and choose Read article to get it again.
              </p>
            ) : null}
            {loadState === "ready" ? (
              <div
                className="article-reader__body"
                onClick={handleBodyClick}
                // Rebuilt from an allowlist by sanitizeArticleHtml.
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            ) : null}
          </article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
