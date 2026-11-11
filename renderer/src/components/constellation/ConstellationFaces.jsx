import { getSerendipityKind, getStickyHex } from "../../lib/serendipity";
import { formatCardSubtitle, getDomainLabel } from "../../lib/workspace";
import { useTilePreviewSource } from "../../systems/canvas/useTilePreviewSource";
import { Check } from "../ui/icons";

const CODE_PREVIEW_LINES = 14;
const CHECKLIST_PREVIEW_ITEMS = 7;

// The picture a tile shows, at full size, for the opened tile.
export function useCardImage(card, folderPath) {
  const { src } = useTilePreviewSource({
    card,
    folderPath,
    previewTier: "original",
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  });
  return src || "";
}

function SerendipityImageFace({ card, imageSrc }) {
  return (
    <div className="ap-seren-face ap-seren-face--image">
      {imageSrc ? (
        <img src={imageSrc} alt={card.title || "Saved image"} draggable={false} />
      ) : (
        <div className="ap-seren-face__missing">Image unavailable</div>
      )}
    </div>
  );
}

function SerendipityLinkFace({ card, imageSrc }) {
  const domain = card.siteName || getDomainLabel(card.url);
  return (
    <div className={`ap-seren-face ap-seren-face--link${imageSrc ? "" : " is-text-only"}`}>
      {imageSrc ? (
        <div className="ap-seren-face__media">
          <img src={imageSrc} alt="" draggable={false} />
        </div>
      ) : null}
      <div className="ap-seren-face__body">
        <div className="ap-seren-face__domain">
          {card.favicon ? <img src={card.favicon} alt="" draggable={false} /> : null}
          <span>{domain}</span>
        </div>
        <h2 className="ap-seren-face__title">{card.title || card.url}</h2>
        {card.description ? <p className="ap-seren-face__description">{card.description}</p> : null}
      </div>
    </div>
  );
}

function SerendipityNoteFace({ card }) {
  return (
    <div className="ap-seren-face ap-seren-face--note">
      {card.title ? <h2 className="ap-seren-face__title">{card.title}</h2> : null}
      {card.subtitle ? <p className="ap-seren-face__subtitle">{card.subtitle}</p> : null}
      {card.text ? <p className="ap-seren-face__text">{card.text}</p> : null}
    </div>
  );
}

function SerendipityStickyFace({ card }) {
  return (
    <div className="ap-seren-face ap-seren-face--sticky" style={{ "--ap-seren-sticky": getStickyHex(card) }}>
      {card.title ? <h2 className="ap-seren-face__title">{card.title}</h2> : null}
      <p className="ap-seren-face__text">{card.text}</p>
    </div>
  );
}

function SerendipityCodeFace({ card }) {
  const lines = String(card.code ?? "").split(/\r?\n/);
  return (
    <div className="ap-seren-face ap-seren-face--code">
      <div className="ap-seren-face__code-bar">
        <span>{card.title || "Snippet"}</span>
        <span>{card.language}</span>
      </div>
      <pre>{lines.slice(0, CODE_PREVIEW_LINES).join("\n")}{lines.length > CODE_PREVIEW_LINES ? "\n…" : ""}</pre>
    </div>
  );
}

function SerendipityChecklistFace({ card }) {
  const items = card.items.filter((item) => item.text.trim());
  return (
    <div className="ap-seren-face ap-seren-face--checklist">
      {card.title ? <h2 className="ap-seren-face__title">{card.title}</h2> : null}
      <ul>
        {items.slice(0, CHECKLIST_PREVIEW_ITEMS).map((item) => (
          <li key={item.id} className={item.checked ? "is-checked" : ""}>
            <span className="ap-seren-face__check" aria-hidden="true">{item.checked ? <Check size={12} /> : null}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      {items.length > CHECKLIST_PREVIEW_ITEMS ? (
        <p className="ap-seren-face__more">+{items.length - CHECKLIST_PREVIEW_ITEMS} more</p>
      ) : null}
    </div>
  );
}

function SerendipityFileFace({ card }) {
  return (
    <div className="ap-seren-face ap-seren-face--file">
      <div className="ap-seren-face__file-badge">{card.file?.extension ? `.${card.file.extension}` : "file"}</div>
      <h2 className="ap-seren-face__title">{card.file?.fileName || card.title}</h2>
      <p className="ap-seren-face__subtitle">{formatCardSubtitle(card)}</p>
    </div>
  );
}

export function ConstellationFace({ card, imageSrc }) {
  switch (getSerendipityKind(card)) {
    case "image": return <SerendipityImageFace card={card} imageSrc={imageSrc} />;
    case "link": return <SerendipityLinkFace card={card} imageSrc={imageSrc} />;
    case "sticky": return <SerendipityStickyFace card={card} />;
    case "code": return <SerendipityCodeFace card={card} />;
    case "checklist": return <SerendipityChecklistFace card={card} />;
    case "file": return <SerendipityFileFace card={card} />;
    default: return <SerendipityNoteFace card={card} />;
  }
}
