import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { CANVAS_TEXT_TITLE_MODE_CUSTOM } from "../../lib/canvasText";
import { desktop } from "../../lib/desktop";
import { useToast } from "../../hooks/useToast";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  CODE_FILE_BASE_WIDTH,
  CODE_FILE_LANGUAGES,
  clampCodeFileWidth,
  describeCodeFilePath,
  getCodeFileHeight,
  getCodeFileLanguage,
  getFileCardCodeLanguageId,
  normalizeStickyStyle,
} from "../../tiles/sticky/model";
import TileShell from "./TileShell";
import "./StickyCodeFileTile.css";

// The "code-file" sticky design: a tall card in its language's colour with
// the file name (cropped; slides to show the rest on hover), the extension
// (click for a language picker) and a footer button that shows the linked
// file in Explorer -- or links one first. Everything scales with the width
// (k = width / 497); the proportions are fixed.
//
// Imported coding files (file cards, type "file") use this tile too. Their
// name and language come from the file, so neither is editable, and a
// double-click opens the file.

// The card outline at 497 x 735: body, a cut top-right corner and the
// footer step bottom-left.
const SHAPE_PATH = "M65,0 H485 Q497,0 497,12 V80 L425,155 V723 Q425,735 413,735 H12 Q0,735 0,723 V612 Q0,600 12,600 H41 Q53,600 53,588 V12 Q53,0 65,0 Z";
// Design px per second the name slides at on hover.
const NAME_SLIDE_SPEED = 140;

const RESIZE_HANDLES = [
  { key: "nw", dirX: -1, dirY: -1 },
  { key: "ne", dirX: 1, dirY: -1 },
  { key: "sw", dirX: -1, dirY: 1 },
  { key: "se", dirX: 1, dirY: 1 },
];

function stopPointer(event) {
  event.stopPropagation();
}

