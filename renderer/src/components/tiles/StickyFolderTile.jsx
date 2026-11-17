import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
import { useLiveTileGeometry } from "../../systems/interactions/useLiveTileGeometry";
import { CANVAS_TEXT_TITLE_MODE_CUSTOM } from "../../lib/canvasText";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import {
  FOLDER_STICKY_BASE_WIDTH,
  FOLDER_STICKY_COLORS,
  FOLDER_STICKY_FONT_SIZE_LABELS,
  FOLDER_STICKY_FONT_SIZES,
  clampFolderStickyWidth,
  getFolderStickyMinHeight,
  normalizeStickyStyle,
} from "../../tiles/sticky/model";
import { NoteTextEditor, NoteTextView } from "../noteText/NoteText";
import FloatingFormatToolbar from "./FloatingFormatToolbar";
import TileShell from "./TileShell";
import "./StickyFolderTile.css";

// The "folder" sticky design: a dark grid sheet with a title, and a
// file-folder tab behind it that shows who edited it, when, and how many
// lines it has. Width scales everything (k = width / 640); the height
// follows the text and is written back to the card.

const SIZE_OPTIONS = Object.entries(FOLDER_STICKY_FONT_SIZE_LABELS).map(([id, label]) => ({ id, label }));

const RESIZE_HANDLES = [
  { key: "nw", dirX: -1 },
  { key: "ne", dirX: 1 },
  { key: "sw", dirX: -1 },
  { key: "se", dirX: 1 },
];

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

