import { useAppContext } from "../context/useAppContext";

export default function PageEditorView() {
  const { currentPage, updateCurrentPageMarkdown } = useAppContext();

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
