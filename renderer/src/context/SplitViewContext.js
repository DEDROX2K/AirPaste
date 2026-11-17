import { createContext, useContext } from "react";

export const SplitViewContext = createContext(null);

// Split screen / floating view state and actions (SplitViewProvider).
export function useSplitView() {
  const context = useContext(SplitViewContext);
  if (!context) {
    throw new Error("useSplitView must be used inside SplitViewProvider.");
  }
  return context;
}
