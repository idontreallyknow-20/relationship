// The shelf, which is where the hearts go once the jar is full.
//
// Asked for as "hearts are kind of stored elsewhere, and there should be
// various upgrades". This is that, and it is also the loop the game runs on:
//
//   fill the jar  ->  seal it  ->  it goes on the shelf and pays forever
//                 ->  take a bigger jar  ->  fill it faster
//
// It replaces deepening, which asked you to buy thirty of something at the
// bottom of an eight tier chain and then threw the chain away, and which nobody
// could describe in a sentence. This one is a sentence.
//
// The important property is that sealing never destroys anything. The hearts
// are not spent, they are moved: a sealed jar keeps paying a share of what was
// put in it, forever, so the shelf is both the passive income and a visible
// record of every jar the two of you have ever filled.

import type { GameState } from "../types";
import { safe } from "../numbers";

/**
 * What one heart on the shelf pays, per second, before any multiplier.
 *
 * This is the single most sensitive number in the new economy, and it sets the
 * pace of the whole game: income is proportional to what has been banked, and
 * what gets banked is income times time, so the run doubles roughly every
 * `ln 2 / SHELF_RATE` seconds of sealing. At 1/2000 that is about twenty-three
 * minutes at the start, and every multiplier bought shortens it.
 *
 * A tenth of this and the shelf is decoration. Ten times it and the jar reaches
 * the floating point ceiling inside an evening, which is the exact failure the
 * production chain kept producing.
 */
export const SHELF_RATE = 1 / 2000;

/**
 * How much of what is already on the shelf a jar has to hold before it counts
 * as full.
 *
 * Without this the loop eats itself. A jam jar holds four hundred hearts, and
 * four hundred hearts stops being a target roughly nine minutes in: measured,
 * the simulated player was sealing twenty-four times a minute and the beat that
 * is supposed to be the spine of the game had turned into a button that pays
 * ribbons for nothing.
 *
 * Tying capacity to the shelf makes it self-balancing, because income is
 * proportional to the shelf too: a jar always takes about the same couple of
 * minutes to fill however far in you are. The jar's own size is the floor, so
 * it is what matters early on when there is no shelf to measure against, and
 * the ladder still matters for its seats and its standing rules.
 */
export const CAPACITY_SHARE = 0.06;

/** Ribbons for the first seal, before any multiplier. */
export const RIBBON_BASE = 1;

/**
 * What sealing a jar pays.
 *
 * Logarithmic in the overshoot, like every other payout in this game and for
 * the same reason: late in a run the jar fills faster than you can watch, so
 * you never seal *at* the line, you seal well past it. Paying proportionally
 * for that overshoot turns the loop into a treadmill that speeds up until it
 * falls over.
 *
 * Sealing a jar exactly full pays one ribbon. Sealing one holding a thousand
 * times its capacity pays four.
 */
export function ribbonGain(hearts: number, capacity: number, multiplier = 1): number {
  if (!(hearts > 0)) return 0;
  // The last jar has no capacity, so there is nothing to overshoot. Its own
  // size stands in, otherwise `hearts / Infinity` is zero and it pays nothing.
  const bar = Number.isFinite(capacity) && capacity > 0 ? capacity : 1e18;
  if (hearts < bar) return 0;
  const past = 1 + Math.log10(Math.max(1, hearts / bar));
  return Math.max(1, Math.floor(RIBBON_BASE * past * multiplier));
}

/** A jar that has been filled, sealed and put away. */
export interface SealedJar {
  /** Which jar it was. */
  jarId: string;
  /** What was in it when it was sealed. */
  hearts: number;
  at: number;
}

/**
 * What the shelf pays per second.
 *
 * The sum of everything sealed, times the rate, times whatever the shelf tree
 * and the rest of the game have multiplied it by. Kept here rather than in
 * `formulas.ts` so that the one number that sets the pace of the game is in the
 * file that explains it.
 */
export function jarCapacity(base: number, shelfHearts: number): number {
  const share = Math.max(0, shelfHearts) * CAPACITY_SHARE;
  return safe(Math.max(base, share));
}

export function shelfIncome(state: GameState, rateMultiplier = 1): number {
  const banked = state.shelfHearts ?? 0;
  if (!(banked > 0)) return 0;
  return safe(banked * SHELF_RATE * rateMultiplier);
}

