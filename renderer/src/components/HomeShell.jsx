import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import {
  buildHomeRouteState,
  filterItemsByPreference,
  folderNameFromPath,
  formatRelativeTime,
  normalizeHomeNavigation,
  normalizeHomePreferences,
  sortEntriesByPreference,
} from "../lib/home";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { CardColorMenu } from "./ui/CardColorMenu";
import { ContextMenuItem, ContextMenuSeparator } from "./ui/context-menu";
import { desktop } from "../lib/desktop";
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppInput,
  AppSheet,
  AppSheetContent,
} from "./ui/app";
import {
  ArrowLeft,
  Canvas,
  Check,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  Home,
  Import,
  LayoutList,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Share,
  SidebarClose,
  SidebarOpen,
  Sparkles,
  Star,
  TileCard,
  Trash2,
  Warning,
  X,
} from "./ui/icons";
const ConstellationView = lazy(() => import("./constellation/ConstellationView"));
import "./HomeShell.css";
import HomeCanvasPeek from "./home/HomeCanvasPeek";
import { loadPeekEntries } from "../systems/home/homeTiles";
import { getCanvasThumbnailVersion, useCanvasThumbnailRevision } from "../lib/canvasThumbnail";
import HomeGroupCard, { GroupNameInput } from "./home/HomeGroupCard";
import { useHomeCardDrag } from "./home/useHomeCardDrag";
import {
  addToGroup,
  buildHomeEntries,
  canvasLayoutKey,
  createGroupFromDrop,
  findGroup,
  groupEntryKey,
  isGroupKey,
  normalizeHomeLayout,
  removeFromGroup,
  renameGroup,
  reorderGroupMembers,
  setTopLevelOrder,
  toggleGroupStar,
  ungroup,
} from "../lib/homeLayout";

// Hovering a canvas this long pops some of its tiles in from the edges.
const PEEK_DELAY_MS = 3000;

const HOME_SIDEBAR_COLLAPSED_STORAGE_KEY = "airpaste.homeSidebarCollapsed";

function getResolvedHomeViewMode(uiState) {
  const mode = normalizeHomePreferences(uiState).viewMode;
  if (mode === "list") return "list";
  return "cards";
}

function typeLabel(type) {
  if (type === "folder") return "Folder";
  if (type === "canvas") return "Canvas";
  if (type === "asset") return "Asset";
  return "File";
}

function sectionLabel(section) {
  if (section === "starred") return "Starred";
  return "All canvases";
}

function formatItemCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// "now", "5m", "3h", "2d", "4w", "6mo", "1y" — compact age for the card meta.
function formatShortAge(value) {
  const time = value ? new Date(value).getTime() : NaN;
  if (Number.isNaN(time)) return "now";
  const minutes = Math.max(0, (Date.now() - time) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function SectionIcon({ section }) {
  if (section === "starred") return <Star size={16} aria-hidden="true" />;
  return <Home size={16} aria-hidden="true" />;
}

function IconSidebarToggle({ collapsed = false }) {
  return collapsed ? <SidebarOpen size={16} aria-hidden="true" /> : <SidebarClose size={16} aria-hidden="true" />;
}

function buildBrowserItems(items, preferences, searchQuery) {
  const filtered = filterItemsByPreference(items, "all");
  const query = searchQuery.trim().toLowerCase();
  const searched = !query
    ? filtered
    : filtered.filter((item) => (
      String(item.name ?? "").toLowerCase().includes(query)
      || String(item.path ?? "").toLowerCase().includes(query)
      || typeLabel(item.type).toLowerCase().includes(query)
    ));

  const folders = searched.filter((item) => item.type === "folder").sort((a, b) => a.name.localeCompare(b.name));
  const files = sortEntriesByPreference(
    searched.filter((item) => item.type !== "folder"),
    preferences.sortBy,
  );

  return [...folders, ...files];
}

function itemKey(item) {
  return item.id || item.filePath || item.path || item.name;
}

function HomeEntryMenu({ item, open, onOpenChange, onRename, onDelete, onToggleStar, onRemoveFromGroup, triggerClassName, triggerLabel }) {
  const { exportCanvasShare } = useAppContext();
  return (
    <AppDropdownMenu open={open} onOpenChange={onOpenChange}>
      <AppDropdownMenuTrigger asChild>
        <AppButton
          type="button"
          tone="unstyled"
          className={triggerClassName}
          aria-label={triggerLabel}
          title="More actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </AppButton>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={6} onClick={(event) => event.stopPropagation()}>
        <AppDropdownMenuItem onSelect={() => onToggleStar(item)}>
          <Star size={14} aria-hidden="true" fill={item.starred ? "currentColor" : "none"} />
          {item.starred ? "Remove star" : "Add star"}
        </AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={() => onRename(item)}>
          <Pencil size={14} aria-hidden="true" />
          Rename
        </AppDropdownMenuItem>
        {item.type === "canvas" ? (
          <AppDropdownMenuItem onSelect={() => void exportCanvasShare(item)}>
            <Share size={14} aria-hidden="true" />
            Share as file…
          </AppDropdownMenuItem>
        ) : null}
        {onRemoveFromGroup ? (
          <AppDropdownMenuItem onSelect={() => onRemoveFromGroup(item)}>
            <Folder size={14} aria-hidden="true" />
            Remove from group
          </AppDropdownMenuItem>
        ) : null}
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem
          className="text-[#ff3b30] focus:bg-[rgba(255,59,48,0.12)] focus:text-[#ff3b30]"
          onSelect={() => onDelete(item)}
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function BrowserCard({ item, viewMode, isActive = false, menuOpen = false, onMenuToggle, onMenuClose, onOpen, onRename, onDelete, onToggleStar, onFocusPrev, onFocusNext, listButtonRef, peekHandlers, style }) {
  const primaryMeta = item.type !== "folder"
    ? `Edited ${formatRelativeTime(item.updatedAt)}`
    : (item.path || "Workspace root");
  const stats = [
    { label: "Tiles", value: Number.isFinite(item.tileCount) ? item.tileCount : 0 },
    { label: "Pages", value: Number.isFinite(item.pageCount) ? item.pageCount : 0 },
  ];

  if (viewMode === "list") {
    return (
      <CardColorMenu itemKey={itemKey(item)}>
      <div className={`ap-home-row${isActive ? " is-selected" : ""}`} style={style} {...peekHandlers?.(item)}>
        <button
          ref={listButtonRef}
          type="button"
          className="ap-home-row__button"
          onClick={() => onOpen(item)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onFocusNext?.();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              onFocusPrev?.();
            } else if (event.key.toLowerCase() === "s") {
              event.preventDefault();
              onToggleStar(item);
            }
          }}
        >
          <span className="ap-home-row__kicker">{typeLabel(item.type)}</span>
          <span className="ap-home-row__title">{item.name}</span>
          <span className="ap-home-row__subtitle">{primaryMeta}</span>
        </button>
        <div className="ap-home-row__actions">
          <div className="ap-home-row__stats" aria-label={`${item.name} stats`}>
            {stats.map((stat) => (
              <div key={stat.label} className="ap-home-row__stat">
                <span className="ap-home-row__stat-value">{stat.value}</span>
                <span className="ap-home-row__stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`ap-home-row__icon-btn${item.starred ? " is-starred" : ""}`}
            aria-label={item.starred ? "Remove star" : "Add star"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleStar(item);
            }}
          >
            <Star size={15} aria-hidden="true" fill={item.starred ? "currentColor" : "none"} />
          </button>
          <HomeEntryMenu
            item={item}
            open={menuOpen}
            onOpenChange={(next) => (next ? onMenuToggle(itemKey(item)) : onMenuClose())}
            onRename={onRename}
            onDelete={onDelete}
            onToggleStar={onToggleStar}
            triggerClassName={`ap-home-row__icon-btn${menuOpen ? " is-open" : ""}`}
            triggerLabel={`More actions for ${item.name}`}
          />
        </div>
      </div>
      </CardColorMenu>
    );
  }

  return (
    <CardColorMenu itemKey={itemKey(item)}>
    <article className={`ap-home-card${isActive ? " is-selected" : ""}${menuOpen ? " is-menu-open" : ""}`} style={style} {...peekHandlers?.(item)}>
      <div className="ap-home-card__toolbar">
        <HomeEntryMenu
          item={item}
          open={menuOpen}
          onOpenChange={(next) => (next ? onMenuToggle(itemKey(item)) : onMenuClose())}
          onRename={onRename}
          onDelete={onDelete}
          onToggleStar={onToggleStar}
          triggerClassName="ap-home-card__icon-btn"
          triggerLabel={`More actions for ${item.name}`}
        />
      </div>
      <button type="button" className="ap-home-card__hit" onClick={() => onOpen(item)}>
        <div className="ap-home-card__thumb">
          <div className="ap-home-card__thumb-placeholder" aria-hidden="true" />
        </div>
        <div className="ap-home-card__body">
          <div className="ap-home-card__title">{item.name}</div>
          <div className="ap-home-card__subtitle">{primaryMeta}</div>
        </div>
      </button>
    </article>
    </CardColorMenu>
  );
}

function WorkspaceLaunchScreen({ domes, folderLoading, activeDome, onCreateWorkspace, onOpenWorkspace, onOpenDome, onManageWorkspaces }) {
  const recentDomes = visibleDomes(domes).slice(0, 4);

  return (
    <section className="ap-home-launch" aria-label="Workspace launcher">
      <div className="ap-home-launch__hero">
        <span className="ap-home-launch__eyebrow">
          <Sparkles size={13} aria-hidden="true" />
          AirPaste
        </span>
        <h1 className="ap-home-launch__title">Start with a workspace.</h1>
        <p className="ap-home-launch__copy">
          Open an existing workspace or create a new one to begin saving.
        </p>
        <div className="ap-home-launch__actions">
          <AppButton type="button" tone="accent" size="lg" disabled={folderLoading} onClick={onOpenWorkspace}>
            <FolderOpen size={18} aria-hidden="true" />
            Open Workspace
          </AppButton>
          <AppButton type="button" tone="surface" size="lg" disabled={folderLoading} onClick={onCreateWorkspace}>
            <FolderPlus size={18} aria-hidden="true" />
            Create Workspace
          </AppButton>
        </div>
      </div>

      <div className="ap-home-launch__panel">
        <div className="ap-home-launch__panel-header">
          <div>
            <div className="ap-home-launch__panel-eyebrow">Recent workspaces</div>
            <h2 className="ap-home-launch__panel-title">Pick up where you left off</h2>
          </div>
          <AppButton type="button" tone="surface" size="icon" aria-label="Manage workspaces" title="Manage workspaces" onClick={onManageWorkspaces}>
            <Settings2 size={16} aria-hidden="true" />
          </AppButton>
        </div>

        <div className="ap-home-launch__recent-list">
          {recentDomes.length > 0 ? recentDomes.map((dome) => (
            <button
              key={dome.id}
              type="button"
              className={`ap-home-launch__recent${dome.id === activeDome?.id ? " is-active" : ""}`}
              disabled={folderLoading}
              onClick={() => onOpenDome(dome)}
            >
              <span className="ap-home-launch__recent-icon">
                <FolderOpen size={17} aria-hidden="true" />
              </span>
              <span className="ap-home-launch__recent-copy">
                <span className="ap-home-launch__recent-name">{dome.name || folderNameFromPath(dome.path)}</span>
                <span className="ap-home-launch__recent-path">{dome.path || "Workspace path unavailable"}</span>
              </span>
            </button>
          )) : (
            <div className="ap-home-launch__empty-recent">
              <FolderOpen size={18} aria-hidden="true" />
              <span>No recent workspaces yet.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BrowserEmptyState({ title, description, onNewCanvas, onImportFiles }) {
  return (
    <section className="ap-home-empty">
      <div className="ap-home-empty__icon">
        <Sparkles size={22} aria-hidden="true" />
      </div>
      <span className="ap-home-empty__eyebrow">Workspace</span>
      <h2 className="ap-home-empty__title">{title}</h2>
      <p className="ap-home-empty__copy">{description}</p>
      <div className="ap-home-empty__actions">
        <AppButton type="button" tone="accent" onClick={onNewCanvas}>
          <Plus size={16} aria-hidden="true" />
          Create Canvas
        </AppButton>
        <AppButton type="button" tone="surface" onClick={onImportFiles}>
          <Import size={16} aria-hidden="true" />
          Import Files
        </AppButton>
      </div>
    </section>
  );
}

function HomeCanvasCardItem({
  item,
  thumbUrl,
  menuOpen,
  onOpenCanvas,
  onRename,
  onDelete,
  onToggleStar,
  onMenuToggle,
  onMenuClose,
  onRemoveFromGroup,
  peekHandlers,
  dragKey,
  style,
}) {
  const tileCount = Number.isFinite(item.tileCount) ? item.tileCount : 0;
  const pageCount = Number.isFinite(item.pageCount) ? item.pageCount : 0;
  const meta = [
    { key: "age", Icon: Clock, value: formatShortAge(item.updatedAt), label: `Edited ${formatRelativeTime(item.updatedAt)}` },
    { key: "tiles", Icon: TileCard, value: tileCount, label: formatItemCount(tileCount, "tile") },
    pageCount > 0 ? { key: "pages", Icon: Canvas, value: pageCount, label: formatItemCount(pageCount, "page") } : null,
  ].filter(Boolean);

  return (
    <CardColorMenu
      itemKey={itemKey(item)}
      extraItems={onRemoveFromGroup ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onRemoveFromGroup(item)}>
            <Folder size={14} aria-hidden="true" />
            Remove from group
          </ContextMenuItem>
        </>
      ) : null}
    >
    <article className={`ap-home-card${item.starred ? " is-starred" : ""}${menuOpen ? " is-menu-open" : ""}`} role="listitem" data-drag-key={dragKey} style={style} {...peekHandlers?.(item)}>
      <div className="ap-home-card__toolbar" data-no-drag>
        <AppButton
          type="button"
          tone="unstyled"
          className={`ap-home-card__icon-btn${item.starred ? " is-active" : ""}`}
          aria-label={item.starred ? `Unstar ${item.name}` : `Star ${item.name}`}
          title={item.starred ? "Remove star" : "Add star"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleStar(item);
          }}
        >
          <Star size={14} aria-hidden="true" fill={item.starred ? "currentColor" : "none"} />
        </AppButton>
        <HomeEntryMenu
          item={item}
          open={menuOpen}
          onOpenChange={(next) => (next ? onMenuToggle() : onMenuClose())}
          onRename={onRename}
          onDelete={onDelete}
          onToggleStar={onToggleStar}
          onRemoveFromGroup={onRemoveFromGroup}
          triggerClassName="ap-home-card__icon-btn"
          triggerLabel={`More actions for ${item.name}`}
        />
      </div>
      <button
        type="button"
        className="ap-home-card__hit"
        onClick={() => onOpenCanvas(item)}
      >
        <div className="ap-home-card__thumb">
          {thumbUrl ? (
            <img className="ap-home-card__thumb-image" src={thumbUrl} alt={`${item.name} preview`} loading="lazy" draggable={false} />
          ) : (
            <div className="ap-home-card__thumb-placeholder" aria-hidden="true" />
          )}
        </div>
        <div className="ap-home-card__body">
          <div className="ap-home-card__title">{item.name}</div>
          <div className="ap-home-card__meta">
            {meta.map(({ key, Icon, value, label }) => (
              <span key={key} className="ap-home-card__meta-item" title={label} aria-label={label}>
                <Icon size={12} aria-hidden="true" />
                <span aria-hidden="true">{value}</span>
              </span>
            ))}
          </div>
        </div>
      </button>
    </article>
    </CardColorMenu>
  );
}

// When the grid's width changes (the sidebar collapsing, the window
// resizing), cards that jump to another column or row glide there instead
// of snapping (FLIP). Small per-frame drift while the width animates is left
// alone; only real jumps (half a card or more, i.e. another column or row)
// are animated. Positions are offsets within the grid (position: relative).
const REFLOW_MS = 420;
const REFLOW_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function useGridReflowAnimation(gridRef, itemCount) {
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const last = new Map();
    const measure = () => {
      const next = new Map();
      for (const node of grid.children) {
        next.set(node, { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight });
      }
      return next;
    };

    for (const [node, rect] of measure()) last.set(node, rect);

    const observer = new ResizeObserver(() => {
      const next = measure();
      for (const [node, rect] of next) {
        const prev = last.get(node);
        if (!prev || !rect.w) continue;
        const dx = prev.x - rect.x;
        const dy = prev.y - rect.y;
        const jumped = Math.abs(dy) > rect.h / 2 || Math.abs(dx) > rect.w / 2;
        if (!jumped) continue;
        node.getAnimations?.().forEach((animation) => {
          if (animation.id === "ap-home-reflow") animation.cancel();
        });
        const animation = node.animate(
          [
            {
              transformOrigin: "0 0",
              transform: `translate(${dx}px, ${dy}px) scale(${prev.w / rect.w}, ${prev.h / rect.h})`,
            },
            { transformOrigin: "0 0", transform: "none" },
          ],
          { duration: REFLOW_MS, easing: REFLOW_EASE },
        );
        animation.id = "ap-home-reflow";
      }
      last.clear();
      for (const [node, rect] of next) last.set(node, rect);
    });

    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef, itemCount]);
}

// Cards view. With `grouping` on (Home, no search) the user's own order and
// groups apply and cards can be dragged; with a group open, only that
// group's canvases show and dragging reorders them. Otherwise (search,
// Starred) it's a plain, sorted grid.
function HomeCardsView({
  folderPath,
  canvases,
  thumbCanvases,
  layout,
  grouping,
  openGroupId,
  starredGroups,
  onLayoutChange,
  onOpenGroup,
  onCloseGroup,
  onOpenCanvas,
  onRename,
  onDelete,
  onToggleStar,
  onDragStart,
  peekHandlers,
}) {
  const gridRef = useRef(null);
  const [thumbUrls, setThumbUrls] = useState(() => ({}));
  const [openMenuKey, setOpenMenuKey] = useState(null);
  const [renamingGroupId, setRenamingGroupId] = useState(null);
  const mergedKeyRef = useRef("");
  // Opening a group grows its canvases out of the group card; going back
  // settles Home in around the same spot. The wrapper below is keyed by the
  // open group, so its animation plays once per switch.
  const wrapperRef = useRef(null);
  const transitionRef = useRef({ dir: null, ox: "50%", oy: "0px" });
  const thumbnailRevision = useCanvasThumbnailRevision();
  const allCanvases = thumbCanvases ?? canvases;

  const openGroup = openGroupId ? findGroup(layout, openGroupId) : null;

  const entries = useMemo(() => {
    if (!Array.isArray(canvases)) return [];
    if (openGroup) {
      const byKey = new Map(canvases.map((item) => [canvasLayoutKey(item), item]));
      return openGroup.members
        .map((key) => byKey.get(key))
        .filter(Boolean)
        .map((item) => ({ type: "canvas", key: canvasLayoutKey(item), item }));
    }
    if (grouping) return buildHomeEntries(canvases, layout);
    return [
      ...(starredGroups ?? []),
      ...canvases.map((item) => ({ type: "canvas", key: canvasLayoutKey(item), item })),
    ];
  }, [canvases, grouping, layout, openGroup, starredGroups]);

  const entryKeys = useMemo(() => entries.map((entry) => entry.key), [entries]);
  // Top-level keys as Home shows them, for edits made from inside a group.
  const topLevelKeys = () => buildHomeEntries(allCanvases ?? [], layout).map((entry) => entry.key);
  useGridReflowAnimation(gridRef, entries.length);

  useHomeCardDrag(gridRef, {
    enabled: Boolean(grouping || openGroup),
    keys: entryKeys,
    canMerge: (sourceKey) => !openGroup && !isGroupKey(sourceKey),
    onDragStart,
    onReorder: (keys) => {
      if (openGroup) onLayoutChange(reorderGroupMembers(layout, openGroup.id, keys));
      else onLayoutChange(setTopLevelOrder(layout, keys));
    },
    onMerge: (sourceKey, targetKey) => {
      if (isGroupKey(targetKey)) {
        mergedKeyRef.current = targetKey;
        onLayoutChange(addToGroup(layout, entryKeys, targetKey.slice(groupEntryKey("").length), sourceKey));
        return;
      }
      const { groupId, layout: next } = createGroupFromDrop(layout, entryKeys, sourceKey, targetKey);
      mergedKeyRef.current = groupEntryKey(groupId);
      onLayoutChange(next);
      // A new group starts with its name field open.
      setRenamingGroupId(groupId);
    },
    resolveMergedKey: () => mergedKeyRef.current,
  }, entries.length > 0 ? `grid:${openGroupId ?? ""}` : "empty");

  useEffect(() => {
    let cancelled = false;

    async function resolveThumbnails() {
      if (!folderPath || !Array.isArray(allCanvases) || allCanvases.length === 0) {
        setThumbUrls({});
        return;
      }

      const resolvedEntries = await Promise.all(allCanvases.map(async (item) => {
        if (!item?.thumbnailPath) {
          return [itemKey(item), ""];
        }
        const resolved = await desktop.workspace.resolveAssetUrl(folderPath, item.thumbnailPath, { previewTier: "original" });
        const version = getCanvasThumbnailVersion(item.filePath);
        return [itemKey(item), resolved ? (version ? `${resolved}?v=${version}` : resolved) : ""];
      }));

      if (cancelled) return;
      setThumbUrls(Object.fromEntries(resolvedEntries));
    }

    void resolveThumbnails();

    return () => {
      cancelled = true;
    };
  }, [allCanvases, folderPath, thumbnailRevision]);

  const enterGroup = (groupId) => {
    const wrapper = wrapperRef.current;
    const card = gridRef.current?.querySelector(`[data-drag-key="${CSS.escape(groupEntryKey(groupId))}"]`);
    if (wrapper && card) {
      const outer = wrapper.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      transitionRef.current = {
        dir: "in",
        ox: `${Math.round(rect.left + rect.width / 2 - outer.left)}px`,
        oy: `${Math.round(rect.top + rect.height / 2 - outer.top)}px`,
      };
    } else {
      transitionRef.current = { ...transitionRef.current, dir: "in" };
    }
    onOpenGroup(groupId);
  };
  const leaveGroup = () => {
    transitionRef.current = { ...transitionRef.current, dir: "out" };
    onCloseGroup();
  };
  const { dir, ox, oy } = transitionRef.current;
  const wrapperClassName = `ap-home-groupview${dir === "in" ? " is-entering" : dir === "out" ? " is-leaving" : ""}`;
  const wrapperStyle = { "--ap-group-ox": ox, "--ap-group-oy": oy };
  const wrapperKey = openGroupId ?? "home";

  const groupBar = openGroup ? (
    <div className="ap-home-groupbar">
      <button type="button" className="ap-home-groupbar__crumb" onClick={leaveGroup} title="Back to all canvases">
        <ArrowLeft size={14} aria-hidden="true" />
        All canvases
      </button>
      <span className="ap-home-groupbar__sep" aria-hidden="true">/</span>
      {renamingGroupId === openGroup.id ? (
        <GroupNameInput
          initialName={openGroup.name}
          onSubmit={(name) => {
            setRenamingGroupId(null);
            onLayoutChange(renameGroup(layout, openGroup.id, name));
          }}
          onCancel={() => setRenamingGroupId(null)}
        />
      ) : (
        <button type="button" className="ap-home-groupbar__name" title="Rename group" onClick={() => setRenamingGroupId(openGroup.id)}>
          <Folder size={18} aria-hidden="true" />
          {openGroup.name}
        </button>
      )}
      <span className="ap-home-groupbar__spacer" />
      <AppButton
        type="button"
        tone="surface"
        onClick={() => {
          const keys = topLevelKeys();
          leaveGroup();
          onLayoutChange(ungroup(layout, keys, openGroup.id));
        }}
      >
        Ungroup
      </AppButton>
    </div>
  ) : null;

  if (entries.length === 0) {
    return (
      <div key={wrapperKey} ref={wrapperRef} className={wrapperClassName} style={wrapperStyle}>
        {groupBar}
        <section className="ap-home-empty">
          <div className="ap-home-empty__icon">
            <Grid2X2 size={22} aria-hidden="true" />
          </div>
          <span className="ap-home-empty__eyebrow">Cards</span>
          <h2 className="ap-home-empty__title">{openGroup ? "This group is empty" : "No canvases yet"}</h2>
          <p className="ap-home-empty__copy">
            {openGroup ? "Drag a canvas onto the group card to add it." : "Create a canvas to see it appear here as a card with a live preview."}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div key={wrapperKey} ref={wrapperRef} className={wrapperClassName} style={wrapperStyle}>
      {groupBar}
      <div ref={gridRef} className="ap-home-grid" role="list">
        {entries.map((entry, index) => {
          if (entry.type === "group") {
            const { group } = entry;
            return (
              <HomeGroupCard
                key={entry.key}
                entry={entry}
                thumbUrls={thumbUrls}
                renaming={renamingGroupId === group.id}
                onOpen={() => enterGroup(group.id)}
                onStartRename={() => setRenamingGroupId(group.id)}
                onRename={(name) => {
                  setRenamingGroupId(null);
                  onLayoutChange(renameGroup(layout, group.id, name));
                }}
                onCancelRename={() => setRenamingGroupId(null)}
                onToggleStar={() => onLayoutChange(toggleGroupStar(layout, group.id))}
                onUngroup={() => onLayoutChange(ungroup(layout, grouping ? entryKeys : topLevelKeys(), group.id))}
                style={{ "--ap-stagger": Math.min(index, 14) }}
              />
            );
          }
          const { item, key } = entry;
          return (
            <HomeCanvasCardItem
              key={key}
              dragKey={grouping || openGroup ? key : undefined}
              item={item}
              thumbUrl={thumbUrls[itemKey(item)] || ""}
              menuOpen={openMenuKey === key}
              onOpenCanvas={onOpenCanvas}
              onRename={onRename}
              onDelete={onDelete}
              onToggleStar={onToggleStar}
              onRemoveFromGroup={openGroup
                ? () => onLayoutChange(removeFromGroup(layout, topLevelKeys(), openGroup.id, key))
                : undefined}
              onMenuToggle={() => setOpenMenuKey((current) => (current === key ? null : key))}
              onMenuClose={() => setOpenMenuKey(null)}
              peekHandlers={peekHandlers}
              style={{ "--ap-stagger": Math.min(index, 14) }}
            />
          );
        })}
      </div>
    </div>
  );
}

function HomeSidebarContent({
  navigation,
  allCanvasItems,
  homeData,
  folderPath,
  activeDome,
  pendingDome = null,
  collapsed = false,
  onSectionChange,
  onToggleCollapsed,
  onManageWorkspaces,
  onOpenSerendipity,
  sectionTitle = "",
}) {
  return (
    <>
      {onToggleCollapsed ? (
        <div className="ap-home-sidebar__toggle-row">
          {/* The section heading lives at the top of the panel. */}
          {sectionTitle ? (
            <div className="ap-home-sidebar__heading">
              <span className="ap-home-toolbar__eyebrow">Workspace</span>
              <h1 className="ap-home-sidebar__title">{sectionTitle}</h1>
            </div>
          ) : null}
          <AppButton
            type="button"
            tone="surface"
            size="icon"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand home sidebar" : "Collapse home sidebar"}
            title={collapsed ? "Expand home sidebar" : "Collapse home sidebar"}
          >
            <IconSidebarToggle collapsed={collapsed} />
          </AppButton>
        </div>
      ) : null}

      <nav className="ap-home-sidebar__nav" aria-label="Workspace sections">
        {["home", "starred"].map((section) => (
          <AppButton
            key={section}
            type="button"
            tone="unstyled"
            className={`ap-home-nav-link${navigation.selectedSection === section ? " is-active" : ""}`}
            title={section === "home" ? "Home" : sectionLabel(section)}
            onClick={() => void onSectionChange(section)}
          >
            <span className="ap-home-nav-link__label">
              <SectionIcon section={section} />
              <span className="ap-home-nav-link__text">{section === "home" ? "Home" : sectionLabel(section)}</span>
            </span>
            <span className="ap-home-nav-link__badge">
              {section === "home" ? allCanvasItems.length : homeData.starredItems.length}
            </span>
          </AppButton>
        ))}
        <AppButton
          type="button"
          tone="unstyled"
          className="ap-home-nav-link"
          title="Constellation: drift through everything you saved"
          disabled={allCanvasItems.length === 0}
          onClick={onOpenSerendipity}
        >
          <span className="ap-home-nav-link__label">
            <Sparkles size={16} aria-hidden="true" />
            <span className="ap-home-nav-link__text">Constellation</span>
          </span>
        </AppButton>
      </nav>

      <div className="ap-home-sidebar__spacer" />

      <div className="ap-home-sidebar__footer">
        <div className={`ap-home-workspace-card${pendingDome ? " is-switching" : ""}`}>
          <span className="ap-home-workspace-card__label">{pendingDome ? "Opening…" : "Workspace"}</span>
          <h3 key={pendingDome?.id ?? activeDome?.id ?? ""} className="ap-home-workspace-card__name">
            {pendingDome?.name || activeDome?.name || "AirPaste"}
          </h3>
          <p className="ap-home-workspace-card__path" title={pendingDome?.path || folderPath || activeDome?.path || "Workspace path unavailable."}>
            {pendingDome?.path || folderPath || activeDome?.path || "Workspace path unavailable."}
          </p>
        </div>
        <AppButton type="button" tone="surface" className="ap-home-sidebar-action" onClick={onManageWorkspaces} title="Manage Workspaces">
          <Settings2 size={15} aria-hidden="true" />
          <span className="ap-home-sidebar-action__label">Manage Workspaces</span>
        </AppButton>
      </div>
    </>
  );
}

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(HOME_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

// The docked sidebar owns its collapsed state, so collapsing re-renders only
// the sidebar, never the card grid beside it (that re-render was a 100ms+
// hitch right as the animation started). The grid column follows through
// `.ap-home:has(> .ap-home-sidebar--collapsed)` in HomeShell.css.
function HomeSidebar(props) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(HOME_SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // Ignore persistence failures.
      }
      return next;
    });
  }, []);

  return (
    <aside className={`ap-home-sidebar${collapsed ? " ap-home-sidebar--collapsed" : ""}`}>
      <HomeSidebarContent {...props} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
    </aside>
  );
}

