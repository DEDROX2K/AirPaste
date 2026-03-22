import { useContext } from "react";
import { TabContext } from "./TabContext";

export function useTabs() {
  const context = useContext(TabContext);

  if (!context) {
    throw new Error("useTabs must be used within a TabProvider");
  }

  return context;
}
