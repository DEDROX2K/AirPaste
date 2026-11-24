import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget } from "../../lib/workspace";
import {
  createEmptyDrawings,
  DRAWING_TOOL_MODE_HAND,
  DRAWING_TOOL_MODE_SELECT,
  DRAWING_TOOL_MODE_TETHER,
  DRAWING_TOOL_MODE_TEXT,
  DRAWINGS_SCHEMA_VERSION,
  isStrokeTool,
  normalizeDrawings,
  STROKE_TOOL_CONFIG,
  STROKE_TOOLS,
} from "./drawingTypes";

const TOOL_MODES = [
  DRAWING_TOOL_MODE_SELECT,
  DRAWING_TOOL_MODE_HAND,
  DRAWING_TOOL_MODE_TEXT,
  DRAWING_TOOL_MODE_TETHER,
  ...STROKE_TOOLS,
];

function initialToolConfig() {
  return Object.fromEntries(STROKE_TOOLS.map((tool) => [
    tool,
    { color: STROKE_TOOL_CONFIG[tool].color, size: STROKE_TOOL_CONFIG[tool].sizes[STROKE_TOOL_CONFIG[tool].sizeIdx] },
  ]));
}

// Canvas tool mode + the drawing tools (Line, Ink pen, Highlighter). The
// strokes themselves are drawn and edited by the stroke engine
// (strokeEngine.js, mounted by DrawingCanvas); this hook owns the tool, the
// per-tool colour/size, and saving strokes to the workspace (one history
// entry per gesture, so Ctrl+Z works through the app's own undo).
export function useDrawingTool({
  drawings,
  commitWorkspaceChange,
  enabled = true,
}) {
  const [selectedTool, setSelectedTool] = useState(DRAWING_TOOL_MODE_SELECT);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [toolConfig, setToolConfig] = useState(initialToolConfig);
  const [strokeSelection, setStrokeSelection] = useState(null);
  const engineRef = useRef(null);

  const normalizedDrawings = useMemo(
    () => normalizeDrawings(drawings ?? createEmptyDrawings()),
    [drawings],
  );
  const activeTool = enabled && isSpacePanning
    ? DRAWING_TOOL_MODE_HAND
    : selectedTool;
  const isStrokeToolActive = enabled && isStrokeTool(activeTool);
  const isHandToolActive = enabled && activeTool === DRAWING_TOOL_MODE_HAND;
  const isTextToolActive = enabled && activeTool === DRAWING_TOOL_MODE_TEXT;

  const handleToolModeChange = useCallback((nextToolMode) => {
    const normalizedMode = TOOL_MODES.includes(nextToolMode) ? nextToolMode : DRAWING_TOOL_MODE_SELECT;

    if (!isStrokeTool(normalizedMode)) {
      setIsSpacePanning(false);
    }

    setSelectedTool(normalizedMode);
  }, []);

  const handleCommit = useCallback((strokes) => {
    // Pages are the source of truth (the top-level `drawings` only mirrors
    // the active page), so the stroke list goes onto the active page.
    commitWorkspaceChange((currentWorkspace) => {
      const drawingsValue = { version: DRAWINGS_SCHEMA_VERSION, objects: strokes };
      const pages = Array.isArray(currentWorkspace.pages) ? currentWorkspace.pages : null;

      if (!pages?.length) {
        return { ...currentWorkspace, drawings: drawingsValue };
      }

      const activeId = pages.some((page) => page.id === currentWorkspace.activePageId)
        ? currentWorkspace.activePageId
        : pages[0].id;

      return {
        ...currentWorkspace,
        drawings: drawingsValue,
        pages: pages.map((page) => (page.id === activeId ? { ...page, drawings: drawingsValue } : page)),
      };
    });
  }, [commitWorkspaceChange]);

  // Property bar: a tool's defaults while it's active, else the selection.
  const propsTarget = isStrokeToolActive
    ? { kind: "tool", tool: activeTool, ...toolConfig[activeTool] }
    : strokeSelection
      ? { kind: "selection", ...strokeSelection }
      : null;

  const setStrokeColor = useCallback((color) => {
    if (isStrokeTool(selectedTool)) {
      setToolConfig((current) => ({ ...current, [selectedTool]: { ...current[selectedTool], color } }));
      return;
    }
    engineRef.current?.applyToSelection({ color });
  }, [selectedTool]);

  const setStrokeSizeIndex = useCallback((sizeIdx) => {
    if (isStrokeTool(selectedTool)) {
      setToolConfig((current) => ({
        ...current,
        [selectedTool]: { ...current[selectedTool], size: STROKE_TOOL_CONFIG[selectedTool].sizes[sizeIdx] },
      }));
      return;
    }
    engineRef.current?.applyToSelection({ sizeIdx });
  }, [selectedTool]);

  const bumpStrokeSize = useCallback((dir) => {
    if (isStrokeTool(selectedTool)) {
      setToolConfig((current) => {
        const sizes = STROKE_TOOL_CONFIG[selectedTool].sizes;
        const at = Math.max(0, sizes.indexOf(current[selectedTool].size));
        const size = sizes[Math.max(0, Math.min(sizes.length - 1, at + dir))];
        return { ...current, [selectedTool]: { ...current[selectedTool], size } };
      });
      return true;
    }
    return engineRef.current?.applyToSelection({ sizeStep: dir }) ?? false;
  }, [selectedTool]);

  const deleteSelectedObject = useCallback(() => (
    engineRef.current?.deleteSelection() ?? false
  ), []);

  const nudgeSelectedStrokes = useCallback((dx, dy) => (
    engineRef.current?.nudgeSelection(dx, dy) ?? false
  ), []);

  const duplicateSelectedStrokes = useCallback(() => (
    engineRef.current?.duplicateSelection() ?? false
  ), []);

  const clearStrokeSelection = useCallback(() => (
    engineRef.current?.clearSelection() ?? false
  ), []);

  // Esc: a drawing tool goes back to Select, then a stroke selection clears.
  const handleEscape = useCallback(() => {
    if (isStrokeTool(selectedTool)) {
      setSelectedTool(DRAWING_TOOL_MODE_SELECT);
      return true;
    }
    return clearStrokeSelection();
  }, [clearStrokeSelection, selectedTool]);

  useEffect(() => {
    if (!enabled || activeTool !== DRAWING_TOOL_MODE_HAND) {
      setIsSpacePanning(false);
    }
  }, [activeTool, enabled]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!enabled) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;

      if (event.code === "Space") {
        if (event.repeat || engineRef.current?.isDrawing()) return;
        event.preventDefault();
        setIsSpacePanning(true);
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "[" || event.key === "]") {
        if (bumpStrokeSize(event.key === "]" ? 1 : -1)) event.preventDefault();
      }
    }

    function handleKeyUp(event) {
      if (event.code === "Space") setIsSpacePanning(false);
    }

    function handleWindowBlur() {
      setIsSpacePanning(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [bumpStrokeSize, enabled]);

  return {
    activeTool,
    drawings: normalizedDrawings,
    engineRef,
    isHandToolActive,
    isStrokeToolActive,
    isSpacePanning,
    isTextToolActive,
    selectedTool,
    strokeSelection,
    propsTarget,
    toolConfig,
    handleCommit,
    handleToolModeChange,
    setStrokeSelection,
    setStrokeColor,
    setStrokeSizeIndex,
    deleteSelectedObject,
    nudgeSelectedStrokes,
    duplicateSelectedStrokes,
    clearStrokeSelection,
    handleEscape,
  };
}
