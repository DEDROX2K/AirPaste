import { useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "../../lib/home";
import { groupUpdatedAt } from "../../lib/homeLayout";
import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "../ui/app";
import { Folder, FolderOpen, MoreHorizontal, Pencil, Star } from "../ui/icons";
import { CardColorMenu } from "../ui/CardColorMenu";
import { ContextMenuItem, ContextMenuSeparator } from "../ui/context-menu";
import "./HomeGroups.css";

// Inline name field for a group: Enter or blur saves, Escape cancels.
export function GroupNameInput({ initialName, onSubmit, onCancel, className = "" }) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const finish = (save) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save) onSubmit(value);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      data-no-drag
      className={`ap-home-group__name-input ${className}`}
      value={value}
      maxLength={120}
      aria-label="Group name"
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}

// A Figma-style file group: a card two rows tall with up to three canvas
// thumbnails (one large, two below), then a folder icon, the name,
// "Updated …" and a star. It looks and colour-marks like a canvas card
// (right-click → Mark with colour; key "group:<id>").
export default function HomeGroupCard({
  entry,
  thumbUrls,
  renaming,
  onOpen,
  onStartRename,
  onRename,
  onCancelRename,
  onToggleStar,
  onUngroup,
  style,
}) {
  const { group, items } = entry;
  const previews = items.slice(0, 3);
  const extra = items.length - previews.length;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <CardColorMenu
      itemKey={entry.key}
      extraItems={(
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onOpen}>
            <FolderOpen size={14} aria-hidden="true" />
            Open group
          </ContextMenuItem>
          <ContextMenuItem onSelect={onStartRename}>
            <Pencil size={14} aria-hidden="true" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onSelect={onUngroup}>
            <Folder size={14} aria-hidden="true" />
            Ungroup
          </ContextMenuItem>
        </>
      )}
    >
    <article
      className={`ap-home-group${group.starred ? " is-starred" : ""}${menuOpen ? " is-menu-open" : ""}`}
      role="listitem"
      data-drag-key={entry.key}
      style={style}
    >
      <button
        type="button"
        className="ap-home-group__hit"
        aria-label={`Open group ${group.name}, ${items.length} canvases`}
        onClick={onOpen}
      >
        <span className="ap-home-group__thumbs" data-count={previews.length}>
          {previews.map((item, index) => {
            const url = thumbUrls[item.id || item.filePath || item.path || item.name] || "";
            return (
              <span key={item.id || item.path} className="ap-home-group__thumb">
                {url ? (
                  <img src={url} alt="" loading="lazy" draggable={false} />
                ) : (
                  <span className="ap-home-group__thumb-placeholder" aria-hidden="true" />
                )}
                <span className="ap-home-group__thumb-name">{item.name}</span>
                {index === previews.length - 1 && extra > 0 ? (
                  <span className="ap-home-group__more">+{extra}</span>
                ) : null}
              </span>
            );
          })}
        </span>
      </button>

      <div className="ap-home-group__footer">
        <span className="ap-home-group__icon" aria-hidden="true">
          <Folder size={20} />
        </span>
        <div className="ap-home-group__text">
          {renaming ? (
            <GroupNameInput initialName={group.name} onSubmit={onRename} onCancel={onCancelRename} />
          ) : (
            <button
              type="button"
              className="ap-home-group__name"
              title="Double-click to rename"
              onClick={onOpen}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onStartRename();
              }}
            >
              {group.name}
            </button>
          )}
          <span className="ap-home-group__meta">Updated {formatRelativeTime(groupUpdatedAt(entry))}</span>
        </div>
        <div className="ap-home-group__actions" data-no-drag>
          <AppDropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <AppDropdownMenuTrigger asChild>
              <AppButton
                type="button"
                tone="unstyled"
                className="ap-home-group__btn ap-home-group__btn--menu"
                aria-label={`More actions for ${group.name}`}
                title="More actions"
              >
                <MoreHorizontal size={15} aria-hidden="true" />
              </AppButton>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="end" sideOffset={6}>
              <AppDropdownMenuItem onSelect={onOpen}>
                <FolderOpen size={14} aria-hidden="true" />
                Open group
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onSelect={onStartRename}>
                <Pencil size={14} aria-hidden="true" />
                Rename
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onSelect={onToggleStar}>
                <Star size={14} aria-hidden="true" fill={group.starred ? "currentColor" : "none"} />
                {group.starred ? "Remove star" : "Add star"}
              </AppDropdownMenuItem>
              <AppDropdownMenuSeparator />
              <AppDropdownMenuItem onSelect={onUngroup}>
                <Folder size={14} aria-hidden="true" />
                Ungroup
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
          <AppButton
            type="button"
            tone="unstyled"
            className={`ap-home-group__btn${group.starred ? " is-active" : ""}`}
            aria-label={group.starred ? `Unstar ${group.name}` : `Star ${group.name}`}
            title={group.starred ? "Remove star" : "Add star"}
            onClick={onToggleStar}
          >
            <Star size={15} aria-hidden="true" fill={group.starred ? "currentColor" : "none"} />
          </AppButton>
        </div>
      </div>
    </article>
    </CardColorMenu>
  );
}
