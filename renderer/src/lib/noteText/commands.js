import { syntaxTree } from "@codemirror/language";
import { EditorSelection, MapMode, StateEffect, StateField } from "@codemirror/state";

// Editing commands for the shared note editor: inline toggles (bold, italic,
// ...), block types (heading, task, list, ...), code blocks, dividers, list
// indent/outdent and the "/" slash menu's state. Every command is a plain
// CodeMirror command `(view) => boolean` writing raw markdown, so undo/redo
// and the live preview just work on top of them.

// ---------- Inline ----------

export const INLINE_FORMATS = Object.freeze({
  bold: { node: "StrongEmphasis", open: "**", close: "**" },
  italic: { node: "Emphasis", open: "*", close: "*" },
  underline: { node: "Underline", open: "<u>", close: "</u>" },
  strike: { node: "Strikethrough", open: "~~", close: "~~" },
  highlight: { node: "Highlight", open: "==", close: "==" },
  code: { node: "InlineCode", open: "`", close: "`" },
});

const INLINE_MARK_NAMES = new Set(["EmphasisMark", "StrikethroughMark", "HighlightMark", "UnderlineMark", "CodeMark"]);

function findEnclosing(state, from, to, nodeName) {
  const tree = syntaxTree(state);
  for (const [pos, side] of [[from, 1], [to, -1]]) {
    for (let node = tree.resolveInner(pos, side); node; node = node.parent) {
      if (node.name === nodeName && node.from <= from && node.to >= to) {
        return node;
      }
    }
  }
  return null;
}

export function isFormatActive(state, kind) {
  const { from, to } = state.selection.main;
  if (kind === "link") {
    return Boolean(findEnclosing(state, from, to, "Link"));
  }
  if (kind === "codeBlock") {
    return Boolean(findEnclosing(state, from, to, "FencedCode"));
  }
  const format = INLINE_FORMATS[kind];
  return format ? Boolean(findEnclosing(state, from, to, format.node)) : false;
}

function trimRange(doc, from, to) {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(doc.sliceString(start, start + 1))) {
    start += 1;
  }
  while (end > start && /\s/.test(doc.sliceString(end - 1, end))) {
    end -= 1;
  }
  return { start, end };
}

export function toggleInline(kind) {
  const format = INLINE_FORMATS[kind];
  return (view) => {
    const { state } = view;
    const { from, to } = state.selection.main;
    const existing = findEnclosing(state, from, to, format.node);

    if (existing) {
      const marks = [];
      for (let child = existing.firstChild; child; child = child.nextSibling) {
        if (INLINE_MARK_NAMES.has(child.name)) {
          marks.push(child);
        }
      }
      const open = marks[0];
      const close = marks[marks.length - 1];
      if (!open || open === close) {
        return false;
      }
      view.dispatch({
        changes: [{ from: open.from, to: open.to }, { from: close.from, to: close.to }],
        userEvent: "input.format",
      });
      return true;
    }

    view.dispatch(state.changeByRange((range) => {
      const { start, end } = range.empty
        ? { start: range.from, end: range.to }
        : trimRange(state.doc, range.from, range.to);
      return {
        changes: [{ from: start, insert: format.open }, { from: end, insert: format.close }],
        range: EditorSelection.range(start + format.open.length, end + format.open.length),
      };
    }), { userEvent: "input.format", scrollIntoView: true });
    return true;
  };
}

export function toggleLink(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const existing = findEnclosing(state, from, to, "Link");

  if (existing) {
    let labelFrom = -1;
    let labelTo = -1;
    for (let child = existing.firstChild; child; child = child.nextSibling) {
      const text = state.doc.sliceString(child.from, child.to);
      if (child.name === "LinkMark" && text === "[") {
        labelFrom = child.to;
      } else if (child.name === "LinkMark" && text === "]") {
        labelTo = child.from;
        break;
      }
    }
    if (labelFrom < 0 || labelTo < 0) {
      return false;
    }
    view.dispatch({
      changes: { from: existing.from, to: existing.to, insert: state.doc.sliceString(labelFrom, labelTo) },
      userEvent: "input.format",
    });
    return true;
  }

  view.dispatch(state.changeByRange((range) => {
    const { start, end } = range.empty ? { start: range.from, end: range.to } : trimRange(state.doc, range.from, range.to);
    const label = state.doc.sliceString(start, end);
    const insert = `[${label}]()`;
    // With a label, park the caret in the (url); without one, in the [label].
    const caret = label ? start + label.length + 3 : start + 1;
    return {
      changes: { from: start, to: end, insert },
      range: EditorSelection.cursor(caret),
    };
  }), { userEvent: "input.format", scrollIntoView: true });
  return true;
}

