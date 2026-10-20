import { useMemo } from "react";
import { getRootTiles } from "./tileLayout";

// First step of "generative zone structure": the canvas dot grid thickens
// in a soft halo wherever 5+ tiles sit close together, as a cheap proxy for
// a future procedural material (paper, metal, ...) occupying that zone.
//
// Deliberately decoupled from useTileLayoutSystem/tileMetaById (the
// perf-critical per-frame-during-drag memo, see project memory on canvas
// drag performance) -- this recomputes only when the `tiles` array
// reference itself changes (tiles added/removed/dropped), never during a
// live drag, since drag-in-progress movement is a separate CSS overlay
// that doesn't touch tile.x/tile.y until drop.
const NEIGHBOR_RADIUS = 260;
const MIN_CLUSTER_SIZE = 5;
const ZONE_PADDING = 100;

function getTileCenter(tile) {
  return {
    x: (tile.x ?? 0) + (tile.width ?? 0) / 2,
    y: (tile.y ?? 0) + (tile.height ?? 0) / 2,
  };
}

export function useCanvasDensityZones(tiles) {
  return useMemo(() => {
    const rootTiles = getRootTiles(Array.isArray(tiles) ? tiles : []);
    const members = rootTiles.map((tile) => ({ tile, center: getTileCenter(tile) }));
    const count = members.length;

    if (count < MIN_CLUSTER_SIZE) {
      return [];
    }

    const parent = Array.from({ length: count }, (_, index) => index);

    function find(index) {
      let root = index;
      while (parent[root] !== root) {
        root = parent[root];
      }
      while (parent[index] !== root) {
        const next = parent[index];
        parent[index] = root;
        index = next;
      }
      return root;
    }

    function union(a, b) {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) {
        parent[rootA] = rootB;
      }
    }

    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = members[i].center.x - members[j].center.x;
        const dy = members[i].center.y - members[j].center.y;
        if (Math.hypot(dx, dy) <= NEIGHBOR_RADIUS) {
          union(i, j);
        }
      }
    }

    const groups = new Map();
    for (let i = 0; i < count; i += 1) {
      const root = find(i);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root).push(members[i]);
    }

    const zones = [];
    groups.forEach((groupMembers) => {
      if (groupMembers.length < MIN_CLUSTER_SIZE) {
        return;
      }

      const centroid = groupMembers.reduce(
        (acc, member) => ({
          x: acc.x + member.center.x / groupMembers.length,
          y: acc.y + member.center.y / groupMembers.length,
        }),
        { x: 0, y: 0 },
      );
      const radius = Math.max(
        ...groupMembers.map((member) => Math.hypot(member.center.x - centroid.x, member.center.y - centroid.y)),
      ) + ZONE_PADDING;

      zones.push({
        id: groupMembers.map((member) => member.tile.id).sort().join("-"),
        x: centroid.x,
        y: centroid.y,
        radius,
        tileCount: groupMembers.length,
      });
    });

    return zones;
  }, [tiles]);
}
