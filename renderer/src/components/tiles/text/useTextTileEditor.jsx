import { Extension } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo } from "react";
import { textStylePresetOptions } from "./textStylePresets";

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return {
      types: ["textStyle"],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace("px", "") || null,
            renderHTML: (attributes) => (
              attributes.fontSize
                ? { style: `font-size: ${attributes.fontSize}px` }
                : {}
            ),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: (fontSize) => ({ chain }) => chain().setMark("textStyle", { fontSize: String(fontSize) }).run(),
    };
  },
});

const FONT_SIZE_OPTIONS = Object.freeze([
  { value: "14", label: "14" },
  { value: "16", label: "16" },
  { value: "18", label: "18" },
  { value: "20", label: "20" },
  { value: "24", label: "24" },
  { value: "28", label: "28" },
  { value: "32", label: "32" },
]);

const ALIGNMENT_OPTIONS = Object.freeze([
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "justify", label: "Justify" },
]);

function normalizeHtml(value) {
  const html = typeof value === "string" ? value.trim() : "";
  return html || "<p></p>";
}

export function useTextTileEditor({
  card,
  isEditing,
  onTextChange,
  onEditingChange,
}) {
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      TextStyle,
      FontSize,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
      }),
      TextAlign.configure({
        types: ["paragraph", "bulletList"],
      }),
    ],
    content: normalizeHtml(card.textHtml),
    editable: isEditing,
    editorProps: {
      attributes: {
        class: "card__text-editor-content ProseMirror",
      },
    },
    onFocus: () => {
      onEditingChange?.(card.id, true);
    },
    onUpdate: ({ editor: nextEditor }) => {
      const html = normalizeHtml(nextEditor.getHTML());
      const fontSize = nextEditor.getAttributes("textStyle").fontSize || card.fontSize || "16";
      const textAlign = nextEditor.getAttributes("paragraph").textAlign || card.textAlign || "left";

      onTextChange?.(card.id, {
        text: nextEditor.getText(),
        textHtml: html,
        fontSize: String(fontSize),
        textAlign,
      });
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(isEditing);

    if (isEditing) {
      queueMicrotask(() => {
        editor.commands.focus("end");
      });
    }
  }, [editor, isEditing]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextHtml = normalizeHtml(card.textHtml);

    if (normalizeHtml(editor.getHTML()) !== nextHtml) {
      editor.commands.setContent(nextHtml, false);
    }
  }, [card.textHtml, editor]);

  const previewHtml = useMemo(() => normalizeHtml(card.textHtml), [card.textHtml]);
  const activeFontSize = editor?.getAttributes("textStyle").fontSize || card.fontSize || "16";
  const activeAlignment = editor?.getAttributes("paragraph").textAlign || card.textAlign || "left";
  const activeStylePreset = card.textStylePreset || "simple";

  return {
    previewHtml,
    editorContent: <EditorContent editor={editor} />,
    stylePresetOptions: textStylePresetOptions,
    fontSizeOptions: FONT_SIZE_OPTIONS,
    alignmentOptions: ALIGNMENT_OPTIONS,
    activeStylePreset,
    activeFontSize: String(activeFontSize),
    activeAlignment,
    isBoldActive: Boolean(editor?.isActive("bold")),
    isStrikeActive: Boolean(editor?.isActive("strike")),
    isBulletListActive: Boolean(editor?.isActive("bulletList")),
    canToggleBulletList: Boolean(editor?.can().chain().focus().toggleBulletList().run()),
    setStylePreset: (preset) => {
      onTextChange?.(card.id, { textStylePreset: preset });
      editor?.commands.focus();
    },
    setFontSize: (fontSize) => {
      editor?.chain().focus().setFontSize(fontSize).run();
      onTextChange?.(card.id, { fontSize: String(fontSize) });
    },
    toggleBold: () => editor?.chain().focus().toggleBold().run(),
    toggleStrike: () => editor?.chain().focus().toggleStrike().run(),
    toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
    setAlignment: (alignment) => {
      editor?.chain().focus().setTextAlign(alignment).run();
      onTextChange?.(card.id, { textAlign: alignment });
    },
    editLink: () => {
      if (!editor) {
        return;
      }

      const previousUrl = editor.getAttributes("link").href || "";
      const nextUrl = window.prompt("Enter a link URL", previousUrl);

      if (nextUrl === null) {
        editor.commands.focus();
        return;
      }

      const trimmed = nextUrl.trim();

      if (!trimmed) {
        editor.chain().focus().unsetLink().run();
        return;
      }

      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    },
    focusEditor: () => {
      editor?.commands.focus("end");
    },
  };
}
