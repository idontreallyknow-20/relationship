"use client";

// The upgrade tree, drawn as a tree.
//
// It was a flat list before, which is not a tree, and calling it one meant the
// shape of the thing you were building was invisible: you could not see that
// Somersault leads to Moonlit Water, or that four separate lines come out of
// the first upgrade you ever buy. Now there is a trunk at the top, branches
// coming off it, and every upgrade sits on the branch it belongs to.
//
// Nothing here gates anything. You can buy the far end of a branch without the
// middle of it, exactly as before. The parent links are a drawing.

import { useEffect, useMemo, useRef } from "react";
import { Lock } from "lucide-react";
import { useGame } from "@/game/store";
import { UPGRADES, type Tree, type UpgradeDef } from "@/game/config/upgrades";
import { CURRENCY_BY_ID } from "@/game/config/currencies";
import { buyableTree, meetsUnlock, resolveBuyCount, upgradeCost } from "@/game/formulas";
import { buyUpgrade } from "@/game/actions";
import { formatNumber } from "@/game/numbers";
import { useToast } from "@/components/ui";

/** One node's place on the canvas, in grid units. */
interface Placed {
  def: UpgradeDef;
  /** Horizontal centre, in columns. */
  x: number;
  /** Row, zero at the trunk. */
  y: number;
  parent: string | null;
}

const COLUMN = 132;
const ROW = 96;
const CARD_W = 116;
const CARD_H = 72;

/**
 * Lay a forest out so that no two nodes overlap and every parent sits centred
 * above its children.
 *
 * The width of a node is the total width of its children, or one if it has
 * none, which is the standard tidy-tree measurement and is the reason a branch
 * that forks twice gets twice the room rather than being drawn on top of
 * itself.
 */
function layout(defs: UpgradeDef[]): { nodes: Placed[]; columns: number; rows: number } {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const children = new Map<string, UpgradeDef[]>();
  const roots: UpgradeDef[] = [];
  for (const def of defs) {
    // A parent that is not in this list (filtered out, or a typo) makes the
    // node a root rather than making it disappear.
    if (def.after && byId.has(def.after)) {
      const list = children.get(def.after) ?? [];
      list.push(def);
      children.set(def.after, list);
    } else {
      roots.push(def);
    }
  }

  const widths = new Map<string, number>();
  const measure = (def: UpgradeDef): number => {
    const cached = widths.get(def.id);
    if (cached !== undefined) return cached;
    // Marked before recursing, so a cycle in the data cannot hang the render.
    widths.set(def.id, 1);
    const kids = children.get(def.id) ?? [];
    const width = kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + measure(kid), 0);
    widths.set(def.id, width);
    return width;
  };

  const nodes: Placed[] = [];
  let rows = 0;
  const place = (def: UpgradeDef, left: number, depth: number, parent: string | null) => {
    const width = measure(def);
    nodes.push({ def, x: left + width / 2, y: depth, parent });
    rows = Math.max(rows, depth + 1);
    let cursor = left;
    for (const kid of children.get(def.id) ?? []) {
      place(kid, cursor, depth + 1, def.id);
      cursor += measure(kid);
    }
  };

  let cursor = 0;
  for (const root of roots) {
    place(root, cursor, 0, null);
    cursor += measure(root);
  }
  return { nodes, columns: Math.max(1, cursor), rows: Math.max(1, rows) };
}

