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

const PREVIEW_STATUS = Object.freeze({
  READY: "ready",
  FALLBACK: "fallback",
  BLOCKED: "blocked",
  ERROR: "error",
});

const PREVIEW_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
});

const PREVIEW_KIND = Object.freeze({
  GENERIC_LINK: "generic-link",
  AMAZON_PRODUCT: "amazon-product",
  GITHUB_REPO: "github-repo",
  PINTEREST_PIN: "pinterest-pin",
  YOUTUBE_VIDEO: "youtube-video",
  IMAGE: "image",
  X_POST: "x-post",
  FALLBACK_LINK: "fallback-link",
});

const PREVIEW_REJECTION_REASON = Object.freeze({
  CONSENT_PAGE: "consent_page",
  LOGIN_WALL: "login_wall",
  CAPTCHA: "captcha",
  UNUSUAL_TRAFFIC: "unusual_traffic",
  PLACEHOLDER_IMAGE: "placeholder_image",
  LOW_INFORMATION: "low_information",
  REDIRECTED_NON_CONTENT: "redirected_non_content",
  UNSUPPORTED_DOMAIN: "unsupported_domain",
  UNKNOWN: "unknown",
});

const PREVIEW_STATE_VALUES = Object.freeze(["idle", "loading", "ready", "fallback", "blocked", "error"]);

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

module.exports = {
  MUSIC_HOSTS,
  PREVIEW_CAPTURE_TIMEOUT_MS,
  PREVIEW_CONFIDENCE,
  PREVIEW_DOCUMENT_TIMEOUT_MS,
  PREVIEW_GENERIC_TITLES,
  PREVIEW_IMAGE_REJECTION_PATTERNS,
  PREVIEW_JPEG_QUALITY,
  PREVIEW_KIND,
  PREVIEW_NETWORK_IDLE_TIMEOUT_MS,
  PREVIEW_REJECTION_PATTERNS,
  PREVIEW_REJECTION_REASON,
  PREVIEW_STATE_VALUES,
  PREVIEW_STATUS,
  PREVIEW_URL_REJECTION_PATTERNS,
  PREVIEW_VIEWPORT,
  REMOTE_IMAGE_MAX_BYTES,
  REMOTE_IMAGE_TIMEOUT_MS,
};
