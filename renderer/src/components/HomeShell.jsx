import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import { useTheme } from "../hooks/useTheme";
import {
  buildHomeRouteState,
  filterItemsByPreference,
  folderNameFromPath,
  formatRelativeTime,
  normalizeHomeNavigation,
  normalizeHomePreferences,
  resolveWorkspaceAssetUrl,
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
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppEmptyState,
} from "./ui/app";

const HOME_SECTIONS = Object.freeze([
  { id: "overview", label: "Home" },
  { id: "recents", label: "Recents" },
  { id: "projects", label: "All Projects" },
  { id: "resources", label: "Resources" },
  { id: "trash", label: "Trash" },
  { id: "starred", label: "Starred" },
]);

const CREATE_ACTIONS = Object.freeze({
  project: {
    label: "New Project",
    title: "Create Project",
    description: "Start a new top-level project inside this workspace.",
    placeholder: "Untitled Project",
  },
  space: {
    label: "New Space",
    title: "Create Space",
    description: "Create a space inside the selected project.",
    placeholder: "Main Space",
  },
  canvas: {
    label: "New Canvas",
    title: "Create Canvas",
    description: "Create a new canvas inside the selected space.",
    placeholder: "Main Canvas",
  },
  page: {
    label: "New Page",
    title: "Create Page",
    description: "Create a markdown page inside the selected space.",
    placeholder: "Untitled Page",
  },
});

function IconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.8V21h14V9.8" />
      <path d="M9.5 21v-6h5v6" />
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
      <path d="M4 5h16v14H4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function IconCanvas() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 8h10" />
      <path d="M7 12h6" />
    </svg>
  );
}

function IconPage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6" />
      <path d="M10 17h4" />
    </svg>
  );
}

function IconStar({ filled = false }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.8l2.56 5.19 5.72.83-4.14 4.04.98 5.7L12 16.8l-5.12 2.76.98-5.7L3.72 9.82l5.72-.83L12 3.8z" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function getItemTypeLabel(itemType) {
  return itemType === "page" ? "Page" : "Canvas";
}

function renderItemIcon(itemType) {
  return itemType === "page" ? <IconPage /> : <IconCanvas />;
}

function createInitialNavigation(homeData) {
  return normalizeNavigationState(homeData);
}

function normalizeNavigationState(homeData) {
  const fallbackProjectId = homeData?.projects?.[0]?.id ?? null;
  const persisted = normalizeHomeNavigation(homeData?.uiState, fallbackProjectId);
  const validProjectIds = new Set((homeData?.projects ?? []).map((project) => project.id));
  let selectedProjectId = validProjectIds.has(persisted.selectedProjectId)
    ? persisted.selectedProjectId
    : fallbackProjectId;
  let mode = persisted.mode;

  if (mode === "project" && !selectedProjectId) {
    mode = "home";
  }

  if (mode === "space" && !persisted.selectedSpaceId) {
    mode = selectedProjectId ? "project" : "home";
  }

  return {
    mode,
    selectedProjectId,
    selectedSpaceId: persisted.selectedSpaceId,
    selectedSection: persisted.selectedSection,
  };
}



