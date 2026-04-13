import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import {
  basenameFromRelativePath,
  buildHomeRouteState,
  filterItemsByPreference,
  folderNameFromPath,
  formatRelativeTime,
  normalizeHomeNavigation,
  normalizeHomePreferences,
  parentFolderPath,
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
} from "./ui/app";

const HOME_SECTIONS = Object.freeze([
  { id: "home", label: "Home" },
  { id: "recents", label: "Recent" },
  { id: "starred", label: "Starred" },
]);

function IconStar({ filled = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconAirPasteLogo() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.1 2.5 10.7h2.6V21h6.2v-6.1h1.4V21h6.2V10.7h2.6L12 3.1Z" />
    </svg>
  );
}

function iconLabel(type) {
  if (type === "canvas") return "Canvas";
  if (type === "page") return "Page";
  return "Asset";
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
          <AppButton variant="ghost" onClick={onCancel}>Cancel</AppButton>
          <AppButton disabled={disabled} onClick={onConfirm}>{confirmLabel}</AppButton>
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
          <AppButton variant="ghost" onClick={onCancel}>Cancel</AppButton>
          <AppButton variant="destructive" disabled={disabled} onClick={onConfirm}>Delete</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export default function HomeShell() {
  const {
    activeDome,
    createCanvasEntry,
    createNewDome,
    createPageEntry,
    deleteItemEntry,
    domes,
    folderLoading,
    folderPath,
    homeData,
    navigateHomeFolder,
    openExistingWorkspace,
    openHomeItem,
    refreshDomes,
    removeDome,
    renameItemEntry,
    revealDome,
    saveHomeUiState,
    switchDome,
    toggleItemStarred,
  } = useAppContext();
  const bodyRef = useRef(null);
  const scrollSaveTimeoutRef = useRef(null);
  const [navigation, setNavigation] = useState(() => normalizeHomeNavigation(homeData.uiState));
  const [homePreferences, setHomePreferences] = useState(() => normalizeHomePreferences(homeData.uiState));
  const [searchValue, setSearchValue] = useState("");
  const [textDialog, setTextDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [manageDomesOpen, setManageDomesOpen] = useState(false);

  useEffect(() => {
    setNavigation(normalizeHomeNavigation(homeData.uiState));
    setHomePreferences(normalizeHomePreferences(homeData.uiState));
  }, [homeData]);

  useEffect(() => () => window.clearTimeout(scrollSaveTimeoutRef.current), []);

  const persistHomeContext = useCallback((nextNavigation, scrollTop = null, extraState = {}) => {
    const nextScrollTop = Number.isFinite(scrollTop) ? scrollTop : bodyRef.current?.scrollTop ?? 0;
    void saveHomeUiState({
      ...buildHomeRouteState(nextNavigation, nextScrollTop),
      homeView: homePreferences.viewMode,
      sortBy: homePreferences.sortBy,
      filter: homePreferences.filter,
      ...extraState,
    });
  }, [homePreferences.filter, homePreferences.sortBy, homePreferences.viewMode, saveHomeUiState]);

  const setSection = useCallback((selectedSection) => {
    const next = { ...navigation, selectedSection };
    setNavigation(next);
    persistHomeContext(next, 0);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [navigation, persistHomeContext]);

  const openFolder = useCallback(async (folder) => {
    const next = { ...navigation, selectedSection: "home", currentFolderPath: folder };
    setNavigation(next);
    await navigateHomeFolder(folder);
    persistHomeContext(next, 0);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [navigateHomeFolder, navigation, persistHomeContext]);

  const handleBodyScroll = useCallback(() => {
    window.clearTimeout(scrollSaveTimeoutRef.current);
    scrollSaveTimeoutRef.current = window.setTimeout(() => persistHomeContext(navigation), 160);
  }, [navigation, persistHomeContext]);

  const visibleFiles = useMemo(() => {
    const source = navigation.selectedSection === "recents"
      ? homeData.recentItems
      : navigation.selectedSection === "starred"
        ? homeData.starredItems
        : homeData.files;
    const filtered = filterItemsByPreference(source, homePreferences.filter);
    const sorted = sortEntriesByPreference(filtered, homePreferences.sortBy);
    const query = searchValue.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter((item) => (
      item.name.toLowerCase().includes(query)
      || item.path.toLowerCase().includes(query)
      || item.type.toLowerCase().includes(query)
    ));
  }, [homeData.files, homeData.recentItems, homeData.starredItems, homePreferences.filter, homePreferences.sortBy, navigation.selectedSection, searchValue]);

  const visibleFolders = useMemo(() => {
    if (navigation.selectedSection !== "home") return [];
    const query = searchValue.trim().toLowerCase();
    if (!query) return homeData.folders;
    return homeData.folders.filter((folder) => folder.name.toLowerCase().includes(query));
  }, [homeData.folders, navigation.selectedSection, searchValue]);

  const breadcrumbs = useMemo(() => {
    if (!navigation.currentFolderPath) return [];
    const parts = navigation.currentFolderPath.split("/").filter(Boolean);
    return parts.map((name, index) => ({
      name,
      path: parts.slice(0, index + 1).join("/"),
    }));
  }, [navigation.currentFolderPath]);

  async function submitCreate(type) {
    const name = textDialog?.value?.trim();
    if (!name) return;
    if (type === "canvas") await createCanvasEntry(name, navigation.currentFolderPath);
    else if (type === "page") await createPageEntry(name, navigation.currentFolderPath);
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

  return (
    <main className="home-shell">
      <aside className="home-sidebar">
        <div className="home-sidebar__header">
          <div className="home-sidebar__logo" title="AirPaste" aria-label="AirPaste">
            <span className="home-sidebar__logo-mark" aria-hidden="true">
              <IconAirPasteLogo />
            </span>
          </div>
          <AppDropdownMenu>
            <AppDropdownMenuTrigger asChild>
              <AppButton variant="ghost" size="sm" className="max-w-[180px] truncate" title="Switch dome">
                {activeDome?.name || "No Dome"}
              </AppButton>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="end" className="w-72">
              <AppDropdownMenuLabel>Recent Domes</AppDropdownMenuLabel>
              {domes.length === 0 ? (
                <AppDropdownMenuItem disabled>No recent domes</AppDropdownMenuItem>
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
              <AppDropdownMenuItem onClick={() => setTextDialog({ type: "create-dome", value: "New Dome" })}>
                Create New Dome...
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onClick={() => void openExistingWorkspace()}>
                Open Folder as Dome...
              </AppDropdownMenuItem>
              <AppDropdownMenuItem onClick={() => setManageDomesOpen(true)}>
                Manage Domes...
              </AppDropdownMenuItem>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>

        <div className="home-sidebar__footer">
          <div className="home-workspace-info">
            <span className="home-workspace-name">{homeData.workspace?.name || folderNameFromPath(folderPath)}</span>
            <span className="home-workspace-path">{folderPath}</span>
          </div>
          <nav className="home-sidebar__nav">
            {HOME_SECTIONS.map((section) => (
              <AppButton tone="unstyled"
                key={section.id}
                className={`home-nav-item ${navigation.selectedSection === section.id ? "home-nav-item--active" : ""}`}
                onClick={() => setSection(section.id)}
              >
                {section.label}
              </AppButton>
            ))}
          </nav>
          <div className="home-sidebar__actions">
            <AppButton variant="ghost" size="sm" onClick={() => setManageDomesOpen(true)}>Domes</AppButton>
          </div>
        </div>
      </aside>

      <section className="home-content">
        <header className="home-toolbar">
          <div className="home-toolbar__left">
            <input
              type="search"
              className="home-search__input"
              placeholder="Search files..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </div>
          <div className="home-toolbar__right">
            <AppButton variant="default" size="sm" onClick={() => setTextDialog({ type: "canvas", value: "Canvas" })}>New Canvas</AppButton>
            <AppButton variant="default" size="sm" onClick={() => setTextDialog({ type: "page", value: "Page" })}>New Page</AppButton>
          </div>
        </header>

        <div ref={bodyRef} className="home-content__body" onScroll={handleBodyScroll}>
          {navigation.selectedSection === "home" ? (
            <>

              <div className="home-header__nav">
                {breadcrumbs.map((crumb, index) => (
                  <span key={crumb.path}>
                    {index > 0 ? <span className="home-breadcrumb-sep">/</span> : null}
                    <AppButton tone="unstyled" className="home-breadcrumb" onClick={() => void openFolder(crumb.path)}>{crumb.name}</AppButton>
                  </span>
                ))}
                {navigation.currentFolderPath ? (
                  <AppButton variant="ghost" size="sm" onClick={() => void openFolder(parentFolderPath(navigation.currentFolderPath))}>Up</AppButton>
                ) : null}
              </div>
              {visibleFolders.length > 0 ? (
                <>
                  <div className="home-section-title">Folders</div>
                  <div className="home-summary-grid">
                    {visibleFolders.map((folder) => (
                      <AppButton tone="unstyled" key={folder.path} className="home-summary-card__main" onClick={() => void openFolder(folder.path)}>
                        <span className="home-summary-card__icon"><IconFolder /></span>
                        <span className="home-summary-card__copy">
                          <span className="home-summary-card__title">{folder.name}</span>
                          <span className="home-summary-card__meta">Updated {formatRelativeTime(folder.updatedAt)}</span>
                        </span>
                      </AppButton>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          <div className="home-section-title">{navigation.selectedSection === "recents" ? "Recent Files" : navigation.selectedSection === "starred" ? "Starred Files" : "Files"}</div>
          {visibleFiles.length === 0 ? (
            <div className="home-empty">No files found in this view.</div>
          ) : (
            <div className={`home-item-grid home-item-grid--${homePreferences.viewMode}`}>
              {visibleFiles.map((item) => (
                <article key={item.filePath} className={`home-item-card home-item-card--${homePreferences.viewMode}`}>
                  <AppButton tone="unstyled" className="home-item-card__main" type="button" onClick={() => void openHomeItem(item)}>
                    <span className="home-item-card__copy">
                      <span className="home-item-card__eyebrow">{iconLabel(item.type)}</span>
                      <span className="home-item-card__title">{item.name}</span>
                      <span className="home-item-card__meta">{basenameFromRelativePath(item.path)} · Edited {formatRelativeTime(item.updatedAt)}</span>
                    </span>
                  </AppButton>
                  <div className="home-card-actions">
                    <AppButton variant={item.starred ? "secondary" : "ghost"} size="icon" onClick={() => void toggleItemStarred(item.filePath, !item.starred)}><IconStar filled={item.starred} /></AppButton>
                    {item.type !== "asset" ? <AppButton variant="ghost" size="sm" onClick={() => setTextDialog({ type: "rename", value: item.name, target: item })}>Rename</AppButton> : null}
                    {item.type !== "asset" ? <AppButton variant="ghost" size="sm" onClick={() => setConfirmDialog({ target: item })}>Delete</AppButton> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <TextPromptDialog
        open={Boolean(textDialog)}
        title={
          textDialog?.type === "rename"
            ? "Rename file"
            : textDialog?.type === "canvas"
              ? "Create canvas"
              : textDialog?.type === "page"
                ? "Create page"
                : textDialog?.type === "create-dome"
                  ? "Create Dome"
                : ""
        }
        description={
          textDialog?.type === "rename"
            ? "Update file name."
            : textDialog?.type === "create-dome"
              ? "Choose a Dome name."
              : textDialog
                ? "Choose a name."
                : ""
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
            <AppDialogDescription>Switch, reveal, remove, or create Domes.</AppDialogDescription>
          </AppDialogHeader>
          <div className="space-y-3 max-h-[360px] overflow-auto">
            {domes.length === 0 ? (
              <div className="text-sm text-ap-text-secondary">No Domes yet.</div>
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
                    <AppButton size="sm" variant="ghost" onClick={() => void switchDome(dome.id)} disabled={folderLoading}>Open</AppButton>
                    <AppButton size="sm" variant="ghost" onClick={() => void revealDome(dome.path)}>Reveal</AppButton>
                    <AppButton size="sm" variant="ghost" onClick={() => void removeDome(dome.id)}>Remove</AppButton>
                  </div>
                </div>
              ))
            )}
          </div>
          <AppDialogFooter>
            <AppButton variant="ghost" onClick={() => setManageDomesOpen(false)}>Close</AppButton>
            <AppButton variant="ghost" onClick={() => void refreshDomes()}>Refresh</AppButton>
            <AppButton variant="ghost" onClick={() => setTextDialog({ type: "create-dome", value: "New Dome" })}>Create New</AppButton>
            <AppButton onClick={() => void openExistingWorkspace()}>Open Folder</AppButton>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </main>
  );
}

