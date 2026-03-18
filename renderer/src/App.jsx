import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Card from "./components/Card";
import { DevConsole } from "./components/DevConsole";
import NoteMagnifier from "./components/notes/NoteMagnifier";
import TileContextMenu from "./components/TileContextMenu";
import { ToastStack } from "./components/ToastStack";
import { useAppContext } from "./context/useAppContext";
import { useCanvas } from "./hooks/useCanvas";
import { useLog } from "./hooks/useLog";
import { useToast } from "./hooks/useToast";
import {
  isEditableElement,
  isUrl,
  NOTE_FOLDER_CARD_TYPE,
  NOTE_STYLE_ONE,
  NOTE_STYLE_TWO,
  NOTE_STYLE_THREE,
} from "./lib/workspace";
import { filterTiles } from "./utils/searchTiles";

const IMAGE_CARD_PORTRAIT_MAX_WIDTH = 320;
const IMAGE_CARD_PORTRAIT_MAX_HEIGHT = 540;
const IMAGE_CARD_SQUARE_MAX_WIDTH = 340;
const IMAGE_CARD_SQUARE_MAX_HEIGHT = 380;
const IMAGE_CARD_LANDSCAPE_MAX_WIDTH = 420;
const IMAGE_CARD_LANDSCAPE_MAX_HEIGHT = 320;
const IMAGE_CARD_MIN_WIDTH = 180;
const IMAGE_CARD_MIN_HEIGHT = 140;
const MARQUEE_DRAG_THRESHOLD = 6;
const NOTE_FOLDER_HOVER_DELAY_MS = 2000;

function folderNameFromPath(folderPath) {
  if (!folderPath) return "No folder";
  const segments = folderPath.split(/[\\/]/);
  return segments[segments.length - 1] || folderPath;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Unable to read pasted image."));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error("Unable to decode pasted image."));
    image.src = src;
  });
}

async function readClipboardImage(clipboardData) {
  const imageItem = Array.from(clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));

  if (!imageItem) {
    return null;
  }

  const file = imageItem.getAsFile();

  if (!file) {
    return null;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await getImageDimensions(dataUrl);

  return {
    dataUrl,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function getImageCardSize(width, height, previewKind = "default") {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {
      width: 340,
      height: 280,
    };
  }

  if (previewKind === "music") {
    const side = Math.max(
      IMAGE_CARD_MIN_WIDTH,
      Math.min(IMAGE_CARD_SQUARE_MAX_WIDTH, Math.round(Math.min(width, height))),
    );

    return {
      width: side,
      height: side,
    };
  }

  const aspectRatio = width / height;
  const bounds = aspectRatio < 0.9
    ? {
      maxWidth: IMAGE_CARD_PORTRAIT_MAX_WIDTH,
      maxHeight: IMAGE_CARD_PORTRAIT_MAX_HEIGHT,
    }
    : aspectRatio > 1.18
      ? {
        maxWidth: IMAGE_CARD_LANDSCAPE_MAX_WIDTH,
        maxHeight: IMAGE_CARD_LANDSCAPE_MAX_HEIGHT,
      }
      : {
        maxWidth: IMAGE_CARD_SQUARE_MAX_WIDTH,
        maxHeight: IMAGE_CARD_SQUARE_MAX_HEIGHT,
      };

  let scale = Math.min(
    bounds.maxWidth / width,
    bounds.maxHeight / height,
    1,
  );

  let nextWidth = width * scale;
  let nextHeight = height * scale;

  if (nextWidth < IMAGE_CARD_MIN_WIDTH && nextHeight < IMAGE_CARD_MIN_HEIGHT) {
    const upscale = Math.max(
      IMAGE_CARD_MIN_WIDTH / nextWidth,
      IMAGE_CARD_MIN_HEIGHT / nextHeight,
    );

    nextWidth *= upscale;
    nextHeight *= upscale;
  }

  return {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
  };
}

function isSelectionModifierPressed(event) {
  return event.ctrlKey || event.metaKey;
}

function normalizeRect(startX, startY, endX, endY) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const right = Math.max(startX, endX);
  const bottom = Math.max(startY, endY);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function rectsIntersect(leftRect, rightRect) {
  return !(
    leftRect.right < rightRect.left
    || leftRect.left > rightRect.right
    || leftRect.bottom < rightRect.top
    || leftRect.top > rightRect.bottom
  );
}

function getCardRect(card) {
  return {
    left: card.x,
    top: card.y,
    right: card.x + card.width,
    bottom: card.y + card.height,
    width: card.width,
    height: card.height,
  };
}

function getIntersectionArea(leftRect, rightRect) {
  const width = Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
  const height = Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);

  if (width <= 0 || height <= 0) {
    return 0;
  }

  return width * height;
}

