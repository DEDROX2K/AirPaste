import { TEXT_BOX_PRESET_OPTIONS } from "../lib/textBoxStyle";

const FONT_SIZE_OPTIONS = [16, 24, 32, 48, 64, 96];

function formatHexColor(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : "#1f1f1f";
}

function AlignmentButton({
  label,
  isActive,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`text-formatting-toolbar__toggle${isActive ? " text-formatting-toolbar__toggle--active" : ""}`}
      aria-pressed={isActive}
      aria-label={`Align ${label}`}
      onClick={onClick}
    >
      {label[0].toUpperCase()}
    </button>
  );
}

export default function TextFormattingToolbar({
  card,
  onPatchStyle,
}) {
  const style = card?.style ?? {};
  const currentFontWeight = Number(style.fontWeight) || 500;

  return (
    <div className="canvas-text-toolbar-shell" role="presentation">
      <div className="text-formatting-toolbar" role="toolbar" aria-label="Text formatting toolbar">
        <label className="text-formatting-toolbar__field">
          <span className="text-formatting-toolbar__label">Preset</span>
          <select
            className="text-formatting-toolbar__select"
            value={style.preset ?? "simple"}
            aria-label="Font preset"
            onChange={(event) => onPatchStyle({ preset: event.target.value })}
          >
            {TEXT_BOX_PRESET_OPTIONS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>

        <label className="text-formatting-toolbar__field text-formatting-toolbar__field--size">
          <span className="text-formatting-toolbar__label">Size</span>
          <select
            className="text-formatting-toolbar__select"
            value={FONT_SIZE_OPTIONS.includes(style.fontSize) ? style.fontSize : "custom"}
            aria-label="Font size presets"
            onChange={(event) => {
              if (event.target.value === "custom") {
                return;
              }

              onPatchStyle({ fontSize: Number(event.target.value) });
            }}
          >
            {FONT_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}px</option>
            ))}
            <option value="custom">Custom</option>
          </select>
          <input
            className="text-formatting-toolbar__number"
            type="number"
            min="8"
            max="240"
            step="1"
            value={style.fontSize ?? 48}
            aria-label="Font size"
            onChange={(event) => onPatchStyle({ fontSize: Number(event.target.value) || 48 })}
          />
        </label>

        <div className="text-formatting-toolbar__group" role="group" aria-label="Style toggles">
          <button
            type="button"
            className={`text-formatting-toolbar__toggle${currentFontWeight >= 600 ? " text-formatting-toolbar__toggle--active" : ""}`}
            aria-pressed={currentFontWeight >= 600}
            aria-label="Bold"
            onClick={() => onPatchStyle({ fontWeight: currentFontWeight >= 600 ? 500 : 700 })}
          >
            B
          </button>
          <button
            type="button"
            className={`text-formatting-toolbar__toggle text-formatting-toolbar__toggle--italic${style.italic ? " text-formatting-toolbar__toggle--active" : ""}`}
            aria-pressed={style.italic === true}
            aria-label="Italic"
            onClick={() => onPatchStyle({ italic: style.italic !== true })}
          >
            I
          </button>
          <button
            type="button"
            className={`text-formatting-toolbar__toggle${style.underline ? " text-formatting-toolbar__toggle--active" : ""}`}
            aria-pressed={style.underline === true}
            aria-label="Underline"
            onClick={() => onPatchStyle({ underline: style.underline !== true })}
          >
            U
          </button>
          <button
            type="button"
            className={`text-formatting-toolbar__toggle${style.strike ? " text-formatting-toolbar__toggle--active" : ""}`}
            aria-pressed={style.strike === true}
            aria-label="Strikethrough"
            onClick={() => onPatchStyle({ strike: style.strike !== true })}
          >
            S
          </button>
        </div>

        <div className="text-formatting-toolbar__group" role="group" aria-label="Alignment">
          <AlignmentButton label="left" isActive={style.align === "left"} onClick={() => onPatchStyle({ align: "left" })} />
          <AlignmentButton label="center" isActive={style.align === "center"} onClick={() => onPatchStyle({ align: "center" })} />
          <AlignmentButton label="right" isActive={style.align === "right"} onClick={() => onPatchStyle({ align: "right" })} />
        </div>

        <label className="text-formatting-toolbar__field text-formatting-toolbar__field--color">
          <span className="text-formatting-toolbar__label">Color</span>
          <input
            className="text-formatting-toolbar__color"
            type="color"
            value={formatHexColor(style.color)}
            aria-label="Text color"
            onChange={(event) => onPatchStyle({ color: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
