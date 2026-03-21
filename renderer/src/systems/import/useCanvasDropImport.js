import { useCallback, useRef, useState } from "react";
import { captureDropPayload, hasCapturableDropData } from "./dropCapture";
import { formatDropRejectionMessage } from "./dropMessages";
import { normalizeDropPayload } from "./dropNormalization";
import { resolveDropIntents } from "./dropIntentResolution";

function setCopyDropEffect(event) {
  if (event?.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

export function useCanvasDropImport({
  canvas,
  commands,
  folderPath,
  log,
  toast,
}) {
  const dragDepthRef = useRef(0);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDropTarget(false);
  }, []);

  const handleDragEnter = useCallback((event) => {
    if (!hasCapturableDropData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setCopyDropEffect(event);
    setIsDropTarget(true);
  }, []);

  const handleDragOver = useCallback((event) => {
    if (!hasCapturableDropData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    setCopyDropEffect(event);
    setIsDropTarget(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    if (!hasCapturableDropData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDropTarget(false);
    }
  }, []);

  const handleDrop = useCallback(async (event) => {
    if (!hasCapturableDropData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    setCopyDropEffect(event);
    resetDragState();

    const capturedPayload = captureDropPayload(event);
    const normalizedDrop = normalizeDropPayload(capturedPayload);
    const resolvedDrop = resolveDropIntents(normalizedDrop);

    if (!folderPath) {
      log("warn", "Drop import blocked because no folder is open");
      toast("warn", "Open a folder first so AirPaste knows where to store imported items.");
      return;
    }

    if (resolvedDrop.dropError) {
      log("warn", "Drop import rejected", resolvedDrop.dropError.message);
      toast("error", resolvedDrop.dropError.message);
      return;
    }

    if (resolvedDrop.acceptedItems.length === 0) {
      const rejectionMessage = formatDropRejectionMessage(resolvedDrop.rejectedItems);

      if (rejectionMessage) {
        log("warn", "Drop import rejected", rejectionMessage);
        toast("error", rejectionMessage);
      }

      return;
    }

    await commands.importResolvedDrop(
      resolvedDrop,
      canvas.clientToWorldPoint(capturedPayload.clientPoint.x, capturedPayload.clientPoint.y),
    );
  }, [canvas, commands, folderPath, log, resetDragState, toast]);

  return {
    isDropTarget,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
