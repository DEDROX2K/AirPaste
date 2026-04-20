import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEditableElement } from "../../lib/workspace";
import {
  appendDrawingObject,
  buildCommittedLineFromDraft,
  createDraftLine,
  removeDrawingObjectById,
  shouldCommitDraftLine,
  updateDraftLine,
  worldPointFromStageEvent,
} from "./drawingUtils";
import {
  createEmptyDrawings,
  DEFAULT_DRAWING_STYLE,
  DRAWING_TOOL_MODE_LINE,
  DRAWING_TOOL_MODE_SELECT,
  normalizeDrawings,
} from "./drawingTypes";

const FIXED_LINE_STROKE_WIDTH = 3;

export function useDrawingTool({
  drawings,
  canvas,
  commitWorkspaceChange,
  enabled = true,
}) {
  const [activeTool, setActiveTool] = useState(DRAWING_TOOL_MODE_SELECT);
  const [strokeColor, setStrokeColor] = useState(DEFAULT_DRAWING_STYLE.stroke);
  const [draftLine, setDraftLine] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const draftLineRef = useRef(null);

  const normalizedDrawings = useMemo(
    () => normalizeDrawings(drawings ?? createEmptyDrawings()),
    [drawings],
  );
  const isLineToolActive = enabled && activeTool === DRAWING_TOOL_MODE_LINE;
  const lineStyle = useMemo(() => ({
    stroke: strokeColor,
    strokeWidth: FIXED_LINE_STROKE_WIDTH,
    opacity: 1,
  }), [strokeColor]);

  const updateDraftState = useCallback((nextDraftLine) => {
    draftLineRef.current = nextDraftLine;
    setDraftLine(nextDraftLine);
  }, []);

  const clearDraftLine = useCallback(() => {
    if (!draftLineRef.current) {
      return false;
    }

    updateDraftState(null);
    return true;
  }, [updateDraftState]);

  const commitDraftLine = useCallback(() => {
    const pendingDraftLine = draftLineRef.current;

    if (!pendingDraftLine) {
      return false;
    }

    updateDraftState(null);

    if (!shouldCommitDraftLine(pendingDraftLine)) {
      return false;
    }

    const nextDrawingObject = buildCommittedLineFromDraft(pendingDraftLine);

    if (!nextDrawingObject) {
      return false;
    }

    commitWorkspaceChange((currentWorkspace) => ({
      ...currentWorkspace,
      drawings: appendDrawingObject(currentWorkspace.drawings, nextDrawingObject),
    }));
    setSelectedObjectId(nextDrawingObject.id);
    return true;
  }, [commitWorkspaceChange, updateDraftState]);

  const deleteSelectedObject = useCallback(() => {
    if (!selectedObjectId) {
      return false;
    }

    const hasSelection = normalizedDrawings.objects.some((object) => object.id === selectedObjectId);

    if (!hasSelection) {
      setSelectedObjectId(null);
      return false;
    }

    commitWorkspaceChange((currentWorkspace) => ({
      ...currentWorkspace,
      drawings: removeDrawingObjectById(currentWorkspace.drawings, selectedObjectId),
    }));
    setSelectedObjectId(null);
    return true;
  }, [commitWorkspaceChange, normalizedDrawings.objects, selectedObjectId]);

  const beginDraftLine = useCallback((stageEvent) => {
    const viewportSnapshot = canvas.getViewportSnapshot();
    const worldPoint = worldPointFromStageEvent(
      stageEvent,
      canvas.clientToWorldPoint,
      viewportSnapshot,
    );

    if (!worldPoint) {
      return false;
    }

    updateDraftState(createDraftLine(worldPoint, lineStyle));
    setSelectedObjectId(null);
    return true;
  }, [canvas, lineStyle, updateDraftState]);

  const handleStagePointerDown = useCallback((stageEvent) => {
    if (!isLineToolActive) {
      return false;
    }

    const nativeEvent = stageEvent?.evt;
    const pointerButton = Number.isFinite(nativeEvent?.button) ? nativeEvent.button : 0;

    if (!nativeEvent) {
      return false;
    }

    if (pointerButton === 2) {
      nativeEvent.preventDefault();
      return true;
    }

    if (pointerButton !== 0 && pointerButton !== 1) {
      return false;
    }

    if (isSpacePanning) {
      canvas.beginCanvasPan(nativeEvent);
      return true;
    }

    nativeEvent.preventDefault();
    nativeEvent.stopPropagation();
    return beginDraftLine(stageEvent);
  }, [beginDraftLine, canvas, isLineToolActive, isSpacePanning]);

  const handleStagePointerMove = useCallback((stageEvent) => {
    if (!draftLineRef.current || !isLineToolActive) {
      return false;
    }

    const viewportSnapshot = canvas.getViewportSnapshot();
    const worldPoint = worldPointFromStageEvent(
      stageEvent,
      canvas.clientToWorldPoint,
      viewportSnapshot,
    );

    if (!worldPoint) {
      return false;
    }

    updateDraftState(updateDraftLine(draftLineRef.current, worldPoint));
    return true;
  }, [canvas, isLineToolActive, updateDraftState]);

  const handleStagePointerUp = useCallback(() => (
    commitDraftLine()
  ), [commitDraftLine]);

  const handleStagePointerCancel = useCallback(() => (
    clearDraftLine()
  ), [clearDraftLine]);

  const handleStageContextMenu = useCallback((stageEvent) => {
    if (!isLineToolActive) {
      return false;
    }

    stageEvent?.evt?.preventDefault();
    return true;
  }, [isLineToolActive]);

  const handleSelectObject = useCallback((drawingObjectId, stageEvent = null) => {
    if (!isLineToolActive) {
      return false;
    }

    stageEvent?.evt?.preventDefault?.();

    if (stageEvent) {
      stageEvent.cancelBubble = true;
    }

    setSelectedObjectId(drawingObjectId);
    return true;
  }, [isLineToolActive]);

  const handleToolModeChange = useCallback((nextToolMode) => {
    const normalizedMode = nextToolMode === DRAWING_TOOL_MODE_LINE
      ? DRAWING_TOOL_MODE_LINE
      : DRAWING_TOOL_MODE_SELECT;

    if (normalizedMode !== DRAWING_TOOL_MODE_LINE) {
      updateDraftState(null);
      setIsSpacePanning(false);
      setSelectedObjectId(null);
    }

    setActiveTool(normalizedMode);
  }, [updateDraftState]);

  useEffect(() => {
    if (!isLineToolActive) {
      setIsSpacePanning(false);
    }
  }, [isLineToolActive]);

  useEffect(() => {
    if (!selectedObjectId) {
      return;
    }

    const exists = normalizedDrawings.objects.some((object) => object.id === selectedObjectId);

    if (!exists) {
      setSelectedObjectId(null);
    }
  }, [normalizedDrawings.objects, selectedObjectId]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!isLineToolActive || event.code !== "Space") {
        return;
      }

      if (event.repeat || draftLineRef.current) {
        return;
      }

      if (isEditableElement(document.activeElement)) {
        return;
      }

      event.preventDefault();
      setIsSpacePanning(true);
    }

    function handleKeyUp(event) {
      if (event.code !== "Space") {
        return;
      }

      setIsSpacePanning(false);
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
  }, [isLineToolActive]);

  return {
    activeTool,
    drawings: normalizedDrawings,
    draftLine,
    isLineToolActive,
    isSpacePanning,
    lineStyle,
    selectedObjectId,
    setStrokeColor,
    strokeColor,
    handleToolModeChange,
    handleSelectObject,
    handleStageContextMenu,
    handleStagePointerCancel,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerUp,
    clearDraftLine,
    deleteSelectedObject,
  };
}
