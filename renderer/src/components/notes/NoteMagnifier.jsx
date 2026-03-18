import { useEffect } from "react";
import NoteSurface from "./NoteSurface";
import { formatNoteTimestamp } from "./noteUtils";

export default function NoteMagnifier({
  card,
  initialSplit = false,
  onClose,
  onTextChange,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!card) {
    return null;
  }

  return (
    <div className="note-magnifier" role="dialog" aria-modal="true" aria-label="Magnified note">
      <button
        className="note-magnifier__backdrop"
        type="button"
        aria-label="Close magnified note"
        onClick={onClose}
      />
      <div
        className="note-magnifier__panel"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <NoteSurface
          card={card}
          mode="magnified"
          noteTimestamp={formatNoteTimestamp(card.updatedAt || card.createdAt)}
          onTextChange={onTextChange}
          initialSplit={initialSplit}
        />
      </div>
    </div>
  );
}
