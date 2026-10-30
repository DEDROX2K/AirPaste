import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { desktop } from "../../lib/desktop";
import { useToast } from "../../hooks/useToast";
import { useAppContext } from "../../context/useAppContext";
import TileShell from "./TileShell";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  DEFAULT_FILE_BASE_WIDTH,
  DEFAULT_FILE_COLOR,
  DEFAULT_FILE_COLOR_PRESETS,
  DEFAULT_FILE_SHAPE_PATH,
  OPEN_FILE_COLOR_EVENT,
  clampDefaultFileWidth,
  formatFileSize,
  getDefaultFileHeight,
  normalizeFileColor,
  splitFileName,
} from "../../tiles/file/defaultFileDesign";
import "./FileTile.css";

// An imported file AirPaste has no tile of its own for, in the default file
// design (see tiles/file/defaultFileDesign.js): size pill, name, extension
// tab. Double-click opens the file; double-clicking the name (or clicking
// it once the tile is selected) renames the card -- not the file on disk.
// A name too long for its band is cropped and slides on hover, like the
// code-file card. The right-click menu's "Change colour" opens a colour
// panel for the background. Coding files use StickyCodeFileTile instead.

const RESIZE_HANDLES = [
  { key: "nw", dirX: -1, dirY: -1 },
  { key: "ne", dirX: 1, dirY: -1 },
  { key: "sw", dirX: -1, dirY: 1 },
  { key: "se", dirX: 1, dirY: 1 },
];
// Design px per second the name slides at on hover (as StickyCodeFileTile).
const NAME_SLIDE_SPEED = 140;

function stopPointer(event) {
  event.stopPropagation();
}

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function hexToHsv(hex) {
  const value = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;

  if (delta) {
    h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }

  return { h, s: max ? delta / max : 0, v: max };
}

function hsvToHex({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];

  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

// Black text, or white on a dark background.
function getInkColor(hex) {
  const value = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((value >> 16) & 255)) + (0.587 * ((value >> 8) & 255)) + (0.114 * (value & 255));
  return luminance < 90 ? "#FFFFFF" : "#000000";
}

