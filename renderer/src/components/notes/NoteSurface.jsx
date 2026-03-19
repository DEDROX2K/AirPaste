import { useEffect, useRef, useState } from "react";
import { getMagnifiedTextNoteStyle, getTextNoteVariant } from "./noteUtils";
import NoteVariantOne from "./NoteVariantOne";
import NoteVariantQuick from "./NoteVariantQuick";
import NoteVariantTwo from "./NoteVariantTwo";
import NoteVariantThree from "./NoteVariantThree";

export default function NoteSurface({
  card,
  mode,
  noteTimestamp,
  onTextChange,
  surfaceProps = null,
  headerProps = null,
  initialSplit = false,
  onRequestMagnify,
}) {
  const previewBodyRef = useRef(null);
  const [showPreviewFade, setShowPreviewFade] = useState(false);
  const [isSplit, setIsSplit] = useState(Boolean(initialSplit));
  const variant = getTextNoteVariant(card);
  const isEditable = mode !== "preview";
  const isMagnified = mode === "magnified";

  useEffect(() => {
    setIsSplit(Boolean(initialSplit));
  }, [card.id, initialSplit]);

  useEffect(() => {
    if (variant !== "note2" || isEditable) {
      setShowPreviewFade(false);
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const previewBody = previewBodyRef.current;

      if (!previewBody) {
        return;
      }

      setShowPreviewFade(previewBody.scrollHeight - previewBody.clientHeight > 6);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [card.height, card.text, isEditable, variant]);

  const surfaceClassName = [
    "card__surface",
    "card__surface--text",
    variant === "note1"
      ? "card__surface--text-note"
      : variant === "quick"
        ? "card__surface--text-quick"
      : variant === "note3"
        ? "card__surface--text-note3"
        : "card__surface--text-note2",
    mode === "preview" ? "card__surface--text-draggable" : "",
    isMagnified ? "card__surface--text-magnified" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const surfaceStyle = isMagnified
    ? {
      "--note-surface-width": getMagnifiedTextNoteStyle(card, isSplit).width,
      "--note-surface-height": getMagnifiedTextNoteStyle(card, isSplit).height,
    }
    : {
      "--note-surface-width": `${card.width}px`,
      "--note-surface-height": `${card.height}px`,
    };

  return (
    <div
      className={surfaceClassName}
      style={surfaceStyle}
      {...(surfaceProps ?? {})}
    >
      {variant === "note1" ? (
        <NoteVariantOne
          card={card}
          isEditable={isEditable}
          noteTimestamp={noteTimestamp}
          headerProps={headerProps}
          onTextChange={onTextChange}
        />
      ) : variant === "quick" ? (
        <NoteVariantQuick
          card={card}
          isEditable={isEditable}
          noteTimestamp={noteTimestamp}
          headerProps={headerProps}
          onTextChange={onTextChange}
        />
      ) : variant === "note3" ? (
        <NoteVariantThree
          card={card}
          isEditable={isEditable}
          headerProps={headerProps}
          onTextChange={onTextChange}
        />
      ) : (
        <NoteVariantTwo
          card={card}
          isEditable={isEditable}
          isMagnified={isMagnified}
          noteTimestamp={noteTimestamp}
          headerProps={headerProps}
          onTextChange={onTextChange}
          previewBodyRef={previewBodyRef}
          showPreviewFade={showPreviewFade}
          isSplit={isSplit}
          onSplitToggle={() => setIsSplit((currentValue) => !currentValue)}
          onRequestSplitMagnify={() => onRequestMagnify?.(card.id, { startSplit: true })}
        />
      )}
    </div>
  );
}
