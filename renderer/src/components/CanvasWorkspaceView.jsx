import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Card from "./Card";
import CanvasAddMenu from "./CanvasAddMenu";
import CanvasCalculator from "./CanvasCalculator";
import CanvasDock from "./CanvasDock";
import CanvasMiniMap from "./CanvasMiniMap";
import CanvasStopwatch from "./CanvasStopwatch";
import CanvasZoomMenu from "./CanvasZoomMenu";
import GridWorkspaceView from "./GridWorkspaceView";
import SceneWorkspaceSurface from "./SceneWorkspaceSurface";
import TextFormattingToolbar from "./TextFormattingToolbar";
import TileContextMenu from "./TileContextMenu";
import CanvasEmbedLayer from "./canvas/CanvasEmbedLayer";
import DrawingLayer from "./canvas/DrawingLayer";
import { useAppContext } from "../context/useAppContext";
import { useLog } from "../hooks/useLog";
import { useToast } from "../hooks/useToast";
import {
  CODE_CARD_TYPE,
  COUNTER_CARD_TYPE,
  DEADLINE_CARD_TYPE,
  PROGRESS_CARD_TYPE,
  TEXT_BOX_CARD_TYPE,
  canRefreshLinkPreviewCard,
  createCanvasSelectionClipboardPayload,
  getWorkspaceActivePage,
  isBookmarkLinkCard,
  isEditableElement,
  isTypingTarget,
  pasteCanvasSelectionClipboardPayload,
  removeCard,
  removeStructuredEntriesForTileIds,
  shouldRecoverLinkPreviewCard,
} from "../lib/workspace";
import { getTextBoxLineCount, normalizeTextBoxStyle } from "../lib/textBoxStyle";
import { useCanvasSystem } from "../systems/canvas/useCanvasSystem";
import { useCanvasCommands } from "../systems/commands/useCanvasCommands";
import { useCanvasInteractionSystem } from "../systems/interactions/useCanvasInteractionSystem";
import { buildRadialMenuActions } from "../systems/interactions/radialMenuActions";
import { useCanvasDropImport } from "../systems/import/useCanvasDropImport";
import { useTileLayoutSystem } from "../systems/layout/useTileLayoutSystem";
import { useDrawingTool } from "../systems/drawing/useDrawingTool";
import {
  DRAWING_TOOL_MODE_HAND,
  DRAWING_TOOL_MODE_SELECT,
  DRAWING_TOOL_MODE_TEXT,
} from "../systems/drawing/drawingTypes";
import {
  buildCanvasSnapUiStatePatch,
  DEFAULT_CANVAS_SNAP_SETTINGS,
  normalizeCanvasSnapSettings,
} from "../systems/snapping/canvasSnapSettings";
import {
  AppButton,
  AppEmptyState,
} from "./ui/app";
import {
  readPointerMoveStats,
  recordBoardRender,
  recordDerivedMetric,
  setPerfSummary,
} from "../lib/perf";
import { recordStickerDebug } from "../lib/stickerDebug";
import {
  buildTileRenderHint,
  resolveWorkspaceLodLevel,
  WORKSPACE_LOD_LEVEL,
} from "../systems/canvas/tileLod";

const ASSET_BASE_URL = import.meta.env.BASE_URL;
const LINK_PREVIEW_DEBUG_ACTIONS_ENABLED = (
  Boolean(import.meta.env.DEV)
  || String(import.meta.env.VITE_PREVIEW_DEBUG ?? "").trim() === "1"
  || (typeof window !== "undefined" && window.__AIRPASTE_PREVIEW_DEBUG === true)
);

function assetUrl(relativePath) {
  return `${ASSET_BASE_URL}${String(relativePath).replace(/^\/+/, "")}`;
}

function getStickerCanvasHoverState(canvasElement, clientX, clientY) {
  const canvasRect = canvasElement?.getBoundingClientRect?.() ?? null;
  const isInsideCanvas = Boolean(
    canvasRect
    && clientX >= canvasRect.left
    && clientX <= canvasRect.right
    && clientY >= canvasRect.top
    && clientY <= canvasRect.bottom
  );

  if (!isInsideCanvas) {
    return false;
  }

  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
    return true;
  }

  const targetElement = document.elementFromPoint(clientX, clientY);
  const isBlockedByStickerUi = Boolean(
    targetElement?.closest?.(".sticker-paper, .sticker-palette__toggle")
  );

  return !isBlockedByStickerUi;
}

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
        <img className="workspace-view-toggle__icon" src={assetUrl("icons/canvas.png")} alt="" aria-hidden="true" />
      </AppButton>
      <AppButton tone="unstyled"
        type="button"
        className={`workspace-view-toggle__button${mode === "grid" ? " workspace-view-toggle__button--active" : ""}`}
        onClick={() => onChange("grid")}
        aria-selected={mode === "grid"}
        role="tab"
        aria-label="Tile view"
      >
        <img className="workspace-view-toggle__icon" src={assetUrl("icons/grid.png")} alt="" aria-hidden="true" />
      </AppButton>
    </div>
  );
}

function WorkspaceTopbarTrail() {
  return <header className="workspace-trail" />;
}

function GridViewFilterToggle({ value, onChange }) {
  return (
    <div className="grid-view-filter-toggle" role="tablist" aria-label="Grid tile visibility">
      <AppButton tone="unstyled"
        type="button"
        className={`grid-view-filter-toggle__button${value === "bookmarks" ? " grid-view-filter-toggle__button--active" : ""}`}
        onClick={() => onChange("bookmarks")}
        aria-selected={value === "bookmarks"}
        role="tab"
      >
        Show only bookmarks
      </AppButton>
      <AppButton tone="unstyled"
        type="button"
        className={`grid-view-filter-toggle__button${value === "all" ? " grid-view-filter-toggle__button--active" : ""}`}
        onClick={() => onChange("all")}
        aria-selected={value === "all"}
        role="tab"
      >
        Show bookmarks and all the other tiles
      </AppButton>
    </div>
  );
}

function DrawingToolControls({
  activeTool,
  iconOnly = false,
  onToolChange,
}) {
  const isHandToolActive = activeTool === DRAWING_TOOL_MODE_HAND;
  const isTextToolActive = activeTool === DRAWING_TOOL_MODE_TEXT;
  const iconOnlyClassName = iconOnly ? " drawing-tool-controls--icon-only" : "";

  return (
    <div className={`drawing-tool-controls${iconOnlyClassName}`} role="group" aria-label="Canvas tools">
      <div className="drawing-tool-controls__mode" role="group" aria-label="Canvas tool mode">
        <AppButton tone="unstyled"
          type="button"
          className={`drawing-tool-controls__button${activeTool === DRAWING_TOOL_MODE_SELECT ? " drawing-tool-controls__button--active" : ""}`}
          onClick={() => onToolChange(DRAWING_TOOL_MODE_SELECT)}
          aria-label="Switch to Select tool"
          aria-pressed={activeTool === DRAWING_TOOL_MODE_SELECT}
          title="Select (V)"
        >
          <img className="drawing-tool-controls__icon drawing-tool-controls__icon--pixel" src={assetUrl("icons/cursor-default.png")} alt="" aria-hidden="true" />
          {!iconOnly ? <span className="drawing-tool-controls__text">Select</span> : null}
        </AppButton>
        <AppButton tone="unstyled"
          type="button"
          className={`drawing-tool-controls__button${isHandToolActive ? " drawing-tool-controls__button--active" : ""}`}
          onClick={() => onToolChange(DRAWING_TOOL_MODE_HAND)}
          aria-label="Switch to hand tool"
          aria-pressed={isHandToolActive}
          title="Hand (H)"
        >
          <img className="drawing-tool-controls__icon drawing-tool-controls__icon--pixel" src={assetUrl("icons/hand-back-left.png")} alt="" aria-hidden="true" />
          {!iconOnly ? <span className="drawing-tool-controls__text">Hand</span> : null}
        </AppButton>
        <AppButton tone="unstyled"
          type="button"
          className={`drawing-tool-controls__button${isTextToolActive ? " drawing-tool-controls__button--active" : ""}`}
          onClick={() => onToolChange(DRAWING_TOOL_MODE_TEXT)}
          aria-label="Switch to text tool"
          aria-pressed={isTextToolActive}
          title="Text (T)"
        >
          <img className="drawing-tool-controls__icon drawing-tool-controls__icon--pixel" src={assetUrl("icons/text-recognition.png")} alt="" aria-hidden="true" />
          {!iconOnly ? <span className="drawing-tool-controls__text">Text</span> : null}
        </AppButton>
      </div>
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
    finalPreviewStatus: diagnostics.finalPreviewStatus || diagnostics.previewStatus || card?.status || "",
    reason: diagnostics.reason || card?.previewError || "",
    rejectionReason: diagnostics.rejectionReason || "",
    urlNormalized: diagnostics.urlNormalized === true,
    metadataFetchStatus: diagnostics.metadataFetchStatus || "",
    openGraphStatus: diagnostics.openGraphStatus || "",
    thumbnailStatus: diagnostics.thumbnailStatus || "",
    embedAttempted: diagnostics.embedAttempted === true,
    embedBlocked: diagnostics.embedBlocked === true,
    embedBlockReason: diagnostics.embedBlockReason || "",
    cookieWallDetected: diagnostics.cookieWallDetected === true,
    loginWallDetected: diagnostics.loginWallDetected === true,
    captchaDetected: diagnostics.captchaDetected === true,
    fallbackUsed: diagnostics.fallbackUsed === true,
    fallbackReason: diagnostics.fallbackReason || "",
    errors: Array.isArray(diagnostics.errors) ? diagnostics.errors : [],
    warnings: Array.isArray(diagnostics.warnings) ? diagnostics.warnings : [],
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
    responseMeta: diagnostics.responseMeta ?? {},
    resolverMetadata: diagnostics.resolverMetadata ?? {},
    trace: Array.isArray(diagnostics.trace) ? diagnostics.trace : [],
    finalPersistedCardPayload,
  };
}