// Saturation/value square, hue slider, hex field and presets. Changes show
// at once (onPreview) and are saved when a gesture ends (onCommit).
function FileColorPanel({ color, onPreview, onCommit, onClose }) {
  const rootRef = useRef(null);
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const [hexDraft, setHexDraft] = useState(color);
  const current = hsvToHex(hsv);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        onClose();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  const preview = (next) => {
    setHsv(next);
    setHexDraft(hsvToHex(next));
    onPreview(hsvToHex(next));
  };

  const setExact = (hex) => {
    setHsv(hexToHsv(hex));
    setHexDraft(hex);
    onPreview(hex);
    onCommit(hex);
  };

  const moveSaturationValue = (event, area) => {
    const rect = area.getBoundingClientRect();
    preview({
      h: hsv.h,
      s: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      v: Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height)),
    });
  };

  return (
    <div
      ref={rootRef}
      className="default-file__color-panel"
      role="dialog"
      aria-label="Background colour"
      onPointerDown={stopPointer}
      onDoubleClick={stopPointer}
      onContextMenu={stopPointer}
    >
      <div className="default-file__color-title">Background</div>
      <div
        className="default-file__color-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))` }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          moveSaturationValue(event, event.currentTarget);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            moveSaturationValue(event, event.currentTarget);
          }
        }}
        onPointerUp={() => onCommit(current)}
      >
        <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
      </div>
      <input
        className="default-file__color-hue"
        type="range"
        min="0"
        max="360"
        aria-label="Hue"
        value={Math.round(hsv.h)}
        onChange={(event) => preview({ ...hsv, h: Number(event.target.value) })}
        onPointerUp={() => onCommit(current)}
        onKeyUp={() => onCommit(current)}
      />
      <div className="default-file__color-row">
        <span className="default-file__color-swatch" style={{ background: current }} />
        <input
          className="default-file__color-hex"
          type="text"
          maxLength={7}
          spellCheck={false}
          aria-label="Hex colour"
          value={hexDraft}
          onChange={(event) => {
            const raw = event.target.value.trim();
            const next = normalizeFileColor(raw.startsWith("#") ? raw : `#${raw}`);
            setHexDraft(raw);
            if (next) {
              setExact(next);
            }
          }}
          onBlur={() => setHexDraft(current)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className="default-file__color-presets">
        {DEFAULT_FILE_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-label={preset}
            title={preset}
            aria-pressed={preset === current}
            style={{ background: preset }}
            onClick={() => setExact(preset)}
          />
        ))}
      </div>
    </div>
  );
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
  renderHint,
}) {
  const { toast } = useToast();
  const { folderPath, setCanvasInteractionState, updateExistingCard } = useAppContext();
  const width = clampDefaultFileWidth(card.width);
  const k = width / DEFAULT_FILE_BASE_WIDTH;
  const fileName = card.file?.fileName || card.title || "Untitled file";
  const { extension } = splitFileName(fileName);
  const extensionLabel = extension || (card.file?.extension ? `.${card.file.extension}` : ".file");
  // The card's title is the shown name (the file's own unless renamed),
  // without the extension, which has its own tab.
  const title = card.title || fileName;
  const name = extension && title.toLowerCase().endsWith(extension) ? title.slice(0, -extension.length) : title;
  const sizeLabel = formatFileSize(card.file?.sizeBytes);
  const savedColor = normalizeFileColor(card.fileColor) ?? DEFAULT_FILE_COLOR;
  const [previewColor, setPreviewColor] = useState(null);
  const [isColorPanelOpen, setColorPanelOpen] = useState(false);
  const [resizeLabel, setResizeLabel] = useState("");
  const [isEditing, setEditing] = useState(false);
  const [isNameOverflowing, setNameOverflowing] = useState(false);
  const [slide, setSlide] = useState(null);
  const color = previewColor ?? savedColor;
  const isResizing = resizeLabel !== "";
  const isStaticPreview = renderHint?.isStaticPreview === true;
  const showChrome = tileMeta?.isSelected === true && !tileMeta?.isDragging && !isResizing && !isStaticPreview;
  const rootRef = useRef(null);
  const nameWrapRef = useRef(null);
  const nameRef = useRef(null);
  const wasSelectedAtPressRef = useRef(false);

  const openFile = async () => {
    try {
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
    } catch (error) {
      toast("error", error?.message || "Could not open file");
    }
  };

  const startEditing = () => {
    setColorPanelOpen(false);
    setSlide(null);
    setEditing(true);
  };

  // Whether the last press began on the name. The gesture captures the
  // pointer on the whole tile, so the click events after it target the
  // tile, not the name; the press's own target is the reliable one.
  const pressedNameRef = useRef(false);

  const gesture = useTileGesture({
    card,
    canDrag: !isEditing,
    onDragStart: onBeginDrag,
    onPressStart: (pressedCard, event) => {
      wasSelectedAtPressRef.current = tileMeta?.isSelected === true;
      pressedNameRef.current = nameWrapRef.current?.contains(event.target) === true;
      return onPressStart?.(pressedCard, event);
    },
    onActivate: () => {
      if (wasSelectedAtPressRef.current && !isEditing && pressedNameRef.current) {
        startEditing();
      }
    },
    onDoubleActivate: () => {
      if (pressedNameRef.current) {
        startEditing();
      } else if (!isEditing) {
        void openFile();
      }
    },
  });

  // The name is uncontrolled: React never writes it while the user types.
  useLayoutEffect(() => {
    if (!isEditing && nameRef.current && nameRef.current.textContent !== name) {
      nameRef.current.textContent = name;
    }
  }, [isEditing, name]);

  // Whether the name is wider than its band (then it starts at the left
  // and slides on hover). Layout widths, so the zoom doesn't matter.
  useLayoutEffect(() => {
    const wrap = nameWrapRef.current;
    const element = nameRef.current;

    if (wrap && element && !isEditing) {
      setNameOverflowing(element.offsetWidth > wrap.clientWidth + 1);
    }
  }, [isEditing, name, width]);

  // Keeps the caret end in view while typing a long name.
  const handleNameInput = () => {
    if (nameWrapRef.current) {
      nameWrapRef.current.scrollLeft = nameWrapRef.current.scrollWidth;
    }
  };

  // Entering edit mode: caret at the end of the name.
  useEffect(() => {
    const element = nameRef.current;

    if (!isEditing || !element) {
      return undefined;
    }

    setCanvasInteractionState?.(true);
    const frame = window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      placeCaretAtEnd(element);
      handleNameInput();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      setCanvasInteractionState?.(false);
    };
    // Only on entering or leaving edit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Deselecting the tile ends renaming.
  useEffect(() => {
    if (!tileMeta?.isSelected && isEditing) {
      nameRef.current?.blur();
    }
  }, [isEditing, tileMeta?.isSelected]);

  // Hovering a name too long for its band slides it to show the end.
  const handleNamePointerEnter = () => {
    const wrap = nameWrapRef.current;
    const element = nameRef.current;

    if (isEditing || !wrap || !element) {
      return;
    }

    const over = Math.max(0, element.offsetWidth - wrap.clientWidth);
    setSlide(over > 0 ? { over, seconds: Math.max(0.5, over / (NAME_SLIDE_SPEED * k)) } : null);
  };

  // An empty name goes back to the file's own.
  const finishEditing = () => {
    const nextName = (nameRef.current?.textContent ?? "").replace(/\s+/g, " ").trim();
    const nextTitle = nextName ? `${nextName}${extension}` : fileName;

    if (nextTitle !== title) {
      updateExistingCard(card.id, { title: nextTitle });
    }
    if (nameRef.current) {
      nameRef.current.textContent = nextName || splitFileName(fileName).name;
    }
    if (nameWrapRef.current) {
      nameWrapRef.current.scrollLeft = 0;
    }
    window.getSelection()?.removeAllRanges();
    setEditing(false);
  };

  const handleNameKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  // While typing, a press in the name moves the caret instead of dragging.
  const handlePointerDown = (event) => {
    if (isEditing && nameRef.current?.contains(event.target)) {
      event.stopPropagation();
      return;
    }

    gesture.onPointerDown(event);
  };

  // "Change colour" in the right-click menu.
  useEffect(() => {
    const handleOpen = (event) => {
      if (event.detail?.tileId === card.id) {
        setColorPanelOpen(true);
      }
    };

    window.addEventListener(OPEN_FILE_COLOR_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_FILE_COLOR_EVENT, handleOpen);
  }, [card.id]);

  useEffect(() => {
    if (!tileMeta?.isSelected) {
      setColorPanelOpen(false);
    }
  }, [tileMeta?.isSelected]);

  const commitColor = (nextColor) => {
    setPreviewColor(null);

    if (nextColor !== savedColor) {
      updateExistingCard(card.id, { fileColor: nextColor === DEFAULT_FILE_COLOR ? null : nextColor });
    }
  };

  // Corner handles resize with the proportions kept, like the code-file
  // card. A west/north handle shifts the card so the opposite corner stays.
  const handleResizePointerDown = (handle, event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const height = getDefaultFileHeight(width);
    const zoom = Math.max(0.1, (rootRef.current?.getBoundingClientRect().width ?? width) / width);
    const start = { x: card.x, y: card.y, width, height, clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    const ratio = start.height / start.width;
    setCanvasInteractionState?.(true);
    setResizeLabel(`${width} × ${height}`);

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== start.pointerId) {
        return;
      }

      const dx = (moveEvent.clientX - start.clientX) / zoom;
      const dy = (moveEvent.clientY - start.clientY) / zoom;
      const nextWidth = clampDefaultFileWidth(start.width + ((handle.dirX * dx) + (handle.dirY * dy / ratio)) / 2);
      const nextHeight = getDefaultFileHeight(nextWidth);
      updateExistingCard(card.id, {
        width: nextWidth,
        height: nextHeight,
        x: handle.dirX < 0 ? start.x - (nextWidth - start.width) : start.x,
        y: handle.dirY < 0 ? start.y - (nextHeight - start.height) : start.y,
      });
      setResizeLabel(`${nextWidth} × ${nextHeight}`);
    };

    const finish = (finishEvent) => {
      if (finishEvent && finishEvent.pointerId !== undefined && finishEvent.pointerId !== start.pointerId) {
        return;
      }

      setResizeLabel("");
      setCanvasInteractionState?.(false);
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", finish);
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    window.addEventListener("blur", finish);
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--default-file"
      renderHint={renderHint}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <article
        ref={rootRef}
        className={[
          "default-file",
          isEditing ? "default-file--editing" : "",
          isResizing ? "default-file--resizing" : "",
        ].filter(Boolean).join(" ")}
        aria-label={`${name}${extensionLabel}, ${sizeLabel}`}
        title={`${name}${extensionLabel} • ${sizeLabel}`}
        style={{
          "--file-k": width / DEFAULT_FILE_BASE_WIDTH,
          "--file-body": color,
          "--file-ink": getInkColor(color),
        }}
        {...gesture}
        onPointerDown={handlePointerDown}
      >
        <svg className="default-file__shape" viewBox="0 0 610 415" preserveAspectRatio="none" aria-hidden="true">
          <path d={DEFAULT_FILE_SHAPE_PATH} />
        </svg>

        <div className="default-file__pill">
          <span>{sizeLabel}</span>
        </div>
        <div
          ref={nameWrapRef}
          className={[
            "default-file__name",
            isNameOverflowing ? "default-file__name--overflow" : "",
            slide ? "default-file__name--slide" : "",
          ].filter(Boolean).join(" ")}
          style={slide ? { "--file-name-over": `${slide.over}px`, "--file-name-duration": `${slide.seconds}s` } : undefined}
          onPointerEnter={handleNamePointerEnter}
          onPointerLeave={() => setSlide(null)}
        >
          <span
            ref={nameRef}
            role="textbox"
            aria-label="File name"
            data-placeholder="File name"
            spellCheck={false}
            contentEditable={isEditing ? "plaintext-only" : "false"}
            suppressContentEditableWarning
            onInput={isEditing ? handleNameInput : undefined}
            onKeyDown={isEditing ? handleNameKeyDown : undefined}
            onBlur={isEditing ? finishEditing : undefined}
          />
        </div>
        <div className="default-file__ext">
          <span>{extensionLabel}</span>
        </div>

        {showChrome ? RESIZE_HANDLES.map((handle) => (
          <span
            key={handle.key}
            className={`default-file__handle default-file__handle--${handle.key}`}
            aria-hidden="true"
            onPointerDown={(event) => handleResizePointerDown(handle, event)}
          />
        )) : null}

        {isResizing ? <div className="default-file__size-label">{resizeLabel}</div> : null}

        {isColorPanelOpen && !isStaticPreview ? (
          <FileColorPanel
            color={savedColor}
            onPreview={setPreviewColor}
            onCommit={commitColor}
            onClose={() => {
              setPreviewColor(null);
              setColorPanelOpen(false);
            }}
          />
        ) : null}
      </article>
    </TileShell>
  );
}

export default memo(FileTile);
