import { getSchema } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import MarkdownIt from "markdown-it";
import { MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";

const UNTITLED_PAGE = "Untitled";

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

const markdownSerializer = new MarkdownSerializer(
  {
    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },
    bulletList(state, node) {
      state.renderList(node, "  ", () => "* ");
    },
    codeBlock(state, node) {
      state.write(`\`\`\`${node.attrs.language || ""}`);
      state.ensureNewLine();
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write("```");
      state.closeBlock(node);
    },
    hardBreak(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i += 1) {
        if (parent.child(i).type !== node.type) {
          state.write("\\\n");
          return;
        }
      }
    },
    heading(state, node) {
      state.write(`${state.repeat("#", node.attrs.level)} `);
      state.renderInline(node);
      state.closeBlock(node);
    },
    horizontalRule(state, node) {
      state.write("---");
      state.closeBlock(node);
    },
    listItem(state, node) {
      state.renderContent(node);
    },
    orderedList(state, node) {
      const start = node.attrs.start || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = (value) => state.repeat(" ", maxW - String(value).length);
      state.renderList(node, "  ", (index) => {
        const value = start + index;
        return `${space(value)}${value}. `;
      });
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    text(state, node) {
      state.text(node.text || "");
    },
  },
  {
    bold: {
      open: "**",
      close: "**",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    code: {
      open: "`",
      close: "`",
      escape: false,
    },
    italic: {
      open: "*",
      close: "*",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    link: {
      open: "[",
      close(state, mark) {
        const href = String(mark.attrs.href || "").replace(/[()"]/g, "\\$&");
        const title = mark.attrs.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : "";
        return `](${href}${title})`;
      },
      mixable: false,
    },
  },
);

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
    if (!match) {
      continue;
    }

    return match[1].replace(/^["']|["']$/g, "").trim();
  }

  return "";
}

function syncFrontmatterTitle(frontmatter, title) {
  if (!frontmatter) {
    return "";
  }

  const safeTitle = String(title || UNTITLED_PAGE).replace(/"/g, '\\"');
  const lines = normalizeLineEndings(frontmatter).replace(/\n+$/, "").split("\n");
  const titleLine = `title: "${safeTitle}"`;
  const titleIndex = lines.findIndex((line, index) => index > 0 && /^title:\s*/i.test(line));

  if (titleIndex >= 0) {
    lines[titleIndex] = titleLine;
  } else if (lines.length > 1) {
    lines.splice(1, 0, titleLine);
  }

  return `${lines.join("\n")}\n`;
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

function trimTrailingWhitespacePreservingStructure(value) {
  return normalizeLineEndings(value).replace(/\s+$/, "");
}

export function parsePageMarkdown(markdown, fallbackTitle = UNTITLED_PAGE) {
  const normalized = normalizeLineEndings(markdown);
  const { frontmatter, content } = extractFrontmatter(normalized);
  const frontmatterTitle = readFrontmatterTitle(frontmatter);
  const { title, body } = extractLeadingTitle(content, frontmatterTitle || fallbackTitle);

  return {
    frontmatter,
    title,
    bodyMarkdown: body,
  };
}

export function serializePageMarkdown({ frontmatter = "", title = UNTITLED_PAGE, bodyMarkdown = "" }) {
  const safeTitle = String(title || UNTITLED_PAGE).trim() || UNTITLED_PAGE;
  const safeBody = trimTrailingWhitespacePreservingStructure(bodyMarkdown);
  const nextFrontmatter = syncFrontmatterTitle(frontmatter, safeTitle);
  const segments = [];

  if (nextFrontmatter) {
    segments.push(nextFrontmatter.replace(/\n+$/, ""));
  }

  segments.push(`# ${safeTitle}`);

  if (safeBody) {
    segments.push(safeBody);
  }

  return `${segments.join("\n\n")}\n`;
}

export function createEditorDocument(markdown, fallbackTitle = UNTITLED_PAGE) {
  const parsed = parsePageMarkdown(markdown, fallbackTitle);
  const body = parsed.bodyMarkdown.trim()
    ? markdownParser.parse(parsed.bodyMarkdown).toJSON()
    : { type: "doc", content: [{ type: "paragraph" }] };

  return {
    ...parsed,
    bodyDocument: body,
  };
}

export function serializeEditorDocument({ frontmatter = "", title = UNTITLED_PAGE, doc }) {
  const bodyMarkdown = trimTrailingWhitespacePreservingStructure(markdownSerializer.serialize(doc));

  return serializePageMarkdown({
    frontmatter,
    title,
    bodyMarkdown,
  });
}
