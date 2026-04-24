const cheerio = require("cheerio");
const openGraphScraper = require("open-graph-scraper");
const {
  PREVIEW_CAPTURE_TIMEOUT_MS,
  PREVIEW_CONFIDENCE,
  PREVIEW_DOCUMENT_TIMEOUT_MS,
  PREVIEW_JPEG_QUALITY,
  PREVIEW_KIND,
  PREVIEW_NETWORK_IDLE_TIMEOUT_MS,
  PREVIEW_STATUS,
  PREVIEW_VIEWPORT,
  REMOTE_IMAGE_MAX_BYTES,
  REMOTE_IMAGE_TIMEOUT_MS,
} = require("../constants");
const { createResolvedPreviewResult } = require("../result");
const {
  cleanPreviewText,
  firstString,
  getHostname,
  getImageCandidates,
  isMusicHost,
  resolveUrl,
  scoreImageCandidate,
  uniqueValues,
} = require("../utils");

let previewBrowserPromise = null;
let playwrightChromium = null;
let attemptedPlaywrightLoad = false;

function getPlaywrightChromium() {
  if (attemptedPlaywrightLoad) {
    return playwrightChromium;
  }

  attemptedPlaywrightLoad = true;

  try {
    ({ chromium: playwrightChromium } = require("playwright"));
  } catch {
    playwrightChromium = null;
  }

  return playwrightChromium;
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

async function fetchImageDataUrl(url) {
  if (!url) {
    return "";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return "";
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);

    if (!contentType.startsWith("image/")) {
      return "";
    }

    if (Number.isFinite(contentLength) && contentLength > REMOTE_IMAGE_MAX_BYTES) {
      return "";
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > REMOTE_IMAGE_MAX_BYTES) {
      return "";
    }

    return bufferToDataUrl(buffer, contentType);
  } catch {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

function isPinterestImageUrl(url) {
  return /https?:\/\/(?:i\.)?pinimg\.com\//i.test(String(url ?? ""));
}

function upgradePinterestImageUrl(url) {
  if (!url) {
    return "";
  }

  return url.replace(/i\.pinimg\.com\/(?:\d+x|\d+x\d+_RS)\//i, "i.pinimg.com/originals/");
}

function logPinterestImageDebug(event, payload) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(`[preview:pinterest:image] ${event}`, payload);
}

async function fetchPreviewDocument(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PREVIEW_DOCUMENT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const html = contentType.includes("text/html") ? await response.text() : "";

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      contentType,
      html,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      html: "",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractPreviewDocumentSignals(documentSnapshot) {
  const html = typeof documentSnapshot?.html === "string" ? documentSnapshot.html : "";

  if (!html) {
    return {
      pageTitle: "",
      bodyText: "",
      faviconUrl: "",
      ogTitle: "",
      ogDescription: "",
      ogImageUrl: "",
    };
  }

  const $ = cheerio.load(html);
  const pageTitle = cleanPreviewText($("title").first().text());
  const bodyText = cleanPreviewText($("body").text()).slice(0, 8000);
  const faviconUrl = resolveUrl(
    firstString(
      $("link[rel='icon']").attr("href"),
      $("link[rel='shortcut icon']").attr("href"),
      $("link[rel='apple-touch-icon']").attr("href"),
    ),
    documentSnapshot.finalUrl,
  );

  return {
    pageTitle,
    bodyText,
    faviconUrl,
    ogTitle: cleanPreviewText($("meta[property='og:title']").attr("content")),
    ogDescription: cleanPreviewText($("meta[property='og:description']").attr("content")),
    ogImageUrl: resolveUrl($("meta[property='og:image']").attr("content"), documentSnapshot.finalUrl),
  };
}

function chooseBestArtworkUrl(result, pageUrl) {
  const candidates = getImageCandidates(result, pageUrl);

  if (candidates.length === 0) {
    return "";
  }

  candidates.sort((leftCandidate, rightCandidate) => (
    scoreImageCandidate(rightCandidate) - scoreImageCandidate(leftCandidate)
  ));

  return candidates[0].url;
}

function upgradeArtworkUrl(url) {
  if (!url) {
    return "";
  }

  let nextUrl = url;
  nextUrl = nextUrl.replace(/https:\/\/image-cdn-[^/]+\.spotifycdn\.com\/image\//i, "https://i.scdn.co/image/");
  nextUrl = nextUrl.replace(/00001e02/ig, "0000b273");
  nextUrl = nextUrl.replace(/00004851/ig, "0000b273");
  nextUrl = nextUrl.replace(/\/\d{2,4}x\d{2,4}(?:bb|sr)(?=[./?])/i, "/1600x1600bb");
  nextUrl = nextUrl.replace(/\/cover\/\d+x\d+-/i, "/cover/1000x1000-");

  if (/pbs\.twimg\.com\/media\//i.test(nextUrl) || /pbs\.twimg\.com\/ext_tw_video_thumb\//i.test(nextUrl)) {
    if (/[?&]name=/i.test(nextUrl)) {
      nextUrl = nextUrl.replace(/([?&]name=)(?:small|medium|large|900x900|orig)/i, "$1orig");
    } else {
      nextUrl = `${nextUrl}${nextUrl.includes("?") ? "&" : "?"}name=orig`;
    }
  }

  return nextUrl;
}

function expandCandidateUrl(url) {
  const normalizedUrl = String(url ?? "").trim();

  if (!normalizedUrl) {
    return [];
  }

  if (isPinterestImageUrl(normalizedUrl)) {
    const upgradedUrl = upgradePinterestImageUrl(normalizedUrl);
    logPinterestImageDebug("candidate:expanded", {
      extractedCandidate: normalizedUrl,
      upgradedCandidate: upgradedUrl,
    });
    return uniqueValues([upgradedUrl, normalizedUrl]);
  }

  const upgradedUrl = upgradeArtworkUrl(normalizedUrl);

  if (/i\.ytimg\.com\/vi\//i.test(normalizedUrl)) {
    const maxresUrl = normalizedUrl.replace(/\/(?:hqdefault|mqdefault|sddefault)\.jpg(?=$|[?#])/i, "/maxresdefault.jpg");
    return uniqueValues([
      normalizedUrl,
      maxresUrl,
      upgradedUrl,
    ]);
  }

  return uniqueValues([upgradedUrl, normalizedUrl]);
}

function isLikelyPreviewImageUrl(url) {
  if (!url) {
    return false;
  }

  const normalizedUrl = String(url).toLowerCase();
  return !normalizedUrl.includes(".mp4")
    && !normalizedUrl.includes(".m3u8")
    && !normalizedUrl.includes(".mov")
    && !normalizedUrl.includes("video.twimg.com/")
    && !normalizedUrl.includes("/amplify_video/")
    && !normalizedUrl.includes("/tweet_video/")
    && (
      /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(normalizedUrl)
      || normalizedUrl.includes("pbs.twimg.com/media/")
      || normalizedUrl.includes("pbs.twimg.com/ext_tw_video_thumb/")
      || normalizedUrl.includes("i.pinimg.com/")
      || normalizedUrl.includes("i.ytimg.com/")
    );
}

function isBlockedPreviewImageUrl(url) {
  if (!url) {
    return true;
  }

  const normalizedUrl = url.toLowerCase();

  return normalizedUrl.includes("abs.twimg.com/emoji/")
    || normalizedUrl.includes("abs.twimg.com/rweb/ssr/default/v2/og/image.png")
    || normalizedUrl.includes("client-web/icon")
    || normalizedUrl.includes("/favicon")
    || normalizedUrl.includes("/profile_images/")
    || normalizedUrl.includes("/semantic_core_img/");
}

async function resolvePreviewImage(candidateUrls) {
  const acquisition = await acquirePreviewImage(candidateUrls);
  return acquisition.image;
}

async function acquirePreviewImage(candidateUrls) {
  const attemptedCandidateUrls = uniqueValues(candidateUrls)
    .flatMap((candidateUrl) => expandCandidateUrl(candidateUrl))
    .filter((candidateUrl) => (
      candidateUrl
      && !isBlockedPreviewImageUrl(candidateUrl)
      && isLikelyPreviewImageUrl(candidateUrl)
    ));

  for (const candidateUrl of attemptedCandidateUrls) {
    const dataUrl = await fetchImageDataUrl(candidateUrl);

    if (isPinterestImageUrl(candidateUrl)) {
      logPinterestImageDebug(dataUrl ? "fetch:success" : "fetch:failure", {
        candidateUrl,
      });
    }

    if (dataUrl) {
      if (isPinterestImageUrl(candidateUrl)) {
        logPinterestImageDebug("image:chosen", {
          finalChosenImageUrl: candidateUrl,
        });
      }

      return {
        image: dataUrl,
        chosenImageUrl: candidateUrl,
        attemptedCandidateUrls,
      };
    }
  }

  const firstAttemptedUrl = attemptedCandidateUrls[0] ?? "";

  if (isPinterestImageUrl(firstAttemptedUrl)) {
    logPinterestImageDebug("image:chosen", {
      finalChosenImageUrl: firstAttemptedUrl,
    });
  }

  return {
    image: "",
    chosenImageUrl: firstAttemptedUrl,
    attemptedCandidateUrls,
  };
}

function bufferToDataUrl(buffer, mimeType) {
  if (!buffer || !mimeType) {
    return "";
  }

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function getPreviewBrowser() {
  const chromium = getPlaywrightChromium();

  if (!chromium) {
    return null;
  }

  if (!previewBrowserPromise) {
    previewBrowserPromise = chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage"],
    })
      .then((browser) => {
        browser.on("disconnected", () => {
          previewBrowserPromise = null;
        });

        return browser;
      })
      .catch((error) => {
        previewBrowserPromise = null;
        throw error;
      });
  }

  return previewBrowserPromise;
}

async function closePreviewBrowser() {
  const browserPromise = previewBrowserPromise;
  previewBrowserPromise = null;

  if (!browserPromise) {
    return;
  }

  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // Ignore shutdown issues during app exit.
  }
}

async function capturePreviewScreenshot(url) {
  let context = null;

  try {
    const browser = await getPreviewBrowser();
    if (!browser) {
      return "";
    }
    context = await browser.newContext({
      viewport: PREVIEW_VIEWPORT,
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    page.setDefaultNavigationTimeout(PREVIEW_CAPTURE_TIMEOUT_MS);
    page.setDefaultTimeout(PREVIEW_CAPTURE_TIMEOUT_MS);

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: PREVIEW_NETWORK_IDLE_TIMEOUT_MS }).catch(() => { });
    await page.addStyleTag({
      content: [
        "*, *::before, *::after {",
        "  animation-duration: 0s !important;",
        "  animation-delay: 0s !important;",
        "  transition-duration: 0s !important;",
        "  caret-color: transparent !important;",
        "}",
      ].join("\n"),
    }).catch(() => { });

    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: PREVIEW_JPEG_QUALITY,
      fullPage: false,
    });

    return bufferToDataUrl(screenshot, "image/jpeg");
  } catch {
    return "";
  } finally {
    await context?.close().catch(() => { });
  }
}

async function fetchOpenGraphMetadata(url) {
  try {
    const { error, result } = await openGraphScraper({
      url,
      timeout: 10000,
    });

    if (error || !result) {
      return {
        title: "",
        description: "",
        siteName: "",
        favicon: "",
        imageUrl: "",
        previewKind: "default",
      };
    }

    const ogType = firstString(result.ogType).toLowerCase();
    const previewKind = isMusicHost(url) || ogType.startsWith("music.")
      ? "music"
      : "default";

    return {
      title: firstString(
        result.ogTitle,
        result.twitterTitle,
        result.dcTitle,
        result.title,
      ),
      description: firstString(
        result.ogDescription,
        result.twitterDescription,
        result.description,
      ),
      siteName: firstString(
        result.ogSiteName,
        result.twitterSite,
      ),
      favicon: resolveUrl(result.favicon, url),
      imageUrl: chooseBestArtworkUrl(result, url),
      previewKind,
    };
  } catch {
    return {
      title: "",
      description: "",
      siteName: "",
      favicon: "",
      imageUrl: "",
      previewKind: "default",
    };
  }
}

async function resolveGenericLinkPreview(url) {
  const documentSnapshot = await fetchPreviewDocument(url);
  const documentSignals = extractPreviewDocumentSignals(documentSnapshot);
  const resolvedUrl = documentSnapshot.finalUrl || url;
  const metadata = await fetchOpenGraphMetadata(resolvedUrl);
  const candidateImageUrls = uniqueValues([
    metadata.imageUrl,
    documentSignals.ogImageUrl,
  ]);
  const fallbackSiteName = firstString(
    metadata.siteName,
    getHostname(resolvedUrl),
  );

  return {
    result: createResolvedPreviewResult({
      kind: PREVIEW_KIND.GENERIC_LINK,
      confidence: metadata.title || documentSignals.ogTitle ? PREVIEW_CONFIDENCE.MEDIUM : PREVIEW_CONFIDENCE.LOW,
      status: PREVIEW_STATUS.READY,
      canonicalUrl: resolvedUrl,
      title: firstString(metadata.title, documentSignals.ogTitle, documentSignals.pageTitle),
      description: firstString(metadata.description, documentSignals.ogDescription),
      favicon: firstString(documentSignals.faviconUrl, metadata.favicon),
      siteName: fallbackSiteName,
      previewKind: metadata.previewKind,
      candidateImageUrls,
      allowScreenshotFallback: true,
      metadata: {
        source: "generic",
      },
    }),
    documentSignals,
  };
}

module.exports = {
  acquirePreviewImage,
  capturePreviewScreenshot,
  closePreviewBrowser,
  fetchJson,
  resolveGenericLinkPreview,
  resolvePreviewImage,
};
