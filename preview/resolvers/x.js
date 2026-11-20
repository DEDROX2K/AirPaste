// X (Twitter) profile and post resolver. Turns a pasted x.com / twitter.com
// link into the data the XProfileTile / XPostTile render, with every image
// downloaded into the card (data URLs) so the tiles work offline.
//
// Both data sources are unofficial and keyless, so everything that knows
// their payload shapes lives in this one file: a payload change is a
// one-file fix.
//   profile: api.fxtwitter.com/<handle>
//   post:    cdn.syndication.twimg.com/tweet-result -> api.fxtwitter.com/<handle>/status/<id>
// When every source misses, the result carries no tile data and the card
// falls back to the link tile's failed-preview state.

const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { createResolvedPreviewResult } = require("../result");

const X_REQUEST_TIMEOUT_MS = 8000;
const X_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAX_MEDIA = 4;

// First path segments on x.com that are site pages, not a handle.
const RESERVED_HANDLES = new Set([
  "home", "explore", "i", "search", "settings", "messages", "notifications",
  "compose", "intent", "hashtag", "share", "login", "logout", "signup", "tos",
  "privacy", "jobs", "about", "download", "following", "followers", "lists",
  "bookmarks", "communities", "premium", "verified", "account", "help",
]);
// Profile tabs that still mean "this profile".
const PROFILE_TABS = new Set(["with_replies", "media", "likes", "highlights", "articles", "superfollows"]);
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_ID_PATTERN = /^\d{1,25}$/;

function isXHostname(hostname) {
  return /(?:^|\.)(?:x|twitter)\.com$/i.test(hostname);
}

