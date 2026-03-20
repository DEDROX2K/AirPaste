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

function EmptyState({ eyebrow, title, description, actionLabel, onAction }) {
  return (
    <section className="home-empty-state">
      <p className="home-empty-state__eyebrow">{eyebrow}</p>
      <h2 className="home-empty-state__title">{title}</h2>
      <p className="home-empty-state__description">{description}</p>
      {actionLabel && onAction ? (
        <button className="home-button home-button--primary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
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
          <button className="home-button home-button--ghost" type="button" onClick={onAction}>
            {actionLabel}
          </button>
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
    <button
      className={active ? "home-card-action home-card-action--active" : "home-card-action"}
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
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
  if (!title) {
    return null;
  }

  return (
    <div className="home-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="home-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <p className="home-dialog__eyebrow">{eyebrow}</p>
        <h2 className="home-dialog__title">{title}</h2>
        <p className="home-dialog__description">{description}</p>
        <input
          className="home-dialog__input"
          type="text"
          value={value}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !disabled) {
              event.preventDefault();
              onConfirm();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        <div className="home-dialog__actions">
          <button className="home-button home-button--ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="home-button home-button--primary" type="button" disabled={disabled} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm, disabled }) {
  if (!title) {
    return null;
  }

  return (
    <div className="home-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="home-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <p className="home-dialog__eyebrow">Delete</p>
        <h2 className="home-dialog__title">{title}</h2>
        <p className="home-dialog__description">{description}</p>
        <div className="home-dialog__actions">
          <button className="home-button home-button--ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="home-button home-button--danger" type="button" disabled={disabled} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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
              <EmptyState
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
              <EmptyState
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
              <EmptyState
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
            <EmptyState
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
            <EmptyState
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
            <EmptyState
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
        <EmptyState
          eyebrow="Resources"
          title="Resources will live here."
          description="This placeholder is reserved for future shared references and reusable assets."
        />
      );
    }

    if (navigation.selectedSection === "trash") {
      return (
        <EmptyState
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
            <EmptyState
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
            <EmptyState
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
            <EmptyState
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
    <main className="home-shell">
      <aside className="home-sidebar">
        <div className="home-sidebar__top">
          <button
            className={`home-sidebar__home-button ${navigation.mode === "home" && navigation.selectedSection === "overview" ? "home-sidebar__home-button--active" : ""}`}
            type="button"
            onClick={() => navigateToHomeSection("overview")}
          >
            <IconHome />
            <span>Home</span>
          </button>

          <label className="home-sidebar__search">
            <span className="home-sidebar__search-label">Search</span>
            <input
              type="search"
              value={searchValue}
              placeholder="Search coming soon"
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </label>
        </div>

        <nav className="home-sidebar__nav" aria-label="Home">
          <div className="home-sidebar__group">
            {HOME_SECTIONS.filter((section) => section.id !== "overview").map((section) => (
              <button
                key={section.id}
                className={`home-sidebar__nav-button ${navigation.mode === "home" && navigation.selectedSection === section.id ? "home-sidebar__nav-button--active" : ""}`}
                type="button"
                onClick={() => navigateToHomeSection(section.id)}
              >
                <span>{section.label}</span>
                <IconChevron />
              </button>
            ))}
          </div>

          <div className="home-sidebar__group">
            <p className="home-sidebar__group-title">Projects</p>
            {sortedProjects.length > 0 ? (
              sortedProjects.map((project) => (
                <div key={project.id} className="home-sidebar__project">
                  <button
                    className={`home-sidebar__project-button ${navigation.selectedProjectId === project.id && navigation.mode !== "home" ? "home-sidebar__project-button--active" : ""}`}
                    type="button"
                    onClick={() => navigateToProject(project.id)}
                  >
                    <span className="home-sidebar__project-icon"><IconProject /></span>
                    <span className="home-sidebar__project-name">{project.name}</span>
                  </button>

                  {navigation.selectedProjectId === project.id && selectedProjectSpaces.length > 0 ? (
                    <div className="home-sidebar__space-list">
                      {selectedProjectSpaces.map((space) => (
                        <button
                          key={space.id}
                          className={`home-sidebar__space-button ${navigation.selectedSpaceId === space.id && navigation.mode === "space" ? "home-sidebar__space-button--active" : ""}`}
                          type="button"
                          onClick={() => navigateToSpace(project.id, space.id)}
                        >
                          <span className="home-sidebar__project-icon"><IconSpace /></span>
                          <span className="home-sidebar__project-name">{space.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="home-sidebar__placeholder">No projects yet.</p>
            )}
          </div>

          <div className="home-sidebar__group">
            <p className="home-sidebar__group-title">Starred</p>
            {homeData.starredItems.length > 0 ? (
              homeData.starredItems.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  className="home-sidebar__starred-button"
                  type="button"
                  onClick={() => void openItemFromHome(item)}
                >
                  <span className="home-sidebar__project-icon">{renderItemIcon(item.type)}</span>
                  <span className="home-sidebar__project-name">{item.name}</span>
                </button>
              ))
            ) : (
              <p className="home-sidebar__placeholder">No starred items.</p>
            )}
          </div>
        </nav>

        <div className="home-sidebar__footer">
          <div className="home-sidebar__workspace">
            <span className="home-sidebar__workspace-title">{homeData.workspace?.name ?? folderNameFromPath(folderPath)}</span>
            <span className="home-sidebar__workspace-meta">{folderNameFromPath(folderPath)}</span>
          </div>
          <div className="home-sidebar__footer-actions">
            <button className="home-button home-button--ghost" type="button" onClick={toggleTheme}>
              {theme === "dark" ? "Dark" : "Light"}
            </button>
            <button className="home-button home-button--ghost" type="button" onClick={() => void openExistingWorkspace()}>
              Switch
            </button>
          </div>
        </div>
      </aside>

      <section className="home-content">
        <header className="home-toolbar">
          <div className="home-toolbar__breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbItems.map((item, index) => (
              <button key={item.id} className="home-toolbar__crumb" type="button" onClick={item.onClick}>
                {index > 0 ? <IconChevron /> : null}
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="home-toolbar__controls">
            <div className="home-create-menu">
              <button
                className="home-button home-button--primary"
                type="button"
                onClick={() => setCreateMenuOpen((currentValue) => !currentValue)}
              >
                <IconPlus />
                <span>Create</span>
              </button>

              {createMenuOpen ? (
                <div className="home-create-menu__panel">
                  {Object.entries(CREATE_ACTIONS).map(([actionKey, action]) => (
                    <button
                      key={actionKey}
                      className="home-create-menu__item"
                      type="button"
                      disabled={createActionState[actionKey].disabled || folderLoading}
                      title={createActionState[actionKey].reason}
                      onClick={() => openCreateDialog(actionKey)}
                    >
                      <span>{action.label}</span>
                      {createActionState[actionKey].reason ? (
                        <span className="home-create-menu__reason">{createActionState[actionKey].reason}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="home-toolbar__select-shell">
              <span>Sort</span>
              <select value={homePreferences.sortBy} onChange={(event) => updateHomePreference({ sortBy: event.target.value })}>
                <option value="updatedAt">Last modified</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
              </select>
            </label>

            <label className="home-toolbar__select-shell">
              <span>Filter</span>
              <select value={homePreferences.filter} onChange={(event) => updateHomePreference({ filter: event.target.value })}>
                <option value="all">All</option>
                <option value="canvases">Canvases</option>
                <option value="pages">Pages</option>
                <option value="starred">Starred</option>
              </select>
            </label>

            <div className="home-toolbar__view-toggle" role="group" aria-label="View mode">
              <button
                className={homePreferences.viewMode === "grid" ? "home-toolbar__view-toggle-button home-toolbar__view-toggle-button--active" : "home-toolbar__view-toggle-button"}
                type="button"
                onClick={() => updateHomePreference({ viewMode: "grid" })}
              >
                Grid
              </button>
              <button
                className={homePreferences.viewMode === "list" ? "home-toolbar__view-toggle-button home-toolbar__view-toggle-button--active" : "home-toolbar__view-toggle-button"}
                type="button"
                onClick={() => updateHomePreference({ viewMode: "list" })}
              >
                List
              </button>
            </div>
          </div>
        </header>

        <div ref={bodyRef} className="home-content__body" onScroll={handleBodyScroll}>
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
