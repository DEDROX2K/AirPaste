import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "../context/useAppContext";
import {
  buildHomeRouteState,
  filterItemsByPreference,
  formatRelativeTime,
  normalizeHomeNavigation,
  normalizeHomePreferences,
  sortEntriesByPreference,
} from "../lib/home";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { desktop } from "../lib/desktop";
import { AppButton, AppSheet, AppSheetContent } from "./ui/app";
import "./HomeShellPrototype.css";

const HOME_MENU_GAP = 8;
const HOME_MENU_MIN_WIDTH = 176;

function typeLabel(type) {
  if (type === "folder") return "Folder";
  if (type === "canvas") return "Canvas";
  if (type === "asset") return "Asset";
  return "File";
}

function sectionLabel(section) {
  if (section === "recents") return "Recent";
  if (section === "starred") return "Starred";
  return "All files";
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

function getHomeMenuPosition(anchorRect, menuWidth, menuHeight) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const openUpward = anchorRect.bottom + HOME_MENU_GAP + menuHeight > viewportHeight - HOME_MENU_GAP
    && anchorRect.top - HOME_MENU_GAP - menuHeight >= HOME_MENU_GAP;

  const preferredX = anchorRect.right - menuWidth;
  const preferredY = openUpward
    ? anchorRect.top - HOME_MENU_GAP - menuHeight
    : anchorRect.bottom + HOME_MENU_GAP;

  return {
    x: Math.min(
      Math.max(HOME_MENU_GAP, preferredX),
      Math.max(HOME_MENU_GAP, viewportWidth - menuWidth - HOME_MENU_GAP),
    ),
    y: Math.min(
      Math.max(HOME_MENU_GAP, preferredY),
      Math.max(HOME_MENU_GAP, viewportHeight - menuHeight - HOME_MENU_GAP),
    ),
  };
}

function BrowserEntryMenu({ item, anchorRect, onRename, onDelete, onToggleStar, onClose }) {
  const portalRoot = typeof document !== "undefined" ? document.body : null;
  const menuRef = useRef(null);
  const [position, setPosition] = useState(() => ({
    x: Math.max(HOME_MENU_GAP, (anchorRect?.right ?? HOME_MENU_GAP) - HOME_MENU_MIN_WIDTH),
    y: Math.max(HOME_MENU_GAP, (anchorRect?.bottom ?? HOME_MENU_GAP) + HOME_MENU_GAP),
  }));

  useLayoutEffect(() => {
    if (!anchorRect || !menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    setPosition(getHomeMenuPosition(anchorRect, Math.max(HOME_MENU_MIN_WIDTH, rect.width), rect.height));
  }, [anchorRect, item?.starred]);

  if (!portalRoot || !anchorRect) {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="menu-card is-dropdown home-entry-menu"
      role="menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        minWidth: `${HOME_MENU_MIN_WIDTH}px`,
      }}
    >
      <div className="menu-list">
        <AppButton type="button" tone="surface" className="dropdown-item browser-entry-menu__action" onClick={() => { onToggleStar(item); onClose(); }}>
          {item.starred ? "Remove star" : "Add star"}
        </AppButton>
        <AppButton type="button" tone="surface" className="dropdown-item browser-entry-menu__action" onClick={() => { onRename(item); onClose(); }}>
          Rename
        </AppButton>
        <AppButton type="button" tone="danger" className="dropdown-item browser-entry-menu__action browser-entry-menu__action--danger" onClick={() => { onDelete(item); onClose(); }}>
          Delete
        </AppButton>
      </div>
    </div>,
    portalRoot,
  );
}