// { kind: "post", handle, id } | { kind: "profile", handle } | null
function parseXUrl(url) {
  try {
    const parsedUrl = new URL(url);

    if (!isXHostname(parsedUrl.hostname)) {
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

/* ---------- small helpers ---------- */

function str(value) {
  return typeof value === "string" ? value : "";
}

function count(value) {
  const number = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function toIso(value) {
  if (Number.isFinite(value)) {
    const fromSeconds = new Date(value * 1000);
    return Number.isNaN(fromSeconds.getTime()) ? "" : fromSeconds.toISOString();
  }

  const date = new Date(str(value));
  return str(value) && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

// "2015-12" from any date the API gives.
function toYearMonth(value) {
  const iso = toIso(value);
  return iso ? iso.slice(0, 7) : "";
}

const HTML_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&apos;": "'" };

function decodeHtml(text) {
  return str(text).replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => HTML_ENTITIES[entity]);
}

// X's syndication token for a status id.
function getSyndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

// pbs.twimg.com image size variants.
function sizedAvatarUrl(url, size) {
  return str(url).replace(/_(?:normal|bigger|mini|200x200|400x400)(\.[a-z]+)$/i, `_${size}$1`);
}

function sizedBannerUrl(url) {
  const base = str(url).replace(/\/(?:\d+x\d+|web|mobile)$/i, "");
  return base ? `${base}/1080x360` : "";
}

function sizedMediaUrl(url, name) {
  const base = str(url);

  if (!/pbs\.twimg\.com\//i.test(base)) {
    return base;
  }

  const [path] = base.split("?");
  const match = path.match(/\.(jpe?g|png|webp)$/i);

  if (!match) {
    return base;
  }

  return `${path.slice(0, -match[0].length)}?format=${match[1].toLowerCase() === "png" ? "png" : "jpg"}&name=${name}`;
}

function normalizeVerified(kind) {
  return ["blue", "business", "government"].includes(kind) ? kind : "none";
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

async function fetchJsonWithTimeout(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": X_USER_AGENT },
      signal: AbortSignal.timeout(X_REQUEST_TIMEOUT_MS),
    });

    if (!response?.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

// fxtwitter intermittently answers 404 "User not found" for real accounts
// (its upstream session rotates), so a miss is retried a few times.
async function fetchFxJson(url, fetchImpl, { attempts = 4, retryDelayMs = 350 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const payload = await fetchJsonWithTimeout(url, fetchImpl);

    if (payload && (payload.user || payload.tweet)) {
      return payload;
    }

    if (attempt < attempts - 1 && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }

  return null;
}

/* ---------- text + entities ---------- */

// Rebuilds a syndication tweet's visible text: the part inside
// display_text_range (drops leading reply @mentions and trailing media
// links), t.co links swapped for their display form. Entities come back as
// UTF-16 offsets into that new text, which is what the renderer slices.
function buildTweetText(tweet) {
  const codePoints = Array.from(str(tweet?.text));
  const [rangeStart, rangeEnd] = Array.isArray(tweet?.display_text_range)
    ? tweet.display_text_range
    : [0, codePoints.length];
  const start = Math.max(0, count(rangeStart));
  const end = Math.min(codePoints.length, Number.isFinite(rangeEnd) ? rangeEnd : codePoints.length);
  const rawEntities = [];
  const entities = tweet?.entities && typeof tweet.entities === "object" ? tweet.entities : {};

  (Array.isArray(entities.urls) ? entities.urls : []).forEach((entry) => {
    rawEntities.push({
      type: "url",
      indices: entry?.indices,
      display: str(entry?.display_url) || str(entry?.expanded_url) || str(entry?.url),
      href: str(entry?.expanded_url) || str(entry?.url),
    });
  });
  (Array.isArray(entities.user_mentions) ? entities.user_mentions : []).forEach((entry) => {
    rawEntities.push({
      type: "mention",
      indices: entry?.indices,
      display: `@${str(entry?.screen_name)}`,
      href: `https://x.com/${str(entry?.screen_name)}`,
    });
  });
  (Array.isArray(entities.hashtags) ? entities.hashtags : []).forEach((entry) => {
    rawEntities.push({
      type: "hashtag",
      indices: entry?.indices,
      display: `#${str(entry?.text)}`,
      href: `https://x.com/hashtag/${encodeURIComponent(str(entry?.text))}`,
    });
  });
  (Array.isArray(entities.symbols) ? entities.symbols : []).forEach((entry) => {
    rawEntities.push({
      type: "cashtag",
      indices: entry?.indices,
      display: `$${str(entry?.text)}`,
      href: `https://x.com/search?q=%24${encodeURIComponent(str(entry?.text))}`,
    });
  });

  const ordered = rawEntities
    .filter((entry) => Array.isArray(entry.indices) && entry.display && entry.indices[0] >= start && entry.indices[1] <= end)
    .sort((a, b) => a.indices[0] - b.indices[0]);
  let text = "";
  let cursor = start;
  const outEntities = [];

  ordered.forEach((entry) => {
    const [from, to] = entry.indices;

    if (from < cursor) {
      return;
    }

    text += decodeHtml(codePoints.slice(cursor, from).join(""));
    outEntities.push({ type: entry.type, start: text.length, end: text.length + entry.display.length, href: entry.href });
    text += entry.display;
    cursor = to;
  });
  text += decodeHtml(codePoints.slice(cursor, end).join(""));

  // Trimming can only move offsets left of the first character.
  const leading = text.length - text.trimStart().length;
  const trimmed = text.trim();

  return {
    text: trimmed,
    entities: outEntities
      .map((entry) => ({ ...entry, start: entry.start - leading, end: entry.end - leading }))
      .filter((entry) => entry.start >= 0 && entry.end <= trimmed.length),
  };
}

/* ---------- syndication mapping ---------- */

function getSyndicationVerified(user) {
  const type = str(user?.verified_type).toLowerCase();

  if (type === "business") {
    return "business";
  }

  if (type === "government") {
    return "government";
  }

  return user?.is_blue_verified || user?.verified ? "blue" : "none";
}

function pickBestMp4(variants) {
  return (Array.isArray(variants) ? variants : [])
    .filter((variant) => str(variant?.content_type) === "video/mp4" && str(variant?.url))
    .sort((a, b) => count(b?.bitrate) - count(a?.bitrate))[0]?.url ?? "";
}

function mapSyndicationMedia(tweet) {
  return (Array.isArray(tweet?.mediaDetails) ? tweet.mediaDetails : [])
    .slice(0, MAX_MEDIA)
    .map((media) => {
      const type = str(media?.type);
      const kind = type === "video" ? "video" : type === "animated_gif" ? "gif" : "photo";
      const width = count(media?.original_info?.width);
      const height = count(media?.original_info?.height);

      return {
        kind,
        imageUrl: str(media?.media_url_https),
        videoUrl: kind === "photo" ? "" : pickBestMp4(media?.video_info?.variants),
        width,
        height,
        durationMs: kind === "video" ? count(media?.video_info?.duration_millis) : 0,
      };
    })
    .filter((media) => media.imageUrl);
}

function getBindingString(bindings, key) {
  return str(bindings?.[key]?.string_value);
}

function getBindingImage(bindings, keys) {
  for (const key of keys) {
    const url = str(bindings?.[key]?.image_value?.url);

    if (url) {
      return url;
    }
  }

  return "";
}

function mapSyndicationLinkCard(tweet) {
  const card = tweet?.card;
  const bindings = card?.binding_values;

  if (!bindings || typeof bindings !== "object") {
    return null;
  }

  const title = getBindingString(bindings, "title");

  if (!title) {
    return null;
  }

  const shortUrl = str(card?.url) || getBindingString(bindings, "card_url");
  const expanded = (Array.isArray(tweet?.entities?.urls) ? tweet.entities.urls : [])
    .find((entry) => str(entry?.url) === shortUrl)?.expanded_url;
  const url = str(expanded) || shortUrl;

  return {
    url,
    domain: getBindingString(bindings, "vanity_url") || getBindingString(bindings, "domain") || getDomain(url),
    title,
    imageUrl: getBindingImage(bindings, [
      "summary_photo_image_large",
      "thumbnail_image_large",
      "photo_image_full_size_large",
      "summary_photo_image",
      "thumbnail_image",
    ]),
  };
}

function mapSyndicationQuoted(quoted) {
  if (!quoted || typeof quoted !== "object" || !quoted.user) {
    return null;
  }

  const handle = str(quoted.user.screen_name);
  const id = str(quoted.id_str);

  return {
    id,
    url: handle && id ? `https://x.com/${handle}/status/${id}` : "",
    author: { name: str(quoted.user.name), handle },
    createdAt: toIso(quoted.created_at),
    text: buildTweetText(quoted).text,
  };
}

function mapSyndicationTweet(tweet, identity) {
  if (!tweet || typeof tweet !== "object" || tweet.__typename === "TweetTombstone" || !tweet.user) {
    return null;
  }

  const handle = str(tweet.user.screen_name) || identity.handle;
  const id = str(tweet.id_str) || identity.id;
  const { text, entities } = buildTweetText(tweet);
  const media = mapSyndicationMedia(tweet);

  return {
    id,
    url: `https://x.com/${handle}/status/${id}`,
    author: {
      name: str(tweet.user.name),
      handle,
      verified: getSyndicationVerified(tweet.user),
      avatarUrl: str(tweet.user.profile_image_url_https),
    },
    text,
    entities,
    createdAt: toIso(tweet.created_at),
    likes: count(tweet.favorite_count),
    replies: count(tweet.conversation_count),
    media,
    // X shows a link card only when a post has no media.
    linkCard: media.length ? null : mapSyndicationLinkCard(tweet),
    quoted: mapSyndicationQuoted(tweet.quoted_tweet),
  };
}

/* ---------- fxtwitter mapping ---------- */

function getFxVerified(verification) {
  if (!verification?.verified) {
    return "none";
  }

  const type = str(verification.type).toLowerCase();

  if (type === "business" || type === "organization") {
    return "business";
  }

  return type === "government" ? "government" : "blue";
}

function mapFxMedia(tweet) {
  return (Array.isArray(tweet?.media?.all) ? tweet.media.all : [])
    .slice(0, MAX_MEDIA)
    .map((media) => {
      const type = str(media?.type);
      const kind = type === "video" ? "video" : type === "gif" ? "gif" : "photo";

      return {
        kind,
        imageUrl: kind === "photo" ? str(media?.url) : str(media?.thumbnail_url),
        videoUrl: kind === "photo" ? "" : str(media?.url),
        width: count(media?.width),
        height: count(media?.height),
        durationMs: kind === "video" ? Math.round((Number(media?.duration) || 0) * 1000) : 0,
      };
    })
    .filter((media) => media.imageUrl);
}

function mapFxTweet(payload, identity) {
  const tweet = payload?.tweet;

  if (!tweet || typeof tweet !== "object" || !tweet.author) {
    return null;
  }

  const handle = str(tweet.author.screen_name) || identity.handle;
  const id = str(tweet.id) || identity.id;
  const quote = tweet.quote && typeof tweet.quote === "object" && tweet.quote.author ? tweet.quote : null;

  return {
    id,
    url: `https://x.com/${handle}/status/${id}`,
    author: {
      name: str(tweet.author.name),
      handle,
      verified: getFxVerified(tweet.author.verification),
      avatarUrl: str(tweet.author.avatar_url),
    },
    text: str(tweet.text).trim(),
    // No offsets from this source; the tile detects entities itself.
    entities: null,
    createdAt: toIso(tweet.created_timestamp) || toIso(tweet.created_at),
    likes: count(tweet.likes),
    replies: count(tweet.replies),
    media: mapFxMedia(tweet),
    linkCard: null,
    quoted: quote
      ? {
        id: str(quote.id),
        url: str(quote.url),
        author: { name: str(quote.author.name), handle: str(quote.author.screen_name) },
        createdAt: toIso(quote.created_timestamp) || toIso(quote.created_at),
        text: str(quote.text).trim(),
      }
      : null,
  };
}

function mapFxProfile(payload, identity) {
  const user = payload?.user;

  if (!user || typeof user !== "object" || !str(user.screen_name)) {
    return null;
  }

  const websiteDisplay = str(user.website?.display_url) || str(user.website?.url).replace(/^https?:\/\/(?:www\.)?/i, "");

  return {
    name: str(user.name),
    handle: str(user.screen_name) || identity.handle,
    bio: str(user.description),
    location: str(user.location),
    website: websiteDisplay,
    websiteUrl: str(user.website?.url),
    joined: toYearMonth(user.joined),
    following: count(user.following),
    followers: count(user.followers),
    verified: getFxVerified(user.verification),
    avatarUrl: str(user.avatar_url),
    bannerUrl: str(user.banner_url),
  };
}

/* ---------- fetch + image download ---------- */

async function fetchXPost(identity, fetchImpl, retryOptions) {
  const syndication = await fetchJsonWithTimeout(
    `https://cdn.syndication.twimg.com/tweet-result?id=${identity.id}&lang=en&token=${getSyndicationToken(identity.id)}`,
    fetchImpl,
  );
  const fromSyndication = mapSyndicationTweet(syndication, identity);

  if (fromSyndication) {
    return fromSyndication;
  }

  const fx = await fetchFxJson(
    `https://api.fxtwitter.com/${encodeURIComponent(identity.handle || "i")}/status/${identity.id}`,
    fetchImpl,
    retryOptions,
  );
  return mapFxTweet(fx, identity);
}

async function downloadPostImages(post, fetchImage) {
  const mediaName = post.media.length === 1 ? "medium" : "small";
  const [avatarAsset, linkImageAsset, ...mediaAssets] = await Promise.all([
    fetchImage(sizedAvatarUrl(post.author.avatarUrl, "200x200")),
    post.linkCard?.imageUrl ? fetchImage(post.linkCard.imageUrl) : Promise.resolve(""),
    ...post.media.map((media) => fetchImage(sizedMediaUrl(media.imageUrl, mediaName))),
  ]);

  return {
    id: post.id,
    url: post.url,
    author: {
      name: post.author.name,
      handle: post.author.handle,
      verified: normalizeVerified(post.author.verified),
      avatarAsset: avatarAsset || "",
    },
    text: post.text,
    entities: post.entities,
    createdAt: post.createdAt,
    likes: post.likes,
    replies: post.replies,
    media: post.media.map((media, index) => ({
      kind: media.kind,
      // Photos: the image. Video/gif: the poster frame.
      asset: mediaAssets[index] || "",
      videoUrl: media.videoUrl,
      width: media.width,
      height: media.height,
      durationMs: media.durationMs,
    })),
    linkCard: post.linkCard
      ? { url: post.linkCard.url, domain: post.linkCard.domain, title: post.linkCard.title, imageAsset: linkImageAsset || "" }
      : null,
    quoted: post.quoted,
  };
}

async function downloadProfileImages(profile, fetchImage) {
  const [avatarAsset, bannerAsset] = await Promise.all([
    fetchImage(sizedAvatarUrl(profile.avatarUrl, "400x400")),
    profile.bannerUrl ? fetchImage(sizedBannerUrl(profile.bannerUrl)) : Promise.resolve(""),
  ]);
  const { avatarUrl, bannerUrl, ...rest } = profile;

  return {
    ...rest,
    verified: normalizeVerified(profile.verified),
    avatarAsset: avatarAsset || "",
    bannerAsset: bannerAsset || "",
  };
}

function failedResult(url, kind, reason) {
  // No tile data: the card becomes (or stays) a link tile showing its
  // failed-preview state, unless it already holds data from an earlier
  // fetch (card-mapper keeps that).
  return createResolvedPreviewResult({
    kind,
    confidence: PREVIEW_CONFIDENCE.LOW,
    status: PREVIEW_STATUS.ERROR,
    reason,
    url,
    resolvedUrl: url,
    canonicalUrl: url,
    siteName: "X",
    sourceType: "x",
    metadata: {},
  });
}

function wrap(result) {
  return { result, documentSignals: {}, documentSnapshot: null };
}

// Returns null for X links that are neither a profile nor a post, so the
// caller can fall through to the generic resolver.
async function resolveXLinkPreview(url, { fetchImpl = fetch, fetchImage, retry } = {}) {
  const identity = parseXUrl(url);

  if (!identity) {
    return null;
  }

  const getImage = typeof fetchImage === "function"
    ? (imageUrl) => (imageUrl ? fetchImage(imageUrl).catch(() => "") : Promise.resolve(""))
    : async () => "";
  const fetchedAt = new Date().toISOString();

  if (identity.kind === "profile") {
    const payload = await fetchFxJson(`https://api.fxtwitter.com/${encodeURIComponent(identity.handle)}`, fetchImpl, retry);
    const profile = mapFxProfile(payload, identity);

    if (!profile) {
      return wrap(failedResult(url, PREVIEW_KIND.X_PROFILE, "X profile unavailable"));
    }

    const xProfile = { ...(await downloadProfileImages(profile, getImage)), fetchedAt };
    const canonicalUrl = `https://x.com/${xProfile.handle}`;

    return wrap(createResolvedPreviewResult({
      kind: PREVIEW_KIND.X_PROFILE,
      confidence: PREVIEW_CONFIDENCE.HIGH,
      status: PREVIEW_STATUS.READY,
      url,
      resolvedUrl: canonicalUrl,
      canonicalUrl,
      title: xProfile.name ? `${xProfile.name} (@${xProfile.handle})` : `@${xProfile.handle}`,
      description: xProfile.bio,
      siteName: "X",
      author: xProfile.handle,
      sourceType: "x-profile",
      metadata: { xProfile },
    }));
  }

  const post = await fetchXPost(identity, fetchImpl, retry);

  if (!post) {
    return wrap(failedResult(url, PREVIEW_KIND.X_POST, "X post unavailable"));
  }

  const xPost = { ...(await downloadPostImages(post, getImage)), fetchedAt };

  return wrap(createResolvedPreviewResult({
    kind: PREVIEW_KIND.X_POST,
    confidence: PREVIEW_CONFIDENCE.HIGH,
    status: PREVIEW_STATUS.READY,
    url,
    resolvedUrl: xPost.url,
    canonicalUrl: xPost.url,
    title: xPost.author.name ? `${xPost.author.name} on X` : "Post on X",
    description: xPost.text,
    siteName: "X",
    author: xPost.author.handle,
    sourceType: "x-post",
    metadata: { xPost },
  }));
}

module.exports = {
  buildTweetText,
  getSyndicationToken,
  mapFxProfile,
  mapFxTweet,
  mapSyndicationTweet,
  parseXUrl,
  resolveXLinkPreview,
};
