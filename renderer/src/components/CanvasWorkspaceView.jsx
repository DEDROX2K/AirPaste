import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Card from "./Card";
import CanvasAddMenu from "./CanvasAddMenu";
import CanvasZoomMenu from "./CanvasZoomMenu";
import GlobeWorkspaceView from "./GlobeWorkspaceView";
import GridWorkspaceView from "./GridWorkspaceView";
import SceneWorkspaceSurface from "./SceneWorkspaceSurface";
import TileContextMenu from "./TileContextMenu";
import DrawingLayer from "./canvas/DrawingLayer";
import { useAppContext } from "../context/useAppContext";
import { useLog } from "../hooks/useLog";
import { useToast } from "../hooks/useToast";
import {
  canRefreshLinkPreviewCard,
  isBookmarkLinkCard,
  isEditableElement,
  shouldRecoverLinkPreviewCard,
} from "../lib/workspace";
import { useCanvasSystem } from "../systems/canvas/useCanvasSystem";
import { useCanvasCommands } from "../systems/commands/useCanvasCommands";
import { useCanvasInteractionSystem } from "../systems/interactions/useCanvasInteractionSystem";
import { buildRadialMenuActions } from "../systems/interactions/radialMenuActions";
import { useCanvasDropImport } from "../systems/import/useCanvasDropImport";
import { useTileLayoutSystem } from "../systems/layout/useTileLayoutSystem";
import { useDrawingTool } from "../systems/drawing/useDrawingTool";
import {
  DRAWING_TOOL_MODE_LINE,
  DRAWING_TOOL_MODE_SELECT,
} from "../systems/drawing/drawingTypes";
import {
  buildCanvasSnapUiStatePatch,
  DEFAULT_CANVAS_SNAP_SETTINGS,
  normalizeCanvasSnapSettings,
} from "../systems/snapping/canvasSnapSettings";
import { AppButton, AppEmptyState } from "./ui/app";
import { folderNameFromPath } from "../lib/home";
import {
  readPointerMoveStats,
  recordBoardRender,
  recordDerivedMetric,
  setPerfSummary,
} from "../lib/perf";
import {
  clamp,
  getDefaultCameraDistance,
  getSoftGlobeRadius,
} from "../systems/globe/globeLayout";
import {
  buildTileRenderHint,
  resolveWorkspaceLodLevel,
  WORKSPACE_LOD_LEVEL,
} from "../systems/canvas/tileLod";

function WorkspaceViewToggle({ mode, onChange }) {
  return (
    <div className="workspace-view-toggle" role="tablist" aria-label="Workspace view mode">
      <AppButton tone="unstyled"
        type="button"
        className={`workspace-view-toggle__button${mode === "flat" ? " workspace-view-toggle__button--active" : ""}`}
        onClick={() => onChange("flat")}
        aria-selected={mode === "flat"}
        role="tab"
        aria-label="Canvas view"
      >
        <img className="workspace-view-toggle__icon" src="/icons/canvas.png" alt="" aria-hidden="true" />
      </AppButton>
      <AppButton tone="unstyled"
        type="button"
        className={`workspace-view-toggle__button${mode === "globe" ? " workspace-view-toggle__button--active" : ""}`}
        onClick={() => onChange("globe")}
        aria-selected={mode === "globe"}
        role="tab"
        aria-label="Globe view"
      >
        <img className="workspace-view-toggle__icon" src="/globe.svg" alt="" aria-hidden="true" />
      </AppButton>
      <AppButton tone="unstyled"
        type="button"
        className={`workspace-view-toggle__button${mode === "grid" ? " workspace-view-toggle__button--active" : ""}`}
        onClick={() => onChange("grid")}
        aria-selected={mode === "grid"}
        role="tab"
        aria-label="Grid view"
      >
        <img className="workspace-view-toggle__icon" src="/icons/grid.png" alt="" aria-hidden="true" />
      </AppButton>
    </div>
  );
}

function WorkspaceTopbarTrail() {
  return (
    <header className="canvas-topbar">

    </header>
  );
}

function DrawingToolControls({
  activeTool,
  strokeColor,
  onToolChange,
  onStrokeColorChange,
}) {
  const isLineToolActive = activeTool === DRAWING_TOOL_MODE_LINE;

  return (
    <div className="drawing-tool-controls" role="group" aria-label="Drawing tool controls">
      <div className="drawing-tool-controls__mode" role="group" aria-label="Canvas tool mode">
        <AppButton tone="unstyled"
          type="button"
          className={`drawing-tool-controls__button${activeTool === DRAWING_TOOL_MODE_SELECT ? " drawing-tool-controls__button--active" : ""}`}
          onClick={() => onToolChange(DRAWING_TOOL_MODE_SELECT)}
          aria-label="Switch to normal canvas mode"
          aria-pressed={activeTool === DRAWING_TOOL_MODE_SELECT}
          title="Normal mode"
        >
          <img className="drawing-tool-controls__icon" src="/icons/gesture_select.png" alt="" aria-hidden="true" />
        </AppButton>
        <AppButton tone="unstyled"
          type="button"
          className={`drawing-tool-controls__button${isLineToolActive ? " drawing-tool-controls__button--active" : ""}`}
          onClick={() => onToolChange(DRAWING_TOOL_MODE_LINE)}
          aria-label="Switch to line drawing mode"
          aria-pressed={isLineToolActive}
          title="Line tool"
        >
          <img className="drawing-tool-controls__icon" src="/icons/wysiwyg.png" alt="" aria-hidden="true" />
        </AppButton>
      </div>
      <label className="drawing-tool-controls__style">
        <span className="drawing-tool-controls__label">Color</span>
        <input
          className="drawing-tool-controls__color"
          type="color"
          value={strokeColor}
          onChange={(event) => onStrokeColorChange(event.target.value)}
        />
      </label>
    </div>
  );
}

const PERF_HISTORY_LIMIT = 64;
const PERF_CHART_WIDTH = 176;
const PERF_CHART_HEIGHT = 56;

function roundMetric(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number(value).toFixed(digits);
}

function createChartPoints(values, maxValue) {
  if (!values.length) {
    return "";
  }

  const safeMaxValue = Math.max(1, maxValue);

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * PERF_CHART_WIDTH;
      const y = PERF_CHART_HEIGHT - (Math.min(value, safeMaxValue) / safeMaxValue) * PERF_CHART_HEIGHT;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(input);
  }
}

