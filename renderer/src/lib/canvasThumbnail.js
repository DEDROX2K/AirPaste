import { useSyncExternalStore } from "react";

// A version number per canvas thumbnail, bumped each time a new one is saved.
// The thumbnail is rewritten at the same path, so Home adds the version to
// the image URL (`?v=`) to show the new picture instead of a cached one.
const versions = new Map();
const listeners = new Set();
let revision = 0;

export function bumpCanvasThumbnailVersion(canvasFilePath) {
  versions.set(canvasFilePath, (versions.get(canvasFilePath) ?? 0) + 1);
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function getCanvasThumbnailVersion(canvasFilePath) {
  return versions.get(canvasFilePath) ?? 0;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Re-renders when any thumbnail changes.
export function useCanvasThumbnailRevision() {
  return useSyncExternalStore(subscribe, () => revision);
}
