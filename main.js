const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const workspaceService = require("./workspace-service");
const openGraphScraper = require("open-graph-scraper");
const cheerio = require("cheerio");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = require("playwright");
const { getCardStateFromResolvedPreview } = require("./preview/card-mapper");
const { PREVIEW_STATE_VALUES } = require("./preview/constants");
const {
  closePreviewBrowser: closeResolvedPreviewBrowser,
  resolveUrlToPreview,
} = require("./preview/resolve-preview");

const CONFIG_FILE_NAME = "config.json";
const TEMP_SUFFIX = ".tmp";
const BACKUP_SUFFIX = ".bak";
const PREVIEW_CAPTURE_TIMEOUT_MS = 15000;
const PREVIEW_NETWORK_IDLE_TIMEOUT_MS = 5000;
const PREVIEW_DOCUMENT_TIMEOUT_MS = 12000;
const PREVIEW_JPEG_QUALITY = 58;
const REMOTE_IMAGE_TIMEOUT_MS = 12000;
const REMOTE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PREVIEW_VIEWPORT = Object.freeze({
  width: 1280,
  height: 720,
});
const MUSIC_HOSTS = Object.freeze([
  "open.spotify.com",
  "spotify.link",
  "music.apple.com",
  "geo.music.apple.com",
  "music.youtube.com",
  "soundcloud.com",
  "bandcamp.com",
  "tidal.com",
  "listen.tidal.com",
  "deezer.com",
  "www.deezer.com",
]);

const NOTE_FOLDER_CARD_TYPE = "note-folder";
const FOLDER_CARD_TYPE = "folder";
const RACK_CARD_TYPE = "rack";
const AMAZON_PRODUCT_CARD_TYPE = "amazon-product";
const LINK_CONTENT_KIND_BOOKMARK = "bookmark";
const LINK_CONTENT_KIND_IMAGE = "image";
const NOTE_STYLE_TWO = "notes-2";
const NOTE_STYLE_THREE = "notes-3";
const NOTE_FOLDER_DEFAULT_TITLE = "Daily memo";
const NOTE_FOLDER_DEFAULT_DESCRIPTION = "Notes & Journaling";
const PREVIEW_REJECTION_PATTERNS = Object.freeze([
  "continue shopping",
  "continue to shopping",
  "sign in",
  "log in",
  "login",
  "captcha",
  "robot check",
  "unusual traffic",
  "access denied",
  "privacy notice",
  "cookie preferences",
  "consent",
  "verify you are human",
  "verify that you are human",
  "open in app",
  "download the app",
  "use the app",
  "service unavailable",
  "temporarily unavailable",
  "before you continue",
  "choose your location",
  "enable cookies",
]);
const PREVIEW_URL_REJECTION_PATTERNS = Object.freeze([
  "/ap/signin",
  "/login",
  "/signin",
  "/consent",
  "/privacy",
  "/captcha",
  "/errors/validatecaptcha",
  "/sorry/",
  "/continue",
  "/gp/cart",
  "/gp/buy",
  "/checkout",
  "/openinapp",
]);
const PREVIEW_IMAGE_REJECTION_PATTERNS = Object.freeze([
  "placeholder",
  "default",
  "sprite",
  "logo",
  "icon",
  "avatar",
  "favicon",
  "blank",
  "1x1",
  "spacer",
  "pixel",
  "consent",
  "captcha",
  "signin",
  "login",
  "openinapp",
]);
const PREVIEW_GENERIC_TITLES = Object.freeze([
  "home",
  "welcome",
  "sign in",
  "login",
  "open in app",
  "service unavailable",
  "access denied",
  "continue shopping",
  "privacy notice",
  "robot check",
]);

let mainWindow = null;
const previewJobs = new Map();
const workspaceQueues = new Map();
const cancelledPreviewJobs = new Set();
let previewBrowserPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function isFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeExternalUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Fall through and try an https-prefixed variant.
  }

  try {
    return new URL(`https://${trimmed}`).toString();
  } catch {
    return "";
  }
}

function defaultCardSize(type) {
  if (type === "link") {
    return { width: 340, height: 280 };
  }

  if (type === AMAZON_PRODUCT_CARD_TYPE) {
    return { width: 340, height: 388 };
  }

  if (type === RACK_CARD_TYPE) {
    return { width: 694, height: 126 };
  }

  if (type === FOLDER_CARD_TYPE) {
    return { width: 320, height: 220 };
  }

  if (type === NOTE_FOLDER_CARD_TYPE) {
    return { width: 360, height: 284 };
  }

  return { width: 428, height: 540 };
}

