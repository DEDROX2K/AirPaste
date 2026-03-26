import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { desktop } from "../lib/desktop";
import { useAppContext } from "../context/useAppContext";
import { useTheme } from "../hooks/useTheme";
import {
  buildHomeRouteState,
  filterItemsByPreference,
  folderNameFromPath,
  formatRelativeTime,
  normalizeHomeNavigation,
  normalizeHomePreferences,
  sortEntriesByPreference,
} from "../lib/home";
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogFooter,
  AppButton,
  AppInput,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from "./ui/app";

const HOME_SECTIONS = Object.freeze([
  { id: "overview", label: "Home" },
  { id: "recents", label: "Recent" },
  { id: "projects", label: "Projects" },
  { id: "starred", label: "Starred" },
]);

const CREATE_ACTIONS = Object.freeze({
  project: { label: "New Project", title: "Create Project", description: "Start a new project.", placeholder: "Untitled Project" },
  space: { label: "New Space", title: "Create Space", description: "Create a space inside the project.", placeholder: "Main Space" },
  canvas: { label: "New Canvas", title: "Create Canvas", description: "Create a new canvas.", placeholder: "Main Canvas" },
  page: { label: "New Page", title: "Create Page", description: "Create a markdown page.", placeholder: "Untitled Page" },
});

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function IconProject() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16v12H4z" />
      <path d="M9 6V4h6v2" />
      <path d="M4 11h16" />
    </svg>
  );
}

function IconSpace() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

function IconCanvas() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 8h10" />
      <path d="M7 12h6" />
      <path d="M7 16h8" />
    </svg>
  );
}

function IconPage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function IconStar({ filled = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function normalizeNavigationState(homeData) {
  const fallbackProjectId = homeData?.projects?.[0]?.id ?? null;
  const persisted = normalizeHomeNavigation(homeData?.uiState, fallbackProjectId);
  const validProjectIds = new Set((homeData?.projects ?? []).map((p) => p.id));
  let selectedProjectId = validProjectIds.has(persisted.selectedProjectId) ? persisted.selectedProjectId : fallbackProjectId;
  let mode = persisted.mode;
  if (mode === "project" && !selectedProjectId) mode = "home";
  if (mode === "space" && !persisted.selectedSpaceId) mode = selectedProjectId ? "project" : "home";
  return { mode, selectedProjectId, selectedSpaceId: persisted.selectedSpaceId, selectedSection: persisted.selectedSection };
}

function ActionButton({ title, active = false, onClick, children }) {
  return (
    <AppButton
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-7 w-7 text-ap-text-secondary hover:text-ap-text-primary"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </AppButton>
  );
}

function SummaryCard({ kind, entry, onOpen, onRename, onDelete }) {
  if (!entry) return null;
  const Icon = kind === "project" ? IconProject : IconSpace;
  return (
    <article className="home-summary-card">
      <button className="home-summary-card__main" type="button" onClick={onOpen}>
        <span className="home-summary-card__icon"><Icon /></span>
        <span className="home-summary-card__copy">
          <span className="home-summary-card__kicker">{kind === "project" ? "Project" : "Space"}</span>
          <span className="home-summary-card__title">{entry.name}</span>
          <span className="home-summary-card__meta">{entry.canvasCount ?? 0} canvases · {entry.pageCount ?? 0} pages</span>
        </span>
      </button>
      <div className="home-card-actions">
        {onRename && <ActionButton title="Rename" onClick={onRename}><IconEdit /></ActionButton>}
        {onDelete && <ActionButton title="Delete" onClick={onDelete}><IconTrash /></ActionButton>}
      </div>
    </article>
  );
}

function CanvasPreview({ item, folderPath }) {
  const thumbnailPath = typeof item.thumbnailUrl === "string" && item.thumbnailUrl.trim()
    ? item.thumbnailUrl.trim()
    : typeof item.thumbnailPath === "string" && item.thumbnailPath.trim()
      ? item.thumbnailPath.trim()
      : "";
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolvePreviewUrl() {
      setLoading(true);
      setPreviewFailed(false);
      setPreviewUrl("");

      if (!folderPath || !thumbnailPath) {
        setLoading(false);
        return;
      }

      try {
        const resolvedUrl = await desktop.workspace.resolveAssetUrl(folderPath, thumbnailPath);

        if (!cancelled) {
          setPreviewUrl(resolvedUrl || "");
          setPreviewFailed(!resolvedUrl);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPreviewFailed(true);
          setLoading(false);
        }
      }
    }

    void resolvePreviewUrl();

    return () => {
      cancelled = true;
    };
  }, [folderPath, thumbnailPath]);

  if (loading) {
    return (
      <div className="home-item-card__preview-placeholder">
        <span className="home-item-card__preview-badge">Canvas</span>
      </div>
    );
  }

  if (previewUrl && !previewFailed) {
    return (
      <img
        className="home-item-card__preview-image"
        src={previewUrl}
        alt={`Preview of ${item.name || "canvas"}`}
        loading="lazy"
        decoding="async"
        onError={() => setPreviewFailed(true)}
      />
    );
  }

  return (
    <div className="home-item-card__preview-placeholder">
      <span className="home-item-card__preview-badge">Canvas</span>
      <span className="home-item-card__preview-icon"><IconCanvas /></span>
    </div>
  );
}

