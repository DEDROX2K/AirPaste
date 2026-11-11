import { memo } from "react";
import { ConstellationFace } from "../constellation/ConstellationFaces";
import { useTilePreviewSource } from "../../systems/canvas/useTilePreviewSource";
import "../constellation/ConstellationFaces.css";
import "./HomeTiles.css";

// One saved tile as a small paper card, for the Home reel and the canvas peek.
// It reuses Constellation's faces, laid out at their natural size and scaled
// down with `zoom` (so text, padding and corners all shrink together).
const FACE_WIDTH = 360;

function HomeTileCard({ entry, folderPath, width = 180, className = "", style, onClick, tabIndex }) {
  const { src } = useTilePreviewSource({
    card: entry.card,
    folderPath,
    previewTier: "medium",
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  });
  const Element = onClick ? "button" : "div";

  return (
    <Element
      type={onClick ? "button" : undefined}
      className={`ap-home-tile ${className}`}
      style={{ ...style, "--ap-home-tile-w": `${width}px` }}
      onClick={onClick}
      tabIndex={tabIndex}
      title={onClick ? `Open in ${entry.canvasName}` : undefined}
    >
      <span className="ap-home-tile__face" style={{ width: FACE_WIDTH, zoom: width / FACE_WIDTH }}>
        <ConstellationFace card={entry.card} imageSrc={src || ""} />
      </span>
    </Element>
  );
}

export default memo(HomeTileCard);