// ---------- Blocks ----------

const BLOCK_PREFIX_RE = /^(\s*)(?:(#{1,6})\s+|([-*+])\s+\[[ xX]\]\s+|([-*+])\s+|(\d+)[.)]\s+|>\s?)?/;

export function lineBlockType(text) {
  const match = BLOCK_PREFIX_RE.exec(text);
  if (match[2]) {
    return match[2].length <= 3 ? `h${match[2].length}` : "body";
  }
  if (match[3]) {
    return "task";
  }
  if (match[4]) {
    return "bullet";
  }
  if (match[5]) {
    return "ordered";
  }
  return "body";
}

function selectedLines(state) {
  const lines = [];
  const seen = new Set();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number += 1) {
      if (!seen.has(number)) {
        seen.add(number);
        lines.push(state.doc.line(number));
      }
    }
  }
  return lines;
}

export function setBlockType(type) {
  return (view) => {
    const { state } = view;
    const lines = selectedLines(state);
    const allAlready = type !== "body" && lines.every((line) => lineBlockType(line.text) === type);
    const target = allAlready ? "body" : type;
    let ordinal = 0;

    const changes = lines.map((line) => {
      const match = BLOCK_PREFIX_RE.exec(line.text);
      const indent = match[1];
      let prefix = "";
      if (target === "h1" || target === "h2" || target === "h3") {
        prefix = `${"#".repeat(Number(target[1]))} `;
      } else if (target === "task") {
        prefix = `${indent}- [ ] `;
      } else if (target === "bullet") {
        prefix = `${indent}- `;
      } else if (target === "ordered") {
        ordinal += 1;
        prefix = `${indent}${ordinal}. `;
      } else {
        prefix = indent;
      }
      return { from: line.from, to: line.from + match[0].length, insert: prefix };
    });

    const changeSet = state.changes(changes);
    view.dispatch({
      changes: changeSet,
      selection: state.selection.map(changeSet, 1),
      userEvent: "input.format",
      scrollIntoView: true,
    });
    return true;
  };
}

export function toggleCodeBlock(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const existing = findEnclosing(state, from, to, "FencedCode");
  const { doc } = state;

  if (existing) {
    const openLine = doc.lineAt(existing.from);
    const closeLine = doc.lineAt(existing.to);
    const changes = [{ from: openLine.from, to: Math.min(doc.length, openLine.to + 1) }];
    if (closeLine.number !== openLine.number && /^\s*(`{3,}|~{3,})\s*$/.test(closeLine.text)) {
      changes.push({ from: Math.max(0, closeLine.from - 1), to: closeLine.to });
    }
    view.dispatch({ changes, userEvent: "input.format" });
    return true;
  }

  const firstLine = doc.lineAt(from);
  const lastLine = doc.lineAt(to);
  if (firstLine.number === lastLine.number && firstLine.text.trim() === "") {
    view.dispatch({
      changes: { from: firstLine.from, to: firstLine.to, insert: "```\n\n```" },
      selection: EditorSelection.cursor(firstLine.from + 4),
      userEvent: "input.format",
      scrollIntoView: true,
    });
    return true;
  }

  const changeSet = state.changes([
    { from: firstLine.from, insert: "```\n" },
    { from: lastLine.to, insert: "\n```" },
  ]);
  view.dispatch({
    changes: changeSet,
    selection: state.selection.map(changeSet, 1),
    userEvent: "input.format",
    scrollIntoView: true,
  });
  return true;
}

export function insertDivider(view) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const previous = line.number > 1 ? state.doc.line(line.number - 1) : null;
  // A "---" straight under a text line is a setext heading, not a rule, so
  // the rule always gets a blank line above it.
  let insert;
  if (line.text.trim() === "") {
    insert = `${previous && previous.text.trim() !== "" ? "\n" : ""}---\n`;
  } else {
    insert = `${line.text}\n\n---\n`;
  }
  view.dispatch({
    changes: { from: line.from, to: line.to, insert },
    selection: EditorSelection.cursor(line.from + insert.length),
    userEvent: "input.format",
    scrollIntoView: true,
  });
  return true;
}

