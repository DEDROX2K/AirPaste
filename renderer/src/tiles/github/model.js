import TILE_TYPES from "../tileTypes";

export const GITHUB_REPO_CARD_TYPE = TILE_TYPES.GITHUB_REPO;

// Height is only the starting value: the tile measures its content and
// writes the real height back.
export const GITHUB_REPO_CARD_SIZE = Object.freeze({
  width: 440,
  height: 330,
});

export const GITHUB_REPO_ERRORS = Object.freeze(["not-found", "rate-limited", "unavailable"]);

const OTHER_LANGUAGE_COLOR = "#C9CED6";
const TOP_LANGUAGE_COUNT = 3;

// Mirrors preview/resolvers/github.js (the main-process resolver, CommonJS)
// so a pasted repo link can become this tile -- in its loading state --
// before the preview job even starts.
const RESERVED_OWNER_SEGMENTS = new Set([
  "about", "apps", "codespaces", "collections", "contact", "customer-stories",
  "enterprise", "events", "explore", "features", "issues", "login", "marketplace",
  "new", "notifications", "orgs", "pricing", "pulls", "readme", "search",
  "security", "settings", "site", "sponsors", "topics", "trending", "users",
]);
const NAME_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function parseGitHubRepoUrl(url) {
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

function toCountOrNull(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

// null = language data unavailable, [] = no code detected.
function normalizeLanguages(languages) {
  if (!Array.isArray(languages)) {
    return null;
  }

  return languages
    .filter((entry) => typeof entry?.name === "string" && entry.name && Number.isFinite(entry?.bytes) && entry.bytes > 0)
    .map((entry) => ({ name: entry.name, bytes: Math.round(entry.bytes) }))
    .sort((a, b) => b.bytes - a.bytes);
}

export function normalizeGitHubRepoData(repo, url = "") {
  const fromUrl = parseGitHubRepoUrl(url);
  const source = repo && typeof repo === "object" ? repo : {};

  return {
    owner: typeof source.owner === "string" && source.owner ? source.owner : (fromUrl?.owner ?? ""),
    name: typeof source.name === "string" && source.name ? source.name : (fromUrl?.repo ?? ""),
    stars: toCountOrNull(source.stars),
    forks: toCountOrNull(source.forks),
    issues: toCountOrNull(source.issues),
    pushedAt: typeof source.pushedAt === "string" ? source.pushedAt : "",
    languages: normalizeLanguages(source.languages),
    fetchedAt: typeof source.fetchedAt === "string" ? source.fetchedAt : "",
    error: GITHUB_REPO_ERRORS.includes(source.error) ? source.error : "",
  };
}

/* ---------- display helpers ---------- */

// Subset of github-linguist's colours (languages.yml); anything missing gets
// a stable colour derived from its name.
const LANGUAGE_COLORS = Object.freeze({
  Assembly: "#6E4C13",
  Astro: "#ff5a03",
  Batchfile: "#C1F12E",
  C: "#555555",
  "C#": "#178600",
  "C++": "#f34b7d",
  Clojure: "#db5855",
  CMake: "#DA3434",
  CoffeeScript: "#244776",
  Crystal: "#000100",
  CSS: "#563d7c",
  Cuda: "#3A4E3A",
  Dart: "#00B4AB",
  Dockerfile: "#384d54",
  Elixir: "#6e4a7e",
  Elm: "#60B5CC",
  Erlang: "#B83998",
  "F#": "#b845fc",
  Fortran: "#4d41b1",
  GDScript: "#355570",
  GLSL: "#5686a5",
  Go: "#00ADD8",
  Groovy: "#4298b8",
  Handlebars: "#f7931e",
  Haskell: "#5e5086",
  HCL: "#844FBA",
  HTML: "#e34c26",
  Java: "#b07219",
  JavaScript: "#f1e05a",
  Julia: "#a270ba",
  "Jupyter Notebook": "#DA5B0B",
  Kotlin: "#A97BFF",
  Less: "#1d365d",
  Lua: "#000080",
  Makefile: "#427819",
  MATLAB: "#e16737",
  MDX: "#fcb32c",
  Nix: "#7e7eff",
  "Objective-C": "#438eff",
  OCaml: "#ef7a08",
  Perl: "#0298c3",
  PHP: "#4F5D95",
  PowerShell: "#012456",
  Python: "#3572A5",
  R: "#198CE7",
  Ruby: "#701516",
  Rust: "#dea584",
  Sass: "#a53b70",
  Scala: "#c22d40",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Solidity: "#AA6746",
  Svelte: "#ff3e00",
  Swift: "#F05138",
  TeX: "#3D6117",
  TypeScript: "#3178c6",
  Vue: "#41b883",
  WebAssembly: "#04133b",
  Zig: "#ec915c",
});

export function getLanguageColor(name) {
  if (LANGUAGE_COLORS[name]) {
    return LANGUAGE_COLORS[name];
  }

  let hue = 0;
  for (let index = 0; index < name.length; index += 1) {
    hue = (hue * 31 + name.charCodeAt(index)) % 360;
  }

  return `hsl(${hue} 55% 50%)`;
}

// Top three languages, then one grey "Other" for the remainder.
export function getLanguageSegments(languages) {
  if (!Array.isArray(languages)) {
    return null;
  }

  const total = languages.reduce((sum, entry) => sum + entry.bytes, 0);

  if (total <= 0) {
    return [];
  }

  const segments = languages.slice(0, TOP_LANGUAGE_COUNT).map((entry) => ({
    name: entry.name,
    pct: (entry.bytes / total) * 100,
    color: getLanguageColor(entry.name),
  }));
  const restBytes = languages.slice(TOP_LANGUAGE_COUNT).reduce((sum, entry) => sum + entry.bytes, 0);

  if (restBytes > 0) {
    segments.push({ name: "Other", pct: (restBytes / total) * 100, color: OTHER_LANGUAGE_COLOR });
  }

  return segments;
}

export function formatLanguagePercent(pct) {
  return `${pct < 1 ? "<1" : Math.round(pct)}%`;
}

// 6 -> "6", 1234 -> "1.2k", 45678 -> "46k", 1200000 -> "1.2M"
export function formatRepoCount(value) {
  if (!Number.isFinite(value)) {
    return "–";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  }

  return String(value);
}

const RELATIVE_TIME_UNITS = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
let relativeTimeFormat = null;

// "Updated 3 days ago"; empty when the timestamp is missing or invalid.
export function formatUpdatedAgo(isoTimestamp, now = Date.now()) {
  const time = new Date(isoTimestamp).getTime();

  if (!isoTimestamp || Number.isNaN(time)) {
    return "";
  }

  relativeTimeFormat ??= new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const elapsedSeconds = Math.max(0, (now - time) / 1000);

  for (const [unit, seconds] of RELATIVE_TIME_UNITS) {
    if (elapsedSeconds >= seconds) {
      return `Updated ${relativeTimeFormat.format(-Math.floor(elapsedSeconds / seconds), unit)}`;
    }
  }

  return "Updated just now";
}
