import { useMemo } from "react";
import { useAppContext } from "../context/useAppContext";
import { useTheme } from "../hooks/useTheme";
import { folderNameFromPath, formatRelativeTime } from "../lib/home";

function IconHome() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.8V21h14V9.8" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function PageEditorView() {
  const {
    currentPage,
    folderLoading,
    folderPath,
    openExistingWorkspace,
    showHome,
    updateCurrentPageMarkdown,
  } = useAppContext();
  const { theme, toggleTheme } = useTheme();

  const workspaceLabel = useMemo(
    () => folderNameFromPath(folderPath),
    [folderPath],
  );

  if (!currentPage) {
    return (
      <main className="page-editor">
        <section className="page-editor__empty">
          <p className="page-editor__eyebrow">Page</p>
          <h1 className="page-editor__title">No page is open.</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="page-editor">
      <header className="page-editor__toolbar">
        <div className="page-editor__actions">
          <button className="hud-chip hud-chip--action" type="button" onClick={() => void showHome()}>
            <IconHome />
            <span>Home</span>
          </button>
          <button
            className="hud-chip hud-chip--action"
            type="button"
            onClick={() => void openExistingWorkspace()}
            disabled={folderLoading}
          >
            <IconFolder />
            <span>{folderLoading ? "Opening..." : "Switch Workspace"}</span>
          </button>
          <button className="hud-chip" type="button" onClick={toggleTheme}>
            <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
          </button>
        </div>

        <div className="page-editor__meta">
          <p className="page-editor__eyebrow">{workspaceLabel}</p>
          <h1 className="page-editor__title">{currentPage.name}</h1>
          <p className="page-editor__subtitle">Last edited {formatRelativeTime(currentPage.updatedAt)}</p>
        </div>
      </header>

      <section className="page-editor__body">
        <textarea
          className="page-editor__textarea"
          value={currentPage.markdown}
          placeholder="# Start typing"
          onChange={(event) => updateCurrentPageMarkdown(event.target.value)}
        />
      </section>
    </main>
  );
}
