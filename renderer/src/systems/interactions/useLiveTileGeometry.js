import { useCallback, useMemo, useRef, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";

const GEOMETRY_VARS = {
  x: "--tile-x",
  y: "--tile-y",
  width: "--tile-width",
  height: "--tile-height",
};

// A tile's resize, previewed locally and committed once.
//
// Writing the card on every pointermove (updateExistingCard) updates the
// whole workspace: AppProvider, the canvas root, the layout system and the
// tether sync all re-run per frame (~23 ms a frame at 60 tiles). While a
// resize is live, the tile instead keeps the changed fields in its own state
// and renders from `card` / `tileMeta` with them applied (its --tile-* vars
// too), so only that tile re-renders. `commitLive` writes the result to the
// card in one update, in the same render that drops the local copy, so the
// tile never shows the old size in between.
//
// Usage: call it first in the tile with the props it was given, and use the
// returned `card` / `tileMeta` everywhere below.
export function useLiveTileGeometry(committedCard, committedTileMeta) {
  const { updateExistingCard } = useTileAppContext();
  const [live, setLive] = useState(null);
  // The live patch, also readable from handlers and observers mid-gesture.
  const liveRef = useRef(null);

  const updateLive = useCallback((patch) => {
    liveRef.current = { ...(liveRef.current ?? {}), ...patch };
    setLive(liveRef.current);
  }, []);

  const cardId = committedCard.id;
  const commitLive = useCallback((extraPatch = null) => {
    const patch = liveRef.current || extraPatch ? { ...(liveRef.current ?? {}), ...(extraPatch ?? {}) } : null;
    liveRef.current = null;
    if (patch) {
      updateExistingCard(cardId, patch);
    }
    setLive(null);
  }, [cardId, updateExistingCard]);

  const card = useMemo(
    () => (live ? { ...committedCard, ...live } : committedCard),
    [committedCard, live],
  );

  const tileMeta = useMemo(() => {
    if (!live || !committedTileMeta?.styleVars) {
      return committedTileMeta;
    }
    const styleVars = { ...committedTileMeta.styleVars };
    for (const [key, cssVar] of Object.entries(GEOMETRY_VARS)) {
      if (Number.isFinite(live[key]) && cssVar in styleVars) {
        styleVars[cssVar] = `${live[key]}px`;
      }
    }
    return { ...committedTileMeta, styleVars };
  }, [committedTileMeta, live]);

  return { card, tileMeta, updateLive, commitLive, liveRef };
}
