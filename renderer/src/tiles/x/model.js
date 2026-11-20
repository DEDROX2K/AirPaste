import TILE_TYPES from "../tileTypes";

export const X_PROFILE_CARD_TYPE = TILE_TYPES.X_PROFILE;
export const X_POST_CARD_TYPE = TILE_TYPES.X_POST;

// The standard link-tile width. Heights are starting values only: both
// tiles measure their content and write the real height back (like the
// GitHub repo tile).
export const X_PROFILE_CARD_SIZE = Object.freeze({ width: 340, height: 312 });
export const X_POST_CARD_SIZE = Object.freeze({ width: 340, height: 300 });

export const X_VERIFIED_KINDS = Object.freeze(["blue", "business", "government", "none"]);
export const X_BADGE_COLORS = Object.freeze({ blue: "#1D9BF0", business: "#E2B719", government: "#829AAB" });
const X_MEDIA_KINDS = ["photo", "video", "gif"];
const X_ENTITY_TYPES = ["url", "mention", "hashtag", "cashtag"];
const MAX_MEDIA = 4;

// Mirrors preview/resolvers/x.js (the main-process resolver, CommonJS).
const RESERVED_HANDLES = new Set([
  "home", "explore", "i", "search", "settings", "messages", "notifications",
  "compose", "intent", "hashtag", "share", "login", "logout", "signup", "tos",
  "privacy", "jobs", "about", "download", "following", "followers", "lists",
  "bookmarks", "communities", "premium", "verified", "account", "help",
]);
const PROFILE_TABS = new Set(["with_replies", "media", "likes", "highlights", "articles", "superfollows"]);
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_ID_PATTERN = /^\d{1,25}$/;

// { kind: "post", handle, id } | { kind: "profile", handle } | null
export function parseXUrl(url) {
  try {
    const parsedUrl = new URL(url);

    if (!/(?:^|\.)(?:x|twitter)\.com$/i.test(parsedUrl.hostname)) {
      return null;
    }

    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const statusIndex = segments.findIndex((segment) => segment === "status" || segment === "statuses");

    if (statusIndex >= 1 && STATUS_ID_PATTERN.test(segments[statusIndex + 1] ?? "")) {
      const handle = segments[0];
      return {
        kind: "post",
        handle: HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle.toLowerCase()) ? handle : "",
        id: segments[statusIndex + 1],
      };
    }

    const [handle, tab] = segments;

    if (
      handle
      && HANDLE_PATTERN.test(handle)
      && !RESERVED_HANDLES.has(handle.toLowerCase())
      && (segments.length === 1 || (segments.length === 2 && PROFILE_TABS.has(String(tab).toLowerCase())))
    ) {
      return { kind: "profile", handle };
    }

    return null;
  } catch {
    return null;
  }
}

/* ---------- normalizers (one prefixed object per tile) ---------- */

function str(value, maxLength = 4000) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function count(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function verified(value) {
  return X_VERIFIED_KINDS.includes(value) ? value : "none";
}

// Images live in the card as data URLs (downloaded by the resolver); only
// those and plain https URLs are allowed through.
function imageSrc(value) {
  const src = str(value, 20_000_000);
  return /^(?:data:image\/|https:\/\/)/i.test(src) ? src : "";
}

function httpUrl(value) {
  const url = str(value, 2000);
  return /^https?:\/\//i.test(url) ? url : "";
}

export function normalizeXProfile(profile, url = "") {
  const source = profile && typeof profile === "object" ? profile : {};
  const fromUrl = parseXUrl(url);

  return {
    name: str(source.name, 100),
    handle: str(source.handle, 30).replace(/^@/, "") || (fromUrl?.handle ?? ""),
    bio: str(source.bio, 400),
    location: str(source.location, 100),
    website: str(source.website, 200),
    websiteUrl: httpUrl(source.websiteUrl),
    joined: /^\d{4}-\d{2}$/.test(source.joined ?? "") ? source.joined : "",
    following: count(source.following),
    followers: count(source.followers),
    verified: verified(source.verified),
    avatarAsset: imageSrc(source.avatarAsset),
    bannerAsset: imageSrc(source.bannerAsset),
    fetchedAt: str(source.fetchedAt, 40),
  };
}

function normalizeEntities(entities, text) {
  if (!Array.isArray(entities)) {
    return null;
  }

  return entities
    .filter((entry) => (
      X_ENTITY_TYPES.includes(entry?.type)
      && Number.isInteger(entry.start)
      && Number.isInteger(entry.end)
      && entry.start >= 0
      && entry.end > entry.start
      && entry.end <= text.length
    ))
    .map((entry) => ({ type: entry.type, start: entry.start, end: entry.end, href: httpUrl(entry.href) }))
    .sort((a, b) => a.start - b.start);
}

function normalizeMedia(media) {
  return (Array.isArray(media) ? media : [])
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, MAX_MEDIA)
    .map((entry) => ({
      kind: X_MEDIA_KINDS.includes(entry.kind) ? entry.kind : "photo",
      asset: imageSrc(entry.asset),
      videoUrl: httpUrl(entry.videoUrl),
      width: count(entry.width),
      height: count(entry.height),
      durationMs: count(entry.durationMs),
    }));
}