function defaultTextCardSize(noteStyle) {
  if (noteStyle === NOTE_STYLE_THREE) {
    return { width: 452, height: 468 };
  }

  return { width: 428, height: 540 };
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function getCardType(card) {
  if (card?.type === "link") {
    return "link";
  }

  if (card?.type === AMAZON_PRODUCT_CARD_TYPE) {
    return AMAZON_PRODUCT_CARD_TYPE;
  }

  if (card?.type === RACK_CARD_TYPE) {
    return RACK_CARD_TYPE;
  }

  if (card?.type === FOLDER_CARD_TYPE) {
    return FOLDER_CARD_TYPE;
  }

  if (card?.type === NOTE_FOLDER_CARD_TYPE) {
    return NOTE_FOLDER_CARD_TYPE;
  }

  return "text";
}

function normalizeLinkContentKind(contentKind, asset = null) {
  if (contentKind === LINK_CONTENT_KIND_IMAGE) {
    return LINK_CONTENT_KIND_IMAGE;
  }

  if (asset?.relativePath) {
    return LINK_CONTENT_KIND_IMAGE;
  }

  return LINK_CONTENT_KIND_BOOKMARK;
}

function isLinkLikeCardType(type) {
  return type === "link" || type === AMAZON_PRODUCT_CARD_TYPE;
}

function normalizeLinkAsset(asset) {
  if (!asset || typeof asset !== "object") {
    return null;
  }

  const relativePath = typeof asset.relativePath === "string" ? asset.relativePath.trim() : "";

  if (!relativePath) {
    return null;
  }

  return {
    relativePath,
    fileName: typeof asset.fileName === "string" ? asset.fileName : "",
    mimeType: typeof asset.mimeType === "string" ? asset.mimeType : "",
    sizeBytes: Number.isFinite(asset.sizeBytes) ? Math.max(0, asset.sizeBytes) : 0,
    width: Number.isFinite(asset.width) ? Math.max(0, asset.width) : 0,
    height: Number.isFinite(asset.height) ? Math.max(0, asset.height) : 0,
  };
}

function stripNoteLine(line) {
  return String(line ?? "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^(?:[-*•]\s*)?\[(?:\s|x|X)\]\s+/, "")
    .replace(/^(?:[-*•]\s+)/, "")
    .trim();
}

function getTextCardHeadline(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(stripNoteLine)
    .find(Boolean) ?? "";
}

function normalizeFolderNote(note, index = 0) {
  const createdAt = typeof note?.createdAt === "string" ? note.createdAt : nowIso();
  const updatedAt = typeof note?.updatedAt === "string" ? note.updatedAt : createdAt;

  return {
    id: typeof note?.id === "string" ? note.id : `note-${index}-${Date.now()}`,
    text: String(note?.text ?? ""),
    secondaryText: String(note?.secondaryText ?? ""),
    noteStyle: typeof note?.noteStyle === "string" ? note.noteStyle : NOTE_STYLE_TWO,
    quoteAuthor: String(note?.quoteAuthor ?? ""),
    createdAt,
    updatedAt,
  };
}

function normalizeFolderNotes(notes) {
  return Array.isArray(notes)
    ? notes.map((note, index) => normalizeFolderNote(note, index))
    : [];
}

function getFolderTitleFromNotes(notes) {
  return firstString(
    ...notes.map((note) => getTextCardHeadline(note.text)),
    NOTE_FOLDER_DEFAULT_TITLE,
  );
}

function normalizeCard(card, index = 0) {
  const type = getCardType(card);
  const isLinkLikeCard = isLinkLikeCardType(type);
  const linkAsset = type === "link" ? normalizeLinkAsset(card?.asset) : null;
  const contentKind = isLinkLikeCard
    ? normalizeLinkContentKind(card?.contentKind, linkAsset)
    : "";
  const noteStyle = type === "text" && typeof card?.noteStyle === "string"
    ? card.noteStyle
    : NOTE_STYLE_TWO;
  const size = type === "text" ? defaultTextCardSize(noteStyle) : defaultCardSize(type);
  const createdAt = typeof card?.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card?.updatedAt === "string" ? card.updatedAt : createdAt;
  const notes = type === NOTE_FOLDER_CARD_TYPE ? normalizeFolderNotes(card?.notes) : [];
  const tileIds = type === RACK_CARD_TYPE
    ? (Array.isArray(card?.tileIds)
      ? card.tileIds.filter((tileId) => typeof tileId === "string" && tileId.trim().length > 0)
      : [])
    : [];
  const minSlots = type === RACK_CARD_TYPE
    ? Math.max(3, isFiniteNumber(card?.minSlots, 3))
    : null;
  const childIds = type === FOLDER_CARD_TYPE
    ? (Array.isArray(card?.childIds)
      ? card.childIds.filter((childId) => typeof childId === "string" && childId.trim().length > 0)
      : [])
    : [];

  return {
    id: typeof card?.id === "string" ? card.id : `card-${index}-${Date.now()}`,
    type,
    x: isFiniteNumber(card?.x, 120 + (index % 3) * 28),
    y: isFiniteNumber(card?.y, 120 + index * 24),
    width: isFiniteNumber(card?.width, size.width),
    height: isFiniteNumber(card?.height, size.height),
    text: type === "text" ? String(card?.text ?? "") : "",
    secondaryText: type === "text" ? String(card?.secondaryText ?? "") : "",
    noteStyle: type === "text" ? noteStyle : "",
    quoteAuthor: type === "text" ? String(card?.quoteAuthor ?? "") : "",
    url: isLinkLikeCard ? String(card?.url ?? "") : "",
    contentKind,
    title: isLinkLikeCard
      ? String(card?.title ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.title, "Rack")
        : type === FOLDER_CARD_TYPE
          ? firstString(card?.title, "Folder")
          : type === NOTE_FOLDER_CARD_TYPE
            ? firstString(card?.title, getFolderTitleFromNotes(notes), NOTE_FOLDER_DEFAULT_TITLE)
            : "",
    description: isLinkLikeCard
      ? String(card?.description ?? "")
      : type === RACK_CARD_TYPE
        ? firstString(card?.description, "Mounted display rack")
        : type === FOLDER_CARD_TYPE
          ? firstString(card?.description, "Grouped tiles")
          : type === NOTE_FOLDER_CARD_TYPE
            ? firstString(card?.description, NOTE_FOLDER_DEFAULT_DESCRIPTION)
            : "",
    image: isLinkLikeCard ? String(card?.image ?? "") : "",
    favicon: isLinkLikeCard ? String(card?.favicon ?? "") : "",
    siteName: isLinkLikeCard ? String(card?.siteName ?? "") : "",
    previewKind: isLinkLikeCard && card?.previewKind === "music" ? "music" : "default",
    previewError: isLinkLikeCard ? String(card?.previewError ?? "") : "",
    status: isLinkLikeCard && PREVIEW_STATE_VALUES.includes(card?.status)
      ? card.status
      : "idle",
    asset: type === "link" ? linkAsset : null,
    productAsin: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productAsin ?? "") : "",
    productPrice: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productPrice ?? "") : "",
    productDomain: type === AMAZON_PRODUCT_CARD_TYPE ? String(card?.productDomain ?? "") : "",
    productRating: type === AMAZON_PRODUCT_CARD_TYPE && Number.isFinite(card?.productRating)
      ? Number(card.productRating)
      : null,
    productReviewCount: type === AMAZON_PRODUCT_CARD_TYPE && Number.isFinite(card?.productReviewCount)
      ? Math.max(0, Math.round(card.productReviewCount))
      : null,
    tileIds,
    minSlots,
    childIds,
    childLayouts: type === FOLDER_CARD_TYPE && card?.childLayouts && typeof card.childLayouts === "object"
      ? card.childLayouts
      : {},
    parentRackId: type !== RACK_CARD_TYPE && typeof card?.parentRackId === "string" && card.parentRackId.trim().length > 0
      ? card.parentRackId
      : null,
    rackIndex: type !== RACK_CARD_TYPE && Number.isFinite(card?.rackIndex)
      ? Math.max(0, Math.round(card.rackIndex))
      : null,
    notes,
    createdAt,
    updatedAt,
  };
}

