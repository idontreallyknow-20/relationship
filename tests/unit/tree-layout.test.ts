// Where the nodes go.
//
// The layout is the one part of the tree that can be wrong in a way a
// screenshot will not show: two nodes at the same coordinates look like one
// node, an edge pointing upward looks like a different edge, and a node whose
// parent was filtered out of the view simply vanishes. All three are cheap to
// assert and expensive to notice by eye.

import { describe, expect, it } from "vitest";
import { layoutGraph, type LayoutInput } from "@/components/jar/tree/layout";
import { UPGRADES, parentsOf } from "@/game/config/upgrades";
import { MOON_UPGRADES, STAR_UPGRADES, SUN_UPGRADES } from "@/game/config/resets";
import { SHELF_UPGRADES } from "@/game/config/shelf";

function n(id: string, ...after: string[]): LayoutInput {
  return { id, after };
}

function noOverlaps(input: LayoutInput[]) {
  const { nodes } = layoutGraph(input);
  const seen = new Map<string, string>();
  for (const node of nodes) {
    // Rounded, because two nodes a thousandth of a column apart are two nodes
    // drawn on top of each other as far as anyone looking at it is concerned.
    const key = `${node.y}:${node.x.toFixed(3)}`;
    expect(seen.has(key), `${node.id} sits on top of ${seen.get(key)}`).toBe(false);
    seen.set(key, node.id);
  }
  return nodes;
}

describe("tree layout", () => {
  it("puts a root at the top and a child below it", () => {
    const { byId } = layoutGraph([n("a"), n("b", "a")]);
    expect(byId.get("a")!.y).toBe(0);
    expect(byId.get("b")!.y).toBe(1);
  });

  it("centres a parent over its children", () => {
    const { byId } = layoutGraph([n("a"), n("b", "a"), n("c", "a"), n("d", "a")]);
    const kids = ["b", "c", "d"].map((id) => byId.get(id)!.x);
    const middle = (Math.min(...kids) + Math.max(...kids)) / 2;
    expect(byId.get("a")!.x).toBeCloseTo(middle, 5);
  });

  it("never draws two nodes in the same place", () => {
    noOverlaps([
      n("a"), n("b"), n("c"),
      n("d", "a"), n("e", "a"), n("f", "b"), n("g", "b", "c"),
      n("h", "d", "e"), n("i", "g"), n("j", "g"), n("k", "h", "i"),
    ]);
  });

  it("handles a node with several parents, which a tree cannot", () => {
    // The whole reason for replacing the tidy-tree pass.
    const { byId } = layoutGraph([n("a"), n("b"), n("both", "a", "b")]);
    expect(byId.get("both")!.parents.sort()).toEqual(["a", "b"]);
    expect(byId.get("both")!.y).toBe(1);
  });

  it("always points edges downward, however many ways round there are", () => {
    // 'far' is one hop from 'a' and three hops the other way. Layered by the
    // shortest path it would sit above its own parent.
    const input = [n("a"), n("b", "a"), n("c", "b"), n("far", "a", "c")];
    const { byId } = layoutGraph(input);
    for (const node of layoutGraph(input).nodes) {
      for (const parent of node.parents) {
        expect(
          byId.get(parent)!.y,
          `${parent} -> ${node.id} runs back up the canvas`,
        ).toBeLessThan(node.y);
      }
    }
  });

  it("keeps a node whose parent is not in the view, as a root", () => {
    // Locked upgrades get filtered out of some views. A child of one of them
    // must not disappear with it.
    const { byId, nodes } = layoutGraph([n("orphan", "somebody-else")]);
    expect(nodes).toHaveLength(1);
    expect(byId.get("orphan")!.y).toBe(0);
    expect(byId.get("orphan")!.parents).toEqual([]);
  });

  it("does not hang on a cycle in the data", () => {
    const { nodes } = layoutGraph([n("a", "b"), n("b", "a"), n("c", "a")]);
    expect(nodes).toHaveLength(3);
  });

  it("survives an empty view", () => {
    const out = layoutGraph([]);
    expect(out.nodes).toEqual([]);
    expect(out.columns).toBeGreaterThan(0);
    expect(out.rows).toBeGreaterThan(0);
  });

  it("is stable: the same input lays out the same way twice", () => {
    const input = [n("a"), n("b", "a"), n("c", "a"), n("d", "b", "c"), n("e", "c")];
    expect(layoutGraph(input).nodes).toEqual(layoutGraph(input).nodes);
  });

  it("starts at zero so nothing is drawn off the left edge", () => {
    const { nodes } = layoutGraph([n("a"), n("b", "a"), n("c", "a"), n("d", "c")]);
    expect(Math.min(...nodes.map((node) => node.x))).toBe(0);
  });
});

describe("the real trees", () => {
  const trees: Array<[string, LayoutInput[]]> = [
    ["cami", UPGRADES.filter((u) => u.tree === "cami").map((u) => ({ id: u.id, after: parentsOf(u) }))],
    ["joseph", UPGRADES.filter((u) => u.tree === "joseph").map((u) => ({ id: u.id, after: parentsOf(u) }))],
    ["us", UPGRADES.filter((u) => u.tree === "us").map((u) => ({ id: u.id, after: parentsOf(u) }))],
    ["moons", MOON_UPGRADES.map((u) => ({ id: u.id, after: u.after ?? [] }))],
    ["stars", STAR_UPGRADES.map((u) => ({ id: u.id, after: u.after ?? [] }))],
    ["suns", SUN_UPGRADES.map((u) => ({ id: u.id, after: u.after ?? [] }))],
    ["shelf", SHELF_UPGRADES.map((u) => ({ id: u.id, after: u.after ?? [] }))],
  ];

  for (const [name, input] of trees) {
    it(`lays ${name} out without overlaps`, () => {
      expect(input.length).toBeGreaterThan(0);
      noOverlaps(input);
    });

    it(`gives ${name} more than one fork below the root`, () => {
      // The complaint was that the tree needs way more branches. Four lines off
      // a trunk that then run straight down is not a branching tree, and this
      // is the assertion that stops it drifting back to one.
      const kids = new Map<string, number>();
      for (const node of input) {
        for (const parent of node.after) kids.set(parent, (kids.get(parent) ?? 0) + 1);
      }
      const roots = new Set(input.filter((node) => node.after.length === 0).map((n) => n.id));
      const deepForks = [...kids.entries()].filter(([id, count]) => count > 1 && !roots.has(id));
      expect(deepForks.length, `${name} forks only at its root`).toBeGreaterThanOrEqual(2);
    });

    it(`points every ${name} edge at something that exists`, () => {
      const ids = new Set(input.map((node) => node.id));
      for (const node of input) {
        for (const parent of node.after) {
          expect(ids.has(parent), `${node.id} grows out of ${parent}, which is not in this tree`).toBe(true);
        }
      }
    });
  }
});
