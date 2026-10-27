// Tethers: pairwise links between tiles (lib/workspace.js) and the spring
// simulation that floats them together and then stops completely
// (systems/tether/tetherPhysics.js, the reference design's spec).
import { describe, expect, it } from "vitest";
import {
  addTether,
  chainTethers,
  getWorkspaceActivePage,
  normalizeWorkspace,
  removeTether,
  untetherTile,
  WORKSPACE_SCHEMA_VERSION,
} from "@/lib/workspace.js";
import {
  NODE_MODE_FLOAT,
  NODE_MODE_REST,
  PHYS,
  attachLink,
  createNode,
  createTetherWorld,
  detachLink,
  getComponent,
  getLinkRestLength,
  getNodeVisual,
  getThrowVelocity,
  isWorldMoving,
  reach,
  step,
} from "@/systems/tether/tetherPhysics.js";

function makeCard(id, x, y) {
  return {
    id,
    type: "link",
    url: "https://example.com",
    title: "Example",
    siteName: "example.com",
    status: "ready",
    x,
    y,
    width: 200,
    height: 120,
  };
}

function loadTethers(cards, tethers) {
  const workspace = normalizeWorkspace({ version: WORKSPACE_SCHEMA_VERSION, pages: [{ cards, tethers }] });
  return getWorkspaceActivePage(workspace).tethers;
}

describe("tether links", () => {
  it("links two tiles and refuses self-links and duplicates (either direction)", () => {
    let page = { tethers: [] };
    page = addTether(page, "a", "b", "t1");

    expect(page.tethers).toEqual([{ id: "t1", a: "a", b: "b" }]);
    expect(addTether(page, "a", "a")).toBeNull();
    expect(addTether(page, "b", "a")).toBeNull();
  });

  it("chains a selection one tile after another, skipping pairs already linked", () => {
    const page = chainTethers({ tethers: [{ id: "t1", a: "b", b: "a" }] }, ["a", "b", "c"]);
    expect(page.tethers.map((link) => [link.a, link.b])).toEqual([["b", "a"], ["b", "c"]]);
  });

  it("cuts one link, or every link of a tile", () => {
    const page = { tethers: [{ id: "t1", a: "a", b: "b" }, { id: "t2", a: "b", b: "c" }, { id: "t3", a: "c", b: "d" }] };
    expect(removeTether(page, "t2").tethers.map((link) => link.id)).toEqual(["t1", "t3"]);
    expect(untetherTile(page, "b").tethers.map((link) => link.id)).toEqual(["t3"]);
  });

  it("drops links to missing tiles, self-links and duplicate pairs on load", () => {
    const tethers = loadTethers(
      [makeCard("a", 0, 0), makeCard("b", 300, 0)],
      [
        { id: "t1", a: "a", b: "b" },
        { id: "t2", a: "b", b: "a" },
        { id: "t3", a: "a", b: "a" },
        { id: "t4", a: "a", b: "ghost" },
      ],
    );
    expect(tethers).toEqual([{ id: "t1", a: "a", b: "b" }]);
  });

  it("loads an old tether group ({ tileIds }) as a chain of links", () => {
    const tethers = loadTethers(
      [makeCard("a", 0, 0), makeCard("b", 300, 0), makeCard("c", 600, 0)],
      [{ id: "g1", tileIds: ["a", "b", "ghost", "c"] }],
    );
    expect(tethers.map((link) => [link.a, link.b])).toEqual([["a", "b"], ["b", "c"]]);
    expect(tethers[0].id).toBe("g1");
  });
});

function makeWorld(specs) {
  const world = createTetherWorld();
  specs.forEach(([id, x, y, w = 150, h = 150]) => {
    const node = createNode(id, x, y, w, h);
    world.nodes.push(node);
    world.nodeById.set(id, node);
  });
  return world;
}

function link(world, id, a, b) {
  const created = { id, a: world.nodeById.get(a), b: world.nodeById.get(b), stretch: 0 };
  attachLink(world, created);
  return created;
}

function run(world, seconds) {
  for (let t = 0; t < seconds; t += PHYS.STEP) {
    step(world, PHYS.STEP);
  }
}

