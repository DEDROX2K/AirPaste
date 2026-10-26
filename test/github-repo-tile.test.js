// The GitHub repo tile: a pasted github.com/<owner>/<repo> link becomes a
// "github-repo" card whose stats and language ribbon come from GitHub's
// public REST API (two requests, resolved in the main process).
import { describe, expect, it } from "vitest";
import { classifyPreviewTarget } from "../preview/classification.js";
import { getCardStateFromResolvedPreview } from "../preview/card-mapper.js";
import { parseGitHubRepoIdentity, resolveGitHubRepoPreview } from "../preview/resolvers/github.js";
import { normalizeCard } from "@/lib/workspace.js";
import { createLinkCard } from "@/tiles/link/model.js";
import {
  formatRepoCount,
  formatUpdatedAgo,
  getLanguageSegments,
  parseGitHubRepoUrl,
} from "@/tiles/github/model.js";

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

function fakeGitHubFetch(routes) {
  return async (url) => {
    const route = routes[url];
    if (!route) {
      throw new Error(`Unexpected request: ${url}`);
    }
    return route();
  };
}

const notUsedGenericResolver = async () => {
  throw new Error("generic resolver should not run for a repo link");
};

describe("GitHub repo link parsing", () => {
  it.each([
    ["https://github.com/vercel/next.js", { owner: "vercel", repo: "next.js" }],
    ["https://github.com/vercel/next.js/", { owner: "vercel", repo: "next.js" }],
    ["https://www.github.com/vercel/next.js/tree/canary/packages", { owner: "vercel", repo: "next.js" }],
    ["https://github.com/AranScope/github-cards.git", { owner: "AranScope", repo: "github-cards" }],
  ])("reads %s as a repo", (url, expected) => {
    expect(parseGitHubRepoIdentity(url)).toEqual(expected);
    expect(parseGitHubRepoUrl(url)).toEqual(expected);
  });

  it.each([
    "https://github.com/vercel",
    "https://gist.github.com/someone/abc123",
    "https://github.com/orgs/vercel/repositories",
    "https://github.com/settings/profile",
    "https://github.com/topics/react",
    "https://example.com/vercel/next.js",
  ])("does not treat %s as a repo", (url) => {
    expect(parseGitHubRepoIdentity(url)).toBeNull();
    expect(parseGitHubRepoUrl(url)).toBeNull();
  });

  it("routes only repo links to the github resolver", () => {
    expect(classifyPreviewTarget("https://github.com/vercel/next.js").resolverKey).toBe("github");
    expect(classifyPreviewTarget("https://github.com/settings/profile").resolverKey).not.toBe("github");
  });
});

describe("resolveGitHubRepoPreview", () => {
  const base = "https://api.github.com/repos/AranScope/github-cards";

  it("maps the repo and languages endpoints onto the tile's data", async () => {
    const fetchImpl = fakeGitHubFetch({
      [base]: () => jsonResponse({
        name: "github-cards",
        owner: { login: "AranScope" },
        description: "Embed cards for your repos",
        html_url: "https://github.com/AranScope/github-cards",
        stargazers_count: 6,
        forks_count: 3,
        open_issues_count: 0,
        pushed_at: "2026-10-20T10:00:00Z",
      }),
      [`${base}/languages`]: () => jsonResponse({ CSS: 21000, TypeScript: 71000, HTML: 8000 }),
    });

    const { result } = await resolveGitHubRepoPreview("https://github.com/AranScope/github-cards", notUsedGenericResolver, fetchImpl);

    expect(result).toMatchObject({
      kind: "github-repo",
      status: "ready",
      title: "AranScope/github-cards",
      description: "Embed cards for your repos",
    });
    expect(result.metadata.github).toMatchObject({
      owner: "AranScope",
      name: "github-cards",
      stars: 6,
      forks: 3,
      issues: 0,
      pushedAt: "2026-10-20T10:00:00Z",
      error: "",
      languages: [
        { name: "TypeScript", bytes: 71000 },
        { name: "CSS", bytes: 21000 },
        { name: "HTML", bytes: 8000 },
      ],
    });
  });

  it.each([
    ["not-found", () => jsonResponse({}, { status: 404 })],
    ["rate-limited", () => jsonResponse({}, { status: 403, headers: { "x-ratelimit-remaining": "0" } })],
    ["rate-limited", () => jsonResponse({}, { status: 429 })],
    ["unavailable", () => jsonResponse({}, { status: 500 })],
    ["unavailable", () => { throw new TypeError("fetch failed"); }],
  ])("falls back to the error state (%s), keeping the name from the URL", async (code, repoRoute) => {
    const fetchImpl = fakeGitHubFetch({
      [base]: repoRoute,
      [`${base}/languages`]: () => jsonResponse({}, { status: 404 }),
    });

    const { result } = await resolveGitHubRepoPreview("https://github.com/AranScope/github-cards", notUsedGenericResolver, fetchImpl);

    expect(result.kind).toBe("github-repo");
    expect(result.metadata.github).toMatchObject({
      owner: "AranScope",
      name: "github-cards",
      stars: null,
      languages: null,
      error: code,
    });
  });
});