function getConfigPath() {
  return path.join(app.getPath("userData"), CONFIG_FILE_NAME);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(folderPath) {
  try {
    const stats = await fs.stat(folderPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallbackValue;
    }
    throw error;
  }
}

async function safeWriteJson(filePath, data) {
  const directory = path.dirname(filePath);
  const opId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = `${filePath}${TEMP_SUFFIX}-${opId}`;
  const backupPath = `${filePath}${BACKUP_SUFFIX}-${opId}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, payload, "utf8");

  try {
    await fs.rm(backupPath, { force: true });
  } catch {
    // Ignore leftover backups from prior runs.
  }

  let movedPreviousFile = false;

  if (await pathExists(filePath)) {
    try {
      await fs.rename(filePath, backupPath);
      movedPreviousFile = true;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (movedPreviousFile) {
      await fs.rename(backupPath, filePath).catch(() => { });
    }
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => { });
    await fs.rm(backupPath, { force: true }).catch(() => { });
  }
}

function withWorkspaceQueue(folderPath, task) {
  const queueKey = typeof folderPath === "string" && folderPath
    ? path.resolve(folderPath)
    : "__invalid-workspace__";
  const previous = workspaceQueues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => { })
    .then(task);

  workspaceQueues.set(queueKey, next);

  return next.finally(() => {
    if (workspaceQueues.get(queueKey) === next) {
      workspaceQueues.delete(queueKey);
    }
  });
}

async function resolveWorkspaceQueueKeyForFile(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return "__invalid-workspace__";
  }

  let dir = path.dirname(path.resolve(filePath));

  while (true) {
    if (
      await pathExists(path.join(dir, "airpaste.json"))
      || await pathExists(path.join(dir, ".airpaste", "index.json"))
    ) {
      return dir;
    }

    const parent = path.dirname(dir);

    if (parent === dir) {
      return path.dirname(path.resolve(filePath));
    }

    dir = parent;
  }
}

async function readConfig() {
  return readJsonFile(getConfigPath(), { lastFolder: null });
}

async function writeConfig(config) {
  await safeWriteJson(getConfigPath(), {
    lastFolder: typeof config?.lastFolder === "string" ? config.lastFolder : null,
  });
}

async function setLastFolder(lastFolder) {
  await writeConfig({ lastFolder });
}

function getDevServerUrl() {
  return "http://127.0.0.1:5173";
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function resolveUrl(input, baseUrl) {
  const value = firstString(input);

  if (!value) {
    return "";
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function getUrlHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isMusicHost(url) {
  const hostname = getUrlHostname(url);
  return MUSIC_HOSTS.some((musicHost) => hostname === musicHost || hostname.endsWith(`.${musicHost}`));
}

function normalizeImageCandidate(candidate, baseUrl) {
  if (!candidate) {
    return null;
  }

  if (typeof candidate === "string") {
    const url = resolveUrl(candidate, baseUrl);
    return url ? { url, width: 0, height: 0 } : null;
  }

  if (typeof candidate !== "object") {
    return null;
  }

  const url = resolveUrl(
    firstString(candidate.url, candidate.secureUrl, candidate.secureURL),
    baseUrl,
  );

  if (!url) {
    return null;
  }

  const width = Number.parseInt(candidate.width, 10);
  const height = Number.parseInt(candidate.height, 10);

  return {
    url,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

function getImageCandidates(result, url) {
  const entries = [];
  const rawCandidates = [
    result?.ogImage,
    result?.twitterImage,
    result?.ogImage?.url,
    result?.twitterImage?.url,
  ].flat();

  for (const candidate of rawCandidates) {
    if (Array.isArray(candidate)) {
      for (const nestedCandidate of candidate) {
        const normalized = normalizeImageCandidate(nestedCandidate, url);
        if (normalized?.url) {
          entries.push(normalized);
        }
      }
      continue;
    }

    const normalized = normalizeImageCandidate(candidate, url);
    if (normalized?.url) {
      entries.push(normalized);
    }
  }

  return entries;
}

function scoreImageCandidate(candidate) {
  if (!candidate?.url) {
    return -1;
  }

  const largestSide = Math.max(candidate.width || 0, candidate.height || 0);
  const squareness = candidate.width > 0 && candidate.height > 0
    ? 1 - Math.abs(candidate.width - candidate.height) / Math.max(candidate.width, candidate.height)
    : 0.4;

  return largestSide + squareness * 500;
}

function uniqueValues(values) {
  return [...new Set(
    values
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function isDirectImageUrl(url) {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(url);
}

function isLikelyPreviewImageUrl(url) {
  if (!url) {
    return false;
  }

  const normalizedUrl = String(url).toLowerCase();

  if (
    normalizedUrl.includes(".mp4")
    || normalizedUrl.includes(".m3u8")
    || normalizedUrl.includes(".mov")
    || normalizedUrl.includes("video.twimg.com/")
    || normalizedUrl.includes("/amplify_video/")
    || normalizedUrl.includes("/tweet_video/")
  ) {
    return false;
  }

  return isDirectImageUrl(normalizedUrl)
    || normalizedUrl.includes("pbs.twimg.com/media/")
    || normalizedUrl.includes("pbs.twimg.com/ext_tw_video_thumb/")
    || normalizedUrl.includes("i.pinimg.com/")
    || normalizedUrl.includes("i.ytimg.com/");
}

function isSpotifyHost(url) {
  return /(?:^|\.)spotify(?:\.com|\.link)$/i.test(getUrlHostname(url));
}

function isYouTubeHost(url) {
  return /(?:^|\.)youtube\.com$/i.test(getUrlHostname(url)) || /(?:^|\.)youtu\.be$/i.test(getUrlHostname(url));
}

function isTwitterHost(url) {
  return /(?:^|\.)x\.com$/i.test(getUrlHostname(url)) || /(?:^|\.)twitter\.com$/i.test(getUrlHostname(url));
}

function isBlockedPreviewImageUrl(url) {
  if (!url) {
    return true;
  }

  const normalizedUrl = url.toLowerCase();

  return normalizedUrl.includes("abs.twimg.com/emoji/")
    || normalizedUrl.includes("abs.twimg.com/rweb/ssr/default/v2/og/image.png")
    || normalizedUrl.includes("client-web/icon")
    || normalizedUrl.includes("/favicon")
    || normalizedUrl.includes("/profile_images/")
    || normalizedUrl.includes("/semantic_core_img/");
}

function chooseBestArtworkUrl(result, pageUrl) {
  const candidates = getImageCandidates(result, pageUrl);

  if (candidates.length === 0) {
    return "";
  }

  candidates.sort((leftCandidate, rightCandidate) => (
    scoreImageCandidate(rightCandidate) - scoreImageCandidate(leftCandidate)
  ));

  return candidates[0].url;
}

function upgradeArtworkUrl(url) {
  if (!url) {
    return "";
  }

  let nextUrl = url;

  nextUrl = nextUrl.replace(/https:\/\/image-cdn-[^/]+\.spotifycdn\.com\/image\//i, "https://i.scdn.co/image/");
  nextUrl = nextUrl.replace(/00001e02/ig, "0000b273");
  nextUrl = nextUrl.replace(/00004851/ig, "0000b273");

  // Apple Music / iTunes art can usually be requested at a larger square size.
  nextUrl = nextUrl.replace(/\/\d{2,4}x\d{2,4}(?:bb|sr)(?=[./?])/i, "/1600x1600bb");

  // Deezer cover assets expose size in-path.
  nextUrl = nextUrl.replace(/\/cover\/\d+x\d+-/i, "/cover/1000x1000-");

  // Pinterest serves a higher-quality original file under the originals path.
  nextUrl = nextUrl.replace(/i\.pinimg\.com\/(?:\d+x|\d+x\d+_RS)\//i, "i.pinimg.com/originals/");

  // Prefer the original media size on X / Twitter image hosts.
  if (/pbs\.twimg\.com\/media\//i.test(nextUrl) || /pbs\.twimg\.com\/ext_tw_video_thumb\//i.test(nextUrl)) {
    if (/[?&]name=/i.test(nextUrl)) {
      nextUrl = nextUrl.replace(/([?&]name=)(?:small|medium|large|900x900|orig)/i, "$1orig");
    } else {
      nextUrl = `${nextUrl}${nextUrl.includes("?") ? "&" : "?"}name=orig`;
    }
  }

  nextUrl = nextUrl.replace(/\/(?:hqdefault|mqdefault|sddefault)\.jpg(?=$|[?#])/i, "/maxresdefault.jpg");

  return nextUrl;
}

async function fetchImageDataUrl(url) {
  if (!url) {
    return "";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return "";
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);

    if (!contentType.startsWith("image/")) {
      return "";
    }

    if (Number.isFinite(contentLength) && contentLength > REMOTE_IMAGE_MAX_BYTES) {
      return "";
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > REMOTE_IMAGE_MAX_BYTES) {
      return "";
    }

    return bufferToDataUrl(buffer, contentType);
  } catch {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

async function fetchPreviewDocument(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PREVIEW_DOCUMENT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const html = contentType.includes("text/html") ? await response.text() : "";

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      contentType,
      html,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      html: "",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractPreviewDocumentSignals(documentSnapshot) {
  const html = typeof documentSnapshot?.html === "string" ? documentSnapshot.html : "";

  if (!html) {
    return {
      pageTitle: "",
      bodyText: "",
      faviconUrl: "",
      ogTitle: "",
      ogDescription: "",
      ogImageUrl: "",
    };
  }

  const $ = cheerio.load(html);
  const pageTitle = cleanAmazonText($("title").first().text());
  const bodyText = cleanAmazonText($("body").text()).slice(0, 8000);
  const faviconUrl = resolveUrl(
    firstString(
      $("link[rel='icon']").attr("href"),
      $("link[rel='shortcut icon']").attr("href"),
      $("link[rel='apple-touch-icon']").attr("href"),
    ),
    documentSnapshot.finalUrl,
  );

  return {
    pageTitle,
    bodyText,
    faviconUrl,
    ogTitle: cleanAmazonText($("meta[property='og:title']").attr("content")),
    ogDescription: cleanAmazonText($("meta[property='og:description']").attr("content")),
    ogImageUrl: resolveUrl($("meta[property='og:image']").attr("content"), documentSnapshot.finalUrl),
  };
}

function normalizePreviewText(value) {
  return cleanAmazonText(value).toLowerCase();
}

function looksLikeGenericTitle(title, url, siteName = "") {
  const normalizedTitle = normalizePreviewText(title);

  if (!normalizedTitle) {
    return true;
  }

  const hostname = normalizePreviewText(getHostname(url));
  const normalizedSiteName = normalizePreviewText(siteName);

  return PREVIEW_GENERIC_TITLES.includes(normalizedTitle)
    || normalizedTitle === hostname
    || normalizedTitle === normalizedSiteName
    || normalizedTitle === `www.${hostname}`
    || normalizedTitle.length <= 3;
}

function looksLikeLowInformationDescription(description) {
  const normalizedDescription = normalizePreviewText(description);

  return !normalizedDescription
    || normalizedDescription.length < 24
    || PREVIEW_REJECTION_PATTERNS.some((pattern) => normalizedDescription.includes(pattern));
}

function isRejectedPreviewImageUrl(url) {
  const normalizedUrl = String(url ?? "").toLowerCase();

  if (!normalizedUrl) {
    return true;
  }

  return PREVIEW_IMAGE_REJECTION_PATTERNS.some((pattern) => normalizedUrl.includes(pattern))
    || isBlockedPreviewImageUrl(normalizedUrl)
    || isRejectedAmazonImageUrl(normalizedUrl);
}

function validatePreviewCandidate({
  originalUrl,
  finalUrl,
  title,
  description,
  imageUrl,
  pageTitle,
  bodyText,
}) {
  const normalizedFinalUrl = String(finalUrl || originalUrl || "").toLowerCase();
  const normalizedTitle = normalizePreviewText(title || pageTitle);
  const normalizedDescription = normalizePreviewText(description);
  const normalizedBodyText = normalizePreviewText(bodyText).slice(0, 5000);
  const rejectionPattern = PREVIEW_REJECTION_PATTERNS.find((pattern) => (
    normalizedTitle.includes(pattern)
    || normalizedDescription.includes(pattern)
    || normalizedBodyText.includes(pattern)
  ));
  const urlPattern = PREVIEW_URL_REJECTION_PATTERNS.find((pattern) => normalizedFinalUrl.includes(pattern));
  const rejectImage = isRejectedPreviewImageUrl(imageUrl);
  const genericTitle = looksLikeGenericTitle(title || pageTitle, finalUrl || originalUrl);
  const lowInformationDescription = looksLikeLowInformationDescription(description);

  if (urlPattern || rejectionPattern) {
    return {
      isRejected: true,
      rejectImage: true,
      rejectMetadata: true,
      reason: "Preview unavailable",
    };
  }

  if (genericTitle && lowInformationDescription && rejectImage) {
    return {
      isRejected: true,
      rejectImage: true,
      rejectMetadata: true,
      reason: "Preview unavailable",
    };
  }

  return {
    isRejected: false,
    rejectImage,
    rejectMetadata: false,
    reason: rejectImage ? "Preview image unavailable" : "",
  };
}

function normalizeAmazonDomain(hostname) {
  const match = String(hostname ?? "").toLowerCase().match(/(?:^|\.)((?:smile\.)?amazon\.[a-z.]+)$/i);

  if (!match?.[1]) {
    return "";
  }

  return match[1].replace(/^smile\./, "");
}

function isAmazonHost(url) {
  const hostname = typeof url === "string" && url.includes("://")
    ? getUrlHostname(url)
    : normalizeAmazonDomain(url);

  return Boolean(normalizeAmazonDomain(hostname));
}

function extractAmazonAsin(url) {
  try {
    const parsedUrl = new URL(url);
    const patterns = [
      /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/offer-listing\/([A-Z0-9]{10})(?:[/?]|$)/i,
    ];

    for (const pattern of patterns) {
      const match = parsedUrl.pathname.match(pattern);

      if (match?.[1]) {
        return match[1].toUpperCase();
      }
    }

    const queryAsin = firstString(
      parsedUrl.searchParams.get("asin"),
      parsedUrl.searchParams.get("ASIN"),
    );

    if (/^[A-Z0-9]{10}$/i.test(queryAsin)) {
      return queryAsin.toUpperCase();
    }

    return "";
  } catch {
    return "";
  }
}

function buildAmazonCanonicalUrl(domain, asin) {
  if (!domain || !asin) {
    return "";
  }

  return `https://${domain}/dp/${asin}`;
}

function extractJsonLdNodes(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    const nodes = [];

    function visit(value) {
      if (!value) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      if (typeof value !== "object") {
        return;
      }

      nodes.push(value);

      if (Array.isArray(value["@graph"])) {
        value["@graph"].forEach(visit);
      }
    }

    visit(parsedValue);
    return nodes;
  } catch {
    return [];
  }
}

