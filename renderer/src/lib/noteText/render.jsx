import {
  INLINE_STYLE_CLASSES,
  MARK_NODE_NAMES,
  headingLevel,
  isTaskChecked,
  noteMarkdownParser,
} from "./markdown";

// Read-only render of a note body (canvas previews, tiles not being edited),
// walking the exact same Lezer tree the live-preview editor decorates and
// painting it with the same `nt-*` classes -- so a note looks the same
// whether or not it's being edited, with the caret elsewhere.
//
// Mirrors the editor's line-based layout on purpose: blocks have no margins
// of their own, every blank source line becomes one blank line of space, and
// nested list items are flattened into rows indented by depth (the editor
// draws each list line on its own, indented the same way).

const LIST_NAMES = new Set(["BulletList", "OrderedList"]);
const SKIP_BLOCK_NAMES = new Set(["QuoteMark", "ListMark", "LinkReference"]);

function childrenOf(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function countNewlines(text) {
  let count = 0;
  for (const char of text) {
    if (char === "\n") {
      count += 1;
    }
  }
  return count;
}

function pushGaps(out, src, prevEnd, nextFrom, key) {
  if (prevEnd === null) {
    return;
  }
  const blankLines = countNewlines(src.slice(prevEnd, nextFrom)) - 1;
  for (let index = 0; index < blankLines; index += 1) {
    out.push(<div key={`${key}-gap${index}`} className="nt-gap" />);
  }
}

// ---------- Inline ----------

function renderInlineRange(node, src, from, to, key) {
  const out = [];
  let pos = from;
  let index = 0;
  for (const child of childrenOf(node)) {
    if (child.to <= from || child.from >= to) {
      continue;
    }
    if (child.from > pos) {
      out.push(src.slice(pos, child.from));
    }
    const rendered = renderInlineNode(child, src, `${key}.${index}`);
    if (rendered !== null) {
      out.push(rendered);
    }
    index += 1;
    pos = Math.max(pos, child.to);
  }
  if (pos < to) {
    out.push(src.slice(pos, to));
  }
  return out;
}

function renderInlineNode(node, src, key) {
  const { name } = node;
  if (MARK_NODE_NAMES.has(name)) {
    return null;
  }

  switch (name) {
    case "StrongEmphasis":
    case "Emphasis":
    case "Strikethrough":
    case "Highlight":
    case "Underline":
      return (
        <span key={key} className={INLINE_STYLE_CLASSES[name]}>
          {renderInlineRange(node, src, node.from, node.to, key)}
        </span>
      );
    case "InlineCode": {
      const marks = childrenOf(node).filter((child) => child.name === "CodeMark");
      const from = marks[0]?.to ?? node.from;
      const to = marks.length > 1 ? marks[marks.length - 1].from : node.to;
      return <code key={key} className={INLINE_STYLE_CLASSES.InlineCode}>{src.slice(from, to)}</code>;
    }
    case "Link": {
      const children = childrenOf(node);
      const open = children.find((child) => child.name === "LinkMark" && src.slice(child.from, child.to) === "[");
      const close = children.find((child) => child.name === "LinkMark" && src.slice(child.from, child.to) === "]");
      const hasTarget = children.some((child) => child.name === "URL" || child.name === "LinkLabel"
        || (child.name === "LinkMark" && src.slice(child.from, child.to) === "("));
      if (!open || !close || !hasTarget) {
        return renderInlineRange(node, src, node.from, node.to, key);
      }
      return (
        <span key={key} className={INLINE_STYLE_CLASSES.Link}>
          {renderInlineRange(node, src, open.to, close.from, key)}
        </span>
      );
    }
    case "Autolink":
    case "URL": {
      const url = name === "URL" ? node : childrenOf(node).find((child) => child.name === "URL");
      return <span key={key} className={INLINE_STYLE_CLASSES.URL}>{src.slice(url?.from ?? node.from, url?.to ?? node.to)}</span>;
    }
    case "Escape":
      return src.slice(node.from + 1, node.to);
    case "HardBreak":
      return <br key={key} />;
    default:
      return node.firstChild
        ? renderInlineRange(node, src, node.from, node.to, key)
        : src.slice(node.from, node.to);
  }
}

function trimEdges(parts) {
  const out = [...parts];
  if (typeof out[0] === "string") {
    out[0] = out[0].replace(/^\s+/, "");
  }
  const last = out.length - 1;
  if (typeof out[last] === "string") {
    out[last] = out[last].replace(/\s+$/, "");
  }
  return out;
}

// ---------- Blocks ----------

function renderListItems(listNode, src, depth, key, out, state) {
  const ordered = listNode.name === "OrderedList";
  childrenOf(listNode).forEach((item, itemIndex) => {
    if (item.name !== "ListItem") {
      return;
    }
    const itemKey = `${key}.${itemIndex}`;
    pushGaps(out, src, state.prevEnd, item.from, itemKey);

    const children = childrenOf(item);
    const listMark = children.find((child) => child.name === "ListMark");
    const task = children.find((child) => child.name === "Task");
    const taskMarker = task?.firstChild?.name === "TaskMarker" ? task.firstChild : null;
    const checked = taskMarker ? isTaskChecked(src.slice(taskMarker.from, taskMarker.to)) : false;
    const lead = task ?? children.find((child) => child.name === "Paragraph");

    let marker;
    if (taskMarker) {
      marker = <span className={`nt-checkbox${checked ? " nt-checkbox--checked" : ""}`} />;
    } else if (ordered) {
      marker = <span className="nt-ordinal">{listMark ? src.slice(listMark.from, listMark.to) : ""}</span>;
    } else {
      marker = <span className="nt-bullet" />;
    }

    const kind = taskMarker ? "task" : ordered ? "ordered" : "bullet";
    let rowClass = "nt-li";
    if (taskMarker) {
      rowClass += checked ? " nt-task nt-task-done" : " nt-task";
    }

    out.push(
      <div key={itemKey} className={rowClass} style={{ "--nt-li-depth": depth }}>
        <span className={`nt-marker nt-marker--${kind}`} style={{ "--nt-li-depth": depth }}>{marker}</span>
        {lead ? trimEdges(renderInlineRange(lead, src, lead.from, lead.to, itemKey)) : null}
      </div>,
    );
    state.prevEnd = lead ? lead.to : (listMark?.to ?? item.from);

    children.forEach((child, childIndex) => {
      if (child === lead || child.name === "ListMark") {
        return;
      }
      const childKey = `${itemKey}.${childIndex}`;
      if (LIST_NAMES.has(child.name)) {
        renderListItems(child, src, depth + 1, childKey, out, state);
        return;
      }
      pushGaps(out, src, state.prevEnd, child.from, childKey);
      out.push(
        <div key={childKey} className="nt-li-continuation" style={{ "--nt-li-depth": depth }}>
          {renderBlock(child, src, childKey)}
        </div>,
      );
      state.prevEnd = child.to;
    });
  });
}

function fencedCodeText(node, src) {
  const firstLineEnd = src.indexOf("\n", node.from);
  if (firstLineEnd < 0 || firstLineEnd >= node.to) {
    return "";
  }
  const marks = childrenOf(node).filter((child) => child.name === "CodeMark");
  const closed = marks.length > 1;
  const end = closed ? src.lastIndexOf("\n", marks[marks.length - 1].from) : node.to;
  return end > firstLineEnd ? src.slice(firstLineEnd + 1, end) : "";
}

function renderBlock(node, src, key) {
  const level = headingLevel(node.name);
  if (level) {
    const marks = childrenOf(node).filter((child) => child.name === "HeaderMark");
    const isSetext = node.name.startsWith("Setext");
    const to = isSetext && marks.length > 0 ? marks[marks.length - 1].from : node.to;
    return (
      <div key={key} className={`nt-h nt-h${Math.min(level, 4)}`}>
        {trimEdges(renderInlineRange(node, src, node.from, to, key))}
      </div>
    );
  }

  switch (node.name) {
    case "Paragraph":
      return <div key={key} className="nt-p">{renderInlineRange(node, src, node.from, node.to, key)}</div>;
    case "BulletList":
    case "OrderedList": {
      const rows = [];
      renderListItems(node, src, 1, key, rows, { prevEnd: null });
      return <div key={key} className="nt-list">{rows}</div>;
    }
    case "Blockquote":
      return <div key={key} className="nt-quote">{renderBlocks(node, src, key)}</div>;
    case "FencedCode":
      return <pre key={key} className="nt-codeblock"><code>{fencedCodeText(node, src)}</code></pre>;
    case "CodeBlock":
      return (
        <pre key={key} className="nt-codeblock">
          <code>{src.slice(node.from, node.to).replace(/^ {4}/gm, "")}</code>
        </pre>
      );
    case "HorizontalRule":
      return <div key={key} className="nt-hr" role="separator" />;
    case "Table":
      return <pre key={key} className="nt-table">{src.slice(node.from, node.to)}</pre>;
    default:
      return <div key={key} className="nt-p">{src.slice(node.from, node.to)}</div>;
  }
}

function renderBlocks(parent, src, keyPrefix) {
  const out = [];
  let prevEnd = null;
  childrenOf(parent).forEach((child, index) => {
    if (SKIP_BLOCK_NAMES.has(child.name)) {
      return;
    }
    const key = `${keyPrefix}.${index}`;
    pushGaps(out, src, prevEnd, child.from, key);
    out.push(renderBlock(child, src, key));
    prevEnd = child.to;
  });
  return out;
}

export function renderNoteMarkdown(text) {
  const src = typeof text === "string" ? text : "";
  if (!src.trim()) {
    return null;
  }
  const tree = noteMarkdownParser.parse(src);
  return renderBlocks(tree.topNode, src, "pn");
}
