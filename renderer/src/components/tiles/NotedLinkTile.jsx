import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useToast } from "../../hooks/useToast";
import { desktop } from "../../lib/desktop";
import { LINK_CONTENT_KIND_IMAGE } from "../../lib/workspace";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { useTilePreviewSource } from "../../systems/canvas/useTilePreviewSource";
import {
  LINK_NOTE_BASE_MEDIA_WIDTH,
  LINK_NOTE_CARD_PADDING,
  normalizeLinkNote,
} from "../../tiles/link/notedLink";
import { NotebookText } from "../ui/icons";
import TileShell from "./TileShell";
import "./NotedLinkTile.css";

// A link or image tile with a note (see tiles/link/notedLink.js): the
// image in a dark card, an editable title and text below that grow the
// tile downward, and a notch with a note icon that peeks out above on
// hover. It opens with an animation when the note is added. Double-click
// the image to open the link; click (once selected) or double-click the
// note to write.

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function readBody(element) {
  return (element?.innerText ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function NotedLinkTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
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
  const { folderPath, setCanvasInteractionState, updateExistingCard } = useAppContext();
  const note = normalizeLinkNote(card.note) ?? { title: "", body: "", mediaWidth: card.width, mediaHeight: card.height };
  // The image's width inside the card: the card is the image plus padding
  // on three sides.
  const mediaWidth = card.width / (1 + ((2 * LINK_NOTE_CARD_PADDING) / LINK_NOTE_BASE_MEDIA_WIDTH));
  const k = mediaWidth / LINK_NOTE_BASE_MEDIA_WIDTH;
  const isStaticPreview = renderHint?.isStaticPreview === true;
  const [isRevealed, setRevealed] = useState(isStaticPreview);
  const [editingField, setEditingField] = useState(null);
  const isEditing = editingField !== null;
  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const cardRef = useRef(card);
  cardRef.current = card;
  const wasSelectedAtPressRef = useRef(false);
  const pressedFieldRef = useRef(null);
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

    const frame = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(frame);
  }, [isStaticPreview]);

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
        updateExistingCard(current.id, { height: measured });
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [isStaticPreview, updateExistingCard]);

  // Title and body are uncontrolled: React never writes them while typing.
  useLayoutEffect(() => {
    if (isEditing) {
      return;
    }
    if (titleRef.current && titleRef.current.textContent !== title) {
      titleRef.current.textContent = title;
    }
    if (bodyRef.current && readBody(bodyRef.current) !== body) {
      bodyRef.current.textContent = body;
    }
  }, [body, isEditing, title]);

  // Entering edit mode: caret at the end of the field that was pressed.
  useEffect(() => {
    const element = editingField === "title" ? titleRef.current : editingField === "body" ? bodyRef.current : null;

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
    const nextTitle = (titleRef.current?.textContent ?? "").replace(/\s*\n\s*/g, " ");
    const nextBody = readBody(bodyRef.current);

    if (nextTitle !== title || nextBody !== body) {
      updateExistingCard(card.id, { note: { ...note, title: nextTitle, body: nextBody } });
    }
  };

  // Moving between title and body stays in edit mode.
  const handleBlur = (event) => {
    if (rootRef.current?.contains(event.relatedTarget)) {
      return;
    }

    commitNote();
    window.getSelection()?.removeAllRanges();
    setEditingField(null);
  };

  const handleInput = (event) => {
    // A cleared field can keep a stray <br>; empty it so the placeholder shows.
    if (event.currentTarget.innerText === "\n") {
      event.currentTarget.textContent = "";
    }
  };

  const handleKeyDown = (event) => {
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Enter" && event.currentTarget === titleRef.current) {
      event.preventDefault();
      bodyRef.current?.focus({ preventScroll: true });
      placeCaretAtEnd(bodyRef.current);
    }
  };

  const editableProps = (label, placeholder) => ({
    role: "textbox",
    "aria-label": label,
    "data-placeholder": placeholder,
    spellCheck: false,
    contentEditable: isEditing ? "plaintext-only" : "false",
    suppressContentEditableWarning: true,
    onInput: isEditing ? handleInput : undefined,
    onKeyDown: isEditing ? handleKeyDown : undefined,
    onBlur: isEditing ? handleBlur : undefined,
  });

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
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
          isRevealed ? "noted-link--revealed" : "",
          isEditing ? "noted-link--editing" : "",
        ].filter(Boolean).join(" ")}
        aria-label={card.title ? `${card.title} with a note` : "Image with a note"}
        style={{ "--nl-k": k, "--nl-media-height": `${mediaHeight}px` }}
        {...gesture}
        onPointerDown={handlePointerDown}
      >
        <div className="noted-link__notch" aria-hidden="true">
          <svg viewBox="0 0 192 66" preserveAspectRatio="none">
            <path d="M0,66 C12,66 26,62 38,44 C46,32 48,0 62,0 H130 C144,0 146,32 154,44 C166,62 180,66 192,66 Z" />
          </svg>
          <span className="noted-link__notch-icon">
            <NotebookText size={22} />
          </span>
        </div>

        <div className="noted-link__card">
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

          <div className="noted-link__note">
            <div className="noted-link__note-inner">
              <div className="noted-link__text">
                <div ref={titleRef} className="noted-link__title" {...editableProps("Note title", "Note title here")} />
                <div
                  ref={bodyRef}
                  className="noted-link__body"
                  aria-multiline="true"
                  {...editableProps("Note", "Start writing…")}
                />
              </div>
            </div>
          </div>
        </div>
      </article>
    </TileShell>
  );
}

export default memo(NotedLinkTile);
