import { useMemo } from "react";
import { useAppContext } from "../context/useAppContext";
import { useTheme } from "../hooks/useTheme";
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
    () => folderPath ? folderPath.split("/").pop() : "",
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
