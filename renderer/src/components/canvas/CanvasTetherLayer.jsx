import { memo } from "react";

// The tether lines: straight, centre to centre, in a layer UNDER the tiles
// so only the part between two tiles shows (never clipped at a border, any
// tile shape works). Positions are written by useTetherSystem every frame
// while something moves; React only decides which lines exist and how
// they look (hover, focus). Only the wide invisible "hit" lines take the
// pointer: hover turns a line red with a scissors cursor, a press cuts it.
function CanvasTetherLayer({
  svgRef,
  tethers,
  hotLinkId,
  focusTileId,
  gesture,
  onHotLinkChange,
  onCutLink,
}) {
  return (
    <svg ref={svgRef} className="tether-layer" aria-hidden="true">
      <g data-tether-rings>
        {gesture ? <rect className="tether-layer__ring" data-tether-ring="source" /> : null}
        {gesture?.targetId ? <rect className="tether-layer__ring tether-layer__ring--glow" data-tether-ring="glow" /> : null}
        {gesture?.targetId ? <rect className="tether-layer__ring" data-tether-ring="target" /> : null}
      </g>
      {(tethers ?? []).map((tether) => {
        const touchesFocus = Boolean(focusTileId) && (tether.a === focusTileId || tether.b === focusTileId);
        const className = [
          "tether-layer__link",
          tether.id === hotLinkId ? "tether-layer__link--hot" : "",
          touchesFocus ? "tether-layer__link--active" : "",
        ].filter(Boolean).join(" ");

        return (
          <g key={tether.id} className={className} data-tether-link={tether.id}>
            <line className="tether-layer__line" data-role="line" />
            <line
              className="tether-layer__hit"
              data-role="hit"
              onPointerEnter={() => onHotLinkChange(tether.id)}
              onPointerLeave={() => onHotLinkChange(null)}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                onCutLink(tether.id, event);
              }}
            />
          </g>
        );
      })}
      {gesture ? (
        <>
          <line
            className={`tether-layer__preview${gesture.targetId ? " tether-layer__preview--snapped" : ""}`}
            data-tether-preview
          />
          {gesture.targetId ? null : <circle className="tether-layer__preview-dot" data-tether-preview-dot />}
        </>
      ) : null}
      <g data-tether-snaps />
    </svg>
  );
}

export default memo(CanvasTetherLayer);