function BrowserCard({ item, viewMode, isActive = false, menuOpen = false, onMenuToggle, onMenuClose, onOpen, onRename, onDelete, onToggleStar, onFocusPrev, onFocusNext, listButtonRef }) {
  const primaryMeta = item.type !== "folder"
    ? `Edited ${formatRelativeTime(item.updatedAt)}`
    : (item.path || "Workspace root");
  const menuButtonRef = useRef(null);
  const stats = [
    { label: "Tiles", value: Number.isFinite(item.tileCount) ? item.tileCount : 0 },
    { label: "Pages", value: Number.isFinite(item.pageCount) ? item.pageCount : 0 },
  ];
  const anchorRect = menuButtonRef.current?.getBoundingClientRect() ?? null;

  if (viewMode === "list") {
    return (
      <div className={`list-row${isActive ? " is-selected" : ""}`}>
        <button
          ref={listButtonRef}
          type="button"
          className="list-row-button"
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
          <div className="list-row-copy">
            <div className="list-row-title">{item.name}</div>
          </div>
        </button>
        <div className="list-row-actions">
          <div className="list-row-stats" aria-label={`${item.name} stats`}>
            {stats.map((stat) => (
              <div key={stat.label} className="list-row-stat">
                <span className="list-row-stat__value">{stat.value}</span>
                <span className="list-row-stat__label">{stat.label}</span>
              </div>
            ))}
          </div>
          <div className={`menu-shell${menuOpen ? " is-open" : ""}`}>
            <AppButton ref={menuButtonRef} type="button" tone="surface" size="icon" className="mini-button list-row-inline-action" onClick={() => onMenuToggle(itemKey(item))}>...</AppButton>
          </div>
          <button
            type="button"
            className={`list-row-star-button list-row-inline-action${item.starred ? " is-starred" : ""}`}
            aria-label={item.starred ? "Remove star" : "Add star"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleStar(item);
            }}
          >
            <img src="/icons/star.svg" alt="" aria-hidden="true" className="list-row-star-icon" />
          </button>
          {menuOpen ? (
            <BrowserEntryMenu
              item={item}
              anchorRect={anchorRect}
              onRename={onRename}
              onDelete={onDelete}
              onToggleStar={onToggleStar}
              onClose={onMenuClose}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <article className={`browser-card${isActive ? " is-selected" : ""}${menuOpen ? " is-menu-open" : ""}`}>
      <button type="button" className="browser-card-button" onClick={() => onOpen(item)}>
        <div className="browser-card-thumb" />
        <div className="browser-card-copy">
          <h4 className="browser-card-title">{item.name}</h4>
          <p className="muted-copy">{primaryMeta}</p>
        </div>
      </button>
      <div className="browser-card-actions">
        <AppButton type="button" tone="surface" className="home-card-action is-flex" onClick={() => onOpen(item)}>Open</AppButton>
        <div className={`menu-shell${menuOpen ? " is-open" : ""}`}>
          <AppButton ref={menuButtonRef} type="button" tone="surface" size="icon" className="mini-button" onClick={() => onMenuToggle(itemKey(item))}>...</AppButton>
        </div>
        {menuOpen ? (
          <BrowserEntryMenu
            item={item}
            anchorRect={anchorRect}
            onRename={onRename}
            onDelete={onDelete}
            onToggleStar={onToggleStar}
            onClose={onMenuClose}
          />
        ) : null}
      </div>
    </article>
  );
}

function BrowserEmptyState({ title, description, onNewCanvas, onImportFiles }) {
  return (
    <section className="empty-card">
      <div className="eyebrow">Workspace</div>
      <h2 className="dialog-title">{title}</h2>
      <p className="muted-copy">{description}</p>
      <div className="dome-actions">
        <AppButton type="button" tone="accent" onClick={onNewCanvas}>Create Canvas</AppButton>
        <AppButton type="button" tone="surface" onClick={onImportFiles}>Import Files</AppButton>
      </div>
    </section>
  );
}

function HomeSheetsView({ folderPath, pages, thumbnailPathByCanvasPath, onOpenPage }) {
  const listRef = useRef(null);
  const cardRefs = useRef(new Map());
  const [repeatCount, setRepeatCount] = useState(2);
  const renderPages = useMemo(() => {
    if (!Array.isArray(pages) || pages.length === 0) return [];
    const repeated = [];
    const count = Math.max(1, repeatCount);
    for (let i = 0; i < count; i += 1) {
      pages.forEach((page) => repeated.push({ ...page, __repeatKey: `${i}:${page.sheetId}` }));
    }
    return repeated;
  }, [pages, repeatCount]);

  const [thumbUrlsByCanvasPath, setThumbUrlsByCanvasPath] = useState(() => ({}));

  useEffect(() => {
    let cancelled = false;

    async function resolveThumbs() {
      if (!folderPath) {
        setThumbUrlsByCanvasPath({});
        return;
      }

      const entries = await Promise.all(Object.entries(thumbnailPathByCanvasPath || {}).map(async ([canvasFilePath, thumbPath]) => {
        if (!thumbPath) return [canvasFilePath, ""];
        const resolved = await desktop.workspace.resolveAssetUrl(folderPath, thumbPath, { previewTier: "original" });
        return [canvasFilePath, resolved || ""];
      }));

      if (cancelled) return;
      setThumbUrlsByCanvasPath(Object.fromEntries(entries));
    }

    void resolveThumbs();

    return () => {
      cancelled = true;
    };
  }, [folderPath, thumbnailPathByCanvasPath]);

  const handleScroll = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    const nearBottom = node.scrollTop + node.clientHeight > node.scrollHeight - 900;
    if (nearBottom) {
      setRepeatCount((count) => Math.min(12, count + 1));
    }
  }, []);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;

    let rafId = 0;
    const tick = () => {
      const viewportTop = 0;
      const viewportHeight = node.clientHeight || window.innerHeight || 1;
      const centerY = viewportTop + viewportHeight * 0.5;

      cardRefs.current.forEach((el) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cardCenter = rect.top + rect.height * 0.5;
        const distance = (cardCenter - centerY) / viewportHeight; // ~ -0.5..0.5
        const clamped = Math.max(-0.8, Math.min(0.8, distance));
        const abs = Math.abs(clamped);
        const tilt = clamped * -18; // degrees
        const scale = 1 - abs * 0.12;
        const blur = abs * 2.2;
        el.style.setProperty("--sheet-tilt", `${tilt}deg`);
        el.style.setProperty("--sheet-scale", `${scale}`);
        el.style.setProperty("--sheet-blur", `${blur}px`);
      });

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [renderPages.length]);

  if (!Array.isArray(pages) || pages.length === 0) {
    return (
      <section className="empty-card home-sheets-empty">
        <div className="eyebrow">Sheets</div>
        <h2 className="dialog-title">No canvases yet</h2>
        <p className="muted-copy">Create canvases to populate this scrollable preview list.</p>
      </section>
    );
  }

  return (
    <div className="home-browser-sheets home-browser-sheets--scroll" ref={listRef} onScroll={handleScroll}>
      {renderPages.map((page) => {
        const thumbUrl = thumbUrlsByCanvasPath[page.canvasFilePath] || "";
        return (
          <article
            key={page.__repeatKey}
            className="home-sheet-card home-sheet-card--scroll"
            ref={(node) => {
              if (!node) {
                cardRefs.current.delete(page.__repeatKey);
                return;
              }
              cardRefs.current.set(page.__repeatKey, node);
            }}
          >
            <div className="home-sheet-card__titlebar">
              <span className="home-sheet-card__close">x</span>
              <span className="home-sheet-card__title">{page.displayName}</span>
            </div>
            <button
              type="button"
              className="home-sheet-card__surface home-sheet-card__surface--thumb"
              onClick={() => onOpenPage(page)}
            >
              {thumbUrl ? (
                <img className="home-sheet-card__thumb-image" src={thumbUrl} alt="" loading="lazy" />
              ) : (
                <div className="home-sheet-card__thumb-placeholder" aria-hidden="true" />
              )}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function HomeCardsView({ folderPath, canvases, onOpenCanvas, onRename, onDelete, onToggleStar }) {
  const [thumbUrls, setThumbUrls] = useState(() => ({}));

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
      <section className="empty-card home-cards-empty">
        <div className="eyebrow">Cards</div>
        <h2 className="dialog-title">No canvases yet</h2>
        <p className="muted-copy">Create a canvas to see it appear here as a card with a live preview.</p>
      </section>
    );
  }

  return (
    <div className="home-browser-cards" role="list">
      {canvases.map((item) => {
        const thumbUrl = thumbUrls[itemKey(item)] || "";
        const tileCount = Number.isFinite(item.tileCount) ? item.tileCount : 0;
        const pageCount = Number.isFinite(item.pageCount) ? item.pageCount : 0;
        return (
          <article key={itemKey(item)} className="home-canvas-card" role="listitem">
            <button
              type="button"
              className="home-canvas-card__hit"
              onClick={() => onOpenCanvas(item)}
            >
              <div className="home-canvas-card__thumb">
                {thumbUrl ? (
                  <img className="home-canvas-card__thumb-image" src={thumbUrl} alt={`${item.name} preview`} loading="lazy" />
                ) : (
                  <div className="home-canvas-card__thumb-placeholder" aria-hidden="true" />
                )}
              </div>
              <div className="home-canvas-card__meta">
                <div className="home-canvas-card__title">{item.name}</div>
                <div className="home-canvas-card__subtitle">Edited {formatRelativeTime(item.updatedAt)}</div>
                <div className="home-canvas-card__stats">
                  <span className="home-canvas-card__stat">{tileCount} tiles</span>
                  <span className="home-canvas-card__stat">{pageCount} pages</span>
                </div>
              </div>
            </button>

            <div className="home-canvas-card__actions">
              <AppButton type="button" tone="surface" onClick={() => onToggleStar(item)}>
                {item.starred ? "Starred" : "Star"}
              </AppButton>
              <AppButton type="button" tone="surface" onClick={() => onRename(item)}>Rename</AppButton>
              <AppButton type="button" tone="danger" onClick={() => onDelete(item)}>Delete</AppButton>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function HomeSidebarContent({
  searchQuery,
  onSearchChange,
  navigation,
  allCanvasItems,
  recentCanvasItems,
  homeData,
  folderPath,
  activeDome,
  onSectionChange,
  onManageWorkspaces,
}) {
  return (
    <>
      <div className="sidebar-section">
        <div className="eyebrow">Search</div>
        <input
          className="workspace-search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search folders, canvases, files"
        />
      </div>

      <div className="sidebar-section">
        {["home", "recents", "starred"].map((section) => (
          <AppButton
            key={section}
            type="button"
            tone="surface"
            className={`sidebar-link${navigation.selectedSection === section ? " is-active" : ""}`}
            onClick={() => void onSectionChange(section)}
          >
            <span>{section === "home" ? "Home" : sectionLabel(section)}</span>
            <span className="workspace-badge">
              {section === "home" ? allCanvasItems.length : (section === "recents" ? recentCanvasItems.length : homeData.starredItems.length)}
            </span>
          </AppButton>
        ))}
      </div>

      <div className="sidebar-section is-bottom">
        <div>
          <h3 className="brand-wordmark">AIR</h3>
          <p className="sidebar-path">{folderPath || activeDome?.path || "Workspace path unavailable."}</p>
        </div>
        <AppButton type="button" tone="surface" className="home-sidebar-action" onClick={onManageWorkspaces}>
          Manage Workspaces
        </AppButton>
      </div>
    </>
  );
}

function TextPromptDialog({ open, title, description, confirmLabel, value, disabled, onChange, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="dialog-overlay" onMouseDown={onCancel}>
      <div className="dialog-card is-small" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">{title}</h3>
        </div>
        <div className="dialog-body">
          <p className="muted-copy">{description}</p>
          <input
            className="workspace-search"
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
        </div>
        <div className="dialog-actions is-padded">
          <AppButton type="button" tone="surface" onClick={onCancel}>Cancel</AppButton>
          <AppButton type="button" tone="accent" disabled={disabled} onClick={onConfirm}>{confirmLabel}</AppButton>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, description, disabled, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="dialog-overlay" onMouseDown={onCancel}>
      <div className="dialog-card is-small" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">{title}</h3>
        </div>
        <div className="dialog-body">
          <p className="muted-copy">{description}</p>
        </div>
        <div className="dialog-actions is-padded">
          <AppButton type="button" tone="surface" onClick={onCancel}>Cancel</AppButton>
          <AppButton type="button" tone="danger" disabled={disabled} onClick={onConfirm}>Delete</AppButton>
        </div>
      </div>
    </div>
  );
}

function ManageWorkspacesDialog({ open, domes, activeDomeId, folderLoading, onClose, onRefresh, onCreateNew, onOpenFolder, onOpenDome, onRevealDome, onRemoveDome }) {
  if (!open) return null;

  return (
    <div className="dialog-overlay" onMouseDown={onClose}>
      <div className="dialog-card is-large" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">Manage Workspaces</h3>
        </div>
        <div className="dialog-body">
          <p className="muted-copy">Switch, reveal, remove, or create workspaces.</p>
          <div className="workspace-main-content">
            {domes.length === 0 ? (
              <div className="muted-copy">No workspaces yet.</div>
            ) : (
              domes.map((dome) => (
                <div key={dome.id} className="dome-list-row">
                  <div>
                    <div className="dome-name">{dome.name}{dome.id === activeDomeId ? " (active)" : ""}</div>
                    <div className="muted-copy">
                      {dome.path}
                      {dome.exists === false ? " · Missing" : ""}
                      {dome.valid === false ? " · Needs initialization" : ""}
                    </div>
                  </div>
                  <div className="dome-actions">
                    <AppButton type="button" tone="surface" disabled={folderLoading} onClick={() => onOpenDome(dome.id)}>Open</AppButton>
                    <AppButton type="button" tone="surface" onClick={() => onRevealDome(dome.path)}>Reveal</AppButton>
                    <AppButton type="button" tone="danger" onClick={() => onRemoveDome(dome.id)}>Remove</AppButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="dialog-actions is-padded">
          <AppButton type="button" tone="surface" onClick={onClose}>Close</AppButton>
          <AppButton type="button" tone="surface" onClick={onRefresh}>Refresh</AppButton>
          <AppButton type="button" tone="surface" onClick={onCreateNew}>Create New</AppButton>
          <AppButton type="button" tone="accent" onClick={onOpenFolder}>Open Folder</AppButton>
        </div>
      </div>
    </div>
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
    backfillCanvasThumbnails,
    renameItemEntry,
    revealDome,
    saveHomeUiState,
    setActiveCanvasPage,
    switchDome,
    toggleItemStarred,
  } = useAppContext();

  const [navigation, setNavigation] = useState(() => normalizeHomeNavigation(homeData.uiState));
  const [homePreferences, setHomePreferences] = useState(() => normalizeHomePreferences(homeData.uiState));
  const [textDialog, setTextDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [manageDomesOpen, setManageDomesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuKey, setOpenMenuKey] = useState("");
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [homeViewMode, setHomeViewMode] = useState(() => (
    normalizeHomePreferences(homeData.uiState).viewMode === "sheets"
      ? "sheets"
      : normalizeHomePreferences(homeData.uiState).viewMode === "cards"
        ? "cards"
        : "list"
  ));
  const listButtonRefs = useRef([]);
  const browserViewMode = homeViewMode;
  const isSheetsView = browserViewMode === "sheets";
  const isCardsView = browserViewMode === "cards";

  useEffect(() => {
    const normalizedPreferences = normalizeHomePreferences(homeData.uiState);
    setNavigation(normalizeHomeNavigation(homeData.uiState));
    setHomePreferences(normalizedPreferences);
    setHomeViewMode(
      normalizedPreferences.viewMode === "sheets"
        ? "sheets"
        : normalizedPreferences.viewMode === "cards"
          ? "cards"
          : "list"
    );
  }, [homeData.uiState]);

  useEffect(() => () => window.clearTimeout(scrollSaveTimeoutRef.current), []);

  useEffect(() => {
    if (!isNarrowDesktop) {
      setSidebarDrawerOpen(false);
    }
  }, [isNarrowDesktop]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!event.target.closest(".menu-shell") && !event.target.closest(".home-entry-menu")) {
        setOpenMenuKey("");
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!openMenuKey) {
      return undefined;
    }

    const handleViewportChange = () => setOpenMenuKey("");
    window.addEventListener("resize", handleViewportChange);
    return () => window.removeEventListener("resize", handleViewportChange);
  }, [openMenuKey]);

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

  const sheetPages = useMemo(() => {
    const pages = [];
    browserItems
      .filter((item) => item.type === "canvas")
      .forEach((item) => {
        const sourcePages = Array.isArray(item.pages) && item.pages.length > 0
          ? item.pages
          : Array.from({ length: Math.max(0, Number(item.pageCount) || 0) }, (_, index) => ({
            id: `page-${index + 1}`,
            name: `Page ${index + 1}`,
          }));

        sourcePages.forEach((page, pageIndex) => {
          const fallbackName = `Page ${pageIndex + 1}`;
          const pageName = page.name || fallbackName;
          pages.push({
            sheetId: `${item.id || item.path || item.name}:${page.id || pageIndex}`,
            canvasFilePath: item.filePath,
            canvasName: item.name,
            pageId: page.id || "",
            pageName,
            displayName: `${item.name} · ${pageName}`,
          });
        });
      });
    return pages;
  }, [browserItems]);

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

  async function handleOpenSheetPage(page) {
    if (!page?.canvasFilePath) {
      return;
    }
    const canvasEntry = browserItems.find((item) => item.filePath === page.canvasFilePath && item.type === "canvas");
    if (!canvasEntry) {
      return;
    }

    await openHomeItem(canvasEntry);
    if (page.pageId) {
      setActiveCanvasPage(page.pageId);
    }
    persistHomeContext(navigation, homePreferences, null, { lastOpenedItemPath: canvasEntry.path });
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

  return (
    <main ref={shellRef} className="home-shell">
      {!isNarrowDesktop ? (
        <aside className="home-sidebar">
          <HomeSidebarContent
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            navigation={navigation}
            allCanvasItems={allCanvasItems}
            recentCanvasItems={recentCanvasItems}
            homeData={homeData}
            folderPath={folderPath}
            activeDome={activeDome}
            onSectionChange={handleSectionChange}
            onManageWorkspaces={() => setManageDomesOpen(true)}
          />
        </aside>
      ) : null}

      <section className="workspace-main">
        <div className="home-toolbar-shell">
          <div className="toolbar-cluster toolbar-cluster--primary">
            {isNarrowDesktop ? (
              <AppButton type="button" tone="surface" className="home-sidebar-trigger" onClick={() => setSidebarDrawerOpen(true)}>
                Menu
              </AppButton>
            ) : null}
            <AppButton type="button" tone="accent" disabled={!hasWorkspace} onClick={() => openCreateDialog("canvas", "Canvas")}>Create Canvas</AppButton>
          </div>
          <div className="toolbar-cluster toolbar-cluster--secondary">
            <div className="home-view-toggle" role="tablist" aria-label="Home view mode">
              <button
                type="button"
                role="tab"
                aria-selected={!isSheetsView && !isCardsView}
                aria-pressed={!isSheetsView && !isCardsView}
                className={`home-view-toggle__button${!isSheetsView && !isCardsView ? " is-active" : ""}`}
                onClick={() => {
                  const nextPreferences = { ...homePreferences, viewMode: "list" };
                  setHomeViewMode("list");
                  setHomePreferences(nextPreferences);
                  persistHomeContext(navigation, nextPreferences, 0, {}, "list");
                }}
              >
                List
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isCardsView}
                aria-pressed={isCardsView}
                className={`home-view-toggle__button${isCardsView ? " is-active" : ""}`}
                onClick={() => {
                  const nextPreferences = { ...homePreferences, viewMode: "cards" };
                  setHomeViewMode("cards");
                  setHomePreferences(nextPreferences);
                  persistHomeContext(navigation, nextPreferences, 0, {}, "cards");
                }}
              >
                Cards
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isSheetsView}
                aria-pressed={isSheetsView}
                className={`home-view-toggle__button${isSheetsView ? " is-active" : ""}`}
                onClick={() => {
                  const nextPreferences = { ...homePreferences, viewMode: "sheets" };
                  setHomeViewMode("sheets");
                  setHomePreferences(nextPreferences);
                  persistHomeContext(navigation, nextPreferences, 0, {}, "sheets");
                }}
              >
                Sheets
              </button>
            </div>
            <AppButton
              type="button"
              tone="surface"
              disabled={!hasWorkspace || folderLoading}
              onClick={() => void backfillCanvasThumbnails(12)}
            >
              Backfill previews
            </AppButton>
            <AppButton type="button" tone="surface" disabled={!hasWorkspace} onClick={() => void importFilesIntoFolder(navigation.currentFolderPath)}>Import Files</AppButton>
            <AppButton type="button" tone="surface" disabled={!folderPath || folderLoading} onClick={() => void refreshHomeData(folderPath, navigation.currentFolderPath)}>More</AppButton>
          </div>
        </div>

        <div ref={bodyRef} className="workspace-main-content" onScroll={handleBodyScroll}>
          {!hasWorkspace ? (
            <BrowserEmptyState
              title={activeDome?.name || "No Workspace Loaded"}
              description="Open a folder-backed workspace to browse nested folders, canvases, and imported files."
              onNewCanvas={() => openCreateDialog("canvas", "Canvas")}
              onImportFiles={() => void importFilesIntoFolder(navigation.currentFolderPath)}
            />
          ) : browserItems.length === 0 ? (
            <BrowserEmptyState
              title={emptyState.title}
              description={emptyState.description}
              onNewCanvas={() => openCreateDialog("canvas", "Canvas")}
              onImportFiles={() => void importFilesIntoFolder(navigation.currentFolderPath)}
            />
          ) : (
            <>
              <section className="browser-panel">
                <div className="browser-panel-header">
                  <h3 className="panel-title">{sectionLabel(navigation.selectedSection)}</h3>
                  <div className="eyebrow is-clean">{browserItems.length} Items</div>
                </div>
                {isSheetsView ? (
                  <HomeSheetsView
                    folderPath={folderPath}
                    pages={sheetPages}
                    thumbnailPathByCanvasPath={Object.fromEntries(canvasItems.map((item) => [item.filePath, item.thumbnailPath]))}
                    onOpenPage={(page) => void handleOpenSheetPage(page)}
                  />
                ) : isCardsView ? (
                  <HomeCardsView
                    folderPath={folderPath}
                    canvases={canvasItems}
                    onOpenCanvas={(entry) => void handleOpenEntry(entry)}
                    onRename={(entry) => setTextDialog({ type: "rename", value: entry.name, target: entry })}
                    onDelete={(entry) => setConfirmDialog({ target: entry })}
                    onToggleStar={(entry) => void toggleItemStarred(entry.filePath, !entry.starred)}
                  />
                ) : (
                  <div className={`home-browser-${browserViewMode}`}>
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
            </>
          )}
        </div>
      </section>

      {isNarrowDesktop ? (
        <AppSheet open={sidebarDrawerOpen} onOpenChange={setSidebarDrawerOpen}>
          <AppSheetContent side="left" className="home-sidebar home-sidebar--drawer">
            <HomeSidebarContent
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              navigation={navigation}
              allCanvasItems={allCanvasItems}
              recentCanvasItems={recentCanvasItems}
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