// ---------- List indent / outdent ----------

const LIST_LINE_RE = /^(\s*)((?:[-*+]|\d+[.)])\s+)/;

function parseListLine(text) {
  const match = LIST_LINE_RE.exec(text);
  return match ? { indent: match[1].length, contentOffset: match[1].length + match[2].length } : null;
}

// CommonMark nests a list item under the previous one only when it's
// indented to that item's *content* column ("- " -> 2, "1. " -> 3), so a
// fixed tab width would silently fail to nest under numbered items.
function shiftListLines(view, direction) {
  const { state } = view;
  const lines = selectedLines(state);
  const parsed = lines.map((line) => parseListLine(line.text));
  if (parsed.some((entry) => !entry)) {
    return false;
  }

  const changes = [];
  lines.forEach((line, index) => {
    const current = parsed[index];
    let target = current.indent;
    for (let number = line.number - 1; number >= 1; number -= 1) {
      const candidate = parseListLine(state.doc.line(number).text);
      if (!candidate) {
        if (state.doc.line(number).text.trim() === "") {
          continue;
        }
        break;
      }
      if (direction > 0 && candidate.indent <= current.indent) {
        target = candidate.indent === current.indent ? candidate.contentOffset : current.indent;
        break;
      }
      if (direction < 0 && candidate.indent < current.indent) {
        target = candidate.indent;
        break;
      }
    }
    if (direction < 0 && target === current.indent) {
      target = 0;
    }
    if (target !== current.indent) {
      changes.push({ from: line.from, to: line.from + current.indent, insert: " ".repeat(target) });
    }
  });

  if (changes.length > 0) {
    view.dispatch({ changes, userEvent: direction > 0 ? "input.indent" : "delete.dedent" });
  }
  return true;
}

export const indentListItem = (view) => shiftListLines(view, 1);
export const outdentListItem = (view) => shiftListLines(view, -1);

const EMPTY_LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])(?:\s+\[[ xX]\])?\s*$/;

// Enter on an empty list item leaves the list straight away (Obsidian-style)
// -- outdenting a nested item first -- instead of lang-markdown's default of
// turning the list loose on the first Enter and exiting on the second.
export function exitEmptyListItem(view) {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty || state.selection.ranges.length > 1) {
    return false;
  }
  const line = state.doc.lineAt(main.head);
  const match = EMPTY_LIST_ITEM_RE.exec(line.text);
  if (!match || main.head !== line.to) {
    return false;
  }
  if (match[1].length > 0) {
    return outdentListItem(view);
  }
  view.dispatch({
    changes: { from: line.from, to: line.to },
    selection: EditorSelection.cursor(line.from),
    userEvent: "delete.list",
  });
  return true;
}

// ---------- Slash menu ----------

export const SLASH_ITEMS = Object.freeze([
  { id: "h1", group: "text", index: "01", label: "Display", hint: "#", keywords: "heading 1 h1 title display", run: setBlockType("h1") },
  { id: "h2", group: "text", index: "02", label: "Headline", hint: "##", keywords: "heading 2 h2 headline", run: setBlockType("h2") },
  { id: "h3", group: "text", index: "03", label: "Subheader", hint: "###", keywords: "heading 3 h3 subheader subheading", run: setBlockType("h3") },
  { id: "body", group: "text", index: "04", label: "Body", shortcut: "Mod-4", keywords: "body text paragraph plain", run: setBlockType("body") },
  { id: "task", group: "block", icon: "task", label: "Task", shortcut: "Mod-t", keywords: "task todo checkbox check", run: setBlockType("task") },
  { id: "bullet", group: "block", icon: "list", label: "List", shortcut: "Mod-l", keywords: "list bullet unordered", run: setBlockType("bullet") },
  { id: "ordered", group: "block", icon: "ordered", label: "Number list", shortcut: "Shift-Mod-l", keywords: "number numbered ordered list", run: setBlockType("ordered") },
  { id: "code", group: "block", icon: "code", label: "Code block", shortcut: "Shift-Mod-c", keywords: "code block fence snippet", run: toggleCodeBlock },
  { id: "divider", group: "block", icon: "divider", label: "Divider", hint: "---", keywords: "divider rule line separator hr", run: insertDivider },
]);