function buildPreviewDiagnosticsExport(card) {
  const diagnostics = card?.previewDiagnostics && typeof card.previewDiagnostics === "object"
    ? card.previewDiagnostics
    : {};

  const { ...rawFinalPersistedCardPayload } = card ?? {};
  const finalPersistedCardPayload = {
    ...rawFinalPersistedCardPayload,
    image: typeof rawFinalPersistedCardPayload.image === "string" && rawFinalPersistedCardPayload.image.startsWith("data:")
      ? `[data-url omitted: ${rawFinalPersistedCardPayload.image.length} chars]`
      : (rawFinalPersistedCardPayload.image || ""),
  };

  return {
    schemaVersion: 1,
    originalUrl: diagnostics.originalUrl || card?.url || "",
    canonicalUrl: diagnostics.canonicalUrl || card?.url || "",
    classification: diagnostics.classification || "",
    resolverKey: diagnostics.resolverKey || "",
    previewStatus: diagnostics.previewStatus || card?.status || "",
    reason: diagnostics.reason || card?.previewError || "",
    rejectionReason: diagnostics.rejectionReason || "",
    title: diagnostics.title || card?.title || "",
    description: diagnostics.description || card?.description || "",
    siteName: diagnostics.siteName || card?.siteName || "",
    contentType: diagnostics.contentType || card?.contentType || "",
    sourceType: diagnostics.sourceType || card?.sourceType || "",
    resolvedUrl: diagnostics.resolvedUrl || card?.resolvedUrl || card?.url || "",
    duration: Number.isFinite(diagnostics.duration) ? diagnostics.duration : (Number.isFinite(card?.duration) ? card.duration : null),
    author: diagnostics.author || card?.author || "",
    channelName: diagnostics.channelName || card?.channelName || "",
    candidateImageUrls: Array.isArray(diagnostics.candidateImageUrls) ? diagnostics.candidateImageUrls : [],
    chosenFinalImageUrl: diagnostics.chosenFinalImageUrl || "",
    allowScreenshotFallback: diagnostics.allowScreenshotFallback === true,
    screenshotFallbackUsed: diagnostics.screenshotFallbackUsed === true,
    documentSignals: diagnostics.documentSignals ?? {},
    resolverMetadata: diagnostics.resolverMetadata ?? {},
    trace: Array.isArray(diagnostics.trace) ? diagnostics.trace : [],
    finalPersistedCardPayload,
  };
}

function areStyleVarSetsEqual(left, right) {
  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (left?.[key] !== right?.[key]) {
      return false;
    }
  }

  return true;
}

function areTileMetaEquivalent(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.isDragging === right.isDragging
    && left.isSelected === right.isSelected
    && left.isFocused === right.isFocused
    && left.isHovered === right.isHovered
    && left.isMergeTarget === right.isMergeTarget
    && left.isRackAttached === right.isRackAttached
    && left.isParentDragging === right.isParentDragging
    && left.isParentSelected === right.isParentSelected
    && left.isGroupingTarget === right.isGroupingTarget
    && left.isGroupingArmed === right.isGroupingArmed
    && left.isFolderZoneTarget === right.isFolderZoneTarget
    && left.isRackDropTarget === right.isRackDropTarget
    && left.rackId === right.rackId
    && left.rackSlotIndex === right.rackSlotIndex
    && left.interactionState === right.interactionState
    && left.renderWidth === right.renderWidth
    && left.renderHeight === right.renderHeight
    && areStyleVarSetsEqual(left.styleVars, right.styleVars);
}

function areRenderHintsEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.lodLevel === right.lodLevel
    && left.previewTier === right.previewTier
    && left.simplify === right.simplify
    && left.imageEnabled === right.imageEnabled
    && left.showToolbar === right.showToolbar
    && left.showActions === right.showActions
    && left.disableImageReveal === right.disableImageReveal
    && left.usePreviewColorBlock === right.usePreviewColorBlock;
}