function PagePreview({ item }) {
  return (
    <div className="home-item-card__page-preview">
      <span className="home-item-card__preview-badge">Page</span>
      <p className="home-item-card__page-title">{item.name}</p>
      <p className="home-item-card__page-snippet">{item.excerpt || "Start writing to see content here..."}</p>
    </div>
  );
}

function ItemCard({ item, viewMode, folderPath, onOpen, onToggleStar, onRename, onDelete }) {
  return (
    <article className={`home-item-card home-item-card--${viewMode}`}>
      <button className="home-item-card__main" type="button" onClick={onOpen}>
        <span className="home-item-card__preview">
          {item.type === "page" ? <PagePreview item={item} /> : <CanvasPreview item={item} folderPath={folderPath} />}
        </span>
        <span className="home-item-card__copy">
          <span className="home-item-card__eyebrow">{item.type === "page" ? <IconPage /> : <IconCanvas />}{item.type === "page" ? "Page" : "Canvas"}</span>
          <span className="home-item-card__title">{item.name}</span>
          <span className="home-item-card__meta">{item.projectName ? `${item.projectName} · ` : ""}{item.spaceName ? `${item.spaceName} · ` : ""}Edited {formatRelativeTime(item.updatedAt)}</span>
        </span>
      </button>
      <div className="home-card-actions">
        <ActionButton title={item.starred ? "Unstar" : "Star"} active={item.starred} onClick={() => onToggleStar(!item.starred)}><IconStar filled={item.starred} /></ActionButton>
        <ActionButton title="Rename" onClick={onRename}><IconEdit /></ActionButton>
        <ActionButton title="Delete" onClick={onDelete}><IconTrash /></ActionButton>
      </div>
    </article>
  );
}

