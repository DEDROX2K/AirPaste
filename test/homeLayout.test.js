import { describe, expect, it } from "vitest";
import {
  addToGroup,
  buildHomeEntries,
  createGroupFromDrop,
  emptyHomeLayout,
  groupEntryKey,
  moveKey,
  normalizeHomeLayout,
  removeFromGroup,
  renameGroup,
  setTopLevelOrder,
  ungroup,
} from "../renderer/src/lib/homeLayout";

const canvases = ["a", "b", "c", "d"].map((id, index) => ({
  id,
  path: `${id}.airpaste.json`,
  name: id.toUpperCase(),
  updatedAt: new Date(2026, 0, index + 1).toISOString(),
}));

const keysOf = (entries) => entries.map((entry) => entry.key);

describe("homeLayout", () => {
  it("keeps the sorted order until the user reorders", () => {
    expect(keysOf(buildHomeEntries(canvases, emptyHomeLayout()))).toEqual(["a", "b", "c", "d"]);
  });

  it("applies a manual order and puts new canvases first", () => {
    const layout = setTopLevelOrder(emptyHomeLayout(), ["c", "a", "b"]);
    expect(keysOf(buildHomeEntries(canvases, layout))).toEqual(["d", "c", "a", "b"]);
  });

  it("moveKey inserts at an index of the list without the key", () => {
    expect(moveKey(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveKey(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("dropping a card on another makes a group in the target's place", () => {
    const visible = ["a", "b", "c", "d"];
    const { groupId, layout } = createGroupFromDrop(emptyHomeLayout(), visible, "d", "b");
    const entries = buildHomeEntries(canvases, layout);
    expect(keysOf(entries)).toEqual(["a", groupEntryKey(groupId), "c"]);
    expect(entries[1].items.map((item) => item.id)).toEqual(["b", "d"]);
  });

  it("adds, renames, removes and ungroups", () => {
    const { groupId, layout: grouped } = createGroupFromDrop(emptyHomeLayout(), ["a", "b", "c", "d"], "b", "a");
    const gKey = groupEntryKey(groupId);
    const added = addToGroup(grouped, [gKey, "c", "d"], groupId, "c");
    expect(keysOf(buildHomeEntries(canvases, added))).toEqual([gKey, "d"]);
    expect(added.groups[0].members).toEqual(["a", "b", "c"]);

    const renamed = renameGroup(added, groupId, "  Team project ");
    expect(renamed.groups[0].name).toBe("Team project");

    const removed = removeFromGroup(renamed, [gKey, "d"], groupId, "b");
    expect(keysOf(buildHomeEntries(canvases, removed))).toEqual([gKey, "b", "d"]);

    const flat = ungroup(removed, [gKey, "b", "d"], groupId);
    expect(flat.groups).toEqual([]);
    expect(keysOf(buildHomeEntries(canvases, flat))).toEqual(["a", "c", "b", "d"]);
  });

  it("drops groups whose canvases are gone and never lists a canvas twice", () => {
    const layout = normalizeHomeLayout({
      order: ["group:g1", "a", "x"],
      groups: [{ id: "g1", name: "", members: ["a", "zzz"] }, { id: "g2", members: ["a", "missing"] }],
    });
    expect(layout.groups[0].name).toBe("Untitled group");
    expect(layout.groups[1].members).toEqual(["missing"]);
    expect(layout.order).toEqual(["group:g1", "x"]);
    const entries = buildHomeEntries(canvases, layout);
    expect(keysOf(entries)).toEqual(["b", "c", "d", "group:g1"]);
  });
});