function getJsonLdProductNode($) {
  const scripts = $("script[type='application/ld+json']").toArray();

  for (const script of scripts) {
    const nodes = extractJsonLdNodes($(script).contents().text());

    for (const node of nodes) {
      const nodeTypes = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];

      if (nodeTypes.some((value) => String(value).toLowerCase() === "product")) {
        return node;
      }
    }
  }

  return null;
}

function cleanAmazonText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\u200e|\u200f/g, "")
    .trim();
}

function parseAmazonRatingValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value);
  }

  const match = cleanAmazonText(value).match(/(\d+(?:[.,]\d+)?)/);

  if (!match) {
    return null;
  }

  const numericValue = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseAmazonReviewCount(value) {
  const digits = cleanAmazonText(value).replace(/[^\d]/g, "");

  if (!digits) {
    return null;
  }

  const numericValue = Number.parseInt(digits, 10);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseAmazonPriceValue(value, currency = "") {
  const text = cleanAmazonText(value);

  if (!text) {
    return "";
  }

  const normalizedCurrency = cleanAmazonText(currency);
  return normalizedCurrency && !text.includes(normalizedCurrency)
    ? `${normalizedCurrency} ${text}`.trim()
    : text;
}

function getLargestAmazonDynamicImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const parsedValue = JSON.parse(value);
    const entries = Object.entries(parsedValue);

    entries.sort((leftEntry, rightEntry) => {
      const leftSize = Array.isArray(leftEntry[1]) ? Math.max(...leftEntry[1].map((size) => Number(size) || 0)) : 0;
      const rightSize = Array.isArray(rightEntry[1]) ? Math.max(...rightEntry[1].map((size) => Number(size) || 0)) : 0;
      return rightSize - leftSize;
    });

    return entries[0]?.[0] ?? "";
  } catch {
    return "";
  }
}

