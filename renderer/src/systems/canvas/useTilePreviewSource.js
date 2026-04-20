import { useEffect, useMemo, useState } from "react";
import { LINK_CONTENT_KIND_IMAGE } from "../../lib/workspace";
import { desktop } from "../../lib/desktop";
import { normalizePreviewTier, PREVIEW_TIER } from "./tileLod";

const resolvedPreviewUrlCache = new Map();
const pendingPreviewUrlCache = new Map();

function toDevicePixelRatioBucket(devicePixelRatio) {
  if (!Number.isFinite(devicePixelRatio)) {
    return 1;
  }

  return Math.max(1, Math.min(2, Number(devicePixelRatio.toFixed(2))));
}

function getPreviewCacheKey(folderPath, relativePath, previewTier, devicePixelRatio) {
  return [
    folderPath || "",
    relativePath || "",
    previewTier || PREVIEW_TIER.ORIGINAL,
    toDevicePixelRatioBucket(devicePixelRatio),
  ].join("|");
}

async function resolveAssetPreviewUrl({
  folderPath,
  relativePath,
  previewTier,
  devicePixelRatio,
}) {
  if (!folderPath || !relativePath) {
    return "";
  }

  const cacheKey = getPreviewCacheKey(folderPath, relativePath, previewTier, devicePixelRatio);

  if (resolvedPreviewUrlCache.has(cacheKey)) {
    return resolvedPreviewUrlCache.get(cacheKey) || "";
  }

  const pending = pendingPreviewUrlCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = desktop.workspace.resolveAssetUrl(folderPath, relativePath, {
    previewTier,
    devicePixelRatio: toDevicePixelRatioBucket(devicePixelRatio),
  })
    .then((resolvedUrl) => {
      const safeUrl = typeof resolvedUrl === "string" ? resolvedUrl : "";
      resolvedPreviewUrlCache.set(cacheKey, safeUrl);
      pendingPreviewUrlCache.delete(cacheKey);
      return safeUrl;
    })
    .catch(() => {
      pendingPreviewUrlCache.delete(cacheKey);
      return "";
    });

  pendingPreviewUrlCache.set(cacheKey, promise);
  return promise;
}

export function useTilePreviewSource({
  card,
  folderPath,
  previewTier,
  imageEnabled = true,
  devicePixelRatio = 1,
}) {
  const [resolvedImageSrc, setResolvedImageSrc] = useState("");
  const normalizedTier = normalizePreviewTier(previewTier);
  const isImageTile = card?.contentKind === LINK_CONTENT_KIND_IMAGE;
  const assetRelativePath = card?.asset?.relativePath ?? "";

  const fallbackImageSrc = useMemo(() => {
    if (!imageEnabled) {
      return "";
    }

    if (isImageTile) {
      return typeof card?.image === "string" ? card.image : "";
    }

    return typeof card?.image === "string" ? card.image : "";
  }, [card?.image, imageEnabled, isImageTile]);

  useEffect(() => {
    let cancelled = false;

    async function resolveSource() {
      if (!imageEnabled) {
        setResolvedImageSrc("");
        return;
      }

      if (!isImageTile || !assetRelativePath || !folderPath) {
        setResolvedImageSrc(fallbackImageSrc);
        return;
      }

      const sourceUrl = await resolveAssetPreviewUrl({
        folderPath,
        relativePath: assetRelativePath,
        previewTier: normalizedTier,
        devicePixelRatio,
      });

      if (!cancelled) {
        setResolvedImageSrc(sourceUrl || fallbackImageSrc);
      }
    }

    void resolveSource();

    return () => {
      cancelled = true;
    };
  }, [
    assetRelativePath,
    devicePixelRatio,
    fallbackImageSrc,
    folderPath,
    imageEnabled,
    isImageTile,
    normalizedTier,
  ]);

  return {
    src: resolvedImageSrc || fallbackImageSrc,
    previewTier: normalizedTier,
  };
}
