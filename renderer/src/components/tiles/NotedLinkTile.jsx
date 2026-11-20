import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTileAppContext } from "../../context/TileAppContext";
import { useToast } from "../../hooks/useToast";
import { desktop } from "../../lib/desktop";
import { LINK_CONTENT_KIND_IMAGE } from "../../lib/workspace";
import { useLiveTileGeometry } from "../../systems/interactions/useLiveTileGeometry";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { useTilePreviewSource } from "../../systems/canvas/useTilePreviewSource";
import {
  LINK_NOTE_BASE_MEDIA_WIDTH,
  LINK_NOTE_VARIANT_SHORT,
  getNotePanelResizePatch,
  getNotedLinkMediaWidth,
  getSideNoteLayout,
  getSideNoteOutlinePath,
  normalizeLinkNote,
} from "../../tiles/link/notedLink";
import { NoteTextEditor, NoteTextView } from "../noteText/NoteText";
import { NotebookText } from "../ui/icons";
import TileShell from "./TileShell";
import "./NotedLinkTile.css";

// A link or image tile with a note (see tiles/link/notedLink.js).
//   Long note: the image in a frame with a note panel (title and body) to
//   its right, joined by curved edge connectors above and below; the panel
//   grows downward as you write.
//   Short note: a yellow card around the image with the body below it (the
//   title is kept for when it's long again), and a notch with a note icon
//   that peeks out above on hover.
// Each opens with an animation. Double-click the image to open the link;
// click (once selected) or double-click the note to write. A selected long
// note has a handle on its right edge that drags the panel narrower or
// wider, also while writing.