describe("tether physics", () => {
  it("measures a box's reach along a direction", () => {
    const node = createNode("a", 0, 0, 200, 100);
    expect(reach(node, 1, 0)).toBe(100);
    expect(reach(node, 0, 1)).toBe(50);
    expect(reach(node, Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(50 / Math.SQRT1_2);
  });

  it("snaps two far tiles together and stops completely within a few seconds", () => {
    const world = makeWorld([["a", 0, 0], ["b", 900, 0]]);
    const tether = link(world, "t1", "a", "b");

    expect(world.nodes.every((node) => node.mode === NODE_MODE_FLOAT && !node.asleep)).toBe(true);
    run(world, 4);

    const { distance, rest } = getLinkRestLength(tether);
    expect(isWorldMoving(world)).toBe(false);
    expect(world.nodes.every((node) => node.asleep && node.vx === 0 && node.vy === 0)).toBe(true);
    expect(Math.abs(distance - rest)).toBeLessThan(40);
    expect(rest).toBe(150 / 2 + 150 / 2 + PHYS.GAP);
  });

  it("wakes the whole group on a disturbance", () => {
    const world = makeWorld([["a", 0, 0], ["b", 400, 0], ["c", 800, 0], ["d", 2000, 2000]]);
    link(world, "t1", "a", "b");
    link(world, "t2", "b", "c");
    expect(getComponent(world, world.nodeById.get("a")).map((node) => node.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("after a cut, a tile with no tethers gets a small nudge, glides a few px and stays put", () => {
    const world = makeWorld([["a", 0, 0], ["b", 400, 0]]);
    const tether = link(world, "t1", "a", "b");
    run(world, 4);
    const before = { a: world.nodeById.get("a").x, b: world.nodeById.get("b").x };

    detachLink(world, tether);
    expect(world.nodes.every((node) => node.mode === NODE_MODE_REST)).toBe(true);
    run(world, 2);

    expect(isWorldMoving(world)).toBe(false);
    expect(world.nodeById.get("a").x).toBeLessThan(before.a);
    expect(world.nodeById.get("b").x).toBeGreaterThan(before.b);
    expect(before.a - world.nodeById.get("a").x).toBeLessThan(10);
  });

  it("lets a flicked untethered tile glide and stop, leaving other tiles alone", () => {
    const world = makeWorld([["a", 0, 0], ["b", 300, 0]]);
    const a = world.nodeById.get("a");
    a.vx = 900;
    run(world, 2);

    expect(a.vx).toBe(0);
    expect(a.x).toBeGreaterThan(80);
    expect(a.x).toBeLessThan(120);
    expect(world.nodeById.get("b").x).toBe(300);
  });

  it("turns the last drag samples into a clamped throw, or nothing after a pause", () => {
    const samples = [{ t: 0, x: 0, y: 0 }, { t: 50, x: 100, y: 0 }];
    expect(getThrowVelocity(samples, 60).vx).toBeCloseTo(PHYS.THROW_MAX);
    expect(getThrowVelocity([{ t: 0, x: 0, y: 0 }, { t: 100, x: 20, y: 0 }], 110).vx).toBeCloseTo(200);
    expect(getThrowVelocity(samples, 200)).toEqual({ vx: 0, vy: 0 });
  });

  it("tilts a flicked tile slightly into the throw and lands it flat", () => {
    const node = createNode("a", 0, 0, 150, 150);
    node.vx = 1000;

    for (let frame = 0; frame < 30; frame += 1) {
      getNodeVisual(node, 1 / 60, frame / 60, false);
    }

    expect(node.rot).toBeGreaterThan(2);
    expect(node.rot).toBeLessThanOrEqual(4);
    expect(node.lift).toBeGreaterThan(0);

    node.vx = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      getNodeVisual(node, 1 / 60, frame / 60, false);
    }

    expect(node.rot).toBe(0);
    expect(node.lift).toBe(0);
  });

  it("never tilts with reduced motion", () => {
    const node = createNode("a", 0, 0, 150, 150);
    node.vx = 1000;
    getNodeVisual(node, 1 / 60, 0, true);
    expect(node.rot).toBe(0);
  });
});