function placeCaret(element, selectAll) {
  const range = document.createRange();
  range.selectNodeContents(element);
  if (!selectAll) {
    range.collapse(false);
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function LanguagePicker({ languageId, onPick, onClose }) {
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState("");
  const filter = query.trim().toLowerCase();
  const languages = CODE_FILE_LANGUAGES.filter((language) => !filter
    || language.name.toLowerCase().includes(filter)
    || language.label.toLowerCase().includes(filter));

  // Closes on any press outside it.
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !event.target.closest?.(".code-file__ext")) {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  // The canvas pans on every wheel event; the list scrolls instead. A
  // native listener, so it runs before the canvas's own.
  useEffect(() => {
    const list = listRef.current;
    const stopWheel = (event) => event.stopPropagation();

    list?.addEventListener("wheel", stopWheel, { passive: true });
    return () => list?.removeEventListener("wheel", stopWheel);
  }, []);

  return (
    <div
      ref={rootRef}
      className="code-file__picker"
      role="dialog"
      aria-label="Language"
      onPointerDown={stopPointer}
      onDoubleClick={stopPointer}
    >
      <input
        className="code-file__picker-search"
        type="text"
        placeholder="Filter language…"
        aria-label="Filter languages"
        spellCheck={false}
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            onClose();
          } else if (event.key === "Enter" && languages[0]) {
            onPick(languages[0].id);
          }
        }}
      />
      <div ref={listRef} className="code-file__picker-list" role="listbox" aria-label="Languages">
        {languages.map((language) => (
          <button
            key={language.id}
            type="button"
            role="option"
            aria-selected={language.id === languageId}
            className="code-file__pick"
            onClick={() => onPick(language.id)}
          >
            <i style={{ background: language.hex }} />
            <b>{language.label}</b>
            <span>{language.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// A file card's name without its extension ("index.html" -> "index").
function getFileCardName(card) {
  const fileName = card.file?.fileName?.trim() || card.title?.trim() || "";
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function StickyCodeFileTile({
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
  textBoxEditorState,
  onRequestTextBoxEdit,
  onEndTextBoxEdit,
}) {
  const { folderPath, setCanvasInteractionState, updateExistingCard } = useAppContext();
  const { toast } = useToast();
  const fileLanguageId = getFileCardCodeLanguageId(card);
  const isFileCard = fileLanguageId !== null;
  const style = normalizeStickyStyle(card.sticky);
  const language = getCodeFileLanguage(isFileCard ? fileLanguageId : style.color);
  const width = clampCodeFileWidth(card.width);
  const k = width / CODE_FILE_BASE_WIDTH;
  const name = isFileCard ? getFileCardName(card) : typeof card.title === "string" ? card.title : "";
  const isEditing = !isFileCard && textBoxEditorState?.tileId === card.id;
  const isStaticPreview = renderHint?.isStaticPreview === true;
  const [resizeLabel, setResizeLabel] = useState("");
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isButtonPressed, setButtonPressed] = useState(false);
  const [slide, setSlide] = useState(null);
  const isResizing = resizeLabel !== "";
  const rootRef = useRef(null);
  const nameWrapRef = useRef(null);
  const nameRef = useRef(null);
  const wasSelectedAtPressRef = useRef(false);
  const showChrome = tileMeta?.isSelected === true && !tileMeta?.isDragging && !isResizing && !isStaticPreview;

  const startEditing = useCallback(() => {
    setPickerOpen(false);
    onRequestTextBoxEdit?.(card.id, { selectAll: false });
  }, [card.id, onRequestTextBoxEdit]);

  // An imported file's absolute path, looked up from its place in the folder.
  const resolveFilePath = async () => {
    const item = folderPath && card.file?.relativePath
      ? await desktop.workspace.getItemForFilePath(folderPath, card.file.relativePath)
      : null;

    if (!item?.filePath) {
      throw new Error("File no longer exists.");
    }

    return item.filePath;
  };

  const openImportedFile = async () => {
    try {
      const filePath = await resolveFilePath();
      await desktop.workspace.recordRecentItem(folderPath, filePath).catch(() => {});
      const result = await desktop.workspace.openFile(filePath);

      if (result?.opened === false) {
        throw new Error("File could not be opened.");
      }
    } catch (error) {
      toast("error", error?.message || "Could not open file");
    }
  };

  const gesture = useTileGesture({
    card,
    canDrag: !isEditing,
    onDragStart: onBeginDrag,
    onPressStart: (pressedCard, event) => {
      wasSelectedAtPressRef.current = tileMeta?.isSelected === true;
      return onPressStart?.(pressedCard, event);
    },
    onActivate: () => {
      if (wasSelectedAtPressRef.current && !isEditing && !isFileCard) {
        startEditing();
      }
    },
    onDoubleActivate: isFileCard ? openImportedFile : startEditing,
  });

  // The name is uncontrolled: React never writes it while the user types.
  useLayoutEffect(() => {
    if (!isEditing && nameRef.current && nameRef.current.textContent !== name) {
      nameRef.current.textContent = name;
    }
  }, [isEditing, name]);

  // Entering edit mode: optionally replace the name with the key that
  // started it, then put the caret at the end (or select it all).
  useEffect(() => {
    const element = nameRef.current;

    if (!isEditing || !element) {
      return undefined;
    }

    if (typeof textBoxEditorState?.replacementText === "string") {
      element.textContent = textBoxEditorState.replacementText;
    }

    setSlide(null);
    const frame = window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      placeCaret(element, textBoxEditorState?.selectAll === true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isEditing, textBoxEditorState?.replacementText, textBoxEditorState?.requestId, textBoxEditorState?.selectAll]);

  useEffect(() => {
    if (!isEditing) {
      if (nameWrapRef.current) {
        nameWrapRef.current.scrollLeft = 0;
      }
      return undefined;
    }

    setCanvasInteractionState?.(true);
    return () => setCanvasInteractionState?.(false);
  }, [isEditing, setCanvasInteractionState]);

  useEffect(() => {
    if (!tileMeta?.isSelected) {
      setPickerOpen(false);
    }
  }, [tileMeta?.isSelected]);

  const updateStyle = useCallback((patch) => {
    updateExistingCard(card.id, { sticky: { ...normalizeStickyStyle(card.sticky), ...patch } });
  }, [card.id, card.sticky, updateExistingCard]);

  // Hovering a name too long for its box slides it to show the end.
  // Layout widths, so the zoom doesn't matter.
  const handleNamePointerEnter = () => {
    const wrap = nameWrapRef.current;
    const element = nameRef.current;

    if (isEditing || !wrap || !element) {
      return;
    }

    const over = Math.max(0, element.offsetWidth - wrap.clientWidth);
    setSlide(over > 0 ? { over, seconds: Math.max(0.5, over / (NAME_SLIDE_SPEED * k)) } : null);
  };

  const finishEditing = ({ restoreCanvasFocus = false } = {}) => {
    const nextName = (nameRef.current?.textContent ?? "").replace(/\s+/g, " ").trim();

    if (nextName !== name) {
      updateExistingCard(card.id, { title: nextName, titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM });
    }
    if (nameRef.current && !nextName) {
      nameRef.current.textContent = "";
    }
    window.getSelection()?.removeAllRanges();
    onEndTextBoxEdit?.(card.id, { restoreCanvasFocus });
  };

  const handleNameKeyDown = (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      onEndTextBoxEdit?.(card.id, { restoreCanvasFocus: true });
    }
  };

  // Keeps the caret end in view while typing a long name.
  const handleNameInput = () => {
    if (nameWrapRef.current) {
      nameWrapRef.current.scrollLeft = nameWrapRef.current.scrollWidth;
    }
  };

  // With a linked file the button shows it in Explorer; without one it
  // asks for a file, then takes its name and language.
  const handleButtonClick = async (event) => {
    event.stopPropagation();
    setButtonPressed(true);
    window.setTimeout(() => setButtonPressed(false), 160);

    if (isFileCard) {
      try {
        const result = await desktop.workspace.revealPath(await resolveFilePath());

        if (result?.opened === false) {
          throw new Error("File no longer exists.");
        }
      } catch (error) {
        toast("error", error?.message || "Could not show file");
      }
      return;
    }

    if (style.filePath) {
      await desktop.workspace.revealPath(style.filePath);
      return;
    }

    const [filePath] = await desktop.workspace.openFiles();

    if (!filePath) {
      return;
    }

    const described = describeCodeFilePath(filePath);
    updateExistingCard(card.id, {
      title: name || described.name,
      titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM,
      sticky: { ...style, filePath, color: described.languageId ?? style.color },
    });
  };

  // While typing, a press in the name moves the caret instead of dragging.
  const handlePointerDown = (event) => {
    if (isEditing && nameRef.current?.contains(event.target)) {
      event.stopPropagation();
      return;
    }

    gesture.onPointerDown(event);
  };

  // Corner handles resize with the proportions kept: the drag along the
  // diagonal, as a width. A west/north handle shifts the card so the
  // opposite corner stays.
  const handleResizePointerDown = (handle, event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const height = getCodeFileHeight(width);
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
      const nextWidth = clampCodeFileWidth(start.width + ((handle.dirX * dx) + (handle.dirY * dy / ratio)) / 2);
      const nextHeight = getCodeFileHeight(nextWidth);
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
      className="card--code-file-sticky"
      renderHint={renderHint}
      tileState={isEditing ? "editing" : ""}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <article
        ref={rootRef}
        className={[
          "code-file",
          isEditing ? "code-file--editing" : "",
          isResizing ? "code-file--resizing" : "",
        ].filter(Boolean).join(" ")}
        aria-label={`${language.name} file`}
        style={{
          "--code-k": k,
          "--code-main": language.hex,
          "--code-tint": language.tint,
        }}
        {...gesture}
        onPointerDown={handlePointerDown}
      >
        <svg className="code-file__shape" viewBox="0 0 497 735" preserveAspectRatio="none" aria-hidden="true">
          <path d={SHAPE_PATH} />
        </svg>

        <div
          ref={nameWrapRef}
          className="code-file__name-wrap"
          onPointerEnter={handleNamePointerEnter}
          onPointerLeave={() => setSlide(null)}
        >
          <span
            ref={nameRef}
            className={`code-file__name${slide ? " code-file__name--slide" : ""}`}
            style={slide ? { "--code-name-over": `${slide.over}px`, "--code-name-duration": `${slide.seconds}s` } : undefined}
            role="textbox"
            aria-label="File name"
            data-placeholder="File name"
            spellCheck={false}
            contentEditable={isEditing ? "plaintext-only" : "false"}
            suppressContentEditableWarning
            onInput={isEditing ? handleNameInput : undefined}
            onKeyDown={isEditing ? handleNameKeyDown : undefined}
            onBlur={isEditing ? () => finishEditing() : undefined}
          />
        </div>

        {isFileCard ? (
          <span className="code-file__ext code-file__ext--static">{language.label}</span>
        ) : (
          <button
            type="button"
            className="code-file__ext"
            title="Pick language"
            aria-haspopup="dialog"
            aria-expanded={isPickerOpen}
            onPointerDown={stopPointer}
            onDoubleClick={stopPointer}
            onClick={(event) => {
              event.stopPropagation();
              setPickerOpen((open) => !open);
            }}
          >
            {language.label}
          </button>
        )}

        {isPickerOpen && !isStaticPreview ? (
          <LanguagePicker
            languageId={language.id}
            onPick={(languageId) => {
              updateStyle({ color: languageId });
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}

        <button
          type="button"
          className={`code-file__button${isButtonPressed ? " code-file__button--pressed" : ""}`}
          title={isFileCard ? card.file?.relativePath : style.filePath || "Pick the file this card points at"}
          onPointerDown={stopPointer}
          onDoubleClick={stopPointer}
          onClick={handleButtonClick}
        >
          <span>{isFileCard || style.filePath ? "Show in explorer" : "Link a file"}</span>
          <i aria-hidden="true" />
        </button>

        {showChrome ? RESIZE_HANDLES.map((handle) => (
          <span
            key={handle.key}
            className={`code-file__handle code-file__handle--${handle.key}`}
            aria-hidden="true"
            onPointerDown={(event) => handleResizePointerDown(handle, event)}
          />
        )) : null}

        {isResizing ? <div className="code-file__size-label">{resizeLabel}</div> : null}
      </article>
    </TileShell>
  );
}

export default memo(StickyCodeFileTile);
