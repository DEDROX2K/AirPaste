import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { commonmarkLanguage, markdown } from "@codemirror/lang-markdown";
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import {
  INLINE_STYLE_CLASSES,
  NOTE_MARKDOWN_EXTENSIONS,
  headingLevel,
  isTaskChecked,
} from "./markdown";

// Obsidian-style "live preview" for CodeMirror 6, driven by the Lezer
// markdown syntax tree (see ./markdown.js for the dialect).
//
// Reveal rules:
// - Block markup (#, >, list markers, task boxes, ---, ``` fences) is hidden
//   unless the selection touches that line (fences: that block).
// - Inline markup (**, *, ~~, ==, <u>, `, [..](..)) is hidden unless the
//   selection touches that span.
//
// computeLivePreview() is a pure function from editor state to a flat list
// of decoration descriptors so the markdown -> decoration mapping can be unit
// tested without a DOM; the view plugin below only turns descriptors into
// real CodeMirror decorations for the visible viewport.

export function noteMarkdownLanguage() {
  return markdown({
    base: commonmarkLanguage,
    extensions: NOTE_MARKDOWN_EXTENSIONS,
    addKeymap: false,
  });
}

const SIMPLE_INLINE_NODES = new Set(["StrongEmphasis", "Emphasis", "Strikethrough", "Highlight", "Underline"]);
const INLINE_MARK_NAMES = new Set(["EmphasisMark", "StrikethroughMark", "HighlightMark", "UnderlineMark"]);
const LIST_NAMES = new Set(["BulletList", "OrderedList"]);
const MARKUP_CLASS = "nt-markup";

function directChildren(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function listDepth(node) {
  let depth = 0;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (LIST_NAMES.has(parent.name)) {
      depth += 1;
    }
  }
  return depth;
}

