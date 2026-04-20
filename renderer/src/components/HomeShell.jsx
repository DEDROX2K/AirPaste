import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HomeCubeTrail from "./HomeCubeTrail";
import { useAppContext } from "../context/useAppContext";
import {
  basenameFromRelativePath,
  buildHomeRouteState,
  filterItemsByPreference,
  folderNameFromPath,
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

function SidebarItemIcon({ type, name }) {
  if (type === "canvas") {
    return <img className="home-sidebar-item__glyph-image" src="/icons/canvas.png" alt="" aria-hidden="true" />;
  }

  if (type === "page") {
    return <img className="home-sidebar-item__glyph-image" src="/icons/page.png" alt="" aria-hidden="true" />;
  }

  if (type === "asset") {
    return <span className="home-sidebar-item__glyph-fallback" aria-hidden="true">◌</span>;
  }

  return <span className="home-sidebar-item__glyph-fallback" aria-hidden="true">{name?.trim()?.[0] || "□"}</span>;
}

function typeLabel(type) {
  if (type === "canvas") return "Canvas";
  if (type === "page") return "Page";
  if (type === "asset") return "Asset";
  return "File";
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

export default function HomeShell() {
  const shellRef = useRef(null);
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

  const bodyRef = useRef(null);
  const scrollSaveTimeoutRef = useRef(null);
  const autoSyncRef = useRef("");
  const [navigation, setNavigation] = useState(() => normalizeHomeNavigation(homeData.uiState));
  const [homePreferences] = useState(() => normalizeHomePreferences(homeData.uiState));
  const [textDialog, setTextDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [manageDomesOpen, setManageDomesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setNavigation(normalizeHomeNavigation(homeData.uiState));
  }, [homeData.uiState]);

  useEffect(() => () => window.clearTimeout(scrollSaveTimeoutRef.current), []);

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

  const persistHomeContext = useCallback((nextNavigation, scrollTop = null, extraState = {}) => {
    const nextScrollTop = Number.isFinite(scrollTop) ? scrollTop : bodyRef.current?.scrollTop ?? 0;
    void saveHomeUiState({
      ...buildHomeRouteState(nextNavigation, nextScrollTop),
      homeView: homePreferences.viewMode,
      sortBy: homePreferences.sortBy,
      filter: "all",
      selectedSection: "home",
      ...extraState,
    });
  }, [homePreferences.sortBy, homePreferences.viewMode, saveHomeUiState]);

  const handleBodyScroll = useCallback(() => {
    window.clearTimeout(scrollSaveTimeoutRef.current);
    scrollSaveTimeoutRef.current = window.setTimeout(() => persistHomeContext(navigation), 160);
  }, [navigation, persistHomeContext]);

  const sortedItems = useMemo(() => (
    sortEntriesByPreference(
      filterItemsByPreference(homeData.allFiles, "all"),
      homePreferences.sortBy,
    )
  ), [homeData.allFiles, homePreferences.sortBy]);

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedItems;
    return sortedItems.filter((item) => (
      item.name.toLowerCase().includes(query)
      || item.path.toLowerCase().includes(query)
      || typeLabel(item.type).toLowerCase().includes(query)
    ));
  }, [searchQuery, sortedItems]);

  const counts = useMemo(() => ({
    all: homeData.allFiles.length,
    canvases: homeData.allFiles.filter((item) => item.type === "canvas").length,
    pages: homeData.allFiles.filter((item) => item.type === "page").length,
    files: homeData.allFiles.filter((item) => item.type !== "canvas" && item.type !== "page").length,
  }), [homeData.allFiles]);

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
              <AppDropdownMenuItem onClick={() => setTextDialog({ type: "create-dome", value: "New Dome" })}>
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
            placeholder="Search canvases, pages, files"
            className="home-sidebar__search-input"
          />
        </div>

        <div className="home-sidebar__summary">
          <div className="home-sidebar__summary-pill">All {counts.all}</div>
          <div className="home-sidebar__summary-pill">Canvas {counts.canvases}</div>
          <div className="home-sidebar__summary-pill">Page {counts.pages}</div>
        </div>

        <div className="home-sidebar__list">
          {!hasWorkspace ? (
            <div className="home-sidebar__blank">
              <div className="home-sidebar__blank-title">{activeDome?.path ? "Connecting to dome" : "Open a dome"}</div>
              <p className="home-sidebar__blank-copy">
                {activeDome?.path
                  ? "AirPaste is syncing the selected dome into the workspace shell."
                  : "Choose an existing folder or create a new dome to populate the workspace list."}
              </p>
              <div className="home-sidebar__blank-actions">
                <AppButton tone="accent" className="home-button" onClick={() => void (activeDome?.id ? switchDome(activeDome.id) : openExistingWorkspace())} disabled={folderLoading}>
                  <AppScrambleText>{activeDome?.id ? "Retry Dome" : "Open Folder"}</AppScrambleText>
                </AppButton>
              </div>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="home-sidebar__blank">
              <div className="home-sidebar__blank-title">No matching items</div>
              <p className="home-sidebar__blank-copy">Try another search term or refresh the dome index.</p>
            </div>
          ) : (
            visibleItems.map((item) => (
              <button
                key={item.filePath}
                type="button"
                className={`home-sidebar-item ${activeItemPath === item.path ? "home-sidebar-item--active" : ""}`}
                onClick={() => void openHomeItem(item)}
                title={item.path}
              >
                <span className={`home-sidebar-item__glyph home-sidebar-item__glyph--${item.type}`}>
                  <SidebarItemIcon type={item.type} name={item.name} />
                </span>
                <span className="home-sidebar-item__copy">
                  <AppScrambleText className="home-sidebar-item__title">{item.name}</AppScrambleText>
                  <span className="home-sidebar-item__meta">{typeLabel(item.type)} · {formatRelativeTime(item.updatedAt)}</span>
                </span>
                <span className="home-sidebar-item__star">{item.starred ? <IconStar filled /> : null}</span>
              </button>
            ))
          )}
        </div>

        <div className="home-sidebar__footer home-sidebar__footer--workspace-nav">
          <div className="home-workspace-info">
            <span className="home-workspace-name">{homeData.workspace?.name || folderNameFromPath(folderPath) || "No Dome Open"}</span>
            <span className="home-workspace-path">{folderPath || activeDome?.path || "Workspace path unavailable."}</span>
          </div>
        </div>
      </aside>

      <section className="home-content home-content--workspace-nav">
        <header className="home-toolbar home-toolbar--workspace-nav">
          <div className="home-toolbar__summary">
            <p className="home-toolbar__eyebrow">AirPaste Dome</p>
            <h1 className="home-toolbar__title">{activeDome?.name || homeData.workspace?.name || "Workspace"}</h1>
            <p className="home-toolbar__description">
              {hasWorkspace
                ? `${visibleItems.length} visible item${visibleItems.length === 1 ? "" : "s"} in ${folderNameFromPath(folderPath)}. Emoji are supported directly in canvas and page names.`
                : "Select a dome to load its canvases, pages, and files into the workspace navigator."}
            </p>
          </div>
          <div className="home-toolbar__right">
            <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => void refreshHomeData(folderPath)} disabled={!folderPath || folderLoading}><AppScrambleText>Refresh</AppScrambleText></AppButton>
            <AppButton tone="accent" className="home-button" onClick={() => setTextDialog({ type: "canvas", value: "🎨 Canvas" })} disabled={!hasWorkspace}><AppScrambleText>New Canvas</AppScrambleText></AppButton>
            <AppButton tone="accent" className="home-button" onClick={() => setTextDialog({ type: "page", value: "📝 Page" })} disabled={!hasWorkspace}><AppScrambleText>New Page</AppScrambleText></AppButton>
          </div>
        </header>

        <div ref={bodyRef} className="home-content__body home-content__body--workspace-nav" onScroll={handleBodyScroll}>
          {!hasWorkspace ? (
            <section className="home-blank-panel">
              <p className="home-blank-panel__eyebrow">Workspace Offline</p>
              <h2 className="home-blank-panel__title">{activeDome?.name || "No Dome Loaded"}</h2>
              <p className="home-blank-panel__copy">
                The left panel is ready, but the selected dome has not finished loading into the current workspace session yet.
              </p>
              <div className="home-blank-panel__actions">
                <AppButton tone="accent" className="home-button" onClick={() => void (activeDome?.id ? switchDome(activeDome.id) : openExistingWorkspace())} disabled={folderLoading}>
                  <AppScrambleText>{activeDome?.id ? "Reconnect Dome" : "Open Folder"}</AppScrambleText>
                </AppButton>
                <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => setManageDomesOpen(true)}><AppScrambleText>Manage Domes</AppScrambleText></AppButton>
              </div>
            </section>
          ) : visibleItems.length === 0 ? (
            <div className="home-empty">No files found in this dome.</div>
          ) : (
            <>
              <div className="home-section-title">Workspace Contents</div>
              <div className="home-item-grid home-item-grid--list">
                {visibleItems.map((item) => (
                  <article key={item.filePath} className="home-item-card home-item-card--list">
                    <AppButton tone="unstyled" className="home-item-card__main" type="button" onClick={() => void openHomeItem(item)}>
                      <span className="home-item-card__copy">
                        <span className="home-item-card__eyebrow">{typeLabel(item.type)}</span>
                        <AppScrambleText className="home-item-card__title">{item.name}</AppScrambleText>
                        <span className="home-item-card__meta">{basenameFromRelativePath(item.path)} · Edited {formatRelativeTime(item.updatedAt)}</span>
                      </span>
                    </AppButton>
                    <div className="home-card-actions home-card-actions--visible">
                      <AppButton tone={item.starred ? "accent" : "surface"} className="home-button home-button--icon" onClick={() => void toggleItemStarred(item.filePath, !item.starred)}>
                        <IconStar filled={item.starred} />
                      </AppButton>
                      {item.type !== "asset" && item.type !== "file" ? <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => setTextDialog({ type: "rename", value: item.name, target: item })}><AppScrambleText>Rename</AppScrambleText></AppButton> : null}
                      {item.type !== "asset" && item.type !== "file" ? <AppButton tone="danger" className="home-button" onClick={() => setConfirmDialog({ target: item })}><AppScrambleText>Delete</AppScrambleText></AppButton> : null}
                    </div>
                  </article>
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
            ? "Update file name. Emoji are supported."
            : textDialog?.type === "create-dome"
              ? "Choose a Dome name."
              : textDialog
                ? "Choose a name. Emoji are supported."
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
            <AppButton tone="surface" className="home-button home-button--secondary" onClick={() => setTextDialog({ type: "create-dome", value: "New Dome" })}><AppScrambleText>Create New</AppScrambleText></AppButton>
            <AppButton tone="accent" className="home-button" onClick={() => void openExistingWorkspace()}><AppScrambleText>Open Folder</AppScrambleText></AppButton>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </main>
  );
}