function pointInsideCard(point, card) {
  return point.x >= card.x
    && point.x <= card.x + card.width
    && point.y >= card.y
    && point.y <= card.y + card.height;
}

function isNoteFolderMergeCandidate(card) {
  return card?.type === "text" || card?.type === NOTE_FOLDER_CARD_TYPE;
}

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconChecklistNote() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8 9 1.4 1.4L12 7.8" />
      <path d="m8 15 1.4 1.4L12 13.8" />
      <line x1="14" y1="9" x2="17" y2="9" />
      <line x1="14" y1="15" x2="17" y2="15" />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 8H6.8A2.8 2.8 0 0 0 4 10.8V14a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3V8.8A2.8 2.8 0 0 0 8.2 6H8" />
      <path d="M20 8h-3.2A2.8 2.8 0 0 0 14 10.8V14a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3V8.8A2.8 2.8 0 0 0 18.2 6H18" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect y="4.5" width="10" height="1" rx="0.5" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default function App() {
  const usesCustomTitlebar = window.electronAPI?.usesCustomTitlebar === true;
  const [searchQuery, setSearchQuery] = useState("");
  const {
    booting,
    createNewLinkCard,
    error,
    deleteExistingCard,
    folderLoading,
    folderPath,
    openFolder,
    setError,
    workspace,
    setViewport,
    createNewTextCard,
    mergeExistingNoteCardIntoFolder,
    updateExistingCard,
    updateExistingCards,
  } = useAppContext();

  const { log } = useLog();
  const { toast } = useToast();

  const {
    containerRef,
    getViewportCenter,
    handleCanvasPointerDown,
    handleCanvasWheel,
  } = useCanvas({
    viewport: workspace.viewport,
    onViewportChange: setViewport,
  });
  const dragStateRef = useRef(null);
  const cardsRef = useRef(workspace.cards);
  const mergeIntentRef = useRef(null);
  const marqueeStateRef = useRef(null);
  const searchInputRef = useRef(null);
  const contextMenuRef = useRef(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [contextMenu, setContextMenu] = useState(null);
  const [mergeTargetCardId, setMergeTargetCardId] = useState(null);
  const [magnifiedNoteState, setMagnifiedNoteState] = useState(null);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [marqueeBox, setMarqueeBox] = useState(null);

  const clearMergeIntent = useCallback(() => {
    if (mergeIntentRef.current?.timeoutId) {
      window.clearTimeout(mergeIntentRef.current.timeoutId);
    }

    mergeIntentRef.current = null;
    setMergeTargetCardId(null);
  }, []);

  useEffect(() => {
    cardsRef.current = workspace.cards;
  }, [workspace.cards]);

  useEffect(() => {
    if (error) {
      log("error", error);
      toast("error", error);
      setError("");
    }
  }, [error, log, toast, setError]);

  useEffect(() => {
    setSearchQuery("");
  }, [folderPath]);

  useEffect(() => {
    setContextMenu(null);
  }, [folderPath]);

  useEffect(() => {
    setSelectedCardIds([]);
    setMarqueeBox(null);
    marqueeStateRef.current = null;
    dragStateRef.current = null;
    clearMergeIntent();
    setMagnifiedNoteState(null);
  }, [clearMergeIntent, folderPath]);

  useEffect(() => {
    if (!magnifiedNoteState) {
      return;
    }

    const noteStillExists = workspace.cards.some((card) => card.id === magnifiedNoteState.cardId && card.type === "text");

    if (!noteStillExists) {
      setMagnifiedNoteState(null);
    }
  }, [magnifiedNoteState, workspace.cards]);

  const selectedCardIdSet = useMemo(() => new Set(selectedCardIds), [selectedCardIds]);

  const clientToWorldPoint = useCallback((clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: (clientX - rect.left - workspace.viewport.x) / workspace.viewport.zoom,
      y: (clientY - rect.top - workspace.viewport.y) / workspace.viewport.zoom,
    };
  }, [containerRef, workspace.viewport.x, workspace.viewport.y, workspace.viewport.zoom]);

  const clientToCanvasPoint = useCallback((clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, [containerRef]);

  const focusSearchInput = useCallback(() => {
    const input = searchInputRef.current;

    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      const activeElement = document.activeElement;
      const editingAnotherField = isEditableElement(activeElement) && activeElement !== searchInputRef.current;

      if (event.key === "Escape" && contextMenu) {
        event.preventDefault();
        setContextMenu(null);
        return;
      }

      if (editingAnotherField) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearchInput();
        return;
      }

      if (event.key === "Escape" && activeElement === searchInputRef.current) {
        event.preventDefault();

        if (searchQuery) {
          setSearchQuery("");
        } else {
          searchInputRef.current.blur();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu, focusSearchInput, searchQuery]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    function closeOnPointerDown(event) {
      if (contextMenuRef.current?.contains(event.target)) {
        return;
      }

      setContextMenu(null);
    }

    function closeOnWindowChange() {
      setContextMenu(null);
    }

    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("resize", closeOnWindowChange);
    window.addEventListener("blur", closeOnWindowChange);
    window.addEventListener("wheel", closeOnWindowChange, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("resize", closeOnWindowChange);
      window.removeEventListener("blur", closeOnWindowChange);
      window.removeEventListener("wheel", closeOnWindowChange);
    };
  }, [contextMenu]);

  const triggerPreview = useCallback(async (card) => {
    log("info", "Fetching link preview...", { url: card.url, cardId: card.id });
    try {
      await window.airpaste.fetchLinkPreview(folderPath, card.id, card.url, card);
      log("success", `Preview queued for "${card.url}"`);
    } catch (previewError) {
      const msg = previewError.message || "Unable to fetch preview metadata.";
      updateExistingCard(card.id, { status: "failed" });
      log("error", `Preview failed for "${card.url}"`, msg);
      toast("error", `Preview failed: ${msg}`);
    }
  }, [folderPath, log, toast, updateExistingCard]);

  useEffect(() => {
    async function handlePaste(event) {
      if (isEditableElement(document.activeElement)) return;

      const clipboardData = event.clipboardData;
      const text = clipboardData?.getData("text/plain")?.trim() ?? "";

      if (!folderPath) {
        if (!text && !Array.from(clipboardData?.items ?? []).some((item) => item.type.startsWith("image/"))) {
          return;
        }

        event.preventDefault();
        log("warn", "Paste blocked because no folder is open");
        toast("warn", "Open a folder first so AirPaste knows where to save the board.");
        return;
      }

      const centerPoint = getViewportCenter();

      try {
        const pastedImage = await readClipboardImage(clipboardData);

        if (pastedImage?.dataUrl) {
          event.preventDefault();

          const imageCard = createNewLinkCard(pastedImage.dataUrl, centerPoint);
          const imageCardSize = getImageCardSize(pastedImage.width, pastedImage.height);

          updateExistingCard(imageCard.id, {
            url: pastedImage.dataUrl,
            title: "Pasted image",
            description: "",
            image: pastedImage.dataUrl,
            siteName: "Image",
            status: "ready",
            width: imageCardSize.width,
            height: imageCardSize.height,
          });

          log("success", "Pasted image into canvas center", {
            width: pastedImage.width,
            height: pastedImage.height,
            centerPoint,
          });
          toast("success", "Image dropped into the center of the canvas.");
          return;
        }
      } catch (pasteError) {
        event.preventDefault();
        const message = pasteError?.message || "Unable to paste that image.";
        log("error", "Image paste failed", message);
        toast("error", message);
        return;
      }

      if (!text) {
        return;
      }

      event.preventDefault();

      if (isUrl(text)) {
        log("info", "Pasted URL into canvas center", { url: text, centerPoint });
        const card = createNewLinkCard(text, centerPoint);
        toast("info", "Link pasted into the center. Fetching preview...");
        void triggerPreview(card);
        return;
      }

      log("success", "Pasted text note into canvas center", { length: text.length, centerPoint });
      createNewTextCard(text, centerPoint);
      toast("success", "Text note dropped into the center of the canvas.");
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [
    createNewLinkCard,
    createNewTextCard,
    folderPath,
    getViewportCenter,
    log,
    toast,
    triggerPreview,
    updateExistingCard,
  ]);

  const handleCanvasBoardPointerDown = useCallback((event) => {
    const isCanvasBackground = event.target === event.currentTarget
      || event.target.classList?.contains("canvas__content");

    if (event.button !== 0 || !isCanvasBackground) {
      return;
    }

    if (isSelectionModifierPressed(event)) {
      event.preventDefault();
      event.stopPropagation();

      const startCanvasPoint = clientToCanvasPoint(event.clientX, event.clientY);

      marqueeStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
      };

      setMarqueeBox({
        x: startCanvasPoint.x,
        y: startCanvasPoint.y,
        width: 0,
        height: 0,
      });

      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    if (selectedCardIds.length > 0) {
      setSelectedCardIds([]);
    }

    handleCanvasPointerDown(event);
  }, [clientToCanvasPoint, handleCanvasPointerDown, selectedCardIds.length]);

  const handleCardMediaLoad = useCallback((card, mediaWidth, mediaHeight) => {
    if (!card?.id || !card.image) {
      return;
    }

    const nextSize = getImageCardSize(mediaWidth, mediaHeight, card.previewKind);

    if (
      Math.abs(card.width - nextSize.width) <= 1
      && Math.abs(card.height - nextSize.height) <= 1
    ) {
      return;
    }

    updateExistingCard(card.id, {
      width: nextSize.width,
      height: nextSize.height,
    });
  }, [updateExistingCard]);

  const findMergeHoverTarget = useCallback((dragState, pointerClientX, pointerClientY) => {
    if (!dragState || dragState.cardIds.length !== 1) {
      return null;
    }

    const sourceCard = cardsRef.current.find((card) => card.id === dragState.cardId);

    if (!sourceCard || sourceCard.type !== "text") {
      return null;
    }

    const deltaX = (pointerClientX - dragState.pointerX) / workspace.viewport.zoom;
    const deltaY = (pointerClientY - dragState.pointerY) / workspace.viewport.zoom;
    const draggedRect = {
      left: dragState.origins[sourceCard.id].x + deltaX,
      top: dragState.origins[sourceCard.id].y + deltaY,
      right: dragState.origins[sourceCard.id].x + deltaX + sourceCard.width,
      bottom: dragState.origins[sourceCard.id].y + deltaY + sourceCard.height,
      width: sourceCard.width,
      height: sourceCard.height,
    };
    const pointerWorldPoint = clientToWorldPoint(pointerClientX, pointerClientY);
    let bestTarget = null;
    let bestScore = 0;

    for (const card of cardsRef.current) {
      if (card.id === sourceCard.id || !isNoteFolderMergeCandidate(card)) {
        continue;
      }

      const targetRect = getCardRect(card);
      const intersectionArea = getIntersectionArea(draggedRect, targetRect);
      const overlapScore = intersectionArea / Math.min(
        Math.max(1, draggedRect.width * draggedRect.height),
        Math.max(1, targetRect.width * targetRect.height),
      );
      const pointerInsideTarget = pointInsideCard(pointerWorldPoint, card);
      const score = pointerInsideTarget ? overlapScore + 1 : overlapScore;

      if ((pointerInsideTarget || overlapScore >= 0.18) && score > bestScore) {
        bestTarget = card;
        bestScore = score;
      }
    }

    return bestTarget;
  }, [clientToWorldPoint, workspace.viewport.zoom]);

  const queueMergeIntent = useCallback((sourceCardId, targetCardId) => {
    const existingIntent = mergeIntentRef.current;

    if (existingIntent?.sourceCardId === sourceCardId && existingIntent?.targetCardId === targetCardId) {
      return;
    }

    clearMergeIntent();
    setMergeTargetCardId(targetCardId);

    const timeoutId = window.setTimeout(() => {
      const activeDrag = dragStateRef.current;
      const activeIntent = mergeIntentRef.current;

      if (
        !activeDrag
        || !activeIntent
        || activeIntent.sourceCardId !== sourceCardId
        || activeIntent.targetCardId !== targetCardId
      ) {
        return;
      }

      const folderCard = mergeExistingNoteCardIntoFolder(sourceCardId, targetCardId);
      clearMergeIntent();

      if (!folderCard) {
        return;
      }

      dragStateRef.current = null;
      setSelectedCardIds([folderCard.id]);
      log("success", "Notes grouped into a folder", {
        sourceCardId,
        targetCardId,
        folderCardId: folderCard.id,
      });
      toast("success", "Note tucked into a folder.");
    }, NOTE_FOLDER_HOVER_DELAY_MS);

    mergeIntentRef.current = {
      sourceCardId,
      targetCardId,
      timeoutId,
    };
  }, [clearMergeIntent, log, mergeExistingNoteCardIntoFolder, toast]);

  useEffect(() => {
    function updateMarquee(event) {
      const marqueeState = marqueeStateRef.current;

      if (!marqueeState || marqueeState.pointerId !== event.pointerId) {
        return;
      }

      marqueeState.currentClientX = event.clientX;
      marqueeState.currentClientY = event.clientY;

      const startCanvasPoint = clientToCanvasPoint(
        marqueeState.startClientX,
        marqueeState.startClientY,
      );
      const currentCanvasPoint = clientToCanvasPoint(event.clientX, event.clientY);
      const canvasRect = normalizeRect(
        startCanvasPoint.x,
        startCanvasPoint.y,
        currentCanvasPoint.x,
        currentCanvasPoint.y,
      );

      setMarqueeBox({
        x: canvasRect.left,
        y: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
      });
    }

    function finishMarquee(event) {
      const marqueeState = marqueeStateRef.current;

      if (!marqueeState || (event && marqueeState.pointerId !== event.pointerId)) {
        return;
      }

      const dragDistanceX = Math.abs(marqueeState.currentClientX - marqueeState.startClientX);
      const dragDistanceY = Math.abs(marqueeState.currentClientY - marqueeState.startClientY);

      marqueeStateRef.current = null;
      setMarqueeBox(null);

      if (dragDistanceX < MARQUEE_DRAG_THRESHOLD && dragDistanceY < MARQUEE_DRAG_THRESHOLD) {
        return;
      }

      const startWorldPoint = clientToWorldPoint(
        marqueeState.startClientX,
        marqueeState.startClientY,
      );
      const endWorldPoint = clientToWorldPoint(
        marqueeState.currentClientX,
        marqueeState.currentClientY,
      );
      const selectionWorldRect = normalizeRect(
        startWorldPoint.x,
        startWorldPoint.y,
        endWorldPoint.x,
        endWorldPoint.y,
      );
      const nextSelectedIds = workspace.cards
        .filter((card) => rectsIntersect(selectionWorldRect, {
          left: card.x,
          top: card.y,
          right: card.x + card.width,
          bottom: card.y + card.height,
        }))
        .map((card) => card.id);

      setSelectedCardIds(nextSelectedIds);
    }

    function cancelMarquee() {
      if (!marqueeStateRef.current) {
        return;
      }

      marqueeStateRef.current = null;
      setMarqueeBox(null);
    }

    window.addEventListener("pointermove", updateMarquee, true);
    window.addEventListener("pointerup", finishMarquee, true);
    window.addEventListener("pointercancel", finishMarquee, true);
    window.addEventListener("blur", cancelMarquee);

    return () => {
      window.removeEventListener("pointermove", updateMarquee, true);
      window.removeEventListener("pointerup", finishMarquee, true);
      window.removeEventListener("pointercancel", finishMarquee, true);
      window.removeEventListener("blur", cancelMarquee);
    };
  }, [clientToCanvasPoint, clientToWorldPoint, workspace.cards]);

  useEffect(() => {
    function finishDrag() {
      const dragState = dragStateRef.current;

      if (!dragState) {
        clearMergeIntent();
        return;
      }

      if (dragState.hasMoved) {
        log("info", "Card moved", {
          cardId: dragState.cardId,
          selectionSize: dragState.cardIds.length,
        });
      }

      dragStateRef.current = null;
      clearMergeIntent();
    }

    function handlePointerMove(event) {
      if (!dragStateRef.current) return;

      const deltaX = (event.clientX - dragStateRef.current.pointerX) / workspace.viewport.zoom;
      const deltaY = (event.clientY - dragStateRef.current.pointerY) / workspace.viewport.zoom;

      dragStateRef.current.hasMoved = true;

      updateExistingCards(
        Object.fromEntries(
          dragStateRef.current.cardIds.map((cardId) => {
            const origin = dragStateRef.current.origins[cardId];

            return [
              cardId,
              {
                x: origin.x + deltaX,
                y: origin.y + deltaY,
              },
            ];
          }),
        ),
      );

      const mergeTarget = findMergeHoverTarget(
        dragStateRef.current,
        event.clientX,
        event.clientY,
      );

      if (mergeTarget) {
        queueMergeIntent(dragStateRef.current.cardId, mergeTarget.id);
      } else {
        clearMergeIntent();
      }
    }

    function handlePointerUp() {
      finishDrag();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        finishDrag();
      }
    }

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerUp, true);
    window.addEventListener("blur", handlePointerUp);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);
      window.removeEventListener("blur", handlePointerUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearMergeIntent, findMergeHoverTarget, log, queueMergeIntent, updateExistingCards, workspace.viewport.zoom]);

  const handleCardDragStart = useCallback((card, event) => {
    setContextMenu(null);
    clearMergeIntent();
    setMagnifiedNoteState(null);

    const isPrimaryPointer = event.button === 0 || event.buttons === 1;

    if (!isPrimaryPointer) return;
    event.preventDefault();
    event.stopPropagation();

    const dragCardIds = selectedCardIdSet.has(card.id)
      ? selectedCardIds
      : [card.id];

    if (!selectedCardIdSet.has(card.id)) {
      setSelectedCardIds([card.id]);
    }

    dragStateRef.current = {
      cardId: card.id,
      cardIds: dragCardIds,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origins: Object.fromEntries(
        dragCardIds
          .map((cardId) => workspace.cards.find((currentCard) => currentCard.id === cardId))
          .filter(Boolean)
          .map((currentCard) => [
            currentCard.id,
            {
              x: currentCard.x,
              y: currentCard.y,
            },
          ]),
      ),
      hasMoved: false,
    };
  }, [clearMergeIntent, selectedCardIdSet, selectedCardIds, workspace.cards]);

  const handleCardContextMenu = useCallback((card, event) => {
    event.preventDefault();
    event.stopPropagation();

    const MENU_WIDTH = 376;
    const MENU_HEIGHT = 340;
    const VIEWPORT_PADDING = 16;
    const nextX = Math.min(
      event.clientX,
      window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING,
    );
    const nextY = Math.min(
      event.clientY,
      window.innerHeight - MENU_HEIGHT - VIEWPORT_PADDING,
    );

    setContextMenu({
      card,
      x: Math.max(VIEWPORT_PADDING, nextX),
      y: Math.max(VIEWPORT_PADDING, nextY),
    });
  }, []);

  const handleOpenFolder = useCallback(async () => {
    log("info", "Opening folder picker...");
    try {
      const selectedPath = await openFolder();
      if (selectedPath) {
        log("success", `Folder opened: ${selectedPath}`);
        toast("success", `Folder opened: ${folderNameFromPath(selectedPath)}`);
      } else {
        log("warn", "Folder picker dismissed");
      }
    } catch (openError) {
      const msg = openError.message || "Could not open folder.";
      log("error", "Folder open failed", msg);
      toast("error", msg);
    }
  }, [log, openFolder, toast]);

  const handleCreateNoteVariant = useCallback((noteStyle, successMessage, logMessage) => {
    if (!folderPath) {
      log("warn", "New note blocked because no folder is open");
      toast("warn", "Open a folder first.");
      return;
    }

    const centerPoint = getViewportCenter();
    log("success", logMessage, centerPoint);
    createNewTextCard("", centerPoint, { noteStyle });
    toast("success", successMessage);
  }, [createNewTextCard, folderPath, getViewportCenter, log, toast]);

  const handleNewNoteOneCard = useCallback(() => {
    handleCreateNoteVariant(
      NOTE_STYLE_ONE,
      "Note 1 dropped into the center.",
      "New blank note 1 card created in canvas center",
    );
  }, [handleCreateNoteVariant]);

  const handleNewTextCard = useCallback(() => {
    handleCreateNoteVariant(
      NOTE_STYLE_TWO,
      "Note 2 dropped into the center.",
      "New blank note 2 card created in canvas center",
    );
  }, [handleCreateNoteVariant]);

  const handleNewQuoteCard = useCallback(() => {
    handleCreateNoteVariant(
      NOTE_STYLE_THREE,
      "Note 3 dropped into the center.",
      "New blank note 3 card created in canvas center",
    );
  }, [handleCreateNoteVariant]);

  const handleContextAction = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleRequestTextNoteMagnify = useCallback((cardId, options = {}) => {
    if (!cardId) {
      return;
    }

    setContextMenu(null);
    setMagnifiedNoteState({
      cardId,
      startSplit: Boolean(options.startSplit),
    });
  }, []);

  const handleCloseTextNoteMagnify = useCallback(() => {
    setMagnifiedNoteState(null);
  }, []);

  const handleDeleteFromContextMenu = useCallback((card) => {
    if (!card) {
      return;
    }

    try {
      deleteExistingCard(card.id);
      setContextMenu(null);
      log("info", `Deleted card ${card.id}`);
      toast("success", "Tile deleted.");
    } catch (deleteError) {
      const message = deleteError?.message || "Unable to delete this tile.";
      log("error", `Failed to delete card ${card.id}`, message);
      toast("error", message);
    }
  }, [deleteExistingCard, log, toast]);

  const totalTileCount = workspace.cards.length;
  const filteredTiles = useMemo(
    () => filterTiles(workspace.cards, deferredSearchQuery),
    [workspace.cards, deferredSearchQuery],
  );
  const visibleTileCount = filteredTiles.length;
  const hasActiveSearch = deferredSearchQuery.trim().length > 0;
  const zoomPct = Math.round(workspace.viewport.zoom * 100);
  const folderLabel = folderPath ? folderNameFromPath(folderPath) : "No folder selected";
  const showSearchHud = Boolean(folderPath || totalTileCount > 0);
  const tileCountLabel = hasActiveSearch
    ? `${visibleTileCount} of ${totalTileCount} tiles`
    : `${totalTileCount} ${totalTileCount === 1 ? "tile" : "tiles"}`;
  const sidebarEyebrow = folderPath ? "Workspace" : "Setup";
  const sidebarLabel = folderPath ? folderLabel : "Open folder";
  const sidebarMeta = folderPath
    ? tileCountLabel
    : "Choose a local folder, then paste links or notes onto the board.";
  const magnifiedNoteCard = magnifiedNoteState
    ? workspace.cards.find((card) => card.id === magnifiedNoteState.cardId && card.type === "text") ?? null
    : null;

  if (booting) {
    return (
      <div className="app-shell app-shell--booting">
        <div className="launch-panel">
          <p className="launch-panel__eyebrow">AirPaste</p>
          <h1>Restoring your canvas</h1>
          <p>Reopening the last local workspace if one is available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${usesCustomTitlebar ? "app-shell--custom-titlebar" : "app-shell--native-frame"}`}>
      {usesCustomTitlebar ? (
        <header className="titlebar">
          <div className="titlebar__spacer" />
          <div className="titlebar__actions">
            <button
              id="titlebar-minimize"
              className="titlebar__icon-btn titlebar__icon-btn--min"
              type="button"
              title="Minimize"
              onClick={() => window.electronAPI?.minimize?.()}
            >
              <IconMinus />
            </button>
            <button
              id="titlebar-close"
              className="titlebar__icon-btn titlebar__icon-btn--close"
              type="button"
              title="Close"
              onClick={() => window.electronAPI?.close?.()}
            >
              <IconClose />
            </button>
          </div>
        </header>
      ) : null}

      <div className="workspace-shell">
        <aside className="side-nav">
          <div className="side-nav__brand" aria-label="AirPaste">
            <span className="side-nav__brand-mark">
              <span className="side-nav__brand-core" />
            </span>
            <span className="side-nav__brand-copy">AirPaste</span>
          </div>

          <div className="side-nav__actions">
            <button
              id="side-nav-open-folder"
              className="side-nav__action side-nav__action--primary"
              type="button"
              onClick={handleOpenFolder}
              disabled={folderLoading}
              aria-label={folderLoading ? "Opening folder" : "Open folder"}
              title={folderLoading ? "Opening folder" : "Open folder"}
            >
              <IconFolder />
            </button>
            <button
              id="side-nav-new-note-1"
              className="side-nav__action"
              type="button"
              onClick={handleNewNoteOneCard}
              disabled={!folderPath}
              aria-label="Create note 1"
              title="Create note 1"
            >
              <IconChecklistNote />
            </button>
            <button
              id="side-nav-new-note-2"
              className="side-nav__action"
              type="button"
              onClick={handleNewTextCard}
              disabled={!folderPath}
              aria-label="Create note 2"
              title="Create note 2"
            >
              <IconNote />
            </button>
            <button
              id="side-nav-new-note-3"
              className="side-nav__action"
              type="button"
              onClick={handleNewQuoteCard}
              disabled={!folderPath}
              aria-label="Create note 3"
              title="Create note 3"
            >
              <IconQuote />
            </button>
            <button
              id="side-nav-search"
              className="side-nav__action"
              type="button"
              onClick={focusSearchInput}
              disabled={!showSearchHud}
              aria-label="Focus search"
              title="Focus search (Ctrl+K)"
            >
              <IconSearch />
            </button>
          </div>

          <div className="side-nav__footer">
            <p className="side-nav__eyebrow">{sidebarEyebrow}</p>
            <p className="side-nav__label">{sidebarLabel}</p>
            <p className="side-nav__meta">{sidebarMeta}</p>
            <p className="side-nav__shortcut">Ctrl+V add, Ctrl+K search</p>
            <p className="side-nav__zoom">{zoomPct}% zoom</p>
          </div>
        </aside>

        <main className="canvas-stage">
          {showSearchHud ? (
            <div className="canvas-hud canvas-hud--top-center">
              <div className="search-panel">
                <div className="search-shell">
                  <input
                    id="tile-search"
                    ref={searchInputRef}
                    className="search-shell__input"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search"
                    aria-label="Search tiles"
                  />
                  {searchQuery ? (
                    <button
                      className="search-shell__clear"
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        focusSearchInput();
                      }}
                    >
                      Clear
                    </button>
                  ) : (
                    <span className="search-shell__meta">Ctrl+K</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div
            ref={containerRef}
            id="canvas-board"
            className={`canvas${marqueeBox ? " canvas--selecting" : ""}`}
            tabIndex={-1}
            onPointerDown={handleCanvasBoardPointerDown}
            onWheel={handleCanvasWheel}
            onClick={(event) => {
              if (!isEditableElement(event.target)) {
                event.currentTarget.focus({ preventScroll: true });
              }
            }}
          >
            <div
              className="canvas__grid"
              style={{
                backgroundSize: `${28 * workspace.viewport.zoom}px ${28 * workspace.viewport.zoom}px`,
                backgroundPosition: `${workspace.viewport.x}px ${workspace.viewport.y}px`,
              }}
            />
            <div
              className="canvas__content"
              style={{
                transform: `translate(${workspace.viewport.x}px, ${workspace.viewport.y}px) scale(${workspace.viewport.zoom})`,
              }}
            >
              {filteredTiles.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  isMergeTarget={mergeTargetCardId === card.id}
                  isSelected={selectedCardIdSet.has(card.id)}
                  viewportZoom={workspace.viewport.zoom}
                  onMediaLoad={(mediaWidth, mediaHeight) => {
                    handleCardMediaLoad(card, mediaWidth, mediaHeight);
                  }}
                  onContextMenu={handleCardContextMenu}
                  onDragStart={handleCardDragStart}
                  onRequestTextNoteMagnify={handleRequestTextNoteMagnify}
                  onTextChange={(cardId, updates) => {
                    updateExistingCard(cardId, updates);
                  }}
                  onRetry={(nextCard) => {
                    log("info", `Retrying preview for card ${nextCard.id}`);
                    toast("info", "Retrying link preview...");
                    updateExistingCard(nextCard.id, { status: "loading" });
                    void triggerPreview(nextCard);
                  }}
                />
              ))}
            </div>
            {marqueeBox ? (
              <div
                className="canvas__marquee"
                style={{
                  transform: `translate(${marqueeBox.x}px, ${marqueeBox.y}px)`,
                  width: `${marqueeBox.width}px`,
                  height: `${marqueeBox.height}px`,
                }}
              />
            ) : null}

            {!folderPath ? (
              <section className="canvas__callout">
                <p className="canvas__eyebrow">Local-first board</p>
                <h1>Open a folder, then paste straight into the canvas.</h1>
                <p>
                  URLs become rich preview tiles. Plain text becomes simple notes.
                  Everything stays inside that folder.
                </p>
                <button
                  id="canvas-open-folder"
                  className="button button--primary"
                  type="button"
                  onClick={handleOpenFolder}
                  disabled={folderLoading}
                >
                  {folderLoading ? "Opening..." : "Choose Folder"}
                </button>
              </section>
            ) : null}

            {folderPath && totalTileCount === 0 ? (
              <section className="canvas__callout canvas__callout--subtle">
                <p className="canvas__eyebrow">Canvas ready</p>
                <h2>Press Ctrl+V to drop your first link or note into the center.</h2>
                <p>Hold Ctrl and scroll to zoom. Drag on empty space to pan around the board.</p>
              </section>
            ) : null}

            {folderPath && totalTileCount > 0 && hasActiveSearch && visibleTileCount === 0 ? (
              <section className="canvas__callout canvas__callout--subtle">
                <p className="canvas__eyebrow">Search</p>
                <h2>No tiles match &ldquo;{deferredSearchQuery.trim()}&rdquo;.</h2>
                <p>Try a title, URL, note snippet, site name, or tile type.</p>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    focusSearchInput();
                  }}
                >
                  Clear Search
                </button>
              </section>
            ) : null}
          </div>
        </main>
      </div>

      <TileContextMenu
        menu={contextMenu}
        menuRef={contextMenuRef}
        onAction={handleContextAction}
        onDelete={handleDeleteFromContextMenu}
      />
      <NoteMagnifier
        card={magnifiedNoteCard}
        initialSplit={Boolean(magnifiedNoteState?.startSplit)}
        onClose={handleCloseTextNoteMagnify}
        onTextChange={(cardId, updates) => {
          updateExistingCard(cardId, updates);
        }}
      />
      <ToastStack />
      <DevConsole />
    </div>
  );
}
