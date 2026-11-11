import { useEffect, useMemo, useState } from "react";
import { desktop } from "../../lib/desktop";
import { collectSerendipityEntries, getSerendipityKind, pickSerendipityDeck } from "../../lib/serendipity";

// Tiles for Home: the reel of random tiles along the top, and the peek of a
// canvas's tiles when its row or card is hovered. Canvases are read from disk
// on demand and cached by path + last edit, so going back to Home doesn't
// reread files that haven't changed.

const REEL_CANVAS_LIMIT = 8;
const PEEK_LIMIT = 6;
const cache = new Map();

function cacheKey(item) {
  return `${item.filePath}::${item.updatedAt ?? ""}`;
}

export function loadCanvasEntries(item) {
  if (!item?.filePath) {
    return Promise.resolve([]);
  }

  const key = cacheKey(item);

  if (!cache.has(key)) {
    const pending = desktop.workspace.loadCanvas(item.filePath, { recordRecent: false })
      .then((doc) => (doc ? collectSerendipityEntries([{ ...doc, filePath: item.filePath, name: item.name }]) : []))
      .catch(() => {
        cache.delete(key);
        return [];
      });
    cache.set(key, pending);
  }

  return cache.get(key);
}

// Pictures first (images and links with a preview read best at a glance),
// then everything else, a few per canvas.
export async function loadPeekEntries(item) {
  const entries = await loadCanvasEntries(item);
  const visual = entries.filter((entry) => {
    const kind = getSerendipityKind(entry.card);
    return kind === "image" || (kind === "link" && entry.card.image);
  });
  const rest = entries.filter((entry) => !visual.includes(entry));
  return [...pickSerendipityDeck(visual, { limit: PEEK_LIMIT }), ...pickSerendipityDeck(rest, { limit: PEEK_LIMIT })]
    .slice(0, PEEK_LIMIT);
}

// A random handful of tiles from the most recently edited canvases.
export function useReelEntries(canvasItems, limit = 18) {
  const sources = useMemo(() => (
    [...(canvasItems ?? [])]
      .filter((item) => item?.filePath)
      .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
      .slice(0, REEL_CANVAS_LIMIT)
  ), [canvasItems]);
  const sourcesKey = sources.map(cacheKey).join("|");
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let cancelled = false;

    Promise.all(sources.map(loadCanvasEntries)).then((lists) => {
      if (!cancelled) {
        setEntries(pickSerendipityDeck(lists.flat(), { limit }));
      }
    });

    return () => {
      cancelled = true;
    };
    // sourcesKey stands in for `sources` (same canvases, same edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey, limit]);

  return entries;
}