// The edge connector (the design's 104.572 square with a quarter circle cut
// from its top-left) filling the corner where the image frame meets the
// note frame. It carries a 2-unit strip on its right and bottom that runs
// on under both frames, so their edges never leave a hairline seam.
// CSS sizes the box at join * 106.572 / 104.572 (--nl-join-scale).
const EDGE_CONNECTOR_SIZE = 106.572;
const EDGE_CONNECTOR_PATH = "M0 104.572C57.7537 104.572 104.572 57.7537 104.572 0H106.572V106.572H0Z";
// Gap between the long note's shape and its hover/selection ring, canvas px.
const SIDE_RING_GAP = 5;

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeBody(text) {
  return (text ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function NotedLinkTile({
  card: committedCard,
  tileMeta: committedTileMeta,
  viewportZoom,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onOpenLink,
  onPressStart,
  renderHint,
}) {
  const { toast } = useToast();
  const { folderPath, setCanvasInteractionState, updateExistingCard } = useTileAppContext();
  // Dragging the panel's edge previews here and commits once on release.
  const { card, tileMeta, updateLive, commitLive, liveRef } = useLiveTileGeometry(committedCard, committedTileMeta);
  const note = normalizeLinkNote(card.note) ?? { title: "", body: "", mediaWidth: card.width, mediaHeight: card.height };
  const isShort = note.variant === LINK_NOTE_VARIANT_SHORT;
  // The image's width inside the tile: the tile scales with it.
  const mediaWidth = getNotedLinkMediaWidth(note.variant, card.width, note.panelWidth);
  const panelResizeRef = useRef(null);
  const [isPanelResizing, setPanelResizing] = useState(false);
  const k = mediaWidth / LINK_NOTE_BASE_MEDIA_WIDTH;
  const isStaticPreview = renderHint?.isStaticPreview === true;
  // Revealed per variant, so switching long <-> short plays the opening again.
  const [revealedVariant, setRevealedVariant] = useState(isStaticPreview ? note.variant : null);
  const isRevealed = isStaticPreview || revealedVariant === note.variant;
  // The long note frame's rendered height, for the ring around its shape.
  const [sideNoteHeight, setSideNoteHeight] = useState(0);
  const sideNoteRef = useRef(null);
  const [editingField, setEditingField] = useState(null);
  const isEditing = editingField !== null;
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const bodyEditorRef = useRef(null);
  // The body editor is uncontrolled; this holds what's typed this session.
  const bodyDraftRef = useRef(null);
  const cardRef = useRef(card);
  cardRef.current = card;
  const wasSelectedAtPressRef = useRef(false);
  const pressedFieldRef = useRef(null);
  const bodyPlaceholder = isShort ? "Write a note…" : "Start writing…";
  const title = note.title;
  const body = note.body;
  const { src: previewSource } = useTilePreviewSource({
    card,
    folderPath,
    previewTier: renderHint?.previewTier ?? "original",
    imageEnabled: renderHint?.imageEnabled !== false,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  });
  // A link in webclip mode keeps showing its webclip, like LinkTile.
  const isImageTile = card.contentKind === LINK_CONTENT_KIND_IMAGE;
  const isWebclipMode = !isImageTile && card.previewMode === "webclip" && Boolean(card.webclipImagePath);
  const [webclipSrc, setWebclipSrc] = useState("");
  const mediaSrc = isWebclipMode ? webclipSrc : isImageTile ? (previewSource || card.image) : previewSource;
  const [hasImageError, setHasImageError] = useState(false);
  // The picture's own proportions once loaded, kept with its source so a
  // new source never uses an old picture's.
  const [loaded, setLoaded] = useState(null);
  const loadedAspect = loaded?.src === mediaSrc ? loaded.aspect : null;
  // The image is never cropped: it shows at its own proportions (or the
  // ones recorded for it, until it loads).
  const knownAspect = isWebclipMode ? card.webclipAspectRatio : card.mediaAspectRatio;
  const mediaAspect = loadedAspect
    ?? (Number.isFinite(knownAspect) && knownAspect > 0 ? knownAspect : note.mediaWidth / note.mediaHeight);
  const mediaHeight = mediaWidth / mediaAspect;
  const side = isShort ? null : getSideNoteLayout(mediaWidth, mediaHeight, note.panelWidth);

  useEffect(() => {
    setHasImageError(false);
  }, [mediaSrc]);

  useEffect(() => {
    if (!isWebclipMode) {
      setWebclipSrc("");
      return undefined;
    }

    let cancelled = false;

    desktop.workspace.resolveAssetUrl(folderPath, card.webclipImagePath).then((resolvedUrl) => {
      if (!cancelled) {
        setWebclipSrc(resolvedUrl || "");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [card.webclipImagePath, folderPath, isWebclipMode]);

  const handleMediaLoad = (event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;

    if (naturalWidth > 0 && naturalHeight > 0) {
      setLoaded({ src: mediaSrc, aspect: naturalWidth / naturalHeight });
    }
  };

  // Opens with the animation: the first frame is the plain link look.
  useEffect(() => {
    if (isStaticPreview) {
      return undefined;
    }

    const variant = note.variant;
    const frame = window.requestAnimationFrame(() => setRevealedVariant(variant));
    return () => window.cancelAnimationFrame(frame);
  }, [isStaticPreview, note.variant]);

  // The ring around the long note's shape needs the note frame's height.
  useLayoutEffect(() => {
    const element = sideNoteRef.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    setSideNoteHeight(element.offsetHeight);
    const observer = new ResizeObserver(() => setSideNoteHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [isShort]);

  // The tile grows down with its note, but card.height is what selection,
  // hit-testing and layout use, so write the rendered height back.
  // offsetHeight is layout size, unaffected by zoom.
  useEffect(() => {
    const root = rootRef.current;

    if (!root || isStaticPreview || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const current = cardRef.current;
      const measured = Math.ceil(root.offsetHeight);

      if (measured > 0 && Math.abs(measured - (Number.isFinite(current.height) ? current.height : 0)) > 1) {
        // Mid-drag the height follows locally and is committed with the width.
        if (liveRef.current) {
          updateLive({ height: measured });
          return;
        }
        updateExistingCard(current.id, { height: measured });
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [isStaticPreview, liveRef, updateExistingCard, updateLive]);

  // The title is uncontrolled: React never writes it while typing.
  useLayoutEffect(() => {
    if (!isEditing && titleRef.current && titleRef.current.textContent !== title) {
      titleRef.current.textContent = title;
    }
  }, [isEditing, title]);

  // Each writing session starts from the saved body.
  useLayoutEffect(() => {
    if (isEditing) {
      bodyDraftRef.current = body;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Writing in the title: caret at its end. (The body editor focuses itself.)
  useEffect(() => {
    const element = editingField === "title" ? titleRef.current : null;

    if (!element) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      placeCaretAtEnd(element);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingField]);

  useEffect(() => {
    if (!isEditing) {
      return undefined;
    }

    setCanvasInteractionState?.(true);
    return () => setCanvasInteractionState?.(false);
  }, [isEditing, setCanvasInteractionState]);

  // Deselecting the tile ends writing.
  useEffect(() => {
    if (!tileMeta?.isSelected && isEditing) {
      document.activeElement?.blur?.();
    }
  }, [isEditing, tileMeta?.isSelected]);

  const openLink = async () => {
    try {
      await onOpenLink?.(card);
    } catch {
      toast("error", "Could not open link");
    }
  };

  const getFieldAt = (target) => {
    const noteText = target?.closest?.(".noted-link__text");

    if (!noteText || !rootRef.current?.contains(noteText)) {
      return null;
    }

    return titleRef.current?.contains(target) ? "title" : "body";
  };

  const gesture = useTileGesture({
    card,
    canDrag: !isEditing,
    onDragStart: onBeginDrag,
    // The gesture captures the pointer on the whole tile, so later click
    // events target the tile; where the press began is the reliable spot.
    onPressStart: (pressedCard, event) => {
      wasSelectedAtPressRef.current = tileMeta?.isSelected === true;
      pressedFieldRef.current = getFieldAt(event.target);
      return onPressStart?.(pressedCard, event);
    },
    onActivate: () => {
      if (wasSelectedAtPressRef.current && pressedFieldRef.current && !isEditing) {
        setEditingField(pressedFieldRef.current);
      }
    },
    onDoubleActivate: () => {
      if (pressedFieldRef.current) {
        setEditingField(pressedFieldRef.current);
      } else if (!isEditing) {
        void openLink();
      }
    },
  });

  // While writing, a press in the text moves the caret instead of dragging.
  const handlePointerDown = (event) => {
    if (isEditing && (titleRef.current?.contains(event.target) || bodyRef.current?.contains(event.target))) {
      event.stopPropagation();
      return;
    }

    gesture.onPointerDown(event);
  };

  const commitNote = () => {
    // textContent, not innerText: the title is shown uppercase by CSS only.
    // A short note has no title field; its saved title is left alone.
    const nextTitle = titleRef.current
      ? titleRef.current.textContent.replace(/\s*\n\s*/g, " ")
      : title;
    const nextBody = normalizeBody(bodyDraftRef.current ?? body);

    if (nextTitle !== title || nextBody !== body) {
      updateExistingCard(card.id, { note: { ...note, title: nextTitle, body: nextBody } });
    }
  };

  const finishWriting = () => {
    commitNote();
    window.getSelection()?.removeAllRanges();
    setEditingField(null);
  };

  // Moving between title and body stays in edit mode.
  const handleTitleBlur = (event) => {
    if (rootRef.current?.contains(event.relatedTarget)) {
      return;
    }

    finishWriting();
  };

  // Esc / Mod+Enter in the body, or focus leaving the note entirely.
  const handleBodyExit = ({ reason, relatedTarget }) => {
    if (reason === "blur" && relatedTarget instanceof Node && rootRef.current?.contains(relatedTarget)) {
      return;
    }
    finishWriting();
  };

  const handleTitleInput = (event) => {
    // A cleared field can keep a stray <br>; empty it so the placeholder shows.
    if (event.currentTarget.innerText === "\n") {
      event.currentTarget.textContent = "";
    }
  };

  const handleTitleKeyDown = (event) => {
    event.stopPropagation();

    if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
      event.preventDefault();
      finishWriting();
    } else if (event.key === "Enter") {
      // Titles are one line: Enter moves on to the body.
      event.preventDefault();
      bodyEditorRef.current?.focus("end");
    }
  };

  // The long note's right-edge handle: drag to make the panel narrower or
  // wider. The image stays put; the text reflows and the tile's height
  // follows. Works while writing too (the editor keeps focus).
  const handlePanelResizePointerDown = (event) => {
    if (event.button !== 0 || !side) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const zoom = Math.max(0.05, viewportZoom ?? 1);
    panelResizeRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      // Panel width at k = 1, and canvas px per k = 1 unit.
      startPanelWidth: side.panelWidth / side.k,
      k: side.k,
      mediaWidth,
    };
    setPanelResizing(true);
    setCanvasInteractionState?.(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const handlePointerMove = (moveEvent) => {
      const state = panelResizeRef.current;

      if (!state || state.pointerId !== moveEvent.pointerId) {
        return;
      }

      const deltaX = (moveEvent.clientX - state.startClientX) / zoom;
      const patch = getNotePanelResizePatch(
        cardRef.current,
        state.mediaWidth,
        state.startPanelWidth + (deltaX / state.k),
      );

      if (patch) {
        updateLive(patch);
      }
    };

    const finishResize = (finishEvent) => {
      const state = panelResizeRef.current;

      if (!state || (finishEvent?.pointerId !== undefined && state.pointerId !== finishEvent.pointerId)) {
        return;
      }

      panelResizeRef.current = null;
      commitLive();
      setPanelResizing(false);
      // Writing keeps the canvas locked; otherwise release it.
      if (!isEditingRef.current) {
        setCanvasInteractionState?.(false);
      }
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", finishResize, true);
      window.removeEventListener("pointercancel", finishResize, true);
      window.removeEventListener("blur", finishResize);
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", finishResize, true);
    window.addEventListener("pointercancel", finishResize, true);
    window.addEventListener("blur", finishResize);
  };

  const titleProps = {
    role: "textbox",
    "aria-label": "Note title",
    "data-placeholder": "Note title here",
    // Squiggles only while the note is being written in.
    spellCheck: isEditing,
    contentEditable: isEditing ? "plaintext-only" : "false",
    suppressContentEditableWarning: true,
    onInput: isEditing ? handleTitleInput : undefined,
    onKeyDown: isEditing ? handleTitleKeyDown : undefined,
    onBlur: isEditing ? handleTitleBlur : undefined,
  };

  const media = (
    <div className="noted-link__media">
      {mediaSrc && !hasImageError && renderHint?.imageEnabled !== false ? (
        <img
          src={mediaSrc}
          alt={card.title || ""}
          draggable={false}
          decoding="async"
          onLoad={handleMediaLoad}
          onError={() => setHasImageError(true)}
        />
      ) : null}
    </div>
  );

  const noteText = (
    <div className="noted-link__text">
      {isShort ? null : <div ref={titleRef} className="noted-link__title" {...titleProps} />}
      <div ref={bodyRef} className="noted-link__body" aria-label="Note">
        {isEditing ? (
          <NoteTextEditor
            ref={bodyEditorRef}
            initialText={body}
            initialSelection="end"
            autoFocus={editingField === "body"}
            placeholder={bodyPlaceholder}
            onChange={(nextText) => { bodyDraftRef.current = nextText; }}
            onExit={handleBodyExit}
          />
        ) : (
          <NoteTextView text={body} placeholder={bodyPlaceholder} />
        )}
      </div>
    </div>
  );

  const px = (value) => `${value}px`;
  const ringHeight = Math.max(sideNoteHeight, side?.minHeight ?? 0);

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      className="card--noted-link"
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
          "noted-link",
          isShort ? "noted-link--short" : "noted-link--side",
          isRevealed ? "noted-link--revealed" : "",
          isEditing ? "noted-link--editing" : "",
          isPanelResizing ? "noted-link--panel-resizing" : "",
        ].filter(Boolean).join(" ")}
        aria-label={card.title ? `${card.title} with a note` : "Image with a note"}
        style={side ? {
          "--nl-k": k,
          "--nl-width": px(side.width),
          "--nl-media-width": px(mediaWidth),
          "--nl-media-height": px(mediaHeight),
          "--nl-pad": px(side.pad),
          "--nl-frame": px(side.frame),
          "--nl-tile-top": px(side.tileTop),
          "--nl-tile-height": px(side.tileHeight),
          "--nl-note-left": px(side.noteLeft),
          "--nl-min-height": px(side.minHeight),
          "--nl-top-join": px(side.topJoin),
          "--nl-bottom-join": px(side.bottomJoin),
          "--nl-outer-radius": px(side.outerRadius),
          "--nl-inner-radius": px(side.innerRadius),
        } : { "--nl-k": k, "--nl-media-height": px(mediaHeight) }}
        {...gesture}
        onPointerDown={handlePointerDown}
      >
        {side ? (
          <>
            <svg
              className="noted-link__ring"
              aria-hidden="true"
              width={side.width}
              height={ringHeight}
              viewBox={`0 0 ${side.width} ${ringHeight}`}
            >
              <path d={getSideNoteOutlinePath(side, ringHeight, SIDE_RING_GAP)} />
            </svg>

            <div className="noted-link__frame" aria-hidden="true" />
            {["top", "bottom"].map((edge) => (
              <svg
                key={edge}
                className={`noted-link__join noted-link__join--${edge}`}
                aria-hidden="true"
                viewBox={`0 0 ${EDGE_CONNECTOR_SIZE} ${EDGE_CONNECTOR_SIZE}`}
                preserveAspectRatio="none"
              >
                <path d={EDGE_CONNECTOR_PATH} />
              </svg>
            ))}

            {media}

            <div ref={sideNoteRef} className="noted-link__side-note">
              <div className="noted-link__panel">{noteText}</div>
            </div>

            {(tileMeta?.isSelected || isEditing || isPanelResizing) && !isStaticPreview ? (
              <div
                className="noted-link__panel-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize note width"
                onPointerDown={handlePanelResizePointerDown}
                // Keeps the editor focused, so you can resize mid-sentence.
                onMouseDown={(event) => event.preventDefault()}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="noted-link__notch" aria-hidden="true">
              <svg viewBox="0 0 192 66" preserveAspectRatio="none">
                <path d="M0,66 C12,66 26,62 38,44 C46,32 48,0 62,0 H130 C144,0 146,32 154,44 C166,62 180,66 192,66 Z" />
              </svg>
              <span className="noted-link__notch-icon">
                <NotebookText size={22} />
              </span>
            </div>

            <div className="noted-link__card">
              {media}
              <div className="noted-link__note">
                <div className="noted-link__note-inner">{noteText}</div>
              </div>
            </div>
          </>
        )}
      </article>
    </TileShell>
  );
}

export default memo(NotedLinkTile);
