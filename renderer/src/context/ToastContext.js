import { createContext } from "react";

/**
 * ToastContext
 * value: { toast(level, message, options), dismiss(id), toasts }
 *
 * Toast: {
 *   id,
 *   level: "info"|"success"|"warn"|"error",
 *   message,
 *   source,
 *   presentation,
 *   wordByWord,
 *   rays,
 *   createdAt
 * }
 */
export const ToastContext = createContext(null);