function isAmazonPreviewRejectionText(text) {
  const normalizedText = cleanAmazonText(text).toLowerCase();

  if (!normalizedText) {
    return false;
  }

  return [
    "enter the characters you see below",
    "sorry, we just need to make sure you're not a robot",
    "robot check",
    "type the characters you see in this image",
    "captcha",
    "continue shopping",
    "proceed to checkout",
    "amazon sign-in",
    "sign in to your account",
    "choose your location",
    "enable cookies to continue",
    "consent",
  ].some((needle) => normalizedText.includes(needle));
}

function isRejectedAmazonImageUrl(url) {
  const normalizedUrl = String(url ?? "").toLowerCase();

  if (!normalizedUrl) {
    return true;
  }

  return normalizedUrl.includes("nav2")
    || normalizedUrl.includes("sprite")
    || normalizedUrl.includes("icon")
    || normalizedUrl.includes("logo")
    || normalizedUrl.includes("transparent-pixel")
    || normalizedUrl.includes("gp/aw")
    || normalizedUrl.includes("amazon-adsystem");
}

async function fetchAmazonProductPreview(url) {
  if (!isAmazonHost(url)) {
    return null;
  }

  const originalAsin = extractAmazonAsin(url);

  if (!originalAsin) {
    return null;
  }

  const originalDomain = normalizeAmazonDomain(getUrlHostname(url)) || "amazon.com";
  const canonicalUrl = buildAmazonCanonicalUrl(originalDomain, originalAsin);

  try {
    const response = await fetch(canonicalUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return {
        handled: true,
        cardType: "link",
        canonicalUrl,
        title: "Amazon product",
        siteName: originalDomain,
        imageUrls: [],
        allowScreenshot: false,
        skipGenericMetadata: true,
      };
    }

    const finalUrl = response.url || canonicalUrl;
    const finalDomain = normalizeAmazonDomain(getUrlHostname(finalUrl)) || originalDomain;
    const finalAsin = extractAmazonAsin(finalUrl) || originalAsin;
    const normalizedUrl = buildAmazonCanonicalUrl(finalDomain, finalAsin);
    const html = await response.text();
    const $ = cheerio.load(html);
    const pageTitle = cleanAmazonText($("title").first().text());
    const bodyText = cleanAmazonText($("body").text()).slice(0, 6000);

    if (
      isAmazonPreviewRejectionText(pageTitle)
      || isAmazonPreviewRejectionText(bodyText)
      || (!$("#productTitle").length && !html.includes('"@type":"Product"') && !html.includes('"@type": "Product"'))
    ) {
      return {
        handled: true,
        cardType: "link",
        canonicalUrl: normalizedUrl,
        title: "Amazon product",
        siteName: finalDomain,
        imageUrls: [],
        allowScreenshot: false,
        skipGenericMetadata: true,
        productAsin: finalAsin,
      };
    }

    const productNode = getJsonLdProductNode($);
    const title = firstString(
      cleanAmazonText($("#productTitle").first().text()),
      cleanAmazonText(productNode?.name),
      cleanAmazonText($("meta[name='title']").attr("content")),
    );
    const description = firstString(
      cleanAmazonText($("#feature-bullets ul li span.a-list-item").first().text()),
      cleanAmazonText($("meta[name='description']").attr("content")),
      cleanAmazonText(productNode?.description),
    );
    const imageUrls = uniqueValues([
      firstString($("#landingImage").attr("data-old-hires")),
      getLargestAmazonDynamicImageUrl($("#landingImage").attr("data-a-dynamic-image")),
      firstString($("#imgTagWrapperId img").attr("data-old-hires")),
      getLargestAmazonDynamicImageUrl($("#imgTagWrapperId img").attr("data-a-dynamic-image")),
      firstString(productNode?.image),
      ...(Array.isArray(productNode?.image) ? productNode.image : []),
      firstString($("meta[property='og:image']").attr("content")),
    ]).filter((candidateUrl) => !isRejectedAmazonImageUrl(candidateUrl));
    const offer = Array.isArray(productNode?.offers) ? productNode.offers[0] : productNode?.offers;
    const aggregateRating = Array.isArray(productNode?.aggregateRating)
      ? productNode.aggregateRating[0]
      : productNode?.aggregateRating;
    const price = firstString(
      parseAmazonPriceValue($(".a-price.aok-align-center .a-offscreen").first().text()),
      parseAmazonPriceValue($(".a-price .a-offscreen").first().text()),
      parseAmazonPriceValue(offer?.price, offer?.priceCurrency),
    );
    const rating = parseAmazonRatingValue(
      firstString(
        $("#acrPopover").attr("title"),
        $("[data-hook='rating-out-of-text']").first().text(),
        aggregateRating?.ratingValue,
      ),
    );
    const reviewCount = parseAmazonReviewCount(
      firstString(
        $("#acrCustomerReviewText").first().text(),
        $("[data-hook='total-review-count']").first().text(),
        aggregateRating?.reviewCount,
      ),
    );

    if (!title && imageUrls.length === 0) {
      return {
        handled: true,
        cardType: "link",
        canonicalUrl: normalizedUrl,
        title: "Amazon product",
        siteName: finalDomain,
        imageUrls: [],
        allowScreenshot: false,
        skipGenericMetadata: true,
        productAsin: finalAsin,
      };
    }

    return {
      handled: true,
      cardType: AMAZON_PRODUCT_CARD_TYPE,
      canonicalUrl: normalizedUrl,
      title: title || "Amazon product",
      description,
      siteName: finalDomain,
      imageUrls,
      allowScreenshot: false,
      skipGenericMetadata: true,
      productAsin: finalAsin,
      productPrice: price,
      productDomain: finalDomain,
      productRating: rating,
      productReviewCount: reviewCount,
      previewKind: "default",
    };
  } catch {
    return {
      handled: true,
      cardType: "link",
      canonicalUrl,
      title: "Amazon product",
      siteName: originalDomain,
      imageUrls: [],
      allowScreenshot: false,
      skipGenericMetadata: true,
      productAsin: originalAsin,
    };
  }
}

function parseYouTubeVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname === "youtu.be") {
      return parsedUrl.pathname.slice(1);
    }

    if (!hostname.endsWith("youtube.com")) {
      return "";
    }

    if (parsedUrl.pathname === "/watch") {
      return parsedUrl.searchParams.get("v") ?? "";
    }

    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") {
      return segments[1] ?? "";
    }

    return "";
  } catch {
    return "";
  }
}

function parseTweetIdentity(url) {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (segments.length < 3) {
      return null;
    }

    const statusIndex = segments.findIndex((segment) => segment === "status");

    if (statusIndex < 1 || statusIndex === segments.length - 1) {
      return null;
    }

    return {
      username: segments[statusIndex - 1],
      tweetId: segments[statusIndex + 1],
    };
  } catch {
    return null;
  }
}

async function fetchSpotifyOEmbedPreview(url) {
  if (!isSpotifyHost(url)) {
    return null;
  }

  const payload = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);

  if (!payload?.thumbnail_url) {
    return null;
  }

  return {
    title: firstString(payload.title),
    description: "",
    siteName: firstString(payload.provider_name, "Spotify"),
    imageUrls: [payload.thumbnail_url],
    previewKind: "music",
  };
}

function fetchYouTubePreview(url) {
  if (!isYouTubeHost(url)) {
    return null;
  }

  const videoId = parseYouTubeVideoId(url);

  if (!videoId) {
    return null;
  }

  return {
    title: "",
    description: "",
    siteName: "YouTube",
    imageUrls: [
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ],
    previewKind: "default",
  };
}

async function fetchVxTwitterPreview(url) {
  if (!isTwitterHost(url)) {
    return null;
  }

  const identity = parseTweetIdentity(url);

  if (!identity?.tweetId) {
    return null;
  }

  const payload = await fetchJson(`https://api.vxtwitter.com/${identity.username}/status/${identity.tweetId}`);

  if (!payload) {
    return null;
  }

  const mediaUrls = uniqueValues([
    ...(Array.isArray(payload.media_extended)
      ? payload.media_extended.flatMap((media) => [
        media?.thumbnail_url,
        media?.image,
        media?.url,
      ])
      : []),
    ...(Array.isArray(payload.mediaURLs) ? payload.mediaURLs : []),
  ]).filter((candidateUrl) => isLikelyPreviewImageUrl(candidateUrl));

  if (mediaUrls.length === 0) {
    return null;
  }

  return {
    title: "",
    description: firstString(payload.text),
    siteName: "X (formerly Twitter)",
    imageUrls: mediaUrls,
    previewKind: "default",
  };
}

async function fetchProviderPreview(url) {
  if (isDirectImageUrl(url)) {
    return {
      title: "",
      description: "",
      siteName: getHostname(url),
      imageUrls: [url],
      previewKind: "default",
    };
  }

  const spotifyPreview = await fetchSpotifyOEmbedPreview(url);
  if (spotifyPreview) {
    return spotifyPreview;
  }

  const youtubePreview = fetchYouTubePreview(url);
  if (youtubePreview) {
    return youtubePreview;
  }

  const twitterPreview = await fetchVxTwitterPreview(url);
  if (twitterPreview) {
    return twitterPreview;
  }

  return null;
}

async function fetchDomainSpecificPreview(url) {
  const amazonPreview = await fetchAmazonProductPreview(url);

  if (amazonPreview?.handled) {
    return amazonPreview;
  }

  return null;
}

async function resolvePreviewImage(candidateUrls) {
  const uniqueCandidates = uniqueValues(candidateUrls)
    .map((candidateUrl) => upgradeArtworkUrl(candidateUrl))
    .filter((candidateUrl) => (
      candidateUrl
      && !isBlockedPreviewImageUrl(candidateUrl)
      && isLikelyPreviewImageUrl(candidateUrl)
    ));

  let remoteFallbackUrl = "";

  for (const candidateUrl of uniqueCandidates) {
    if (!remoteFallbackUrl && isLikelyPreviewImageUrl(candidateUrl)) {
      remoteFallbackUrl = candidateUrl;
    }

    const dataUrl = await fetchImageDataUrl(candidateUrl);

    if (dataUrl) {
      return dataUrl;
    }
  }

  return remoteFallbackUrl;
}

function bufferToDataUrl(buffer, mimeType) {
  if (!buffer || !mimeType) {
    return "";
  }

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function getPreviewBrowser() {
  if (!previewBrowserPromise) {
    previewBrowserPromise = chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage"],
    })
      .then((browser) => {
        browser.on("disconnected", () => {
          previewBrowserPromise = null;
        });

        return browser;
      })
      .catch((error) => {
        previewBrowserPromise = null;
        throw error;
      });
  }

  return previewBrowserPromise;
}

// Legacy preview helpers remain temporarily while the new typed resolver path settles.
// eslint-disable-next-line no-unused-vars
async function closePreviewBrowser() {
  const browserPromise = previewBrowserPromise;
  previewBrowserPromise = null;

  if (!browserPromise) {
    return;
  }

  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // Ignore shutdown issues during app exit.
  }
}

async function capturePreviewScreenshot(url) {
  let context = null;

  try {
    const browser = await getPreviewBrowser();
    context = await browser.newContext({
      viewport: PREVIEW_VIEWPORT,
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    page.setDefaultNavigationTimeout(PREVIEW_CAPTURE_TIMEOUT_MS);
    page.setDefaultTimeout(PREVIEW_CAPTURE_TIMEOUT_MS);

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: PREVIEW_NETWORK_IDLE_TIMEOUT_MS }).catch(() => { });
    await page.addStyleTag({
      content: [
        "*, *::before, *::after {",
        "  animation-duration: 0s !important;",
        "  animation-delay: 0s !important;",
        "  transition-duration: 0s !important;",
        "  caret-color: transparent !important;",
        "}",
      ].join("\n"),
    }).catch(() => { });

    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: PREVIEW_JPEG_QUALITY,
      fullPage: false,
    });

    return bufferToDataUrl(screenshot, "image/jpeg");
  } catch {
    return "";
  } finally {
    await context?.close().catch(() => { });
  }
}

