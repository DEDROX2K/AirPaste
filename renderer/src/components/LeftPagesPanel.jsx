import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  AppSheet,
  AppSheetContent,
  AppTooltip,
  AppTooltipContent,
  AppTooltipProvider,
  AppTooltipTrigger,
} from "./ui/app";
import { Canvas, Plus, Sidebar, SidebarClose, SidebarOpen, SplitColumns, X } from "./ui/icons";
import { useSplitView } from "../context/SplitViewContext";
import "./LeftPagesPanel.css";

// The framed panel (see ShellLayers.css) is a hole in the canvas, not a card
// on it: the canvas beside it is masked so the window's grey base (and its
// pixel trail) shows through where the panel sits. The cut-out has the
// panel's rounded inner corner, and the canvas's own corners beside it
// (right of the panel at the top, below it on the left) are rounded like the
// quick note's edge connectors.
const NOTCH_EDGE_RADIUS = 14;
const NOTCH_INNER_RADIUS = 18;
const MASK_PROPS = ["maskImage", "maskPosition", "maskSize", "maskRepeat"];

function buildNotchMask(panelWidth, panelHeight) {
  const pw = Math.max(1, Math.round(panelWidth));
  const ph = Math.max(1, Math.round(panelHeight));
  const F = NOTCH_EDGE_RADIUS;
  const R = Math.min(NOTCH_INNER_RADIUS, pw / 2, ph / 2);
  const w = pw + F;
  const h = ph + F;
  const d = `M${pw + F} 0H${w}V${h}H0V${ph + F}A${F} ${F} 0 0 1 ${F} ${ph}H${pw - R}`
    + `A${R} ${R} 0 0 0 ${pw} ${ph - R}V${F}A${F} ${F} 0 0 1 ${pw + F} 0Z`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><path d='${d}' fill='black'/></svg>`;
  const solid = "linear-gradient(#000, #000)";
  // The two plain layers overlap the shape by 1px so no seam shows.
  return {
    maskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}"), ${solid}, ${solid}`,
    maskPosition: "0 0, 100% 0, 0 100%",
    maskSize: `${w}px ${h}px, calc(100% - ${w - 1}px) 100%, 100% calc(100% - ${h - 1}px)`,
    maskRepeat: "no-repeat",
  };
}

function useCanvasNotch(panelRef, enabled) {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!enabled || !panel || !parent) {
      return undefined;
    }

    const targets = () => [...parent.children].filter((el) => el !== panel);
    const clear = () => {
      targets().forEach((el) => {
        MASK_PROPS.forEach((prop) => {
          el.style[prop] = "";
          el.style[`webkit${prop[0].toUpperCase()}${prop.slice(1)}`] = "";
        });
      });
    };
    const apply = () => {
      const mask = buildNotchMask(panel.offsetWidth, panel.offsetHeight);
      targets().forEach((el) => {
        MASK_PROPS.forEach((prop) => {
          el.style[prop] = mask[prop];
          el.style[`webkit${prop[0].toUpperCase()}${prop.slice(1)}`] = mask[prop];
        });
      });
    };

    apply();
    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(panel);
    // The canvas next to it can be swapped (split screen opening, a pane's
    // file loading): mask whatever sits beside the panel.
    const mutationObserver = new MutationObserver(apply);
    mutationObserver.observe(parent, { childList: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      clear();
    };
  }, [enabled, panelRef]);
}

const PANEL_COLLAPSED_STORAGE_KEY = "airpaste.leftPagesPanelCollapsed";
const PANE_PANEL_COLLAPSED_STORAGE_KEY = "airpaste.splitPagesPanelCollapsed";

function IconSidebarToggle({ collapsed = false }) {
  return collapsed ? <SidebarOpen size={16} aria-hidden="true" /> : <SidebarClose size={16} aria-hidden="true" />;
}

function IconAdd() {
  return <Plus size={14} aria-hidden="true" />;
}

function IconCanvas() {
  return <Canvas size={16} aria-hidden="true" />;
}

