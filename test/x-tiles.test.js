// The X tiles: a pasted x.com/<handle> link becomes an "x-profile" card and
// an x.com/<handle>/status/<id> link an "x-post" card, both filled by
// preview/resolvers/x.js (syndication + fxtwitter, images downloaded).
import { describe, expect, it } from "vitest";
import { classifyPreviewTarget } from "../preview/classification.js";
import { getCardStateFromResolvedPreview } from "../preview/card-mapper.js";
import {
  buildTweetText,
  getSyndicationToken,
  parseXUrl,
  resolveXLinkPreview,
} from "../preview/resolvers/x.js";
import { normalizeCard } from "@/lib/workspace.js";
import { createLinkCard } from "@/tiles/link/model.js";
import {
  formatXCount,
  formatXJoined,
  normalizeXPost,
  splitXText,
} from "@/tiles/x/model.js";

const NO_RETRY = { attempts: 1, retryDelayMs: 0 };

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function routeFetch(routes) {
  return async (url) => {
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!key) {
      throw new Error(`Unexpected request: ${url}`);
    }
    return routes[key](url);
  };
}

const fakeImage = async (url) => `data:image/jpeg;base64,${Buffer.from(url).toString("base64")}`;
const decodeFake = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64").toString();
const sizeOf = () => ({ width: 480, height: 420 });

