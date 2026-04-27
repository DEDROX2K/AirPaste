import { useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../context/useAppContext";
import {
  AppButton,
  AppTooltip,
  AppTooltipContent,
  AppTooltipProvider,
  AppTooltipTrigger,
} from "./ui/app";

const PANEL_COLLAPSED_STORAGE_KEY = "airpaste.leftPagesPanelCollapsed";

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

function IconAdd() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconCanvas() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9.5h8M8 14.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
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
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const button = (
    <button
      type="button"
      className={`left-pages-panel__item${isActive ? " left-pages-panel__item--active" : ""}${isDragged ? " left-pages-panel__item--dragged" : ""}${dropIndicatorPosition ? ` left-pages-panel__item--drop-${dropIndicatorPosition}` : ""}`}
      onClick={onSelect}
      draggable={!isEditing}
      onDragStart={(event) => onDragStart(event, page.id)}
      onDragOver={(event) => onDragOver(event, page.id)}
      onDragEnd={onDragEnd}
      onDrop={(event) => onDrop(event, page.id)}
      aria-current={isActive ? "page" : undefined}
      aria-label={page.name}
      title={collapsed ? page.name : undefined}
    >
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
    </button>
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

export default function LeftPagesPanel() {
  const {
    workspace,
    createCanvasPage,
    reorderCanvasPages,
    renameCanvasPage,
    setActiveCanvasPage,
  } = useAppContext();
  const [collapsed, setCollapsed] = useState(false);
  const [editingPageId, setEditingPageId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [draggedPageId, setDraggedPageId] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      setCollapsed(window.localStorage.getItem(PANEL_COLLAPSED_STORAGE_KEY) === "true");
    } catch {
      // Ignore persistence failures and keep the default expanded state.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(PANEL_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // Ignore persistence failures.
    }
  }, [collapsed]);

  const pages = useMemo(() => workspace?.pages ?? [], [workspace?.pages]);
  const activePageId = workspace?.activePageId ?? null;

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

  function handleDragStart(event, pageId) {
    if (editingPageId) {
      event.preventDefault();
      return;
    }

    setDraggedPageId(pageId);
    setDropIndicator(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
    document.body.classList.add("left-pages-panel--dragging");
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

    setDropIndicator({ pageId: targetPageId, position });
  }

  function handleDragEnd() {
    setDraggedPageId(null);
    setDropIndicator(null);
    document.body.classList.remove("left-pages-panel--dragging");
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

  return (
    <AppTooltipProvider delayDuration={120}>
      <aside
        className={`left-pages-panel${collapsed ? " left-pages-panel--collapsed" : ""}`}
        aria-label="Pages"
      >
        <div className="left-pages-panel__header">
          {!collapsed ? <h2 className="left-pages-panel__title">Pages</h2> : <span className="left-pages-panel__title-spacer" aria-hidden="true" />}

          <div className="left-pages-panel__header-actions">
            {createCanvasPage ? (
              <AppTooltip>
                <AppTooltipTrigger asChild>
                  <AppButton
                    type="button"
                    tone="unstyled"
                    className="left-pages-panel__icon-button"
                    onClick={handleCreatePage}
                    aria-label="Create page"
                    title="Create page"
                  >
                    <IconAdd />
                  </AppButton>
                </AppTooltipTrigger>
                {collapsed ? <AppTooltipContent side="right">Create page</AppTooltipContent> : null}
              </AppTooltip>
            ) : null}

            <AppTooltip>
              <AppTooltipTrigger asChild>
                <AppButton
                  type="button"
                  tone="unstyled"
                  className="left-pages-panel__icon-button"
                  onClick={() => setCollapsed((current) => !current)}
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
                  onSelect={() => {
                    if (editingPageId && editingPageId !== page.id) {
                      handleCommitRename(false);
                    }
                    setActiveCanvasPage?.(page.id);
                  }}
                  onStartRename={() => handleStartRename(page)}
                  onDraftNameChange={setDraftName}
                  onCommitRename={handleCommitRename}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
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
      </aside>
    </AppTooltipProvider>
  );
}
