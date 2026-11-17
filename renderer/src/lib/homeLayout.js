// Home card layout: the user's own order of canvas cards plus Figma-style
// groups (one card standing for several canvases). Stored in the workspace's
// ui-state.json as `homeLayout`; every function here is pure and returns a
// new layout, so HomeShell can update state optimistically and persist.
//
//   homeLayout = {
//     order:  ["<entryKey>", ...]   // top-level cards, in display order
//     groups: [{ id, name, members: ["<canvasKey>"], starred, updatedAt }]
//   }
//
// A canvas key is the canvas document id (stable across renames), falling
// back to its workspace-relative path. A group's entry key is "group:<id>".
// An empty `order` means "no manual order yet": cards keep the sort the
// user picked, and new canvases always land at the front.

export const GROUP_KEY_PREFIX = "group:";
export const DEFAULT_GROUP_NAME = "Untitled group";

export function emptyHomeLayout() {
  return { order: [], groups: [] };
}

export function canvasLayoutKey(item) {
  if (!item) return "";
  if (typeof item.id === "string" && item.id) return item.id;
  return item.path ? `path:${item.path}` : "";
}

export function groupEntryKey(groupId) {
  return `${GROUP_KEY_PREFIX}${groupId}`;
}

export function isGroupKey(key) {
  return typeof key === "string" && key.startsWith(GROUP_KEY_PREFIX);
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== "string" || !value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function normalizeHomeLayout(value) {
  const safe = value && typeof value === "object" ? value : {};
  const groups = [];
  const groupIds = new Set();
  const grouped = new Set();
  for (const raw of Array.isArray(safe.groups) ? safe.groups : []) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" && raw.id ? raw.id : "";
    if (!id || groupIds.has(id)) continue;
    // A canvas belongs to at most one group.
    const members = uniqueStrings(raw.members).filter((key) => !grouped.has(key));
    members.forEach((key) => grouped.add(key));
    groupIds.add(id);
    groups.push({
      id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 120) : DEFAULT_GROUP_NAME,
      members,
      starred: raw.starred === true,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    });
  }
  const order = uniqueStrings(safe.order).filter((key) => (
    isGroupKey(key) ? groupIds.has(key.slice(GROUP_KEY_PREFIX.length)) : !grouped.has(key)
  ));
  return { order, groups };
}

export function findGroup(layout, groupId) {
  return layout.groups.find((group) => group.id === groupId) ?? null;
}

function newGroupId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso() {
  return new Date().toISOString();
}

// Top-level entries, in display order:
//   { type: "canvas", key, item } | { type: "group", key, group, items }
// `items` are canvases already sorted by the user's sort preference. Canvases
// not in the saved order (new ones) come first; groups whose canvases are
// all gone are dropped.
export function buildHomeEntries(items, layout) {
  const byKey = new Map();
  for (const item of items) {
    const key = canvasLayoutKey(item);
    if (key && !byKey.has(key)) byKey.set(key, item);
  }

  const groupedKeys = new Set();
  const groupEntries = new Map();
  for (const group of layout.groups) {
    const members = group.members.map((key) => byKey.get(key)).filter(Boolean);
    group.members.forEach((key) => groupedKeys.add(key));
    if (members.length === 0) continue;
    groupEntries.set(groupEntryKey(group.id), { type: "group", key: groupEntryKey(group.id), group, items: members });
  }

  const placed = new Set();
  const ordered = [];
  for (const key of layout.order) {
    if (placed.has(key)) continue;
    if (isGroupKey(key)) {
      const entry = groupEntries.get(key);
      if (entry) {
        ordered.push(entry);
        placed.add(key);
      }
      continue;
    }
    const item = byKey.get(key);
    if (item && !groupedKeys.has(key)) {
      ordered.push({ type: "canvas", key, item });
      placed.add(key);
    }
  }

  const fresh = [];
  for (const [key, item] of byKey) {
    if (placed.has(key) || groupedKeys.has(key)) continue;
    fresh.push({ type: "canvas", key, item });
    placed.add(key);
  }
  // Groups not in the order yet (shouldn't happen, but never lose one).
  for (const [key, entry] of groupEntries) {
    if (!placed.has(key)) fresh.push(entry);
  }

  return [...fresh, ...ordered];
}