async function fetchOpenGraphMetadata(url) {
  try {
    const { error, result } = await openGraphScraper({
      url,
      timeout: 10000,
    });

    if (error || !result) {
      return {
        title: "",
        description: "",
        siteName: "",
        favicon: "",
        imageUrl: "",
        previewKind: "default",
      };
    }

    const ogType = firstString(result.ogType).toLowerCase();
    const previewKind = isMusicHost(url) || ogType.startsWith("music.")
      ? "music"
      : "default";

    return {
      title: firstString(
        result.ogTitle,
        result.twitterTitle,
        result.dcTitle,
        result.title,
      ),
      description: firstString(
        result.ogDescription,
        result.twitterDescription,
        result.description,
      ),
      siteName: firstString(
        result.ogSiteName,
        result.twitterSite,
      ),
      favicon: resolveUrl(result.favicon, url),
      imageUrl: chooseBestArtworkUrl(result, url),
      previewKind,
    };
  } catch {
    return {
      title: "",
      description: "",
      siteName: "",
      favicon: "",
      imageUrl: "",
      previewKind: "default",
    };
  }
}

// eslint-disable-next-line no-unused-vars
async function fetchPreviewData(url) {
  const domainSpecificPreview = await fetchDomainSpecificPreview(url);
  const previewUrl = domainSpecificPreview?.canonicalUrl || url;
  const documentSnapshot = await fetchPreviewDocument(previewUrl);
  const documentSignals = extractPreviewDocumentSignals(documentSnapshot);
  const resolvedUrl = documentSnapshot.finalUrl || previewUrl;
  const hostname = getHostname(previewUrl);
  const [metadata, providerPreview] = await Promise.all([
    domainSpecificPreview?.skipGenericMetadata
      ? Promise.resolve({
        title: "",
        description: "",
        siteName: "",
        favicon: "",
        imageUrl: "",
        previewKind: "default",
      })
      : fetchOpenGraphMetadata(resolvedUrl),
    fetchProviderPreview(resolvedUrl),
  ]);
  const candidateImageUrl = firstString(
    ...(domainSpecificPreview?.imageUrls ?? []),
    ...(providerPreview?.imageUrls ?? []),
    metadata.imageUrl,
    documentSignals.ogImageUrl,
  );
  const validation = validatePreviewCandidate({
    originalUrl: url,
    finalUrl: resolvedUrl,
    title: domainSpecificPreview?.title || providerPreview?.title || metadata.title || documentSignals.ogTitle || documentSignals.pageTitle,
    description: domainSpecificPreview?.description || providerPreview?.description || metadata.description || documentSignals.ogDescription,
    imageUrl: candidateImageUrl,
    pageTitle: documentSignals.pageTitle,
    bodyText: documentSignals.bodyText,
  });
  const image = validation.rejectImage
    ? ""
    : await resolvePreviewImage([
    ...(domainSpecificPreview?.imageUrls ?? []),
    ...(providerPreview?.imageUrls ?? []),
    metadata.imageUrl,
    documentSignals.ogImageUrl,
  ]);
  const previewKind = image && (
    domainSpecificPreview?.previewKind === "music"
    || providerPreview?.previewKind === "music"
    || metadata.previewKind === "music"
  )
    ? "music"
    : "default";
  const finalImage = image || (
    validation.rejectImage
    || validation.isRejected
    || domainSpecificPreview?.allowScreenshot === false
      ? ""
      : (
        await capturePreviewScreenshot(resolvedUrl)
      )
  );
  const fallbackTitle = firstString(
    domainSpecificPreview?.title,
    providerPreview?.title,
    metadata.title,
    documentSignals.ogTitle,
    documentSignals.pageTitle,
  );
  const fallbackDescription = validation.isRejected
    ? ""
    : firstString(
      domainSpecificPreview?.description,
      providerPreview?.description,
      metadata.description,
      documentSignals.ogDescription,
    );
  const fallbackSiteName = firstString(
    domainSpecificPreview?.siteName,
    providerPreview?.siteName,
    metadata.siteName,
    getHostname(resolvedUrl),
  );
  const safeTitle = looksLikeGenericTitle(fallbackTitle, resolvedUrl, fallbackSiteName)
    ? fallbackSiteName || hostname
    : fallbackTitle;
  const safeFavicon = documentSignals.faviconUrl || metadata.favicon;
  const hasPreviewData = Boolean(
    safeTitle
    || fallbackDescription
    || fallbackSiteName
    || safeFavicon
    || finalImage
    || domainSpecificPreview?.productPrice
  );
  const safeStatus = hasPreviewData ? "ready" : "failed";
  const safePreviewError = validation.isRejected
    ? "Preview unavailable"
    : finalImage
      ? ""
      : validation.rejectImage
        ? "Preview image unavailable"
        : (domainSpecificPreview?.imageUrls?.length || providerPreview?.imageUrls?.length)
          ? "The source exposed media, but AirPaste could not turn it into a preview image."
          : "This page did not expose a usable preview image.";

  return {
    cardType: validation.isRejected ? "link" : (domainSpecificPreview?.cardType || "link"),
    url: resolvedUrl,
    status: safeStatus,
    title: safeTitle || hostname,
    description: fallbackDescription,
    image: finalImage,
    favicon: safeFavicon,
    siteName: fallbackSiteName || hostname,
    previewKind,
    previewError: safePreviewError,
    productAsin: validation.isRejected ? "" : (domainSpecificPreview?.productAsin || ""),
    productPrice: validation.isRejected ? "" : (domainSpecificPreview?.productPrice || ""),
    productDomain: validation.isRejected ? "" : (domainSpecificPreview?.productDomain || ""),
    productRating: validation.isRejected
      ? null
      : (Number.isFinite(domainSpecificPreview?.productRating) ? Number(domainSpecificPreview.productRating) : null),
    productReviewCount: validation.isRejected
      ? null
      : (Number.isFinite(domainSpecificPreview?.productReviewCount) ? Math.round(domainSpecificPreview.productReviewCount) : null),
  };
}

async function updateCardPreview(folderPath, cardId, url, cardSnapshot) {
  const jobKey = `${folderPath}:${cardId}`;

  if (cancelledPreviewJobs.has(jobKey)) {
    return null;
  }

  const resolvedPreview = await resolveUrlToPreview(url);

  if (cancelledPreviewJobs.has(jobKey)) {
    return null;
  }

  const workspace = await workspaceService.readWorkspaceDocument(folderPath);
  let cardIndex = workspace.cards.findIndex((card) => card.id === cardId);

  if (cardIndex === -1 && cardSnapshot && !cancelledPreviewJobs.has(jobKey)) {
    const placeholderCard = normalizeCard(cardSnapshot, workspace.cards.length);
    workspace.cards.push(placeholderCard);
    cardIndex = workspace.cards.length - 1;
  }

  if (cardIndex === -1) {
    return null;
  }

  const currentCard = workspace.cards[cardIndex];
  const previewCardState = getCardStateFromResolvedPreview(
    currentCard,
    resolvedPreview,
    defaultCardSize,
  );
  const nextCard = normalizeCard({
    ...currentCard,
    ...previewCardState,
    updatedAt: nowIso(),
  });

  workspace.cards.splice(cardIndex, 1, nextCard);
  await workspaceService.saveWorkspace(folderPath, workspace);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("airpaste:previewUpdated", {
      folderPath,
      card: nextCard,
    });
  }

  return nextCard;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#1e1e1e",
    frame: false,
    titleBarStyle: "hidden",
    show: false,
    title: "AirPaste",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    const isInternalDevServer = !app.isPackaged && url.startsWith(getDevServerUrl());

    if (url !== currentUrl && !isInternalDevServer) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(__dirname, "dist-renderer", "index.html"));
  } else {
    await mainWindow.loadURL(getDevServerUrl());
  }
}

