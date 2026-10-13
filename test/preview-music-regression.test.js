// Regression coverage for two reported bugs, both in the Spotify/YouTube
// Music preview path:
//
// 1. Pasting a Spotify track or playlist link always landed on "fallback,
//    thumbnail missing" even though resolveSpotifyPreview's oEmbed call
//    succeeded and returned a real thumbnail URL. Root cause: Spotify's CDN
//    (scdn.co / spotifycdn.com) serves images from extensionless,
//    hash-based paths, and isLikelyPreviewImageUrl's allowlist in
//    preview/resolvers/generic.js only matched a file extension or a short
//    list of other hosts (pinimg, ytimg, twimg) -- so acquirePreviewImage
//    filtered the real thumbnail out before ever attempting to fetch it.
//
// 2. A music.youtube.com link rendered as a plain 16:9 YouTube video tile
//    instead of a music tile. Root cause: music.youtube.com shares
//    youtube.com's domain, so classifyPreviewTarget's YouTube checks
//    (hostname.endsWith("youtube.com")) matched it too, routing it to the
//    YouTube-video resolver before it could ever reach the generic
//    resolver's existing isMusicHost(url) check (music.youtube.com was
//    already listed in MUSIC_HOSTS, constants.js -- the classification
//    layer just never let it get there).
import { describe, expect, it } from "vitest";
import { classifyPreviewTarget } from "../preview/classification.js";
import { isLikelyPreviewImageUrl } from "../preview/resolvers/generic.js";

describe("classifyPreviewTarget", () => {
  it("routes music.youtube.com to the generic resolver, not the YouTube video one", () => {
    const classification = classifyPreviewTarget("https://music.youtube.com/watch?v=iItSvgbp_Ro");
    expect(classification.resolverKey).toBe("generic");
    expect(classification.resolverKey).not.toBe("youtube");
  });

  it("still routes an ordinary youtube.com watch URL to the YouTube video resolver", () => {
    const classification = classifyPreviewTarget("https://www.youtube.com/watch?v=atnR5upoiyk");
    expect(classification.resolverKey).toBe("youtube");
    expect(classification.contentType).toBe("video");
  });

  it("still routes a youtu.be short link to the YouTube video resolver", () => {
    const classification = classifyPreviewTarget("https://youtu.be/9bZkp7q19f0");
    expect(classification.resolverKey).toBe("youtube");
  });

  it("still routes a YouTube Shorts URL to the shorts resolver, not generic", () => {
    const classification = classifyPreviewTarget("https://www.youtube.com/shorts/aqz-KE-bpKQ");
    expect(classification.resolverKey).toBe("youtube-shorts");
  });
});

describe("isLikelyPreviewImageUrl", () => {
  it("accepts Spotify's extensionless CDN thumbnail URLs", () => {
    expect(isLikelyPreviewImageUrl("https://i.scdn.co/image/ab67616d0000b2736de3b2401255d7639ef5db63")).toBe(true);
    expect(isLikelyPreviewImageUrl("https://mosaic.scdn.co/300/ab67616d0000b2731468dc3911c9abea1dcf9676")).toBe(true);
    expect(isLikelyPreviewImageUrl("https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b2736de3b2401255d7639ef5db63")).toBe(true);
  });

  it("accepts YouTube Music's extensionless cover-art CDN URL", () => {
    expect(isLikelyPreviewImageUrl("https://yt3.googleusercontent.com/-v-xt2wjxqt9vTSaEcWcnjbhBE1iIS7L221soxGWcwiu3PVH6ib1oXuGphgI_OhHDHzI1dz0HUg5bcS96Q")).toBe(true);
  });

  it("still accepts a plain extensioned image URL", () => {
    expect(isLikelyPreviewImageUrl("https://example.com/cover.jpg")).toBe(true);
  });

  it("still rejects an unrelated extensionless URL that isn't a known trusted image host", () => {
    expect(isLikelyPreviewImageUrl("https://example.com/some/opaque/path")).toBe(false);
  });
});
