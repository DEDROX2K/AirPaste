import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  STICKY_ALIGNS,
  STICKY_COLORS,
  STICKY_FONT_SIZE_LABELS,
} from "../../tiles/sticky/model";

// Screen pixels between the note's edge and the toolbar (clears the "+").
const TOOLBAR_GAP = 44;
const EDGE_MARGIN = 8;

function Chevron() {
  return (
    <svg className="sticky-toolbar__chevron" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
// and never reach the note (which would start a drag).
const keepFocus = {
  onMouseDown: (event) => event.preventDefault(),
  onPointerDown: (event) => event.stopPropagation(),
  onDoubleClick: (event) => event.stopPropagation(),
};

export default function StickyToolbar({ style, onChange }) {
  const anchorRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [placeBelow, setPlaceBelow] = useState(false);

  // Above the note unless that would go off the top of the canvas.
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
  const cycleAlign = () => {
    const index = STICKY_ALIGNS.indexOf(style.align);
    onChange({ align: STICKY_ALIGNS[(index + 1) % STICKY_ALIGNS.length] });
  };
  const currentColor = STICKY_COLORS.find((color) => color.id === style.color) ?? STICKY_COLORS[0];

  return (
    <div
      ref={anchorRef}
      className={`sticky-toolbar${placeBelow ? " sticky-toolbar--below" : ""}`}
      style={{ "--sticky-toolbar-gap": `${TOOLBAR_GAP}px` }}
      {...keepFocus}
    >
      <div className="sticky-toolbar__bar" role="toolbar" aria-label="Sticky note options">
        <button
          type="button"
          className="sticky-toolbar__button sticky-toolbar__color"
          aria-label={`Sticky colour: ${currentColor.name}`}
          aria-haspopup="true"
          aria-expanded={openMenu === "color"}
          onClick={() => toggleMenu("color")}
        >
          <i style={{ background: currentColor.hex }} />
          <Chevron />
        </button>

        <span className="sticky-toolbar__separator" />

        <button
          type="button"
          className="sticky-toolbar__button"
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
          className="sticky-toolbar__button"
          aria-label={`Text alignment: ${style.align}`}
          onClick={cycleAlign}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d={ALIGN_ICON_PATHS[style.align]} />
          </svg>
        </button>

        <span className="sticky-toolbar__separator" />

        <button
          type="button"
          className="sticky-toolbar__button sticky-toolbar__bold"
          aria-label="Bold"
          title="Bold (Ctrl+B)"
          aria-pressed={style.bold}
          onClick={() => onChange({ bold: !style.bold })}
        >
          B
        </button>
        <button
          type="button"
          className="sticky-toolbar__button sticky-toolbar__italic"
          aria-label="Italic"
          title="Italic (Ctrl+I)"
          aria-pressed={style.italic}
          onClick={() => onChange({ italic: !style.italic })}
        >
          I
        </button>
        <button
          type="button"
          className="sticky-toolbar__button sticky-toolbar__strike"
          aria-label="Strikethrough"
          title="Strikethrough"
          aria-pressed={style.strike}
          onClick={() => onChange({ strike: !style.strike })}
        >
          S
        </button>

        {openMenu === "color" ? (
          <div className="sticky-toolbar__popover sticky-toolbar__colors" role="radiogroup" aria-label="Sticky colour">
            {STICKY_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                className="sticky-toolbar__swatch"
                role="radio"
                aria-checked={color.id === style.color}
                aria-label={color.name}
                title={color.name}
                onClick={() => {
                  onChange({ color: color.id });
                  setOpenMenu(null);
                }}
              >
                <i style={{ background: color.hex }} />
              </button>
            ))}
          </div>
        ) : null}

        {openMenu === "size" ? (
          <div className="sticky-toolbar__popover sticky-toolbar__sizes" role="menu" aria-label="Text size">
            {Object.entries(STICKY_FONT_SIZE_LABELS).map(([sizeId, label]) => (
              <button
                key={sizeId}
                type="button"
                className="sticky-toolbar__menu-item"
                role="menuitemradio"
                aria-checked={sizeId === style.fontSize}
                onClick={() => {
                  onChange({ fontSize: sizeId });
                  setOpenMenu(null);
                }}
              >
                <svg className="sticky-toolbar__check" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 7.5l3 3 6-7" />
                </svg>
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
