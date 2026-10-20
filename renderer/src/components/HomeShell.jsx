import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import "./HomeShell.css";

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

function SectionIcon({ section }) {
  if (section === "starred") return <Star size={16} aria-hidden="true" />;
  return <Home size={16} aria-hidden="true" />;
}

function IconSidebarToggle({ collapsed = false }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.7" />
      <path
        d={collapsed ? "m14 9 3 3-3 3" : "m17 9-3 3 3 3"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

function HomeEntryMenu({ item, open, onOpenChange, onRename, onDelete, onToggleStar, triggerClassName, triggerLabel }) {
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

function BrowserCard({ item, viewMode, isActive = false, menuOpen = false, onMenuToggle, onMenuClose, onOpen, onRename, onDelete, onToggleStar, onFocusPrev, onFocusNext, listButtonRef }) {
  const primaryMeta = item.type !== "folder"
    ? `Edited ${formatRelativeTime(item.updatedAt)}`
    : (item.path || "Workspace root");
  const stats = [
    { label: "Tiles", value: Number.isFinite(item.tileCount) ? item.tileCount : 0 },
    { label: "Pages", value: Number.isFinite(item.pageCount) ? item.pageCount : 0 },
  ];

  if (viewMode === "list") {
    return (
      <div className={`ap-home-row${isActive ? " is-selected" : ""}`}>
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
    );
  }

  return (
    <article className={`ap-home-card${isActive ? " is-selected" : ""}${menuOpen ? " is-menu-open" : ""}`}>
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
  );
}

function WorkspaceLaunchScreen({ domes, folderLoading, activeDome, onCreateWorkspace, onOpenWorkspace, onOpenDome, onManageWorkspaces }) {
  const recentDomes = Array.isArray(domes) ? domes.slice(0, 4) : [];

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
              onClick={() => onOpenDome(dome.id)}
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
}) {
  const tileCount = Number.isFinite(item.tileCount) ? item.tileCount : 0;
  const pageCount = Number.isFinite(item.pageCount) ? item.pageCount : 0;
  const editedLabel = `Edited ${formatRelativeTime(item.updatedAt)}`;
  const summaryLabel = `${formatItemCount(tileCount, "tile")} · ${formatItemCount(pageCount, "page")}`;

  return (
    <article className={`ap-home-card${item.starred ? " is-starred" : ""}${menuOpen ? " is-menu-open" : ""}`} role="listitem">
      <div className="ap-home-card__toolbar">
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
            <img className="ap-home-card__thumb-image" src={thumbUrl} alt={`${item.name} preview`} loading="lazy" />
          ) : (
            <div className="ap-home-card__thumb-placeholder" aria-hidden="true" />
          )}
        </div>
        <div className="ap-home-card__body">
          <div className="ap-home-card__heading">
            <div className="ap-home-card__title">{item.name}</div>
            <div className="ap-home-card__subtitle">{editedLabel}</div>
          </div>
          <div className="ap-home-card__summary">{summaryLabel}</div>
        </div>
      </button>
    </article>
  );
}

function HomeCardsView({ folderPath, canvases, onOpenCanvas, onRename, onDelete, onToggleStar }) {
  const [thumbUrls, setThumbUrls] = useState(() => ({}));
  const [openMenuKey, setOpenMenuKey] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveThumbnails() {
      if (!folderPath || !Array.isArray(canvases) || canvases.length === 0) {
        setThumbUrls({});
        return;
      }

      const entries = await Promise.all(canvases.map(async (item) => {
        if (!item?.thumbnailPath) {
          return [itemKey(item), ""];
        }
        const resolved = await desktop.workspace.resolveAssetUrl(folderPath, item.thumbnailPath, { previewTier: "original" });
        return [itemKey(item), resolved || ""];
      }));

      if (cancelled) return;
      setThumbUrls(Object.fromEntries(entries));
    }

    void resolveThumbnails();

    return () => {
      cancelled = true;
    };
  }, [canvases, folderPath]);

  if (!Array.isArray(canvases) || canvases.length === 0) {
    return (
      <section className="ap-home-empty">
        <div className="ap-home-empty__icon">
          <Grid2X2 size={22} aria-hidden="true" />
        </div>
        <span className="ap-home-empty__eyebrow">Cards</span>
        <h2 className="ap-home-empty__title">No canvases yet</h2>
        <p className="ap-home-empty__copy">Create a canvas to see it appear here as a card with a live preview.</p>
      </section>
    );
  }

  return (
    <div className="ap-home-grid" role="list">
      {canvases.map((item) => {
        const key = itemKey(item);
        const thumbUrl = thumbUrls[itemKey(item)] || "";
        return (
          <HomeCanvasCardItem
            key={key}
            item={item}
            thumbUrl={thumbUrl}
            menuOpen={openMenuKey === key}
            onOpenCanvas={onOpenCanvas}
            onRename={onRename}
            onDelete={onDelete}
            onToggleStar={onToggleStar}
            onMenuToggle={() => setOpenMenuKey((current) => (current === key ? null : key))}
            onMenuClose={() => setOpenMenuKey(null)}
          />
        );
      })}
    </div>
  );
}

