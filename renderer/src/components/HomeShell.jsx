import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import {
  basenameFromRelativePath,
  buildHomeRouteState,
  filterItemsByPreference,
  formatRelativeTime,
  normalizeHomeNavigation,
  normalizeHomePreferences,
  sortEntriesByPreference,
} from "../lib/home";
import { isPreviewDebugModeEnabled } from "../lib/testingTiles";
import "./HomeShellPrototype.css";

const ASSET_BASE_URL = import.meta.env.BASE_URL;

function assetUrl(relativePath) {
  return `${ASSET_BASE_URL}${String(relativePath).replace(/^\/+/, "")}`;
}

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

function BrowserEntryMenu({ item, onRename, onDelete, onToggleStar, onClose }) {
  return (
    <div className="menu-card is-dropdown" role="menu">
      <div className="menu-list">
        <button type="button" className="dropdown-item" onClick={() => { onToggleStar(item); onClose(); }}>
          {item.starred ? "Remove star" : "Add star"}
        </button>
        <button type="button" className="dropdown-item" onClick={() => { onRename(item); onClose(); }}>
          Rename
        </button>
        <button type="button" className="dropdown-item ui-button is-danger" onClick={() => { onDelete(item); onClose(); }}>
          Delete
        </button>
      </div>
    </div>
  );
}

