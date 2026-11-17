import { createContext, useContext, useMemo, useRef } from "react";
import { CHECKLIST_CARD_TYPE } from "../lib/workspace";

/**
 * ChecklistCardsContext
 * value: the active page's checklist cards, for tiles that link to one (the
 * progress bar). Separate from TileAppContext and from the app context, so
 * those tiles re-render when a checklist changes, not on every edit
 * anywhere on the canvas.
 */
export const ChecklistCardsContext = createContext(null);

const EMPTY = Object.freeze([]);

export function useChecklistCards() {
  return useContext(ChecklistCardsContext) ?? EMPTY;
}

// The checklist cards of `cards`, as the same array while none of them
// changed (the workspace keeps unchanged cards as the same objects).
export function useStableChecklistCards(cards) {
  const previousRef = useRef(EMPTY);
  return useMemo(() => {
    const next = (cards ?? EMPTY).filter((card) => card.type === CHECKLIST_CARD_TYPE);
    const previous = previousRef.current;
    if (previous.length === next.length && next.every((card, index) => card === previous[index])) {
      return previous;
    }
    previousRef.current = next.length === 0 ? EMPTY : next;
    return previousRef.current;
  }, [cards]);
}
