import { GFM, parser as commonmarkParser } from "@lezer/markdown";

// The one markdown dialect every note in the app speaks (see
// docs/rules/text-editing-rules.md), shared by the live-preview editor (via
// @codemirror/lang-markdown) and the read-only render, so the two can't
// drift apart: CommonMark + GFM (tasks, strikethrough, tables, autolinks) +
// two small extensions below.
//
// Deliberately NOT lang-markdown's `markdownLanguage` base, which also turns
// on ~sub~ / ^super^ / :emoji: and would swallow ordinary tildes and carets.

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\p{P}\p{S}]/u;

// `==highlight==`, parsed exactly like GFM's `~~strike~~` delimiter.
const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

export const Highlight = {
  defineNodes: [{ name: "Highlight" }, { name: "HighlightMark" }],
  parseInline: [{
    name: "Highlight",
    parse(cx, next, pos) {
      if (next !== 61 /* = */ || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) {
        return -1;
      }
      const before = cx.slice(pos - 1, pos);
      const after = cx.slice(pos + 2, pos + 3);
      const sBefore = /\s|^$/.test(before);
      const sAfter = /\s|^$/.test(after);
      const pBefore = PUNCTUATION.test(before);
      const pAfter = PUNCTUATION.test(after);
      return cx.addDelimiter(
        HighlightDelim,
        pos,
        pos + 2,
        !sAfter && (!pAfter || sBefore || pBefore),
        !sBefore && (!pBefore || sAfter || pAfter),
      );
    },
    after: "Emphasis",
  }],
};

// Markdown has no underline syntax; `<u>...</u>` is the portable spelling
// (Obsidian and GitHub both render it). Parsed as a delimiter pair rather
// than left as two loose HTMLTag nodes so it nests like any other emphasis.
const UnderlineDelim = { resolve: "Underline", mark: "UnderlineMark" };

export const Underline = {
  defineNodes: [{ name: "Underline" }, { name: "UnderlineMark" }],
  parseInline: [{
    name: "Underline",
    parse(cx, next, pos) {
      if (next !== 60 /* < */) {
        return -1;
      }
      if (cx.slice(pos, pos + 3).toLowerCase() === "<u>") {
        return cx.addDelimiter(UnderlineDelim, pos, pos + 3, true, false);
      }
      if (cx.slice(pos, pos + 4).toLowerCase() === "</u>") {
        return cx.addDelimiter(UnderlineDelim, pos, pos + 4, false, true);
      }
      return -1;
    },
    before: "HTMLTag",
  }],
};

export const NOTE_MARKDOWN_EXTENSIONS = [GFM, Highlight, Underline];

export const noteMarkdownParser = commonmarkParser.configure(NOTE_MARKDOWN_EXTENSIONS);

// Inline node name -> the shared `nt-*` class both renderers paint it with.
export const INLINE_STYLE_CLASSES = Object.freeze({
  StrongEmphasis: "nt-bold",
  Emphasis: "nt-italic",
  Strikethrough: "nt-strike",
  Highlight: "nt-highlight",
  Underline: "nt-underline",
  InlineCode: "nt-code",
  Link: "nt-link",
  Autolink: "nt-link",
  URL: "nt-link",
});

// Syntax-only nodes: hidden in the canvas render, hidden off the active
// line/span in the editor.
export const MARK_NODE_NAMES = new Set([
  "EmphasisMark",
  "StrikethroughMark",
  "HighlightMark",
  "UnderlineMark",
  "CodeMark",
  "LinkMark",
  "HeaderMark",
  "QuoteMark",
  "ListMark",
  "TaskMarker",
]);

export function headingLevel(nodeName) {
  const match = /^(?:ATX|Setext)Heading(\d)$/.exec(nodeName);
  return match ? Number(match[1]) : 0;
}

export function isTaskChecked(markerText) {
  return /^\[[xX]\]$/.test(markerText);
}
