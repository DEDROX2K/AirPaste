import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToastContext } from "./ToastContext";

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);
  const timersRef = useRef({});
  const toastsRef = useRef(toasts);

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = {};
  }, []);

  const dismiss = useCallback((id) => {
    window.clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((level, message, options = {}) => {
    if (!message) {
      return null;
    }

    if (options.ifIdle && toastsRef.current.length > 0) {
      return null;
    }

    counterRef.current += 1;
    const id = counterRef.current;
    const durationMs = Number.isFinite(options.durationMs) && options.durationMs > 0
      ? options.durationMs
      : AUTO_DISMISS_MS;
    const nextToast = {
      id,
      level,
      message,
      source: typeof options.source === "string" ? options.source : "system",
      presentation: typeof options.presentation === "string" ? options.presentation : "default",
      wordByWord: options.wordByWord !== false,
      rays: options.rays === true,
      createdAt: Date.now(),
    };

    setToasts((prev) => [...prev, nextToast]);

    timersRef.current[id] = window.setTimeout(() => dismiss(id), durationMs);

    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
