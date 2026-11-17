// The shared note editor (NoteTextEditor) is lazy-loaded: CodeMirror is one
// of the heaviest dependency trees in the canvas bundle, so it only loads the
// first time a note is edited. This mounts the real implementation module in
// a DOM -- the way every note tile does -- to catch a broken import path or a
// wiring mistake that only a rendered editor would surface.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
let host = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mountEditor(props) {
  const { default: NoteTextEditorImpl } = await import("../renderer/src/components/noteText/NoteTextEditorImpl.jsx");
  host = globalThis.document.createElement("div");
  globalThis.document.body.appendChild(host);
  root = createRoot(host);
  const ref = createRef();
  act(() => {
    root.render(createElement(NoteTextEditorImpl, { ref, autoFocus: false, ...props }));
  });
  return ref;
}

describe("NoteTextEditor", () => {
  it("mounts a real CodeMirror editor with the shared note setup", async () => {
    const ref = await mountEditor({ initialText: "# Hi" });

    expect(host.querySelector(".note-text .cm-editor.note-text-editor")).toBeTruthy();
    expect(host.querySelector(".cm-content[data-note-text-editor='true']")).toBeTruthy();
    expect(ref.current.getText()).toBe("# Hi");
  });

  it("reports edits through onChange", async () => {
    const changes = [];
    const ref = await mountEditor({ initialText: "", onChange: (text) => changes.push(text) });

    act(() => {
      ref.current.view.dispatch({ changes: { from: 0, insert: "- [ ] task" } });
    });

    expect(changes).toEqual(["- [ ] task"]);
  });

  it("uses replacementText (type-to-edit) instead of the saved text", async () => {
    const ref = await mountEditor({ initialText: "saved", replacementText: "k" });
    expect(ref.current.getText()).toBe("k");
  });
});