// Moves `key` so it sits at `index` among `keys` (index is in the list
// without `key`). Returns the new key list.
export function moveKey(keys, key, index) {
  const without = keys.filter((entry) => entry !== key);
  const clamped = Math.max(0, Math.min(index, without.length));
  return [...without.slice(0, clamped), key, ...without.slice(clamped)];
}

export function setTopLevelOrder(layout, keys) {
  return { ...layout, order: uniqueStrings(keys) };
}

// Drops canvas `sourceKey` onto canvas `targetKey`: a new group takes the
// target's place. `visibleKeys` is the current top-level order on screen.
export function createGroupFromDrop(layout, visibleKeys, sourceKey, targetKey, name = DEFAULT_GROUP_NAME) {
  const id = newGroupId();
  const gKey = groupEntryKey(id);
  const order = [];
  for (const key of visibleKeys) {
    if (key === sourceKey) continue;
    order.push(key === targetKey ? gKey : key);
  }
  return {
    groupId: id,
    layout: {
      order,
      groups: [...layout.groups, { id, name, members: [targetKey, sourceKey], starred: false, updatedAt: nowIso() }],
    },
  };
}

// Adds canvas `sourceKey` to an existing group (removing it from any other).
export function addToGroup(layout, visibleKeys, groupId, sourceKey) {
  const groups = layout.groups.map((group) => {
    const members = group.members.filter((key) => key !== sourceKey);
    if (group.id !== groupId) return members.length === group.members.length ? group : { ...group, members };
    return { ...group, members: [...members, sourceKey], updatedAt: nowIso() };
  });
  return { order: visibleKeys.filter((key) => key !== sourceKey), groups };
}

export function renameGroup(layout, groupId, name) {
  const trimmed = String(name ?? "").trim().slice(0, 120) || DEFAULT_GROUP_NAME;
  return {
    ...layout,
    groups: layout.groups.map((group) => (group.id === groupId ? { ...group, name: trimmed, updatedAt: nowIso() } : group)),
  };
}

export function toggleGroupStar(layout, groupId) {
  return {
    ...layout,
    groups: layout.groups.map((group) => (group.id === groupId ? { ...group, starred: !group.starred } : group)),
  };
}

// Dissolves a group: its canvases take its place in the top-level order.
export function ungroup(layout, visibleKeys, groupId) {
  const group = findGroup(layout, groupId);
  if (!group) return layout;
  const gKey = groupEntryKey(groupId);
  const order = [];
  for (const key of visibleKeys) {
    if (key === gKey) order.push(...group.members);
    else order.push(key);
  }
  return { order: uniqueStrings(order), groups: layout.groups.filter((entry) => entry.id !== groupId) };
}

// Takes one canvas out of its group; it lands right after the group. A
// group left empty is removed.
export function removeFromGroup(layout, visibleKeys, groupId, memberKey) {
  const group = findGroup(layout, groupId);
  if (!group) return layout;
  const members = group.members.filter((key) => key !== memberKey);
  const gKey = groupEntryKey(groupId);
  const order = [];
  for (const key of visibleKeys) {
    if (key === gKey) {
      if (members.length > 0) order.push(key);
      order.push(memberKey);
    } else if (key !== memberKey) {
      order.push(key);
    }
  }
  const groups = members.length > 0
    ? layout.groups.map((entry) => (entry.id === groupId ? { ...entry, members, updatedAt: nowIso() } : entry))
    : layout.groups.filter((entry) => entry.id !== groupId);
  return { order: uniqueStrings(order), groups };
}

export function reorderGroupMembers(layout, groupId, memberKeys) {
  return {
    ...layout,
    groups: layout.groups.map((group) => (group.id === groupId ? { ...group, members: uniqueStrings(memberKeys) } : group)),
  };
}

export function groupUpdatedAt(entry) {
  let latest = 0;
  for (const item of entry.items) {
    const time = item?.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    if (Number.isFinite(time) && time > latest) latest = time;
  }
  return latest ? new Date(latest).toISOString() : entry.group.updatedAt;
}
