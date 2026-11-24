import { useSyncExternalStore } from "react";

// Curved canvas view on / off (the toggle next to Home in the top bar). A
// viewing preference, not part of the canvas file: it applies to every
// canvas and is remembered on this machine.
const STORAGE_KEY = "airpaste.curvedView";
const listeners = new Set();

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let enabled = typeof window !== "undefined" ? readStored() : false;

export function isCurvedViewEnabled() {
  return enabled;
}

export function setCurvedViewEnabled(next) {
  const value = Boolean(next);
  if (value === enabled) return;
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Remembering is a convenience only.
  }
  listeners.forEach((listener) => listener());
}

export function toggleCurvedView() {
  setCurvedViewEnabled(!enabled);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurvedView() {
  return useSyncExternalStore(subscribe, isCurvedViewEnabled, () => false);
}
