import { useCallback, useSyncExternalStore } from "react";

// Curved canvas view on / off (the toggle next to Home in the top bar). A
// viewing preference, not part of the canvas file: it is remembered per page
// of each canvas on this machine, so turning it on for one page (or one side
// of a split screen) leaves every other page flat.
//
// The top bar toggles whichever canvas pane is active: each canvas view
// publishes its own key while its pane is the active one
// (setActiveCurveTarget), and the switch reads and flips that key.
const STORAGE_KEY = "airpaste.curvedView.pages";
const LEGACY_KEYS = ["airpaste.curvedView", "airpaste.curvedView.files"];
const listeners = new Set();

export function curveKey(filePath, pageId) {
  return filePath ? `${filePath}::${pageId ?? ""}` : "";
}

function readStored() {
  try {
    LEGACY_KEYS.forEach((key) => window.localStorage.removeItem(key));
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

let enabledKeys = typeof window !== "undefined" ? readStored() : new Set();
let activeTarget = "";

function emit() {
  listeners.forEach((listener) => listener());
}

export function isCurvedViewEnabled(key) {
  return Boolean(key) && enabledKeys.has(key);
}

export function setCurvedViewEnabled(key, next) {
  if (!key) return;
  const value = Boolean(next);
  if (value === enabledKeys.has(key)) return;
  enabledKeys = new Set(enabledKeys);
  if (value) enabledKeys.add(key);
  else enabledKeys.delete(key);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...enabledKeys]));
  } catch {
    // Remembering is a convenience only.
  }
  emit();
}

export function toggleCurvedView(key) {
  setCurvedViewEnabled(key, !isCurvedViewEnabled(key));
}

// The canvas pane the top bar's switch acts on.
export function setActiveCurveTarget(key) {
  if (key === activeTarget) return;
  activeTarget = key || "";
  emit();
}

export function clearActiveCurveTarget(key) {
  if (activeTarget !== key) return;
  activeTarget = "";
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurvedView(key) {
  const getSnapshot = useCallback(() => isCurvedViewEnabled(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useActiveCurveTarget() {
  return useSyncExternalStore(subscribe, () => activeTarget, () => "");
}