export function TreeGraph({ tree, onDetail }: { tree: Tree; onDetail: (def: UpgradeDef) => void }) {
  const { state, derived, mutate, version } = useGame();
  const toast = useToast();
  const format = state.settings.numberFormat;

  const { nodes, columns, rows, byId } = useMemo(() => {
    const defs = UPGRADES.filter(
      (u) => u.tree === tree && buyableTree(state, u)
        && (meetsUnlock(state, u.unlock) || (state.upgrades[u.id] ?? 0) > 0 || u.after !== undefined),
    );
    const out = layout(defs);
    return { ...out, byId: new Map(out.nodes.map((n) => [n.def.id, n])) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, version]);

  const width = columns * COLUMN;
  const height = rows * ROW;
  const cx = (n: Placed) => n.x * COLUMN;
  const cy = (n: Placed) => n.y * ROW + CARD_H / 2;

  // Start on the trunk.
  //
  // A five column tree is twice the width of a phone, and left-aligned that
  // put the first upgrade you ever buy off the right hand edge with only bare
  // branch lines in view. Centring the scroll on open means the thing you are
  // looking for is the thing you see.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollLeft = Math.max(0, (width - node.clientWidth) / 2);
  }, [width, tree]);

  return (
    <div ref={scroller} className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="relative" style={{ width, height }}>
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          aria-hidden="true"
        >
          {nodes.map((node) => {
            const parent = node.parent ? byId.get(node.parent) : null;
            if (!parent) return null;
            const x1 = cx(parent);
            const y1 = cy(parent) + CARD_H / 2;
            const x2 = cx(node);
            const y2 = cy(node) - CARD_H / 2;
            const mid = (y1 + y2) / 2;
            const owned = (state.upgrades[node.def.id] ?? 0) > 0;
            // A branch is alive when both ends of it are bought, and a live
            // branch breathes. It is the only way to see, at a glance, how far
            // down a line you have actually got.
            const alive = owned && (state.upgrades[parent.def.id] ?? 0) > 0;
            return (
              <path
                key={node.def.id}
                className={alive ? "branch-glow" : undefined}
                d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                fill="none"
                stroke={owned ? "var(--color-rose-dark)" : "var(--color-line)"}
                strokeWidth={owned ? 2.5 : 2}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const def = node.def;
          const owned = state.upgrades[def.id] ?? 0;
          const unlocked = meetsUnlock(state, def.unlock);
          const atMax = def.max !== Infinity && owned >= def.max;
          const count = Math.max(1, resolveBuyCount(state, def, derived));
          const cost = upgradeCost(state, def, count, derived);
          const affordable = unlocked && !atMax && state.wallet[def.currency] >= cost;
          const currency = CURRENCY_BY_ID[def.currency];

          return (
            <div
              // The level is in the key on purpose. React remounts the card
              // when it changes, which restarts the CSS animation, which is how
              // a purchase gets to land visibly without a timer in state.
              key={`${def.id}:${owned}`}
              className="buy-pop absolute flex flex-col rounded-xl border bg-white shadow-soft"
              style={{
                width: CARD_W,
                height: CARD_H,
                left: cx(node) - CARD_W / 2,
                top: node.y * ROW,
                borderColor: owned > 0 ? "var(--color-rose-dark)" : "var(--color-line)",
                opacity: unlocked ? 1 : 0.6,
              }}
            >
              <button
                onClick={() => onDetail(def)}
                className="flex min-h-0 flex-1 items-start gap-1 px-2 pt-1.5 text-left"
              >
                {!unlocked && <Lock className="mt-0.5 h-3 w-3 shrink-0 text-berry-soft" />}
                <span className="line-clamp-2 text-[0.68rem] font-semibold leading-tight text-berry">
                  {def.name}
                </span>
                <span className="shrink-0 rounded-full bg-cream px-1.5 text-[0.55rem] font-bold text-berry-soft">
                  {owned}
                </span>
              </button>

              <button
                disabled={!affordable}
                onClick={() =>
                  mutate((draft) => {
                    const result = buyUpgrade(draft, def.id, count);
                    if (!result.ok) toast(result.message ?? "Cannot buy that");
                    else if (result.message) toast(result.message);
                  })
                }
                className={`pressable m-1 shrink-0 rounded-lg py-1 text-[0.62rem] font-bold ${
                  affordable ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
                }`}
              >
                {atMax
                  ? "Maxed"
                  : `${formatNumber(cost, format)}${count > 1 ? ` x${count}` : ""} ${currency?.short ?? ""}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