function IconPanel() {
  return <Sidebar size={16} aria-hidden="true" />;
}

function PageListItem({
  page,
  collapsed,
  isActive,
  isEditing,
  isDragged,
  dropIndicatorPosition,
  draftName,
  onSelect,
  onStartRename,
  onDraftNameChange,
  onCommitRename,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  showSplitActions,
  isInSplit,
  onSplitPage,
  onCloseSplit,
  onDelete,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  // Row actions, shown on hover. Split screen (two or more pages): open this
  // page in the right pane, or close the split from the page showing there.
  // Delete (two or more pages): an X at the end of the row; the page showing
  // in the split pane keeps only its close-split X, so the two never sit
  // side by side.
  const showDelete = Boolean(onDelete) && !isInSplit;
  const splitActions = (showSplitActions || showDelete) && !collapsed && !isEditing ? (
    <span className="left-pages-panel__item-actions">
      {isInSplit ? (
        <button
          type="button"
          className="left-pages-panel__item-action left-pages-panel__item-action--close"
          onClick={(event) => {
            event.stopPropagation();
            onCloseSplit();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          draggable={false}
          aria-label={`Close split screen (${page.name})`}
          title="Close split screen"
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : showSplitActions && !isActive ? (
        <button
          type="button"
          className="left-pages-panel__item-action"
          onClick={(event) => {
            event.stopPropagation();
            onSplitPage();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          draggable={false}
          aria-label={`Open ${page.name} in split screen`}
          title="Open in split screen"
        >
          <SplitColumns size={13} aria-hidden="true" />
        </button>
      ) : null}
      {showDelete ? (
        <button
          type="button"
          className="left-pages-panel__item-action left-pages-panel__item-action--delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          draggable={false}
          aria-label={`Delete ${page.name}`}
          title="Delete page"
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  ) : null;

  const button = (
    <div
      role="button"
      tabIndex={0}
      className={`left-pages-panel__item${isActive ? " left-pages-panel__item--active" : ""}${isInSplit ? " left-pages-panel__item--split" : ""}${isDragged ? " left-pages-panel__item--dragged" : ""}${dropIndicatorPosition ? ` left-pages-panel__item--drop-${dropIndicatorPosition}` : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (isEditing || event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      draggable={!isEditing}
      onDragStart={(event) => onDragStart(event, page.id)}
      onDragOver={(event) => onDragOver(event, page.id)}
      onDragEnd={onDragEnd}
      onDrop={(event) => onDrop(event, page.id)}
      aria-current={isActive ? "page" : undefined}
      aria-label={page.name}
      title={collapsed ? page.name : undefined}
    >
      <span className="left-pages-panel__item-icon" aria-hidden="true">
        <IconCanvas />
      </span>
      <span className="left-pages-panel__item-copy">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            onChange={(event) => onDraftNameChange(event.target.value)}
            onBlur={() => onCommitRename(false)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                onCommitRename(true);
              }
            }}
            className="left-pages-panel__item-input"
            aria-label={`Rename ${page.name}`}
          />
        ) : (
          <span
            className="left-pages-panel__item-title"
            onDoubleClick={(event) => {
              event.stopPropagation();
              onStartRename();
            }}
          >
            {page.name}
          </span>
        )}
      </span>
      {splitActions}
    </div>
  );

  if (!collapsed) {
    return button;
  }

  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        {button}
      </AppTooltipTrigger>
      <AppTooltipContent side="right">{page.name}</AppTooltipContent>
    </AppTooltip>
  );
}

function PagesPanelContent({
  collapsed,
  pages,
  activePageId,
  editingPageId,
  draftName,
  draggedPageId,
  dropIndicator,
  onCreatePage,
  onToggleCollapsed,
  onSelectPage,
  onStartRename,
  onDraftNameChange,
  onCommitRename,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  splitPageId,
  onSplitPage,
  onCloseSplit,
  onDeletePage = null,
  title = "Pages",
  extraActions = null,
}) {
  const canDelete = Boolean(onDeletePage) && pages.length > 1;
  return (
    <>
      <div className="left-pages-panel__header">
        {!collapsed ? <h2 className="left-pages-panel__title" title={title}>{title}</h2> : <span className="left-pages-panel__title-spacer" aria-hidden="true" />}

        <div className="left-pages-panel__header-actions">
          {onCreatePage ? (
            <AppTooltip>
              <AppTooltipTrigger asChild>
                <AppButton
                  type="button"
                  tone="unstyled"
                  className="left-pages-panel__icon-button"
                  onClick={onCreatePage}
                  aria-label="Create page"
                  title="Create page"
                >
                  <IconAdd />
                </AppButton>
              </AppTooltipTrigger>
              {collapsed ? <AppTooltipContent side="right">Create page</AppTooltipContent> : null}
            </AppTooltip>
          ) : null}

          {onToggleCollapsed ? (
            <AppTooltip>
              <AppTooltipTrigger asChild>
                <AppButton
                  type="button"
                  tone="unstyled"
                  className="left-pages-panel__icon-button"
                  onClick={onToggleCollapsed}
                  aria-label={collapsed ? "Expand pages panel" : "Collapse pages panel"}
                  title={collapsed ? "Expand pages panel" : "Collapse pages panel"}
                >
                  <IconSidebarToggle collapsed={collapsed} />
                </AppButton>
              </AppTooltipTrigger>
              {collapsed ? (
                <AppTooltipContent side="right">Expand pages panel</AppTooltipContent>
              ) : null}
            </AppTooltip>
          ) : null}
          {extraActions}
        </div>
      </div>

      <div className="left-pages-panel__body">
        {pages.length > 0 ? (
          <nav className="left-pages-panel__list" aria-label="Canvas pages">
            {pages.map((page) => (
              <PageListItem
                key={page.id}
                page={page}
                collapsed={collapsed}
                isActive={page.id === activePageId}
                isEditing={editingPageId === page.id}
                isDragged={draggedPageId === page.id}
                dropIndicatorPosition={dropIndicator?.pageId === page.id && draggedPageId !== page.id ? dropIndicator.position : null}
                draftName={editingPageId === page.id ? draftName : page.name}
                onSelect={() => onSelectPage(page.id)}
                onStartRename={() => onStartRename(page)}
                onDraftNameChange={onDraftNameChange}
                onCommitRename={onCommitRename}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
                onDrop={onDrop}
                showSplitActions={pages.length > 1 && Boolean(onSplitPage)}
                isInSplit={splitPageId === page.id}
                onSplitPage={() => onSplitPage(page.id)}
                onCloseSplit={onCloseSplit}
                onDelete={canDelete ? () => onDeletePage(page) : null}
              />
            ))}
          </nav>
        ) : (
          <div className="left-pages-panel__empty" aria-live="polite">
            <span className="left-pages-panel__empty-icon" aria-hidden="true">
              <IconCanvas />
            </span>
            {!collapsed ? (
              <>
                <p className="left-pages-panel__empty-title">No pages yet</p>
                <p className="left-pages-panel__empty-copy">Create a page to start organizing this canvas document.</p>
              </>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

// The panel shows each page's id and name only, but workspace.pages is a
// new array on every card edit (a drop, a resize): this keeps one list until
// an id or a name changes, and the body is memoized on it, so editing the
// canvas doesn't re-render the pages panel.
export default function LeftPagesPanel({ isNarrowDesktop = false }) {
  const {
    workspace,
    createCanvasPage,
    deleteCanvasPage,
    reorderCanvasPages,
    renameCanvasPage,
    setActiveCanvasPage,
  } = useAppContext();
  const { rightPane, openPageSplitFor, closeSplit } = useSplitView();
  const splitPageId = rightPane?.kind === "page"
    ? (rightPane.pageId ?? workspace?.activePageId ?? null)
    : null;
  const workspacePages = workspace?.pages;
  // Tile count too: deleting a page that has tiles asks first.
  const pageListKey = (workspacePages ?? [])
    .map((page) => `${page.id}\u0000${page.name}\u0000${page.cards?.length ?? 0}`)
    .join("\u0001");
  const pages = useMemo(
    () => (workspacePages ?? []).map((page) => ({ id: page.id, name: page.name, tileCount: page.cards?.length ?? 0 })),
    [pageListKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <LeftPagesPanelBody
      isNarrowDesktop={isNarrowDesktop}
      pages={pages}
      activePageId={workspace?.activePageId ?? null}
      createCanvasPage={createCanvasPage}
      reorderCanvasPages={reorderCanvasPages}
      renameCanvasPage={renameCanvasPage}
      setActiveCanvasPage={setActiveCanvasPage}
      deleteCanvasPage={deleteCanvasPage}
      splitPageId={splitPageId}
      onSplitPage={openPageSplitFor}
      onCloseSplit={closeSplit}
    />
  );
}

// Pages section of split screen's right pane: the same panel as the main
// one (same look, rename, reorder), listing the pages shown in that pane,
// with a close-split button in its header.
export function SplitPanePagesPanel({
  workspacePages,
  activePageId,
  onSelectPage,
  createCanvasPage = null,
  renameCanvasPage,
  reorderCanvasPages,
  title = "Pages",
  onClose,
}) {
  const pageListKey = (workspacePages ?? []).map((page) => `${page.id}\u0000${page.name}`).join("\u0001");
  const pages = useMemo(
    () => (workspacePages ?? []).map((page) => ({ id: page.id, name: page.name })),
    [pageListKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const extraActions = useMemo(() => (
    <AppButton
      type="button"
      tone="unstyled"
      className="left-pages-panel__icon-button"
      onClick={onClose}
      aria-label="Close split screen"
      title="Close split screen"
    >
      <X size={14} aria-hidden="true" />
    </AppButton>
  ), [onClose]);

  return (
    <LeftPagesPanelBody
      isNarrowDesktop={false}
      pages={pages}
      activePageId={activePageId}
      createCanvasPage={createCanvasPage}
      reorderCanvasPages={reorderCanvasPages}
      renameCanvasPage={renameCanvasPage}
      setActiveCanvasPage={onSelectPage}
      title={title}
      extraActions={extraActions}
      className="left-pages-panel--pane"
      collapsedStorageKey={PANE_PANEL_COLLAPSED_STORAGE_KEY}
    />
  );
}

const LeftPagesPanelBody = memo(function LeftPagesPanelBody({
  isNarrowDesktop,
  pages,
  activePageId,
  createCanvasPage,
  reorderCanvasPages,
  renameCanvasPage,
  setActiveCanvasPage,
  deleteCanvasPage = null,
  splitPageId,
  onSplitPage,
  onCloseSplit,
  title = "Pages",
  extraActions = null,
  className = "",
  collapsedStorageKey = PANEL_COLLAPSED_STORAGE_KEY,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef(null);
  useCanvasNotch(panelRef, !isNarrowDesktop);
  const [editingPageId, setEditingPageId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [draggedPageId, setDraggedPageId] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The page waiting on "Delete page?" (only pages with tiles ask).
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      setCollapsed(window.localStorage.getItem(collapsedStorageKey) === "true");
    } catch {
      // Ignore persistence failures and keep the default expanded state.
    }
  }, [collapsedStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isNarrowDesktop) {
      return;
    }

    try {
      window.localStorage.setItem(collapsedStorageKey, String(collapsed));
    } catch {
      // Ignore persistence failures.
    }
  }, [collapsed, collapsedStorageKey, isNarrowDesktop]);

  useEffect(() => {
    if (!editingPageId) {
      return;
    }

    const editingPage = pages.find((page) => page.id === editingPageId);
    if (!editingPage) {
      setEditingPageId(null);
      setDraftName("");
    }
  }, [editingPageId, pages]);

  useEffect(() => {
    if (!isNarrowDesktop) {
      setDrawerOpen(false);
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNarrowDesktop]);

  function handleCreatePage() {
    if (!createCanvasPage) {
      return;
    }

    createCanvasPage("");
  }

  function handleStartRename(page) {
    setEditingPageId(page.id);
    setDraftName(page.name);
  }

  function handleCommitRename(cancel = false) {
    const pageId = editingPageId;

    if (!pageId) {
      return;
    }

    if (!cancel) {
      renameCanvasPage?.(pageId, draftName);
    }

    setEditingPageId(null);
    setDraftName("");
  }

  function handleToggleCollapsed() {
    if (isNarrowDesktop) {
      setDrawerOpen((current) => !current);
      return;
    }

    if (editingPageId) {
      handleCommitRename(true);
    }

    setCollapsed((current) => !current);
  }

  function handleDragStart(event, pageId) {
    if (editingPageId) {
      event.preventDefault();
      return;
    }

    setDraggedPageId(pageId);
    setDropIndicator(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
  }

  function handleDragOver(event, targetPageId) {
    if (!draggedPageId) {
      return;
    }

    event.preventDefault();
    const targetRect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY > targetRect.top + (targetRect.height / 2) ? "after" : "before";

    if (draggedPageId === targetPageId) {
      setDropIndicator(null);
      return;
    }

    // dragover repeats every ~50 ms while the pointer rests: only re-render
    // when the indicator actually moves.
    setDropIndicator((current) => (
      current?.pageId === targetPageId && current.position === position
        ? current
        : { pageId: targetPageId, position }
    ));
  }

  function handleDragEnd() {
    setDraggedPageId(null);
    setDropIndicator(null);
  }

  function handleDrop(event, targetPageId) {
    event.preventDefault();

    if (!draggedPageId) {
      return;
    }

    const draggedIndex = pages.findIndex((page) => page.id === draggedPageId);
    const targetIndex = pages.findIndex((page) => page.id === targetPageId);

    if (draggedIndex === -1 || targetIndex === -1) {
      handleDragEnd();
      return;
    }

    const insertAfter = dropIndicator?.pageId === targetPageId
      ? dropIndicator.position === "after"
      : event.clientY > event.currentTarget.getBoundingClientRect().top + (event.currentTarget.getBoundingClientRect().height / 2);
    const nextIndex = targetIndex + (insertAfter ? 1 : 0);
    const adjustedIndex = draggedIndex < nextIndex ? nextIndex - 1 : nextIndex;

    reorderCanvasPages?.(draggedPageId, adjustedIndex);
    handleDragEnd();
  }

  function deletePage(page) {
    if (editingPageId === page.id) {
      handleCommitRename(true);
    }
    if (splitPageId === page.id) {
      onCloseSplit?.();
    }
    deleteCanvasPage?.(page.id);
    setPendingDelete(null);
  }

  function handleDeletePage(page) {
    if (page.tileCount > 0) {
      setPendingDelete(page);
      return;
    }
    deletePage(page);
  }

  const onDeletePage = deleteCanvasPage ? handleDeletePage : null;
  const deleteDialog = (
    <AppDialog open={Boolean(pendingDelete)} onOpenChange={(next) => { if (!next) setPendingDelete(null); }}>
      <AppDialogContent className="max-w-sm">
        <AppDialogHeader>
          <AppDialogTitle>{pendingDelete ? `Delete ${pendingDelete.name}?` : ""}</AppDialogTitle>
          <AppDialogDescription>
            {pendingDelete
              ? `Its ${pendingDelete.tileCount} ${pendingDelete.tileCount === 1 ? "tile goes" : "tiles go"} with it. Undo with Ctrl+Z.`
              : ""}
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogFooter>
          <AppButton type="button" tone="surface" onClick={() => setPendingDelete(null)}>Cancel</AppButton>
          <AppButton type="button" tone="danger" onClick={() => pendingDelete && deletePage(pendingDelete)}>Delete</AppButton>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );

  function handleSelectPage(pageId) {
    if (editingPageId && editingPageId !== pageId) {
      handleCommitRename(false);
    }

    setActiveCanvasPage?.(pageId);

    if (isNarrowDesktop) {
      setDrawerOpen(false);
    }
  }

  if (isNarrowDesktop) {
    return (
      <AppTooltipProvider delayDuration={120}>
        <>
          <aside className="left-pages-rail" aria-label="Pages panel controls">
            <AppTooltip>
              <AppTooltipTrigger asChild>
                <AppButton
                  type="button"
                  tone="unstyled"
                  className="left-pages-panel__icon-button left-pages-rail__button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Open pages panel"
                  title="Open pages panel"
                >
                  <IconPanel />
                </AppButton>
              </AppTooltipTrigger>
              <AppTooltipContent side="right">Pages</AppTooltipContent>
            </AppTooltip>

            {createCanvasPage ? (
              <AppTooltip>
                <AppTooltipTrigger asChild>
                  <AppButton
                    type="button"
                    tone="unstyled"
                    className="left-pages-panel__icon-button left-pages-rail__button"
                    onClick={handleCreatePage}
                    aria-label="Create page"
                    title="Create page"
                  >
                    <IconAdd />
                  </AppButton>
                </AppTooltipTrigger>
                <AppTooltipContent side="right">Create page</AppTooltipContent>
              </AppTooltip>
            ) : null}
          </aside>

          <AppSheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <AppSheetContent side="left" className={`left-pages-panel left-pages-panel--drawer${draggedPageId ? " left-pages-panel--dragging" : ""}`}>
              <PagesPanelContent
                collapsed={false}
                pages={pages}
                activePageId={activePageId}
                editingPageId={editingPageId}
                draftName={draftName}
                draggedPageId={draggedPageId}
                dropIndicator={dropIndicator}
                onCreatePage={createCanvasPage ? handleCreatePage : null}
                onToggleCollapsed={() => setDrawerOpen(false)}
                onSelectPage={handleSelectPage}
                onStartRename={handleStartRename}
                onDraftNameChange={setDraftName}
                onCommitRename={handleCommitRename}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                splitPageId={splitPageId}
                onSplitPage={onSplitPage}
                onCloseSplit={onCloseSplit}
                onDeletePage={onDeletePage}
              />
            </AppSheetContent>
          </AppSheet>
          {deleteDialog}
        </>
      </AppTooltipProvider>
    );
  }

  const content = (
        <PagesPanelContent
          collapsed={collapsed}
          pages={pages}
          activePageId={activePageId}
          editingPageId={editingPageId}
          draftName={draftName}
          draggedPageId={draggedPageId}
          dropIndicator={dropIndicator}
          onCreatePage={createCanvasPage ? handleCreatePage : null}
          onToggleCollapsed={handleToggleCollapsed}
          onSelectPage={handleSelectPage}
          onStartRename={handleStartRename}
          onDraftNameChange={setDraftName}
          onCommitRename={handleCommitRename}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          splitPageId={splitPageId}
          onSplitPage={onSplitPage}
          onCloseSplit={onCloseSplit}
          onDeletePage={onDeletePage}
          title={title}
          extraActions={extraActions}
        />
  );

  return (
    <AppTooltipProvider delayDuration={120}>
      {/* Main panel and split pane's panel are the same piece: a hole in
          the canvas's top-left corner showing the window frame, holding
          the page list on a sheet (ShellLayers.css, useCanvasNotch). */}
      <aside
        ref={panelRef}
        className={`left-pages-panel left-pages-panel--frame${collapsed ? " left-pages-panel--collapsed" : ""}${draggedPageId ? " left-pages-panel--dragging" : ""}${className ? ` ${className}` : ""}`}
        aria-label={title}
        onPointerDown={className ? (event) => event.stopPropagation() : undefined}
      >
        <div className="left-pages-panel__sheet">{content}</div>
      </aside>
      {deleteDialog}
    </AppTooltipProvider>
  );
});