function buildCodeTileDiagnosticsExport(card) {
  const code = String(card?.code ?? "");
  const lineCount = code.length > 0 ? code.split(/\r?\n/).length : 0;

  return {
    schemaVersion: 1,
    tileId: card?.id || "",
    type: card?.type || CODE_CARD_TYPE,
    title: card?.title || "",
    language: card?.language || "plain",
    codeLength: code.length,
    lineCount,
    wrap: card?.wrap !== false,
    showLineNumbers: card?.showLineNumbers !== false,
    finalPersistedCardPayload: {
      ...card,
      codePreview: code.slice(0, 240),
    },
  };
}

function buildPreviewCodexReport(card) {
  const diagnostics = buildPreviewDiagnosticsExport(card);

  return [
    "## AirPaste Link Tile Debug Report",
    "",
    "### URL",
    diagnostics.canonicalUrl || diagnostics.originalUrl || card?.url || "",
    "",
    "### Tile",
    `- Tile ID: ${card?.id || ""}`,
    `- Detected type: ${diagnostics.contentType || card?.contentType || "link"}`,
    `- Preview status: ${diagnostics.finalPreviewStatus || diagnostics.previewStatus || card?.status || ""}`,
    diagnostics.fallbackReason ? `- Fallback reason: ${diagnostics.fallbackReason}` : "- Fallback reason: ",
    "",
    "### Diagnostics",
    "```json",
    JSON.stringify(diagnostics, null, 2),
    "```",
    "",
    "### Console-Safe Errors/Warnings",
    "```json",
    JSON.stringify({
      errors: diagnostics.errors,
      warnings: diagnostics.warnings,
    }, null, 2),
    "```",
  ].join("\n");
}

function buildCodeTileCodexReport(card) {
  const diagnostics = buildCodeTileDiagnosticsExport(card);

  return [
    "## AirPaste Code Tile Debug Report",
    "",
    "### Tile",
    `- Tile ID: ${diagnostics.tileId}`,
    `- Type: ${diagnostics.type}`,
    `- Language: ${diagnostics.language}`,
    `- Code length: ${diagnostics.codeLength}`,
    `- Line count: ${diagnostics.lineCount}`,
    `- Wrap: ${diagnostics.wrap}`,
    `- Show line numbers: ${diagnostics.showLineNumbers}`,
    "",
    "### Diagnostics",
    "```json",
    JSON.stringify(diagnostics, null, 2),
    "```",
  ].join("\n");
}

function buildCounterTileDiagnosticsExport(card) {
  return {
    schemaVersion: 1,
    tileId: card?.id || "",
    type: card?.type || COUNTER_CARD_TYPE,
    title: card?.title || "",
    value: Number.isFinite(card?.value) ? Number(card.value) : 0,
    step: Number.isFinite(card?.step) ? Number(card.step) : 1,
    unit: typeof card?.unit === "string" ? card.unit : "",
    finalPersistedCardPayload: { ...card },
  };
}

function buildCounterTileCodexReport(card) {
  const diagnostics = buildCounterTileDiagnosticsExport(card);

  return [
    "## AirPaste Counter Tile Debug Report",
    "",
    "### Tile",
    `- Tile ID: ${diagnostics.tileId}`,
    `- Type: ${diagnostics.type}`,
    `- Title: ${diagnostics.title}`,
    `- Value: ${diagnostics.value}`,
    `- Step: ${diagnostics.step}`,
    `- Unit: ${diagnostics.unit}`,
    "",
    "### Diagnostics",
    "```json",
    JSON.stringify(diagnostics, null, 2),
    "```",
  ].join("\n");
}

function buildDeadlineTileDiagnosticsExport(card) {
  return {
    schemaVersion: 1,
    tileId: card?.id || "",
    type: card?.type || DEADLINE_CARD_TYPE,
    title: card?.title || "",
    targetAt: card?.targetAt || "",
    timezone: card?.timezone || "local",
    showSeconds: card?.showSeconds === true,
    finalPersistedCardPayload: { ...card },
  };
}

function buildDeadlineTileCodexReport(card) {
  const diagnostics = buildDeadlineTileDiagnosticsExport(card);

  return [
    "## AirPaste Deadline Tile Debug Report",
    "",
    "### Tile",
    `- Tile ID: ${diagnostics.tileId}`,
    `- Type: ${diagnostics.type}`,
    `- Title: ${diagnostics.title}`,
    `- Target at: ${diagnostics.targetAt}`,
    `- Timezone: ${diagnostics.timezone}`,
    `- Show seconds: ${diagnostics.showSeconds}`,
    "",
    "### Diagnostics",
    "```json",
    JSON.stringify(diagnostics, null, 2),
    "```",
  ].join("\n");
}

function buildProgressTileDiagnosticsExport(card) {
  return {
    schemaVersion: 1,
    tileId: card?.id || "",
    type: card?.type || PROGRESS_CARD_TYPE,
    title: card?.title || "",
    mode: card?.mode || "manual",
    value: Number.isFinite(card?.value) ? Number(card.value) : 0,
    max: Number.isFinite(card?.max) ? Number(card.max) : 100,
    linkedTileId: card?.linkedTileId || null,
    finalPersistedCardPayload: { ...card },
  };
}

function buildProgressTileCodexReport(card) {
  const diagnostics = buildProgressTileDiagnosticsExport(card);

  return [
    "## AirPaste Progress Tile Debug Report",
    "",
    "### Tile",
    `- Tile ID: ${diagnostics.tileId}`,
    `- Type: ${diagnostics.type}`,
    `- Title: ${diagnostics.title}`,
    `- Mode: ${diagnostics.mode}`,
    `- Value: ${diagnostics.value}`,
    `- Max: ${diagnostics.max}`,
    `- Linked tile ID: ${diagnostics.linkedTileId || ""}`,
    "",
    "### Diagnostics",
    "```json",
    JSON.stringify(diagnostics, null, 2),
    "```",
  ].join("\n");
}

function buildTextBoxTileDiagnosticsExport(card) {
  const style = normalizeTextBoxStyle(card?.style);
  const text = String(card?.text ?? "");

  return {
    schemaVersion: 1,
    tileId: card?.id || "",
    type: card?.type || TEXT_BOX_CARD_TYPE,
    textLength: text.length,
    lineCount: getTextBoxLineCount(text),
    preset: style.preset,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    align: style.align,
    styleFlags: {
      italic: style.italic,
      underline: style.underline,
      strike: style.strike,
    },
    italic: style.italic,
    underline: style.underline,
    strike: style.strike,
    color: style.color,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    placeholder: card?.placeholder === true,
    finalPersistedCardPayload: { ...card },
  };
}