function TextPromptDialog({ open, title, description, confirmLabel, value, disabled, onChange, onCancel, onConfirm }) {
  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AppDialogContent className="max-w-sm">
        <AppDialogHeader>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeader>
        <AppInput
          value={value}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !disabled) {
              event.preventDefault();
              onConfirm();
            }
          }}
        />
        <AppDialogFooter>
          <AppButton type="button" tone="surface" onClick={onCancel}>Cancel</AppButton>
          <AppButton type="button" tone="accent" disabled={disabled} onClick={onConfirm}>{confirmLabel}</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function ConfirmDialog({ open, title, description, disabled, onCancel, onConfirm }) {
  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AppDialogContent className="max-w-sm">
        <AppDialogHeader>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogFooter>
          <AppButton type="button" tone="surface" onClick={onCancel}>Cancel</AppButton>
          <AppButton type="button" tone="danger" disabled={disabled} onClick={onConfirm}>Delete</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

// A recent-workspaces entry that points at a workspace's own `.airpaste`
// metadata folder (opened by mistake once) isn't a workspace; hide it.
function isInternalDomePath(domePath) {
  return /(^|[\\/])\.airpaste([\\/]|$)/i.test(String(domePath ?? ""));
}

function visibleDomes(domes) {
  return Array.isArray(domes) ? domes.filter((dome) => !isInternalDomePath(dome?.path)) : [];
}

// Workspaces: click a row to switch to it. The open one carries a check;
// hovering any other shows an arrow saying "go here". Reveal and remove
// sit at the end of the row and only appear on hover.
function ManageWorkspacesDialog({ open, domes, activeDomeId, pendingDomeId, folderLoading, onClose, onRefresh, onCreateNew, onOpenFolder, onOpenDome, onRevealDome, onRemoveDome }) {
  const list = visibleDomes(domes);
  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AppDialogContent className="max-w-xl ap-home-manage">
        <AppDialogHeader>
          <AppDialogTitle className="ap-home-manage__title">
            <Folder size={20} aria-hidden="true" />
            Workspaces
          </AppDialogTitle>
          <AppDialogDescription>Click a workspace to switch to it.</AppDialogDescription>
        </AppDialogHeader>

        <div className="ap-home-dome-list" role="listbox" aria-label="Workspaces">
          {list.length === 0 ? (
            <p className="ap-home-empty__copy">No workspaces yet. Create or open one below.</p>
          ) : (
            list.map((dome) => {
              const isActive = dome.id === activeDomeId;
              const isPending = dome.id === pendingDomeId;
              const isMissing = dome.exists === false;
              const disabled = isMissing || (folderLoading && !isActive);
              return (
                <CardColorMenu key={dome.id} itemKey={`dome:${dome.id}`}>
                <div
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : 0}
                  title={isMissing ? "This folder is missing" : isActive ? "Open now" : `Switch to ${dome.name}`}
                  className={`ap-home-dome-row${isActive ? " is-active" : ""}${isPending ? " is-pending" : ""}${isMissing ? " is-missing" : ""}`}
                  onClick={() => {
                    if (disabled) return;
                    onOpenDome(dome);
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && !disabled && event.target === event.currentTarget) {
                      event.preventDefault();
                      onOpenDome(dome);
                    }
                  }}
                >
                  <span className="ap-home-dome-row__icon" aria-hidden="true">
                    {isMissing ? <Warning size={18} /> : isActive ? <FolderOpen size={18} /> : <Folder size={18} />}
                  </span>
                  <div className="ap-home-dome-row__text">
                    <div className="ap-home-dome-row__name">
                      <span className="ap-home-dome-row__name-text">{dome.name || folderNameFromPath(dome.path)}</span>
                      {isMissing ? <span className="ap-home-dome-row__badge is-warn">Missing</span> : null}
                      {!isMissing && dome.valid === false ? <span className="ap-home-dome-row__badge is-warn">Needs setup</span> : null}
                    </div>
                    <div className="ap-home-dome-row__meta" title={dome.path}>{dome.path}</div>
                  </div>
                  <div className="ap-home-dome-row__actions">
                    <button
                      type="button"
                      className="ap-home-icon-btn"
                      title="Show in file explorer"
                      aria-label="Reveal in file explorer"
                      disabled={isMissing}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRevealDome(dome.path);
                      }}
                    >
                      <FolderOpen size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="ap-home-icon-btn is-danger"
                      title="Remove from list (files stay on disk)"
                      aria-label="Remove workspace"
                      disabled={isActive}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveDome(dome.id);
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <span className="ap-home-dome-row__indicator" aria-hidden="true">
                    {isPending ? <span className="ap-home-switching__spinner" /> : isActive ? <Check size={16} /> : <ChevronRight size={16} />}
                  </span>
                </div>
                </CardColorMenu>
              );
            })
          )}
        </div>

        <div className="ap-home-manage__quick">
          <button type="button" className="ap-home-manage__quick-btn" onClick={onCreateNew}>
            <Plus size={18} aria-hidden="true" />
            <span><strong>New workspace</strong><small>Start with an empty folder</small></span>
          </button>
          <button type="button" className="ap-home-manage__quick-btn" onClick={onOpenFolder}>
            <FolderOpen size={18} aria-hidden="true" />
            <span><strong>Open a folder</strong><small>Use one you already have</small></span>
          </button>
        </div>

        <AppDialogFooter>
          <AppButton type="button" tone="surface" onClick={onRefresh}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </AppButton>
          <AppButton type="button" tone="accent" onClick={onClose}>Done</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