ipcMain.handle("airpaste:openFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("airpaste:getLastFolder", async () => {
  const config = await readConfig();

  if (config.lastFolder && (await isDirectory(config.lastFolder))) {
    return config.lastFolder;
  }

  if (config.lastFolder) {
    await writeConfig({ lastFolder: null });
  }

  return null;
});

ipcMain.handle("airpaste:loadWorkspace", async (_event, folderPath) => {
  try {
    return await withWorkspaceQueue(folderPath, async () => {
      const payload = await workspaceService.loadWorkspace(folderPath);
      await setLastFolder(folderPath);
      return payload;
    });
  } catch (error) {
    const config = await readConfig();

    if (config.lastFolder === folderPath) {
      await writeConfig({ lastFolder: null });
    }

    throw error;
  }
});

ipcMain.handle("airpaste:createWorkspace", async (_event, folderPath) => {
  return withWorkspaceQueue(folderPath, async () => {
    const payload = await workspaceService.createWorkspace(folderPath);
    await setLastFolder(folderPath);
    return payload;
  });
});

ipcMain.handle("airpaste:saveWorkspace", async (_event, folderPath, data) => {
  return withWorkspaceQueue(folderPath, async () => {
    return workspaceService.saveWorkspace(folderPath, data);
  });
});

ipcMain.handle("airpaste:importImageAsset", async (_event, folderPath, payload) => {
  return withWorkspaceQueue(folderPath, async () => (
    workspaceService.importImageAsset(folderPath, payload)
  ));
});

ipcMain.handle("airpaste:resolveAssetUrl", async (_event, folderPath, relativePath) => {
  const assetPath = workspaceService.resolveWorkspaceAssetPath(folderPath, relativePath);

  if (!assetPath) {
    return "";
  }

  return pathToFileURL(assetPath).toString();
});

const workspaceActionHandlers = Object.freeze({
  "airpaste:listFiles": (folderPath) =>
    workspaceService.listFiles(folderPath),
  "airpaste:getHomeData": (folderPath, currentFolderPath) =>
    workspaceService.getHomeData(folderPath, currentFolderPath),
  "airpaste:getRecentItems": (folderPath) =>
    workspaceService.getRecentItems(folderPath),
  "airpaste:getStarredItems": (folderPath) =>
    workspaceService.getStarredItems(folderPath),
  "airpaste:createCanvas": (folderPath, name, targetFolderPath) =>
    workspaceService.createCanvas(folderPath, name, targetFolderPath),
  "airpaste:createPage": (folderPath, name, targetFolderPath) =>
    workspaceService.createPage(folderPath, name, targetFolderPath),
  "airpaste:renameFile": (folderPath, filePath, name) =>
    workspaceService.renameFile(folderPath, filePath, name),
  "airpaste:deleteFile": (folderPath, filePath) =>
    workspaceService.deleteFile(folderPath, filePath),
  "airpaste:markItemStarred": (folderPath, filePath, starred) =>
    workspaceService.markItemStarred(folderPath, filePath, starred),
  "airpaste:recordRecentItem": (folderPath, filePath) =>
    workspaceService.recordRecentItem(folderPath, filePath),
  "airpaste:getItemForFilePath": (folderPath, filePath) =>
    workspaceService.getItemForFilePath(folderPath, filePath),
  "airpaste:loadUiState": (folderPath) =>
    workspaceService.loadUiState(folderPath),
  "airpaste:saveUiState": (folderPath, partialState) =>
    workspaceService.saveUiState(folderPath, partialState),
});

for (const [channel, handler] of Object.entries(workspaceActionHandlers)) {
  ipcMain.handle(channel, async (_event, folderPath, ...args) => (
    withWorkspaceQueue(folderPath, () => handler(folderPath, ...args))
  ));
}

ipcMain.handle("airpaste:loadCanvas", async (_event, filePath) => {
  const queueKey = await resolveWorkspaceQueueKeyForFile(filePath);
  return withWorkspaceQueue(queueKey, () => workspaceService.loadCanvas(filePath));
});

ipcMain.handle("airpaste:saveCanvas", async (_event, filePath, data) => {
  const queueKey = await resolveWorkspaceQueueKeyForFile(filePath);
  return withWorkspaceQueue(queueKey, () => workspaceService.saveCanvas(filePath, data));
});

ipcMain.handle("airpaste:loadPage", async (_event, filePath) => {
  const queueKey = await resolveWorkspaceQueueKeyForFile(filePath);
  return withWorkspaceQueue(queueKey, () => workspaceService.loadPage(filePath));
});

ipcMain.handle("airpaste:savePage", async (_event, filePath, markdown) => {
  const queueKey = await resolveWorkspaceQueueKeyForFile(filePath);
  return withWorkspaceQueue(queueKey, () => workspaceService.savePage(filePath, markdown));
});

ipcMain.handle("airpaste:openExternal", async (_event, url) => {
  const normalizedUrl = normalizeExternalUrl(url);

  if (!normalizedUrl) {
    return { opened: false };
  }

  await shell.openExternal(normalizedUrl);
  return { opened: true };
});

ipcMain.handle("airpaste:openFile", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { opened: false };
  }

  const errorMessage = await shell.openPath(filePath);
  return { opened: errorMessage === "" };
});

ipcMain.handle("airpaste:fetchLinkPreview", async (_event, folderPath, cardId, url, cardSnapshot) => {
  if (!folderPath || !cardId || !url) {
    return { queued: false };
  }

  const jobKey = `${folderPath}:${cardId}`;
  cancelledPreviewJobs.delete(jobKey);

  if (previewJobs.has(jobKey)) {
    return { queued: false };
  }

  const job = withWorkspaceQueue(
    folderPath,
    () => updateCardPreview(folderPath, cardId, url, cardSnapshot),
  )
    .catch(() => null)
    .finally(() => {
      previewJobs.delete(jobKey);
    });

  previewJobs.set(jobKey, job);

  return { queued: true };
});

ipcMain.handle("airpaste:cancelLinkPreview", async (_event, folderPath, cardId) => {
  if (!folderPath || !cardId) {
    return { cancelled: false };
  }

  cancelledPreviewJobs.add(`${folderPath}:${cardId}`);
  return { cancelled: true };
});

// ── Window controls ─────────────────────────────────────
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window:close", () => mainWindow?.close());


app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void closeResolvedPreviewBrowser();
});
