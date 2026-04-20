import { getSchema } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import MarkdownIt from "markdown-it";
import { MarkdownParser } from "prosemirror-markdown";

export const UNTITLED_PAGE = "Untitled";

export const EMPTY_PAGE_DOCUMENT = Object.freeze({
  type: "doc",
  content: [{ type: "paragraph" }],
});

export const pageEditorExtensions = [
  StarterKit.configure({
    link: false,
    strike: false,
  }),
  Link.configure({
    autolink: true,
    openOnClick: false,
  }),
];

const schema = getSchema(pageEditorExtensions);
const markdownTokenizer = new MarkdownIt("commonmark", {
  html: false,
  linkify: true,
});

const markdownParser = new MarkdownParser(schema, markdownTokenizer, {
  blockquote: { block: "blockquote" },
  bullet_list: { block: "bulletList" },
  code_block: { block: "codeBlock", noCloseToken: true },
  fence: {
    block: "codeBlock",
    getAttrs: (token) => ({ language: token.info || null }),
    noCloseToken: true,
  },
  hardbreak: { node: "hardBreak" },
  heading: {
    block: "heading",
    getAttrs: (token) => ({ level: Number(token.tag.slice(1)) || 1 }),
  },
  hr: { node: "horizontalRule" },
  link: {
    mark: "link",
    getAttrs: (token) => ({
      href: token.attrGet("href"),
      title: token.attrGet("title") || null,
    }),
  },
  list_item: { block: "listItem" },
  ordered_list: {
    block: "orderedList",
    getAttrs: (token) => ({
      start: Number(token.attrGet("start")) || 1,
    }),
  },
  paragraph: { block: "paragraph" },
  code_inline: { mark: "code" },
  em: { mark: "italic" },
  strong: { mark: "bold" },
});

function normalizeLineEndings(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function extractFrontmatter(markdown) {
  const normalized = normalizeLineEndings(markdown);

  if (!normalized.startsWith("---\n")) {
    return { frontmatter: "", content: normalized };
  }

  const match = normalized.match(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n*/);
  if (!match) {
    return { frontmatter: "", content: normalized };
  }

  return {
    frontmatter: match[0],
    content: normalized.slice(match[0].length),
  };
}

function readFrontmatterTitle(frontmatter) {
  const lines = normalizeLineEndings(frontmatter).split("\n");

  for (const line of lines) {
    const match = line.match(/^title:\s*(.+?)\s*$/i);
    if (match) {
      return match[1].replace(/^["']|["']$/g, "").trim();
    }
  }

  return "";
}

function extractLeadingTitle(content, fallbackTitle) {
  const lines = normalizeLineEndings(content).split("\n");
  let cursor = 0;

  while (cursor < lines.length && lines[cursor].trim() === "") {
    cursor += 1;
  }

  const headingLine = lines[cursor] ?? "";
  const headingMatch = headingLine.match(/^#\s+(.+?)\s*$/);

  if (!headingMatch) {
    return {
      title: fallbackTitle || UNTITLED_PAGE,
      body: content,
    };
  }

  const nextLines = [...lines.slice(0, cursor), ...lines.slice(cursor + 1)];

  if ((nextLines[cursor] ?? "").trim() === "") {
    nextLines.splice(cursor, 1);
  }

  return {
    title: headingMatch[1].trim() || fallbackTitle || UNTITLED_PAGE,
    body: nextLines.join("\n").replace(/^\n+/, ""),
  };
}

export function normalizePageContent(content) {
  if (!content || typeof content !== "object" || content.type !== "doc") {
    return EMPTY_PAGE_DOCUMENT;
  }

  return content;
}

export function createEditorDocument(page, fallbackTitle = UNTITLED_PAGE) {
  if (typeof page === "string") {
    const normalized = normalizeLineEndings(page);
    const { frontmatter, content } = extractFrontmatter(normalized);
    const frontmatterTitle = readFrontmatterTitle(frontmatter);
    const { title, body } = extractLeadingTitle(content, frontmatterTitle || fallbackTitle);

    return {
      title,
      bodyDocument: body.trim()
        ? markdownParser.parse(body).toJSON()
        : EMPTY_PAGE_DOCUMENT,
    };
  }

  return {
    title: String(page?.title || fallbackTitle || UNTITLED_PAGE).trim() || UNTITLED_PAGE,
    bodyDocument: normalizePageContent(page?.content),
  };
}

function flattenText(node, parts) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (typeof node.text === "string" && node.text.trim()) {
    parts.push(node.text.trim());
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child) => flattenText(child, parts));
  }
}

export function getPageExcerpt(content, maxLength = 220) {
  const parts = [];
  flattenText(normalizePageContent(content), parts);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function createPageRevision({ title, content }) {
  return JSON.stringify({
    title: String(title || "").trim(),
    content: normalizePageContent(content),
  });
}
