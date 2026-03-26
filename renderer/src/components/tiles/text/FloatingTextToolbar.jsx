import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from "../../ui/app";

function preventToolbarFocusSteal(event) {
  event.preventDefault();
}

function ToolbarDropdown({
  tileId,
  value,
  options,
  onChange,
  label,
  className = "",
}) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          type="button"
          className={`text-tile-toolbar__dropdown ${className}`.trim()}
          data-text-toolbar-for={tileId}
          onMouseDown={preventToolbarFocusSteal}
        >
          <span>{label}</span>
          <span className="text-tile-toolbar__caret" aria-hidden="true">▾</span>
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent
        align="start"
        sideOffset={8}
        className="text-tile-toolbar__menu"
        data-text-toolbar-for={tileId}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {options.map((option) => (
          <AppDropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className={option.value === value ? "text-tile-toolbar__menu-item--active" : ""}
            data-text-toolbar-for={tileId}
          >
            {option.label}
          </AppDropdownMenuItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function ToolbarButton({
  tileId,
  label,
  isActive = false,
  disabled = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`text-tile-toolbar__button${isActive ? " text-tile-toolbar__button--active" : ""}`}
      onMouseDown={preventToolbarFocusSteal}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      data-text-toolbar-for={tileId}
    >
      {label}
    </button>
  );
}

export default function FloatingTextToolbar({
  tileId,
  anchorRef,
  isOpen,
  stylePresetOptions,
  fontSizeOptions,
  alignmentOptions,
  activeStylePreset,
  activeFontSize,
  activeAlignment,
  isBoldActive,
  isStrikeActive,
  isBulletListActive,
  canToggleBulletList,
  onStylePresetChange,
  onFontSizeChange,
  onToggleBold,
  onToggleStrike,
  onToggleLink,
  onToggleBulletList,
  onAlignmentChange,
}) {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return undefined;
    }

    let frameId = 0;

    const updatePosition = () => {
      const element = anchorRef.current;

      if (!element) {
        frameId = window.requestAnimationFrame(updatePosition);
        return;
      }

      const rect = element.getBoundingClientRect();

      setPosition({
        left: rect.left + rect.width / 2,
        top: Math.max(16, rect.top - 18),
      });

      frameId = window.requestAnimationFrame(updatePosition);
    };

    frameId = window.requestAnimationFrame(updatePosition);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [anchorRef, isOpen]);

  const toolbar = useMemo(() => {
    if (!isOpen || !position) {
      return null;
    }

    return (
      <div
        className="text-tile-toolbar"
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
        }}
        data-text-toolbar-for={tileId}
      >
        <ToolbarDropdown
          tileId={tileId}
          value={activeStylePreset}
          options={stylePresetOptions}
          onChange={onStylePresetChange}
          label={stylePresetOptions.find((option) => option.value === activeStylePreset)?.label || "Simple"}
          className="text-tile-toolbar__dropdown--wide"
        />
        <ToolbarDropdown
          tileId={tileId}
          value={activeFontSize}
          options={fontSizeOptions}
          onChange={onFontSizeChange}
          label={`${activeFontSize}px`}
        />
        <ToolbarButton tileId={tileId} label="B" isActive={isBoldActive} onClick={onToggleBold} />
        <ToolbarButton tileId={tileId} label="S" isActive={isStrikeActive} onClick={onToggleStrike} />
        <ToolbarButton tileId={tileId} label="Link" onClick={onToggleLink} />
        <ToolbarButton
          tileId={tileId}
          label="• List"
          isActive={isBulletListActive}
          disabled={!canToggleBulletList}
          onClick={onToggleBulletList}
        />
        <ToolbarDropdown
          tileId={tileId}
          value={activeAlignment}
          options={alignmentOptions}
          onChange={onAlignmentChange}
          label={alignmentOptions.find((option) => option.value === activeAlignment)?.label || "Left"}
        />
      </div>
    );
  }, [
    activeAlignment,
    activeFontSize,
    activeStylePreset,
    alignmentOptions,
    canToggleBulletList,
    fontSizeOptions,
    isBoldActive,
    isBulletListActive,
    isOpen,
    isStrikeActive,
    onAlignmentChange,
    onFontSizeChange,
    onStylePresetChange,
    onToggleBold,
    onToggleBulletList,
    onToggleLink,
    onToggleStrike,
    position,
    stylePresetOptions,
    tileId,
  ]);

  if (!toolbar) {
    return null;
  }

  return createPortal(toolbar, document.body);
}
