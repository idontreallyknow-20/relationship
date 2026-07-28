// Where the nodes of a tree go.
//
// Kept pure, and kept out of the component, because the old layout was a
// recursive `place()` closure tangled into the render and there was no way to
// ask it a question without mounting React. Everything here is arithmetic over
// plain objects, so the tests can walk a hundred shapes in a millisecond.
//
// The old one was a tidy-tree measure-and-place, which is the right algorithm
// for a *tree* and cannot express what this needs to be. A node had exactly one
// parent, so four lines came off the trunk and then ran straight down: Joseph's
// side and the shared side had literally zero forks below the root, and Cami's
// had one. "Four branches" was four queues.
//
// A node can now have several parents, which makes this a directed acyclic
// graph rather than a forest, and needs a different shape of algorithm:
// assign every node to a layer, order the nodes within each layer to keep the
// edges from crossing, then space them out. That is Sugiyama's method, minus
// the parts that only matter for graphs far larger than this.

export interface LayoutInput {
  id: string;
  /** Every node this one grows out of. Empty for a root. */
  after: string[];
}

export interface PlacedNode {
  id: string;
  /** Horizontal position, in abstract columns. Fractional. */
  x: number;
  /** Layer, zero at the roots. */
  y: number;
  parents: string[];
}

export interface LayoutResult {
  nodes: PlacedNode[];
  byId: Map<string, PlacedNode>;
  /** Total width in columns, and depth in layers. */
  columns: number;
  rows: number;
}

/** How many barycentre passes to run. Past about six it stops moving. */
const SWEEPS = 6;

/** The closest two nodes in the same layer are allowed to sit. */
const MIN_GAP = 1;

/**
 * Layer every node by its longest path from a root.
 *
 * Longest rather than shortest, so an edge always points strictly downward: if
 * a node is reachable in two hops one way and five another, drawing it at
 * layer two would make the five-hop line run back up the canvas. Cycles are
 * broken by refusing to revisit a node already on the stack, so bad data draws
 * something odd rather than hanging the render.
 */
function assignLayers(input: LayoutInput[]): Map<string, number> {
  const present = new Set(input.map((n) => n.id));
  const byId = new Map(input.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);

    const node = byId.get(id);
    // A parent filtered out of this view does not make the child vanish, it
    // makes it a root. Losing a node because its prerequisite is hidden is how
    // a tree ends up with holes in it.
    const parents = (node?.after ?? []).filter((p) => present.has(p) && p !== id);
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(walk));

    visiting.delete(id);
    depth.set(id, value);
    return value;
  };

  for (const node of input) walk(node.id);
  return depth;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Push a layer's nodes apart without changing their order.
 *
 * Runs forward from the leftmost, then backward from the rightmost, so the
 * layer keeps roughly the centre of mass it was given rather than being shunted
 * steadily rightward every time it is separated.
 */
function separate(order: string[], x: Map<string, number>): void {
  for (let i = 1; i < order.length; i++) {
    const previous = x.get(order[i - 1])!;
    const current = x.get(order[i])!;
    if (current - previous < MIN_GAP) x.set(order[i], previous + MIN_GAP);
  }
  for (let i = order.length - 2; i >= 0; i--) {
    const next = x.get(order[i + 1])!;
    const current = x.get(order[i])!;
    if (next - current < MIN_GAP) x.set(order[i], next - MIN_GAP);
  }
}

export function layoutGraph(input: LayoutInput[]): LayoutResult {
  if (input.length === 0) {
    return { nodes: [], byId: new Map(), columns: 1, rows: 1 };
  }

  const present = new Set(input.map((n) => n.id));
  const depth = assignLayers(input);
  const rows = Math.max(...[...depth.values()]) + 1;

  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const node of input) {
    const real = node.after.filter((p) => present.has(p) && p !== node.id);
    parents.set(node.id, real);
    for (const p of real) {
      children.set(p, [...(children.get(p) ?? []), node.id]);
    }
  }

  // Nodes grouped by layer, in declaration order to begin with. Config order is
  // a deliberate reading order, so it is a better starting point than anything
  // random and makes the result stable between renders.
  const layers: string[][] = Array.from({ length: rows }, () => []);
  for (const node of input) layers[depth.get(node.id)!].push(node.id);

  const x = new Map<string, number>();
  for (const layer of layers) layer.forEach((id, i) => x.set(id, i));

  // Alternate down and up, each time moving a node over the median of the
  // things it is joined to on the layer we just settled. The median rather than
  // the mean because a node with one far-off parent and three near ones belongs
  // beside the three.
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const downward = sweep % 2 === 0;
    const order = downward
      ? layers.map((_, i) => i).slice(1)
      : layers.map((_, i) => i).slice(0, -1).reverse();

    for (const index of order) {
      const layer = layers[index];
      const anchor = new Map<string, number>();
      for (const id of layer) {
        const neighbours = downward ? parents.get(id) ?? [] : children.get(id) ?? [];
        const positions = neighbours.map((n) => x.get(n)).filter((v): v is number => v !== undefined);
        anchor.set(id, median(positions) ?? x.get(id)!);
      }
      layer.sort((a, b) => anchor.get(a)! - anchor.get(b)! || a.localeCompare(b));
      for (const id of layer) x.set(id, anchor.get(id)!);
      separate(layer, x);
    }
  }

  // A parent with children sits over the middle of them. Done last and only
  // where it does not collide, because it is a finishing touch rather than a
  // constraint: a trunk drawn off to one side of its own branches reads as a
  // mistake even when nothing overlaps.
  for (let index = rows - 2; index >= 0; index--) {
    const layer = layers[index];
    for (const id of layer) {
      const kids = (children.get(id) ?? []).map((k) => x.get(k)!).filter((v) => v !== undefined);
      if (kids.length === 0) continue;
      x.set(id, (Math.min(...kids) + Math.max(...kids)) / 2);
    }
    layer.sort((a, b) => x.get(a)! - x.get(b)! || a.localeCompare(b));
    separate(layer, x);
  }

  const all = [...x.values()];
  const left = Math.min(...all);
  const nodes: PlacedNode[] = input.map((node) => ({
    id: node.id,
    x: x.get(node.id)! - left,
    y: depth.get(node.id)!,
    parents: parents.get(node.id) ?? [],
  }));

  const columns = Math.max(...nodes.map((n) => n.x)) + 1;
  return {
    nodes,
    byId: new Map(nodes.map((n) => [n.id, n])),
    columns: Math.max(1, columns),
    rows: Math.max(1, rows),
  };
}
