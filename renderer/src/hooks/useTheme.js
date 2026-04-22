import { useCallback, useEffect, useMemo } from "react";

const THEME_STORAGE_KEY = "airpaste-theme";
const DEFAULT_THEME = "light";

function applyTheme(theme = DEFAULT_THEME) {
  if (typeof document === "undefined") {
    return;
  }

  const rootElement = document.documentElement;
  rootElement.dataset.theme = theme;
  rootElement.style.colorScheme = theme;
  rootElement.classList.toggle("dark", theme === "dark");

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep applying theme in-memory.
  }
}

export function useTheme() {
  const setTheme = useCallback((theme = DEFAULT_THEME) => {
    applyTheme(theme);
  }, []);

  const toggleTheme = useCallback(() => applyTheme(DEFAULT_THEME), []);

  useEffect(() => {
    applyTheme(DEFAULT_THEME);
  }, []);

  return useMemo(() => ({
    theme: DEFAULT_THEME,
    setTheme,
    toggleTheme,
  }), [setTheme, toggleTheme]);
}
