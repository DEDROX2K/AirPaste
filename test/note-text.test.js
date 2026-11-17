import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorSelection, EditorState } from "@codemirror/state";
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { computeLivePreview, noteMarkdownLanguage, toggleTaskAtLine } from "../renderer/src/lib/noteText/livePreview.js";
import {
  exitEmptyListItem,
  filterSlashItems,
  indentListItem,
  insertDivider,
  isFormatActive,
  outdentListItem,
  runSlashItem,
  setBlockType,
  slashMenuField,
  toggleCodeBlock,
  toggleInline,
  toggleLink,
} from "../renderer/src/lib/noteText/commands.js";
import { renderNoteMarkdown } from "../renderer/src/lib/noteText/render.jsx";

// `cursor` may be a number (caret) or [anchor, head]. Defaults to the very
// end of a trailing "\n" line so no content line is active.
function stateFor(doc, cursor) {
  const selection = Array.isArray(cursor)
    ? EditorSelection.single(cursor[0], cursor[1])
    : EditorSelection.cursor(cursor ?? doc.length);
  return EditorState.create({ doc, selection, extensions: [noteMarkdownLanguage(), slashMenuField] });
}

function inactive(doc) {
  return stateFor(`${doc}\n`);
}

// Minimal stand-in for EditorView: commands only touch state/dispatch.
function fakeView(state) {
  const view = {
    state,
    dispatch: (...specs) => {
      view.state = view.state.update(...specs).state;
    },
    focus() {},
  };
  return view;
}

function hidden(state, descriptors = computeLivePreview(state)) {
  return descriptors
    .filter((d) => d.type === "hide")
    .map((d) => state.doc.sliceString(d.from, d.to))
    .sort();
}

function marks(state, className, descriptors = computeLivePreview(state)) {
  return descriptors
    .filter((d) => d.type === "mark" && d.className === className)
    .map((d) => state.doc.sliceString(d.from, d.to));
}

function lineClasses(descriptors) {
  return descriptors.filter((d) => d.type === "line").map((d) => d.className);
}

function widgets(descriptors) {
  return descriptors.filter((d) => d.type === "widget");
}

describe("paper note live preview: headings", () => {
  it("styles '# Hi' and hides the # once the caret leaves the line", () => {
    const state = inactive("# Hi");
    const descriptors = computeLivePreview(state);
    expect(lineClasses(descriptors)).toContain("nt-line-heading nt-line-heading-1");
    expect(hidden(state, descriptors)).toEqual(["# "]);
  });

  it("reveals the # while the caret is on the heading line", () => {
    const state = stateFor("# Hi\n", 3);
    const descriptors = computeLivePreview(state);
    expect(hidden(state, descriptors)).toEqual([]);
    expect(marks(state, "nt-markup", descriptors)).toEqual(["#"]);
    expect(lineClasses(descriptors)).toContain("nt-line-heading nt-line-heading-1");
  });

  it("handles ## and ###", () => {
    const descriptors = computeLivePreview(inactive("## Two\n### Three"));
    expect(lineClasses(descriptors)).toEqual(expect.arrayContaining([
      "nt-line-heading nt-line-heading-2",
      "nt-line-heading nt-line-heading-3",
    ]));
  });
});

