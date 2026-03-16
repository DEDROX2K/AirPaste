import { useCallback, useMemo, useRef, useState } from "react";
import { LogContext } from "./LogContext";

const MAX_ENTRIES = 200;

export function LogProvider({ children }) {
  const [entries, setEntries] = useState([]);
  const counterRef = useRef(0);

  const log = useCallback((level, message, detail = null) => {
    counterRef.current += 1;
    const entry = {
      id: counterRef.current,
      ts: new Date().toISOString(),
      level,    // "info" | "success" | "warn" | "error"
      message,
      detail,
    };

    // Mirror to browser DevTools console so Electron's DevTools also shows it
    const consoleFn = {
      info:    console.info,
      success: console.info,
      warn:    console.warn,
      error:   console.error,
    }[level] ?? console.log;

    consoleFn(`[AirPaste][${level.toUpperCase()}] ${message}`, detail ?? "");

    setEntries((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  const clearLog = useCallback(() => setEntries([]), []);

  const value = useMemo(() => ({ entries, log, clearLog }), [entries, log, clearLog]);

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}
