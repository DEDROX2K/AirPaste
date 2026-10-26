import { useCallback, useInsertionEffect, useRef } from "react";

// Returns a function whose identity never changes but always runs the latest
// `callback`. Use it for event handlers passed to memoized tiles: a handler
// that closes over per-render values (selection, the canvas API object) would
// otherwise get a new identity on every board render and defeat Card's memo,
// re-rendering every tile on every pointer move. Not for calling during render.
export function useStableCallback(callback) {
  const callbackRef = useRef(callback);

  useInsertionEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args) => callbackRef.current(...args), []);
}
