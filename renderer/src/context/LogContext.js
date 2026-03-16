import { createContext } from "react";

/**
 * LogContext
 * value: { entries: LogEntry[], log(level, message, detail?) }
 *
 * LogEntry: { id, ts, level: "info"|"success"|"warn"|"error", message, detail? }
 */
export const LogContext = createContext(null);