export function normalizeXPost(post, url = "") {
  const source = post && typeof post === "object" ? post : {};
  const fromUrl = parseXUrl(url);
  const author = source.author && typeof source.author === "object" ? source.author : {};
  const text = str(source.text, 25_000);
  const media = normalizeMedia(source.media);
  const linkCard = source.linkCard && typeof source.linkCard === "object" && !media.length
    ? {
      url: httpUrl(source.linkCard.url),
      domain: str(source.linkCard.domain, 200),
      title: str(source.linkCard.title, 300),
      imageAsset: imageSrc(source.linkCard.imageAsset),
    }
    : null;
  const quoted = source.quoted && typeof source.quoted === "object"
    ? {
      id: str(source.quoted.id, 30),
      url: httpUrl(source.quoted.url),
      author: {
        name: str(source.quoted.author?.name, 100),
        handle: str(source.quoted.author?.handle, 30),
      },
      createdAt: str(source.quoted.createdAt, 40),
      text: str(source.quoted.text, 25_000),
    }
    : null;

  return {
    id: str(source.id, 30) || (fromUrl?.kind === "post" ? fromUrl.id : ""),
    url: httpUrl(source.url),
    author: {
      name: str(author.name, 100),
      handle: str(author.handle, 30).replace(/^@/, "") || (fromUrl?.handle ?? ""),
      verified: verified(author.verified),
      avatarAsset: imageSrc(author.avatarAsset),
    },
    text,
    entities: normalizeEntities(source.entities, text),
    createdAt: str(source.createdAt, 40),
    likes: count(source.likes),
    replies: count(source.replies),
    media,
    linkCard: linkCard?.title || linkCard?.url ? linkCard : null,
    quoted: quoted?.text || quoted?.author.handle ? quoted : null,
    fetchedAt: str(source.fetchedAt, 40),
  };
}

/* ---------- display helpers ---------- */

// <10k: "8,242"; else "12.5K" / "3.4M" / "1.2B", floored to one decimal.
export function formatXCount(value) {
  const number = Number(value) || 0;

  if (number < 10_000) {
    return Math.max(0, Math.round(number)).toLocaleString("en-US");
  }

  for (const [unit, suffix] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
    if (number >= unit) {
      return `${Math.floor((number / unit) * 10) / 10}${suffix}`;
    }
  }

  return String(number);
}

// "2015-12" -> "Joined December 2015"
export function formatXJoined(yearMonth) {
  if (!/^\d{4}-\d{2}$/.test(yearMonth ?? "")) {
    return "";
  }

  const [year, month] = yearMonth.split("-").map(Number);
  return `Joined ${new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })}`;
}

// ISO -> "2:15 AM · Mar 30, 2026" (local time, like x.com).
export function formatXPosted(iso) {
  const date = new Date(iso);

  if (!iso || Number.isNaN(date.getTime())) {
    return "";
  }

  const time = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${time} · ${day}`;
}

// ISO -> "Mar 27" this year, else "Mar 27, 2024" (quoted post byline).
export function formatXShortDate(iso, now = new Date()) {
  const date = new Date(iso);

  if (!iso || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("en-US", date.getFullYear() === now.getFullYear()
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

export function formatXDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function getXInitials(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase() || "?";
}

const ENTITY_PATTERN = /(^|[^\w@#$/])(@\w{1,15}|#\w+|\$[A-Za-z]{1,6}|(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;

function hrefForToken(token) {
  if (token.startsWith("@")) {
    return `https://x.com/${token.slice(1)}`;
  }

  if (token.startsWith("#")) {
    return `https://x.com/hashtag/${encodeURIComponent(token.slice(1))}`;
  }

  if (token.startsWith("$")) {
    return `https://x.com/search?q=${encodeURIComponent(token)}`;
  }

  return /^https?:\/\//i.test(token) ? token : `https://${token}`;
}

// Text -> [{ text, href? }]. Uses the API's entity offsets when the post
// has them; otherwise (fxtwitter fallback, bios) detects @mentions, #tags,
// $cashtags and bare links itself.
export function splitXText(text, entities = null) {
  const source = String(text ?? "");

  if (!source) {
    return [];
  }

  const ranges = Array.isArray(entities)
    ? entities.map((entry) => ({ start: entry.start, end: entry.end, href: entry.href || hrefForToken(source.slice(entry.start, entry.end)) }))
    : Array.from(source.matchAll(ENTITY_PATTERN)).map((match) => {
      const start = match.index + match[1].length;
      return { start, end: start + match[2].length, href: hrefForToken(match[2]) };
    });
  const segments = [];
  let cursor = 0;

  ranges.forEach((range) => {
    if (range.start < cursor || range.end > source.length) {
      return;
    }

    if (range.start > cursor) {
      segments.push({ text: source.slice(cursor, range.start) });
    }

    segments.push({ text: source.slice(range.start, range.end), href: range.href });
    cursor = range.end;
  });

  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor) });
  }

  return segments;
}

export function getXProfileUrl(handle) {
  return handle ? `https://x.com/${handle}` : "https://x.com";
}
