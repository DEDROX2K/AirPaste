import { useEffect, useEffectEvent, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  ArrowLeft,
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { useAppContext } from "../context/useAppContext";
import {
  createEditorDocument,
  createPageRevision,
  EMPTY_PAGE_DOCUMENT,
  normalizePageContent,
  pageEditorExtensions,
} from "../lib/pageDocument";
import { AppButton, AppScrambleText } from "./ui/app";

function ToolbarButton({ active = false, disabled = false, label, onClick, children }) {
  return (
    <AppButton
      tone="unstyled"
      type="button"
      className={`page-editor__toolbar-button ${active ? "page-editor__toolbar-button--active" : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </AppButton>
  );
}

function saveStatusLabel(status) {
  if (status === "saving") return "Saving...";
  if (status === "dirty") return "Autosave pending";
  if (status === "error") return "Save failed";
  return "Saved";
}

function saveStatusTone(status) {
  if (status === "saving") return "page-editor__save-state--saving";
  if (status === "dirty") return "page-editor__save-state--dirty";
  if (status === "error") return "page-editor__save-state--error";
  return "page-editor__save-state--saved";
}

function pageContentEqual(left, right) {
  return JSON.stringify(normalizePageContent(left)) === JSON.stringify(normalizePageContent(right));
}

export default function PageEditorView() {
  const { currentPage, showHome, updateCurrentPageDraft } = useAppContext();
  const [title, setTitle] = useState("");
  const lastSyncedRevisionRef = useRef("");
  const pageFilePath = currentPage?.filePath ?? null;
  const currentPageName = currentPage?.name ?? "";
  const currentPageTitle = currentPage?.title ?? "";
  const currentPageContent = currentPage?.content ?? null;
  const currentPageRevision = currentPage?.lastSavedRevision ?? "";

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: pageEditorExtensions,
      content: EMPTY_PAGE_DOCUMENT,
      editorProps: {
        attributes: {
          class: "page-editor__content",
          spellcheck: "true",
        },
      },
    },
    [pageFilePath],
  );

  const commitDraft = useEffectEvent((nextTitle = title) => {
    if (!editor || !currentPage) {
      return;
    }

    updateCurrentPageDraft({
      title: nextTitle,
      content: editor.getJSON(),
    });
  });

  useEffect(() => {
    if (!currentPage) {
      lastSyncedRevisionRef.current = "";
      setTitle("");
      if (editor) {
        editor.commands.setContent(EMPTY_PAGE_DOCUMENT, false);
      }
      return;
    }

    if (!editor) {
      return;
    }

    if (lastSyncedRevisionRef.current === currentPageRevision) {
      return;
    }

    const seed = createEditorDocument(
      {
        title: currentPageTitle,
        content: currentPageContent,
      },
      currentPageName,
    );
    const editorDocument = editor.getJSON();
    const nextTitle = seed.title;

    if (title !== nextTitle) {
      setTitle(nextTitle);
    }

    if (!pageContentEqual(editorDocument, seed.bodyDocument)) {
      editor.commands.setContent(seed.bodyDocument ?? EMPTY_PAGE_DOCUMENT, false);
    }

    lastSyncedRevisionRef.current = currentPageRevision;
  }, [currentPage, currentPageContent, currentPageName, currentPageRevision, currentPageTitle, editor, title]);

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

  const displayedHeaderTitle = currentPage.title || currentPage.name || "Untitled";
  const activeRevision = createPageRevision({
    title: title.trim() || currentPage.name,
    content: editor?.getJSON() ?? currentPage.content,
  });
  const isDraftAhead = activeRevision !== currentPage.lastSavedRevision && currentPage.saveStatus !== "saving";

  return (
    <main className="page-editor">
      <header className="page-editor__header">
        <div className="page-editor__header-main">
          <AppButton tone="unstyled" type="button" className="page-editor__back-button" onClick={() => void showHome()}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </AppButton>

          <div className="page-editor__meta">
            <div className="page-editor__meta-primary">
              <span className="page-editor__file-name">{displayedHeaderTitle}</span>
              <span className={`page-editor__save-state ${saveStatusTone(isDraftAhead ? "dirty" : currentPage.saveStatus)}`}>
                {saveStatusLabel(isDraftAhead ? "dirty" : currentPage.saveStatus)}
              </span>
            </div>
            <div className="page-editor__meta-secondary">{currentPage.path}</div>
          </div>
        </div>
      </header>

      <section className="page-editor__viewport">
        <div className="page-editor__document">
          <div className="page-editor__document-head">
            <p className="page-editor__document-kicker">Markdown page</p>
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
                label="Quote"
                disabled={!editor}
                active={editor?.isActive("blockquote") ?? false}
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              >
                <Quote size={15} />
              </ToolbarButton>
              <ToolbarButton
                label="Code block"
                disabled={!editor}
                active={editor?.isActive("codeBlock") ?? false}
                onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
              >
                <Code2 size={15} />
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
          </div>

          <div className="page-editor__page">
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

          <div className="page-editor__footer">
            <span className="page-editor__footer-label">Markdown-backed autosave</span>
            <span className={`page-editor__footer-state ${saveStatusTone(isDraftAhead ? "dirty" : currentPage.saveStatus)}`}>
              <AppScrambleText>{saveStatusLabel(isDraftAhead ? "dirty" : currentPage.saveStatus)}</AppScrambleText>
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
