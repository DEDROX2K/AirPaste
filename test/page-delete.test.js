import { describe, expect, it } from "vitest";
import { removeWorkspacePage } from "@/lib/workspace.js";

const workspace = (activePageId) => ({
  activePageId,
  pages: [{ id: "a", name: "A", cards: [] }, { id: "b", name: "B", cards: [] }, { id: "c", name: "C", cards: [] }],
});

describe("removeWorkspacePage", () => {
  it("removes a page and keeps the active one", () => {
    const next = removeWorkspacePage(workspace("a"), "b");
    expect(next.pages.map((page) => page.id)).toEqual(["a", "c"]);
    expect(next.activePageId).toBe("a");
  });

  it("opens the page below when the active page goes, or above when it was last", () => {
    expect(removeWorkspacePage(workspace("b"), "b").activePageId).toBe("c");
    expect(removeWorkspacePage(workspace("c"), "c").activePageId).toBe("b");
  });

  it("never removes the last page, and ignores unknown ids", () => {
    const single = { activePageId: "a", pages: [{ id: "a", name: "A", cards: [] }] };
    expect(removeWorkspacePage(single, "a")).toBe(single);
    const three = workspace("a");
    expect(removeWorkspacePage(three, "zzz")).toBe(three);
  });
});
