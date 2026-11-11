import { createContext, useContext } from "react";

/**
 * TileAppContext
 * value: the slice of the app context that tiles use -- the card actions
 * (updateExistingCard, deleteExistingCard, setCanvasInteractionState) and
 * folderPath / currentEditor -- provided by the board that renders them.
 *
 * Every value in it is stable across workspace changes, unlike the full app
 * context, which changes on every edit. Tiles that read the app context
 * re-rendered on every edit anywhere on the canvas (a drop, a text box
 * resize), memo or not; this way an edit to card A re-renders only A.
 * The board reads these from useAppContext(), so a split screen pane's
 * page-scoped actions carry through.
 */
export const TileAppContext = createContext(null);

export function useTileAppContext() {
  const context = useContext(TileAppContext);

  if (!context) {
    throw new Error("useTileAppContext must be used inside a board that renders tiles.");
  }

  return context;
}