// Shown in place of the cards while another workspace opens: the old files
// fade out at once, a skeleton with the new name fades in, and the real
// cards rise in when they're ready.
function WorkspaceSwitchingState({ name }) {
  return (
    <section className="ap-home-switching" aria-live="polite" aria-busy="true">
      <div className="ap-home-switching__label">
        <span className="ap-home-switching__spinner" aria-hidden="true" />
        Opening {name || "workspace"}…
      </div>
      <div className="ap-home-switching__grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="ap-home-switching__card" style={{ "--ap-stagger": index }} />
        ))}
      </div>
    </section>
  );
}

export default function HomeShell() {
  const shellRef = useRef(null);
  const bodyRef = useRef(null);
  const scrollSaveTimeoutRef = useRef(null);
  const autoSyncRef = useRef("");
  const restoredScrollKeyRef = useRef("");
  const isNarrowDesktop = useMediaQuery("(max-width: 1079px)");
  const {
    activeDome,
    createCanvasEntry,
    createFolderEntry,
    createNewDome,
    deleteItemEntry,
    domes,
    folderLoading,
    folderPath,
    homeData,
    importFilesIntoFolder,
    openExistingWorkspace,
    openHomeItem,
    refreshDomes,
    refreshHomeData,
    removeDome,
    renameItemEntry,
    revealDome,
    saveHomeUiState,
    switchDome,
    toggleItemStarred,
  } = useAppContext();

  const [navigation, setNavigation] = useState(() => normalizeHomeNavigation(homeData.uiState));
  const [homePreferences, setHomePreferences] = useState(() => normalizeHomePreferences(homeData.uiState));
  const [textDialog, setTextDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [manageDomesOpen, setManageDomesOpen] = useState(false);
  // The workspace being switched to, from the click until its files are in.
  const [pendingDome, setPendingDome] = useState(null);
  // Card order and groups (lib/homeLayout.js), saved in ui-state.json.
  const [homeLayout, setHomeLayout] = useState(() => normalizeHomeLayout(homeData.uiState?.homeLayout));
  const layoutSavesRef = useRef(0);
  const [openGroupId, setOpenGroupId] = useState(null);
  // Stopgap, in-memory substring filter over data already loaded for the
  // current folder -- no IPC/index involved. The real search-index-backed
  // implementation lands later; buildBrowserItems' signature is kept stable
  // so that swap stays contained to this one call site.
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuKey, setOpenMenuKey] = useState("");
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [serendipityOpen, setSerendipityOpen] = useState(false);
  const [homeViewMode, setHomeViewMode] = useState(() => getResolvedHomeViewMode(homeData.uiState));
  const listButtonRefs = useRef([]);
  const browserViewMode = homeViewMode;
  const isCardsView = browserViewMode === "cards";

  useEffect(() => {
    const normalizedPreferences = normalizeHomePreferences(homeData.uiState);
    setNavigation(normalizeHomeNavigation(homeData.uiState));
    setHomePreferences(normalizedPreferences);
    setHomeViewMode(getResolvedHomeViewMode(homeData.uiState));
    // While a layout save is in flight, the local copy is newer than disk.
    if (layoutSavesRef.current === 0) {
      setHomeLayout(normalizeHomeLayout(homeData.uiState?.homeLayout));
    }
  }, [homeData.uiState]);

  // A different workspace starts at its top level.
  useEffect(() => {
    setOpenGroupId(null);
  }, [folderPath]);

  const updateHomeLayout = useCallback((nextLayout) => {
    const normalized = normalizeHomeLayout(nextLayout);
    setHomeLayout(normalized);
    layoutSavesRef.current += 1;
    void Promise.resolve(saveHomeUiState({ homeLayout: normalized }))
      .catch(() => {})
      .finally(() => {
        layoutSavesRef.current -= 1;
      });
  }, [saveHomeUiState]);

  // Switching workspaces: the dialog closes and the cards make way for a
  // skeleton straight away, so the click feels answered. The skeleton stays
  // at least a moment so a fast switch reads as a transition, not a flicker.
  const handleSwitchDome = useCallback(async (dome) => {
    if (!dome?.id) return;
    setManageDomesOpen(false);
    if (dome.id === activeDome?.id && folderPath) return;
    setPendingDome({ id: dome.id, name: dome.name || folderNameFromPath(dome.path), path: dome.path });
    try {
      await Promise.all([
        switchDome(dome.id),
        new Promise((resolve) => { window.setTimeout(resolve, 360); }),
      ]);
    } finally {
      setPendingDome(null);
    }
  }, [activeDome?.id, folderPath, switchDome]);

  useEffect(() => () => window.clearTimeout(scrollSaveTimeoutRef.current), []);

  useEffect(() => {
    if (!isNarrowDesktop) {
      setSidebarDrawerOpen(false);
    }
  }, [isNarrowDesktop]);

  useEffect(() => {
    if (!bodyRef.current) return;
    const nextKey = `${navigation.selectedSection}:${navigation.currentFolderPath}:${navigation.scrollTop}`;
    if (restoredScrollKeyRef.current === nextKey) return;
    restoredScrollKeyRef.current = nextKey;
    const frame = window.requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = navigation.scrollTop;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [navigation.currentFolderPath, navigation.scrollTop, navigation.selectedSection]);

  useEffect(() => {
    if (!activeDome?.id || !activeDome.path || folderLoading) {
      return;
    }

    if (folderPath === activeDome.path) {
      autoSyncRef.current = "";
      return;
    }

    const nextKey = `${activeDome.id}:${activeDome.path}`;
    if (autoSyncRef.current === nextKey) {
      return;
    }

    autoSyncRef.current = nextKey;
    void switchDome(activeDome.id).catch(() => {});
  }, [activeDome?.id, activeDome?.path, folderLoading, folderPath, switchDome]);

  const hasWorkspace = Boolean(folderPath);
  const activeItemPath = homeData.uiState?.lastOpenedItemPath ?? null;

  const persistHomeContext = useCallback((nextNavigation, nextPreferences = homePreferences, scrollTop = null, extraState = {}, forcedViewMode = null) => {
    const nextScrollTop = Number.isFinite(scrollTop) ? scrollTop : bodyRef.current?.scrollTop ?? 0;
    const nextViewMode = forcedViewMode === "sheets"
      ? "sheets"
      : forcedViewMode === "cards"
        ? "cards"
      : forcedViewMode === "list"
        ? "list"
        : (
          nextPreferences?.viewMode === "sheets"
            ? "sheets"
            : nextPreferences?.viewMode === "cards"
              ? "cards"
              : "list"
        );
    const persistedPreferences = {
      ...nextPreferences,
      viewMode: nextViewMode,
    };
    void saveHomeUiState({
      ...buildHomeRouteState(nextNavigation, nextScrollTop),
      homeView: nextViewMode,
      sortBy: persistedPreferences.sortBy,
      filter: persistedPreferences.filter,
      selectedSection: nextNavigation.selectedSection,
      ...extraState,
    });
  }, [homePreferences, saveHomeUiState]);

  const handleBodyScroll = useCallback(() => {
    // Scrolling the list ends any canvas peek (the refs and setter are
    // declared further down; this only runs on scroll, after they exist).
    if (peekTargetRef.current) {
      window.clearTimeout(peekTimerRef.current);
      peekTargetRef.current = null;
      setPeek(null);
    }

    if (openMenuKey) {
      setOpenMenuKey("");
    }
    window.clearTimeout(scrollSaveTimeoutRef.current);
    scrollSaveTimeoutRef.current = window.setTimeout(() => persistHomeContext(navigation, homePreferences), 160);
  }, [homePreferences, navigation, openMenuKey, persistHomeContext]);

  const allCanvasItems = useMemo(
    () => homeData.allFiles.filter((item) => item.type === "canvas"),
    [homeData.allFiles],
  );


  // Canvas peek: hover a canvas row/card for PEEK_DELAY_MS and its tiles pop
  // in from the edges. Its tiles start loading as soon as the hover begins.
  const [peek, setPeek] = useState(null);
  const peekTimerRef = useRef(0);
  const peekTargetRef = useRef(null);

  const endPeek = useCallback(() => {
    window.clearTimeout(peekTimerRef.current);
    peekTargetRef.current = null;
    setPeek(null);
  }, []);

  const peekHandlers = useCallback((item) => {
    if (item?.type !== "canvas") {
      return undefined;
    }

    return {
      onPointerEnter: () => {
        window.clearTimeout(peekTimerRef.current);
        peekTargetRef.current = item.filePath;
        const entriesPromise = loadPeekEntries(item);
        peekTimerRef.current = window.setTimeout(async () => {
          const entries = await entriesPromise;
          if (peekTargetRef.current === item.filePath && entries.length > 0) {
            setPeek({ filePath: item.filePath, entries });
          }
        }, PEEK_DELAY_MS);
      },
      onPointerLeave: endPeek,
      onPointerDown: endPeek,
    };
  }, [endPeek]);

  useEffect(() => () => window.clearTimeout(peekTimerRef.current), []);

  const recentCanvasItems = useMemo(() => {
    const ordered = [];
    const seen = new Set();

    homeData.recentItems
      .filter((item) => item.type === "canvas")
      .forEach((item) => {
        const key = itemKey(item);
        if (!key || seen.has(key)) return;
        seen.add(key);
        ordered.push(item);
      });

    allCanvasItems.forEach((item) => {
      const key = itemKey(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      ordered.push(item);
    });

    return ordered;
  }, [allCanvasItems, homeData.recentItems]);

  useEffect(() => {
    if (navigation.selectedSection !== "recents") {
      return;
    }

    const nextNavigation = {
      ...navigation,
      selectedSection: "home",
    };
    setNavigation(nextNavigation);
    persistHomeContext(nextNavigation, homePreferences);
  }, [homePreferences, navigation, persistHomeContext]);

  const sectionItems = useMemo(() => {
    if (navigation.selectedSection === "recents") return recentCanvasItems;
    if (navigation.selectedSection === "starred") return homeData.starredItems;
    return allCanvasItems;
  }, [allCanvasItems, homeData.starredItems, navigation.selectedSection, recentCanvasItems]);

  const browserItems = useMemo(
    () => buildBrowserItems(sectionItems, homePreferences, searchQuery),
    [homePreferences, searchQuery, sectionItems],
  );

  const canvasItems = useMemo(
    () => browserItems.filter((item) => item.type === "canvas"),
    [browserItems],
  );

  // Order and groups apply on Home in card view when not searching; search
  // and Starred show a plain sorted grid (Starred leads with starred groups).
  const isSearching = Boolean(searchQuery.trim());
  const groupingActive = navigation.selectedSection === "home" && !isSearching;
  const openGroup = openGroupId && groupingActive ? findGroup(homeLayout, openGroupId) : null;
  const starredGroups = useMemo(() => {
    if (navigation.selectedSection !== "starred" || isSearching) return [];
    return buildHomeEntries(allCanvasItems, homeLayout).filter((entry) => entry.type === "group" && entry.group.starred);
  }, [allCanvasItems, homeLayout, isSearching, navigation.selectedSection]);

  useEffect(() => {
    listButtonRefs.current = listButtonRefs.current.slice(0, browserItems.length);
  }, [browserItems.length]);

  const handleSectionChange = useCallback(async (selectedSection) => {
    if (isNarrowDesktop) {
      setSidebarDrawerOpen(false);
    }
    setOpenGroupId(null);
    const nextNavigation = {
      ...navigation,
      selectedSection,
      scrollTop: 0,
    };
    setNavigation(nextNavigation);
    persistHomeContext(nextNavigation, homePreferences, 0);
    if (folderPath) {
      await refreshHomeData(folderPath, nextNavigation.currentFolderPath);
    }
  }, [folderPath, homePreferences, isNarrowDesktop, navigation, persistHomeContext, refreshHomeData]);

  async function submitCreate(type) {
    const name = textDialog?.value?.trim();
    if (!name) return;
    if (type === "canvas") await createCanvasEntry(name, navigation.currentFolderPath);
    else if (type === "folder") await createFolderEntry(name, navigation.currentFolderPath);
    else if (type === "create-dome") await createNewDome(name);
    setTextDialog(null);
  }

  async function submitRename() {
    const name = textDialog?.value?.trim();
    if (!name || !textDialog?.target) return;
    await renameItemEntry(textDialog.target, name);
    setTextDialog(null);
  }

  async function submitDelete() {
    if (!confirmDialog?.target) return;
    await deleteItemEntry(confirmDialog.target);
    setConfirmDialog(null);
  }

  function openCreateDialog(type, value) {
    setTextDialog({ type, value });
  }

  async function handleOpenEntry(entry) {
    if (isNarrowDesktop) {
      setSidebarDrawerOpen(false);
    }

    await openHomeItem(entry);
    persistHomeContext(navigation, homePreferences, null, { lastOpenedItemPath: entry.path });
  }

  function describeEmptyState() {
    if (navigation.selectedSection === "recents") {
      return {
        title: "No recent canvases yet",
        description: "Open a canvas and it will move to the top of this list.",
      };
    }
    if (navigation.selectedSection === "starred") {
      return {
        title: "Nothing starred yet",
        description: "Star important canvases to keep them pinned here.",
      };
    }
    if (searchQuery.trim()) {
      return {
        title: "No matching results",
        description: "Try a different search term.",
      };
    }
    return {
      title: "No canvases yet",
      description: "Create your first canvas to populate All files.",
    };
  }

  const emptyState = describeEmptyState();
  const sectionTitle = sectionLabel(navigation.selectedSection);
  const itemCountLabel = formatItemCount(browserItems.length, "canvas");
  return (
    <main
      ref={shellRef}
      className={`ap-home${!hasWorkspace ? " ap-home--launch" : ""}${isNarrowDesktop && hasWorkspace ? " ap-home--no-sidebar" : ""}`}
    >
      {!isNarrowDesktop && hasWorkspace ? (
        <HomeSidebar
          navigation={navigation}
          allCanvasItems={allCanvasItems}
          homeData={homeData}
          folderPath={folderPath}
          activeDome={activeDome}
          pendingDome={pendingDome}
          sectionTitle={sectionTitle}
          onSectionChange={handleSectionChange}
          onManageWorkspaces={() => setManageDomesOpen(true)}
          onOpenSerendipity={() => setSerendipityOpen(true)}
        />
      ) : null}

      <section className="ap-home-main">
        {hasWorkspace ? (
          <div className="ap-home-toolbar">
            {isNarrowDesktop ? (
              <AppButton type="button" tone="surface" className="ap-home-sidebar-trigger" onClick={() => setSidebarDrawerOpen(true)}>
                <Menu size={17} aria-hidden="true" />
                Menu
              </AppButton>
            ) : null}
            {isNarrowDesktop ? (
              <div className="ap-home-toolbar__heading">
                <span className="ap-home-toolbar__eyebrow">Workspace</span>
                <h1 className="ap-home-toolbar__title">{sectionTitle}</h1>
              </div>
            ) : null}
            <div className="ap-home-toolbar__controls">
              <div className="ap-home-search">
                <Search size={14} aria-hidden="true" className="ap-home-search__icon" />
                <AppInput
                  type="text"
                  className="ap-home-search__input"
                  placeholder="Search this workspace"
                  aria-label="Search this workspace"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && searchQuery) {
                      event.preventDefault();
                      setSearchQuery("");
                    }
                  }}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="ap-home-search__clear"
                    aria-label="Clear search"
                    title="Clear search"
                    onClick={() => setSearchQuery("")}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="ap-home-view-toggle" role="tablist" aria-label="Home view mode">
                <button
                  type="button"
                  role="tab"
                  aria-label="List view"
                  title="List view"
                  aria-selected={!isCardsView}
                  aria-pressed={!isCardsView}
                  className={`ap-home-view-toggle__btn${!isCardsView ? " is-active" : ""}`}
                  onClick={() => {
                    const nextPreferences = { ...homePreferences, viewMode: "list" };
                    setHomeViewMode("list");
                    setHomePreferences(nextPreferences);
                    persistHomeContext(navigation, nextPreferences, 0, {}, "list");
                  }}
                >
                  <LayoutList size={15} aria-hidden="true" />
                  <span>List</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-label="Card view"
                  title="Card view"
                  aria-selected={isCardsView}
                  aria-pressed={isCardsView}
                  className={`ap-home-view-toggle__btn${isCardsView ? " is-active" : ""}`}
                  onClick={() => {
                    const nextPreferences = { ...homePreferences, viewMode: "cards" };
                    setHomeViewMode("cards");
                    setHomePreferences(nextPreferences);
                    persistHomeContext(navigation, nextPreferences, 0, {}, "cards");
                  }}
                >
                  <Grid2X2 size={15} aria-hidden="true" />
                  <span>Cards</span>
                </button>
              </div>
              <AppButton
                type="button"
                tone="surface"
                size="icon"
                aria-label="Refresh workspace"
                title="Refresh workspace"
                disabled={folderLoading}
                onClick={() => void refreshHomeData(folderPath, navigation.currentFolderPath)}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </AppButton>
            </div>
            <div className="ap-home-toolbar__actions">
              <AppButton type="button" tone="surface" disabled={folderLoading} title="Import files, or a canvas someone shared with you (.airpaste-share)" onClick={() => void importFilesIntoFolder(navigation.currentFolderPath)}>
                <Import size={16} aria-hidden="true" />
                Import
              </AppButton>
              <AppButton type="button" tone="accent" onClick={() => openCreateDialog("canvas", "Canvas")}>
                <Plus size={17} aria-hidden="true" />
                Create Canvas
              </AppButton>
            </div>
          </div>
        ) : null}

        <div ref={bodyRef} className="ap-home-content" onScroll={handleBodyScroll}>
          {!hasWorkspace ? (
            <WorkspaceLaunchScreen
              domes={domes}
              folderLoading={folderLoading}
              activeDome={activeDome}
              onCreateWorkspace={() => openCreateDialog("create-dome", "New Workspace")}
              onOpenWorkspace={() => void openExistingWorkspace()}
              onOpenDome={(dome) => void handleSwitchDome(dome)}
              onManageWorkspaces={() => setManageDomesOpen(true)}
            />
          ) : pendingDome ? (
            <WorkspaceSwitchingState name={pendingDome.name} />
          ) : browserItems.length === 0 && starredGroups.length === 0 ? (
            <BrowserEmptyState
              title={emptyState.title}
              description={emptyState.description}
              onNewCanvas={() => openCreateDialog("canvas", "Canvas")}
              onImportFiles={() => void importFilesIntoFolder(navigation.currentFolderPath)}
            />
          ) : (
            <>
            <section key={folderPath} className="ap-home-panel">
              {openGroup && isCardsView ? null : (
                <div className="ap-home-panel-header">
                  <h3 className="ap-home-panel-header__title">{sectionTitle}</h3>
                  <div className="ap-home-panel-header__meta">
                    <span className="ap-home-pill">{itemCountLabel}</span>
                    {searchQuery.trim() ? <span className="ap-home-pill">Filtered</span> : null}
                  </div>
                </div>
              )}
              {isCardsView ? (
                <HomeCardsView
                  folderPath={folderPath}
                  canvases={canvasItems}
                  thumbCanvases={groupingActive || starredGroups.length > 0 ? allCanvasItems : canvasItems}
                  layout={homeLayout}
                  grouping={groupingActive && !openGroup}
                  openGroupId={openGroup?.id ?? null}
                  starredGroups={starredGroups}
                  onLayoutChange={updateHomeLayout}
                  onOpenGroup={(groupId) => {
                    // Groups open on Home (e.g. from Starred).
                    if (navigation.selectedSection !== "home") void handleSectionChange("home");
                    setOpenGroupId(groupId);
                  }}
                  onCloseGroup={() => setOpenGroupId(null)}
                  onOpenCanvas={(entry) => void handleOpenEntry(entry)}
                  onRename={(entry) => setTextDialog({ type: "rename", value: entry.name, target: entry })}
                  onDelete={(entry) => setConfirmDialog({ target: entry })}
                  onToggleStar={(entry) => void toggleItemStarred(entry.filePath, !entry.starred)}
                  onDragStart={endPeek}
                  peekHandlers={peekHandlers}
                />
              ) : (
                <div className="ap-home-list">
                  {browserItems.map((item, index) => (
                    <BrowserCard
                      key={itemKey(item)}
                      item={item}
                      viewMode={browserViewMode}
                      isActive={item.path === activeItemPath}
                      menuOpen={openMenuKey === itemKey(item)}
                      onMenuToggle={(key) => setOpenMenuKey((current) => current === key ? "" : key)}
                      onMenuClose={() => setOpenMenuKey("")}
                      onOpen={(entry) => void handleOpenEntry(entry)}
                      onRename={(entry) => setTextDialog({ type: "rename", value: entry.name, target: entry })}
                      onDelete={(entry) => setConfirmDialog({ target: entry })}
                      onToggleStar={(entry) => void toggleItemStarred(entry.filePath, !entry.starred)}
                      onFocusPrev={() => listButtonRefs.current[Math.max(0, index - 1)]?.focus?.()}
                      onFocusNext={() => listButtonRefs.current[Math.min(browserItems.length - 1, index + 1)]?.focus?.()}
                      listButtonRef={(node) => {
                        listButtonRefs.current[index] = node;
                      }}
                      peekHandlers={peekHandlers}
                      style={{ "--ap-stagger": Math.min(index, 14) }}
                    />
                  ))}
                </div>
              )}
            </section>
            </>
          )}
        </div>
      </section>

      {hasWorkspace ? <HomeCanvasPeek peek={peek} folderPath={folderPath} /> : null}

      {isNarrowDesktop ? (
        <AppSheet open={sidebarDrawerOpen} onOpenChange={setSidebarDrawerOpen}>
          <AppSheetContent side="left" className="ap-home-sidebar ap-home-sidebar--drawer">
            <HomeSidebarContent
              navigation={navigation}
              allCanvasItems={allCanvasItems}
              homeData={homeData}
              folderPath={folderPath}
              activeDome={activeDome}
              pendingDome={pendingDome}
              onSectionChange={handleSectionChange}
              onManageWorkspaces={() => {
                setSidebarDrawerOpen(false);
                setManageDomesOpen(true);
              }}
              onOpenSerendipity={() => {
                setSidebarDrawerOpen(false);
                setSerendipityOpen(true);
              }}
            />
          </AppSheetContent>
        </AppSheet>
      ) : null}

      {serendipityOpen && hasWorkspace ? (
        <Suspense fallback={null}>
          <ConstellationView
            canvasItems={allCanvasItems}
            onClose={() => setSerendipityOpen(false)}
          />
        </Suspense>
      ) : null}

      <TextPromptDialog
        open={Boolean(textDialog)}
        title={
          textDialog?.type === "rename"
            ? "Rename entry"
            : textDialog?.type === "canvas"
              ? "Create canvas"
              : textDialog?.type === "folder"
                ? "Create folder"
                : "Create Workspace"
        }
        description={
          textDialog?.type === "rename"
            ? "Update the selected folder or file name."
            : textDialog?.type === "create-dome"
              ? "Choose a workspace name."
              : textDialog?.type === "folder"
                ? "Create a folder in the current location."
                : "Choose a name for the new file."
        }
        confirmLabel={textDialog?.type === "rename" ? "Save" : "Create"}
        value={textDialog?.value ?? ""}
        disabled={!textDialog?.value?.trim() || folderLoading}
        onChange={(value) => setTextDialog((current) => (current ? { ...current, value } : current))}
        onCancel={() => setTextDialog(null)}
        onConfirm={() => {
          if (!textDialog) return;
          void (textDialog.type === "rename" ? submitRename() : submitCreate(textDialog.type));
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog ? `Delete ${confirmDialog.target.name}?` : ""}
        description="This cannot be undone."
        disabled={folderLoading}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => void submitDelete()}
      />

      <ManageWorkspacesDialog
        open={manageDomesOpen}
        domes={domes}
        activeDomeId={activeDome?.id}
        pendingDomeId={pendingDome?.id ?? null}
        folderLoading={folderLoading}
        onClose={() => setManageDomesOpen(false)}
        onRefresh={() => void refreshDomes()}
        onCreateNew={() => openCreateDialog("create-dome", "New Workspace")}
        onOpenFolder={() => void openExistingWorkspace()}
        onOpenDome={(dome) => void handleSwitchDome(dome)}
        onRevealDome={(path) => void revealDome(path)}
        onRemoveDome={(id) => void removeDome(id)}
      />
    </main>
  );
}
