// Consent walls in the offscreen capture window.
//
// The capture window has no cookies, so in the UK/EU Google and YouTube send
// every page to consent.google.com ("Before you continue"), and the preview
// became a screenshot of that cookie screen. Setting Google's own consent
// cookie with the "reject all" value (SOCS=CAI, the same one yt-dlp uses)
// before loading skips the screen without accepting any tracking.

const CONSENT_COOKIE = Object.freeze({ name: "SOCS", value: "CAI" });
const CONSENT_COOKIE_LIFETIME_SECONDS = 60 * 60 * 24 * 365;

function getHost(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

// google.com, google.co.uk, www.google.de, youtube.com, m.youtube.com ...
// -> the cookie domain (".google.co.uk"), or "" for anything else.
function getConsentCookieDomain(host) {
  const google = host.match(/(?:^|\.)(google\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2,3}))$/);
  if (google) {
    return `.${google[1]}`;
  }

  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    return ".youtube.com";
  }

  return "";
}

function getConsentCookies(url, nowSeconds = Date.now() / 1000) {
  const domain = getConsentCookieDomain(getHost(url));
  if (!domain) {
    return [];
  }

  // consent.google.com itself lives on .google.com, so a country domain
  // gets the cookie there too.
  const domains = domain === ".google.com" || domain === ".youtube.com" || !domain.startsWith(".google.")
    ? [domain]
    : [domain, ".google.com"];

  return domains.map((cookieDomain) => ({
    url: `https://www${cookieDomain}`,
    domain: cookieDomain,
    path: "/",
    secure: true,
    name: CONSENT_COOKIE.name,
    value: CONSENT_COOKIE.value,
    expirationDate: Math.round(nowSeconds + CONSENT_COOKIE_LIFETIME_SECONDS),
  }));
}

// True when the window still ended up on a consent screen; a screenshot of
// it is not a preview of the page, so the capture is dropped.
function isConsentPageUrl(url) {
  const host = getHost(url);
  if (!host) {
    return false;
  }

  if (/^consent\.(google|youtube)\./.test(host)) {
    return true;
  }

  try {
    return /\/consent(\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

module.exports = {
  getConsentCookieDomain,
  getConsentCookies,
  isConsentPageUrl,
};
