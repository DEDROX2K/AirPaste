import "./CanvasSnapGuides.css";

// Lines showing what a dragged tile snapped to (see tileMagnetSnapping.js).
// Drawn in world space inside .canvas__content; their thickness stays one
// screen pixel at any zoom.
export default function CanvasSnapGuides({ guides }) {
  if (!guides || guides.length === 0) {
    return null;
  }

  return (
    <div className="snap-guides" aria-hidden="true">
      {guides.map((guide, index) => {
        const length = guide.to - guide.from;
        const style = guide.orientation === "vertical"
          ? { left: `${guide.position}px`, top: `${guide.from}px`, height: `${length}px` }
          : { top: `${guide.position}px`, left: `${guide.from}px`, width: `${length}px` };

        return (
          <span
            // Guides are rebuilt every frame and never reordered.
            key={index}
            className={`snap-guides__line snap-guides__line--${guide.orientation} snap-guides__line--${guide.kind}`}
            style={style}
          />
        );
      })}
    </div>
  );
}
