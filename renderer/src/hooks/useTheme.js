import { useCallback, useEffect, useMemo } from "react";

const THEME_STORAGE_KEY = "airpaste-theme";
const LIGHT_THEME = "light";

function applyLightTheme() {
  if (typeof document === "undefined") {
    return;
  }

  const rootElement = document.documentElement;
  rootElement.dataset.theme = LIGHT_THEME;
  rootElement.style.colorScheme = LIGHT_THEME;
  rootElement.classList.remove("dark");

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, LIGHT_THEME);
  } catch {
    // Ignore storage failures and keep applying light theme in-memory.
  }
}

export function useTheme() {
  const setTheme = useCallback(() => {
    applyLightTheme();
  }, []);

  const toggleTheme = useCallback(() => {
    applyLightTheme();
  }, []);

  useEffect(() => {
    applyLightTheme();
  }, []);

  return useMemo(() => ({
    theme: LIGHT_THEME,
    setTheme,
    toggleTheme,
  }), [setTheme, toggleTheme]);
}
