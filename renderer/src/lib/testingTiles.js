import {
  createEmptyWorkspace,
  createCodeCard,
  createNoteCard,
  createLinkCard,
  createTableCard,
  LINK_CONTENT_KIND_IMAGE,
} from "./workspace";

export const TESTING_TILES_CANVAS_NAME = "Testing Tiles";
export const TESTING_TILES_CANVAS_FILE_NAME = `${TESTING_TILES_CANVAS_NAME}.airpaste.json`;
export const TESTING_TILES_CANVAS_PURPOSE = "tile-qa";

const CARD_WIDTH = 340;
const CARD_HEIGHT = 280;
const ROW_GAP = 92;
const COLUMN_STRIDE = 520;
const HEADING_WIDTH = 260;
const HEADING_HEIGHT = 64;
const HEADER_X = 96;
const START_X = HEADER_X + HEADING_WIDTH + 56;
const START_Y = 120;

const TESTING_TILE_ROWS = Object.freeze([
  {
    key: "youtube-video",
    label: "YouTube / video",
    items: [
      { kind: "link", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      { kind: "link", url: "https://youtu.be/9bZkp7q19f0" },
      { kind: "link", url: "https://vimeo.com/76979871" },
      { kind: "link", url: "https://www.youtube.com/shorts/aqz-KE-bpKQ" },
    ],
  },
  {
    key: "social-links",
    label: "social links",
    items: [
      { kind: "link", url: "https://github.com/openai/openai-cookbook" },
      { kind: "link", url: "https://x.com/OpenAI" },
      { kind: "link", url: "https://www.linkedin.com/company/openai/" },
      { kind: "link", url: "https://www.reddit.com/r/programming/" },
    ],
  },
  {
    key: "docs-productivity",
    label: "docs/productivity",
    items: [
      { kind: "link", url: "https://docs.github.com/" },
      { kind: "link", url: "https://notion.so/" },
      { kind: "link", url: "https://www.figma.com/" },
      { kind: "link", url: "https://slack.com/" },
    ],
  },
  {
    key: "articles-blogs",
    label: "articles/blogs",
    items: [
      { kind: "link", url: "https://example.com/" },
      { kind: "link", url: "https://developer.mozilla.org/en-US/docs/Web/HTML" },
      { kind: "link", url: "https://blog.openai.com/" },
      { kind: "link", url: "https://vercel.com/blog" },
    ],
  },
  {
    key: "ecommerce",
    label: "ecommerce",
    items: [
      { kind: "link", url: "https://www.amazon.com/dp/B0C2S2K5QJ" },
      { kind: "link", url: "https://www.ebay.com/" },
      { kind: "link", url: "https://www.etsy.com/" },
      { kind: "link", url: "https://www.shopify.com/" },
    ],
  },
  {
    key: "cookie-banner-sites",
    label: "cookie-banner sites",
    items: [
      { kind: "link", url: "https://www.reuters.com/" },
      { kind: "link", url: "https://www.theguardian.com/international" },
      { kind: "link", url: "https://www.nytimes.com/" },
      { kind: "link", url: "https://www.bbc.com/" },
    ],
  },
  {
    key: "login-wall-sites",
    label: "login-wall sites",
    items: [
      { kind: "link", url: "https://www.linkedin.com/feed/" },
      { kind: "link", url: "https://www.instagram.com/openai/" },
      { kind: "link", url: "https://www.facebook.com/" },
      { kind: "link", url: "https://x.com/i/flow/login" },
    ],
  },
  {
    key: "iframe-blocked-sites",
    label: "iframe-blocked sites",
    items: [
      { kind: "link", url: "https://github.com/" },
      { kind: "link", url: "https://www.google.com/" },
      { kind: "link", url: "https://www.notion.so/" },
      { kind: "link", url: "https://www.figma.com/" },
    ],
  },
  {
    key: "broken-redirect-edge",
    label: "broken/redirect/edge cases",
    items: [
      { kind: "link", url: "https://httpbin.org/status/404" },
      { kind: "link", url: "https://httpbin.org/redirect/2" },
      { kind: "link", url: "https://httpbin.org/status/403" },
      { kind: "link", url: "https://expired.badssl.com/" },
    ],
  },
  {
    key: "notes-markdown",
    label: "Notes / Markdown",
    items: [
      {
        kind: "note",
        options: {
          title: "Future-me instructions",
          body: "## Before you ship\n\n- Re-run lint\n- Check edge cases\n- Leave a short migration note\n\n> If this breaks previews, revert the experiment first.",
          mode: "preview",
        },
      },
      {
        kind: "note",
        options: {
          title: "Technical documentation",
          body: "# Tile QA\n\n1. Open Testing Tiles\n2. Verify note rendering\n3. Verify table editing\n\n- Headings\n- Bullets\n- Links like [OpenAI](https://openai.com/)",
          mode: "preview",
        },
      },
      {
        kind: "note",
        options: {
          title: "Code snippet",
          body: "### Quick patch\n\n```js\nexport function clamp(value, min, max) {\n  return Math.min(max, Math.max(min, value));\n}\n```",
          mode: "preview",
          languageHints: ["js"],
        },
      },
      {
        kind: "note",
        options: {
          title: "Long note scroll test",
          body: "## Scroll test\n\nThis note exists to confirm long content wraps and scrolls cleanly.\n\n- Paragraph one with extra detail.\n- Paragraph two with extra detail.\n- Paragraph three with extra detail.\n\n> Keep typing inside the tile without triggering canvas shortcuts.\n\n### Reminder\n\nUse this space for larger technical scratchpads and postmortems.\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
          mode: "edit",
        },
      },
    ],
  },
  {
    key: "tables-databases",
    label: "Tables / Databases",
    items: [
      {
        kind: "table",
        options: {
          title: "Expenses",
          columns: [
            { id: "item", name: "Item", kind: "text" },
            { id: "cost", name: "Cost", kind: "number" },
            { id: "date", name: "Date", kind: "date" },
          ],
          rows: [
            { id: "r1", cells: { item: "Domain renewal", cost: "18", date: "2026-04-01" } },
            { id: "r2", cells: { item: "Cloud credits", cost: "120", date: "2026-04-14" } },
          ],
        },
      },
      {
        kind: "table",
        options: {
          title: "Asset list",
          columns: [
            { id: "asset", name: "Asset", kind: "text" },
            { id: "owner", name: "Owner", kind: "text" },
            { id: "notes", name: "Notes", kind: "text" },
          ],
          rows: [
            { id: "r1", cells: { asset: "Renderer bundle", owner: "Frontend", notes: "Watch chunk size" } },
            { id: "r2", cells: { asset: "Tile QA board", owner: "Product", notes: "Seed every tile type" } },
          ],
        },
      },
      {
        kind: "table",
        options: {
          title: "Leads / CRM",
          columns: [
            { id: "name", name: "Name", kind: "text" },
            { id: "stage", name: "Stage", kind: "text" },
            { id: "next", name: "Next step", kind: "date" },
          ],
          rows: [
            { id: "r1", cells: { name: "Northwind", stage: "Intro", next: "2026-05-01" } },
            { id: "r2", cells: { name: "Acme", stage: "Proposal", next: "2026-05-05" } },
          ],
        },
      },
      {
        kind: "table",
        options: {
          title: "Checkbox tracker",
          columns: [
            { id: "task", name: "Task", kind: "text" },
            { id: "done", name: "Done", kind: "checkbox" },
            { id: "eta", name: "ETA", kind: "date" },
          ],
          rows: [
            { id: "r1", cells: { task: "Seed note tiles", done: true, eta: "2026-04-29" } },
            { id: "r2", cells: { task: "Seed table tiles", done: false, eta: "2026-04-30" } },
          ],
        },
      },
    ],
  },
  {
    key: "development-technical",
    label: "Development / Technical",
    items: [
      {
        kind: "code",
        options: {
          title: "Start dev server",
          language: "bash",
          code: "npm run dev",
          wrap: true,
          showLineNumbers: true,
        },
      },
      {
        kind: "code",
        options: {
          title: "Extract URLs",
          language: "regex",
          code: "https?:\\/\\/[^\\s\\\"'<>]+",
          wrap: true,
          showLineNumbers: true,
        },
      },
      {
        kind: "code",
        options: {
          title: "Tile config JSON",
          language: "json",
          code: "{\n  \"type\": \"code\",\n  \"language\": \"bash\",\n  \"wrap\": true,\n  \"showLineNumbers\": true\n}",
          wrap: true,
          showLineNumbers: true,
        },
      },
      {
        kind: "code",
        options: {
          title: "Debounce helper",
          language: "javascript",
          code: "function debounce(fn, delay = 250) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), delay);\n  };\n}",
          wrap: true,
          showLineNumbers: true,
        },
      },
      {
        kind: "code",
        options: {
          title: "Recent records query",
          language: "sql",
          code: "SELECT id, title, created_at\nFROM tiles\nORDER BY created_at DESC\nLIMIT 20;",
          wrap: true,
          showLineNumbers: true,
        },
      },
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
  const card = createLinkCard(cards, viewport, "", null, {
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

function positionSeedCard(card, rowIndex, columnIndex) {
  return {
    ...card,
    x: START_X + (columnIndex * COLUMN_STRIDE),
    y: START_Y + (rowIndex * (CARD_HEIGHT + ROW_GAP)),
    width: Number.isFinite(card.width) ? card.width : CARD_WIDTH,
    height: Number.isFinite(card.height) ? card.height : CARD_HEIGHT,
  };
}

function createSeedTileCard(cards, viewport, item, rowIndex, columnIndex) {
  if (item.kind === "note") {
    return positionSeedCard(
      createNoteCard(cards, viewport, null, {
        width: CARD_WIDTH + 40,
        height: CARD_HEIGHT + 52,
        ...(item.options ?? {}),
      }),
      rowIndex,
      columnIndex,
    );
  }

  if (item.kind === "table") {
    return positionSeedCard(
      createTableCard(cards, viewport, null, {
        width: CARD_WIDTH + 140,
        height: CARD_HEIGHT + 36,
        ...(item.options ?? {}),
      }),
      rowIndex,
      columnIndex,
    );
  }

  if (item.kind === "code") {
    return positionSeedCard(
      createCodeCard(cards, viewport, null, {
        width: CARD_WIDTH + 120,
        height: CARD_HEIGHT + 48,
        ...(item.options ?? {}),
      }),
      rowIndex,
      columnIndex,
    );
  }

  return positionSeedCard(
    createLinkCard(cards, viewport, item.url, null, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    }),
    rowIndex,
    columnIndex,
  );
}

export function createTestingTilesWorkspace() {
  const workspace = createEmptyWorkspace();
  const activePage = workspace.pages[0];
  const nextCards = [];

  TESTING_TILE_ROWS.forEach((row, rowIndex) => {
    nextCards.push(createHeadingCard(nextCards, activePage.viewport, row.label, rowIndex));

    row.items.forEach((item, columnIndex) => {
      nextCards.push(createSeedTileCard(nextCards, activePage.viewport, item, rowIndex, columnIndex));
    });
  });

  const nextPage = {
    ...activePage,
    name: "Tile QA Matrix",
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
