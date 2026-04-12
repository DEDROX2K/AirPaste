const { PREVIEW_CONFIDENCE, PREVIEW_KIND, PREVIEW_STATUS } = require("../constants");
const { createResolvedPreviewResult } = require("../result");
const { firstString } = require("../utils");

function parseGitHubRepoIdentity(url) {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (segments.length < 2) {
      return null;
    }

    return {
      owner: segments[0],
      repo: segments[1],
    };
  } catch {
    return null;
  }
}

async function resolveGitHubRepoPreview(url, genericResolver) {
  const identity = parseGitHubRepoIdentity(url);

  if (!identity) {
    return genericResolver(url);
  }

  const generic = await genericResolver(url);

  return {
    ...generic,
    result: createResolvedPreviewResult({
      ...generic.result,
      kind: PREVIEW_KIND.GITHUB_REPO,
      confidence: generic.result.title ? PREVIEW_CONFIDENCE.MEDIUM : PREVIEW_CONFIDENCE.LOW,
      status: PREVIEW_STATUS.READY,
      siteName: firstString(generic.result.siteName, "GitHub"),
      allowScreenshotFallback: false,
      metadata: {
        ...generic.result.metadata,
        owner: identity.owner,
        repo: identity.repo,
      },
    }),
  };
}

module.exports = {
  resolveGitHubRepoPreview,
};
