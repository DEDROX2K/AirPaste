import {
  createEmptyWorkspace,
  createLinkCard,
  LINK_CONTENT_KIND_IMAGE,
} from "./workspace";

export const TESTING_TILES_CANVAS_NAME = "Testing Tiles";
export const TESTING_TILES_CANVAS_FILE_NAME = `${TESTING_TILES_CANVAS_NAME}.airpaste.json`;
export const TESTING_TILES_CANVAS_PURPOSE = "link-preview-qa";

const CARD_WIDTH = 340;
const CARD_HEIGHT = 280;
const ROW_GAP = 92;
const COLUMN_GAP = 44;
const HEADING_WIDTH = 260;
const HEADING_HEIGHT = 64;
const HEADER_X = 96;
const START_X = HEADER_X + HEADING_WIDTH + 56;
const START_Y = 120;

const TESTING_TILE_ROWS = Object.freeze([
  {
    key: "youtube-video",
    label: "YouTube / video",
    urls: [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/9bZkp7q19f0",
      "https://vimeo.com/76979871",
      "https://www.youtube.com/shorts/aqz-KE-bpKQ",
    ],
  },
  {
    key: "social-links",
    label: "social links",
    urls: [
      "https://github.com/openai/openai-cookbook",
      "https://x.com/OpenAI",
      "https://www.linkedin.com/company/openai/",
      "https://www.reddit.com/r/programming/",
    ],
  },
  {
    key: "docs-productivity",
    label: "docs/productivity",
    urls: [
      "https://docs.github.com/",
      "https://notion.so/",
      "https://www.figma.com/",
      "https://slack.com/",
    ],
  },
  {
    key: "articles-blogs",
    label: "articles/blogs",
    urls: [
      "https://example.com/",
      "https://developer.mozilla.org/en-US/docs/Web/HTML",
      "https://blog.openai.com/",
      "https://vercel.com/blog",
    ],
  },
  {
    key: "ecommerce",
    label: "ecommerce",
    urls: [
      "https://www.amazon.com/dp/B0C2S2K5QJ",
      "https://www.ebay.com/",
      "https://www.etsy.com/",
      "https://www.shopify.com/",
    ],
  },
  {
    key: "cookie-banner-sites",
    label: "cookie-banner sites",
    urls: [
      "https://www.reuters.com/",
      "https://www.theguardian.com/international",
      "https://www.nytimes.com/",
      "https://www.bbc.com/",
    ],
  },
  {
    key: "login-wall-sites",
    label: "login-wall sites",
    urls: [
      "https://www.linkedin.com/feed/",
      "https://www.instagram.com/openai/",
      "https://www.facebook.com/",
      "https://x.com/i/flow/login",
    ],
  },
  {
    key: "iframe-blocked-sites",
    label: "iframe-blocked sites",
    urls: [
      "https://github.com/",
      "https://www.google.com/",
      "https://www.notion.so/",
      "https://www.figma.com/",
    ],
  },
  {
    key: "broken-redirect-edge",
    label: "broken/redirect/edge cases",
    urls: [
      "https://httpbin.org/status/404",
      "https://httpbin.org/redirect/2",
      "https://httpbin.org/status/403",
      "https://expired.badssl.com/",
    ],
  },
]);

export function isPreviewDebugModeEnabled() {
  return (
    Boolean(import.meta.env.DEV)
    || String(import.meta.env.VITE_PREVIEW_DEBUG ?? "").trim() === "1"
    || (typeof window !== "undefined" && window.__AIRPASTE_PREVIEW_DEBUG === true)
  );
}

export function isTestingTilesCanvasEditor(currentEditor) {
  if (!currentEditor || currentEditor.kind !== "canvas") {
    return false;
  }

  const filePath = String(currentEditor.filePath ?? "").replaceAll("\\", "/").toLowerCase();
  return currentEditor.name === TESTING_TILES_CANVAS_NAME
    || filePath.endsWith(`/${TESTING_TILES_CANVAS_FILE_NAME.toLowerCase()}`)
    || filePath.endsWith(TESTING_TILES_CANVAS_FILE_NAME.toLowerCase());
}

function createHeadingSvgDataUrl(label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${HEADING_WIDTH}" height="${HEADING_HEIGHT}" viewBox="0 0 ${HEADING_WIDTH} ${HEADING_HEIGHT}">
      <rect x="1" y="1" width="${HEADING_WIDTH - 2}" height="${HEADING_HEIGHT - 2}" rx="18" fill="rgba(248,249,252,0.92)" stroke="rgba(71,85,105,0.28)" />
      <text x="18" y="28" fill="#0f172a" font-family="Georgia, serif" font-size="13" font-weight="700">QA Row</text>
      <text x="18" y="46" fill="#334155" font-family="Georgia, serif" font-size="18" font-weight="700">${label}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createHeadingCard(cards, viewport, rowLabel, rowIndex) {
  const card = createLinkCard(cards, viewport, "", {
    contentKind: LINK_CONTENT_KIND_IMAGE,
    title: rowLabel,
    siteName: TESTING_TILES_CANVAS_NAME,
    description: `QA category ${rowIndex + 1}`,
    image: createHeadingSvgDataUrl(rowLabel),
    status: "ready",
    width: HEADING_WIDTH,
    height: HEADING_HEIGHT,
  });

  return {
    ...card,
    x: HEADER_X,
    y: START_Y + (rowIndex * (CARD_HEIGHT + ROW_GAP)) + 104,
    width: HEADING_WIDTH,
    height: HEADING_HEIGHT,
  };
}

function createSeedLinkCard(cards, viewport, url, rowIndex, columnIndex) {
  const card = createLinkCard(cards, viewport, url, null, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  });

  return {
    ...card,
    x: START_X + (columnIndex * (CARD_WIDTH + COLUMN_GAP)),
    y: START_Y + (rowIndex * (CARD_HEIGHT + ROW_GAP)),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };
}

export function createTestingTilesWorkspace() {
  const workspace = createEmptyWorkspace();
  const activePage = workspace.pages[0];
  const nextCards = [];

  TESTING_TILE_ROWS.forEach((row, rowIndex) => {
    nextCards.push(createHeadingCard(nextCards, activePage.viewport, row.label, rowIndex));

    row.urls.forEach((url, columnIndex) => {
      nextCards.push(createSeedLinkCard(nextCards, activePage.viewport, url, rowIndex, columnIndex));
    });
  });

  const nextPage = {
    ...activePage,
    name: "Link Preview QA Matrix",
    viewport: {
      x: 64,
      y: 36,
      zoom: 0.64,
    },
    tiles: nextCards,
    cards: nextCards,
  };

  return {
    ...workspace,
    name: TESTING_TILES_CANVAS_NAME,
    activePageId: nextPage.id,
    pages: [nextPage],
    activePage: nextPage,
    viewport: nextPage.viewport,
    cards: nextCards,
    drawings: nextPage.drawings,
    qa: {
      purpose: TESTING_TILES_CANVAS_PURPOSE,
      version: 1,
      rows: TESTING_TILE_ROWS.map((row) => row.label),
    },
  };
}
