import { useLayoutEffect, useRef } from "react";
import { createStrokeEngine } from "../../systems/drawing/strokeEngine";
import "./DrawingCanvas.css";

// Mounts the stroke engine (systems/drawing/strokeEngine.js) inside the
// canvas board. It sits above the tiles; it only takes the pointer while a
// drawing tool is active. Everything per-frame happens in the engine, never
// through React.
export default function DrawingCanvas({
  strokes,
  activeTool,
  toolConfig,
  getViewportSnapshot,
  subscribeViewportTransform,
  isBackgroundTarget,
  onCommit,
  onSelectionChange,
  onRequestTool,
  onClearTileSelection,
  engineRef,
  curved = false,
}) {
  const rootRef = useRef(null);
  const localEngineRef = useRef(null);
  const callbacksRef = useRef(null);
  callbacksRef.current = {
    onCommit,
    onSelectionChange,
    onRequestTool,
    onClearTileSelection,
    isBackgroundTarget,
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    const container = root?.parentElement;
    if (!root || !container) return undefined;

    const engine = createStrokeEngine({ root, container, callbacks: callbacksRef });
    localEngineRef.current = engine;
    if (engineRef) engineRef.current = engine;
    engine.setView(getViewportSnapshot?.());

    return () => {
      engine.destroy();
      localEngineRef.current = null;
      if (engineRef && engineRef.current === engine) engineRef.current = null;
    };
  }, [engineRef, getViewportSnapshot]);

  useLayoutEffect(() => {
    if (typeof subscribeViewportTransform !== "function") return undefined;
    return subscribeViewportTransform((viewport) => {
      localEngineRef.current?.setView(viewport);
    });
  }, [subscribeViewportTransform]);

  useLayoutEffect(() => {
    localEngineRef.current?.setStrokes(strokes);
  }, [strokes]);

  useLayoutEffect(() => {
    localEngineRef.current?.setTool(activeTool);
  }, [activeTool]);

  useLayoutEffect(() => {
    localEngineRef.current?.setCurved(curved);
  }, [curved]);

  useLayoutEffect(() => {
    const engine = localEngineRef.current;
    if (!engine || !toolConfig) return;
    Object.entries(toolConfig).forEach(([tool, config]) => engine.setToolConfig(tool, config));
  }, [toolConfig]);

  return <div ref={rootRef} className="canvas-strokes" aria-hidden="true" />;
}
