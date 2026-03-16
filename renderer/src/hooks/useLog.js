import { useContext } from "react";
import { LogContext } from "../context/LogContext";

export function useLog() {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useLog must be used inside <LogProvider>");
  return ctx;
}
