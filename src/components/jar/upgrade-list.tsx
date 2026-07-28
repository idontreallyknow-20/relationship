"use client";

// One list, for all eight sets of upgrades.
//
// This replaces the tree canvas. The tree was asked for and then asked to go
// away again, and the reason given was the right one: with real branching, and
// nodes that fork and come back together, the connecting lines cross. That is
// not a bug in the layout, it is what a graph looks like once it is a graph
// rather than four straight columns, and no amount of tidying fixes it. A
// crossing line is noise, and a list has none.
//
// What the tree was actually good for is kept: the shape is still in the data,
// so the list reads in dependency order and every row says what it grows out of
// and what it leads to. That is the part that helped you plan. The picture was
// the part that did not.

import { useMemo, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { formatNumber, type NumberFormat } from "@/game/numbers";

export interface UpgradeRow {
  id: string;
  /** Every upgrade this one grows out of. Drives the reading order. */
  after: string[];
  name: string;
  /** One short line: what the next level does. */
  effect: string;
  description: string;
  level: number;
  max: number;
  cost: number;
  buyCount: number;
  currencyShort: string;
  colour: string;
  unlocked: boolean;
  affordable: boolean;
  lockReason?: string;
}

/**
 * Sort so that nothing appears above the thing it grows out of.
 *
 * A plain depth-first walk from the roots, which for these sets is also the
 * order somebody would explain them in. Anything left over after the walk (a
 * cycle, or a parent filtered out of this view) is appended rather than
 * dropped, because a missing row is worse than an oddly placed one.
 */
function inOrder(rows: UpgradeRow[]): UpgradeRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map<string, string[]>();
  const roots: UpgradeRow[] = [];

  for (const row of rows) {
    const parents = row.after.filter((p) => byId.has(p));
    if (parents.length === 0) {
      roots.push(row);
      continue;
    }
    // Filed under its first real parent, so a merge node appears once, under
    // the line it most obviously continues.
    const first = parents[0];
    children.set(first, [...(children.get(first) ?? []), row.id]);
  }

  const out: UpgradeRow[] = [];
  const seen = new Set<string>();
  const walk = (row: UpgradeRow, depth: number) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    out.push({ ...row, depth } as UpgradeRow & { depth: number });
    for (const childId of children.get(row.id) ?? []) {
      const child = byId.get(childId);
      if (child) walk(child, depth + 1);
    }
  };
  for (const root of roots) walk(root, 0);
  for (const row of rows) if (!seen.has(row.id)) out.push(row);
  return out;
}

export function UpgradeList({
  rows,
  format,
  onBuy,
  emptyLabel = "Nothing here yet.",
}: {
  rows: UpgradeRow[];
  format: NumberFormat;
  onBuy: (id: string) => void;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ordered = useMemo(() => inOrder(rows), [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-berry-soft">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((row) => {
        const atMax = row.max !== Infinity && row.level >= row.max;
        const owned = row.level > 0;
        const expanded = open === row.id;
        const grownFrom = row.after.map((id) => byId.get(id)?.name).filter(Boolean);
        const leadsTo = rows.filter((r) => r.after.includes(row.id)).map((r) => r.name);

        return (
          <li
            key={row.id}
            className={`rounded-card border bg-white shadow-soft transition-colors ${
              !row.unlocked
                ? "border-line-soft opacity-60"
                : row.affordable
                  ? "border-rose-dark"
                  : "border-line"
            }`}
          >
            <div className="flex items-start gap-2 p-3.5">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setOpen(expanded ? null : row.id)}
                aria-expanded={expanded}
              >
                <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                  {!row.unlocked && <Lock className="h-3.5 w-3.5 shrink-0 text-berry-soft" />}
                  <span className="truncate">{row.name}</span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold"
                    style={{
                      backgroundColor: owned ? row.colour : "var(--color-cream)",
                      color: owned ? "#fff" : "var(--color-berry-soft)",
                    }}
                  >
                    {row.level}{row.max !== Infinity ? ` / ${row.max}` : ""}
                  </span>
                  <ChevronDown
                    className={`ml-auto h-3.5 w-3.5 shrink-0 text-berry-soft transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </p>
                <p className="mt-0.5 text-xs text-berry-soft">{row.description}</p>
                <p className="mt-1 text-xs font-semibold" style={{ color: row.colour }}>
                  {atMax ? "Maxed" : row.effect}
                </p>
              </button>

              {atMax ? (
                <span className="shrink-0 rounded-xl bg-cream px-3 py-2 text-xs font-bold text-berry-soft">
                  Maxed
                </span>
              ) : !row.unlocked ? (
                <span className="shrink-0 rounded-xl bg-cream px-3 py-2 text-center text-[0.65rem] font-bold text-berry-soft">
                  {row.lockReason ?? "Not yet"}
                </span>
              ) : (
                <button
                  disabled={!row.affordable}
                  onClick={() => onBuy(row.id)}
                  className={`pressable shrink-0 rounded-xl px-3 py-2 text-center text-xs font-bold ${
                    row.affordable ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
                  }`}
                >
                  {formatNumber(row.cost, format)}
                  {row.buyCount > 1 ? ` x${row.buyCount}` : ""}
                  <span className="block text-[0.55rem] font-semibold opacity-80">
                    {row.currencyShort}
                  </span>
                </button>
              )}
            </div>

            {/* What it grows out of, which is what the drawn tree was for. */}
            {expanded && (grownFrom.length > 0 || leadsTo.length > 0) && (
              <div className="border-t border-line-soft px-3.5 py-2.5 text-xs text-berry-soft">
                {grownFrom.length > 0 && <p>Grows out of {grownFrom.join(" and ")}.</p>}
                {leadsTo.length > 0 && (
                  <p className={grownFrom.length > 0 ? "mt-1" : undefined}>
                    Leads to {leadsTo.join(", ")}.
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
