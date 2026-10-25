// CanvasTextTile used to import CodeMirror statically; it's now loaded on
// demand via canvasTextEditor.js so that pulling in one of the heaviest
// dependency trees in the whole canvas bundle only happens the first time a
// text tile is actually edited. This exercises the real dynamic import and
// extension-building logic end to end (not just that the refactor builds),
// to catch a broken import path or a module shape mismatch that only a
// rendered CodeMirror editor would otherwise surface.
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildCanvasTextEditorExtensions, loadCanvasTextEditorModules } from "../renderer/src/lib/canvasTextEditor.js";

describe("canvasTextEditor lazy module loading", () => {
  it("resolves every CodeMirror binding CanvasTextTile's editor needs", async () => {
    const cm = await loadCanvasTextEditorModules();

    expect(typeof cm.EditorState.create).toBe("function");
    expect(typeof cm.EditorView).toBe("function");
    expect(typeof cm.history).toBe("function");
    expect(typeof cm.drawSelection).toBe("function");
    expect(typeof cm.closeBrackets).toBe("function");
    expect(typeof cm.markdown).toBe("function");
    expect(typeof cm.keymap.of).toBe("function");
    expect(typeof cm.indentWithTab).toBe("object");
    expect(Array.isArray(cm.closeBracketsKeymap)).toBe(true);
    expect(Array.isArray(cm.defaultKeymap)).toBe(true);
    expect(Array.isArray(cm.historyKeymap)).toBe(true);
    expect(Array.isArray(cm.searchKeymap)).toBe(true);
  });

  it("reuses the same resolved modules across calls instead of reloading", async () => {
    const first = await loadCanvasTextEditorModules();
    const second = await loadCanvasTextEditorModules();
    expect(second).toBe(first);
  });

  it("builds a real, usable extensions array and actually mounts an editor in the DOM", async () => {
    const cm = await loadCanvasTextEditorModules();
    const docChanges = [];
    let exited = false;

    const extensions = buildCanvasTextEditorExtensions(cm, {
      onDocChange: (text) => docChanges.push(text),
      onExit: () => { exited = true; },
    });

    const host = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(host);

    const view = new cm.EditorView({
      state: cm.EditorState.create({ doc: "hello", extensions }),
      parent: host,
    });

    try {
      // A real CodeMirror editor DOM structure was actually created, not a
      // stub -- this is the thing a user types into.
      expect(host.querySelector(".cm-editor")).toBeTruthy();
      expect(host.querySelector(".cm-content")).toBeTruthy();
      expect(view.state.doc.toString()).toBe("hello");

      view.dispatch({ changes: { from: 0, to: 5, insert: "typed" } });
      expect(view.state.doc.toString()).toBe("typed");
      expect(docChanges).toContain("typed");

      expect(exited).toBe(false);
    } finally {
      view.destroy();
      host.remove();
    }
  });
});
