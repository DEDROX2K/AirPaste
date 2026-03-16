import { createContext } from "react";

/**
 * ToastContext
 * value: { toast(level, message) }
 *
 * Toast: { id, level: "info"|"success"|"warn"|"error", message }
 */
export const ToastContext = createContext(null);