describe("paper note live preview: inline", () => {
  it.each([
    ["**bold**", "nt-bold", "bold", ["**", "**"]],
    ["*it*", "nt-italic", "it", ["*", "*"]],
    ["~~gone~~", "nt-strike", "gone", ["~~", "~~"]],
    ["==hl==", "nt-highlight", "hl", ["==", "=="]],
    ["<u>under</u>", "nt-underline", "under", ["</u>", "<u>"]],
  ])("%s renders styled with its markup hidden", (source, className, text, hiddenMarks) => {
    const state = inactive(`x ${source} y`);
    const descriptors = computeLivePreview(state);
    expect(marks(state, className, descriptors)).toEqual([source]);
    expect(hidden(state, descriptors)).toEqual(hiddenMarks);
    const visible = state.doc.sliceString(0, state.doc.length).replace(hiddenMarks[0], "").replace(hiddenMarks[1], "");
    expect(visible).toContain(text);
  });

  it("hides backticks around inline code and styles only the content when the caret is elsewhere", () => {
    const state = inactive("run `npm test` now");
    const descriptors = computeLivePreview(state);
    expect(marks(state, "nt-code", descriptors)).toEqual(["npm test"]);
    expect(hidden(state, descriptors)).toEqual(["`", "`"]);
  });

  it("reveals backticks only while the caret is inside the code span", () => {
    const inside = stateFor("run `npm test` now", 7);
    expect(hidden(inside)).toEqual([]);
    expect(marks(inside, "nt-markup")).toEqual(["`", "`"]);

    const sameLineOutside = stateFor("run `npm test` now", 18);
    expect(hidden(sameLineOutside)).toEqual(["`", "`"]);
  });

  it("supports nested emphasis like **_x_**", () => {
    const state = inactive("**_x_**");
    const descriptors = computeLivePreview(state);
    expect(marks(state, "nt-bold", descriptors)).toEqual(["**_x_**"]);
    expect(marks(state, "nt-italic", descriptors)).toEqual(["_x_"]);
    expect(hidden(state, descriptors)).toEqual(["**", "**", "_", "_"]);
  });

  it("shows only a link's text", () => {
    const state = inactive("see [docs](https://example.com) here");
    const descriptors = computeLivePreview(state);
    expect(marks(state, "nt-link", descriptors)).toEqual(["docs"]);
    expect(hidden(state, descriptors)).toEqual(["[", "](https://example.com)"]);
  });

  it("hides a quote's > off the active line", () => {
    const state = inactive("> quoted");
    const descriptors = computeLivePreview(state);
    expect(lineClasses(descriptors)).toContain("nt-line-quote");
    expect(hidden(state, descriptors)).toEqual(["> "]);
  });
});

