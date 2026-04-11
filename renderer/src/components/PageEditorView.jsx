import { useEffect, useEffectEvent, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  ArrowLeft,
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
} from "lucide-react";
import { useAppContext } from "../context/useAppContext";
import {
  createEditorDocument,
  pageEditorExtensions,
  serializeEditorDocument,
} from "../lib/pageDocument";

const EMPTY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function ToolbarButton({ active = false, disabled = false, label, onClick, children }) {
  return (
    <button
      type="button"
      className={`page-editor__toolbar-button ${active ? "page-editor__toolbar-button--active" : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function saveStatusLabel(status) {
  if (status === "saving") return "Saving…";
  if (status === "dirty") return "Autosave pending";
  if (status === "error") return "Save failed";
  return "Saved";
}

export default function PageEditorView() {
  const { currentPage, showHome, updateCurrentPageDraft } = useAppContext();
  const [title, setTitle] = useState("");
  const [frontmatter, setFrontmatter] = useState("");
  const [pageSeed, setPageSeed] = useState(null);
  const pageFilePath = currentPage?.filePath ?? null;

  const commitDraft = useEffectEvent((nextTitle = title) => {
    if (!editor || !currentPage) {
      return;
    }

    const markdown = serializeEditorDocument({
      frontmatter,
      title: nextTitle,
      doc: editor.state.doc,
    });

    if (markdown === currentPage.markdown && nextTitle === currentPage.name) {
      return;
    }

    updateCurrentPageDraft({
      markdown,
      title: nextTitle,
    });
  });

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: pageEditorExtensions,
      content: pageSeed?.bodyDocument ?? EMPTY_DOCUMENT,
      editorProps: {
        attributes: {
          class: "page-editor__content",
          spellcheck: "true",
        },
      },
      onUpdate: () => commitDraft(),
    },
    [pageFilePath],
  );

  useEffect(() => {
    if (!currentPage) {
      setPageSeed(null);
      setTitle("");
      setFrontmatter("");
      return;
    }

    const nextSeed = createEditorDocument(currentPage.markdown, currentPage.name);
    setPageSeed(nextSeed);
  }, [pageFilePath]);

  useEffect(() => {
    if (!currentPage || !pageSeed) {
      setTitle("");
      setFrontmatter("");
      return;
    }

    setTitle(pageSeed.title);
    setFrontmatter(pageSeed.frontmatter);
  }, [pageFilePath, pageSeed, currentPage]);

  useEffect(() => {
    if (!editor || !pageSeed) {
      return;
    }

    editor.commands.setContent(pageSeed.bodyDocument ?? EMPTY_DOCUMENT, false);
  }, [editor, pageSeed]);

  if (!currentPage) {
    return (
      <main className="page-editor">
        <section className="page-editor__empty">
          <p className="page-editor__eyebrow">Page</p>
          <h1 className="page-editor__empty-title">No page is open.</h1>
        </section>
      </main>
    );
  }

  const applyLink = () => {
    if (!editor) return;
    const previousHref = editor.getAttributes("link").href ?? "";
    const href = window.prompt("Enter a link URL", previousHref);

    if (href === null) {
      return;
    }

    const nextHref = href.trim();

    if (!nextHref) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: nextHref }).run();
  };

  return (
    <main className="page-editor">
      <header className="page-editor__header">
        <button type="button" className="page-editor__back-button" onClick={() => void showHome()}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="page-editor__meta">
          <div className="page-editor__meta-primary">
            <span className="page-editor__file-name">{currentPage.name}</span>
            <span className="page-editor__save-state">{saveStatusLabel(currentPage.saveStatus)}</span>
          </div>
          <div className="page-editor__meta-secondary">{currentPage.path}</div>
        </div>
      </header>

      <div className="page-editor__toolbar" role="toolbar" aria-label="Document formatting">
        <ToolbarButton
          label="Heading 1"
          disabled={!editor}
          active={editor?.isActive("heading", { level: 1 }) ?? false}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          disabled={!editor}
          active={editor?.isActive("heading", { level: 2 }) ?? false}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Bold"
          disabled={!editor}
          active={editor?.isActive("bold") ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          disabled={!editor}
          active={editor?.isActive("italic") ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Bulleted list"
          disabled={!editor}
          active={editor?.isActive("bulletList") ?? false}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          disabled={!editor}
          active={editor?.isActive("orderedList") ?? false}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton
          label={editor?.isActive("link") ? "Edit link" : "Add link"}
          disabled={!editor}
          active={editor?.isActive("link") ?? false}
          onClick={applyLink}
        >
          <Link2 size={15} />
        </ToolbarButton>
      </div>

      <section className="page-editor__viewport">
        <div className="page-editor__document">
          <input
            className="page-editor__title-input"
            type="text"
            value={title}
            placeholder="Untitled"
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return;
              }

              event.preventDefault();
              editor?.chain().focus("start").run();
            }}
            onChange={(event) => {
              const nextTitle = event.target.value;
              setTitle(nextTitle);
              commitDraft(nextTitle);
            }}
          />

          <div
            className="page-editor__surface"
            onClick={() => editor?.commands.focus()}
            role="presentation"
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </section>
    </main>
  );
}