/** Everything the shelf is holding, for the readout. */
export function shelfTotal(state: GameState): number {
  return safe(state.shelfHearts ?? 0);
}

export interface ShelfUpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  growth: number;
  max: number;
  kind: "add" | "mulLinear" | "mulCompound";
  stat: string;
  per: number;
  /** Drawn as a branch, and the same shape the other trees use. */
  after?: string[];
}

/**
 * The shelf tree, bought with ribbons.
 *
 * Deliberately about the loop it sits in rather than about hearts in general:
 * every node here makes sealing better, the shelf pay faster, or the next jar
 * cheaper. A tree whose nodes could have gone in any other tree is a tree with
 * no reason to exist.
 */
export const SHELF_UPGRADES: ShelfUpgradeDef[] = [
  {
    id: "sh_rate", name: "Warm Shelf",
    description: "Everything on the shelf pays faster.",
    baseCost: 1, growth: 1.35, max: 200, kind: "mulLinear", stat: "shelfRate", per: 0.2,
  },
  {
    id: "sh_ribbons", name: "Longer Ribbon",
    description: "Sealing a jar pays more.",
    baseCost: 2, growth: 1.4, max: 100, kind: "mulLinear", stat: "ribbonGain", per: 0.15,
    after: ["sh_rate"],
  },
  {
    id: "sh_capacity", name: "Room To Spare",
    description: "Every jar holds less before it counts as full.",
    baseCost: 3, growth: 1.5, max: 60, kind: "mulLinear", stat: "jarCapacity", per: -0.02,
    after: ["sh_rate"],
  },
  {
    id: "sh_click", name: "Steady Pour",
    description: "Every tap puts more in.",
    baseCost: 2, growth: 1.32, max: 150, kind: "mulLinear", stat: "click", per: 0.18,
    after: ["sh_rate"],
  },
  {
    id: "sh_pets", name: "Good Company",
    description: "The pets carry more.",
    baseCost: 4, growth: 1.42, max: 120, kind: "mulLinear", stat: "cps", per: 0.2,
    after: ["sh_click"],
  },
  {
    id: "sh_seats", name: "Another Chair",
    description: "One more pet can sit around the jar.",
    baseCost: 25, growth: 2.4, max: 8, kind: "add", stat: "creatureSlots", per: 1,
    after: ["sh_pets"],
  },
  {
    id: "sh_keep", name: "Never Really Empty",
    description: "Sealing leaves this much of the jar behind.",
    baseCost: 8, growth: 1.7, max: 40, kind: "add", stat: "sealKeep", per: 0.01,
    after: ["sh_ribbons", "sh_capacity"],
  },
  {
    id: "sh_auto_seal", name: "Seals For You",
    description: "A full jar seals itself.",
    baseCost: 60, growth: 1, max: 1, kind: "add", stat: "autoSeal", per: 1,
    after: ["sh_keep"],
  },
  {
    id: "sh_offline", name: "While You Are Out",
    description: "The shelf keeps more of what it made without you.",
    baseCost: 12, growth: 1.55, max: 60, kind: "mulLinear", stat: "offline", per: 0.15,
    after: ["sh_ribbons"],
  },
  {
    id: "sh_hours", name: "Long Evening",
    description: "More hours away are counted.",
    baseCost: 15, growth: 1.6, max: 48, kind: "add", stat: "offlineHours", per: 1,
    after: ["sh_offline"],
  },
  {
    id: "sh_all", name: "The Whole Shelf",
    description: "Everything, a little more.",
    baseCost: 40, growth: 1.6, max: 80, kind: "mulLinear", stat: "all", per: 0.06,
    after: ["sh_seats", "sh_keep"],
  },
  {
    id: "sh_forever", name: "Every Jar So Far",
    description: "Everything, with no limit. Buy it forever.",
    baseCost: 250, growth: 1.14, max: Infinity, kind: "mulLinear", stat: "all", per: 0.03,
    after: ["sh_all"],
  },
];

export const SHELF_UPGRADE_BY_ID: Record<string, ShelfUpgradeDef> = Object.fromEntries(
  SHELF_UPGRADES.map((u) => [u.id, u]),
);

export function shelfUpgradeCost(def: ShelfUpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}
