const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { createResolvedPreviewResult } = require("../result");
const { firstString } = require("../utils");

const GITHUB_API_TIMEOUT_MS = 8000;

// First path segments on github.com that are site pages, not a repo owner.
// Profiles (one segment), gists (gist.github.com) and orgs are out of scope.
const RESERVED_OWNER_SEGMENTS = new Set([
  "about", "apps", "codespaces", "collections", "contact", "customer-stories",
  "enterprise", "events", "explore", "features", "issues", "login", "marketplace",
  "new", "notifications", "orgs", "pricing", "pulls", "readme", "search",
  "security", "settings", "site", "sponsors", "topics", "trending", "users",
]);
const NAME_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;

// github.com/<owner>/<repo>, allowing extra path segments, a trailing slash
// and a ".git" suffix.
function parseGitHubRepoIdentity(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname !== "github.com" && hostname !== "www.github.com") {
      return null;
    }

    const [owner, rawRepo] = parsedUrl.pathname.split("/").filter(Boolean);
    const repo = String(rawRepo ?? "").replace(/\.git$/i, "");

    if (
      !owner
      || !repo
      || RESERVED_OWNER_SEGMENTS.has(owner.toLowerCase())
      || !NAME_SEGMENT_PATTERN.test(owner)
      || !NAME_SEGMENT_PATTERN.test(repo)
    ) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

function getGitHubApiHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AirPaste",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Optional: unauthenticated calls get 60 requests/hour per IP, a token 5,000.
  const token = String(process.env.GITHUB_TOKEN ?? "").trim();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function isRateLimited(response) {
  return response.status === 429
    || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
}

function toCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

// { "TypeScript": 71234, ... } -> [{ name, bytes }] sorted by bytes.
// null means unavailable; [] means the repo has no detected code.
function normalizeLanguageBytes(languageMap) {
  if (!languageMap || typeof languageMap !== "object" || Array.isArray(languageMap)) {
    return null;
  }

  return Object.entries(languageMap)
    .filter(([name, bytes]) => typeof name === "string" && Number.isFinite(bytes) && bytes > 0)
    .map(([name, bytes]) => ({ name, bytes: Math.round(bytes) }))
    .sort((a, b) => b.bytes - a.bytes);
}

// Two requests per tile: the repo and its language breakdown. Throws a
// tagged error (code: "not-found" | "rate-limited" | "unavailable") so the
// tile can show its error state.
async function fetchGitHubRepoData({ owner, repo }, fetchImpl = fetch) {
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const requestOptions = {
    headers: getGitHubApiHeaders(),
    signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
  };
  const [repoResponse, languagesResponse] = await Promise.all([
    fetchImpl(baseUrl, requestOptions),
    fetchImpl(`${baseUrl}/languages`, requestOptions).catch(() => null),
  ]);

  if (isRateLimited(repoResponse)) {
    throw Object.assign(new Error("GitHub rate limit reached"), { code: "rate-limited" });
  }

  if (repoResponse.status === 404) {
    throw Object.assign(new Error("Repository not found, or it is private"), { code: "not-found" });
  }

  if (!repoResponse.ok) {
    throw Object.assign(new Error(`GitHub returned ${repoResponse.status}`), { code: "unavailable" });
  }

  const repoJson = await repoResponse.json();
  const languagesJson = languagesResponse?.ok
    ? await languagesResponse.json().catch(() => null)
    : null;

  return {
    owner: firstString(repoJson?.owner?.login, owner),
    name: firstString(repoJson?.name, repo),
    description: typeof repoJson?.description === "string" ? repoJson.description : "",
    htmlUrl: firstString(repoJson?.html_url, `https://github.com/${owner}/${repo}`),
    stars: toCount(repoJson?.stargazers_count),
    forks: toCount(repoJson?.forks_count),
    // GitHub counts open pull requests here too; a pure issue count would
    // cost a third (search) request per tile.
    issues: toCount(repoJson?.open_issues_count),
    pushedAt: typeof repoJson?.pushed_at === "string" ? repoJson.pushed_at : "",
    languages: normalizeLanguageBytes(languagesJson),
  };
}

async function resolveGitHubRepoPreview(url, genericResolver, fetchImpl = fetch) {
  const identity = parseGitHubRepoIdentity(url);

  if (!identity) {
    return genericResolver(url);
  }

  const fetchedAt = new Date().toISOString();

  try {
    const data = await fetchGitHubRepoData(identity, fetchImpl);

    return {
      result: createResolvedPreviewResult({
        kind: PREVIEW_KIND.GITHUB_REPO,
        confidence: PREVIEW_CONFIDENCE.HIGH,
        status: PREVIEW_STATUS.READY,
        url,
        resolvedUrl: data.htmlUrl,
        canonicalUrl: data.htmlUrl,
        title: `${data.owner}/${data.name}`,
        description: data.description,
        siteName: "GitHub",
        favicon: "https://github.com/favicon.ico",
        author: data.owner,
        sourceType: "github-repo",
        metadata: {
          github: {
            owner: data.owner,
            name: data.name,
            stars: data.stars,
            forks: data.forks,
            issues: data.issues,
            pushedAt: data.pushedAt,
            languages: data.languages,
            fetchedAt,
            error: "",
          },
        },
      }),
      documentSignals: {},
      documentSnapshot: null,
    };
  } catch (error) {
    // The tile still renders (name from the URL, stats as dashes); the error
    // code picks its copy. No scraping fallback: github.com's OG tags add
    // nothing the tile shows.
    return {
      result: createResolvedPreviewResult({
        kind: PREVIEW_KIND.GITHUB_REPO,
        confidence: PREVIEW_CONFIDENCE.LOW,
        status: PREVIEW_STATUS.READY,
        reason: error?.message || "GitHub data unavailable",
        url,
        resolvedUrl: url,
        canonicalUrl: url,
        title: `${identity.owner}/${identity.repo}`,
        siteName: "GitHub",
        sourceType: "github-repo",
        metadata: {
          github: {
            owner: identity.owner,
            name: identity.repo,
            stars: null,
            forks: null,
            issues: null,
            pushedAt: "",
            languages: null,
            fetchedAt,
            error: typeof error?.code === "string" ? error.code : "unavailable",
          },
        },
      }),
      documentSignals: {},
      documentSnapshot: null,
    };
  }
}

module.exports = {
  fetchGitHubRepoData,
  parseGitHubRepoIdentity,
  resolveGitHubRepoPreview,
};