function TextPromptDialog({ eyebrow, title, description, confirmLabel, value, disabled, onChange, onCancel, onConfirm }) {
  return (
    <AppDialog open={!!title} onOpenChange={(open) => !open && onCancel()}>
      <AppDialogContent>
        <AppDialogHeader>
          <div className="text-xs uppercase tracking-wider text-ap-text-secondary font-medium mb-1">{eyebrow}</div>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeader>
        <div className="py-4">
          <AppInput value={value} autoFocus onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !disabled) { e.preventDefault(); onConfirm(); } }} />
        </div>
        <AppDialogFooter>
          <AppButton variant="ghost" onClick={onCancel}>Cancel</AppButton>
          <AppButton variant="default" disabled={disabled} onClick={onConfirm}>{confirmLabel}</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm, disabled }) {
  return (
    <AppDialog open={!!title} onOpenChange={(open) => !open && onCancel()}>
      <AppDialogContent>
        <AppDialogHeader>
          <div className="text-xs uppercase tracking-wider text-ap-text-secondary font-medium mb-1">Delete</div>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogFooter>
          <AppButton variant="ghost" onClick={onCancel}>Cancel</AppButton>
          <AppButton variant="destructive" disabled={disabled} onClick={onConfirm}>{confirmLabel}</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export default function HomeShell() {
  const {
    createCanvasEntry, createPageEntry, createProjectEntry, createSpaceEntry,
    deleteItemEntry, deleteProjectEntry, deleteSpaceEntry,
    fetchProjectContents, fetchSpaceContents, folderLoading, folderPath,
    homeData, openExistingWorkspace, openHomeItem,
    renameItemEntry, renameProjectEntry, renameSpaceEntry,
    saveHomeUiState, toggleItemStarred,
  } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const bodyRef = useRef(null);
  const scrollSaveTimeoutRef = useRef(null);
  const shouldRestoreScrollRef = useRef(true);
  const [navigation, setNavigation] = useState(() => normalizeNavigationState(homeData));
  const [homePreferences, setHomePreferences] = useState(() => normalizeHomePreferences(homeData.uiState));
  const [searchValue, setSearchValue] = useState("");
  const [textDialog, setTextDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [projectContents, setProjectContents] = useState(null);
  const [spaceContents, setSpaceContents] = useState(null);

  const persistHomeContext = useCallback((nextNavigation, scrollTop = null, extraState = {}) => {
    const nextScrollTop = Number.isFinite(scrollTop) ? scrollTop : bodyRef.current?.scrollTop ?? homeData?.uiState?.homeScrollTop ?? 0;
    void saveHomeUiState({ ...buildHomeRouteState(nextNavigation, nextScrollTop), ...extraState });
  }, [homeData?.uiState?.homeScrollTop, saveHomeUiState]);

  useEffect(() => { setHomePreferences(normalizeHomePreferences(homeData.uiState)); setNavigation(normalizeNavigationState(homeData)); shouldRestoreScrollRef.current = true; }, [homeData]);
  useEffect(() => () => { window.clearTimeout(scrollSaveTimeoutRef.current); }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadNavigationContents() {
      if (!navigation.selectedProjectId || navigation.mode === "home") { setProjectContents(null); setSpaceContents(null); setContentLoading(false); return; }
      setContentLoading(true);
      try {
        const [nextProjectContents, nextSpaceContents] = await Promise.all([
          fetchProjectContents(navigation.selectedProjectId),
          navigation.mode === "space" && navigation.selectedSpaceId ? fetchSpaceContents(navigation.selectedProjectId, navigation.selectedSpaceId) : Promise.resolve(null),
        ]);
        if (!cancelled) { setProjectContents(nextProjectContents); setSpaceContents(nextSpaceContents); }
      } catch { if (!cancelled) { setProjectContents(null); setSpaceContents(null); } }
      finally { if (!cancelled) setContentLoading(false); }
    }
    void loadNavigationContents();
    return () => { cancelled = true; };
  }, [fetchProjectContents, fetchSpaceContents, navigation]);

  const selectedProject = useMemo(() => homeData.projects.find((p) => p.id === navigation.selectedProjectId) ?? null, [homeData.projects, navigation.selectedProjectId]);
  const selectedProjectSpaces = useMemo(() => sortEntriesByPreference(projectContents?.spaces ?? [], homePreferences.sortBy), [homePreferences.sortBy, projectContents?.spaces]);
  const selectedSpace = useMemo(() => spaceContents?.space ?? selectedProjectSpaces.find((s) => s.id === navigation.selectedSpaceId) ?? null, [navigation.selectedSpaceId, selectedProjectSpaces, spaceContents]);
  const activeProjectId = navigation.mode === "project" || navigation.mode === "space" ? navigation.selectedProjectId : null;
  const activeSpaceId = navigation.mode === "space" ? navigation.selectedSpaceId : null;
  const sortedProjects = useMemo(() => sortEntriesByPreference(homeData.projects, homePreferences.sortBy), [homeData.projects, homePreferences.sortBy]);
  const overviewRecentItems = useMemo(() => sortEntriesByPreference(filterItemsByPreference(homeData.recentItems, homePreferences.filter), homePreferences.sortBy), [homeData.recentItems, homePreferences.filter, homePreferences.sortBy]);
  const overviewStarredItems = useMemo(() => sortEntriesByPreference(filterItemsByPreference(homeData.starredItems, homePreferences.filter), homePreferences.sortBy), [homeData.starredItems, homePreferences.filter, homePreferences.sortBy]);
  const projectItems = useMemo(() => sortEntriesByPreference(filterItemsByPreference(projectContents?.items ?? [], homePreferences.filter), homePreferences.sortBy), [homePreferences.filter, homePreferences.sortBy, projectContents?.items]);
  const spaceItems = useMemo(() => sortEntriesByPreference(filterItemsByPreference(spaceContents?.items ?? [], homePreferences.filter), homePreferences.sortBy), [homePreferences.filter, homePreferences.sortBy, spaceContents?.items]);

  const createActionState = useMemo(() => ({
    project: { disabled: false, reason: "" },
    space: { disabled: !activeProjectId, reason: activeProjectId ? "" : "Select a project first" },
    canvas: { disabled: !activeSpaceId, reason: activeSpaceId ? "" : "Select a space first" },
    page: { disabled: !activeSpaceId, reason: activeSpaceId ? "" : "Select a space first" },
  }), [activeProjectId, activeSpaceId]);

  const updateHomePreference = useCallback((partialState) => {
    setHomePreferences((current) => {
      const next = { ...current, ...partialState };
      persistHomeContext(navigation, null, { homeView: next.viewMode, sortBy: next.sortBy, filter: next.filter });
      return next;
    });
  }, [navigation, persistHomeContext]);

  const commitNavigation = useCallback((nextNavigation, resetScroll = true) => {
    setNavigation(nextNavigation);
    if (bodyRef.current && resetScroll) bodyRef.current.scrollTop = 0;
    persistHomeContext(nextNavigation, resetScroll ? 0 : undefined);
  }, [persistHomeContext]);

  const navigateToHomeSection = useCallback((sectionId) => commitNavigation({ ...navigation, mode: "home", selectedSection: sectionId }), [commitNavigation, navigation]);
  const navigateToProject = useCallback((projectId) => commitNavigation({ ...navigation, mode: "project", selectedProjectId: projectId, selectedSpaceId: null }), [commitNavigation, navigation]);
  const navigateToSpace = useCallback((projectId, spaceId) => commitNavigation({ ...navigation, mode: "space", selectedProjectId: projectId, selectedSpaceId: spaceId }), [commitNavigation, navigation]);
  const handleBodyScroll = useCallback(() => { window.clearTimeout(scrollSaveTimeoutRef.current); scrollSaveTimeoutRef.current = window.setTimeout(() => persistHomeContext(navigation), 160); }, [navigation, persistHomeContext]);

  const openTextDialog = useCallback((nextDialog) => { setTextDialog(nextDialog); }, []);
  const closeTextDialog = useCallback(() => { setTextDialog(null); }, []);
  const closeConfirmDialog = useCallback(() => { setConfirmDialog(null); }, []);

  const openCreateDialog = useCallback((actionKey) => {
    if (createActionState[actionKey]?.disabled) return;
    const action = CREATE_ACTIONS[actionKey];
    openTextDialog({ kind: "create", targetType: actionKey, title: action.title, description: action.description, confirmLabel: "Create", value: action.placeholder });
  }, [createActionState, openTextDialog]);

  const openRenameDialog = useCallback((targetType, target) => {
    openTextDialog({ kind: "rename", targetType, target, title: `Rename ${targetType[0].toUpperCase()}${targetType.slice(1)}`, description: `Update display name.`, confirmLabel: "Save", value: target.name });
  }, [openTextDialog]);

  const askDelete = useCallback((targetType, target) => {
    setConfirmDialog({ targetType, target, title: `Delete ${target.name}?`, description: "This action cannot be undone.", confirmLabel: "Delete" });
  }, []);

  const openItemFromHome = useCallback(async (item) => { persistHomeContext(navigation); await openHomeItem(item); }, [navigation, openHomeItem, persistHomeContext]);

  const submitTextDialog = useCallback(async () => {
    const trimmedName = textDialog?.value?.trim() ?? "";
    if (!textDialog || !trimmedName) return;
    if (textDialog.kind === "create") {
      if (textDialog.targetType === "project") {
        const project = await createProjectEntry(trimmedName);
        if (project) { navigateToProject(project.id); closeTextDialog(); }
      } else if (textDialog.targetType === "space" && activeProjectId) {
        const space = await createSpaceEntry(activeProjectId, trimmedName);
        if (space) { navigateToSpace(space.projectId, space.id); closeTextDialog(); }
      } else if (textDialog.targetType === "canvas" && activeProjectId && activeSpaceId) {
        const canvas = await createCanvasEntry(activeProjectId, activeSpaceId, trimmedName);
        if (canvas) closeTextDialog();
      } else if (textDialog.targetType === "page" && activeProjectId && activeSpaceId) {
        const page = await createPageEntry(activeProjectId, activeSpaceId, trimmedName);
        if (page) closeTextDialog();
      }
    } else if (textDialog.targetType === "project") {
      const project = await renameProjectEntry(textDialog.target.id, trimmedName);
      if (project) closeTextDialog();
    } else if (textDialog.targetType === "space") {
      const space = await renameSpaceEntry(textDialog.target.projectId, textDialog.target.id, trimmedName);
      if (space) closeTextDialog();
    } else {
      const item = await renameItemEntry(textDialog.target, trimmedName);
      if (item) closeTextDialog();
    }
  }, [activeProjectId, activeSpaceId, closeTextDialog, createCanvasEntry, createPageEntry, createProjectEntry, createSpaceEntry, navigateToProject, navigateToSpace, renameItemEntry, renameProjectEntry, renameSpaceEntry, textDialog]);

  const submitDelete = useCallback(async () => {
    if (!confirmDialog) return;
    let deleted = false;
    if (confirmDialog.targetType === "project") {
      deleted = await deleteProjectEntry(confirmDialog.target.id);
      if (deleted && navigation.selectedProjectId === confirmDialog.target.id) commitNavigation({ mode: "home", selectedSection: "projects", selectedProjectId: null, selectedSpaceId: null });
    } else if (confirmDialog.targetType === "space") {
      deleted = await deleteSpaceEntry(confirmDialog.target.projectId, confirmDialog.target.id);
      if (deleted && navigation.selectedSpaceId === confirmDialog.target.id) commitNavigation({ ...navigation, mode: "project", selectedSpaceId: null });
    } else {
      deleted = await deleteItemEntry(confirmDialog.target);
    }
    if (deleted) closeConfirmDialog();
  }, [closeConfirmDialog, commitNavigation, confirmDialog, deleteItemEntry, deleteProjectEntry, deleteSpaceEntry, navigation]);

  const renderItemCard = useCallback((item) => (
    <ItemCard key={item.id} item={item} viewMode={homePreferences.viewMode} folderPath={folderPath}
      onOpen={() => void openItemFromHome(item)} onToggleStar={(starred) => void toggleItemStarred(item.id, starred)}
      onRename={() => openRenameDialog(item.type, item)} onDelete={() => askDelete(item.type, item)} />
  ), [homePreferences.viewMode, folderPath, openItemFromHome, toggleItemStarred, openRenameDialog, askDelete]);

  const mainContent = useMemo(() => {
    if (navigation.mode === "space") {
      return (
        <>
          {selectedSpace && (
            <div className="home-header">
              <div className="home-header__nav">
                <button className="home-breadcrumb" onClick={() => navigateToProject(selectedSpace.projectId)}>{selectedProject?.name}</button>
                <span className="home-breadcrumb-sep">/</span>
                <span className="home-breadcrumb home-breadcrumb--active">{selectedSpace.name}</span>
              </div>
              <div className="home-header__actions">
                <AppButton variant="default" size="sm" onClick={() => openCreateDialog("canvas")}><IconPlus /><span>New Canvas</span></AppButton>
              </div>
            </div>
          )}
          <div className="home-summary-grid">
            <SummaryCard kind="space" entry={selectedSpace} onOpen={() => navigateToSpace(selectedSpace.projectId, selectedSpace.id)}
              onRename={() => openRenameDialog("space", selectedSpace)} onDelete={() => askDelete("space", selectedSpace)} />
          </div>
          <div className="home-section-title">Items</div>
          {contentLoading ? <div className="home-loading">Loading...</div> : spaceItems.length > 0 ? (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>{spaceItems.map(renderItemCard)}</div>
          ) : (
            <div className="home-empty">No items yet. Create a canvas or page to get started.</div>
          )}
        </>
      );
    }
    if (navigation.mode === "project") {
      return (
        <>
          <div className="home-header">
            <div className="home-header__nav">
              <button className="home-breadcrumb home-breadcrumb--active" onClick={() => navigateToHomeSection("overview")}>{selectedProject?.name}</button>
            </div>
            <div className="home-header__actions">
              <AppButton variant="default" size="sm" onClick={() => openCreateDialog("space")}><IconPlus /><span>New Space</span></AppButton>
            </div>
          </div>
          <div className="home-summary-grid">
            <SummaryCard kind="project" entry={selectedProject} onOpen={() => navigateToProject(selectedProject.id)}
              onRename={() => openRenameDialog("project", selectedProject)} onDelete={() => askDelete("project", selectedProject)} />
          </div>
          <div className="home-section-title">Spaces</div>
          {contentLoading ? <div className="home-loading">Loading...</div> : selectedProjectSpaces.length > 0 ? (
            <div className="home-summary-grid">{selectedProjectSpaces.map((space) => (
              <SummaryCard key={space.id} kind="space" entry={space} onOpen={() => navigateToSpace(space.projectId, space.id)}
                onRename={() => openRenameDialog("space", space)} onDelete={() => askDelete("space", space)} />
            ))}</div>
          ) : (
            <div className="home-empty">No spaces yet. Create one to organize your work.</div>
          )}
          <div className="home-section-title">All Items</div>
          {contentLoading ? <div className="home-loading">Loading...</div> : projectItems.length > 0 ? (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>{projectItems.map(renderItemCard)}</div>
          ) : (
            <div className="home-empty">No items in this project.</div>
          )}
        </>
      );
    }
    if (navigation.selectedSection === "recents") {
      return (
        <>
          <div className="home-header"><h1 className="home-title">Recent</h1></div>
          {overviewRecentItems.length > 0 ? (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>{overviewRecentItems.map(renderItemCard)}</div>
          ) : (
            <div className="home-empty">No recent items. Open a canvas or page to build your history.</div>
          )}
        </>
      );
    }
    if (navigation.selectedSection === "starred") {
      return (
        <>
          <div className="home-header"><h1 className="home-title">Starred</h1></div>
          {overviewStarredItems.length > 0 ? (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>{overviewStarredItems.map(renderItemCard)}</div>
          ) : (
            <div className="home-empty">No starred items. Star items to access them quickly.</div>
          )}
        </>
      );
    }
    if (navigation.selectedSection === "projects") {
      return (
        <>
          <div className="home-header">
            <h1 className="home-title">Projects</h1>
            <div className="home-header__actions">
              <AppButton variant="default" size="sm" onClick={() => openCreateDialog("project")}><IconPlus /><span>New Project</span></AppButton>
            </div>
          </div>
          {sortedProjects.length > 0 ? (
            <div className="home-summary-grid">{sortedProjects.map((project) => (
              <SummaryCard key={project.id} kind="project" entry={project} onOpen={() => navigateToProject(project.id)}
                onRename={() => openRenameDialog("project", project)} onDelete={() => askDelete("project", project)} />
            ))}</div>
          ) : (
            <div className="home-empty">No projects yet. Create your first project to get started.</div>
          )}
        </>
      );
    }
    return (
      <>
        <div className="home-header">
          <h1 className="home-title">Home</h1>
          <div className="home-header__actions">
            <AppButton variant="default" size="sm" onClick={() => openCreateDialog("project")}><IconPlus /><span>New Project</span></AppButton>
          </div>
        </div>
        {overviewRecentItems.length > 0 && (
          <>
            <div className="home-section-title">Recent</div>
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>{overviewRecentItems.map(renderItemCard)}</div>
          </>
        )}
        {sortedProjects.length > 0 && (
          <>
            <div className="home-section-title">Projects</div>
            <div className="home-summary-grid">{sortedProjects.map((project) => (
              <SummaryCard key={project.id} kind="project" entry={project} onOpen={() => navigateToProject(project.id)}
                onRename={() => openRenameDialog("project", project)} onDelete={() => askDelete("project", project)} />
            ))}</div>
          </>
        )}
        {overviewStarredItems.length > 0 && (
          <>
            <div className="home-section-title">Starred</div>
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>{overviewStarredItems.map(renderItemCard)}</div>
          </>
        )}
        {overviewRecentItems.length === 0 && sortedProjects.length === 0 && overviewStarredItems.length === 0 && (
          <div className="home-empty">
            <p>No content yet. Create a project to start organizing your work.</p>
          </div>
        )}
      </>
    );
  }, [askDelete, contentLoading, homePreferences.viewMode, navigation, navigateToHomeSection, navigateToProject, navigateToSpace, openCreateDialog, openItemFromHome, openRenameDialog, overviewRecentItems, overviewStarredItems, projectItems, renderItemCard, selectedProject, selectedProjectSpaces, selectedSpace, sortedProjects, spaceItems]);

  return (
    <main className="home-shell">
      <aside className="home-sidebar">
        <div className="home-sidebar__header">
          <div className="home-sidebar__logo">
            <span className="font-bold text-base tracking-tight">Air</span>
            <span className="text-ap-text-secondary text-base">Paste</span>
          </div>
          <AppButton variant="ghost" size="icon" className="h-7 w-7" onClick={() => void openExistingWorkspace()} title="Switch workspace">
            <IconFolder />
          </AppButton>
        </div>

        <nav className="home-sidebar__nav">
          {HOME_SECTIONS.map((section) => {
            const isActive = navigation.mode === "home" && navigation.selectedSection === section.id;
            return (
              <button key={section.id} className={`home-nav-item ${isActive ? "home-nav-item--active" : ""}`} onClick={() => navigateToHomeSection(section.id)}>
                {section.label}
              </button>
            );
          })}

          <div className="home-nav-divider" />
          <div className="home-nav-label">Projects</div>
          {sortedProjects.map((project) => {
            const isActive = navigation.selectedProjectId === project.id && navigation.mode !== "home";
            return (
              <button key={project.id} className={`home-nav-item home-nav-item--indent ${isActive ? "home-nav-item--active" : ""}`} onClick={() => navigateToProject(project.id)}>
                {project.name}
              </button>
            );
          })}
          {sortedProjects.length === 0 && <div className="home-nav-empty">No projects</div>}
        </nav>

        <div className="home-sidebar__footer">
          <div className="home-workspace-info">
            <span className="home-workspace-name">{homeData.workspace?.name || folderNameFromPath(folderPath)}</span>
            <span className="home-workspace-path">{folderPath}</span>
          </div>
          <div className="home-sidebar__actions">
            <AppButton variant="ghost" size="sm" onClick={toggleTheme}>{theme === "dark" ? "Light" : "Dark"}</AppButton>
            <AppButton variant="ghost" size="sm" onClick={() => void openExistingWorkspace()}>Switch</AppButton>
          </div>
        </div>
      </aside>

      <section className="home-content">
        <header className="home-toolbar">
          <div className="home-toolbar__left">
            <div className="home-search">
              <svg className="home-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input type="search" className="home-search__input" placeholder="Search..." value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
            </div>
          </div>
          <div className="home-toolbar__right">
            <AppDropdownMenu>
              <AppDropdownMenuTrigger asChild>
                <AppButton variant="default" size="sm"><IconPlus /><span>Create</span></AppButton>
              </AppDropdownMenuTrigger>
              <AppDropdownMenuContent align="end" className="w-44" sideOffset={8}>
                {Object.entries(CREATE_ACTIONS).map(([key, action]) => (
                  <AppDropdownMenuItem key={key} disabled={createActionState[key]?.disabled || folderLoading} onSelect={() => openCreateDialog(key)}>
                    <span className="font-medium text-sm">{action.label}</span>
                  </AppDropdownMenuItem>
                ))}
              </AppDropdownMenuContent>
            </AppDropdownMenu>

            <div className="home-toolbar__divider" />

            <select className="home-select" value={homePreferences.sortBy} onChange={(e) => updateHomePreference({ sortBy: e.target.value })}>
              <option value="updatedAt">Modified</option>
              <option value="name">Name</option>
              <option value="type">Type</option>
            </select>

            <select className="home-select" value={homePreferences.filter} onChange={(e) => updateHomePreference({ filter: e.target.value })}>
              <option value="all">All</option>
              <option value="canvases">Canvases</option>
              <option value="pages">Pages</option>
            </select>

            <div className="home-view-toggle">
              <AppButton variant={homePreferences.viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => updateHomePreference({ viewMode: "grid" })}><IconGrid /></AppButton>
              <AppButton variant={homePreferences.viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => updateHomePreference({ viewMode: "list" })}><IconList /></AppButton>
            </div>
          </div>
        </header>

        <div ref={bodyRef} className="home-content__body" onScroll={handleBodyScroll}>
          {mainContent}
        </div>
      </section>

      <TextPromptDialog
        eyebrow={textDialog?.kind === "rename" ? "Rename" : "Create"}
        title={textDialog?.title} description={textDialog?.description}
        confirmLabel={textDialog?.confirmLabel ?? "Save"} value={textDialog?.value ?? ""}
        disabled={!textDialog?.value?.trim() || folderLoading}
        onChange={(value) => setTextDialog((c) => c ? { ...c, value } : c)}
        onCancel={closeTextDialog} onConfirm={() => void submitTextDialog()}
      />

      <ConfirmDialog
        title={confirmDialog?.title} description={confirmDialog?.description}
        confirmLabel={confirmDialog?.confirmLabel ?? "Delete"} disabled={folderLoading}
        onCancel={closeConfirmDialog} onConfirm={() => void submitDelete()}
      />
    </main>
  );
}