describe("github-repo cards", () => {
  it("creates a pasted repo link as a github-repo card in its loading state", () => {
    const card = createLinkCard([], { x: 0, y: 0, zoom: 1 }, "https://github.com/vercel/next.js");

    expect(card.type).toBe("github-repo");
    expect(card.status).toBe("loading");
    expect(card.width).toBe(440);
    expect(card.repo).toMatchObject({ owner: "vercel", name: "next.js", stars: null, languages: null, error: "" });
  });

  it("still creates ordinary links as link cards", () => {
    expect(createLinkCard([], { x: 0, y: 0, zoom: 1 }, "https://example.com/").type).toBe("link");
  });

  it("normalizes stored repo data and survives a round trip", () => {
    const card = normalizeCard({
      type: "github-repo",
      url: "https://github.com/vercel/next.js",
      repo: { stars: 12.4, languages: [{ name: "Rust", bytes: 10 }, { name: "", bytes: 5 }], error: "bogus" },
    });

    expect(card.repo).toEqual({
      owner: "vercel",
      name: "next.js",
      stars: 12,
      forks: null,
      issues: null,
      pushedAt: "",
      languages: [{ name: "Rust", bytes: 10 }],
      fetchedAt: "",
      error: "",
    });
    expect(normalizeCard(card).repo).toEqual(card.repo);
  });

  it("keeps the last good numbers when a refresh fails", () => {
    const goodRepo = { owner: "vercel", name: "next.js", stars: 120000, error: "" };
    const currentCard = { type: "github-repo", url: "https://github.com/vercel/next.js", description: "The React Framework", repo: goodRepo };
    const failedResult = {
      kind: "github-repo",
      status: "ready",
      description: "",
      metadata: { github: { owner: "vercel", name: "next.js", stars: null, error: "rate-limited" } },
    };

    const nextState = getCardStateFromResolvedPreview(currentCard, failedResult, () => ({ width: 440, height: 330 }));

    expect(nextState.type).toBe("github-repo");
    expect(nextState.repo).toBe(goodRepo);
    expect(nextState.description).toBe("The React Framework");
  });
});

describe("GitHub tile display helpers", () => {
  it("splits languages into the top three plus Other", () => {
    const segments = getLanguageSegments([
      { name: "TypeScript", bytes: 70 },
      { name: "CSS", bytes: 20 },
      { name: "HTML", bytes: 6 },
      { name: "Shell", bytes: 3 },
      { name: "Makefile", bytes: 1 },
    ]);

    expect(segments.map((segment) => segment.name)).toEqual(["TypeScript", "CSS", "HTML", "Other"]);
    expect(segments[3]).toMatchObject({ pct: 4, color: "#C9CED6" });
    expect(getLanguageSegments([])).toEqual([]);
    expect(getLanguageSegments(null)).toBeNull();
  });

  it("formats counts and update times like the design", () => {
    expect([null, 6, 1234, 45678, 1_200_000].map(formatRepoCount)).toEqual(["–", "6", "1.2k", "46k", "1.2M"]);

    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(formatUpdatedAgo("2026-10-23T12:00:00Z", now)).toBe("Updated 3 days ago");
    expect(formatUpdatedAgo("2026-10-26T11:59:30Z", now)).toBe("Updated just now");
    expect(formatUpdatedAgo("", now)).toBe("");
  });
});