function HomeSection({ title, description, actionLabel, onAction, children }) {
  return (
    <section className="home-section">
      <header className="home-section__header">
        <div>
          <h2 className="home-section__title">{title}</h2>
          {description ? <p className="home-section__description">{description}</p> : null}
        </div>
        {actionLabel && onAction ? (
          <AppButton variant="ghost" onClick={onAction}>
            {actionLabel}
          </AppButton>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function CardActions({ children }) {
  return <div className="home-card-actions">{children}</div>;
}

function ActionButton({ title, active = false, onClick, children }) {
  return (
    <AppButton
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-8 w-8 text-ap-text-secondary hover:text-ap-text-primary"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </AppButton>
  );
}

function SummaryCard({ kind, entry, onOpen, onRename, onDelete }) {
  const countsLabel = kind === "project"
    ? `${entry.canvasCount ?? 0} canvases • ${entry.pageCount ?? 0} pages • ${entry.spaceCount ?? 0} spaces`
    : `${entry.canvasCount ?? 0} canvases • ${entry.pageCount ?? 0} pages`;

  return (
    <article className="home-summary-card">
      <button className="home-summary-card__main" type="button" onClick={onOpen}>
        <span className="home-summary-card__icon">
          {kind === "project" ? <IconProject /> : <IconSpace />}
        </span>
        <span className="home-summary-card__copy">
          <span className="home-summary-card__kicker">{kind === "project" ? "Project" : "Space"}</span>
          <span className="home-summary-card__title">{entry.name}</span>
          <span className="home-summary-card__meta">{countsLabel}</span>
          <span className="home-summary-card__submeta">Updated {formatRelativeTime(entry.updatedAt)}</span>
        </span>
      </button>
      <CardActions>
        {onRename ? (
          <ActionButton title={`Rename ${kind}`} onClick={onRename}>
            <IconEdit />
          </ActionButton>
        ) : null}
        {onDelete ? (
          <ActionButton title={`Delete ${kind}`} onClick={onDelete}>
            <IconTrash />
          </ActionButton>
        ) : null}
      </CardActions>
    </article>
  );
}

function CanvasPreview({ item, folderPath }) {
  const previewUrl = useMemo(
    () => resolveWorkspaceAssetUrl(folderPath, item.thumbnailPath),
    [folderPath, item.thumbnailPath],
  );
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewUrl]);

  if (previewUrl && !previewFailed) {
    return (
      <img
        className="home-item-card__preview-image"
        src={previewUrl}
        alt=""
        onError={() => setPreviewFailed(true)}
      />
    );
  }

  return (
    <div className="home-item-card__preview-placeholder" aria-hidden="true">
      <span className="home-item-card__preview-badge">Canvas</span>
      <span className="home-item-card__preview-icon"><IconCanvas /></span>
      <span className="home-item-card__preview-text">Preview will appear after save.</span>
    </div>
  );
}

function PagePreview({ item }) {
  return (
    <div className="home-item-card__page-preview" aria-hidden="true">
      <span className="home-item-card__preview-badge">Markdown</span>
      <p className="home-item-card__page-title">{item.name}</p>
      <p className="home-item-card__page-snippet">
        {item.excerpt || "No text yet. Start writing and the first heading or excerpt will appear here."}
      </p>
    </div>
  );
}

function ItemCard({
  item,
  viewMode,
  folderPath,
  onOpen,
  onToggleStar,
  onRename,
  onDelete,
}) {
  return (
    <article className={`home-item-card home-item-card--${viewMode}`}>
      <button className="home-item-card__main" type="button" onClick={onOpen}>
        <span className="home-item-card__preview">
          {item.type === "page" ? <PagePreview item={item} /> : <CanvasPreview item={item} folderPath={folderPath} />}
        </span>
        <span className="home-item-card__copy">
          <span className="home-item-card__eyebrow">
            <span className="home-item-card__type-icon">{renderItemIcon(item.type)}</span>
            <span>{getItemTypeLabel(item.type)}</span>
          </span>
          <span className="home-item-card__title">{item.name}</span>
          <span className="home-item-card__meta">
            {item.projectName ? `${item.projectName} • ` : ""}
            {item.spaceName ? `${item.spaceName} • ` : ""}
            Edited {formatRelativeTime(item.updatedAt)}
          </span>
          <span className="home-item-card__details">
            {item.type === "page"
              ? item.excerpt || "Markdown page"
              : item.thumbnailPath
                ? "Cached preview available"
                : "Styled placeholder preview"}
          </span>
        </span>
      </button>
      <CardActions>
        <ActionButton
          title={item.starred ? "Remove star" : "Add star"}
          active={item.starred}
          onClick={() => onToggleStar(!item.starred)}
        >
          <IconStar filled={item.starred} />
        </ActionButton>
        <ActionButton title="Rename item" onClick={onRename}>
          <IconEdit />
        </ActionButton>
        <ActionButton title="Delete item" onClick={onDelete}>
          <IconTrash />
        </ActionButton>
      </CardActions>
    </article>
  );
}

function TextPromptDialog({
  eyebrow,
  title,
  description,
  confirmLabel,
  value,
  disabled,
  onChange,
  onCancel,
  onConfirm,
}) {
  return (
    <AppDialog open={!!title} onOpenChange={(open) => !open && onCancel()}>
      <AppDialogContent>
        <AppDialogHeader>
          <div className="text-xs uppercase tracking-wider text-ap-text-secondary font-medium mb-1">
            {eyebrow}
          </div>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeader>
        <div className="py-4">
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
        </div>
        <AppDialogFooter>
          <AppButton variant="ghost" onClick={onCancel}>
            Cancel
          </AppButton>
          <AppButton variant="default" disabled={disabled} onClick={onConfirm}>
            {confirmLabel}
          </AppButton>
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
          <div className="text-xs uppercase tracking-wider text-ap-text-secondary font-medium mb-1">
            Delete
          </div>
          <AppDialogTitle>{title}</AppDialogTitle>
          <AppDialogDescription>{description}</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogFooter>
          <AppButton variant="ghost" onClick={onCancel}>
            Cancel
          </AppButton>
          <AppButton variant="destructive" disabled={disabled} onClick={onConfirm}>
            {confirmLabel}
          </AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export default function HomeShell() {
  const {
    createCanvasEntry,
    createPageEntry,
    createProjectEntry,
    createSpaceEntry,
    deleteItemEntry,
    deleteProjectEntry,
    deleteSpaceEntry,
    fetchProjectContents,
    fetchSpaceContents,
    folderLoading,
    folderPath,
    homeData,
    openExistingWorkspace,
    openHomeItem,
    renameItemEntry,
    renameProjectEntry,
    renameSpaceEntry,
    saveHomeUiState,
    toggleItemStarred,
  } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const bodyRef = useRef(null);
  const scrollSaveTimeoutRef = useRef(null);
  const shouldRestoreScrollRef = useRef(true);
  const [navigation, setNavigation] = useState(() => createInitialNavigation(homeData));
  const [homePreferences, setHomePreferences] = useState(() => normalizeHomePreferences(homeData.uiState));
  const [searchValue, setSearchValue] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [textDialog, setTextDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [projectContents, setProjectContents] = useState(null);
  const [spaceContents, setSpaceContents] = useState(null);

  const persistHomeContext = useCallback((nextNavigation, scrollTop = null, extraState = {}) => {
    const nextScrollTop = Number.isFinite(scrollTop)
      ? scrollTop
      : bodyRef.current?.scrollTop ?? homeData?.uiState?.homeScrollTop ?? 0;

    void saveHomeUiState({
      ...buildHomeRouteState(nextNavigation, nextScrollTop),
      ...extraState,
    });
  }, [homeData?.uiState?.homeScrollTop, saveHomeUiState]);

  useEffect(() => {
    setHomePreferences(normalizeHomePreferences(homeData.uiState));
    setNavigation(normalizeNavigationState(homeData));
    shouldRestoreScrollRef.current = true;
  }, [homeData]);

  useEffect(() => {
    if (!shouldRestoreScrollRef.current) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (bodyRef.current) {
        const targetScrollTop = homeData?.uiState?.homeScrollTop ?? 0;

        if (Math.abs(bodyRef.current.scrollTop - targetScrollTop) > 8) {
          bodyRef.current.scrollTop = targetScrollTop;
        }
      }
      shouldRestoreScrollRef.current = false;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [homeData?.uiState?.homeScrollTop, navigation, projectContents, spaceContents]);

  useEffect(() => () => {
    window.clearTimeout(scrollSaveTimeoutRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNavigationContents() {
      if (!navigation.selectedProjectId || navigation.mode === "home") {
        setProjectContents(null);
        setSpaceContents(null);
        setContentLoading(false);
        return;
      }

      setContentLoading(true);

      try {
        const [nextProjectContents, nextSpaceContents] = await Promise.all([
          fetchProjectContents(navigation.selectedProjectId),
          navigation.mode === "space" && navigation.selectedSpaceId
            ? fetchSpaceContents(navigation.selectedProjectId, navigation.selectedSpaceId)
            : Promise.resolve(null),
        ]);

        if (cancelled) {
          return;
        }

        setProjectContents(nextProjectContents);
        setSpaceContents(nextSpaceContents);

        if (
          navigation.mode === "space"
          && navigation.selectedSpaceId
          && !nextProjectContents?.spaces?.some((space) => space.id === navigation.selectedSpaceId)
        ) {
          const nextNavigation = {
            ...navigation,
            mode: "project",
            selectedSpaceId: null,
          };
          setNavigation(nextNavigation);
          persistHomeContext(nextNavigation, 0);
        }
      } catch {
        if (!cancelled) {
          setProjectContents(null);
          setSpaceContents(null);
        }
      } finally {
        if (!cancelled) {
          setContentLoading(false);
        }
      }
    }

    void loadNavigationContents();

    return () => {
      cancelled = true;
    };
  }, [fetchProjectContents, fetchSpaceContents, navigation, persistHomeContext]);

  const selectedProject = useMemo(
    () => homeData.projects.find((project) => project.id === navigation.selectedProjectId) ?? null,
    [homeData.projects, navigation.selectedProjectId],
  );
  const selectedProjectSpaces = useMemo(
    () => sortEntriesByPreference(projectContents?.spaces ?? [], homePreferences.sortBy),
    [homePreferences.sortBy, projectContents?.spaces],
  );
  const selectedSpace = useMemo(() => (
    spaceContents?.space
      ?? selectedProjectSpaces.find((space) => space.id === navigation.selectedSpaceId)
      ?? null
  ), [navigation.selectedSpaceId, selectedProjectSpaces, spaceContents]);
  const activeProjectId = navigation.mode === "project" || navigation.mode === "space"
    ? navigation.selectedProjectId
    : null;
  const activeSpaceId = navigation.mode === "space" ? navigation.selectedSpaceId : null;

  const sortedProjects = useMemo(
    () => sortEntriesByPreference(homeData.projects, homePreferences.sortBy),
    [homeData.projects, homePreferences.sortBy],
  );
  const overviewRecentItems = useMemo(
    () => sortEntriesByPreference(
      filterItemsByPreference(homeData.recentItems, homePreferences.filter),
      homePreferences.sortBy,
    ),
    [homeData.recentItems, homePreferences.filter, homePreferences.sortBy],
  );
  const overviewStarredItems = useMemo(
    () => sortEntriesByPreference(
      filterItemsByPreference(homeData.starredItems, homePreferences.filter),
      homePreferences.sortBy,
    ),
    [homeData.starredItems, homePreferences.filter, homePreferences.sortBy],
  );
  const projectItems = useMemo(
    () => sortEntriesByPreference(
      filterItemsByPreference(projectContents?.items ?? [], homePreferences.filter),
      homePreferences.sortBy,
    ),
    [homePreferences.filter, homePreferences.sortBy, projectContents?.items],
  );
  const spaceItems = useMemo(
    () => sortEntriesByPreference(
      filterItemsByPreference(spaceContents?.items ?? [], homePreferences.filter),
      homePreferences.sortBy,
    ),
    [homePreferences.filter, homePreferences.sortBy, spaceContents?.items],
  );

  const createActionState = useMemo(() => ({
    project: {
      disabled: false,
      reason: "",
    },
    space: {
      disabled: !activeProjectId,
      reason: activeProjectId ? "" : "Select a project first.",
    },
    canvas: {
      disabled: !activeSpaceId,
      reason: activeSpaceId ? "" : "Select a space first.",
    },
    page: {
      disabled: !activeSpaceId,
      reason: activeSpaceId ? "" : "Select a space first.",
    },
  }), [activeProjectId, activeSpaceId]);

  const updateHomePreference = useCallback((partialState) => {
    setHomePreferences((currentValue) => {
      const nextValue = {
        ...currentValue,
        ...partialState,
      };

      persistHomeContext(navigation, null, {
        homeView: nextValue.viewMode,
        sortBy: nextValue.sortBy,
        filter: nextValue.filter,
      });

      return nextValue;
    });
  }, [navigation, persistHomeContext]);

  const commitNavigation = useCallback((nextNavigation, resetScroll = true) => {
    setNavigation(nextNavigation);

    if (bodyRef.current && resetScroll) {
      bodyRef.current.scrollTop = 0;
    }

    persistHomeContext(nextNavigation, resetScroll ? 0 : undefined);
  }, [persistHomeContext]);

  const navigateToHomeSection = useCallback((sectionId) => {
    commitNavigation({
      ...navigation,
      mode: "home",
      selectedSection: sectionId,
    });
  }, [commitNavigation, navigation]);

  const navigateToProject = useCallback((projectId) => {
    commitNavigation({
      ...navigation,
      mode: "project",
      selectedProjectId: projectId,
      selectedSpaceId: null,
    });
  }, [commitNavigation, navigation]);

  const navigateToSpace = useCallback((projectId, spaceId) => {
    commitNavigation({
      ...navigation,
      mode: "space",
      selectedProjectId: projectId,
      selectedSpaceId: spaceId,
    });
  }, [commitNavigation, navigation]);

  const handleBodyScroll = useCallback(() => {
    window.clearTimeout(scrollSaveTimeoutRef.current);
    scrollSaveTimeoutRef.current = window.setTimeout(() => {
      persistHomeContext(navigation);
    }, 160);
  }, [navigation, persistHomeContext]);

  const openTextDialog = useCallback((nextDialog) => {
    setCreateMenuOpen(false);
    setTextDialog(nextDialog);
  }, []);

  const closeTextDialog = useCallback(() => {
    setTextDialog(null);
  }, []);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  const openCreateDialog = useCallback((actionKey) => {
    if (createActionState[actionKey]?.disabled) {
      return;
    }

    const action = CREATE_ACTIONS[actionKey];

    openTextDialog({
      kind: "create",
      targetType: actionKey,
      title: action.title,
      description: action.description,
      confirmLabel: "Create",
      value: action.placeholder,
    });
  }, [createActionState, openTextDialog]);

  const openRenameDialog = useCallback((targetType, target) => {
    openTextDialog({
      kind: "rename",
      targetType,
      target,
      title: `Rename ${targetType[0].toUpperCase()}${targetType.slice(1)}`,
      description: `Update the display name for ${target.name}.`,
      confirmLabel: "Save",
      value: target.name,
    });
  }, [openTextDialog]);

  const askDelete = useCallback((targetType, target) => {
    setConfirmDialog({
      targetType,
      target,
      title: `Delete ${target.name}?`,
      description: targetType === "project"
        ? "This removes the entire project and its spaces, canvases, pages, and cached previews."
        : targetType === "space"
          ? "This removes the space and everything inside it."
          : "This removes the item from the workspace.",
      confirmLabel: "Delete",
    });
  }, []);

  const openItemFromHome = useCallback(async (item) => {
    persistHomeContext(navigation);
    await openHomeItem(item);
  }, [navigation, openHomeItem, persistHomeContext]);

  const submitTextDialog = useCallback(async () => {
    const trimmedName = textDialog?.value?.trim() ?? "";

    if (!textDialog || !trimmedName) {
      return;
    }

    if (textDialog.kind === "create") {
      if (textDialog.targetType === "project") {
        const project = await createProjectEntry(trimmedName);

        if (project) {
          navigateToProject(project.id);
          closeTextDialog();
        }

        return;
      }

      if (textDialog.targetType === "space" && activeProjectId) {
        const space = await createSpaceEntry(activeProjectId, trimmedName);

        if (space) {
          navigateToSpace(space.projectId, space.id);
          closeTextDialog();
        }

        return;
      }

      if (textDialog.targetType === "canvas" && activeProjectId && activeSpaceId) {
        const canvas = await createCanvasEntry(activeProjectId, activeSpaceId, trimmedName);

        if (canvas) {
          closeTextDialog();
        }

        return;
      }

      if (textDialog.targetType === "page" && activeProjectId && activeSpaceId) {
        const page = await createPageEntry(activeProjectId, activeSpaceId, trimmedName);

        if (page) {
          closeTextDialog();
        }
      }

      return;
    }

    if (textDialog.targetType === "project") {
      const project = await renameProjectEntry(textDialog.target.id, trimmedName);

      if (project) {
        closeTextDialog();
      }

      return;
    }

    if (textDialog.targetType === "space") {
      const space = await renameSpaceEntry(textDialog.target.projectId, textDialog.target.id, trimmedName);

      if (space) {
        closeTextDialog();
      }

      return;
    }

    const item = await renameItemEntry(textDialog.target, trimmedName);

    if (item) {
      closeTextDialog();
    }
  }, [
    activeProjectId,
    activeSpaceId,
    closeTextDialog,
    createCanvasEntry,
    createPageEntry,
    createProjectEntry,
    createSpaceEntry,
    navigateToProject,
    navigateToSpace,
    renameItemEntry,
    renameProjectEntry,
    renameSpaceEntry,
    textDialog,
  ]);

  const submitDelete = useCallback(async () => {
    if (!confirmDialog) {
      return;
    }

    let deleted = false;

    if (confirmDialog.targetType === "project") {
      deleted = await deleteProjectEntry(confirmDialog.target.id);

      if (deleted && navigation.selectedProjectId === confirmDialog.target.id) {
        commitNavigation({
          mode: "home",
          selectedSection: "projects",
          selectedProjectId: null,
          selectedSpaceId: null,
        });
      }
    } else if (confirmDialog.targetType === "space") {
      deleted = await deleteSpaceEntry(confirmDialog.target.projectId, confirmDialog.target.id);

      if (deleted && navigation.selectedSpaceId === confirmDialog.target.id) {
        commitNavigation({
          ...navigation,
          mode: "project",
          selectedSpaceId: null,
        });
      }
    } else {
      deleted = await deleteItemEntry(confirmDialog.target);
    }

    if (deleted) {
      closeConfirmDialog();
    }
  }, [
    closeConfirmDialog,
    commitNavigation,
    confirmDialog,
    deleteItemEntry,
    deleteProjectEntry,
    deleteSpaceEntry,
    navigation,
  ]);

  const breadcrumbItems = useMemo(() => {
    const items = [{
      id: "home",
      label: "Home",
      onClick: () => navigateToHomeSection("overview"),
    }];

    if (navigation.mode === "project" && selectedProject) {
      items.push({
        id: selectedProject.id,
        label: selectedProject.name,
        onClick: () => navigateToProject(selectedProject.id),
      });
    }

    if (navigation.mode === "space" && selectedProject && selectedSpace) {
      items.push({
        id: selectedProject.id,
        label: selectedProject.name,
        onClick: () => navigateToProject(selectedProject.id),
      });
      items.push({
        id: selectedSpace.id,
        label: selectedSpace.name,
        onClick: () => navigateToSpace(selectedProject.id, selectedSpace.id),
      });
    }

    if (navigation.mode === "home" && navigation.selectedSection !== "overview") {
      const section = HOME_SECTIONS.find((entry) => entry.id === navigation.selectedSection);
      items.push({
        id: section?.id ?? "section",
        label: section?.label ?? "Home",
        onClick: () => navigateToHomeSection(section?.id ?? "overview"),
      });
    }

    return items;
  }, [navigateToHomeSection, navigateToProject, navigateToSpace, navigation.mode, navigation.selectedSection, selectedProject, selectedSpace]);

  const mainContent = useMemo(() => {
    const renderItemCard = (item) => (
      <ItemCard
        key={item.id}
        item={item}
        viewMode={homePreferences.viewMode}
        folderPath={folderPath}
        onOpen={() => void openItemFromHome(item)}
        onToggleStar={(starred) => void toggleItemStarred(item.id, starred)}
        onRename={() => openRenameDialog(item.type, item)}
        onDelete={() => askDelete(item.type, item)}
      />
    );

    if (navigation.mode === "space") {
      return (
        <>
          {selectedSpace ? (
            <HomeSection
              title={selectedSpace.name}
              description={`${selectedSpace.canvasCount ?? 0} canvases • ${selectedSpace.pageCount ?? 0} pages • updated ${formatRelativeTime(selectedSpace.updatedAt)}`}
            >
              <div className="home-summary-grid">
                <SummaryCard
                  kind="space"
                  entry={selectedSpace}
                  onOpen={() => navigateToSpace(selectedSpace.projectId, selectedSpace.id)}
                  onRename={() => openRenameDialog("space", selectedSpace)}
                  onDelete={() => askDelete("space", selectedSpace)}
                />
              </div>
            </HomeSection>
          ) : null}

          {selectedProjectSpaces.length > 1 ? (
            <HomeSection title="Other Spaces" description="Jump sideways between spaces in this project.">
              <div className="home-summary-grid">
                {selectedProjectSpaces.map((space) => (
                  <SummaryCard
                    key={space.id}
                    kind="space"
                    entry={space}
                    onOpen={() => navigateToSpace(space.projectId, space.id)}
                    onRename={() => openRenameDialog("space", space)}
                    onDelete={() => askDelete("space", space)}
                  />
                ))}
              </div>
            </HomeSection>
          ) : null}

          <HomeSection
            title="Items"
            description="Canvases and pages inside this space."
            actionLabel={selectedSpace ? "New Canvas" : ""}
            onAction={selectedSpace ? () => openCreateDialog("canvas") : null}
          >
            {contentLoading ? (
              <div className="home-loading-state">Loading space contents…</div>
            ) : spaceItems.length > 0 ? (
              <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>
                {spaceItems.map(renderItemCard)}
              </div>
            ) : (
              <AppEmptyState
                eyebrow="No items"
                title="This space is empty."
                description="Create a canvas or page to start collecting material here."
                actionLabel="New Canvas"
                onAction={() => openCreateDialog("canvas")}
              />
            )}
          </HomeSection>
        </>
      );
    }

    if (navigation.mode === "project") {
      return (
        <>
          {selectedProject ? (
            <HomeSection
              title={selectedProject.name}
              description={`${selectedProject.canvasCount ?? 0} canvases • ${selectedProject.pageCount ?? 0} pages • ${selectedProject.spaceCount ?? 0} spaces`}
            >
              <div className="home-summary-grid">
                <SummaryCard
                  kind="project"
                  entry={selectedProject}
                  onOpen={() => navigateToProject(selectedProject.id)}
                  onRename={() => openRenameDialog("project", selectedProject)}
                  onDelete={() => askDelete("project", selectedProject)}
                />
              </div>
            </HomeSection>
          ) : null}

          <HomeSection
            title="Spaces"
            description="Spaces hold the actual canvases and pages."
            actionLabel={selectedProject ? "New Space" : ""}
            onAction={selectedProject ? () => openCreateDialog("space") : null}
          >
            {contentLoading ? (
              <div className="home-loading-state">Loading project spaces…</div>
            ) : selectedProjectSpaces.length > 0 ? (
              <div className="home-summary-grid">
                {selectedProjectSpaces.map((space) => (
                  <SummaryCard
                    key={space.id}
                    kind="space"
                    entry={space}
                    onOpen={() => navigateToSpace(space.projectId, space.id)}
                    onRename={() => openRenameDialog("space", space)}
                    onDelete={() => askDelete("space", space)}
                  />
                ))}
              </div>
            ) : (
              <AppEmptyState
                eyebrow="No spaces"
                title="This project does not have any spaces yet."
                description="Create the first space so canvases and pages have somewhere to live."
                actionLabel="New Space"
                onAction={() => openCreateDialog("space")}
              />
            )}
          </HomeSection>

          <HomeSection title="Items" description="Everything inside this project.">
            {contentLoading ? (
              <div className="home-loading-state">Loading project items…</div>
            ) : projectItems.length > 0 ? (
              <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>
                {projectItems.map(renderItemCard)}
              </div>
            ) : (
              <AppEmptyState
                eyebrow="No items"
                title="This project has no canvases or pages yet."
                description="Open a space and create the first working surface."
                actionLabel={selectedProjectSpaces[0] ? "Open First Space" : ""}
                onAction={selectedProjectSpaces[0]
                  ? () => navigateToSpace(selectedProjectSpaces[0].projectId, selectedProjectSpaces[0].id)
                  : null}
              />
            )}
          </HomeSection>
        </>
      );
    }

    if (navigation.selectedSection === "recents") {
      return (
        <HomeSection title="Recent Items" description="The latest canvases and pages you opened.">
          {overviewRecentItems.length > 0 ? (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>
              {overviewRecentItems.map(renderItemCard)}
            </div>
          ) : (
            <AppEmptyState
              eyebrow="No recents"
              title="Nothing has been opened recently."
              description="Open a canvas or page from Home and it will appear here."
            />
          )}
        </HomeSection>
      );
    }

    if (navigation.selectedSection === "starred") {
      return (
        <HomeSection title="Starred Items" description="Your pinned canvases and pages.">
          {overviewStarredItems.length > 0 ? (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>
              {overviewStarredItems.map(renderItemCard)}
            </div>
          ) : (
            <AppEmptyState
              eyebrow="No starred items"
              title="Nothing has been starred yet."
              description="Use the star action on any card to keep it close at hand."
            />
          )}
        </HomeSection>
      );
    }

    if (navigation.selectedSection === "projects") {
      return (
        <HomeSection
          title="All Projects"
          description="Projects hold spaces, and spaces hold canvases and pages."
          actionLabel="New Project"
          onAction={() => openCreateDialog("project")}
        >
          {sortedProjects.length > 0 ? (
            <div className="home-summary-grid">
              {sortedProjects.map((project) => (
                <SummaryCard
                  key={project.id}
                  kind="project"
                  entry={project}
                  onOpen={() => navigateToProject(project.id)}
                  onRename={() => openRenameDialog("project", project)}
                  onDelete={() => askDelete("project", project)}
                />
              ))}
            </div>
          ) : (
            <AppEmptyState
              eyebrow="No projects"
              title="This workspace is still empty."
              description="Create the first project to begin organizing spaces, canvases, and pages."
              actionLabel="New Project"
              onAction={() => openCreateDialog("project")}
            />
          )}
        </HomeSection>
      );
    }

    if (navigation.selectedSection === "resources") {
      return (
        <AppEmptyState
          eyebrow="Resources"
          title="Resources will live here."
          description="This placeholder is reserved for future shared references and reusable assets."
        />
      );
    }

    if (navigation.selectedSection === "trash") {
      return (
        <AppEmptyState
          eyebrow="Trash"
          title="Trash is not wired yet."
          description="Deletion and recovery flows will land here in a later phase."
        />
      );
    }

    return (
      <>
        <HomeSection title="Recent Items" description="Jump back into the canvases and pages you touched most recently.">
          {overviewRecentItems.length > 0 ? (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>
              {overviewRecentItems.map(renderItemCard)}
            </div>
          ) : (
            <AppEmptyState
              eyebrow="No recents"
              title="Open a canvas or page to build your recent history."
              description="AirPaste reads this from the index layer so Home stays fast."
            />
          )}
        </HomeSection>

        <HomeSection
          title="Projects"
          description="Top-level containers for all of your spaces and working surfaces."
          actionLabel="New Project"
          onAction={() => openCreateDialog("project")}
        >
          {sortedProjects.length > 0 ? (
            <div className="home-summary-grid">
              {sortedProjects.map((project) => (
                <SummaryCard
                  key={project.id}
                  kind="project"
                  entry={project}
                  onOpen={() => navigateToProject(project.id)}
                  onRename={() => openRenameDialog("project", project)}
                  onDelete={() => askDelete("project", project)}
                />
              ))}
            </div>
          ) : (
            <AppEmptyState
              eyebrow="No projects"
              title="Create a project to start structuring this workspace."
              description="Once a project exists, you can add spaces, canvases, and pages from the same Home shell."
              actionLabel="New Project"
              onAction={() => openCreateDialog("project")}
            />
          )}
        </HomeSection>

        <HomeSection title="Starred" description="The canvases and pages you keep pinned.">
          {overviewStarredItems.length > 0 ? (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>
              {overviewStarredItems.map(renderItemCard)}
            </div>
          ) : (
            <AppEmptyState
              eyebrow="No starred items"
              title="Starred items will collect here."
              description="Use the star action on any card to build a quick-access surface."
            />
          )}
        </HomeSection>
      </>
    );
  }, [
    askDelete,
    contentLoading,
    folderPath,
    homePreferences.viewMode,
    navigateToProject,
    navigateToSpace,
    navigation,
    openCreateDialog,
    openItemFromHome,
    openRenameDialog,
    overviewRecentItems,
    overviewStarredItems,
    projectItems,
    selectedProject,
    selectedProjectSpaces,
    selectedSpace,
    sortedProjects,
    spaceItems,
    toggleItemStarred,
  ]);

  return (
    <main className="home-shell bg-background flex h-full text-foreground">
      <aside className="home-sidebar bg-ap-surface-shell flex flex-col h-full border-r border-ap-border-subtle w-60 flex-shrink-0">
        {/* Sidebar Header with Wordmark */}
        <div className="home-sidebar__header h-14 px-4 flex items-center justify-between border-b border-ap-border-subtle">
          <div className="home-sidebar__wordmark flex items-center gap-1.5">
            <span className="font-bold text-base tracking-tight text-ap-text-primary">Air</span>
            <span className="text-ap-text-secondary text-base">Paste</span>
          </div>
          <AppButton
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-ap-text-secondary hover:text-ap-text-primary"
            onClick={() => void openExistingWorkspace()}
            title="Switch workspace folder"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12V4" />
              <path d="M4 20v-4" />
              <path d="M12 20v-8" />
              <path d="M12 8V4" />
              <path d="M20 20v-2" />
              <path d="M20 14V4" />
              <circle cx="4" cy="14" r="2" />
              <circle cx="12" cy="10" r="2" />
              <circle cx="20" cy="16" r="2" />
            </svg>
          </AppButton>
        </div>

        {/* Sidebar Search */}
        <div className="px-3 mt-3 mb-2">
          <div className="relative">
            <svg className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ap-text-secondary opacity-50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              className="w-full pl-8 pr-3 py-1.5 bg-ap-surface-muted/30 border border-ap-border-subtle rounded-md text-sm placeholder-ap-text-secondary/60 focus:outline-none focus:border-accent"
              placeholder="Search items..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>
        </div>

        {/* Sidebar Nav */}
        <nav className="home-sidebar__nav flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-4" aria-label="Home">
          <div className="flex flex-col gap-0.5">
            {HOME_SECTIONS.filter((s) => s.id !== "overview").map((section) => {
              const isActive = navigation.mode === "home" && navigation.selectedSection === section.id;
              return (
                <AppButton
                  key={section.id}
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2 h-9 px-2 text-sm font-medium"
                  onClick={() => navigateToHomeSection(section.id)}
                >
                  <span className={isActive ? "text-ap-text-primary" : "text-ap-text-secondary"}><IconHome /></span>
                  <span className={isActive ? "text-ap-text-primary" : "text-ap-text-secondary"}>{section.label}</span>
                </AppButton>
              );
            })}
          </div>

          <div className="flex flex-col gap-1">
            <p className="px-2 text-[10px] font-semibold text-ap-text-secondary uppercase tracking-wider mb-1">Projects</p>
            {sortedProjects.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {sortedProjects.map((project) => {
                  const isActive = navigation.selectedProjectId === project.id && navigation.mode !== "home";
                  const spaces = selectedProjectSpaces;
                  return (
                    <div key={project.id} className="flex flex-col gap-0.5">
                      <AppButton
                        variant={isActive ? "secondary" : "ghost"}
                        className="w-full justify-start gap-2 h-9 px-2 text-sm text-left"
                        onClick={() => navigateToProject(project.id)}
                      >
                        <span className="text-ap-text-secondary"><IconProject /></span>
                        <span className="truncate flex-1">{project.name}</span>
                      </AppButton>

                      {isActive && spaces.length > 0 && (
                        <div className="flex flex-col gap-0.5 pl-3 ml-2.5 border-l border-ap-border-subtle/60">
                          {spaces.map((space) => {
                            const isSpaceActive = navigation.selectedSpaceId === space.id && navigation.mode === "space";
                            return (
                              <AppButton
                                key={space.id}
                                variant={isSpaceActive ? "secondary" : "ghost"}
                                className="w-full justify-start gap-1.5 h-8 px-1.5 text-xs text-left"
                                onClick={() => navigateToSpace(project.id, space.id)}
                              >
                                <span><IconSpace /></span>
                                <span className="truncate">{space.name}</span>
                              </AppButton>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-2 text-xs text-ap-text-secondary italic">No projects yet.</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="px-2 text-[10px] font-semibold text-ap-text-secondary uppercase tracking-wider mb-1">Starred</p>
            {homeData.starredItems.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {homeData.starredItems.slice(0, 6).map((item) => (
                  <AppButton
                    key={item.id}
                    variant="ghost"
                    className="w-full justify-start gap-2 h-9 px-2 text-sm text-left"
                    onClick={() => void openItemFromHome(item)}
                  >
                    <span className="text-ap-text-secondary">{renderItemIcon(item.type)}</span>
                    <span className="truncate flex-1">{item.name}</span>
                  </AppButton>
                ))}
              </div>
            ) : (
              <p className="px-2 text-xs text-ap-text-secondary italic">No starred items.</p>
            )}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-ap-border-subtle bg-ap-surface-shell mt-auto">
          <div className="flex flex-col gap-0.5 mb-3">
            <span className="text-sm font-semibold truncate text-ap-text-primary">
              {homeData.workspace?.name || folderNameFromPath(folderPath)}
            </span>
            <span className="text-[10px] text-ap-text-secondary truncate">
              {folderPath}
            </span>
          </div>
          <div className="flex gap-1.5">
            <AppButton variant="ghost" size="sm" className="flex-1 h-8 text-xs font-medium" onClick={toggleTheme}>
              {theme === "dark" ? "Dark" : "Light"}
            </AppButton>
            <AppButton variant="ghost" size="sm" className="flex-1 h-8 text-xs font-medium" onClick={() => void openExistingWorkspace()}>
              Switch
            </AppButton>
          </div>
        </div>
      </aside>

      <section className="home-content flex-1 flex flex-col h-full bg-ap-surface-shell">
        <header className="home-toolbar h-14 px-6 flex items-center justify-end border-b border-ap-border-subtle bg-ap-surface-shell/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <AppDropdownMenu>
              <AppDropdownMenuTrigger asChild>
                <AppButton variant="default" size="sm" className="gap-1 px-3.5 h-8">
                  <IconPlus />
                  <span className="font-semibold text-xs tracking-wide">CREATE</span>
                </AppButton>
              </AppDropdownMenuTrigger>
              <AppDropdownMenuContent align="end" className="w-48" sideOffset={8}>
                {Object.entries(CREATE_ACTIONS).map(([actionKey, action]) => {
                  const state = createActionState[actionKey];
                  return (
                    <AppDropdownMenuItem
                      key={actionKey}
                      disabled={state.disabled || folderLoading}
                      onSelect={() => openCreateDialog(actionKey)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="font-medium text-sm">{action.label}</span>
                      {state.reason && <span className="text-[10px] text-ap-text-secondary">{state.reason}</span>}
                    </AppDropdownMenuItem>
                  );
                })}
              </AppDropdownMenuContent>
            </AppDropdownMenu>

            <div className="h-4 w-px bg-ap-border-subtle/70 mx-1" />

            <label className="text-ap-text-secondary text-xs flex items-center gap-1 border border-ap-border-subtle rounded-md px-2 h-8 bg-ap-surface-muted/30">
              <span className="opacity-70">Sort</span>
              <select 
                value={homePreferences.sortBy} 
                onChange={(e) => updateHomePreference({ sortBy: e.target.value })}
                className="bg-transparent border-none outline-none font-semibold text-ap-text-primary text-xs cursor-pointer focus:ring-0"
              >
                <option value="updatedAt">Modified</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
              </select>
            </label>

            <label className="text-ap-text-secondary text-xs flex items-center gap-1 border border-ap-border-subtle rounded-md px-2 h-8 bg-ap-surface-muted/30">
              <span className="opacity-70">Filter</span>
              <select 
                value={homePreferences.filter} 
                onChange={(e) => updateHomePreference({ filter: e.target.value })}
                className="bg-transparent border-none outline-none font-semibold text-ap-text-primary text-xs cursor-pointer focus:ring-0"
              >
                <option value="all">All</option>
                <option value="canvases">Canvases</option>
                <option value="pages">Pages</option>
                <option value="starred">Starred</option>
              </select>
            </label>

            <div className="flex bg-ap-surface-muted/50 p-0.5 rounded-md border border-ap-border-subtle h-8">
              <AppButton
                variant={homePreferences.viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-full px-2 text-xs font-semibold rounded-sm"
                onClick={() => updateHomePreference({ viewMode: "grid" })}
              >
                Grid
              </AppButton>
              <AppButton
                variant={homePreferences.viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-full px-2 text-xs font-semibold rounded-sm"
                onClick={() => updateHomePreference({ viewMode: "list" })}
              >
                List
              </AppButton>
            </div>
          </div>
        </header>

        <div ref={bodyRef} className="home-content__body flex-1 overflow-y-auto p-6" onScroll={handleBodyScroll}>
          {mainContent}
        </div>
      </section>

      <TextPromptDialog
        eyebrow={textDialog?.kind === "rename" ? "Rename" : "Create"}
        title={textDialog?.title}
        description={textDialog?.description}
        confirmLabel={textDialog?.confirmLabel ?? "Save"}
        value={textDialog?.value ?? ""}
        disabled={!textDialog?.value?.trim() || folderLoading}
        onChange={(value) => setTextDialog((currentValue) => (currentValue ? { ...currentValue, value } : currentValue))}
        onCancel={closeTextDialog}
        onConfirm={() => void submitTextDialog()}
      />

      <ConfirmDialog
        title={confirmDialog?.title}
        description={confirmDialog?.description}
        confirmLabel={confirmDialog?.confirmLabel ?? "Delete"}
        disabled={folderLoading}
        onCancel={closeConfirmDialog}
        onConfirm={() => void submitDelete()}
      />
    </main>
  );
}