describe("paper note live preview: lists and tasks", () => {
  it("replaces a bullet marker with a bullet widget", () => {
    const state = inactive("- one\n* two\n+ three");
    const found = widgets(computeLivePreview(state));
    expect(found.map((w) => w.widget.kind)).toEqual(["bullet", "bullet", "bullet"]);
    expect(found.map((w) => state.doc.sliceString(w.from, w.to))).toEqual(["- ", "* ", "+ "]);
  });

  it("renders numbered items with their number", () => {
    const state = inactive("1. one\n2. two");
    const found = widgets(computeLivePreview(state));
    expect(found.map((w) => [w.widget.kind, w.widget.label])).toEqual([["ordered", "1."], ["ordered", "2."]]);
  });

  it("tracks nesting depth and swallows the indentation into the marker", () => {
    const state = inactive("- a\n  - b\n    - c");
    const found = widgets(computeLivePreview(state));
    expect(found.map((w) => w.widget.depth)).toEqual([1, 2, 3]);
    expect(found.map((w) => state.doc.sliceString(w.from, w.to))).toEqual(["- ", "  - ", "    - "]);
  });

  it("renders - [ ] and - [x] as checkboxes", () => {
    const state = inactive("- [ ] item\n- [x] done");
    const descriptors = computeLivePreview(state);
    const found = widgets(descriptors);
    expect(found.map((w) => [w.widget.kind, w.widget.checked])).toEqual([["task", false], ["task", true]]);
    expect(found.map((w) => state.doc.sliceString(w.from, w.to))).toEqual(["- [ ] ", "- [x] "]);
    expect(lineClasses(descriptors)).toContain("nt-line-li nt-line-task nt-line-task-done");
  });

  it("shows raw task markdown on the active line", () => {
    const state = stateFor("- [ ] item\n", 8);
    expect(widgets(computeLivePreview(state))).toEqual([]);
  });

  it("clicking a checkbox toggles the source, and undo restores it", async () => {
    const { undo, history } = await import("@codemirror/commands");
    const view = fakeView(EditorState.create({ doc: "- [ ] item", extensions: [noteMarkdownLanguage(), history()] }));
    expect(toggleTaskAtLine(view, 0)).toBe(true);
    expect(view.state.doc.toString()).toBe("- [x] item");
    toggleTaskAtLine(view, 0);
    expect(view.state.doc.toString()).toBe("- [ ] item");
    undo(view);
    expect(view.state.doc.toString()).toBe("- [x] item");
  });

  it("Enter continues a task list and exits on an empty item", () => {
    const view = fakeView(stateFor("- [ ] item"));
    insertNewlineContinueMarkup(view);
    expect(view.state.doc.toString()).toBe("- [ ] item\n- [ ] ");
    expect(exitEmptyListItem(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("- [ ] item\n");
    expect(exitEmptyListItem(view)).toBe(false);
  });

  it("Tab nests under the previous item's content column; Shift+Tab outdents", () => {
    const view = fakeView(stateFor("1. a\n1. b"));
    indentListItem(view);
    expect(view.state.doc.toString()).toBe("1. a\n   1. b");
    outdentListItem(view);
    expect(view.state.doc.toString()).toBe("1. a\n1. b");
  });
});

describe("paper note live preview: blocks", () => {
  it("renders --- as a divider off the active line", () => {
    const state = inactive("text\n\n---\n\nmore");
    const descriptors = computeLivePreview(state);
    expect(lineClasses(descriptors)).toContain("nt-line-hr");
    expect(hidden(state, descriptors)).toEqual(["---"]);
  });

  it("styles fenced code as a block and hides the fences only when the caret is outside it", () => {
    const outside = inactive("```js\nconst a = 1;\n```");
    const outsideDescriptors = computeLivePreview(outside);
    expect(lineClasses(outsideDescriptors).filter((c) => c.startsWith("nt-line-codeblock"))).toHaveLength(3);
    expect(hidden(outside, outsideDescriptors)).toEqual(["```", "```js"]);

    const inside = stateFor("```js\nconst a = 1;\n```\n", 8);
    expect(hidden(inside)).toEqual([]);
  });

  it("only decorates the requested viewport ranges", () => {
    const doc = Array.from({ length: 50 }, (_, i) => `**line ${i}**`).join("\n");
    const state = stateFor(doc, 0);
    const lastLine = state.doc.line(50);
    const descriptors = computeLivePreview(state, [{ from: lastLine.from, to: lastLine.to }]);
    expect(marks(state, "nt-bold", descriptors)).toEqual(["**line 49**"]);
  });
});

describe("paper note live preview: spellcheck", () => {
  function quietLines(state, options) {
    return computeLivePreview(state, undefined, options)
      .filter((d) => d.type === "line" && d.className === "nt-line-quiet")
      .map((d) => state.doc.lineAt(d.from).number);
  }

  it("turns spellcheck off on every line except the one being written", () => {
    const state = stateFor("one\ntwo\nthree", 5);
    expect(quietLines(state)).toEqual([1, 3]);
    const quiet = computeLivePreview(state).find((d) => d.className === "nt-line-quiet");
    expect(quiet.attributes).toEqual({ spellcheck: "false" });
  });

  it("keeps every line in a multi-line selection checked", () => {
    expect(quietLines(stateFor("one\ntwo\nthree", [0, 6]))).toEqual([3]);
  });

  it("quiets every line while the editor is blurred", () => {
    expect(quietLines(stateFor("one\ntwo", 1), { focused: false })).toEqual([1, 2]);
  });
});

describe("paper note commands", () => {
  it("Cmd+B wraps the selected word in ** and toggles back off", () => {
    const view = fakeView(stateFor("hello world", [6, 11]));
    toggleInline("bold")(view);
    expect(view.state.doc.toString()).toBe("hello **world**");
    expect(isFormatActive(view.state, "bold")).toBe(true);
    toggleInline("bold")(view);
    expect(view.state.doc.toString()).toBe("hello world");
  });

  it("wraps italic, underline, strike, highlight and code", () => {
    for (const [kind, expected] of [
      ["italic", "*word*"],
      ["underline", "<u>word</u>"],
      ["strike", "~~word~~"],
      ["highlight", "==word=="],
      ["code", "`word`"],
    ]) {
      const view = fakeView(stateFor("word", [0, 4]));
      toggleInline(kind)(view);
      expect(view.state.doc.toString()).toBe(expected);
    }
  });

  it("does not wrap trailing whitespace in a selection", () => {
    const view = fakeView(stateFor("word next", [0, 5]));
    toggleInline("bold")(view);
    expect(view.state.doc.toString()).toBe("**word** next");
  });

  it("Cmd+K turns the selection into a link and back", () => {
    const view = fakeView(stateFor("docs", [0, 4]));
    toggleLink(view);
    expect(view.state.doc.toString()).toBe("[docs]()");
    expect(view.state.selection.main.head).toBe(7);
    view.dispatch({ changes: { from: 7, insert: "https://x.dev" } });
    toggleLink(view);
    expect(view.state.doc.toString()).toBe("docs");
  });

  it("switches block types and toggles back to body", () => {
    const view = fakeView(stateFor("item", 4));
    setBlockType("task")(view);
    expect(view.state.doc.toString()).toBe("- [ ] item");
    setBlockType("bullet")(view);
    expect(view.state.doc.toString()).toBe("- item");
    setBlockType("h2")(view);
    expect(view.state.doc.toString()).toBe("## item");
    setBlockType("h2")(view);
    expect(view.state.doc.toString()).toBe("item");
  });

  it("numbers a multi-line selection when making a numbered list", () => {
    const view = fakeView(stateFor("a\nb\nc", [0, 5]));
    setBlockType("ordered")(view);
    expect(view.state.doc.toString()).toBe("1. a\n2. b\n3. c");
  });

  it("wraps and unwraps a code block", () => {
    const view = fakeView(stateFor("x = 1", 2));
    toggleCodeBlock(view);
    expect(view.state.doc.toString()).toBe("```\nx = 1\n```");
    toggleCodeBlock(view);
    expect(view.state.doc.toString()).toBe("x = 1");
  });

  it("inserts a divider with a blank line above so it never becomes a setext heading", () => {
    const view = fakeView(stateFor("text\n", 5));
    insertDivider(view);
    expect(view.state.doc.toString()).toBe("text\n\n---\n");
  });
});

describe("paper note slash menu", () => {
  function type(view, text) {
    const { head } = view.state.selection.main;
    view.dispatch({
      changes: { from: head, insert: text },
      selection: EditorSelection.cursor(head + text.length),
      userEvent: "input.type",
    });
  }

  it("opens on / at line start and filters as you type", () => {
    const view = fakeView(stateFor(""));
    type(view, "/");
    expect(view.state.field(slashMenuField)).toMatchObject({ from: 0, query: "" });
    type(view, "ta");
    const menu = view.state.field(slashMenuField);
    expect(menu.query).toBe("ta");
    expect(filterSlashItems(menu.query)[0].id).toBe("task");
  });

  it("opens when typed input arrives batched ('/ta' in one insertion)", () => {
    const view = fakeView(stateFor(""));
    type(view, "/ta");
    expect(view.state.field(slashMenuField)).toMatchObject({ from: 0, query: "ta" });
  });

  it("does not open mid-sentence", () => {
    const view = fakeView(stateFor("a and b"));
    type(view, "/");
    expect(view.state.field(slashMenuField)).toBeNull();
  });

  it("'/' then Task inserts '- [ ] '", () => {
    const view = fakeView(stateFor(""));
    type(view, "/");
    type(view, "task");
    runSlashItem(view, filterSlashItems("task")[0]);
    expect(view.state.doc.toString()).toBe("- [ ] ");
    expect(view.state.selection.main.head).toBe(6);
    expect(view.state.field(slashMenuField)).toBeNull();
  });

  it("offers every block type from the brief", () => {
    expect(filterSlashItems("").map((item) => item.id)).toEqual([
      "h1", "h2", "h3", "body", "task", "bullet", "ordered", "code", "divider",
    ]);
  });
});

describe("paper note canvas render", () => {
  const sample = [
    "# Title",
    "A **bold _nested_** ==hl== <u>u</u> `code` [link](https://x.dev) ~~s~~",
    "- one",
    "  - two",
    "- [ ] todo",
    "- [x] done",
    "1. first",
    "",
    "---",
    "",
    "```",
    "raw **not bold**",
    "```",
    "> quoted",
  ].join("\n");

  it("renders styled markdown with no raw markup", () => {
    const html = renderToStaticMarkup(renderNoteMarkdown(sample));
    const text = html.replace(/<pre[^>]*>.*?<\/pre>/gs, "").replace(/<[^>]+>/g, "");
    for (const raw of ["# ", "**", "==", "&lt;u&gt;", "](", "~~", "- [", "> "]) {
      expect(text).not.toContain(raw);
    }
    expect(html).toContain("raw **not bold**");
    for (const className of [
      "nt-h1", "nt-bold", "nt-italic", "nt-highlight", "nt-underline",
      "nt-code", "nt-link", "nt-strike", "nt-bullet", "nt-checkbox--checked",
      "nt-ordinal", "nt-hr", "nt-codeblock", "nt-quote",
    ]) {
      expect(html).toContain(className);
    }
  });

  it("flattens nested lists into depth-indented rows like the editor", () => {
    const html = renderToStaticMarkup(renderNoteMarkdown("- a\n  - b"));
    expect(html).toContain("--nt-li-depth:1");
    expect(html).toContain("--nt-li-depth:2");
  });

  it("keeps blank source lines as blank space", () => {
    const html = renderToStaticMarkup(renderNoteMarkdown("a\n\n\nb"));
    expect(html.match(/nt-gap/g)).toHaveLength(2);
  });

  it("uses the same class names as the editor decorations", () => {
    const state = inactive("**b** ==h== `c`");
    const editorClasses = new Set(computeLivePreview(state).filter((d) => d.type === "mark").map((d) => d.className));
    const html = renderToStaticMarkup(renderNoteMarkdown("**b** ==h== `c`"));
    for (const className of editorClasses) {
      expect(html).toContain(className);
    }
  });
});
