import { describe, expect, it } from "vitest";
import {
  FAILED_PREVIEW_REASONS,
  getFailedPreviewReason,
  getFailedPreviewReasonCode,
} from "@/tiles/link/failedPreview.js";

const withDiagnostics = (diagnostics, extra = {}) => ({ type: "link", url: "https://example.com", previewDiagnostics: diagnostics, ...extra });

describe("failed link preview reason", () => {
  it("reads HTTP status from the resolver's warnings", () => {
    expect(getFailedPreviewReasonCode(withDiagnostics({
      metadataFetchStatus: "http-error",
      warnings: ["Metadata fetch returned HTTP 404."],
    }))).toBe("not-found");
    expect(getFailedPreviewReasonCode(withDiagnostics({
      metadataFetchStatus: "http-error",
      warnings: ["Metadata fetch returned HTTP 403."],
    }))).toBe("blocked");
    expect(getFailedPreviewReasonCode(withDiagnostics({
      metadataFetchStatus: "http-error",
      warnings: ["Metadata fetch returned HTTP 401."],
    }))).toBe("auth");
  });

  it("maps access barriers", () => {
    expect(getFailedPreviewReasonCode(withDiagnostics({ loginWallDetected: true }))).toBe("auth");
    expect(getFailedPreviewReasonCode(withDiagnostics({ cookieWallDetected: true }))).toBe("blocked");
    // Frame headers only stop iframes; a page that loaded but had no image
    // is "no media", not "blocked".
    expect(getFailedPreviewReasonCode(withDiagnostics({
      embedBlocked: true,
      metadataFetchStatus: "success",
    }))).toBe("no-media");
    expect(getFailedPreviewReasonCode(withDiagnostics({ captchaDetected: true }))).toBe("blocked");
  });

  it("maps non-html and a page with no media", () => {
    expect(getFailedPreviewReasonCode(withDiagnostics({ metadataFetchStatus: "non-html" }))).toBe("not-html");
    expect(getFailedPreviewReasonCode(withDiagnostics({ metadataFetchStatus: "success", thumbnailStatus: "missing" }))).toBe("no-media");
    expect(getFailedPreviewReasonCode({ type: "link" }, { hasImageError: true })).toBe("no-media");
  });

  it("says offline only when a network failure happens offline", () => {
    const card = withDiagnostics({ metadataFetchStatus: "network-error" });
    expect(getFailedPreviewReasonCode(card, { isOnline: false })).toBe("offline");
    expect(getFailedPreviewReasonCode(card)).toBe("unknown");
  });

  it("falls back to a generic line", () => {
    expect(getFailedPreviewReason({ type: "link" })).toBe(FAILED_PREVIEW_REASONS.unknown);
    expect(getFailedPreviewReasonCode({ type: "link", previewError: "Request timed out" })).toBe("timeout");
  });
});

describe("capture window consent cookie", async () => {
  const { getConsentCookies, getConsentCookieDomain, isConsentPageUrl } = await import("../preview/consent.js");

  it("sets Google's reject-all consent cookie for Google and YouTube only", () => {
    expect(getConsentCookieDomain("www.google.com")).toBe(".google.com");
    expect(getConsentCookieDomain("www.google.co.uk")).toBe(".google.co.uk");
    expect(getConsentCookieDomain("google.com.au")).toBe(".google.com.au");
    expect(getConsentCookieDomain("m.youtube.com")).toBe(".youtube.com");
    expect(getConsentCookieDomain("notgoogle.com")).toBe("");
    expect(getConsentCookieDomain("example.com")).toBe("");

    const cookies = getConsentCookies("https://www.google.co.uk/search?q=x", 0);
    expect(cookies.map((cookie) => cookie.domain)).toEqual([".google.co.uk", ".google.com"]);
    expect(cookies[0]).toMatchObject({ name: "SOCS", value: "CAI", secure: true, path: "/" });
    expect(getConsentCookies("https://example.com")).toEqual([]);
  });

  it("spots a consent screen", () => {
    expect(isConsentPageUrl("https://consent.google.com/ml?continue=x")).toBe(true);
    expect(isConsentPageUrl("https://consent.youtube.com/m")).toBe(true);
    expect(isConsentPageUrl("https://www.google.com/search?q=consent")).toBe(false);
  });
});

describe("blank screenshot detection", async () => {
  const { isBlankBitmap } = await import("../preview/blankCapture.js");
  const frame = (count, pick) => Uint8Array.from({ length: count * 4 }, (_, i) => pick(Math.floor(i / 4), i % 4));

  it("drops a flat frame of any colour", () => {
    expect(isBlankBitmap(frame(5000, () => 255))).toBe(true);
    expect(isBlankBitmap(frame(5000, (_, c) => (c === 3 ? 255 : 30)))).toBe(true);
    expect(isBlankBitmap(new Uint8Array(0))).toBe(true);
  });

  it("keeps a page with real content", () => {
    // 5% dark pixels on white: about what example.com measures.
    expect(isBlankBitmap(frame(5000, (p) => (p % 20 === 0 ? 0 : 255)))).toBe(false);
  });

  it("treats a tiny spinner on white as blank", () => {
    expect(isBlankBitmap(frame(5000, (p) => (p < 20 ? 0 : 255)))).toBe(true);
  });
});

describe("refreshing a failed preview", async () => {
  const { createLinkPreviewRefreshPatch } = await import("@/lib/workspace.js");

  it("clears the last attempt's diagnostics so the tile shows its loading state", () => {
    const failed = {
      type: "link",
      url: "https://example.com",
      status: "fallback",
      previewStatus: "fallback",
      previewError: "Preview image unavailable",
      previewDiagnostics: { finalPreviewStatus: "fallback", metadataFetchStatus: "success" },
    };
    const refreshed = { ...failed, ...createLinkPreviewRefreshPatch(failed) };

    expect(refreshed.status).toBe("loading");
    expect(refreshed.previewStatus).toBe("");
    expect(refreshed.previewDiagnostics).toBeNull();
  });
});
