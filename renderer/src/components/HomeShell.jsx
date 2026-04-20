import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HomeCubeTrail from "./HomeCubeTrail";
import { useAppContext } from "../context/useAppContext";
import {
  basenameFromRelativePath,
  buildHomeRouteState,
  filterItemsByPreference,
  folderNameFromPath,
  formatDateTime,
  formatRelativeTime,
  normalizeHomeNavigation,
  normalizeHomePreferences,
  sortEntriesByPreference,
} from "../lib/home";
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
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppInput,
  AppScrambleText,
} from "./ui/app";

function IconStar({ filled = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
    </svg>
  );
}

function IconCanvas() {
  return <img className="home-browser-entry__icon-image" src="/icons/canvas.png" alt="" aria-hidden="true" />;
}

function IconPage() {
  return <img className="home-browser-entry__icon-image" src="/icons/page.png" alt="" aria-hidden="true" />;
}

function IconFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M20 16.5v1a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-1" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function TextPromptDialog({ open = false, title, description, confirmLabel, value, disabled, onChange, onCancel, onConfirm }) {
  return (
    <AppDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <AppDialogContent>
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
          <AppButton tone="surface" className="home-button home-button--secondary" onClick={onCancel}><AppScrambleText>Cancel</AppScrambleText></AppButton>
          <AppButton tone="accent" className="home-button" disabled={disabled} onClick={onConfirm}><AppScrambleText>{confirmLabel}</AppScrambleText></AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function ConfirmDialog({ title, description, disabled, onCancel, onConfirm }) {
  return (
    <AppDialog open={Boolean(title)} onOpenChange={(open) => !open && onCancel()}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogFooter>
          <AppButton tone="surface" className="home-button home-button--secondary" onClick={onCancel}><AppScrambleText>Cancel</AppScrambleText></AppButton>
          <AppButton tone="danger" className="home-button" disabled={disabled} onClick={onConfirm}><AppScrambleText>Delete</AppScrambleText></AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function typeLabel(type) {
  if (type === "folder") return "Folder";
  if (type === "canvas") return "Canvas";
  if (type === "page") return "Page";
  if (type === "asset") return "Asset";
  return "File";
}

function typeIcon(type) {
  if (type === "folder") return <IconFolder />;
  if (type === "canvas") return <IconCanvas />;
  if (type === "page") return <IconPage />;
  return <IconFile />;
}

function buildFolderTree(entries) {
  const nodes = new Map();
  nodes.set("", {
    path: "",
    name: "",
    children: [],
  });

  for (const entry of entries) {
    if (entry.type !== "folder") continue;
    nodes.set(entry.path, {
      ...entry,
      children: [],
    });
  }

  for (const [folderPath, node] of nodes.entries()) {
    if (!folderPath) continue;
    const parentPath = folderPath.includes("/") ? folderPath.slice(0, folderPath.lastIndexOf("/")) : "";
    const parentNode = nodes.get(parentPath) ?? nodes.get("");
    parentNode.children.push(node);
  }

  function sortNode(node) {
    node.children.sort((left, right) => left.name.localeCompare(right.name));
    node.children.forEach(sortNode);
    return node;
  }

  return sortNode(nodes.get(""));
}

function folderAncestors(folderPath) {
  const normalized = String(folderPath ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return [""];
  const segments = normalized.split("/");
  const ancestors = [""];
  let cursor = "";
  for (const segment of segments) {
    cursor = cursor ? `${cursor}/${segment}` : segment;
    ancestors.push(cursor);
  }
  return ancestors;
}

function sectionLabel(section) {
  if (section === "recents") return "Recent";
  if (section === "starred") return "Starred";
  return "Home";
}

function buildBrowserItems(items, preferences, searchQuery) {
  const filtered = filterItemsByPreference(items, preferences.filter);
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

function BrowserEmptyState({ title, description, onNewCanvas, onNewPage, onNewFolder, onImportFiles }) {
  return (
    <section className="home-browser-empty">
      <div className="home-browser-empty__eyebrow">Workspace</div>
      <h2 className="home-browser-empty__title">{title}</h2>
      <p className="home-browser-empty__description">{description}</p>
      <div className="home-browser-empty__actions">
        <AppButton tone="accent" className="home-button" onClick={onNewCanvas}><AppScrambleText>New Canvas</AppScrambleText></AppButton>
        <AppButton tone="accent" className="home-button" onClick={onNewPage}><AppScrambleText>New Page</AppScrambleText></AppButton>
        <AppButton tone="surface" className="home-button home-button--secondary" onClick={onNewFolder}><AppScrambleText>New Folder</AppScrambleText></AppButton>
        <AppButton tone="surface" className="home-button home-button--secondary" onClick={onImportFiles}><AppScrambleText>Import files</AppScrambleText></AppButton>
      </div>
    </section>
  );
}

function FolderTreeNode({ node, currentFolderPath, expandedFolders, onToggle, onSelect }) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedFolders.has(node.path);
  const isActive = currentFolderPath === node.path;

  return (
    <div className="home-folder-tree__node">
      <div className={`home-folder-tree__row ${isActive ? "home-folder-tree__row--active" : ""}`}>
        <button
          type="button"
          className={`home-folder-tree__toggle ${hasChildren ? "" : "home-folder-tree__toggle--hidden"}`}
          onClick={() => hasChildren && onToggle(node.path)}
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
        >
          {hasChildren ? (isExpanded ? <IconChevronDown /> : <IconChevronRight />) : <span />}
        </button>
        <button type="button" className="home-folder-tree__button" onClick={() => onSelect(node.path)}>
          <span className="home-folder-tree__icon"><IconFolder /></span>
          <span className="home-folder-tree__label">{node.name}</span>
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <div className="home-folder-tree__children">
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.path}
              node={child}
              currentFolderPath={currentFolderPath}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BrowserEntry({ item, viewMode, isActive = false, onOpen, onRename, onDelete, onToggleStar }) {
  const canStar = Boolean(item.id);
  const canRename = item.type === "folder" || item.type === "canvas" || item.type === "page" || item.type === "asset" || item.type === "file";
  const canDelete = canRename;
  const metaParts = [];

  if (item.type !== "folder") {
    metaParts.push(`Edited ${formatRelativeTime(item.updatedAt)}`);
  } else {
    metaParts.push(item.path || "Workspace root");
  }

  if (item.type !== "folder" && item.path) {
    metaParts.push(basenameFromRelativePath(item.path));
  }

  return (
    <article className={`home-browser-entry home-browser-entry--${viewMode} ${isActive ? "home-browser-entry--active" : ""}`}>
      <button type="button" className="home-browser-entry__main" onClick={() => onOpen(item)}>
        <span className={`home-browser-entry__icon home-browser-entry__icon--${item.type}`}>
          {typeIcon(item.type)}
        </span>
        <span className="home-browser-entry__content">
          <span className="home-browser-entry__eyebrow">{typeLabel(item.type)}</span>
          <span className="home-browser-entry__title">{item.name}</span>
          <span className="home-browser-entry__meta">{metaParts.join(" · ")}</span>
          {item.type === "page" && item.excerpt ? (
            <span className="home-browser-entry__excerpt">{item.excerpt}</span>
          ) : null}
          {item.type !== "folder" ? (
            <span className="home-browser-entry__submeta">{item.path} · {formatDateTime(item.updatedAt)}</span>
          ) : (
            <span className="home-browser-entry__submeta">{item.path || "Workspace root"}</span>
          )}
        </span>
      </button>
      <div className="home-browser-entry__actions">
        {canStar ? (
          <AppButton tone={item.starred ? "accent" : "surface"} className="home-button home-button--icon" onClick={() => void onToggleStar(item)}>
            <IconStar filled={item.starred} />
          </AppButton>
        ) : null}
        {canRename ? (
          <AppButton tone="surface" className="home-button home-button--secondary home-button--icon-text" onClick={() => onRename(item)}>
            <IconPencil />
            <AppScrambleText>Rename</AppScrambleText>
          </AppButton>
        ) : null}
        {canDelete ? (
          <AppButton tone="danger" className="home-button home-button--icon-text" onClick={() => onDelete(item)}>
            <IconTrash />
            <AppScrambleText>Delete</AppScrambleText>
          </AppButton>
        ) : null}
      </div>
    </article>
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
    createPageEntry,
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
  const [expandedFolders, setExpandedFolders] = useState(() => new Set(folderAncestors(homeData.uiState?.currentFolderPath)));
  const [textDialog, setTextDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [manageDomesOpen, setManageDomesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setNavigation(normalizeHomeNavigation(homeData.uiState));
    setHomePreferences(normalizeHomePreferences(homeData.uiState));
  }, [homeData.uiState]);

  useEffect(() => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      folderAncestors(navigation.currentFolderPath).forEach((path) => next.add(path));
      return next;
    });
  }, [navigation.currentFolderPath]);

  useEffect(() => () => window.clearTimeout(scrollSaveTimeoutRef.current), []);

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
  const folderTree = useMemo(() => buildFolderTree(homeData.allFiles), [homeData.allFiles]);

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

  const sectionItems = useMemo(() => {
    if (navigation.selectedSection === "recents") return homeData.recentItems;
    if (navigation.selectedSection === "starred") return homeData.starredItems;
    return [...homeData.folders, ...homeData.files];
  }, [homeData.files, homeData.folders, homeData.recentItems, homeData.starredItems, navigation.selectedSection]);

  const browserItems = useMemo(
    () => buildBrowserItems(sectionItems, homePreferences, searchQuery),
    [homePreferences, searchQuery, sectionItems],
  );

  const counts = useMemo(() => ({
    folders: homeData.allFiles.filter((item) => item.type === "folder").length,
    canvases: homeData.allFiles.filter((item) => item.type === "canvas").length,
    pages: homeData.allFiles.filter((item) => item.type === "page").length,
    assets: homeData.allFiles.filter((item) => item.type === "asset" || item.type === "file").length,
  }), [homeData.allFiles]);

  const currentFolderLabel = navigation.currentFolderPath
    ? folderNameFromPath(navigation.currentFolderPath)
    : folderNameFromPath(folderPath);

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

  const handleFolderSelect = useCallback(async (nextFolderPath) => {
    const nextNavigation = {
      selectedSection: "home",
      currentFolderPath: nextFolderPath,
      scrollTop: 0,
    };
    setNavigation(nextNavigation);
    setExpandedFolders((current) => {
      const next = new Set(current);
      folderAncestors(nextFolderPath).forEach((path) => next.add(path));
      return next;
    });
    persistHomeContext(nextNavigation, homePreferences, 0);
    if (folderPath) {
      await refreshHomeData(folderPath, nextFolderPath);
    }
  }, [folderPath, homePreferences, persistHomeContext, refreshHomeData]);

  const handleFolderToggle = useCallback((folderNodePath) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderNodePath)) next.delete(folderNodePath);
      else next.add(folderNodePath);
      return next;
    });
  }, []);

  const handlePreferenceChange = useCallback((partialPreferences) => {
    const nextPreferences = {
      ...homePreferences,
      ...partialPreferences,
    };
    setHomePreferences(nextPreferences);
    persistHomeContext(navigation, nextPreferences);
  }, [homePreferences, navigation, persistHomeContext]);

  async function submitCreate(type) {
    const name = textDialog?.value?.trim();
    if (!name) return;
    if (type === "canvas") await createCanvasEntry(name, navigation.currentFolderPath);
    else if (type === "page") await createPageEntry(name, navigation.currentFolderPath);
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
        title: "No recent files yet",
        description: "Open a canvas or page and it will appear here. Folder context and browser preferences will still be restored when you return to Home.",
      };
    }
    if (navigation.selectedSection === "starred") {
      return {
        title: "Nothing starred yet",
        description: "Star important canvases and pages to keep them pinned here.",
      };
    }
    if (searchQuery.trim()) {
      return {
        title: "No matching results",
        description: "Try a different search term or change the current filter.",
      };
    }
    return {
      title: navigation.currentFolderPath ? `This folder is empty` : "This workspace is empty",
      description: navigation.currentFolderPath
        ? "Create a canvas, page, or folder here, or import files into the current folder."
        : "Create your first canvas or page, add a folder, or import files into the workspace root.",
    };
  }

  const emptyState = describeEmptyState();

  return (
    <main ref={shellRef} className="home-shell home-shell--workspace-nav">
      <HomeCubeTrail containerRef={shellRef} />

      <aside className="home-sidebar home-sidebar--workspace-nav">
        <div className="home-sidebar__switcher">
          <AppDropdownMenu>
            <AppDropdownMenuTrigger asChild>
              <AppButton tone="surface" className="home-dome-switcher" title="Switch dome">
                <span className="home-dome-switcher__body">
                  <AppScrambleText className="home-dome-switcher__name">{activeDome?.name || "Choose dome"}</AppScrambleText>
                  <span className="home-dome-switcher__path">{folderPath || activeDome?.path || "Open a folder-backed dome."}</span>
                </span>
                <span className="home-dome-switcher__chevron"><IconChevronDown /></span>
              </AppButton>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="start" className="w-80">
              <AppDropdownMenuLabel>Available Domes</AppDropdownMenuLabel>
              {domes.length === 0 ? (
                <AppDropdownMenuItem disabled>No domes</AppDropdownMenuItem>
              ) : (
                domes.map((dome) => (
                  <AppDropdownMenuItem key={dome.id} onClick={() => void switchDome(dome.id)}>
                    <span className="flex flex-col">
                      <span>{dome.name}{dome.id === activeDome?.id ? " (active)" : ""}</span>
                      <span className="text-xs text-ap-text-secondary">{dome.exists ? dome.path : "Missing folder"}</span>
                    </span>
                  </AppDropdownMenuItem>
                ))
              )}
              <AppDropdownMenuSeparator />
              <AppDropdownMenuItem onClick={() => void openExistingWorkspace()}>
                Open Folder as Dome...
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onClick={() => openCreateDialog("create-dome", "New Dome")}>
                Create New Dome...
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>

        <div className="home-sidebar__search">
          <span className="home-sidebar__search-icon"><IconSearch /></span>
          <AppInput
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search folders, canvases, pages, files"
            className="home-sidebar__search-input"
          />
        </div>

        <div className="home-sidebar__summary">
          <div className="home-sidebar__summary-pill">Folders {counts.folders}</div>
          <div className="home-sidebar__summary-pill">Canvas {counts.canvases}</div>
          <div className="home-sidebar__summary-pill">Page {counts.pages}</div>
          <div className="home-sidebar__summary-pill">Assets {counts.assets}</div>
        </div>

        <div className="home-sidebar__sections">
          {["home", "recents", "starred"].map((section) => (
            <button
              key={section}
              type="button"
              className={`home-sidebar-section ${navigation.selectedSection === section ? "home-sidebar-section--active" : ""}`}
              onClick={() => void handleSectionChange(section)}
            >
              <span className="home-sidebar-section__label">{sectionLabel(section)}</span>
              <span className="home-sidebar-section__count">
                {section === "home" ? homeData.allFiles.length : (section === "recents" ? homeData.recentItems.length : homeData.starredItems.length)}
              </span>
            </button>
          ))}
        </div>

        <div className="home-sidebar__tree">
          {!hasWorkspace ? (
            <div className="home-sidebar__blank">
              <div className="home-sidebar__blank-title">{activeDome?.path ? "Connecting to dome" : "Open a dome"}</div>
              <p className="home-sidebar__blank-copy">
                {activeDome?.path
                  ? "AirPaste is syncing the selected dome into the workspace shell."
                  : "Choose an existing folder or create a new dome to populate the folder tree."}
              </p>
              <div className="home-sidebar__blank-actions">
                <AppButton tone="accent" className="home-button" onClick={() => void (activeDome?.id ? switchDome(activeDome.id) : openExistingWorkspace())} disabled={folderLoading}>
                  <AppScrambleText>{activeDome?.id ? "Retry Dome" : "Open Folder"}</AppScrambleText>
                </AppButton>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`home-folder-tree__root ${navigation.selectedSection === "home" && navigation.currentFolderPath === "" ? "home-folder-tree__root--active" : ""}`}
                onClick={() => void handleFolderSelect("")}
              >
                <span className="home-folder-tree__icon"><IconFolder /></span>
                <span className="home-folder-tree__label">{homeData.workspace?.name || folderNameFromPath(folderPath)}</span>
              </button>
              <div className="home-folder-tree">
                {folderTree.children.map((child) => (
                  <FolderTreeNode
                    key={child.path}
                    node={child}
                    currentFolderPath={navigation.currentFolderPath}
                    expandedFolders={expandedFolders}
                    onToggle={handleFolderToggle}
                    onSelect={(path) => void handleFolderSelect(path)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="home-sidebar__footer home-sidebar__footer--workspace-nav">
          <div className="home-workspace-info">
            <span className="home-workspace-name">{homeData.workspace?.name || folderNameFromPath(folderPath) || "No Dome Open"}</span>
            <span className="home-workspace-path">{folderPath || activeDome?.path || "Workspace path unavailable."}</span>
          </div>
          <div className="home-sidebar__footer-actions">
            <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => setManageDomesOpen(true)}><AppScrambleText>Manage Domes</AppScrambleText></AppButton>
          </div>
        </div>
      </aside>

      <section className="home-content home-content--workspace-nav">
        <header className="home-toolbar home-toolbar--workspace-nav">
          <div className="home-toolbar__summary">
            <p className="home-toolbar__eyebrow">{sectionLabel(navigation.selectedSection)}</p>
            <h1 className="home-toolbar__title">{currentFolderLabel || activeDome?.name || homeData.workspace?.name || "Workspace"}</h1>
            <p className="home-toolbar__description">
              {hasWorkspace
                ? `${browserItems.length} visible entr${browserItems.length === 1 ? "y" : "ies"} in ${navigation.selectedSection === "home" ? (navigation.currentFolderPath || "workspace root") : sectionLabel(navigation.selectedSection).toLowerCase()}.`
                : "Select a dome to load its folders, canvases, pages, and files into the workspace navigator."}
            </p>
            {navigation.selectedSection === "home" ? (
              <div className="home-toolbar__breadcrumbs">
                {folderAncestors(navigation.currentFolderPath).map((crumbPath, index, crumbs) => (
                  <button
                    key={crumbPath || "root"}
                    type="button"
                    className={`home-breadcrumb ${crumbPath === navigation.currentFolderPath ? "home-breadcrumb--active" : ""}`}
                    onClick={() => void handleFolderSelect(crumbPath)}
                  >
                    {crumbPath ? folderNameFromPath(crumbPath) : (homeData.workspace?.name || folderNameFromPath(folderPath))}
                    {index < crumbs.length - 1 ? <span className="home-breadcrumb__separator">/</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="home-toolbar__controls">
            <div className="home-toolbar__control-group">
              <span className="home-toolbar__control-label">View</span>
              <div className="home-view-toggle">
                <button
                  type="button"
                  className={`home-view-toggle__button ${homePreferences.viewMode === "grid" ? "home-view-toggle__button--active" : ""}`}
                  onClick={() => handlePreferenceChange({ viewMode: "grid" })}
                >
                  <IconGrid />
                </button>
                <button
                  type="button"
                  className={`home-view-toggle__button ${homePreferences.viewMode === "list" ? "home-view-toggle__button--active" : ""}`}
                  onClick={() => handlePreferenceChange({ viewMode: "list" })}
                >
                  <IconList />
                </button>
              </div>
            </div>

            <div className="home-toolbar__control-group">
              <span className="home-toolbar__control-label">Sort</span>
              <select className="home-select" value={homePreferences.sortBy} onChange={(event) => handlePreferenceChange({ sortBy: event.target.value })}>
                <option value="updatedAt">Edited</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
              </select>
            </div>

            <div className="home-toolbar__control-group">
              <span className="home-toolbar__control-label">Filter</span>
              <select className="home-select" value={homePreferences.filter} onChange={(event) => handlePreferenceChange({ filter: event.target.value })}>
                <option value="all">All</option>
                <option value="folders">Folders</option>
                <option value="canvases">Canvases</option>
                <option value="pages">Pages</option>
                <option value="assets">Assets</option>
                <option value="starred">Starred</option>
              </select>
            </div>

            <div className="home-toolbar__action-group">
              <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => void refreshHomeData(folderPath, navigation.currentFolderPath)} disabled={!folderPath || folderLoading}><AppScrambleText>Refresh</AppScrambleText></AppButton>
              <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => openCreateDialog("folder", "New Folder")} disabled={!hasWorkspace}>
                <IconPlus />
                <AppScrambleText>New Folder</AppScrambleText>
              </AppButton>
              <AppButton tone="accent" className="home-button" onClick={() => openCreateDialog("canvas", "Canvas")} disabled={!hasWorkspace}><AppScrambleText>New Canvas</AppScrambleText></AppButton>
              <AppButton tone="accent" className="home-button" onClick={() => openCreateDialog("page", "Page")} disabled={!hasWorkspace}><AppScrambleText>New Page</AppScrambleText></AppButton>
              <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => void importFilesIntoFolder(navigation.currentFolderPath)} disabled={!hasWorkspace}>
                <IconUpload />
                <AppScrambleText>Import files</AppScrambleText>
              </AppButton>
            </div>
          </div>
        </header>

        <div ref={bodyRef} className="home-content__body home-content__body--workspace-nav" onScroll={handleBodyScroll}>
          {!hasWorkspace ? (
            <section className="home-blank-panel">
              <p className="home-blank-panel__eyebrow">Workspace Offline</p>
              <h2 className="home-blank-panel__title">{activeDome?.name || "No Dome Loaded"}</h2>
              <p className="home-blank-panel__copy">
                Open a folder-backed workspace to browse nested folders, canvases, pages, and imported files.
              </p>
              <div className="home-blank-panel__actions">
                <AppButton tone="accent" className="home-button" onClick={() => void (activeDome?.id ? switchDome(activeDome.id) : openExistingWorkspace())} disabled={folderLoading}>
                  <AppScrambleText>{activeDome?.id ? "Reconnect Dome" : "Open Folder"}</AppScrambleText>
                </AppButton>
                <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => setManageDomesOpen(true)}><AppScrambleText>Manage Domes</AppScrambleText></AppButton>
              </div>
            </section>
          ) : browserItems.length === 0 ? (
            <BrowserEmptyState
              title={emptyState.title}
              description={emptyState.description}
              onNewCanvas={() => openCreateDialog("canvas", "Canvas")}
              onNewPage={() => openCreateDialog("page", "Page")}
              onNewFolder={() => openCreateDialog("folder", "New Folder")}
              onImportFiles={() => void importFilesIntoFolder(navigation.currentFolderPath)}
            />
          ) : (
            <>
              <div className="home-browser-summary">
                <span className="home-browser-summary__label">{sectionLabel(navigation.selectedSection)}</span>
                <span className="home-browser-summary__value">{browserItems.length} items</span>
              </div>
              <div className={`home-browser home-browser--${homePreferences.viewMode}`}>
                {browserItems.map((item) => (
                  <BrowserEntry
                    key={item.filePath ?? item.path}
                    item={item}
                    viewMode={homePreferences.viewMode}
                    isActive={item.path === activeItemPath}
                    onOpen={(entry) => void openHomeItem(entry)}
                    onRename={(entry) => setTextDialog({ type: "rename", value: entry.name, target: entry })}
                    onDelete={(entry) => setConfirmDialog({ target: entry })}
                    onToggleStar={(entry) => void toggleItemStarred(entry.filePath, !entry.starred)}
                  />
                ))}
              </div>
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
              : textDialog?.type === "page"
                ? "Create page"
                : textDialog?.type === "folder"
                  ? "Create folder"
                  : textDialog?.type === "create-dome"
                    ? "Create Dome"
                    : ""
        }
        description={
          textDialog?.type === "rename"
            ? "Update the selected folder or file name."
            : textDialog?.type === "create-dome"
              ? "Choose a Dome name."
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
        title={confirmDialog ? `Delete ${confirmDialog.target.name}?` : ""}
        description="This cannot be undone."
        disabled={folderLoading}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => void submitDelete()}
      />

      <AppDialog open={manageDomesOpen} onOpenChange={setManageDomesOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Manage Domes</AppDialogTitle>
            <AppDialogDescription>Switch, reveal, remove, or create domes.</AppDialogDescription>
          </AppDialogHeader>
          <div className="space-y-3 max-h-[360px] overflow-auto">
            {domes.length === 0 ? (
              <div className="text-sm text-ap-text-secondary">No domes yet.</div>
            ) : (
              domes.map((dome) => (
                <div key={dome.id} className="border border-ap-border-subtle rounded-ap-md p-3">
                  <div className="text-sm font-medium text-ap-text-primary">{dome.name}{dome.id === activeDome?.id ? " (active)" : ""}</div>
                  <div className="text-xs text-ap-text-secondary break-all">
                    {dome.path}
                    {dome.exists === false ? " · Missing" : ""}
                    {dome.valid === false ? " · Needs initialization" : ""}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => void switchDome(dome.id)} disabled={folderLoading}><AppScrambleText>Open</AppScrambleText></AppButton>
                    <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => void revealDome(dome.path)}><AppScrambleText>Reveal</AppScrambleText></AppButton>
                    <AppButton tone="danger" className="home-button" onClick={() => void removeDome(dome.id)}><AppScrambleText>Remove</AppScrambleText></AppButton>
                  </div>
                </div>
              ))
            )}
          </div>
          <AppDialogFooter>
            <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => setManageDomesOpen(false)}><AppScrambleText>Close</AppScrambleText></AppButton>
            <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => void refreshDomes()}><AppScrambleText>Refresh</AppScrambleText></AppButton>
            <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => openCreateDialog("create-dome", "New Dome")}><AppScrambleText>Create New</AppScrambleText></AppButton>
            <AppButton tone="accent" className="home-button" onClick={() => void openExistingWorkspace()}><AppScrambleText>Open Folder</AppScrambleText></AppButton>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </main>
  );
}