function normalizeBody(text) {
  return (text ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function countWrittenLines(text) {
  return text.split("\n").filter((line) => line.trim() !== "").length;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTime(iso) {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function StickyFolderTile({
  card: committedCard,
  tileMeta: committedTileMeta,
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
  // Resizing previews here and commits once (useLiveTileGeometry).
  const { card, tileMeta, updateLive, commitLive, liveRef } = useLiveTileGeometry(committedCard, committedTileMeta);
  const { setCanvasInteractionState, updateExistingCard } = useTileAppContext();
  const style = normalizeStickyStyle(card.sticky);
  const width = clampFolderStickyWidth(card.width);
  const isEditing = textBoxEditorState?.tileId === card.id;
  const isStaticPreview = renderHint?.isStaticPreview === true;
  const [resizeLabel, setResizeLabel] = useState("");
  // While typing, the tab updates live from these; they're saved on blur.
  const [draft, setDraft] = useState(null);
  const isResizing = resizeLabel !== "";
  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const bodyEditorRef = useRef(null);
  // The body editor is uncontrolled; this holds what's typed this session.
  const bodyDraftRef = useRef(null);
  const exitedRef = useRef(false);
  const wasSelectedAtPressRef = useRef(false);
  const cardRef = useRef(card);
  cardRef.current = card;
  const title = typeof card.title === "string" ? card.title : "";
  const body = typeof card.text === "string" ? card.text : "";
  const showChrome = tileMeta?.isSelected === true && !tileMeta?.isDragging && !isResizing && !isStaticPreview;
  const showToolbar = showChrome && tileMeta?.isMultiSelect !== true;
  const editedAt = draft?.editedAt ?? style.editedAt;
  const lineCount = draft?.lineCount ?? countWrittenLines(body);
  // An empty note starts editing on its title, otherwise in the body.
  const startsOnTitle = !title && !body;

  const startEditing = useCallback(() => {
    onRequestTextBoxEdit?.(card.id, { selectAll: false });
  }, [card.id, onRequestTextBoxEdit]);

  const gesture = useTileGesture({
    card,
    canDrag: !isEditing,
    onDragStart: onBeginDrag,
    onPressStart: (pressedCard, event) => {
      wasSelectedAtPressRef.current = tileMeta?.isSelected === true;
      return onPressStart?.(pressedCard, event);
    },
    onActivate: () => {
      if (wasSelectedAtPressRef.current && !isEditing) {
        startEditing();
      }
    },
    onDoubleActivate: startEditing,
  });

  // The title is uncontrolled: React never writes it while typing.
  useLayoutEffect(() => {
    if (!isEditing && titleRef.current && titleRef.current.textContent !== title) {
      titleRef.current.textContent = title;
    }
  }, [isEditing, title]);

  // Each edit session starts from the saved text.
  useLayoutEffect(() => {
    if (isEditing) {
      bodyDraftRef.current = !startsOnTitle && typeof textBoxEditorState?.replacementText === "string"
        ? textBoxEditorState.replacementText
        : body;
      exitedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, textBoxEditorState?.requestId]);

  // Entering edit mode on an empty note: focus the title (a key that
  // started editing replaces it). The body editor focuses itself otherwise.
  useEffect(() => {
    const target = titleRef.current;

    if (!isEditing || !startsOnTitle || !target) {
      return undefined;
    }

    if (typeof textBoxEditorState?.replacementText === "string") {
      target.textContent = textBoxEditorState.replacementText;
    }

    const frame = window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      placeCaret(target, textBoxEditorState?.selectAll === true);
    });

    return () => window.cancelAnimationFrame(frame);
    // Only on entering edit mode (or a new request), not as the text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, textBoxEditorState?.replacementText, textBoxEditorState?.requestId, textBoxEditorState?.selectAll]);

  useEffect(() => {
    if (!isEditing) {
      setDraft(null);
      return undefined;
    }

    setCanvasInteractionState?.(true);
    return () => setCanvasInteractionState?.(false);
  }, [isEditing, setCanvasInteractionState]);

  // The note grows down with its text, but card.height is what selection,
  // hit-testing and layout use, so write the rendered height back.
  // offsetHeight is layout size, unaffected by zoom.
  useEffect(() => {
    const root = rootRef.current;

    if (!root || isStaticPreview || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const current = cardRef.current;
      const measured = Math.max(getFolderStickyMinHeight(clampFolderStickyWidth(current.width)), Math.ceil(root.offsetHeight));

      if (Math.abs(measured - (Number.isFinite(current.height) ? current.height : 0)) > 1) {
        // Mid-resize the height follows locally and is committed with the width.
        if (liveRef.current) {
          updateLive({ height: measured });
        } else {
          updateExistingCard(current.id, { height: measured });
        }
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [isStaticPreview, liveRef, updateExistingCard, updateLive]);

  const updateStyle = useCallback((patch) => {
    updateExistingCard(card.id, { sticky: { ...normalizeStickyStyle(card.sticky), ...patch } });
  }, [card.id, card.sticky, updateExistingCard]);

  const commitText = () => {
    // textContent, not innerText: the title is shown uppercase by CSS only.
    const nextTitle = (titleRef.current?.textContent ?? "").replace(/\s*\n\s*/g, " ");
    const nextBody = normalizeBody(bodyDraftRef.current ?? body);

    if (nextTitle !== title || nextBody !== body) {
      updateExistingCard(card.id, {
        title: nextTitle,
        text: nextBody,
        titleMode: CANVAS_TEXT_TITLE_MODE_CUSTOM,
        sticky: { ...style, editedAt: draft?.editedAt ?? new Date().toISOString() },
      });
    }
  };

  // Typing counts as an edit; formatting doesn't.
  const handleTitleInput = (event) => {
    const element = event.currentTarget;

    // A cleared field can keep a stray <br>; empty it so the placeholder shows.
    if (element.innerText === "\n") {
      element.textContent = "";
    }

    setDraft({ editedAt: new Date().toISOString(), lineCount: countWrittenLines(bodyDraftRef.current ?? body) });
  };

  const handleBodyChange = (nextText) => {
    bodyDraftRef.current = nextText;
    setDraft({ editedAt: new Date().toISOString(), lineCount: countWrittenLines(nextText) });
  };

  const finishEditing = ({ restoreCanvasFocus }) => {
    if (exitedRef.current) {
      return;
    }
    exitedRef.current = true;
    commitText();
    window.getSelection()?.removeAllRanges();
    onEndTextBoxEdit?.(card.id, { restoreCanvasFocus });
  };

  // Esc / Mod+Enter in the body, or focus leaving the note entirely.
  const handleBodyExit = ({ reason, relatedTarget }) => {
    if (reason === "blur" && relatedTarget instanceof Node && rootRef.current?.contains(relatedTarget)) {
      return;
    }
    finishEditing({ restoreCanvasFocus: reason === "escape" });
  };

  // Moving between title and body stays in edit mode.
  const handleTitleBlur = (event) => {
    if (rootRef.current?.contains(event.relatedTarget)) {
      return;
    }

    finishEditing({ restoreCanvasFocus: false });
  };

  const handleTitleKeyDown = (event) => {
    const isModifier = event.metaKey || event.ctrlKey;

    if (event.key === "Escape" || (isModifier && event.key === "Enter")) {
      event.preventDefault();
      finishEditing({ restoreCanvasFocus: true });
    } else if (event.key === "Enter") {
      // Titles are one line: Enter moves on to the body.
      event.preventDefault();
      bodyEditorRef.current?.focus("start");
    }
  };

  // While typing, a press in the text moves the caret instead of dragging.
  const handlePointerDown = (event) => {
    if (isEditing && (titleRef.current?.contains(event.target) || bodyRef.current?.contains(event.target))) {
      event.stopPropagation();
      return;
    }

    gesture.onPointerDown(event);
  };

  // Corner handles change the width (everything scales with it); the
  // height follows. A west handle shifts the note so its right edge stays.
  const handleResizePointerDown = (handle, event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const zoom = Math.max(0.1, (rootRef.current?.getBoundingClientRect().width ?? width) / width);
    const start = { x: card.x, width, clientX: event.clientX, pointerId: event.pointerId };
    setCanvasInteractionState?.(true);
    setResizeLabel(`${width}`);

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== start.pointerId) {
        return;
      }

      const nextWidth = clampFolderStickyWidth(start.width + (handle.dirX * (moveEvent.clientX - start.clientX)) / zoom);
      updateLive({
        width: nextWidth,
        x: handle.dirX < 0 ? start.x - (nextWidth - start.width) : start.x,
      });
      setResizeLabel(`${nextWidth}`);
    };

    const finish = (finishEvent) => {
      if (finishEvent && finishEvent.pointerId !== undefined && finishEvent.pointerId !== start.pointerId) {
        return;
      }

      setResizeLabel("");
      commitLive();
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

  const titleProps = {
    role: "textbox",
    "aria-label": "Note title",
    "data-placeholder": "Title",
    // Squiggles only while the note is being written in.
    spellCheck: isEditing,
    contentEditable: isEditing ? "plaintext-only" : "false",
    suppressContentEditableWarning: true,
    onInput: isEditing ? handleTitleInput : undefined,
    onKeyDown: isEditing ? handleTitleKeyDown : undefined,
    onBlur: isEditing ? handleTitleBlur : undefined,
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className="card--folder-sticky"
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
          "folder-note",
          isEditing ? "folder-note--editing" : "",
          isResizing ? "folder-note--resizing" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Folder note"
        data-color={style.color}
        data-align={style.align}
        data-bold={style.bold}
        data-italic={style.italic}
        data-strike={style.strike}
        style={{
          "--folder-k": width / FOLDER_STICKY_BASE_WIDTH,
          "--folder-body-size": `${FOLDER_STICKY_FONT_SIZES[style.fontSize]}px`,
        }}
        {...gesture}
        onPointerDown={handlePointerDown}
      >
        <div className="folder-note__tab" aria-hidden="true">
          <div className="folder-note__tab-label">
            Edited by
            <span className="folder-note__tab-author">{style.author || "You"}</span>
          </div>
          <div className="folder-note__tab-meta">
            <div>{editedAt ? formatTime(editedAt) : "--:--"}</div>
            <div>{editedAt ? formatDate(editedAt) : "--/--/----"}</div>
            <hr />
            <div className="folder-note__tab-count">Lines written: {lineCount}</div>
          </div>
        </div>

        <div className="folder-note__sheet">
          <div ref={titleRef} className="folder-note__title" {...titleProps} />
          <div ref={bodyRef} className="folder-note__body" aria-label="Note text">
            {isEditing ? (
              <NoteTextEditor
                ref={bodyEditorRef}
                key={textBoxEditorState?.requestId ?? "edit"}
                initialText={body}
                replacementText={startsOnTitle ? undefined : textBoxEditorState?.replacementText}
                initialSelection={textBoxEditorState?.selectAll === true ? "all" : "end"}
                autoFocus={!startsOnTitle}
                placeholder="Start typing..."
                onChange={handleBodyChange}
                onExit={handleBodyExit}
              />
            ) : (
              <NoteTextView text={body} placeholder="Start typing..." />
            )}
          </div>
        </div>

        {showChrome ? RESIZE_HANDLES.map((handle) => (
          <span
            key={handle.key}
            className={`folder-note__handle folder-note__handle--${handle.key}`}
            aria-hidden="true"
            onPointerDown={(event) => handleResizePointerDown(handle, event)}
          />
        )) : null}

        {isResizing ? <div className="folder-note__size-label">{resizeLabel}</div> : null}

        {showToolbar ? (
          <FloatingFormatToolbar
            label="Folder note options"
            colors={FOLDER_STICKY_COLORS}
            colorColumns={4}
            color={style.color}
            sizes={SIZE_OPTIONS}
            size={style.fontSize}
            align={style.align}
            bold={style.bold}
            italic={style.italic}
            strike={style.strike}
            onChange={({ size: fontSize, ...patch }) => updateStyle(fontSize ? { ...patch, fontSize } : patch)}
          />
        ) : null}
      </article>
    </TileShell>
  );
}

export default memo(StickyFolderTile);