export function filterSlashItems(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return SLASH_ITEMS;
  }
  const scored = [];
  for (const item of SLASH_ITEMS) {
    const label = item.label.toLowerCase();
    if (label.startsWith(needle)) {
      scored.push([0, item]);
    } else if (label.includes(needle) || item.keywords.split(" ").some((word) => word.startsWith(needle))) {
      scored.push([1, item]);
    }
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, item]) => item);
}

export const closeSlashMenu = StateEffect.define();
export const setSlashIndex = StateEffect.define();

// { from, query, index } while the menu is open, null otherwise. `from` is
// the position of the "/" that opened it; the query is the text typed after.
export const slashMenuField = StateField.define({
  create: () => null,
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(closeSlashMenu)) {
        return null;
      }
      if (effect.is(setSlashIndex) && next) {
        next = { ...next, index: effect.value };
      }
    }

    const { doc } = tr.state;
    if (!next) {
      if (!tr.docChanged || !tr.isUserEvent("input.type")) {
        return null;
      }
      let opened = null;
      // Usually a lone "/" keystroke, but IME/autocorrect can batch several
      // typed characters into one insertion ("/ta"), so accept a prefix.
      tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        const text = inserted.toString();
        if (!/^\/[^\n/]{0,24}$/.test(text)) {
          return;
        }
        const line = doc.lineAt(fromB);
        const query = text.slice(1);
        if (/^\s*$/.test(doc.sliceString(line.from, fromB)) && filterSlashItems(query).length > 0) {
          opened = { from: fromB, query, index: 0 };
        }
      });
      return opened;
    }

    let from = next.from;
    if (tr.docChanged) {
      from = tr.changes.mapPos(next.from, 1, MapMode.TrackDel);
      if (from === null) {
        return null;
      }
    }
    const selection = tr.state.selection.main;
    const line = doc.lineAt(from);
    if (doc.sliceString(from, from + 1) !== "/" || !selection.empty || selection.head <= from || selection.head > line.to) {
      return null;
    }
    const query = doc.sliceString(from + 1, selection.head);
    if (query.length > 24 || /\s\s/.test(query) || filterSlashItems(query).length === 0) {
      return null;
    }
    return { from, query, index: query === next.query ? next.index : 0 };
  },
});

export function runSlashItem(view, item) {
  const menu = view.state.field(slashMenuField, false);
  if (menu) {
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: menu.from, to: head },
      effects: closeSlashMenu.of(null),
      userEvent: "delete.slash",
    });
  }
  item.run(view);
  view.focus();
}

function moveSlash(delta) {
  return (view) => {
    const menu = view.state.field(slashMenuField, false);
    if (!menu) {
      return false;
    }
    const count = filterSlashItems(menu.query).length;
    view.dispatch({ effects: setSlashIndex.of((menu.index + delta + count) % count) });
    return true;
  };
}

function acceptSlash(view) {
  const menu = view.state.field(slashMenuField, false);
  if (!menu) {
    return false;
  }
  const item = filterSlashItems(menu.query)[menu.index];
  if (!item) {
    return false;
  }
  runSlashItem(view, item);
  return true;
}

function dismissSlash(view) {
  if (!view.state.field(slashMenuField, false)) {
    return false;
  }
  view.dispatch({ effects: closeSlashMenu.of(null) });
  return true;
}

export const slashMenuKeymap = [
  { key: "ArrowDown", run: moveSlash(1) },
  { key: "ArrowUp", run: moveSlash(-1) },
  { key: "Enter", run: acceptSlash },
  { key: "Tab", run: acceptSlash },
  { key: "Escape", run: dismissSlash },
];

// ---------- Shortcut display ----------

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

export function formatShortcut(key) {
  if (!key) {
    return "";
  }
  const parts = key.split("-");
  const base = parts.pop().toUpperCase();
  if (IS_MAC) {
    const symbols = { Shift: "⇧", Mod: "⌘", Alt: "⌥", Ctrl: "⌃" };
    return `${parts.map((part) => symbols[part] ?? part).join("")} ${base}`;
  }
  const names = { Mod: "Ctrl", Alt: "Alt", Shift: "Shift", Ctrl: "Ctrl" };
  const order = ["Mod", "Ctrl", "Alt", "Shift"];
  const sorted = [...parts].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...sorted.map((part) => names[part] ?? part), base].join("+");
}
