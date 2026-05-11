import { memo, useMemo } from "react";
import { desktop } from "../../lib/desktop";
import { useToast } from "../../hooks/useToast";
import { useAppContext } from "../../context/useAppContext";
import TileShell from "./TileShell";
import { useTileGesture } from "../../systems/interactions/useTileGesture";

function formatFileSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 MB";
  }

  const megabytes = sizeBytes / (1024 * 1024);

  if (megabytes >= 1) {
    return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
  }

  const kilobytes = sizeBytes / 1024;
  return `${Math.max(1, Math.round(kilobytes))} KB`;
}

function getFileTypeLabel(card) {
  const extension = String(card.file?.extension ?? "").trim().replace(/^\.+/, "").toLowerCase();
  return extension ? `.${extension}` : ".file";
}

function getFileTitle(card) {
  return card.file?.fileName?.trim() || card.title?.trim() || "Untitled file";
}

function FileTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
}) {
  const { toast } = useToast();
  const { folderPath } = useAppContext();
  const fileTitle = useMemo(() => getFileTitle(card), [card]);
  const fileTypeLabel = useMemo(() => getFileTypeLabel(card), [card]);
  const fileSizeLabel = useMemo(() => formatFileSize(card.file?.sizeBytes), [card.file?.sizeBytes]);
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const openFile = async () => {
    if (!folderPath || !card.file?.relativePath) {
      throw new Error("File could not be resolved.");
    }

    const item = await desktop.workspace.getItemForFilePath(folderPath, card.file.relativePath);

    if (!item?.filePath) {
      throw new Error("File no longer exists.");
    }

    await desktop.workspace.recordRecentItem(folderPath, item.filePath).catch(() => {});
    const result = await desktop.workspace.openFile(item.filePath);

    if (result?.opened === false) {
      throw new Error("File could not be opened.");
    }
  };
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
    onDoubleActivate: async () => {
      try {
        await openFile();
      } catch (error) {
        toast("error", error?.message || "Could not open file");
      }
    },
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--file"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section
            className="card__surface card__surface--file"
            aria-label={`${fileTitle}, ${fileTypeLabel}, ${fileSizeLabel}`}
            title={`${fileTitle} • ${fileTypeLabel} • ${fileSizeLabel}`}
          >
            <div className="card__file-hero" aria-hidden="true" />
            <div className="card__file-body">
              <div className="card__file-side-tab" aria-hidden="true" />
              <h3 className="card__file-name">{fileTitle}</h3>
              <p className="card__file-type">{fileTypeLabel}</p>
              <div className="card__file-size-pill">{fileSizeLabel}</div>
            </div>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(FileTile);