function buildTextBoxTileCodexReport(card) {
  const diagnostics = buildTextBoxTileDiagnosticsExport(card);

  return [
    "## AirPaste Text Box Tile Debug Report",
    "",
    "### Tile",
    `- Tile ID: ${diagnostics.tileId}`,
    `- Type: ${diagnostics.type}`,
    `- Text length: ${diagnostics.textLength}`,
    `- Line count: ${diagnostics.lineCount}`,
    `- Preset: ${diagnostics.preset}`,
    `- Font size: ${diagnostics.fontSize}`,
    `- Font weight: ${diagnostics.fontWeight}`,
    `- Align: ${diagnostics.align}`,
    `- Italic: ${diagnostics.italic}`,
    `- Underline: ${diagnostics.underline}`,
    `- Strike: ${diagnostics.strike}`,
    "",
    "### Diagnostics",
    "```json",
    JSON.stringify(diagnostics, null, 2),
    "```",
  ].join("\n");
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

function isPrintableTextKey(event) {
  return (
    typeof event?.key === "string"
    && event.key.length === 1
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.isComposing
  );
}

function CanvasPerformanceOverlay({
  visibleTileCount,
  renderedTileCount,
  totalTileCount,
  activeDragLayers,
  promotedDomTileCount,
  activeEmbedTileCount,
  isCanvasMoving,
  workspaceLodLevel,
  lodLevelCounts,
  previewTierCounts,
}) {
  const { toast } = useToast();
  const overlayRef = useRef(null);
  const [position, setPosition] = useState({ x: null, y: null });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef(null);
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
    textTileRenderCount: 0,
    textTileMovingRenderCount: 0,
    textTileMeasurePassCount: 0,
    textTileSizeWriteCount: 0,
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
        const textTiles = perfStore?.textTiles ?? null;

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
          textTileRenderCount: textTiles?.renderCount ?? 0,
          textTileMovingRenderCount: textTiles?.movingRenderCount ?? 0,
          textTileMeasurePassCount: textTiles?.measurePassCount ?? 0,
          textTileSizeWriteCount: textTiles?.sizeWriteCount ?? 0,
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

  useEffect(() => {
    function clampOverlayPosition(nextX, nextY) {
      const overlayRect = overlayRef.current?.getBoundingClientRect();
      const overlayWidth = overlayRect?.width ?? 208;
      const overlayHeight = overlayRect?.height ?? 220;
      const maxX = Math.max(8, window.innerWidth - overlayWidth - 8);
      const maxY = Math.max(8, window.innerHeight - overlayHeight - 8);

      return {
        x: Math.min(Math.max(8, nextX), maxX),
        y: Math.min(Math.max(8, nextY), maxY),
      };
    }

    function handlePointerMove(event) {
      if (!dragStateRef.current) {
        return;
      }

      const nextX = event.clientX - dragStateRef.current.offsetX;
      const nextY = event.clientY - dragStateRef.current.offsetY;
      setPosition(clampOverlayPosition(nextX, nextY));
    }

    function handlePointerUp() {
      dragStateRef.current = null;
      setIsDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
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
    `DOM islands: ${promotedDomTileCount}`,
    `Live embeds: ${activeEmbedTileCount}`,
    `Pointer avg: ${roundMetric(snapshot.pointerAvgMs)} ms`,
    `Pointer max: ${roundMetric(snapshot.pointerMaxMs)} ms`,
    `Renders: ${snapshot.boardRenderCount}`,
    `Move renders: ${snapshot.boardMovingRenderCount}`,
    `Save: ${roundMetric(snapshot.latestSaveMs)} ms`,
    `Serialize: ${roundMetric(snapshot.latestSerializeMs)} ms`,
    `Commit: ${roundMetric(snapshot.latestCommitMs)} ms`,
    `Text renders: ${snapshot.textTileRenderCount}`,
    `Text move renders: ${snapshot.textTileMovingRenderCount}`,
    `Text measure passes: ${snapshot.textTileMeasurePassCount}`,
    `Text size writes: ${snapshot.textTileSizeWriteCount}`,
    `LOD mode: ${workspaceLodLevel === WORKSPACE_LOD_LEVEL.FAR ? "1 (far)" : "0 (normal)"}`,
    `LOD tiles: 0=${lodLevelCounts.lod0} 1=${lodLevelCounts.lod1}`,
    `Preview tiers: t${previewTierCounts.thumbnail} m${previewTierCounts.medium} h${previewTierCounts.high} o${previewTierCounts.original}`,
    `State: ${isCanvasMoving ? "moving" : "idle"}`,
  ].join("\n"), [
    activeDragLayers,
    activeEmbedTileCount,
    isCanvasMoving,
    promotedDomTileCount,
    snapshot.boardRenderCount,
    snapshot.boardMovingRenderCount,
    snapshot.droppedFrames,
    snapshot.fps,
    snapshot.frameMs,
    snapshot.latestCommitMs,
    snapshot.textTileMeasurePassCount,
    snapshot.textTileMovingRenderCount,
    snapshot.textTileRenderCount,
    snapshot.textTileSizeWriteCount,
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

  const handleDragStart = useCallback((event) => {
    if (event.button !== 0) {
      return;
    }

    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }

    const overlayRect = overlayRef.current?.getBoundingClientRect();
    if (!overlayRect) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      offsetX: event.clientX - overlayRect.left,
      offsetY: event.clientY - overlayRect.top,
    };
    setIsDragging(true);
    setPosition({
      x: overlayRect.left,
      y: overlayRect.top,
    });
  }, []);

  return (
    <div
      ref={overlayRef}
      className={`canvas-perf-overlay${isDragging ? " canvas-perf-overlay--dragging" : ""}`}
      aria-live="off"
      style={{
        left: position.x == null ? undefined : `${position.x}px`,
        top: position.y == null ? undefined : `${position.y}px`,
        right: position.x == null ? "16px" : "auto",
      }}
    >
      <div
        className="canvas-perf-overlay__header"
        onPointerDown={handleDragStart}
      >
        <span>PERF</span>
        <div className="canvas-perf-overlay__header-actions">
          <span className={`canvas-perf-overlay__state canvas-perf-overlay__state--${isCanvasMoving ? "moving" : "idle"}`}>
            {isCanvasMoving ? "moving" : "idle"}
          </span>
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
        <span className="canvas-perf-overlay__legend-item canvas-perf-overlay__legend-item--fps">fps</span>
        <span className="canvas-perf-overlay__legend-item canvas-perf-overlay__legend-item--frame">frame ms</span>
      </div>
      <div className="canvas-perf-overlay__stats">
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">FPS</span>
          <span className={`canvas-perf-overlay__value ${snapshot.fps >= 55 ? "canvas-perf-overlay__value--good" : snapshot.fps >= 30 ? "canvas-perf-overlay__value--warn" : "canvas-perf-overlay__value--bad"}`}>{Math.round(snapshot.fps)}</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Frame</span>
          <span className={`canvas-perf-overlay__value ${snapshot.frameMs <= 18 ? "canvas-perf-overlay__value--good" : snapshot.frameMs <= 33 ? "canvas-perf-overlay__value--warn" : "canvas-perf-overlay__value--bad"}`}>{roundMetric(snapshot.frameMs)} ms</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Dropped</span>
          <span className="canvas-perf-overlay__value">{snapshot.droppedFrames}</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Visible</span>
          <span className="canvas-perf-overlay__value">{visibleTileCount}/{totalTileCount}</span>
        </div>
        <div className="canvas-perf-overlay__divider" />
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Rendered</span>
          <span className="canvas-perf-overlay__value">{renderedTileCount}</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">DOM islands</span>
          <span className="canvas-perf-overlay__value">{promotedDomTileCount}</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Live embeds</span>
          <span className="canvas-perf-overlay__value">{activeEmbedTileCount}</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Move renders</span>
          <span className="canvas-perf-overlay__value">{snapshot.boardMovingRenderCount}</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Text measures</span>
          <span className="canvas-perf-overlay__value">{snapshot.textTileMeasurePassCount}</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Text writes</span>
          <span className="canvas-perf-overlay__value">{snapshot.textTileSizeWriteCount}</span>
        </div>
        <div className="canvas-perf-overlay__divider" />
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Save</span>
          <span className="canvas-perf-overlay__value">{roundMetric(snapshot.latestSaveMs)} ms</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Serialize</span>
          <span className="canvas-perf-overlay__value">{roundMetric(snapshot.latestSerializeMs)} ms</span>
        </div>
        <div className="canvas-perf-overlay__row">
          <span className="canvas-perf-overlay__label">Preview tiers</span>
          <span className="canvas-perf-overlay__value">t{previewTierCounts.thumbnail}/m{previewTierCounts.medium}/h{previewTierCounts.high}/o{previewTierCounts.original}</span>
        </div>
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
    canvasClipboard,
    redoWorkspaceChange,
    undoWorkspaceChange,
    workspace,
    commitWorkspaceChangeForPath,
    createNewCalendarCard,
    createNewChecklistCard,
    createNewCodeCard,
    createNewCounterCard,
    createNewDeadlineCard,
    createNewLinkCard,
    createNewNoteCard,
    createNewProgressCard,
    createNewRackCard,
    createNewStickerCard,
    createNewTableCard,
    createNewTextBoxCard,
    deleteExistingCard,
    replaceWorkspaceCards,
    reorderExistingCards,
    setCanvasClipboard,
    updateExistingCard,
    updateExistingCards,
  } = useAppContext();
  const { log } = useLog();
  const { toast } = useToast();
  const [cullingTick, setCullingTick] = useState(0);
  const [textBoxEditorState, setTextBoxEditorState] = useState(null);
  const [gridTileFilter, setGridTileFilter] = useState("all");
  const [stickerDragState, setStickerDragState] = useState(null);
  const [stickerPlacementStates, setStickerPlacementStates] = useState([]);
  const [animatingStickerTileIds, setAnimatingStickerTileIds] = useState([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isStopwatchOpen, setIsStopwatchOpen] = useState(false);
  const [canvasViewportSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });
  const textBoxEditRequestIdRef = useRef(0);
  const stickerDragStateRef = useRef(null);
  const stickerPlacementStatesRef = useRef([]);
  const stickerPlacementCleanupTimeoutsRef = useRef(new Map());
  const stickerAnimationTimeoutsRef = useRef(new Map());
  const isStickerDragging = stickerDragState !== null;
  const workspaceView = workspace.view ?? { mode: "flat" };
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
  useEffect(() => {
    const container = canvas.containerRef.current;
    if (!container) {
      return undefined;
    }

    const updateCanvasViewportSize = () => {
      setCanvasViewportSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateCanvasViewportSize();

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateCanvasViewportSize);
      observer.observe(container);
    }

    window.addEventListener("resize", updateCanvasViewportSize);
    return () => {
      observer?.disconnect?.();
      window.removeEventListener("resize", updateCanvasViewportSize);
    };
  }, [canvas]);
  const cameraIsMoving = canvas.isPanning || canvas.isZooming;
  const drawingTool = useDrawingTool({
    drawings: workspace.drawings,
    canvas,
    commitWorkspaceChange,
    enabled: !isGridMode,
  });
  const canvasToolMode = drawingTool.activeTool;
  const selectedCanvasToolMode = drawingTool.selectedTool;
  const isLineToolActive = drawingTool.isLineToolActive;
  const isTextToolActive = drawingTool.isTextToolActive;
  const setCanvasToolMode = drawingTool.handleToolModeChange;
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
    createNewCalendarCard,
    createNewChecklistCard,
    createNewCodeCard,
    createNewCounterCard,
    createNewDeadlineCard,
    createNewLinkCard,
    createNewNoteCard,
    createNewProgressCard,
    createNewRackCard,
    createNewStickerCard,
    createNewTableCard,
    createNewTextBoxCard,
    deleteExistingCard,
    replaceWorkspaceCards,
    reorderExistingCards,
    updateExistingCard,
    updateExistingCards,
    log,
    toast,
  });
  const recordStickerPipelineStage = useCallback((stage, detail = {}, level = "info") => {
    const payload = {
      stage,
      ...detail,
    };
    recordStickerDebug("pipeline-stage", payload);
    log(level, `Sticker pipeline ${stage}`, payload);
  }, [log]);

  useEffect(() => {
    stickerPlacementStatesRef.current = stickerPlacementStates;
  }, [stickerPlacementStates]);

  useEffect(() => () => {
    stickerPlacementCleanupTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    stickerPlacementCleanupTimeoutsRef.current.clear();
    stickerAnimationTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    stickerAnimationTimeoutsRef.current.clear();
  }, []);

  const markStickerPlacementStage = useCallback((tileId, stage, detail = {}, level = "info") => {
    if (!tileId || !stage) {
      return false;
    }

    let shouldRecord = false;

    setStickerPlacementStates((currentStates) => currentStates.map((entry) => {
      if (entry.tileId !== tileId || entry.stages?.[stage] === true) {
        return entry;
      }

      shouldRecord = true;
      return {
        ...entry,
        stages: {
          ...entry.stages,
          [stage]: true,
        },
      };
    }));

    if (!shouldRecord) {
      return false;
    }

    const placementEntry = stickerPlacementStatesRef.current.find((entry) => entry.tileId === tileId) ?? null;
    recordStickerPipelineStage(stage, {
      tileId,
      stickerId: placementEntry?.stickerId ?? null,
      label: placementEntry?.label ?? "",
      ...detail,
    }, level);
    return true;
  }, [recordStickerPipelineStage]);

  const registerStickerPlacement = useCallback((tile, sticker, worldPoint) => {
    if (!tile?.id) {
      return;
    }

    const cleanupTimeoutId = stickerPlacementCleanupTimeoutsRef.current.get(tile.id);
    if (cleanupTimeoutId) {
      window.clearTimeout(cleanupTimeoutId);
    }

    setStickerPlacementStates((currentStates) => [
      ...currentStates.filter((entry) => entry.tileId !== tile.id),
      {
        tileId: tile.id,
        stickerId: sticker?.id ?? null,
        label: tile?.title ?? sticker?.label ?? "Sticker",
        createdAt: Date.now(),
        stages: {
          created: true,
          normalized: false,
          "in-layout": false,
          "render-layer": false,
          animated: false,
        },
      },
    ]);

    const timeoutId = window.setTimeout(() => {
      const latestEntry = stickerPlacementStatesRef.current.find((entry) => entry.tileId === tile.id) ?? null;

      if (latestEntry) {
        const missingStages = Object.entries(latestEntry.stages)
          .filter(([, completed]) => completed !== true)
          .map(([stageName]) => stageName);

        if (missingStages.length > 0) {
          recordStickerDebug("verification-failed", {
            tileId: tile.id,
            stickerId: latestEntry.stickerId,
            missingStages,
          });
          log("warn", "Sticker verification failed", {
            tileId: tile.id,
            stickerId: latestEntry.stickerId,
            missingStages,
          });
        }
      }

      setStickerPlacementStates((currentStates) => currentStates.filter((entry) => entry.tileId !== tile.id));
      stickerPlacementCleanupTimeoutsRef.current.delete(tile.id);
    }, 1800);

    stickerPlacementCleanupTimeoutsRef.current.set(tile.id, timeoutId);
    recordStickerPipelineStage("created", {
      tileId: tile.id,
      stickerId: sticker?.id ?? null,
      label: tile?.title ?? sticker?.label ?? "Sticker",
      worldX: Math.round(worldPoint?.x ?? tile.x ?? 0),
      worldY: Math.round(worldPoint?.y ?? tile.y ?? 0),
    });
  }, [log, recordStickerPipelineStage]);

  const dropImport = useCanvasDropImport({
    canvas,
    commands,
    folderPath,
    log,
    resolveDropPoint: (capturedPayload) => {
      if (isGridMode) {
        return canvas.getViewportCenter();
      }

      return canvas.clientToWorldPoint(capturedPayload.clientPoint.x, capturedPayload.clientPoint.y);
    },
    toast,
  });

  const interactions = useCanvasInteractionSystem({
    cards: workspace.cards,
    canvas,
    commands,
    interactionMode: drawingTool.activeTool,
    resetKey: folderPath,
    snapSettings,
    suppressHoverUpdates: cameraIsMoving || isLineToolActive,
  });
  const resetTransientState = interactions.resetTransientState;

  useEffect(() => {
    stickerDragStateRef.current = stickerDragState;
  }, [stickerDragState]);

  useEffect(() => {
    if (!isStickerDragging) {
      return undefined;
    }

    const updateDragPosition = (event) => {
      const canvasElement = canvas.containerRef.current;
      const isOverCanvas = getStickerCanvasHoverState(
        canvasElement,
        event.clientX,
        event.clientY,
      );

      setStickerDragState((currentState) => (
        currentState
          ? {
            ...currentState,
            pointerX: event.clientX,
            pointerY: event.clientY,
            isOverCanvas,
          }
          : currentState
      ));
    };

    const finishDrag = (event) => {
      const canvasElement = canvas.containerRef.current;
      const isOverCanvas = getStickerCanvasHoverState(
        canvasElement,
        event.clientX,
        event.clientY,
      );
      const activeStickerDragState = stickerDragStateRef.current;
      const canvasRect = canvasElement?.getBoundingClientRect?.() ?? null;
      const debugDetail = {
        stickerId: activeStickerDragState?.sticker?.id ?? null,
        clientX: event.clientX,
        clientY: event.clientY,
        isOverCanvas,
        canvasRect: canvasRect ? {
          left: Math.round(canvasRect.left),
          top: Math.round(canvasRect.top),
          right: Math.round(canvasRect.right),
          bottom: Math.round(canvasRect.bottom),
        } : null,
      };

      recordStickerDebug("drop-attempt", debugDetail);
      log("info", "Sticker drop attempt", debugDetail);

      if (isOverCanvas) {
        const worldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);
        if (!activeStickerDragState) {
          recordStickerDebug("drop-missing-drag-state", {
            clientX: event.clientX,
            clientY: event.clientY,
          });
          log("warn", "Sticker drop ended without an active drag state");
          setStickerDragState(null);
          return;
        }

        const createdTile = commands.createSticker({
          ...activeStickerDragState.sticker,
          width: activeStickerDragState.width,
          height: activeStickerDragState.height,
        }, worldPoint);

        const createdTileDetail = {
          stickerId: activeStickerDragState.sticker?.id ?? null,
          tileId: createdTile?.id ?? null,
          worldX: Math.round(worldPoint.x),
          worldY: Math.round(worldPoint.y),
          previewWidth: activeStickerDragState.previewWidth,
          previewHeight: activeStickerDragState.previewHeight,
          naturalWidth: activeStickerDragState.width,
          naturalHeight: activeStickerDragState.height,
        };

        recordStickerDebug("drop-created", createdTileDetail);
        log("success", "Sticker drop created tile", createdTileDetail);
        registerStickerPlacement(createdTile, activeStickerDragState.sticker, worldPoint);
      } else if (activeStickerDragState) {
        const rejectionDetail = {
          stickerId: activeStickerDragState.sticker?.id ?? null,
          clientX: event.clientX,
          clientY: event.clientY,
          reason: "release-outside-canvas",
        };
        recordStickerDebug("drop-rejected", rejectionDetail);
        log("warn", "Sticker drop rejected", rejectionDetail);
      }

      setStickerDragState(null);
    };

    const handlePointerUp = (event) => {
      finishDrag(event);
    };

    const handlePointerCancel = () => {
      setStickerDragState(null);
    };

    window.addEventListener("pointermove", updateDragPosition);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", updateDragPosition);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [canvas, commands, isStickerDragging, log, registerStickerPlacement]);

  useEffect(() => {
    resetTransientState();
  }, [resetTransientState, workspaceView.mode]);

  useEffect(() => {
    setSnapSettings(normalizeCanvasSnapSettings(homeData?.uiState));
  }, [homeData?.uiState]);

  const buildCanvasClipboardPayload = useCallback((mode) => {
    if (interactions.selectedTileIds.length === 0) {
      return null;
    }

    const payload = createCanvasSelectionClipboardPayload(
      getWorkspaceActivePage(workspace),
      interactions.selectedTileIds,
    );

    if (!payload) {
      return null;
    }

    return {
      ...payload,
      mode,
      pasteCount: 0,
      sourceFilePath: currentEditor.filePath,
      sourcePageId: workspace.activePageId,
      sourceTileIds: [...interactions.selectedTileIds],
    };
  }, [currentEditor.filePath, interactions.selectedTileIds, workspace]);

  const copySelectedCanvasSelection = useCallback(() => {
    const payload = buildCanvasClipboardPayload("copy");

    if (!payload) {
      return false;
    }

    setCanvasClipboard(payload);

    log("info", "Copied selected canvas items", {
      tileCount: payload.tiles.length,
      edgeCount: payload.edges.length,
      groupCount: payload.groups.length,
    });
    toast("success", payload.tiles.length === 1 ? "1 item copied." : `${payload.tiles.length} items copied.`);
    return true;
  }, [buildCanvasClipboardPayload, log, setCanvasClipboard, toast]);

  const cutSelectedCanvasSelection = useCallback(() => {
    const payload = buildCanvasClipboardPayload("cut");

    if (!payload) {
      return false;
    }

    setCanvasClipboard(payload);

    log("info", "Cut selected canvas items", {
      tileCount: payload.tiles.length,
      edgeCount: payload.edges.length,
      groupCount: payload.groups.length,
    });
    toast("info", payload.tiles.length === 1 ? "1 item marked for cut." : `${payload.tiles.length} items marked for cut.`);
    return true;
  }, [buildCanvasClipboardPayload, log, setCanvasClipboard, toast]);

  const pasteCanvasSelection = useCallback((event = null) => {
    if (!canvasClipboard?.tiles?.length) {
      return false;
    }

    const nextPasteCount = Math.max(0, Number(canvasClipboard.pasteCount) || 0) + 1;
    const offset = 24 * nextPasteCount;
    const pastedSelection = pasteCanvasSelectionClipboardPayload(canvasClipboard, {
      offsetX: offset,
      offsetY: offset,
    });

    if (!pastedSelection?.tiles?.length) {
      return false;
    }

    if (event?.preventDefault) {
      event.preventDefault();
    }

    const isCutPaste = canvasClipboard.mode === "cut";
    const sourceFileMatches = canvasClipboard.sourceFilePath === currentEditor.filePath;
    const sourceTileIds = Array.isArray(canvasClipboard.sourceTileIds) ? canvasClipboard.sourceTileIds : [];

    if (isCutPaste && !sourceFileMatches) {
      commitWorkspaceChangeForPath(canvasClipboard.sourceFilePath, (current) => ({
        ...current,
        pages: current.pages.map((page) => (
          page.id === canvasClipboard.sourcePageId
            ? {
              ...page,
              cards: sourceTileIds.reduce((nextCards, tileId) => removeCard(nextCards, tileId), page.cards),
              edges: removeStructuredEntriesForTileIds(page.edges, sourceTileIds),
              groups: removeStructuredEntriesForTileIds(page.groups, sourceTileIds),
            }
            : page
        )),
      }));
    }

    commitWorkspaceChange((current) => {
      const activePage = getWorkspaceActivePage(current);

      return {
        ...current,
        activePageId: activePage.id,
        pages: current.pages.map((page) => {
          const isSourcePage = isCutPaste
            && sourceFileMatches
            && page.id === canvasClipboard.sourcePageId;
          const basePage = isSourcePage
            ? {
              ...page,
              cards: sourceTileIds.reduce((nextCards, tileId) => removeCard(nextCards, tileId), page.cards),
              edges: removeStructuredEntriesForTileIds(page.edges, sourceTileIds),
              groups: removeStructuredEntriesForTileIds(page.groups, sourceTileIds),
            }
            : page;

          if (page.id !== activePage.id) {
            return basePage;
          }

          return {
            ...basePage,
            cards: [...basePage.cards, ...pastedSelection.tiles],
            edges: [...(Array.isArray(basePage.edges) ? basePage.edges : []), ...pastedSelection.edges],
            groups: [...(Array.isArray(basePage.groups) ? basePage.groups : []), ...pastedSelection.groups],
          };
        }),
      };
    });

    setCanvasClipboard(
      canvasClipboard.mode === "cut"
        ? null
        : {
          ...canvasClipboard,
          pasteCount: nextPasteCount,
        },
    );
    interactions.replaceSelection(pastedSelection.newTileIds);
    interactions.closeContextMenu();

    log("info", "Pasted canvas items into active page", {
      tileCount: pastedSelection.tiles.length,
      edgeCount: pastedSelection.edges.length,
      groupCount: pastedSelection.groups.length,
      pageId: workspace.activePageId,
      pasteCount: nextPasteCount,
      mode: canvasClipboard.mode ?? "copy",
    });
    toast("success", pastedSelection.tiles.length === 1 ? "1 item pasted." : `${pastedSelection.tiles.length} items pasted.`);
    return true;
  }, [
    canvasClipboard,
    commitWorkspaceChange,
    commitWorkspaceChangeForPath,
    currentEditor.filePath,
    interactions,
    log,
    setCanvasClipboard,
    toast,
    workspace.activePageId,
  ]);

  const handleWorkspacePaste = useCallback(async (event) => {
    if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
      return;
    }

    if (pasteCanvasSelection(event)) {
      return;
    }

    await commands.pasteFromClipboard(event);
  }, [commands, pasteCanvasSelection]);

  useEffect(() => {
    document.addEventListener("paste", handleWorkspacePaste, true);
    return () => document.removeEventListener("paste", handleWorkspacePaste, true);
  }, [handleWorkspacePaste]);

  const cutSourceTileIdSet = useMemo(() => {
    if (
      canvasClipboard?.mode !== "cut"
      || canvasClipboard.sourceFilePath !== currentEditor.filePath
      || canvasClipboard.sourcePageId !== workspace.activePageId
    ) {
      return new Set();
    }

    return new Set(Array.isArray(canvasClipboard.sourceTileIds) ? canvasClipboard.sourceTileIds : []);
  }, [canvasClipboard, currentEditor.filePath, workspace.activePageId]);

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
  const selectedTextBoxTile = useMemo(() => {
    if (interactions.selectedTileIds.length !== 1) {
      return null;
    }

    const selectedTile = tileById[interactions.selectedTileIds[0]] ?? null;
    return selectedTile?.type === TEXT_BOX_CARD_TYPE ? selectedTile : null;
  }, [interactions.selectedTileIds, tileById]);
  const selectedPlainTextBoxTile = useMemo(() => (
    selectedTextBoxTile?.appearance === "sticky" ? null : selectedTextBoxTile
  ), [selectedTextBoxTile]);
  const requestTextBoxEdit = useCallback((tileId, options = {}) => {
    textBoxEditRequestIdRef.current += 1;
    setTextBoxEditorState({
      tileId,
      requestId: textBoxEditRequestIdRef.current,
      replacementText: typeof options.replacementText === "string" ? options.replacementText : null,
      selectAll: options.selectAll === true,
    });
  }, []);
  const clearTextBoxEditState = useCallback((tileId = null, options = {}) => {
    setTextBoxEditorState((current) => {
      if (!current) {
        return null;
      }

      if (tileId && current.tileId !== tileId) {
        return current;
      }

      return null;
    });
    if (options.restoreCanvasFocus && canvas.containerRef.current) {
      requestAnimationFrame(() => {
        canvas.containerRef.current?.focus?.({ preventScroll: true });
      });
    }
  }, [canvas]);
  const patchSelectedTextBoxStyle = useCallback((stylePatch) => {
    if (!selectedPlainTextBoxTile) {
      return;
    }

    updateExistingCard(selectedPlainTextBoxTile.id, {
      style: normalizeTextBoxStyle({
        ...(selectedPlainTextBoxTile.style ?? {}),
        ...stylePatch,
      }),
    });
  }, [selectedPlainTextBoxTile, updateExistingCard]);
  const beginTextBoxCreation = useCallback((worldPoint) => {
    const textBox = commands.createTextBox(worldPoint, {
      text: "Add text",
      placeholder: true,
      placeholderText: "Add text",
      style: {
        preset: "simple",
        fontSize: 32,
        fontWeight: 500,
        italic: false,
        underline: false,
        strike: false,
        align: "left",
        color: "#262626",
        lineHeight: 1.08,
        letterSpacing: 0,
      },
    });

    if (!textBox) {
      return false;
    }

    interactions.selectTile(textBox.id, { forceSingle: true });
    requestTextBoxEdit(textBox.id, { selectAll: true });
    return true;
  }, [commands, interactions, requestTextBoxEdit]);
  useEffect(() => {
    if (textBoxEditorState?.tileId && !tileById[textBoxEditorState.tileId]) {
      setTextBoxEditorState(null);
    }
  }, [textBoxEditorState, tileById]);
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
    if (isGridMode) {
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
  }, [isCanvasMoving, isGridMode]);

  useEffect(() => {
    setCanvasInteractionState?.(isCanvasMoving);
    return () => {
      setCanvasInteractionState?.(false);
    };
  }, [isCanvasMoving, setCanvasInteractionState]);

  const visibleWorldRect = useMemo(() => {
    if (isGridMode) {
      return null;
    }

    const zoom = Math.max(0.2, liveViewport.zoom);
    const overscan = isCanvasMoving
      ? Math.max(280, 440 / zoom)
      : Math.max(160, 220 / zoom);
    const cullingSampleOffset = cullingTick < 0 ? 1 : 0;

    return canvas.getVisibleWorldRect(overscan + cullingSampleOffset);
  }, [canvas, cullingTick, isCanvasMoving, isGridMode, liveViewport.zoom]);

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
  const stickerTileIdSet = useMemo(() => new Set(
    layout.rootTiles
      .filter((tile) => tile?.sourceType === "sticker")
      .map((tile) => tile.id),
  ), [layout.rootTiles]);
  const interactionOverlayTileIdSet = useMemo(() => new Set([
    ...interactions.selectedTileIds,
    ...(interactions.focusedTileId ? [interactions.focusedTileId] : []),
    ...interactions.draggingTileIds,
    ...(interactions.hoveredTileId ? [interactions.hoveredTileId] : []),
    ...(interactions.contextMenu?.kind === "tile" ? [interactions.contextMenu.card?.id] : []),
    ...(textBoxEditorState?.tileId ? [textBoxEditorState.tileId] : []),
    ...stickerTileIdSet,
  ]), [
    interactions.contextMenu,
    interactions.draggingTileIds,
    interactions.focusedTileId,
    interactions.hoveredTileId,
    interactions.selectedTileIds,
    stickerTileIdSet,
    textBoxEditorState?.tileId,
  ]);
  const workspaceLodLevel = useMemo(() => {
    if (isGridMode) {
      return WORKSPACE_LOD_LEVEL.NORMAL;
    }

    const visibleCount = layout.visibleTileCount ?? layout.rootTiles.length;
    return resolveWorkspaceLodLevel({
      viewportZoom: viewportZoomForRender,
      visibleTileCount: visibleCount,
      previousLevel: workspaceLodLevelRef.current,
    });
  }, [
    isGridMode,
    layout.rootTiles.length,
    layout.visibleTileCount,
    viewportZoomForRender,
  ]);

  useEffect(() => {
    workspaceLodLevelRef.current = workspaceLodLevel;
  }, [workspaceLodLevel]);

  const useSceneSurface = sceneSurfaceEnabled && !isGridMode;
  const stableTileMetaById = useMemo(() => {
    const previousCache = tileMetaCacheRef.current;
    const nextCache = new Map();
    const nextTileMetaById = {};

    layout.rootTiles.forEach((tile) => {
      const nextMeta = layout.tileMetaById[tile.id];
      const previousMeta = previousCache.get(tile.id);
      const nextMetaWithClipboardState = nextMeta
        ? {
          ...nextMeta,
          isClipboardCutSource: cutSourceTileIdSet.has(tile.id),
          styleVars: {
            ...(nextMeta.styleVars ?? {}),
            "--tile-clipboard-opacity": cutSourceTileIdSet.has(tile.id) ? "0.5" : "1",
          },
        }
        : nextMeta;
      const stableMeta = previousMeta && areTileMetaEquivalent(previousMeta, nextMetaWithClipboardState)
        ? previousMeta
        : nextMetaWithClipboardState;

      nextCache.set(tile.id, stableMeta);
      nextTileMetaById[tile.id] = stableMeta;
    });

    tileMetaCacheRef.current = nextCache;
    return nextTileMetaById;
  }, [cutSourceTileIdSet, layout.rootTiles, layout.tileMetaById]);
  const tileRenderHintsById = useMemo(() => {
    const previousCache = tileRenderHintCacheRef.current;
    const nextCache = new Map();
    const nextHints = {};

    layout.rootTiles.forEach((tile) => {
      const previousHint = previousCache.get(tile.id) ?? null;
      const nextHint = buildTileRenderHint({
        lodLevel: workspaceLodLevel,
        forceFullFidelity: interactionOverlayTileIdSet.has(tile.id),
        preferSpeed: isCanvasMoving,
        viewportZoom: viewportZoomForRender,
      });
      const stableHint = previousHint && areRenderHintsEqual(previousHint, nextHint)
        ? previousHint
        : nextHint;

      nextCache.set(tile.id, stableHint);
      nextHints[tile.id] = stableHint;
    });

    tileRenderHintCacheRef.current = nextCache;
    return nextHints;
  }, [interactionOverlayTileIdSet, isCanvasMoving, layout.rootTiles, viewportZoomForRender, workspaceLodLevel]);
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
  const activeRenderTiles = useMemo(() => (
    useSceneSurface ? overlayTiles : layout.rootTiles
  ), [layout.rootTiles, overlayTiles, useSceneSurface]);
  const promotedDomTileCount = activeRenderTiles.length;
  const activeEmbedTileCount = useMemo(() => (
    activeRenderTiles.filter((tile) => tile?.airpaste?.embed?.mode === "live" && typeof tile?.url === "string" && tile.url.trim().length > 0).length
  ), [activeRenderTiles]);
  const animatingStickerTileIdSet = useMemo(() => new Set(animatingStickerTileIds), [animatingStickerTileIds]);
  const presentWorkspaceCardsById = useMemo(() => new Map(
    workspace.cards.map((card) => [card.id, card]),
  ), [workspace.cards]);
  const layoutRootTileIdSet = useMemo(() => new Set(layout.rootTiles.map((tile) => tile.id)), [layout.rootTiles]);
  const activeRenderTileIdSet = useMemo(() => new Set(activeRenderTiles.map((tile) => tile.id)), [activeRenderTiles]);
  const decoratedTileMetaById = useMemo(() => {
    if (animatingStickerTileIdSet.size === 0) {
      return stableTileMetaById;
    }

    return Object.fromEntries(
      Object.entries(stableTileMetaById).map(([tileId, tileMeta]) => [
        tileId,
        animatingStickerTileIdSet.has(tileId)
          ? {
            ...tileMeta,
            isStickerPlacementAnimating: true,
          }
          : tileMeta,
      ]),
    );
  }, [animatingStickerTileIdSet, stableTileMetaById]);

  useEffect(() => {
    stickerPlacementStates.forEach((entry) => {
      const normalizedCard = presentWorkspaceCardsById.get(entry.tileId) ?? null;

      if (normalizedCard && entry.stages?.normalized !== true) {
        markStickerPlacementStage(entry.tileId, "normalized", {
          x: normalizedCard.x,
          y: normalizedCard.y,
          width: normalizedCard.width,
          height: normalizedCard.height,
        });
      }

      if (layoutRootTileIdSet.has(entry.tileId) && entry.stages?.["in-layout"] !== true) {
        markStickerPlacementStage(entry.tileId, "in-layout");
      }

      if (activeRenderTileIdSet.has(entry.tileId) && entry.stages?.["render-layer"] !== true) {
        const reachedRenderLayer = markStickerPlacementStage(entry.tileId, "render-layer", {
          surfaceRenderer: useSceneSurface ? "overlay" : "dom",
        });

        if (reachedRenderLayer && entry.stages?.animated !== true) {
          setAnimatingStickerTileIds((currentIds) => (
            currentIds.includes(entry.tileId) ? currentIds : [...currentIds, entry.tileId]
          ));
          markStickerPlacementStage(entry.tileId, "animated");

          const existingTimeoutId = stickerAnimationTimeoutsRef.current.get(entry.tileId);
          if (existingTimeoutId) {
            window.clearTimeout(existingTimeoutId);
          }

          const timeoutId = window.setTimeout(() => {
            setAnimatingStickerTileIds((currentIds) => currentIds.filter((tileId) => tileId !== entry.tileId));
            stickerAnimationTimeoutsRef.current.delete(entry.tileId);
          }, 520);

          stickerAnimationTimeoutsRef.current.set(entry.tileId, timeoutId);
        }
      }
    });
  }, [
    activeRenderTileIdSet,
    layoutRootTileIdSet,
    markStickerPlacementStage,
    presentWorkspaceCardsById,
    stickerPlacementStates,
    useSceneSurface,
  ]);

  const handleSceneTilePressStart = useCallback((tile, event) => {
    if (isTextToolActive && tile.type === TEXT_BOX_CARD_TYPE) {
      interactions.selectTile(tile.id, { forceSingle: true });
      requestTextBoxEdit(tile.id, { selectAll: false });
      return true;
    }

    return interactions.handleTilePressStart(tile, event);
  }, [interactions, isTextToolActive, requestTextBoxEdit]);

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
    if (textBoxEditorState?.tileId && event.button === 0) {
      return;
    }

    if (selectedPlainTextBoxTile && isTextToolActive && event.button === 0) {
      interactions.handleCanvasPointerDown(event);
      return;
    }

    if (isTextToolActive && event.button === 0) {
      const worldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);

      if (beginTextBoxCreation(worldPoint)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    interactions.handleCanvasPointerDown(event);
  }, [beginTextBoxCreation, canvas, interactions, isTextToolActive, selectedPlainTextBoxTile, textBoxEditorState?.tileId]);

  useEffect(() => {
    if (
      interactions.draggingTileIds.length === 0
      || canvasClipboard?.mode !== "cut"
      || canvasClipboard.sourceFilePath !== currentEditor.filePath
      || canvasClipboard.sourcePageId !== workspace.activePageId
    ) {
      return;
    }

    if (interactions.draggingTileIds.some((tileId) => cutSourceTileIdSet.has(tileId))) {
      setCanvasClipboard(null);
    }
  }, [
    canvasClipboard,
    currentEditor.filePath,
    cutSourceTileIdSet,
    interactions.draggingTileIds,
    setCanvasClipboard,
    workspace.activePageId,
  ]);

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

      return {
        ...(currentView ?? {}),
        mode: "flat",
      };
    });
  }, [setWorkspaceView]);

  useEffect(() => {
    function handleKeyDown(event) {
      const activeElement = document.activeElement;
      const typingTarget = isTypingTarget(event.target) || isTypingTarget(activeElement);
      const activeElementIsEditable = typingTarget;
      const activeElementIsCanvas = activeElement === canvas.containerRef.current;
      const canvasToolShortcutContext = activeElementIsCanvas
        || activeElement === document.body
        || activeElement === document.documentElement;
      const activeKey = event.key.toLowerCase();

      if (activeElementIsEditable) {
        return;
      }

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

      if (canvasToolShortcutContext && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
        if (activeKey === "v") {
          event.preventDefault();
          setCanvasToolMode(DRAWING_TOOL_MODE_SELECT);
          return;
        }

        if (activeKey === "h") {
          event.preventDefault();
          setCanvasToolMode(DRAWING_TOOL_MODE_HAND);
          return;
        }

        if (activeKey === "t") {
          event.preventDefault();
          setCanvasToolMode(DRAWING_TOOL_MODE_TEXT);
          return;
        }

        if (activeKey === "s") {
          event.preventDefault();
          const sticky = commands.createSticky();

          if (sticky) {
            interactions.selectTile(sticky.id, { forceSingle: true });
            requestTextBoxEdit(sticky.id, { selectAll: false });
          }
          return;
        }
      }

      if (
        selectedPlainTextBoxTile
        && canvasToolShortcutContext
        && activeElementIsCanvas
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !event.isComposing
        && !isCanvasMoving
        && !isLineToolActive
        && !interactions.contextMenu
        && !interactions.marqueeBox
      ) {
        if (event.key === "Enter") {
          event.preventDefault();
          requestTextBoxEdit(selectedPlainTextBoxTile.id, { selectAll: false });
          return;
        }

        if (isPrintableTextKey(event) && !["v", "h", "t", "s"].includes(activeKey)) {
          event.preventDefault();
          requestTextBoxEdit(selectedPlainTextBoxTile.id, {
            replacementText: event.key,
            selectAll: false,
          });
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "c") {
        if (interactions.selectedTileIds.length > 0) {
          event.preventDefault();
          copySelectedCanvasSelection();
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "x") {
        if (interactions.selectedTileIds.length > 0) {
          event.preventDefault();
          cutSelectedCanvasSelection();
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "v") {
        if (pasteCanvasSelection(event)) {
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
        canvas.zoomIn();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        canvas.zoomOut();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        canvas.setZoom(1);
        return;
      }

      if (event.shiftKey && event.key === "1") {
        event.preventDefault();
        zoomToFitAll();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canvas,
    canRedo,
    canUndo,
    commands,
    interactions,
    clearDraftLine,
    copySelectedCanvasSelection,
    cutSelectedCanvasSelection,
    deleteSelectedDrawingObject,
    isLineToolActive,
    isTextToolActive,
    setCanvasToolMode,
    isCanvasMoving,
    pasteCanvasSelection,
    requestTextBoxEdit,
    redoWorkspaceChange,
    selectedPlainTextBoxTile,
    undoWorkspaceChange,
    zoomToFitAll,
  ]);

  const totalTileCount = workspace.cards.length;
  const visibleTileCount = layout.visibleTileCount ?? layout.rootTiles.length;
  const renderedTileCount = layout.rootTiles.length;
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
    selectedCount: interactions.selectedTileIds.length,
    hoveredTileId: interactions.hoveredTileId,
    focusedTileId: interactions.focusedTileId,
    draggingCount: interactions.draggingTileIds.length,
    promotedDomTileCount,
    activeEmbedTileCount,
    dragVisualDelta: interactions.dragVisualDelta
      ? `${Math.round(interactions.dragVisualDelta.x)}:${Math.round(interactions.dragVisualDelta.y)}`
      : null,
    rackPreview: interactions.rackDropPreview?.rackId ?? null,
    marqueeActive: Boolean(interactions.marqueeBox),
    isPanning: canvas.isPanning,
    isDropTarget: dropImport.isDropTarget,
    snapEnabled: snapSettings.enabled,
  }), [
    canvas.isPanning,
    dropImport.isDropTarget,
    filteredTiles.length,
    activeEmbedTileCount,
    interactions.draggingTileIds.length,
    interactions.dragVisualDelta,
    interactions.focusedTileId,
    interactions.hoveredTileId,
    interactions.marqueeBox,
    interactions.rackDropPreview?.rackId,
    interactions.selectedTileIds.length,
    liveViewport.x,
    liveViewport.y,
    liveViewport.zoom,
    promotedDomTileCount,
    renderedTileCount,
    snapSettings.enabled,
    visibleTileCount,
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
      promotedDomTileCount,
      activeEmbedTileCount,
    });
  }, [
    activeEmbedTileCount,
    interactions.draggingTileIds.length,
    lodLevelCounts,
    performanceMode,
    promotedDomTileCount,
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

  const toggleCalculator = useCallback(() => {
    setIsStopwatchOpen(false);
    setIsCalculatorOpen((currentValue) => !currentValue);
  }, []);

  const toggleStopwatch = useCallback(() => {
    setIsCalculatorOpen(false);
    setIsStopwatchOpen((currentValue) => !currentValue);
  }, []);

  const radialMenu = interactions.contextMenu;
  const recoverablePreviewTiles = useMemo(
    () => workspace.cards.filter((card) => shouldRecoverLinkPreviewCard(card)),
    [workspace.cards],
  );
  const activeContextTile = radialMenu?.kind === "tile"
    ? (tileById[radialMenu.card?.id] ?? radialMenu.card ?? null)
    : null;
  const isCodeContextTile = activeContextTile?.type === CODE_CARD_TYPE;
  const isCounterContextTile = activeContextTile?.type === COUNTER_CARD_TYPE;
  const isDeadlineContextTile = activeContextTile?.type === DEADLINE_CARD_TYPE;
  const isProgressContextTile = activeContextTile?.type === PROGRESS_CARD_TYPE;
  const isTextBoxContextTile = activeContextTile?.type === TEXT_BOX_CARD_TYPE;
  const canShowRefreshPreviewAction = canRefreshLinkPreviewCard(activeContextTile)
    || isBookmarkLinkCard(activeContextTile);
  const canCopyPreviewDiagnostics = LINK_PREVIEW_DEBUG_ACTIONS_ENABLED
    && (
      isBookmarkLinkCard(activeContextTile)
      || isCodeContextTile
      || isCounterContextTile
      || isDeadlineContextTile
      || isProgressContextTile
      || isTextBoxContextTile
    );
  const canCopyPreviewCodexReport = LINK_PREVIEW_DEBUG_ACTIONS_ENABLED
    && (
      isBookmarkLinkCard(activeContextTile)
      || isCodeContextTile
      || isCounterContextTile
      || isDeadlineContextTile
      || isProgressContextTile
      || isTextBoxContextTile
    );

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
      const payload = isCodeContextTile
        ? buildCodeTileDiagnosticsExport(activeContextTile)
        : isCounterContextTile
          ? buildCounterTileDiagnosticsExport(activeContextTile)
          : isDeadlineContextTile
            ? buildDeadlineTileDiagnosticsExport(activeContextTile)
            : isProgressContextTile
              ? buildProgressTileDiagnosticsExport(activeContextTile)
              : isTextBoxContextTile
                ? buildTextBoxTileDiagnosticsExport(activeContextTile)
          : buildPreviewDiagnosticsExport(activeContextTile);
      await copyTextToClipboard(JSON.stringify(payload, null, 2));
      toast("success", "Preview diagnostics copied");
      return true;
    } catch (error) {
      log("error", "Copy preview diagnostics failed", error?.message || "Could not copy preview diagnostics.");
      toast("error", "Could not copy preview diagnostics");
      return false;
    }
  }, [activeContextTile, canCopyPreviewDiagnostics, isCodeContextTile, isCounterContextTile, isDeadlineContextTile, isProgressContextTile, isTextBoxContextTile, log, toast]);

  const handleCopyPreviewCodexReport = useCallback(async () => {
    if (!canCopyPreviewCodexReport || !activeContextTile) {
      return false;
    }

    try {
      const report = isCodeContextTile
        ? buildCodeTileCodexReport(activeContextTile)
        : isCounterContextTile
          ? buildCounterTileCodexReport(activeContextTile)
          : isDeadlineContextTile
            ? buildDeadlineTileCodexReport(activeContextTile)
            : isProgressContextTile
              ? buildProgressTileCodexReport(activeContextTile)
              : isTextBoxContextTile
                ? buildTextBoxTileCodexReport(activeContextTile)
          : buildPreviewCodexReport(activeContextTile);
      await copyTextToClipboard(report);
      toast("success", "Codex report copied");
      return true;
    } catch (error) {
      log("error", "Copy Codex report failed", error?.message || "Could not copy Codex report.");
      toast("error", "Could not copy Codex report");
      return false;
    }
  }, [activeContextTile, canCopyPreviewCodexReport, isCodeContextTile, isCounterContextTile, isDeadlineContextTile, isProgressContextTile, isTextBoxContextTile, log, toast]);

  const contextMenuActions = useMemo(() => buildRadialMenuActions({
    menu: radialMenu,
    snapEnabled: snapSettings.enabled,
    deleteDisabled: (radialMenu?.selectionIds?.length ?? 0) === 0,
    failedPreviewRefreshCount: radialMenu?.kind === "canvas" ? recoverablePreviewTiles.length : 0,
    showSinglePreviewRefresh: radialMenu?.kind === "tile" && canShowRefreshPreviewAction,
    showCopyPreviewDiagnostics: radialMenu?.kind === "tile" && canCopyPreviewDiagnostics,
    showCopyCodexReport: radialMenu?.kind === "tile" && canCopyPreviewCodexReport,
    singlePreviewRefreshDisabled: !canRefreshLinkPreviewCard(activeContextTile),
    handlers: {
      onCopyCodexReport: handleCopyPreviewCodexReport,
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
    handleCopyPreviewCodexReport,
    handleCopyPreviewDiagnostics,
    handleRefreshFailedPreviews,
    handleRefreshTilePreview,
    canCopyPreviewCodexReport,
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
          <div className="canvas-win-strip">
            <GridViewFilterToggle value={gridTileFilter} onChange={setGridTileFilter} />
            <WorkspaceViewToggle mode={workspaceView.mode} onChange={updateWorkspaceMode} />
            <CanvasAddMenu
              commands={commands}
              disabled={!folderPath || folderLoading}
            />
          </div>
        </div>
        <WorkspaceTopbarTrail />
        <GridWorkspaceView
          dropImport={dropImport}
          tileFilter={gridTileFilter}
          isDropTarget={dropImport.isDropTarget}
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
            zoom={viewportZoomForRender}
            canFitAll={Boolean(layout.allTilesBounds)}
            canFitSelection={Boolean(layout.selectedTilesBounds)}
            onZoomIn={canvas.zoomIn}
            onZoomOut={canvas.zoomOut}
            onZoomToFitAll={zoomToFitAll}
            onZoomToFitSelection={zoomToFitSelection}
            onSetZoom={canvas.setZoom}
          />
        </div>,
        document.getElementById("titlebar-right-slot") || document.body
      )}

      {createPortal(
        <div className="canvas-stage__fab">
          <div className="canvas-win-strip">
            <WorkspaceViewToggle mode={workspaceView.mode} onChange={updateWorkspaceMode} />
            <DrawingToolControls
              activeTool={selectedCanvasToolMode}
              iconOnly
              onToolChange={setCanvasToolMode}
            />
          </div>
          <CanvasDock
            commands={commands}
            disabled={!folderPath || folderLoading}
            isCalculatorOpen={isCalculatorOpen}
            isStopwatchOpen={isStopwatchOpen}
            onToggleCalculator={toggleCalculator}
            onToggleStopwatch={toggleStopwatch}
          />
        </div>,
        document.body
      )}
      {selectedPlainTextBoxTile ? (
        <TextFormattingToolbar
          card={selectedPlainTextBoxTile}
          onPatchStyle={patchSelectedTextBoxStyle}
        />
      ) : null}
      <CanvasStopwatch isOpen={isStopwatchOpen} />
      <CanvasCalculator isOpen={isCalculatorOpen} />

      {/* ── Top bar ── */}
      <WorkspaceTopbarTrail />

      {/* ── Canvas board ── */}
      <div
        ref={canvas.containerRef}
        id="canvas-board"
        className={`canvas canvas--tool-${canvasToolMode}${interactions.marqueeBox ? " canvas--selecting" : ""}${dropImport.isDropTarget ? " canvas--drop-target" : ""}${isCanvasMoving ? " canvas--moving" : ""}`}
        tabIndex={-1}
        onDragEnter={dropImport.handleDragEnter}
        onDragOver={dropImport.handleDragOver}
        onDragLeave={dropImport.handleDragLeave}
        onDrop={(event) => { void dropImport.handleDrop(event); }}
        onPointerDownCapture={(event) => {
          if (event.button === 1) {
            interactions.handleCanvasPointerDown(event);
          }
        }}
        onPointerDown={(event) => {
          if (useSceneSurface) {
            return;
          }

          const isCanvasBackground = event.target === event.currentTarget
            || event.target.classList?.contains("canvas__content")
            || event.target.classList?.contains("canvas__grid");

          if (textBoxEditorState?.tileId && isCanvasBackground && event.button === 0) {
            return;
          }

          if (selectedPlainTextBoxTile && isTextToolActive && isCanvasBackground && event.button === 0) {
            interactions.handleCanvasPointerDown(event);
            return;
          }

          if (isTextToolActive && isCanvasBackground && event.button === 0) {
            const worldPoint = canvas.clientToWorldPoint(event.clientX, event.clientY);

            if (beginTextBoxCreation(worldPoint)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
          }

          interactions.handleCanvasPointerDown(event);
        }}
        onContextMenu={useSceneSurface ? undefined : interactions.handleCanvasContextMenu}
        onClick={(event) => {
          if (!isEditableElement(event.target)) {
            event.currentTarget.focus({ preventScroll: true });
          }
        }}
        >
          <CanvasMiniMap canvas={canvas} tiles={filteredTiles} hidden={isGridMode} />
          <>
            <div ref={canvas.gridRef} className="canvas__grid" />
            {useSceneSurface ? (
              <SceneWorkspaceSurface
                folderPath={folderPath}
                tiles={sceneTiles}
                edges={workspace.edges}
                groups={workspace.groups}
                tileMetaById={decoratedTileMetaById}
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
            {useSceneSurface ? (
              <CanvasEmbedLayer
                cards={overlayTiles}
                tileMetaById={decoratedTileMetaById}
                viewport={liveViewport}
                canvasSize={canvasViewportSize}
                isCanvasMoving={isCanvasMoving}
              />
            ) : null}
            <div
              ref={canvas.contentRef}
              className={`canvas__content${useSceneSurface ? " canvas__content--overlay" : ""}`}
            >
              {activeRenderTiles.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  tileMeta={decoratedTileMetaById[card.id]}
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
                  canvasToolMode={canvasToolMode}
                  textBoxEditorState={textBoxEditorState?.tileId === card.id ? textBoxEditorState : null}
                  onRequestTextBoxEdit={requestTextBoxEdit}
                  onEndTextBoxEdit={clearTextBoxEditState}
                />
              ))}
            </div>
          </>
        

        {interactions.marqueeBox ? (
          <div className="canvas__marquee" style={interactions.marqueeStyleVars} />
        ) : null}
        <CanvasPerformanceOverlay
          visibleTileCount={visibleTileCount}
          renderedTileCount={renderedTileCount}
          totalTileCount={totalTileCount}
          activeDragLayers={interactions.draggingTileIds.length}
          promotedDomTileCount={promotedDomTileCount}
          activeEmbedTileCount={activeEmbedTileCount}
          isCanvasMoving={isCanvasMoving}
          workspaceLodLevel={workspaceLodLevel}
          lodLevelCounts={lodLevelCounts}
          previewTierCounts={previewTierCounts}
        />

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
      {stickerDragState ? (
        <div
          className={`sticker-drag-preview${stickerDragState.isOverCanvas ? " sticker-drag-preview--over-canvas" : ""}`}
          style={{
            left: `${stickerDragState.pointerX}px`,
            top: `${stickerDragState.pointerY}px`,
            width: `${stickerDragState.previewWidth ?? 96}px`,
            height: `${stickerDragState.previewHeight ?? 96}px`,
            "--sticker-drag-rotation": `${stickerDragState.rotation}deg`,
          }}
          aria-hidden="true"
        >
          <img
            className="sticker-drag-preview__image"
            src={stickerDragState.sticker.src}
            alt=""
            draggable={false}
          />
        </div>
      ) : null}
    </main>
  );
}