function HomeSidebarContent({
  navigation,
  allCanvasItems,
  homeData,
  folderPath,
  activeDome,
  collapsed = false,
  onSectionChange,
  onToggleCollapsed,
  onManageWorkspaces,
}) {
  return (
    <>
      {onToggleCollapsed ? (
        <div className="ap-home-sidebar__toggle-row">
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
      </nav>

      <div className="ap-home-sidebar__spacer" />

      <div className="ap-home-sidebar__footer">
        <div className="ap-home-workspace-card">
          <span className="ap-home-workspace-card__label">Workspace</span>
          <h3 className="ap-home-workspace-card__name">{activeDome?.name || "AirPaste"}</h3>
          <p className="ap-home-workspace-card__path" title={folderPath || activeDome?.path || "Workspace path unavailable."}>
            {folderPath || activeDome?.path || "Workspace path unavailable."}
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

function ManageWorkspacesDialog({ open, domes, activeDomeId, folderLoading, onClose, onRefresh, onCreateNew, onOpenFolder, onOpenDome, onRevealDome, onRemoveDome }) {
  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AppDialogContent className="max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>Manage Workspaces</AppDialogTitle>
          <AppDialogDescription>Switch, reveal, remove, or create workspaces.</AppDialogDescription>
        </AppDialogHeader>
        <div className="ap-home-dome-list">
          {domes.length === 0 ? (
            <p className="ap-home-empty__copy">No workspaces yet.</p>
          ) : (
            domes.map((dome) => (
              <div key={dome.id} className="ap-home-dome-row">
                <div>
                  <div className="ap-home-dome-row__name">{dome.name}{dome.id === activeDomeId ? " (active)" : ""}</div>
                  <div className="ap-home-dome-row__meta">
                    {dome.path}
                    {dome.exists === false ? " · Missing" : ""}
                    {dome.valid === false ? " · Needs initialization" : ""}
                  </div>
                </div>
                <div className="ap-home-dome-row__actions">
                  <AppButton type="button" tone="surface" size="sm" disabled={folderLoading} onClick={() => onOpenDome(dome.id)}>Open</AppButton>
                  <AppButton type="button" tone="surface" size="sm" onClick={() => onRevealDome(dome.path)}>Reveal</AppButton>
                  <AppButton type="button" tone="danger" size="sm" onClick={() => onRemoveDome(dome.id)}>Remove</AppButton>
                </div>
              </div>
            ))
          )}
        </div>
        <AppDialogFooter>
          <AppButton type="button" tone="surface" onClick={onClose}>Close</AppButton>
          <AppButton type="button" tone="surface" onClick={onRefresh}>Refresh</AppButton>
          <AppButton type="button" tone="surface" onClick={onCreateNew}>Create New</AppButton>
          <AppButton type="button" tone="accent" onClick={onOpenFolder}>Open Folder</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
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
  // Stopgap, in-memory substring filter over data already loaded for the
  // current folder -- no IPC/index involved. The real search-index-backed
  // implementation lands later; buildBrowserItems' signature is kept stable
  // so that swap stays contained to this one call site.
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuKey, setOpenMenuKey] = useState("");
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [homeSidebarCollapsed, setHomeSidebarCollapsed] = useState(false);
  const [homeViewMode, setHomeViewMode] = useState(() => getResolvedHomeViewMode(homeData.uiState));
  const listButtonRefs = useRef([]);
  const browserViewMode = homeViewMode;
  const isCardsView = browserViewMode === "cards";

  useEffect(() => {
    const normalizedPreferences = normalizeHomePreferences(homeData.uiState);
    setNavigation(normalizeHomeNavigation(homeData.uiState));
    setHomePreferences(normalizedPreferences);
    setHomeViewMode(getResolvedHomeViewMode(homeData.uiState));
  }, [homeData.uiState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      setHomeSidebarCollapsed(window.localStorage.getItem(HOME_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true");
    } catch {
      // Ignore persistence failures and keep the default expanded state.
    }
  }, []);

  useEffect(() => () => window.clearTimeout(scrollSaveTimeoutRef.current), []);

  useEffect(() => {
    if (!isNarrowDesktop) {
      setSidebarDrawerOpen(false);
    }
  }, [isNarrowDesktop]);

  useEffect(() => {
    if (typeof window === "undefined" || isNarrowDesktop) {
      return;
    }

    try {
      window.localStorage.setItem(HOME_SIDEBAR_COLLAPSED_STORAGE_KEY, String(homeSidebarCollapsed));
    } catch {
      // Ignore persistence failures.
    }
  }, [homeSidebarCollapsed, isNarrowDesktop]);

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

  useEffect(() => {
    listButtonRefs.current = listButtonRefs.current.slice(0, browserItems.length);
  }, [browserItems.length]);

  const handleSectionChange = useCallback(async (selectedSection) => {
    if (isNarrowDesktop) {
      setSidebarDrawerOpen(false);
    }
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
      className={`ap-home${!hasWorkspace ? " ap-home--launch" : ""}${homeSidebarCollapsed && hasWorkspace && !isNarrowDesktop ? " ap-home--sidebar-collapsed" : ""}${isNarrowDesktop && hasWorkspace ? " ap-home--no-sidebar" : ""}`}
    >
      {!isNarrowDesktop && hasWorkspace ? (
        <aside className={`ap-home-sidebar${homeSidebarCollapsed ? " ap-home-sidebar--collapsed" : ""}`}>
          <HomeSidebarContent
            navigation={navigation}
            allCanvasItems={allCanvasItems}
            homeData={homeData}
            folderPath={folderPath}
            activeDome={activeDome}
            collapsed={homeSidebarCollapsed}
            onSectionChange={handleSectionChange}
            onToggleCollapsed={() => setHomeSidebarCollapsed((current) => !current)}
            onManageWorkspaces={() => setManageDomesOpen(true)}
          />
        </aside>
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
            <div className="ap-home-toolbar__heading">
              <span className="ap-home-toolbar__eyebrow">Workspace</span>
              <h1 className="ap-home-toolbar__title">{sectionTitle}</h1>
            </div>
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
              <AppButton type="button" tone="surface" disabled={folderLoading} onClick={() => void importFilesIntoFolder(navigation.currentFolderPath)}>
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
              onOpenDome={(id) => void switchDome(id)}
              onManageWorkspaces={() => setManageDomesOpen(true)}
            />
          ) : browserItems.length === 0 ? (
            <BrowserEmptyState
              title={emptyState.title}
              description={emptyState.description}
              onNewCanvas={() => openCreateDialog("canvas", "Canvas")}
              onImportFiles={() => void importFilesIntoFolder(navigation.currentFolderPath)}
            />
          ) : (
            <section className="ap-home-panel">
              <div className="ap-home-panel-header">
                <h3 className="ap-home-panel-header__title">{sectionTitle}</h3>
                <div className="ap-home-panel-header__meta">
                  <span className="ap-home-pill">{itemCountLabel}</span>
                  {searchQuery.trim() ? <span className="ap-home-pill">Filtered</span> : null}
                </div>
              </div>
              {isCardsView ? (
                <HomeCardsView
                  folderPath={folderPath}
                  canvases={canvasItems}
                  onOpenCanvas={(entry) => void handleOpenEntry(entry)}
                  onRename={(entry) => setTextDialog({ type: "rename", value: entry.name, target: entry })}
                  onDelete={(entry) => setConfirmDialog({ target: entry })}
                  onToggleStar={(entry) => void toggleItemStarred(entry.filePath, !entry.starred)}
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
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </section>

      {isNarrowDesktop ? (
        <AppSheet open={sidebarDrawerOpen} onOpenChange={setSidebarDrawerOpen}>
          <AppSheetContent side="left" className="ap-home-sidebar ap-home-sidebar--drawer">
            <HomeSidebarContent
              navigation={navigation}
              allCanvasItems={allCanvasItems}
              homeData={homeData}
              folderPath={folderPath}
              activeDome={activeDome}
              onSectionChange={handleSectionChange}
              onManageWorkspaces={() => {
                setSidebarDrawerOpen(false);
                setManageDomesOpen(true);
              }}
            />
          </AppSheetContent>
        </AppSheet>
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
        folderLoading={folderLoading}
        onClose={() => setManageDomesOpen(false)}
        onRefresh={() => void refreshDomes()}
        onCreateNew={() => openCreateDialog("create-dome", "New Workspace")}
        onOpenFolder={() => void openExistingWorkspace()}
        onOpenDome={(id) => void switchDome(id)}
        onRevealDome={(path) => void revealDome(path)}
        onRemoveDome={(id) => void removeDome(id)}
      />
    </main>
  );
}
