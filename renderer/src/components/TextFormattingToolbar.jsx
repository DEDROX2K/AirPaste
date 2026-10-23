import { useState } from "react";
import { AtSign, Bold, ChevronDown, Link as LinkIcon, List, Strikethrough } from "lucide-react";
import { TEXT_BOX_PRESET_OPTIONS } from "../lib/textBoxStyle";

// Nine quick swatches, not a full color picker -- matches the reference the
// user designed (a basic first pass; a richer picker can replace this row
// later without touching anything else here).
const COLOR_SWATCHES = [
  "#ffffff", "#c7c7cc", "#ff8a7a", "#ffab5e", "#ffd54f",
  "#8bd17c", "#5ad1c0", "#6bb6ff", "#b18af0", "#ff9fd1",
];

const SIZE_PRESETS = [
  { id: "small", label: "Small", fontSize: 24 },
  { id: "medium", label: "Medium", fontSize: 48 },
  { id: "large", label: "Large", fontSize: 72 },
];

function closestSizePreset(fontSize) {
  const numericSize = Number(fontSize) || SIZE_PRESETS[1].fontSize;
  return SIZE_PRESETS.reduce((closest, preset) => (
    Math.abs(preset.fontSize - numericSize) < Math.abs(closest.fontSize - numericSize) ? preset : closest
  ), SIZE_PRESETS[1]);
}

function stopPointer(event) {
  event.stopPropagation();
}

// The floating pill that appears above the selection when one or more plain
// text tiles are selected -- a basic first pass matching the design the user
// sent (color swatches, font preset, size, bold/strike; link/list/mention
// are present for the look but not wired up yet, by design: "customize
// later").
export default function TextFormattingToolbar({ style, onPatchStyle }) {
  const [openPanel, setOpenPanel] = useState(null);
  const currentFontWeight = Number(style.fontWeight) || 500;
  const isBold = currentFontWeight >= 600;
  const isStrike = style.strike === true;
  const activePreset = TEXT_BOX_PRESET_OPTIONS.find((preset) => preset.id === style.preset) ?? TEXT_BOX_PRESET_OPTIONS[0];
  const activeSize = closestSizePreset(style.fontSize);

  function togglePanel(panelName) {
    setOpenPanel((current) => (current === panelName ? null : panelName));
  }

  function choose(patch) {
    onPatchStyle(patch);
    setOpenPanel(null);
  }

  return (
    <div
      className="text-toolbar"
      data-text-toolbar-root="true"
      onPointerDown={stopPointer}
      onClick={stopPointer}
    >
      {openPanel === "color" ? (
        <div className="text-toolbar__panel text-toolbar__panel--swatches" role="group" aria-label="Text color">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`text-toolbar__swatch${style.color === swatch ? " text-toolbar__swatch--active" : ""}`}
              style={{ background: swatch }}
              aria-label={`Set text color ${swatch}`}
              onClick={() => choose({ color: swatch })}
            />
          ))}
        </div>
      ) : null}

      {openPanel === "preset" ? (
        <div className="text-toolbar__panel text-toolbar__panel--list" role="menu" aria-label="Font">
          {TEXT_BOX_PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="menuitemradio"
              aria-checked={preset.id === activePreset.id}
              className={`text-toolbar__list-item${preset.id === activePreset.id ? " text-toolbar__list-item--active" : ""}`}
              onClick={() => choose({ preset: preset.id })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}

      {openPanel === "size" ? (
        <div className="text-toolbar__panel text-toolbar__panel--list" role="menu" aria-label="Size">
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="menuitemradio"
              aria-checked={preset.id === activeSize.id}
              className={`text-toolbar__list-item${preset.id === activeSize.id ? " text-toolbar__list-item--active" : ""}`}
              onClick={() => choose({ fontSize: preset.fontSize })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="text-toolbar__bar" role="toolbar" aria-label="Text formatting">
        <button
          type="button"
          className="text-toolbar__color-trigger"
          aria-label="Text color"
          aria-expanded={openPanel === "color"}
          onClick={() => togglePanel("color")}
        >
          <span className="text-toolbar__color-swatch" style={{ background: style.color }} />
          <ChevronDown size={12} strokeWidth={2.25} />
        </button>

        <button
          type="button"
          className="text-toolbar__dropdown"
          aria-expanded={openPanel === "preset"}
          onClick={() => togglePanel("preset")}
        >
          <span className="text-toolbar__dropdown-label">Aa</span>
          <ChevronDown size={12} strokeWidth={2.25} />
        </button>

        <button
          type="button"
          className="text-toolbar__dropdown text-toolbar__dropdown--size"
          aria-expanded={openPanel === "size"}
          onClick={() => togglePanel("size")}
        >
          <span className="text-toolbar__dropdown-label">{activeSize.label}</span>
          <ChevronDown size={12} strokeWidth={2.25} />
        </button>

        <span className="text-toolbar__divider" aria-hidden="true" />

        <button
          type="button"
          className={`text-toolbar__icon-button${isBold ? " text-toolbar__icon-button--active" : ""}`}
          aria-pressed={isBold}
          aria-label="Bold"
          onClick={() => onPatchStyle({ fontWeight: isBold ? 500 : 700 })}
        >
          <Bold size={15} strokeWidth={2.25} />
        </button>

        <button
          type="button"
          className={`text-toolbar__icon-button${isStrike ? " text-toolbar__icon-button--active" : ""}`}
          aria-pressed={isStrike}
          aria-label="Strikethrough"
          onClick={() => onPatchStyle({ strike: !isStrike })}
        >
          <Strikethrough size={15} strokeWidth={2.25} />
        </button>

        <button type="button" className="text-toolbar__icon-button" aria-label="Link" disabled>
          <LinkIcon size={15} strokeWidth={2.25} />
        </button>

        <button type="button" className="text-toolbar__icon-button" aria-label="Bulleted list" disabled>
          <List size={15} strokeWidth={2.25} />
        </button>

        <button type="button" className="text-toolbar__icon-button" aria-label="Mention" disabled>
          <AtSign size={15} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