function CanvasPerformanceOverlay({
  visibleTileCount,
  renderedTileCount,
  totalTileCount,
  activeDragLayers,
  isCanvasMoving,
  workspaceLodLevel,
  lodLevelCounts,
  previewTierCounts,
}) {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState({
    fps: 0,
    frameMs: 0,
    droppedFrames: 0,
    pointerAvgMs: 0,
    pointerMaxMs: 0,
    boardRenderCount: 0,
    boardMovingRenderCount: 0,
    latestCommitMs: 0,
    latestSaveMs: 0,
    latestSerializeMs: 0,
    fpsHistory: [],
    frameMsHistory: [],
  });

  useEffect(() => {
    let rafId = 0;
    let lastFrameTime = performance.now();
    let sampleStartTime = lastFrameTime;
    let sampleFrameCount = 0;
    let sampleFrameMsTotal = 0;
    let sampleDroppedFrameCount = 0;

    function tick(now) {
      const frameMs = Math.max(0, now - lastFrameTime);
      lastFrameTime = now;
      sampleFrameCount += 1;
      sampleFrameMsTotal += frameMs;

      if (frameMs > 24) {
        sampleDroppedFrameCount += 1;
      }

      if (now - sampleStartTime >= 250) {
        const elapsedMs = Math.max(1, now - sampleStartTime);
        const fps = (sampleFrameCount * 1000) / elapsedMs;
        const averageFrameMs = sampleFrameMsTotal / Math.max(1, sampleFrameCount);
        const pointerStats = readPointerMoveStats();
        const perfStore = window.__AIRPASTE_PERF__ ?? null;
        const latestCommit = perfStore?.commits?.[perfStore.commits.length - 1] ?? null;
        const latestSave = perfStore?.saves?.lastSample ?? null;

        setSnapshot((currentSnapshot) => ({
          fps,
          frameMs: averageFrameMs,
          droppedFrames: sampleDroppedFrameCount,
          pointerAvgMs: pointerStats?.avgMs ?? 0,
          pointerMaxMs: pointerStats?.maxMs ?? 0,
          boardRenderCount: perfStore?.boardRenders?.count ?? 0,
          boardMovingRenderCount: perfStore?.boardRenders?.movingCount ?? 0,
          latestCommitMs: latestCommit?.durationMs ?? 0,
          latestSaveMs: latestSave?.saveMs ?? 0,
          latestSerializeMs: latestSave?.serializeMs ?? 0,
          fpsHistory: [...currentSnapshot.fpsHistory, fps].slice(-PERF_HISTORY_LIMIT),
          frameMsHistory: [...currentSnapshot.frameMsHistory, averageFrameMs].slice(-PERF_HISTORY_LIMIT),
        }));

        sampleStartTime = now;
        sampleFrameCount = 0;
        sampleFrameMsTotal = 0;
        sampleDroppedFrameCount = 0;
      }

      rafId = window.requestAnimationFrame(tick);
    }

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  const fpsCap = Math.max(60, Math.ceil(Math.max(60, ...snapshot.fpsHistory) / 10) * 10);
  const frameMsCap = Math.max(20, Math.ceil(Math.max(20, ...snapshot.frameMsHistory) / 5) * 5);
  const fpsPoints = createChartPoints(snapshot.fpsHistory, fpsCap);
  const frameMsPoints = createChartPoints(snapshot.frameMsHistory, frameMsCap);
  const perfSummaryText = useMemo(() => [
    `FPS: ${Math.round(snapshot.fps)}`,
    `Frame ms: ${roundMetric(snapshot.frameMs)} ms`,
    `Dropped: ${snapshot.droppedFrames}`,
    `Visible: ${visibleTileCount}/${totalTileCount}`,
    `Rendered: ${renderedTileCount}`,
    `Drag layers: ${activeDragLayers}`,
    `Pointer avg: ${roundMetric(snapshot.pointerAvgMs)} ms`,
    `Pointer max: ${roundMetric(snapshot.pointerMaxMs)} ms`,
    `Renders: ${snapshot.boardRenderCount}`,
    `Move renders: ${snapshot.boardMovingRenderCount}`,
    `Save: ${roundMetric(snapshot.latestSaveMs)} ms`,
    `Serialize: ${roundMetric(snapshot.latestSerializeMs)} ms`,
    `Commit: ${roundMetric(snapshot.latestCommitMs)} ms`,
    `LOD mode: ${workspaceLodLevel === WORKSPACE_LOD_LEVEL.FAR ? "1 (far)" : "0 (normal)"}`,
    `LOD tiles: 0=${lodLevelCounts.lod0} 1=${lodLevelCounts.lod1}`,
    `Preview tiers: t${previewTierCounts.thumbnail} m${previewTierCounts.medium} h${previewTierCounts.high} o${previewTierCounts.original}`,
    `State: ${isCanvasMoving ? "moving" : "idle"}`,
  ].join("\n"), [
    activeDragLayers,
    isCanvasMoving,
    snapshot.boardRenderCount,
    snapshot.boardMovingRenderCount,
    snapshot.droppedFrames,
    snapshot.fps,
    snapshot.frameMs,
    snapshot.latestCommitMs,
    snapshot.latestSaveMs,
    snapshot.latestSerializeMs,
    snapshot.pointerAvgMs,
    snapshot.pointerMaxMs,
    totalTileCount,
    renderedTileCount,
    workspaceLodLevel,
    lodLevelCounts.lod0,
    lodLevelCounts.lod1,
    previewTierCounts.high,
    previewTierCounts.medium,
    previewTierCounts.original,
    previewTierCounts.thumbnail,
    visibleTileCount,
  ]);
  const handleCopyPerf = useCallback(async () => {
    try {
      await copyTextToClipboard(perfSummaryText);
      toast("success", "Performance stats copied");
    } catch {
      toast("error", "Could not copy performance stats");
    }
  }, [perfSummaryText, toast]);

  return (
    <div className="canvas-perf-overlay" aria-live="off">
      <div className="canvas-perf-overlay__header">
        <span>PERF</span>
        <div className="canvas-perf-overlay__header-actions">
          <span>{isCanvasMoving ? "moving" : "idle"}</span>
          <AppButton tone="unstyled"
            className="canvas-perf-overlay__copy"
            type="button"
            onClick={() => { void handleCopyPerf(); }}
          >
            Copy
          </AppButton>
        </div>
      </div>
      <svg
        className="canvas-perf-overlay__chart"
        width={PERF_CHART_WIDTH}
        height={PERF_CHART_HEIGHT}
        viewBox={`0 0 ${PERF_CHART_WIDTH} ${PERF_CHART_HEIGHT}`}
        role="img"
        aria-label="Canvas performance chart"
      >
        <line x1="0" y1={PERF_CHART_HEIGHT - 1} x2={PERF_CHART_WIDTH} y2={PERF_CHART_HEIGHT - 1} />
        {frameMsPoints ? (
          <polyline className="canvas-perf-overlay__line canvas-perf-overlay__line--frame" points={frameMsPoints} />
        ) : null}
        {fpsPoints ? (
          <polyline className="canvas-perf-overlay__line canvas-perf-overlay__line--fps" points={fpsPoints} />
        ) : null}
      </svg>
      <div className="canvas-perf-overlay__legend">
        <span>fps</span>
        <span>frame ms</span>
      </div>
      <div className="canvas-perf-overlay__stats">
        <span>FPS {Math.round(snapshot.fps)}</span>
        <span>Frame {roundMetric(snapshot.frameMs)} ms</span>
        <span>Dropped {snapshot.droppedFrames}</span>
        <span>Visible {visibleTileCount}/{totalTileCount}</span>
        <span>Rendered {renderedTileCount}</span>
        <span>Drag layers {activeDragLayers}</span>
        <span>Pointer avg {roundMetric(snapshot.pointerAvgMs)} ms</span>
        <span>Pointer max {roundMetric(snapshot.pointerMaxMs)} ms</span>
        <span>Renders {snapshot.boardRenderCount}</span>
        <span>Move renders {snapshot.boardMovingRenderCount}</span>
        <span>Save {roundMetric(snapshot.latestSaveMs)} ms</span>
        <span>Serialize {roundMetric(snapshot.latestSerializeMs)} ms</span>
        <span>Commit {roundMetric(snapshot.latestCommitMs)} ms</span>
        <span>LOD mode {workspaceLodLevel === WORKSPACE_LOD_LEVEL.FAR ? "1 far" : "0 normal"}</span>
        <span>LOD tiles 0:{lodLevelCounts.lod0} 1:{lodLevelCounts.lod1}</span>
        <span>Preview t{previewTierCounts.thumbnail}/m{previewTierCounts.medium}/h{previewTierCounts.high}/o{previewTierCounts.original}</span>
        <span>State {isCanvasMoving ? "moving" : "idle"}</span>
      </div>
    </div>
  );
}

export default function CanvasWorkspaceView() {
  const [snapSettings, setSnapSettings] = useState(DEFAULT_CANVAS_SNAP_SETTINGS);
  const previousBoardSnapshotRef = useRef(null);
  const tileMetaCacheRef = useRef(new Map());
  const tileRenderHintCacheRef = useRef(new Map());
  const lodFrozenZoomRef = useRef(1);
  const lodFreezeActiveRef = useRef(false);
  const workspaceLodLevelRef = useRef(WORKSPACE_LOD_LEVEL.NORMAL);
  const {
    canRedo,
    canUndo,
    commitWorkspaceChange,
    currentEditor,
    discardWorkspaceDraft,
    folderLoading,
    folderPath,
    homeData,
    openExistingWorkspace,
    saveHomeUiState,
    setCanvasInteractionState,
    setViewport,
    setWorkspaceView,
    showHome,
    redoWorkspaceChange,
    undoWorkspaceChange,
    workspace,
    createNewLinkCard,
    createNewRackCard,
    deleteExistingCard,
    replaceWorkspaceCards,
    reorderExistingCards,
    updateExistingCard,
    updateExistingCards,
  } = useAppContext();
  const { log } = useLog();
  const { toast } = useToast();
  const [globeVisibleTileCount, setGlobeVisibleTileCount] = useState(0);
  const [cullingTick, setCullingTick] = useState(0);
  const workspaceView = workspace.view ?? { mode: "flat" };
  const isGlobeMode = workspaceView.mode === "globe";
  const isGridMode = workspaceView.mode === "grid";
  const sceneSurfaceEnabled = useMemo(() => {
    if (typeof window === "undefined") {
      return true;
    }

    const mode = window.localStorage?.getItem("airpaste.workspaceSurfaceMode");
    return mode !== "dom";
  }, []);

  const canvas = useCanvasSystem({
    viewport: workspace.viewport,
    onViewportChange: setViewport,
  });
  const cameraIsMoving = canvas.isPanning || canvas.isZooming;
  const drawingTool = useDrawingTool({
    drawings: workspace.drawings,
    canvas,
    commitWorkspaceChange,
    enabled: !isGridMode && !isGlobeMode,
  });
  const clearDraftLine = drawingTool.clearDraftLine;
  const deleteSelectedDrawingObject = drawingTool.deleteSelectedObject;

  const commands = useCanvasCommands({
    folderPath,
    canvasFilePath: currentEditor.filePath,
    workspace,
    getViewportCenter: canvas.getViewportCenter,
    openFolderDialog: openExistingWorkspace,
    commitWorkspaceChange,
    discardWorkspaceDraft,
    createNewLinkCard,
    createNewRackCard,
    deleteExistingCard,
    replaceWorkspaceCards,
    reorderExistingCards,
    updateExistingCard,
    updateExistingCards,
    log,
    toast,
  });

  const dropImport = useCanvasDropImport({
    canvas,
    commands,
    folderPath,
    log,
    toast,
  });

  const interactions = useCanvasInteractionSystem({
    cards: workspace.cards,
    canvas,
    commands,
    resetKey: folderPath,
    snapSettings,
    viewportZoom: canvas.getViewportSnapshot().zoom,
    suppressHoverUpdates: cameraIsMoving || drawingTool.isLineToolActive,
  });
  const resetTransientState = interactions.resetTransientState;

  useEffect(() => {
    resetTransientState();
  }, [resetTransientState, workspaceView.mode]);

  useEffect(() => {
    setSnapSettings(normalizeCanvasSnapSettings(homeData?.uiState));
  }, [homeData?.uiState]);

  const handleWorkspacePaste = useCallback(async (event) => {
    if (isEditableElement(document.activeElement)) {
      return;
    }

    await commands.pasteFromClipboard(event);
  }, [commands]);

  useEffect(() => {
    document.addEventListener("paste", handleWorkspacePaste, true);
    return () => document.removeEventListener("paste", handleWorkspacePaste, true);
  }, [handleWorkspacePaste]);

  const filteredTiles = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextFilteredTiles = workspace.cards;
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("board:filteredTiles", end - start, {
      queryLength: 0,
      inputCount: workspace.cards.length,
      outputCount: nextFilteredTiles.length,
    });
    return nextFilteredTiles;
  }, [workspace.cards]);
  const tileById = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextTileById = Object.fromEntries(workspace.cards.map((tile) => [tile.id, tile]));
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("board:tileById", end - start, {
      tileCount: workspace.cards.length,
    });
    return nextTileById;
  }, [workspace.cards]);
  const draggingTileIdSet = useMemo(() => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextDraggingTileIdSet = new Set(interactions.draggingTileIds);
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDerivedMetric("board:draggingTileIdSet", end - start, {
      draggingCount: interactions.draggingTileIds.length,
    });
    return nextDraggingTileIdSet;
  }, [interactions.draggingTileIds]);
  const isCanvasMoving = cameraIsMoving || interactions.draggingTileIds.length > 0;
  const liveViewport = canvas.getViewportSnapshot();

  useEffect(() => {
    if (isGridMode || isGlobeMode) {
      return undefined;
    }

    let rafId = 0;
    let lastSampleTime = 0;

    if (isCanvasMoving) {
      const tick = (now) => {
        if (now - lastSampleTime >= 120) {
          lastSampleTime = now;
          setCullingTick((currentTick) => currentTick + 1);
        }

        rafId = window.requestAnimationFrame(tick);
      };

      rafId = window.requestAnimationFrame(tick);
    } else {
      setCullingTick((currentTick) => currentTick + 1);
    }

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [isCanvasMoving, isGlobeMode, isGridMode]);

  useEffect(() => {
    setCanvasInteractionState?.(isCanvasMoving);
    return () => {
      setCanvasInteractionState?.(false);
    };
  }, [isCanvasMoving, setCanvasInteractionState]);

  const visibleWorldRect = useMemo(() => {
    if (isGridMode || isGlobeMode) {
      return null;
    }

    const zoom = Math.max(0.2, liveViewport.zoom);
    const overscan = isCanvasMoving
      ? Math.max(280, 440 / zoom)
      : Math.max(160, 220 / zoom);
    const cullingSampleOffset = cullingTick < 0 ? 1 : 0;

    return canvas.getVisibleWorldRect(overscan + cullingSampleOffset);
  }, [canvas, cullingTick, isCanvasMoving, isGlobeMode, isGridMode, liveViewport.zoom]);

  const layout = useTileLayoutSystem({
    tiles: filteredTiles,
    rackDropPreview: interactions.rackDropPreview,
    selectedTileIds: interactions.selectedTileIds,
    hoveredTileId: interactions.hoveredTileId,
    focusedTileId: interactions.focusedTileId,
    draggingTileIds: interactions.draggingTileIds,
    visibleWorldRect,
  });
  const viewportZoomForRender = useMemo(() => {
    if (isCanvasMoving) {
      if (!lodFreezeActiveRef.current) {
        lodFreezeActiveRef.current = true;
        lodFrozenZoomRef.current = liveViewport.zoom;
      }

      return lodFrozenZoomRef.current;
    }

    lodFreezeActiveRef.current = false;
    lodFrozenZoomRef.current = liveViewport.zoom;
    return liveViewport.zoom;
  }, [isCanvasMoving, liveViewport.zoom]);
  const interactionOverlayTileIdSet = useMemo(() => new Set([
    ...interactions.selectedTileIds,
    ...(interactions.focusedTileId ? [interactions.focusedTileId] : []),
    ...interactions.draggingTileIds,
  ]), [
    interactions.draggingTileIds,
    interactions.focusedTileId,
    interactions.selectedTileIds,
  ]);
  const workspaceLodLevel = useMemo(() => {
    if (isGridMode || isGlobeMode) {
      return WORKSPACE_LOD_LEVEL.NORMAL;
    }

    const visibleCount = layout.visibleTileCount ?? layout.rootTiles.length;
    return resolveWorkspaceLodLevel({
      viewportZoom: viewportZoomForRender,
      visibleTileCount: visibleCount,
      previousLevel: workspaceLodLevelRef.current,
    });
  }, [
    isGlobeMode,
    isGridMode,
    layout.rootTiles.length,
    layout.visibleTileCount,
    viewportZoomForRender,
  ]);

  useEffect(() => {
    workspaceLodLevelRef.current = workspaceLodLevel;
  }, [workspaceLodLevel]);

  const useSceneSurface = sceneSurfaceEnabled && workspaceLodLevel === WORKSPACE_LOD_LEVEL.FAR;
  const stableTileMetaById = useMemo(() => {
    const previousCache = tileMetaCacheRef.current;
    const nextCache = new Map();
    const nextTileMetaById = {};

    layout.rootTiles.forEach((tile) => {
      const nextMeta = layout.tileMetaById[tile.id];
      const previousMeta = previousCache.get(tile.id);
      const stableMeta = previousMeta && areTileMetaEquivalent(previousMeta, nextMeta)
        ? previousMeta
        : nextMeta;

      nextCache.set(tile.id, stableMeta);
      nextTileMetaById[tile.id] = stableMeta;
    });

    tileMetaCacheRef.current = nextCache;
    return nextTileMetaById;
  }, [layout.rootTiles, layout.tileMetaById]);
  const tileRenderHintsById = useMemo(() => {
    const previousCache = tileRenderHintCacheRef.current;
    const nextCache = new Map();
    const nextHints = {};

    layout.rootTiles.forEach((tile) => {
      const previousHint = previousCache.get(tile.id) ?? null;
      const nextHint = buildTileRenderHint({
        lodLevel: workspaceLodLevel,
        forceFullFidelity: interactionOverlayTileIdSet.has(tile.id),
      });
      const stableHint = previousHint && areRenderHintsEqual(previousHint, nextHint)
        ? previousHint
        : nextHint;

      nextCache.set(tile.id, stableHint);
      nextHints[tile.id] = stableHint;
    });

    tileRenderHintCacheRef.current = nextCache;
    return nextHints;
  }, [interactionOverlayTileIdSet, layout.rootTiles, workspaceLodLevel]);
  const previewTierCounts = useMemo(() => {
    return layout.rootTiles.reduce((counts, tile) => {
      const tier = tileRenderHintsById[tile.id]?.previewTier ?? "original";

      if (!Object.prototype.hasOwnProperty.call(counts, tier)) {
        counts[tier] = 0;
      }

      counts[tier] += 1;
      return counts;
    }, {
      thumbnail: 0,
      medium: 0,
      high: 0,
      original: 0,
    });
  }, [layout.rootTiles, tileRenderHintsById]);
  const lodLevelCounts = useMemo(() => (
    layout.rootTiles.reduce((counts, tile) => {
      const level = tileRenderHintsById[tile.id]?.lodLevel ?? WORKSPACE_LOD_LEVEL.NORMAL;

      if (level === WORKSPACE_LOD_LEVEL.FAR) {
        counts.lod1 += 1;
      } else {
        counts.lod0 += 1;
      }

      return counts;
    }, {
      lod0: 0,
      lod1: 0,
    })
  ), [layout.rootTiles, tileRenderHintsById]);
  const overlayTileIdSet = useMemo(() => (
    useSceneSurface ? interactionOverlayTileIdSet : new Set()
  ), [interactionOverlayTileIdSet, useSceneSurface]);
  const sceneTiles = useMemo(() => (
    useSceneSurface
      ? layout.rootTiles.filter((tile) => !overlayTileIdSet.has(tile.id))
      : layout.rootTiles
  ), [layout.rootTiles, overlayTileIdSet, useSceneSurface]);
  const overlayTiles = useMemo(() => (
    useSceneSurface
      ? layout.rootTiles.filter((tile) => overlayTileIdSet.has(tile.id))
      : layout.rootTiles
  ), [layout.rootTiles, overlayTileIdSet, useSceneSurface]);

  const handleSceneTilePressStart = useCallback((tile, event) => (
    interactions.handleTilePressStart(tile, event)
  ), [interactions]);

  const handleSceneTileDragStart = useCallback((tile, event) => {
    interactions.beginTileDrag(tile, event);
  }, [interactions]);

  const handleSceneTileContextMenu = useCallback((tile, event) => {
    interactions.handleTileContextMenu(tile, event);
  }, [interactions]);

  const handleSceneTileHoverChange = useCallback((tileId, isHovered) => {
    interactions.handleTileHoverChange(tileId, isHovered);
  }, [interactions]);

  const handleSceneBackgroundPointerDown = useCallback((event) => {
    interactions.handleCanvasPointerDown(event);
  }, [interactions]);

  const handleSceneBackgroundContextMenu = useCallback((event) => {
    interactions.handleCanvasContextMenu(event);
  }, [interactions]);

  const zoomToFitAll = useCallback(() => {
    canvas.zoomToBounds(layout.allTilesBounds);
  }, [canvas, layout.allTilesBounds]);

  const zoomToFitSelection = useCallback(() => {
    canvas.zoomToBounds(layout.selectedTilesBounds);
  }, [canvas, layout.selectedTilesBounds]);

  const updateWorkspaceMode = useCallback((mode) => {
    setWorkspaceView((currentView) => {
      if (mode === "grid") {
        return { ...(currentView ?? {}), mode: "grid" };
      }

      const nextMode = mode === "globe" ? "globe" : "flat";

      if (nextMode === "globe") {
        const globeRadius = getSoftGlobeRadius(filteredTiles.length);
        const minimumCameraDistance = getDefaultCameraDistance(globeRadius);

        return {
          ...(currentView ?? {}),
          mode: "globe",
          globeRadius,
          yaw: Number.isFinite(currentView?.yaw) ? currentView.yaw : 0,
          pitch: Number.isFinite(currentView?.pitch) ? currentView.pitch : 0,
          cameraDistance: clamp(
            Number.isFinite(currentView?.cameraDistance) ? currentView.cameraDistance : minimumCameraDistance,
            minimumCameraDistance,
            Math.max(minimumCameraDistance + 1200, globeRadius * 4.2),
          ),
          focusedTileId: typeof currentView?.focusedTileId === "string" ? currentView.focusedTileId : null,
        };
      }

      return {
        ...(currentView ?? {}),
        mode: "flat",
      };
    });
  }, [filteredTiles.length, setWorkspaceView]);

  const globeRadius = workspaceView.globeRadius ?? getSoftGlobeRadius(filteredTiles.length);
  const globeMinimumCameraDistance = getDefaultCameraDistance(globeRadius);
  const globeMaximumCameraDistance = Math.max(globeMinimumCameraDistance + 1200, globeRadius * 4.2);
  const globeZoomValue = clamp(globeMinimumCameraDistance / Math.max(globeMinimumCameraDistance, workspaceView.cameraDistance ?? globeMinimumCameraDistance), 0.35, 1.8);

  const handleGlobeZoomIn = useCallback(() => {
    setWorkspaceView((currentView) => ({
      ...(currentView ?? {}),
      cameraDistance: clamp(
        (currentView?.cameraDistance ?? globeMinimumCameraDistance) / 1.18,
        globeMinimumCameraDistance,
        globeMaximumCameraDistance,
      ),
    }));
  }, [globeMaximumCameraDistance, globeMinimumCameraDistance, setWorkspaceView]);

  const handleGlobeZoomOut = useCallback(() => {
    setWorkspaceView((currentView) => ({
      ...(currentView ?? {}),
      cameraDistance: clamp(
        (currentView?.cameraDistance ?? globeMinimumCameraDistance) * 1.18,
        globeMinimumCameraDistance,
        globeMaximumCameraDistance,
      ),
    }));
  }, [globeMaximumCameraDistance, globeMinimumCameraDistance, setWorkspaceView]);

  const handleGlobeSetZoom = useCallback((nextZoom) => {
    setWorkspaceView((currentView) => ({
      ...(currentView ?? {}),
      cameraDistance: clamp(
        globeMinimumCameraDistance / Math.max(0.2, nextZoom),
        globeMinimumCameraDistance,
        globeMaximumCameraDistance,
      ),
    }));
  }, [globeMaximumCameraDistance, globeMinimumCameraDistance, setWorkspaceView]);

  const handleGlobeZoomToFitAll = useCallback(() => {
    setWorkspaceView((currentView) => ({
      ...(currentView ?? {}),
      focusedTileId: null,
      cameraDistance: globeMinimumCameraDistance,
    }));
  }, [globeMinimumCameraDistance, setWorkspaceView]);

  const copySelectedBookmarkLink = useCallback(async () => {
    if (interactions.selectedTileIds.length !== 1) {
      return false;
    }

    const selectedTile = tileById[interactions.selectedTileIds[0]] ?? null;

    if (!isBookmarkLinkCard(selectedTile) || !selectedTile.url) {
      return false;
    }

    try {
      await copyTextToClipboard(selectedTile.url);
      toast("success", "Link copied");
      return true;
    } catch (error) {
      log("error", "Copy link failed", error?.message || "Could not copy link.");
      toast("error", "Could not copy link");
      return false;
    }
  }, [interactions.selectedTileIds, log, tileById, toast]);

  useEffect(() => {
    function handleKeyDown(event) {
      const activeElement = document.activeElement;
      const activeElementIsEditable = isEditableElement(activeElement);

      if (event.key === "Escape") {
        if (clearDraftLine()) {
          event.preventDefault();
          return;
        }

        if (interactions.contextMenu) {
          event.preventDefault();
          interactions.closeContextMenu();
          return;
        }
      }

      if (activeElementIsEditable) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && !activeElementIsEditable) {
        const selectedTile = interactions.selectedTileIds.length === 1
          ? tileById[interactions.selectedTileIds[0]] ?? null
          : null;

        if (isBookmarkLinkCard(selectedTile) && selectedTile.url) {
          event.preventDefault();
          void copySelectedBookmarkLink();
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (event.shiftKey) {
          if (!canRedo) {
            return;
          }

          event.preventDefault();
          redoWorkspaceChange();
          interactions.closeContextMenu();
          return;
        }

        if (!canUndo) {
          return;
        }

        event.preventDefault();
        undoWorkspaceChange();
        interactions.closeContextMenu();
        return;
      }

      if (event.key === "Delete" && !activeElementIsEditable) {
        if (deleteSelectedDrawingObject()) {
          event.preventDefault();
          interactions.closeContextMenu();
          return;
        }

        if (interactions.selectedTileIds.length > 0) {
          event.preventDefault();
          commands.deleteTiles(interactions.selectedTileIds);
          interactions.closeContextMenu();
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        if (isGlobeMode) {
          handleGlobeZoomIn();
        } else {
          canvas.zoomIn();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        if (isGlobeMode) {
          handleGlobeZoomOut();
        } else {
          canvas.zoomOut();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        if (isGlobeMode) {
          handleGlobeZoomToFitAll();
        } else {
          canvas.setZoom(1);
        }
        return;
      }

      if (event.shiftKey && event.key === "1") {
        event.preventDefault();
        if (isGlobeMode) {
          handleGlobeZoomToFitAll();
        } else {
          zoomToFitAll();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canvas,
    canRedo,
    canUndo,
    commands,
    handleGlobeZoomIn,
    handleGlobeZoomOut,
    handleGlobeZoomToFitAll,
    interactions,
    isGlobeMode,
    clearDraftLine,
    deleteSelectedDrawingObject,
    redoWorkspaceChange,
    copySelectedBookmarkLink,
    tileById,
    undoWorkspaceChange,
    zoomToFitAll,
  ]);

  const totalTileCount = workspace.cards.length;
  const visibleTileCount = isGlobeMode
    ? globeVisibleTileCount
    : (layout.visibleTileCount ?? layout.rootTiles.length);
  const renderedTileCount = layout.rootTiles.length;
  const folderLabel = folderPath ? folderNameFromPath(folderPath) : null;
  const canvasName = currentEditor.name || "Canvas";
  const performanceMode = useMemo(() => ({
    simplifyDuringMotion: isCanvasMoving,
    sceneSurfaceEnabled: useSceneSurface,
    workspaceLodLevel,
  }), [isCanvasMoving, useSceneSurface, workspaceLodLevel]);

  const boardSnapshot = useMemo(() => ({
    surfaceRenderer: useSceneSurface ? "scene" : "dom",
    workspaceLodLevel,
    viewMode: workspaceView.mode,
    viewport: `${Math.round(liveViewport.x)}:${Math.round(liveViewport.y)}:${liveViewport.zoom.toFixed(2)}`,
    cardCount: workspace.cards.length,
    filteredTileCount: filteredTiles.length,
    visibleTileCount,
    renderedTileCount,
    globeVisibleTileCount: isGlobeMode ? globeVisibleTileCount : null,
    selectedCount: interactions.selectedTileIds.length,
    hoveredTileId: interactions.hoveredTileId,
    focusedTileId: interactions.focusedTileId,
    draggingCount: interactions.draggingTileIds.length,
    dragVisualDelta: interactions.dragVisualDelta
      ? `${Math.round(interactions.dragVisualDelta.x)}:${Math.round(interactions.dragVisualDelta.y)}`
      : null,
    rackPreview: interactions.rackDropPreview?.rackId ?? null,
    marqueeActive: Boolean(interactions.marqueeBox),
    isPanning: canvas.isPanning,
    isDropTarget: dropImport.isDropTarget,
    snapEnabled: snapSettings.enabled,
    globeCameraDistance: isGlobeMode ? Math.round(workspaceView.cameraDistance ?? 0) : null,
  }), [
    canvas.isPanning,
    dropImport.isDropTarget,
    filteredTiles.length,
    globeVisibleTileCount,
    interactions.draggingTileIds.length,
    interactions.dragVisualDelta,
    interactions.focusedTileId,
    interactions.hoveredTileId,
    interactions.marqueeBox,
    interactions.rackDropPreview?.rackId,
    interactions.selectedTileIds.length,
    isGlobeMode,
    liveViewport.x,
    liveViewport.y,
    liveViewport.zoom,
    renderedTileCount,
    snapSettings.enabled,
    visibleTileCount,
    workspaceView.cameraDistance,
    workspaceView.mode,
    useSceneSurface,
    workspaceLodLevel,
    workspace.cards.length,
  ]);

  useEffect(() => {
    const previousSnapshot = previousBoardSnapshotRef.current;
    const changedKeys = previousSnapshot
      ? Object.keys(boardSnapshot).filter((key) => previousSnapshot[key] !== boardSnapshot[key])
      : ["initial-render"];

    recordBoardRender(changedKeys, { isMoving: isCanvasMoving });
    previousBoardSnapshotRef.current = boardSnapshot;
  }, [boardSnapshot, isCanvasMoving]);

  useEffect(() => {
    setPerfSummary({
      visibleTileCount,
      renderedTileCount,
      totalTileCount,
      activeDragLayers: interactions.draggingTileIds.length,
      previewTierCounts,
      lodLevelCounts,
      perfMode: performanceMode,
      surfaceRenderer: useSceneSurface ? "scene" : "dom",
      workspaceLodLevel,
    });
  }, [
    interactions.draggingTileIds.length,
    lodLevelCounts,
    performanceMode,
    previewTierCounts,
    renderedTileCount,
    useSceneSurface,
    totalTileCount,
    visibleTileCount,
    workspaceLodLevel,
  ]);

  const toggleCanvasSnapping = useCallback(() => {
    setSnapSettings((currentSettings) => {
      const nextSettings = {
        ...currentSettings,
        enabled: !currentSettings.enabled,
      };

      void saveHomeUiState(buildCanvasSnapUiStatePatch(nextSettings)).catch((error) => {
        const message = error?.message || "Unable to save the canvas snap setting.";
        log("error", "Canvas snap setting save failed", message);
        toast("error", message);
      });

      log("info", `Canvas snapping ${nextSettings.enabled ? "enabled" : "disabled"}`, nextSettings);
      toast("info", `Canvas snapping ${nextSettings.enabled ? "enabled" : "disabled"}.`);
      return nextSettings;
    });
  }, [log, saveHomeUiState, toast]);

  const radialMenu = interactions.contextMenu;
  const recoverablePreviewTiles = useMemo(
    () => workspace.cards.filter((card) => shouldRecoverLinkPreviewCard(card)),
    [workspace.cards],
  );
  const activeContextTile = radialMenu?.kind === "tile"
    ? (tileById[radialMenu.card?.id] ?? radialMenu.card ?? null)
    : null;
  const canShowRefreshPreviewAction = canRefreshLinkPreviewCard(activeContextTile)
    || isBookmarkLinkCard(activeContextTile);
  const canCopyPreviewDiagnostics = isBookmarkLinkCard(activeContextTile);

  const handleRadialFolder = useCallback(() => {
    if (!radialMenu?.worldPoint) {
      return false;
    }

    const selectionIds = radialMenu.selectionIds ?? [];

    if (selectionIds.length > 0) {
      commands.createFolderFromSelection(selectionIds, radialMenu.worldPoint);
      return true;
    }

    commands.createFolderTile(radialMenu.worldPoint);
    return true;
  }, [commands, radialMenu]);

  const handleRadialRack = useCallback(() => {
    if (!radialMenu?.worldPoint) {
      return false;
    }

    commands.createRack(radialMenu.worldPoint);
    return true;
  }, [commands, radialMenu]);

  const handleRadialDelete = useCallback(() => {
    const selectionIds = radialMenu?.selectionIds ?? [];

    if (selectionIds.length === 0) {
      return false;
    }

    commands.deleteTiles(selectionIds);
    return true;
  }, [commands, radialMenu]);

  const handleRadialLink = useCallback(async () => {
    if (!radialMenu?.worldPoint) {
      return false;
    }

    const tile = await commands.createLinkFromClipboard(radialMenu.worldPoint);
    return Boolean(tile);
  }, [commands, radialMenu]);

  const handleRefreshFailedPreviews = useCallback(async () => {
    const refreshedCount = await commands.refreshRecoverableTilePreviews(recoverablePreviewTiles);
    return refreshedCount > 0;
  }, [commands, recoverablePreviewTiles]);

  const handleRefreshTilePreview = useCallback(async () => {
    if (!activeContextTile) {
      return false;
    }

    return commands.refreshTilePreview(activeContextTile);
  }, [activeContextTile, commands]);

  const handleCopyPreviewDiagnostics = useCallback(async () => {
    if (!canCopyPreviewDiagnostics || !activeContextTile) {
      return false;
    }

    try {
      const payload = buildPreviewDiagnosticsExport(activeContextTile);
      await copyTextToClipboard(JSON.stringify(payload, null, 2));
      toast("success", "Preview diagnostics copied");
      return true;
    } catch (error) {
      log("error", "Copy preview diagnostics failed", error?.message || "Could not copy preview diagnostics.");
      toast("error", "Could not copy preview diagnostics");
      return false;
    }
  }, [activeContextTile, canCopyPreviewDiagnostics, log, toast]);

  const contextMenuActions = useMemo(() => buildRadialMenuActions({
    menu: radialMenu,
    snapEnabled: snapSettings.enabled,
    deleteDisabled: (radialMenu?.selectionIds?.length ?? 0) === 0,
    failedPreviewRefreshCount: radialMenu?.kind === "canvas" ? recoverablePreviewTiles.length : 0,
    showSinglePreviewRefresh: radialMenu?.kind === "tile" && canShowRefreshPreviewAction,
    showCopyPreviewDiagnostics: radialMenu?.kind === "tile" && canCopyPreviewDiagnostics,
    singlePreviewRefreshDisabled: !canRefreshLinkPreviewCard(activeContextTile),
    handlers: {
      onCopyPreviewDiagnostics: handleCopyPreviewDiagnostics,
      onRefreshFailedPreviews: handleRefreshFailedPreviews,
      onRefreshPreview: handleRefreshTilePreview,
      onToggleSnapping: () => {
        toggleCanvasSnapping();
        return true;
      },
      onDeleteSelection: handleRadialDelete,
      onCreateFolder: handleRadialFolder,
      onCreateRack: handleRadialRack,
      onCreateLink: handleRadialLink,
    },
  }), [
    handleRadialDelete,
    handleRadialFolder,
    handleRadialLink,
    handleRadialRack,
    handleCopyPreviewDiagnostics,
    handleRefreshFailedPreviews,
    handleRefreshTilePreview,
    canCopyPreviewDiagnostics,
    canShowRefreshPreviewAction,
    activeContextTile,
    recoverablePreviewTiles.length,
    radialMenu,
    snapSettings.enabled,
    toggleCanvasSnapping,
  ]);

  // ── Grid View short-circuit ─────────────────────────────────────────────
  if (isGridMode) {
    return (
      <main className="canvas-stage canvas-stage--grid">
        <div className="canvas-stage__fab">
          <CanvasAddMenu commands={commands} disabled={!folderPath || folderLoading} side="top" />
        </div>
        <div className="canvas-stage__bottom-controls">
          <WorkspaceViewToggle mode={workspaceView.mode} onChange={updateWorkspaceMode} />
        </div>
        <WorkspaceTopbarTrail
          canvasName={canvasName}
          folderLabel={folderLabel}
          folderLoading={folderLoading}
          onOpenHome={() => void showHome()}
          onOpenWorkspaceFolder={commands.openWorkspaceFolder}
        />
        <GridWorkspaceView
          openTileLink={commands.openTileLink}
          updateTileFromMediaLoad={commands.updateTileFromMediaLoad}
          retryTilePreview={commands.retryTilePreview}
          onPaste={handleWorkspacePaste}
        />
      </main>
    );
  }

  return (
    <main className="canvas-stage">
      {/* ── Right Tools Portal ── */}
      {createPortal(
        <div className="canvas-toolbar-shell canvas-toolbar-shell--right">
          <CanvasZoomMenu
            zoom={isGlobeMode ? globeZoomValue : viewportZoomForRender}
            canFitAll={isGlobeMode ? filteredTiles.length > 0 : Boolean(layout.allTilesBounds)}
            canFitSelection={!isGlobeMode && Boolean(layout.selectedTilesBounds)}
            onZoomIn={isGlobeMode ? handleGlobeZoomIn : canvas.zoomIn}
            onZoomOut={isGlobeMode ? handleGlobeZoomOut : canvas.zoomOut}
            onZoomToFitAll={isGlobeMode ? handleGlobeZoomToFitAll : zoomToFitAll}
            onZoomToFitSelection={isGlobeMode ? undefined : zoomToFitSelection}
            onSetZoom={isGlobeMode ? handleGlobeSetZoom : canvas.setZoom}
          />
        </div>,
        document.getElementById("titlebar-right-slot") || document.body
      )}

      <div className="canvas-stage__fab">
        <CanvasAddMenu
          commands={commands}
          disabled={!folderPath || folderLoading}
          side="top"
        />
      </div>
      <div className="canvas-stage__bottom-controls">
        <WorkspaceViewToggle mode={workspaceView.mode} onChange={updateWorkspaceMode} />
        {!isGlobeMode ? (
          <DrawingToolControls
            activeTool={drawingTool.activeTool}
            strokeColor={drawingTool.strokeColor}
            onToolChange={drawingTool.handleToolModeChange}
            onStrokeColorChange={drawingTool.setStrokeColor}
          />
        ) : null}
      </div>

      {/* ── Top bar ── */}
      <WorkspaceTopbarTrail
        canvasName={canvasName}
        folderLabel={folderLabel}
        folderLoading={folderLoading}
        onOpenHome={() => void showHome()}
        onOpenWorkspaceFolder={commands.openWorkspaceFolder}
      />

      {/* ── Canvas board ── */}
      <div
        ref={canvas.containerRef}
        id="canvas-board"
        className={`canvas${interactions.marqueeBox ? " canvas--selecting" : ""}${dropImport.isDropTarget ? " canvas--drop-target" : ""}${isCanvasMoving ? " canvas--moving" : ""}${isGlobeMode ? " canvas--globe" : ""}`}
        tabIndex={-1}
        onDragEnter={dropImport.handleDragEnter}
        onDragOver={dropImport.handleDragOver}
        onDragLeave={dropImport.handleDragLeave}
        onDrop={(event) => { void dropImport.handleDrop(event); }}
      onPointerDown={(event) => {
          if (isGlobeMode || useSceneSurface) {
            return;
          }

          interactions.handleCanvasPointerDown(event);
        }}
        onContextMenu={isGlobeMode || useSceneSurface ? undefined : interactions.handleCanvasContextMenu}
        onClick={(event) => {
          if (isGlobeMode) {
            if (!isEditableElement(event.target)) {
              event.currentTarget.focus({ preventScroll: true });
            }
            return;
          }

          if (!isEditableElement(event.target)) {
            event.currentTarget.focus({ preventScroll: true });
          }
        }}
      >
        {isGlobeMode ? (
            <GlobeWorkspaceView
              allCards={workspace.cards}
              cards={filteredTiles}
              view={workspaceView}
              setWorkspaceView={setWorkspaceView}
              updateExistingCards={updateExistingCards}
              openTileLink={commands.openTileLink}
              updateTileFromMediaLoad={commands.updateTileFromMediaLoad}
              retryTilePreview={commands.retryTilePreview}
              onRemoveTile={(tileId) => commands.deleteTiles([tileId])}
              onVisibleCountChange={setGlobeVisibleTileCount}
            />
        ) : (
          <>
            <div ref={canvas.gridRef} className="canvas__grid" />
            {useSceneSurface ? (
              <SceneWorkspaceSurface
                folderPath={folderPath}
                tiles={sceneTiles}
                tileMetaById={stableTileMetaById}
                tileRenderHintsById={tileRenderHintsById}
                isCanvasMoving={isCanvasMoving}
                cameraSnapshot={workspace.viewport}
                getViewportSnapshot={canvas.getViewportSnapshot}
                onTilePressStart={handleSceneTilePressStart}
                onTileDragStart={handleSceneTileDragStart}
                onTileContextMenu={handleSceneTileContextMenu}
                onTileHoverChange={handleSceneTileHoverChange}
                onBackgroundPointerDown={handleSceneBackgroundPointerDown}
                onBackgroundContextMenu={handleSceneBackgroundContextMenu}
              />
            ) : null}
            <DrawingLayer
              drawings={drawingTool.drawings}
              draftLine={drawingTool.draftLine}
              selectedObjectId={drawingTool.selectedObjectId}
              activeTool={drawingTool.activeTool}
              isSpacePanning={drawingTool.isSpacePanning}
              getViewportSnapshot={canvas.getViewportSnapshot}
              subscribeViewportTransform={canvas.subscribeViewportTransform}
              onSelectObject={drawingTool.handleSelectObject}
              onStagePointerDown={drawingTool.handleStagePointerDown}
              onStagePointerMove={drawingTool.handleStagePointerMove}
              onStagePointerUp={drawingTool.handleStagePointerUp}
              onStagePointerCancel={drawingTool.handleStagePointerCancel}
              onStageContextMenu={drawingTool.handleStageContextMenu}
            />
            <div
              ref={canvas.contentRef}
              className={`canvas__content${useSceneSurface ? " canvas__content--overlay" : ""}`}
            >
              {(useSceneSurface ? overlayTiles : layout.rootTiles).map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  tileMeta={stableTileMetaById[card.id]}
                  viewportZoom={viewportZoomForRender}
                  renderHint={tileRenderHintsById[card.id]}
                  dragVisualDelta={interactions.dragVisualDelta}
                  dragVisualTileIdSet={draggingTileIdSet}
                  childTiles={layout.rackTileChildrenByRackId[card.id] ?? []}
                  rackState={layout.rackStateById[card.id] ?? null}
                  performanceMode={performanceMode}
                  onBeginDrag={interactions.beginTileDrag}
                  onContextMenu={interactions.handleTileContextMenu}
                  onHoverChange={interactions.handleTileHoverChange}
                  onFocusIn={interactions.handleTileFocusIn}
                  onFocusOut={interactions.handleTileFocusOut}
                  onOpenLink={commands.openTileLink}
                  onMediaLoad={commands.updateTileFromMediaLoad}
                  onPressStart={interactions.handleTilePressStart}
                  onRetry={commands.retryTilePreview}
                />
              ))}
            </div>
          </>
        )}

        {!isGlobeMode && interactions.marqueeBox ? (
          <div className="canvas__marquee" style={interactions.marqueeStyleVars} />
        ) : null}
        {!isGlobeMode ? (
          <CanvasPerformanceOverlay
            visibleTileCount={visibleTileCount}
            renderedTileCount={renderedTileCount}
            totalTileCount={totalTileCount}
            activeDragLayers={interactions.draggingTileIds.length}
            isCanvasMoving={isCanvasMoving}
            workspaceLodLevel={workspaceLodLevel}
            lodLevelCounts={lodLevelCounts}
            previewTierCounts={previewTierCounts}
          />
        ) : null}

        {/* Empty states */}
        {!folderPath ? (
          <section className="canvas__empty">
            <div className="canvas__empty-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="canvas__empty-title">No workspace open</h2>
            <p className="canvas__empty-description">Open a local folder to start saving links and media.</p>
            <AppButton tone="unstyled" className="canvas__empty-action" type="button" onClick={commands.openWorkspaceFolder}>
              Open Folder
            </AppButton>
          </section>
        ) : totalTileCount === 0 ? (
          <AppEmptyState
            title="Canvas is empty"
            description="Use the Add button in the bottom-right to create a rack. Paste a URL or image to import directly."
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            }
          />
        ) : null}
      </div>

      <TileContextMenu
        menu={radialMenu}
        actions={contextMenuActions}
        onClose={interactions.closeContextMenu}
      />
    </main>
  );
}