const SYNDICATION_TWEET = {
  __typename: "Tweet",
  id_str: "1906",
  created_at: "2026-03-30T02:15:00.000Z",
  favorite_count: 163,
  conversation_count: 7,
  text: "@bob Thank you @_chenglou &amp; friends #spring https://t.co/abc https://t.co/media",
  display_text_range: [5, 64],
  entities: {
    user_mentions: [
      { screen_name: "bob", indices: [0, 4] },
      { screen_name: "_chenglou", indices: [15, 25] },
    ],
    hashtags: [{ text: "spring", indices: [40, 47] }],
    urls: [{ url: "https://t.co/abc", expanded_url: "https://notes.designtips.today/text", display_url: "notes.designtips.today/text", indices: [48, 64] }],
  },
  user: {
    name: "Lichin Lin",
    screen_name: "lichinlin",
    is_blue_verified: true,
    profile_image_url_https: "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
  },
  mediaDetails: [{
    type: "video",
    media_url_https: "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/poster.jpg",
    original_info: { width: 1280, height: 720 },
    video_info: {
      duration_millis: 6000,
      variants: [
        { content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
        { content_type: "video/mp4", bitrate: 256000, url: "https://video.twimg.com/low.mp4" },
        { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/high.mp4" },
      ],
    },
  }],
  quoted_tweet: {
    id_str: "1905",
    created_at: "2026-03-27T10:00:00.000Z",
    text: "Pretext: text layout that finally behaves.",
    display_text_range: [0, 42],
    entities: {},
    user: { name: "Cheng Lou", screen_name: "_chenglou" },
  },
};

const syndicationFetch = () => routeFetch({ "https://cdn.syndication.twimg.com/": () => jsonResponse(SYNDICATION_TWEET) });

describe("X link parsing", () => {
  it.each([
    ["https://x.com/JulienRenvoye", { kind: "profile", handle: "JulienRenvoye" }],
    ["https://twitter.com/jack/", { kind: "profile", handle: "jack" }],
    ["https://x.com/jack/media", { kind: "profile", handle: "jack" }],
    ["https://x.com/lichinlin/status/1906", { kind: "post", handle: "lichinlin", id: "1906" }],
    ["https://mobile.twitter.com/a/status/12/photo/1", { kind: "post", handle: "a", id: "12" }],
    ["https://x.com/i/web/status/99", { kind: "post", handle: "", id: "99" }],
  ])("%s", (url, expected) => {
    expect(parseXUrl(url)).toEqual(expected);
  });

  it.each([
    "https://x.com/home",
    "https://x.com/i/flow/login",
    "https://x.com/search?q=x",
    "https://x.com/jack/status/notanid",
    "https://example.com/jack",
  ])("ignores %s", (url) => {
    expect(parseXUrl(url)).toBeNull();
  });

  it("routes X links to the x resolver", () => {
    expect(classifyPreviewTarget("https://x.com/jack").resolverKey).toBe("x");
  });

  it("computes the syndication token", () => {
    expect(getSyndicationToken("20")).toBe(((20 / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""));
  });
});

describe("tweet text rebuild", () => {
  it("drops reply mentions and media links, expands t.co, keeps UTF-16 offsets", () => {
    const { text, entities } = buildTweetText(SYNDICATION_TWEET);
    expect(text).toBe("Thank you @_chenglou & friends #spring notes.designtips.today/text");
    expect(entities.map((entry) => text.slice(entry.start, entry.end))).toEqual([
      "@_chenglou",
      "#spring",
      "notes.designtips.today/text",
    ]);
    expect(entities[2].href).toBe("https://notes.designtips.today/text");
  });

  it("counts emoji as one index, like X", () => {
    const { text, entities } = buildTweetText({
      text: "🌸 hi @a",
      display_text_range: [0, 7],
      entities: { user_mentions: [{ screen_name: "a", indices: [5, 7] }] },
    });
    expect(text.slice(entities[0].start, entities[0].end)).toBe("@a");
  });
});

describe("resolveXLinkPreview", () => {
  it("builds an x-post from syndication with downloaded images and the best mp4", async () => {
    const { result } = await resolveXLinkPreview("https://x.com/lichinlin/status/1906", {
      fetchImpl: syndicationFetch(),
      fetchImage: fakeImage,
      retry: NO_RETRY,
    });
    const post = result.metadata.xPost;
    expect(result.kind).toBe("x-post");
    expect(result.status).toBe("ready");
    expect(post.author).toMatchObject({ name: "Lichin Lin", handle: "lichinlin", verified: "blue" });
    expect(decodeFake(post.author.avatarAsset)).toContain("_200x200.jpg");
    expect(post.media).toHaveLength(1);
    expect(post.media[0]).toMatchObject({ kind: "video", videoUrl: "https://video.twimg.com/high.mp4", durationMs: 6000 });
    expect(post.media[0].asset.startsWith("data:image/")).toBe(true);
    expect(post.quoted).toMatchObject({ author: { name: "Cheng Lou", handle: "_chenglou" }, url: "https://x.com/_chenglou/status/1905" });
    expect(post.likes).toBe(163);
    expect(post.replies).toBe(7);
    expect(post.linkCard).toBeNull();
  });

  it("falls back to fxtwitter when syndication has no tweet", async () => {
    const { result } = await resolveXLinkPreview("https://x.com/jack/status/20", {
      fetchImpl: routeFetch({
        "https://cdn.syndication.twimg.com/": () => jsonResponse({}, 404),
        "https://api.fxtwitter.com/": () => jsonResponse({
          tweet: {
            id: "20",
            text: "just setting up my twttr",
            likes: 324855,
            replies: 19260,
            created_timestamp: 1142974214,
            author: { name: "jack", screen_name: "jack", avatar_url: "https://pbs.twimg.com/a_200x200.jpg", verification: { verified: true, type: "individual" } },
            media: { all: [{ type: "photo", url: "https://pbs.twimg.com/media/x.jpg", width: 800, height: 600 }] },
          },
        }),
      }),
      fetchImage: fakeImage,
      retry: NO_RETRY,
    });
    const post = result.metadata.xPost;
    expect(post.text).toBe("just setting up my twttr");
    expect(post.entities).toBeNull();
    expect(post.createdAt).toBe("2006-03-21T20:50:14.000Z");
    expect(post.media[0]).toMatchObject({ kind: "photo", width: 800, height: 600 });
  });

  it("builds an x-profile from fxtwitter", async () => {
    const { result } = await resolveXLinkPreview("https://x.com/OpenAI", {
      fetchImpl: routeFetch({
        "https://api.fxtwitter.com/": () => jsonResponse({
          user: {
            screen_name: "OpenAI",
            name: "OpenAI",
            description: "Mission",
            location: "",
            followers: 5554568,
            following: 4,
            joined: "Sun Dec 06 22:51:08 +0000 2015",
            website: { url: "https://openai.com", display_url: "openai.com" },
            verification: { verified: true, type: "organization" },
            avatar_url: "https://pbs.twimg.com/profile_images/1/z_normal.jpg",
            banner_url: "https://pbs.twimg.com/profile_banners/4/177",
          },
        }),
      }),
      fetchImage: fakeImage,
      retry: NO_RETRY,
    });
    const profile = result.metadata.xProfile;
    expect(result.kind).toBe("x-profile");
    expect(profile).toMatchObject({
      name: "OpenAI",
      handle: "OpenAI",
      website: "openai.com",
      joined: "2015-12",
      followers: 5554568,
      verified: "business",
    });
    expect(decodeFake(profile.avatarAsset)).toContain("_400x400.jpg");
    expect(decodeFake(profile.bannerAsset)).toContain("/1080x360");
    expect(profile.avatarUrl).toBeUndefined();
  });

  it("returns an error result with no tile data when every source misses", async () => {
    const { result } = await resolveXLinkPreview("https://x.com/nobody", {
      fetchImpl: routeFetch({ "https://api.fxtwitter.com/": () => jsonResponse({ code: 404 }, 404) }),
      retry: NO_RETRY,
    });
    expect(result.status).toBe("error");
    expect(result.metadata).toEqual({});
  });

  it("returns null for X pages that are neither profile nor post", async () => {
    expect(await resolveXLinkPreview("https://x.com/i/flow/login")).toBeNull();
  });
});

describe("card mapping", () => {
  it("turns a resolved post into an x-post card", async () => {
    const { result } = await resolveXLinkPreview("https://x.com/lichinlin/status/1906", {
      fetchImpl: syndicationFetch(),
      fetchImage: fakeImage,
      retry: NO_RETRY,
    });
    const state = getCardStateFromResolvedPreview({ type: "x-post", url: result.url, width: 480, height: 420 }, result, sizeOf);
    expect(state.type).toBe("x-post");
    expect(state.xPost.author.handle).toBe("lichinlin");
    const card = normalizeCard({ id: "c1", ...state });
    expect(card.xPost.media[0].videoUrl).toBe("https://video.twimg.com/high.mp4");
  });

  it("falls back to a link tile when the first fetch fails", () => {
    const failed = { kind: "x-post", status: "error", reason: "X post unavailable", metadata: {}, canonicalUrl: "https://x.com/a/status/1" };
    const state = getCardStateFromResolvedPreview({ type: "x-post", url: failed.canonicalUrl, width: 480, height: 420 }, failed, sizeOf);
    expect(state.type).toBe("link");
    expect(state.status).toBe("error");
  });

  it("keeps the last good data when a refresh fails", () => {
    const previous = { fetchedAt: "2026-01-01T00:00:00Z", author: { name: "A", handle: "a" }, text: "hi" };
    const failed = { kind: "x-post", status: "error", reason: "X post unavailable", metadata: {}, canonicalUrl: "https://x.com/a/status/1" };
    const state = getCardStateFromResolvedPreview({ type: "x-post", url: failed.canonicalUrl, xPost: previous, title: "A on X" }, failed, sizeOf);
    expect(state.type).toBe("x-post");
    expect(state.xPost).toBe(previous);
    expect(state.status).toBe("ready");
    expect(state.title).toBe("A on X");
  });
});

describe("renderer model", () => {
  it("starts a pasted X link as a loading link tile, not the X tile", () => {
    const post = createLinkCard([], { x: 0, y: 0, zoom: 1 }, "https://x.com/jack/status/20");
    expect(post.type).toBe("link");
    expect(post.status).toBe("loading");
  });

  it("becomes the X tile, at the standard width, once the preview resolves", async () => {
    const { result } = await resolveXLinkPreview("https://x.com/lichinlin/status/1906", {
      fetchImpl: syndicationFetch(),
      fetchImage: fakeImage,
      retry: NO_RETRY,
    });
    const linkCard = createLinkCard([], { x: 0, y: 0, zoom: 1 }, "https://x.com/lichinlin/status/1906");
    const state = getCardStateFromResolvedPreview(linkCard, result, () => ({ width: 340, height: 300 }));
    expect(state.type).toBe("x-post");
    expect(state.width).toBe(340);
  });

  it("formats counts like X", () => {
    expect(formatXCount(8242)).toBe("8,242");
    expect(formatXCount(12_560)).toBe("12.5K");
    expect(formatXCount(3_490_000)).toBe("3.4M");
    expect(formatXCount(1_250_000_000)).toBe("1.2B");
    expect(formatXJoined("2008-02")).toBe("Joined February 2008");
  });

  it("drops entities that fall outside the text and unsafe image sources", () => {
    const post = normalizeXPost({
      text: "hi @a",
      entities: [{ type: "mention", start: 3, end: 5, href: "https://x.com/a" }, { type: "url", start: 3, end: 99, href: "https://e.com" }],
      media: [{ kind: "photo", asset: "javascript:x" }],
    });
    expect(post.entities).toHaveLength(1);
    expect(post.media[0].asset).toBe("");
  });

  it("splits text by entities, or by detection when there are none", () => {
    expect(splitXText("hi @a", [{ start: 3, end: 5, href: "https://x.com/a" }])).toEqual([
      { text: "hi " },
      { text: "@a", href: "https://x.com/a" },
    ]);
    expect(splitXText("see #tag and julienr.co").filter((segment) => segment.href).map((segment) => segment.href)).toEqual([
      "https://x.com/hashtag/tag",
      "https://julienr.co",
    ]);
  });
});
