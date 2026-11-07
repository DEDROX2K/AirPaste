// @vitest-environment jsdom
// Reader view for links (tiles/link/articleView.js): the card's article
// summary, the size round trip between preview modes, and the allowlist
// that cleans article HTML before the reader shows it.
import { describe, expect, it } from "vitest";
import { normalizeCard } from "@/lib/workspace.js";
import { sanitizeArticleHtml } from "@/lib/sanitizeArticleHtml.js";
import {
  ARTICLE_TILE_HEIGHT,
  ARTICLE_TILE_WIDTH,
  getArticleModePatch,
  getArticleReadMinutes,
  getStandardLinkTileSize,
} from "@/tiles/link/articleView.js";

const linkCard = {
  type: "link",
  url: "https://example.com/story",
  title: "Story",
  x: 0,
  y: 0,
  width: 300,
  height: 260,
};

describe("article link cards", () => {
  it("keeps the article summary and reader mode through normalizeCard", () => {
    const card = normalizeCard({
      ...linkCard,
      previewMode: "article",
      article: { path: ".airpaste/articles/abc.json", status: "ready", title: "Headline", wordCount: 1200.4 },
    });

    expect(card.previewMode).toBe("article");
    expect(card.article).toMatchObject({
      path: ".airpaste/articles/abc.json",
      status: "ready",
      title: "Headline",
      wordCount: 1200,
    });
  });

  it("has no article on other tile types", () => {
    expect(normalizeCard({ type: "checklist", previewMode: "article", article: { path: "x" } }).article).toBeNull();
  });

  it("returns to the standard size after reader view", () => {
    const patch = getArticleModePatch(linkCard, { path: "a.json", status: "ready" });
    expect(patch).toMatchObject({ previewMode: "article", width: ARTICLE_TILE_WIDTH, height: ARTICLE_TILE_HEIGHT });

    const inReader = { ...linkCard, ...patch };
    expect(getStandardLinkTileSize(inReader)).toEqual({ width: 300, height: 260 });
  });

  it("remembers the standard size, not the webclip's, when switching from a webclip", () => {
    const webclip = { ...linkCard, previewMode: "webclip", height: 1400, webclipPreviousHeight: 260 };
    const patch = getArticleModePatch(webclip, { path: "a.json", status: "ready" });

    expect(patch.article).toMatchObject({ previousWidth: 300, previousHeight: 260 });
  });

  it("rounds reading time to at least a minute", () => {
    expect(getArticleReadMinutes(20)).toBe(1);
    expect(getArticleReadMinutes(2300)).toBe(10);
  });
});

describe("sanitizeArticleHtml", () => {
  it("keeps article structure, links and images", () => {
    const html = sanitizeArticleHtml(
      '<h2>Title</h2><p>Some <strong>bold</strong> and <a href="https://example.com/a">a link</a>.</p>'
      + '<figure><img src="https://example.com/i.jpg" alt="Pic"><figcaption>Cap</figcaption></figure>',
    );

    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain('<a href="https://example.com/a">a link</a>');
    expect(html).toContain('src="https://example.com/i.jpg"');
    expect(html).toContain("<figcaption>Cap</figcaption>");
  });

  it("removes scripts, frames, styles and event handlers", () => {
    const html = sanitizeArticleHtml(
      '<p onclick="steal()" style="color:red" class="x">Hi</p><script>steal()</script>'
      + '<iframe src="https://ads.example.com"></iframe><style>p{}</style><img src="https://x.test/a.png" onerror="steal()">',
    );

    expect(html).not.toMatch(/script|iframe|style|onclick|onerror|class=/);
    expect(html).toContain("<p>Hi</p>");
  });

  it("drops unsafe link and image URLs", () => {
    const html = sanitizeArticleHtml(
      '<a href="javascript:alert(1)">bad</a><img src="javascript:alert(1)"><img src="file:///C:/secret.png">',
    );

    expect(html).toBe("<a>bad</a>");
  });

  it("unwraps unknown tags but keeps their text", () => {
    expect(sanitizeArticleHtml("<custom-widget><p>Kept</p></custom-widget>")).toBe("<p>Kept</p>");
  });
});