function BrowserCard({ item, viewMode, isActive = false, menuOpen = false, onMenuToggle, onMenuClose, onOpen, onRename, onDelete, onToggleStar }) {
  const primaryMeta = item.type !== "folder"
    ? `Edited ${formatRelativeTime(item.updatedAt)}`
    : (item.path || "Workspace root");
  const secondaryMeta = item.type !== "folder" && item.path
    ? basenameFromRelativePath(item.path)
    : "";

  if (viewMode === "list") {
    return (
      <div className={`list-row${isActive ? " is-selected" : ""}`}>
        <button type="button" className="list-row-button" onClick={() => onOpen(item)}>
          <div>
            <div className="list-row-title">{item.name}</div>
            <div className="muted-copy">{secondaryMeta || primaryMeta}</div>
          </div>
        </button>
        <div className="menu-shell">
          <button type="button" className="mini-button" onClick={() => onMenuToggle(itemKey(item))}>...</button>
          {menuOpen ? (
            <BrowserEntryMenu
              item={item}
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
    <article className={`browser-card${isActive ? " is-selected" : ""}`}>
      <button type="button" className="browser-card-button" onClick={() => onOpen(item)}>
        <div className="browser-card-thumb">
          {item.type === "canvas" ? <img className="browser-card-thumb-img" src={assetUrl("icons/canvas.png")} alt="" aria-hidden="true" /> : null}
        </div>
        <div className="browser-card-copy">
          <h4 className="browser-card-title">{item.name}</h4>
          <p className="muted-copy">{primaryMeta}</p>
        </div>
      </button>
      <div className="browser-card-actions">
        <button type="button" className="ui-button is-flex" onClick={() => onOpen(item)}>Open</button>
        <div className="menu-shell">
          <button type="button" className="mini-button" onClick={() => onMenuToggle(itemKey(item))}>...</button>
          {menuOpen ? (
            <BrowserEntryMenu
              item={item}
              onRename={onRename}
              onDelete={onDelete}
              onToggleStar={onToggleStar}
              onClose={onMenuClose}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function BrowserEmptyState({ title, description, onNewCanvas, onNewFolder, onImportFiles }) {
  return (
    <section className="empty-card">
      <div className="eyebrow">Workspace</div>
      <h2 className="dialog-title">{title}</h2>
      <p className="muted-copy">{description}</p>
      <div className="dome-actions">
        <button type="button" className="ui-button is-primary" onClick={onNewCanvas}>Create Canvas</button>
        <button type="button" className="ui-button" onClick={onNewFolder}>New Folder</button>
        <button type="button" className="ui-button" onClick={onImportFiles}>Import Files</button>
      </div>
    </section>
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
          <button type="button" className="ui-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="ui-button is-primary" disabled={disabled} onClick={onConfirm}>{confirmLabel}</button>
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
          <button type="button" className="ui-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="ui-button is-danger" disabled={disabled} onClick={onConfirm}>Delete</button>
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
                    <button type="button" className="ui-button" disabled={folderLoading} onClick={() => onOpenDome(dome.id)}>Open</button>
                    <button type="button" className="ui-button" onClick={() => onRevealDome(dome.path)}>Reveal</button>
                    <button type="button" className="ui-button is-danger" onClick={() => onRemoveDome(dome.id)}>Remove</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="dialog-actions is-padded">
          <button type="button" className="ui-button" onClick={onClose}>Close</button>
          <button type="button" className="ui-button" onClick={onRefresh}>Refresh</button>
          <button type="button" className="ui-button" onClick={onCreateNew}>Create New</button>
          <button type="button" className="ui-button is-primary" onClick={onOpenFolder}>Open Folder</button>
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
    openTestingTilesCanvas,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuKey, setOpenMenuKey] = useState("");
  const showDeveloperQaActions = isPreviewDebugModeEnabled();

  useEffect(() => {
    setNavigation(normalizeHomeNavigation(homeData.uiState));
    setHomePreferences(normalizeHomePreferences(homeData.uiState));
  }, [homeData.uiState]);

  useEffect(() => () => window.clearTimeout(scrollSaveTimeoutRef.current), []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!event.target.closest(".menu-shell")) {
        setOpenMenuKey("");
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

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

  const persistHomeContext = useCallback((nextNavigation, nextPreferences = homePreferences, scrollTop = null, extraState = {}) => {
    const nextScrollTop = Number.isFinite(scrollTop) ? scrollTop : bodyRef.current?.scrollTop ?? 0;
    void saveHomeUiState({
      ...buildHomeRouteState(nextNavigation, nextScrollTop),
      homeView: nextPreferences.viewMode,
      sortBy: nextPreferences.sortBy,
      filter: nextPreferences.filter,
      selectedSection: nextNavigation.selectedSection,
      ...extraState,
    });
  }, [homePreferences, saveHomeUiState]);

  const handleBodyScroll = useCallback(() => {
    window.clearTimeout(scrollSaveTimeoutRef.current);
    scrollSaveTimeoutRef.current = window.setTimeout(() => persistHomeContext(navigation, homePreferences), 160);
  }, [homePreferences, navigation, persistHomeContext]);

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

  const recentBrowserItems = useMemo(
    () => recentCanvasItems.slice(0, 3),
    [recentCanvasItems],
  );

  const handleSectionChange = useCallback(async (selectedSection) => {
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
  }, [folderPath, homePreferences, navigation, persistHomeContext, refreshHomeData]);

  const handlePreferenceChange = useCallback((viewMode) => {
    const nextPreferences = {
      ...homePreferences,
      viewMode,
    };
    setHomePreferences(nextPreferences);
    persistHomeContext(navigation, nextPreferences);
  }, [homePreferences, navigation, persistHomeContext]);

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
      <aside className="home-sidebar">
        <div className="brand-lockup">
          <div className="brand-status">NEW ADMIN DETECTED:</div>
          <div className="brand-card">
            <div className="brand-card-bar" />
            <div className="brand-card-main">
              <div className="brand-user">KILL3R_US3R_2K22</div>
              <div className="brand-ip">IP 124.121.57.522</div>
            </div>
          </div>
          <div className="brand-footer">
            <div className="brand-footer-stripes" />
            <div className="brand-footer-text">//// VESPA PROJECT ////</div>
            <div className="brand-footer-stripes" />
          </div>
        </div>

        <div className="sidebar-section">
          <div className="eyebrow">Search</div>
          <input
            className="workspace-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search folders, canvases, files"
          />
        </div>

        <div className="sidebar-section">
          {["home", "recents", "starred"].map((section) => (
            <button
              key={section}
              type="button"
              className={`sidebar-link${navigation.selectedSection === section ? " is-active" : ""}`}
              onClick={() => void handleSectionChange(section)}
            >
              <span>{section === "home" ? "Home" : sectionLabel(section)}</span>
              <span className="workspace-badge">
                {section === "home" ? allCanvasItems.length : (section === "recents" ? recentCanvasItems.length : homeData.starredItems.length)}
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-section is-bottom">
          <div>
            <h3 className="brand-wordmark">AIR</h3>
            <p className="sidebar-path">{folderPath || activeDome?.path || "Workspace path unavailable."}</p>
          </div>
          <button type="button" className="ui-button" onClick={() => setManageDomesOpen(true)}>
            Manage Workspaces
          </button>
        </div>
      </aside>

      <section className="workspace-main">
        <div className="home-toolbar-shell">
          <div className="toolbar-cluster">
            <div className="eyebrow is-clean">View</div>
            <div className="toolbar-view-toggle">
              <button
                type="button"
                className={`toolbar-view-button${homePreferences.viewMode === "grid" ? " is-active" : ""}`}
                onClick={() => handlePreferenceChange("grid")}
              >
                Grid
              </button>
              <button
                type="button"
                className={`toolbar-view-button${homePreferences.viewMode === "list" ? " is-active" : ""}`}
                onClick={() => handlePreferenceChange("list")}
              >
                List
              </button>
            </div>
          </div>
          <div className="toolbar-cluster">
            <button type="button" className="ui-button" disabled={!hasWorkspace} onClick={() => openCreateDialog("folder", "New Folder")}>New Folder</button>
            <button type="button" className="ui-button is-primary" disabled={!hasWorkspace} onClick={() => openCreateDialog("canvas", "Canvas")}>Create Canvas</button>
            {showDeveloperQaActions ? (
              <button type="button" className="ui-button" disabled={folderLoading} onClick={() => void openTestingTilesCanvas()}>Testing Tiles</button>
            ) : null}
            <button type="button" className="ui-button" disabled={!hasWorkspace} onClick={() => void importFilesIntoFolder(navigation.currentFolderPath)}>Import Files</button>
            <button type="button" className="ui-button" disabled={!folderPath || folderLoading} onClick={() => void refreshHomeData(folderPath, navigation.currentFolderPath)}>More</button>
          </div>
        </div>

        <div ref={bodyRef} className="workspace-main-content" onScroll={handleBodyScroll}>
          {!hasWorkspace ? (
            <BrowserEmptyState
              title={activeDome?.name || "No Workspace Loaded"}
              description="Open a folder-backed workspace to browse nested folders, canvases, and imported files."
              onNewCanvas={() => openCreateDialog("canvas", "Canvas")}
              onNewFolder={() => openCreateDialog("folder", "New Folder")}
              onImportFiles={() => void importFilesIntoFolder(navigation.currentFolderPath)}
            />
          ) : browserItems.length === 0 ? (
            <BrowserEmptyState
              title={emptyState.title}
              description={emptyState.description}
              onNewCanvas={() => openCreateDialog("canvas", "Canvas")}
              onNewFolder={() => openCreateDialog("folder", "New Folder")}
              onImportFiles={() => void importFilesIntoFolder(navigation.currentFolderPath)}
            />
          ) : (
            <>
              <section className="browser-panel">
                <div className="browser-panel-header">
                  <h3 className="panel-title">{sectionLabel(navigation.selectedSection)}</h3>
                  <div className="eyebrow is-clean">{browserItems.length} Items</div>
                </div>
                <div className={`home-browser-${homePreferences.viewMode}`}>
                  {browserItems.map((item) => (
                    <BrowserCard
                      key={itemKey(item)}
                      item={item}
                      viewMode={homePreferences.viewMode}
                      isActive={item.path === activeItemPath}
                      menuOpen={openMenuKey === itemKey(item)}
                      onMenuToggle={(key) => setOpenMenuKey((current) => current === key ? "" : key)}
                      onMenuClose={() => setOpenMenuKey("")}
                      onOpen={(entry) => void openHomeItem(entry)}
                      onRename={(entry) => setTextDialog({ type: "rename", value: entry.name, target: entry })}
                      onDelete={(entry) => setConfirmDialog({ target: entry })}
                      onToggleStar={(entry) => void toggleItemStarred(entry.filePath, !entry.starred)}
                    />
                  ))}
                </div>
              </section>

              {recentBrowserItems.length > 0 ? (
                <section className="browser-panel">
                  <div className="browser-panel-header">
                    <h3 className="panel-title">Recent Canvases</h3>
                    <div className="eyebrow is-clean">List Browser</div>
                  </div>
                  <div className="home-browser-list">
                    {recentBrowserItems.map((item, index) => (
                      <BrowserCard
                        key={`recent-${itemKey(item)}`}
                        item={item}
                        viewMode="list"
                        isActive={index === 0}
                        menuOpen={openMenuKey === `recent-${itemKey(item)}`}
                        onMenuToggle={(key) => setOpenMenuKey((current) => current === key ? "" : key)}
                        onMenuClose={() => setOpenMenuKey("")}
                        onOpen={(entry) => void openHomeItem(entry)}
                        onRename={(entry) => setTextDialog({ type: "rename", value: entry.name, target: entry })}
                        onDelete={(entry) => setConfirmDialog({ target: entry })}
                        onToggleStar={(entry) => void toggleItemStarred(entry.filePath, !entry.starred)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </section>

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