export function computeLivePreview(state, ranges = [{ from: 0, to: state.doc.length }], { focused = true } = {}) {
  const { doc } = state;
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const selection = state.selection.main;
  const selFromLine = doc.lineAt(selection.from).number;
  const selToLine = doc.lineAt(selection.to).number;
  const out = [];
  const seen = new Set();

  const push = (descriptor) => {
    const key = `${descriptor.type}|${descriptor.from}|${descriptor.to ?? ""}|${descriptor.className ?? descriptor.widget?.kind ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(descriptor);
    }
  };
  const lineActive = (pos) => {
    const number = doc.lineAt(pos).number;
    return number >= selFromLine && number <= selToLine;
  };
  const spanActive = (from, to) => selection.from <= to && selection.to >= from;
  const line = (pos, className, style) => {
    push({ type: "line", from: doc.lineAt(pos).from, className, ...(style ? { style } : {}) });
  };
  const hide = (from, to) => {
    if (to > from) {
      push({ type: "hide", from, to });
    }
  };
  const mark = (from, to, className) => {
    if (to > from) {
      push({ type: "mark", from, to, className });
    }
  };
  const skipSpaces = (pos, limit) => {
    let end = pos;
    while (end < limit && doc.sliceString(end, end + 1) === " ") {
      end += 1;
    }
    return end;
  };

  const handlers = {
    HeaderMark(node) {
      const parent = node.node.parent;
      const level = parent ? headingLevel(parent.name) : 0;
      if (!level || lineActive(node.from)) {
        if (level) {
          mark(node.from, node.to, MARKUP_CLASS);
        }
        return;
      }
      if (parent.name.startsWith("Setext")) {
        line(node.from, "nt-line-setext-underline");
        hide(node.from, node.to);
        return;
      }
      if (node.from === parent.from) {
        hide(node.from, skipSpaces(node.to, parent.to));
      } else {
        // Optional closing #'s: hide them and the spaces before them.
        let start = node.from;
        while (start > parent.from && doc.sliceString(start - 1, start) === " ") {
          start -= 1;
        }
        hide(start, node.to);
      }
    },

    QuoteMark(node) {
      line(node.from, "nt-line-quote");
      if (lineActive(node.from)) {
        mark(node.from, node.to, MARKUP_CLASS);
      } else {
        const lineEnd = doc.lineAt(node.from).to;
        hide(node.from, Math.min(lineEnd, node.to + (doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0)));
      }
    },

    InlineCode(node) {
      const marks = directChildren(node.node).filter((child) => child.name === "CodeMark");
      const open = marks[0];
      const close = marks.length > 1 ? marks[marks.length - 1] : null;
      if (!open || !close) {
        return;
      }
      if (spanActive(node.from, node.to)) {
        mark(node.from, node.to, INLINE_STYLE_CLASSES.InlineCode);
        mark(open.from, open.to, MARKUP_CLASS);
        mark(close.from, close.to, MARKUP_CLASS);
      } else {
        hide(open.from, open.to);
        mark(open.to, close.from, INLINE_STYLE_CLASSES.InlineCode);
        hide(close.from, close.to);
      }
    },

    Link(node) {
      const children = directChildren(node.node);
      const linkMarks = children.filter((child) => child.name === "LinkMark");
      const hasTarget = children.some((child) => child.name === "URL" || child.name === "LinkLabel")
        || linkMarks.some((child) => doc.sliceString(child.from, child.to) === "(");
      const open = linkMarks[0];
      const close = linkMarks.find((child) => doc.sliceString(child.from, child.to) === "]");
      if (!hasTarget || !open || !close || doc.sliceString(open.from, open.to) !== "[") {
        return;
      }
      mark(open.to, close.from, INLINE_STYLE_CLASSES.Link);
      if (spanActive(node.from, node.to)) {
        mark(open.from, open.to, MARKUP_CLASS);
        mark(close.from, node.to, MARKUP_CLASS);
      } else {
        hide(node.from, open.to);
        hide(close.from, node.to);
      }
    },

    Autolink(node) {
      const active = spanActive(node.from, node.to);
      for (const child of directChildren(node.node)) {
        if (child.name === "LinkMark") {
          if (active) {
            mark(child.from, child.to, MARKUP_CLASS);
          } else {
            hide(child.from, child.to);
          }
        }
      }
    },

    Escape(node) {
      if (!spanActive(node.from, node.to)) {
        hide(node.from, node.from + 1);
      }
    },

    URL(node) {
      if (node.node.parent?.name !== "Link") {
        mark(node.from, node.to, INLINE_STYLE_CLASSES.URL);
      }
    },

    ListItem(node) {
      const listNode = node.node.parent;
      const children = directChildren(node.node);
      const listMark = children[0]?.name === "ListMark" ? children[0] : null;
      if (!listMark || !listNode) {
        return;
      }
      const depth = listDepth(node.node);
      const ordered = listNode.name === "OrderedList";
      const task = children.find((child) => child.name === "Task");
      const taskMarker = task?.firstChild?.name === "TaskMarker" ? task.firstChild : null;
      const checked = taskMarker ? isTaskChecked(doc.sliceString(taskMarker.from, taskMarker.to)) : false;
      const itemLine = doc.lineAt(node.from);

      let lineClass = "nt-line-li";
      if (taskMarker) {
        lineClass += checked ? " nt-line-task nt-line-task-done" : " nt-line-task";
      }
      line(node.from, lineClass, `--nt-li-depth: ${depth}`);

      if (lineActive(node.from)) {
        mark(listMark.from, listMark.to, MARKUP_CLASS);
        if (taskMarker) {
          mark(taskMarker.from, taskMarker.to, MARKUP_CLASS);
        }
        return;
      }

      // The widget swallows the item's own indentation too (it draws the
      // indent itself) -- but never reaches back past a container's markup,
      // e.g. the "> " of a list inside a quote.
      let widgetFrom = listMark.from;
      while (widgetFrom > itemLine.from && doc.sliceString(widgetFrom - 1, widgetFrom) === " ") {
        widgetFrom -= 1;
      }
      const markerEnd = taskMarker ? taskMarker.to : listMark.to;
      const widgetTo = Math.min(itemLine.to, markerEnd + (doc.sliceString(markerEnd, markerEnd + 1) === " " ? 1 : 0));
      push({
        type: "widget",
        from: widgetFrom,
        to: widgetTo,
        widget: {
          kind: taskMarker ? "task" : ordered ? "ordered" : "bullet",
          depth,
          checked,
          label: ordered ? doc.sliceString(listMark.from, listMark.to) : "",
        },
      });
    },

    FencedCode(node, range) {
      const startLine = doc.lineAt(node.from);
      const endLine = doc.lineAt(node.to);
      const marks = directChildren(node.node).filter((child) => child.name === "CodeMark");
      const closed = marks.length > 1;
      const active = spanActive(node.from, node.to);
      const firstVisible = Math.max(startLine.number, doc.lineAt(Math.max(range.from, node.from)).number);
      const lastVisible = Math.min(endLine.number, doc.lineAt(Math.min(range.to, node.to)).number);

      for (let number = firstVisible; number <= lastVisible; number += 1) {
        const { from, to } = doc.line(number);
        let className = "nt-line-codeblock";
        if (number === startLine.number) {
          className += " nt-line-codeblock-start";
          if (!active) {
            className += " nt-line-codeblock-fence";
            hide(from, to);
          }
        }
        if (number === endLine.number && closed && number !== startLine.number) {
          className += " nt-line-codeblock-end";
          if (!active) {
            className += " nt-line-codeblock-fence";
            hide(from, to);
          }
        }
        line(from, className);
      }
      return false;
    },

    CodeBlock(node, range) {
      const first = doc.lineAt(Math.max(node.from, range.from)).number;
      const last = doc.lineAt(Math.min(node.to, range.to)).number;
      for (let number = first; number <= last; number += 1) {
        line(doc.line(number).from, "nt-line-codeblock");
      }
      return false;
    },

    HorizontalRule(node) {
      if (!lineActive(node.from)) {
        line(node.from, "nt-line-hr");
        hide(node.from, node.to);
      }
    },

    Table(node, range) {
      const first = doc.lineAt(Math.max(node.from, range.from)).number;
      const last = doc.lineAt(Math.min(node.to, range.to)).number;
      for (let number = first; number <= last; number += 1) {
        line(doc.line(number).from, "nt-line-table");
      }
      return false;
    },
  };

  // Spellcheck squiggles only on the line being written: every other line
  // (all of them while the editor is blurred) opts out of spellcheck, and
  // Chromium drops a line's markers the moment its attribute flips off.
  for (const range of ranges) {
    const lastLine = doc.lineAt(range.to).number;
    for (let number = doc.lineAt(range.from).number; number <= lastLine; number += 1) {
      if (!focused || number < selFromLine || number > selToLine) {
        push({ type: "line", from: doc.line(number).from, className: "nt-line-quiet", attributes: { spellcheck: "false" } });
      }
    }
  }

  for (const range of ranges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        const level = headingLevel(node.name);
        if (level) {
          if (node.name.startsWith("Setext")) {
            const lastLine = doc.lineAt(node.to).number;
            for (let number = doc.lineAt(node.from).number; number < lastLine; number += 1) {
              line(doc.line(number).from, `nt-line-heading nt-line-heading-${level}`);
            }
          } else {
            line(node.from, `nt-line-heading nt-line-heading-${level}`);
          }
          return undefined;
        }

        if (SIMPLE_INLINE_NODES.has(node.name)) {
          const active = spanActive(node.from, node.to);
          mark(node.from, node.to, INLINE_STYLE_CLASSES[node.name]);
          for (const child of directChildren(node.node)) {
            if (INLINE_MARK_NAMES.has(child.name)) {
              if (active) {
                mark(child.from, child.to, MARKUP_CLASS);
              } else {
                hide(child.from, child.to);
              }
            }
          }
          return undefined;
        }

        const handler = handlers[node.name];
        return handler ? handler(node, range) : undefined;
      },
    });
  }

  return out;
}

// ---------- Widgets ----------

const TASK_LINE_RE = /^(\s*(?:>\s?)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;

export function toggleTaskAtLine(view, linePos) {
  const line = view.state.doc.lineAt(linePos);
  const match = TASK_LINE_RE.exec(line.text);
  if (!match) {
    return false;
  }
  const at = line.from + match[1].length + 1;
  view.dispatch({
    changes: { from: at, to: at + 1, insert: match[2] === " " ? "x" : " " },
    userEvent: "input.toggle",
  });
  return true;
}

class ListMarkerWidget extends WidgetType {
  constructor(spec) {
    super();
    this.spec = spec;
  }

  eq(other) {
    const a = this.spec;
    const b = other.spec;
    return a.kind === b.kind && a.depth === b.depth && a.checked === b.checked && a.label === b.label;
  }

  toDOM(view) {
    const { kind, depth, checked, label } = this.spec;
    const wrap = document.createElement("span");
    wrap.className = `nt-marker nt-marker--${kind}`;
    wrap.style.setProperty("--nt-li-depth", String(depth));
    wrap.setAttribute("aria-hidden", kind === "task" ? "false" : "true");

    if (kind === "task") {
      const box = document.createElement("span");
      box.className = `nt-checkbox${checked ? " nt-checkbox--checked" : ""}`;
      box.setAttribute("role", "checkbox");
      box.setAttribute("aria-checked", checked ? "true" : "false");
      box.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleTaskAtLine(view, view.posAtDOM(wrap));
      });
      wrap.appendChild(box);
    } else if (kind === "ordered") {
      const ordinal = document.createElement("span");
      ordinal.className = "nt-ordinal";
      ordinal.textContent = label;
      wrap.appendChild(ordinal);
    } else {
      const bullet = document.createElement("span");
      bullet.className = "nt-bullet";
      wrap.appendChild(bullet);
    }
    return wrap;
  }

  ignoreEvent(event) {
    return this.spec.kind === "task" && event.type === "mousedown";
  }
}

function descriptorsToDecorations(descriptors) {
  const ranges = descriptors.map((descriptor) => {
    switch (descriptor.type) {
      case "line":
        return Decoration.line({
          class: descriptor.className,
          attributes: {
            ...(descriptor.style ? { style: descriptor.style } : {}),
            ...descriptor.attributes,
          },
        }).range(descriptor.from);
      case "hide":
        return Decoration.replace({}).range(descriptor.from, descriptor.to);
      case "widget":
        return Decoration.replace({ widget: new ListMarkerWidget(descriptor.widget) }).range(descriptor.from, descriptor.to);
      default:
        return Decoration.mark({ class: descriptor.className }).range(descriptor.from, descriptor.to);
    }
  });
  return Decoration.set(ranges, true);
}

export const livePreviewPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = descriptorsToDecorations(computeLivePreview(view.state, view.visibleRanges, { focused: view.hasFocus }));
  }

  update(update) {
    // Never swap decorations out from under an IME composition -- just keep
    // the existing ones aligned with the text until it commits.
    if (update.view.composing) {
      this.decorations = this.decorations.map(update.changes);
      return;
    }
    if (
      update.docChanged
      || update.selectionSet
      || update.viewportChanged
      || update.focusChanged
      || syntaxTree(update.startState) !== syntaxTree(update.state)
    ) {
      this.decorations = descriptorsToDecorations(
        computeLivePreview(update.state, update.view.visibleRanges, { focused: update.view.hasFocus }),
      );
    }
  }
}, {
  decorations: (plugin) => plugin.decorations,
});
