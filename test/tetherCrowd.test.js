import { describe, expect, it } from "vitest";
import { advance, attachLink, createNode, createTetherWorld, isWorldMoving } from "../renderer/src/systems/tether/tetherPhysics";

// Ten tiles packed close together and all tethered to one hub: the links
// can't all reach their rest length, which used to keep the group bashing
// into itself forever (a bump on a tile that had just fallen asleep reset
// the whole group's settle clock).
function crowdedStar() {
  const world = createTetherWorld();
  for (let i = 0; i < 10; i += 1) {
    const node = createNode(`t${i}`, (i % 4) * 230, Math.floor(i / 4) * 200, 240 + (i % 3) * 40, 180 + (i % 2) * 90);
    world.nodes.push(node);
    world.nodeById.set(node.id, node);
  }
  return world;
}

describe("tether physics with a crowded group", () => {
  it("comes to rest within 5s of the last link, gliding gently at the end", () => {
    const world = crowdedStar();
    let accumulator = 0;
    const tick = () => { accumulator = advance(world, 1 / 60, 1, accumulator); };

    for (let i = 1; i < 10; i += 1) {
      attachLink(world, { id: `l${i}`, a: world.nodes[0], b: world.nodes[i] });
      for (let f = 0; f < 24; f += 1) tick();
    }

    for (let f = 0; f < 60 * 3; f += 1) tick();
    const before = world.nodes.map((node) => [node.x, node.y]);
    for (let f = 0; f < 60 * 2; f += 1) tick();

    expect(isWorldMoving(world)).toBe(false);
    const drift = Math.max(...world.nodes.map((node, i) => Math.hypot(node.x - before[i][0], node.y - before[i][1])));
    expect(drift).toBeLessThan(60);
  });
});
