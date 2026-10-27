import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./FloatingFormatToolbar.css";

const EDGE_MARGIN = 8;
const ALIGNS = ["left", "center", "right"];

function Chevron() {
  return (
    <svg className="format-toolbar__chevron" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 3l2.5 2.5L6.5 3" />
    </svg>
  );
}

const ALIGN_ICON_PATHS = {
  left: "M2.5 4h11M2.5 8h7M2.5 12h10",
  center: "M2.5 4h11M4.5 8h7M3 12h10",
  right: "M2.5 4h11M6.5 8h7M3.5 12h10",
};

// Keeps the text focused while editing: toolbar presses never take focus,
// and never reach the tile (which would start a drag).
const keepFocus = {
  onMouseDown: (event) => event.preventDefault(),
  onPointerDown: (event) => event.stopPropagation(),
  onDoubleClick: (event) => event.stopPropagation(),
};

// The dark Figma-style toolbar for text tiles. Each tile supplies its own
// colours and sizes; everything it changes comes back through onChange as
// one of { color, size, align, bold, italic, strike }.
//   colors       [{ id, name, hex }], shown colorColumns per row
//   sizes        [{ id, label, hint? }]; size is the current id (or null)
//   strike       omit to leave the strikethrough button out
//   gap          screen px between the tile and the toolbar
export default function FloatingFormatToolbar({
  label,
  colors,
  colorColumns = 5,
  color,
  sizes,
  size,
  align,
  bold,
  italic,
  strike,
  gap = 16,
  onChange,
}) {
  const anchorRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [placeBelow, setPlaceBelow] = useState(false);

  // Above the tile unless that would go off the top of the canvas.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const canvasRect = anchor?.closest(".canvas")?.getBoundingClientRect();

    if (!anchor || !canvasRect || placeBelow) {
      return;
    }

    if (anchor.getBoundingClientRect().top < canvasRect.top + EDGE_MARGIN) {
      setPlaceBelow(true);
    }
  }, [placeBelow]);

  // Menus close on any press outside the toolbar.
  useEffect(() => {
    if (!openMenu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!anchorRef.current?.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpenMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [openMenu]);

  const toggleMenu = (menu) => setOpenMenu((current) => (current === menu ? null : menu));
  const choose = (patch) => {
    onChange(patch);
    setOpenMenu(null);
  };
  const currentColor = colors.find((entry) => entry.id === color) ?? colors[0];

  return (
    <div
      ref={anchorRef}
      className={`format-toolbar${placeBelow ? " format-toolbar--below" : ""}`}
      style={{ "--format-toolbar-gap": `${gap}px`, "--format-toolbar-color-columns": colorColumns }}
      {...keepFocus}
    >
      <div className="format-toolbar__bar" role="toolbar" aria-label={label}>
        <button
          type="button"
          className="format-toolbar__button format-toolbar__color"
          aria-label={`Colour: ${currentColor.name}`}
          aria-haspopup="true"
          aria-expanded={openMenu === "color"}
          onClick={() => toggleMenu("color")}
        >
          <i style={{ background: currentColor.hex }} />
          <Chevron />
        </button>

        <span className="format-toolbar__separator" />

        <button
          type="button"
          className="format-toolbar__button"
          aria-label="Text size"
          aria-haspopup="true"
          aria-expanded={openMenu === "size"}
          onClick={() => toggleMenu("size")}
        >
          <span>Aa</span>
          <Chevron />
        </button>
        <button
          type="button"
          className="format-toolbar__button"
          aria-label={`Text alignment: ${align}`}
          onClick={() => onChange({ align: ALIGNS[(ALIGNS.indexOf(align) + 1) % ALIGNS.length] })}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d={ALIGN_ICON_PATHS[align] ?? ALIGN_ICON_PATHS.left} />
          </svg>
        </button>

        <span className="format-toolbar__separator" />

        <button
          type="button"
          className="format-toolbar__button format-toolbar__bold"
          aria-label="Bold"
          title="Bold (Ctrl+B)"
          aria-pressed={bold}
          onClick={() => onChange({ bold: !bold })}
        >
          B
        </button>
        <button
          type="button"
          className="format-toolbar__button format-toolbar__italic"
          aria-label="Italic"
          title="Italic (Ctrl+I)"
          aria-pressed={italic}
          onClick={() => onChange({ italic: !italic })}
        >
          I
        </button>
        {typeof strike === "boolean" ? (
          <button
            type="button"
            className="format-toolbar__button format-toolbar__strike"
            aria-label="Strikethrough"
            title="Strikethrough"
            aria-pressed={strike}
            onClick={() => onChange({ strike: !strike })}
          >
            S
          </button>
        ) : null}

        {openMenu === "color" ? (
          <div className="format-toolbar__popover format-toolbar__colors" role="radiogroup" aria-label="Colour">
            {colors.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="format-toolbar__swatch"
                role="radio"
                aria-checked={entry.id === currentColor.id}
                aria-label={entry.name}
                title={entry.name}
                onClick={() => choose({ color: entry.id })}
              >
                <i style={{ background: entry.hex }} />
              </button>
            ))}
          </div>
        ) : null}

        {openMenu === "size" ? (
          <div className="format-toolbar__popover format-toolbar__sizes" role="menu" aria-label="Text size">
            {sizes.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="format-toolbar__menu-item"
                role="menuitemradio"
                aria-checked={entry.id === size}
                onClick={() => choose({ size: entry.id })}
              >
                <svg className="format-toolbar__check" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 7.5l3 3 6-7" />
                </svg>
                {entry.label}
                {entry.hint ? <em>{entry.hint}</em> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
