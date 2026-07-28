// The chain: the jar filling up, and then filling up other things.
//
// Each tier makes the tier above it, and the first one makes hearts. Buying
// at tier four cascades down through three and two and arrives as hearts a few
// seconds later, which is the only reason the numbers ever run away.
//
// These used to be named after the otters and the crabs, which made the pets
// the spine of the game rather than a thing you keep. They are their own
// system now, and this is deliberately the plainest fiction available: a jar
// fills, then a shelf of jars, then a room of shelves. Nobody has to be told
// what a shelf is.

import type { Mods } from "../types";

export interface DepthDef {
  /** 1 at the surface, rising as you go down. */
  tier: number;
  id: string;
  name: string;
  /** Plural, for "you own 12 kelp". */
  unit: string;
  blurb: string;
  color: string;
  /** Hearts for the first one. Every purchase after costs `growth` times more. */
  baseCost: number;
  growth: number;
  /**
   * How much of the depth above one of these makes per second, before any
   * multiplier. Deeper things are individually slower; they win by compounding.
   */
  power: number;
  /** Always-on while you own at least one. */
  mods?: Mods;
}

/**
 * How many you buy at one price before the price steps up.
 *
 * The cost rising on every single purchase was the whole early-game problem:
 * twenty otters at 1.6x each came to two hundred thousand hearts, which at
 * starting income is two days of waiting for the first deepening. Stepping the
 * price every ten purchases instead means the first twenty are cheap, the
 * hundredth is dear, and there is no wall in between.
 */
const TIER_SIZE = 10;

/** What the price multiplies by at each step of ten. */
const GROWTH = 3.2;

/**
 * How fast one of anything makes the thing above it, per second.
 *
 * This is the single most sensitive number in the game. At 1 the chain reached
 * the floating point ceiling inside half an hour of play; the compounding is
 * seven layers deep, so a factor here is that factor to the seventh power by
 * the time it arrives as hearts. Roughly eight of a depth to make one of the
 * depth above each second is slow enough to last months and fast enough to
 * watch.
 */
const BASE_POWER = 0.12;

/**
 * How much slower each depth is than the one above it.
 *
 * Without this every depth ran at the same rate, and eight equal layers make
 * hearts grow as a degree-seven polynomial in time: measured, that reached the
 * floating point ceiling in fourteen minutes no matter how the costs were
 * priced. Deeper things being individually slower is both the obvious fiction
 * and the thing that makes the curve survive a long game.
 */
const POWER_FALLOFF = 0.6;

function powerFor(tier: number): number {
  return BASE_POWER * Math.pow(POWER_FALLOFF, tier - 1);
}

/**
 * Each depth starts far dearer than the one above. This is what makes the
 * decision interesting: spend wide and shallow now, or save for one deep one
 * that pays for itself several times over.
 */
export const DEPTHS: DepthDef[] = [
  {
    tier: 1,
    id: "hearts",
    name: "Hearts",
    unit: "hearts",
    blurb: "One at a time, into the jar.",
    color: "#a85b73",
    baseCost: 10,
    growth: GROWTH,
    power: powerFor(1),
  },
  {
    tier: 2,
    id: "handfuls",
    name: "Handfuls",
    unit: "handfuls",
    blurb: "Enough to cup in both hands.",
    color: "#b8748a",
    baseCost: 100,
    growth: GROWTH,
    power: powerFor(2),
  },
  {
    tier: 3,
    id: "jars",
    name: "Jars",
    unit: "jars",
    blurb: "A whole jar of them, filled and sealed.",
    color: "#8a6a9c",
    baseCost: 1_200,
    growth: GROWTH,
    power: powerFor(3),
    mods: { mul: { cps: 1.05 } },
  },
  {
    tier: 4,
    id: "shelves",
    name: "Shelves",
    unit: "shelves",
    blurb: "A shelf of jars, and room for more.",
    color: "#6b6ba8",
    baseCost: 4e4,
    growth: GROWTH,
    power: powerFor(4),
    mods: { mul: { pearlGain: 1.1 } },
  },
  {
    tier: 5,
    id: "rooms",
    name: "Rooms",
    unit: "rooms",
    blurb: "A room of shelves. It got out of hand.",
    color: "#5a7f9c",
    baseCost: 2e6,
    growth: GROWTH,
    power: powerFor(5),
    mods: { mul: { click: 1.08 } },
  },
  {
    tier: 6,
    id: "houses",
    name: "Houses",
    unit: "houses",
    blurb: "A house of rooms, all of them full.",
    color: "#4a7f7a",
    baseCost: 5e8,
    growth: GROWTH,
    power: powerFor(6),
    mods: { mul: { all: 1.03 } },
  },
  {
    tier: 7,
    id: "streets",
    name: "Streets",
    unit: "streets",
    blurb: "A street of houses. Everyone knows.",
    color: "#4a6b5a",
    baseCost: 2e11,
    growth: GROWTH,
    power: powerFor(7),
    mods: { mul: { all: 1.05 } },
  },
  {
    tier: 8,
    id: "towns",
    name: "Towns",
    unit: "towns",
    blurb: "You have run out of words for this.",
    color: "#3d5044",
    baseCost: 1e15,
    growth: GROWTH,
    power: powerFor(8),
    mods: { mul: { all: 1.08 } },
  },
];

export const DEPTH_BY_ID: Record<string, DepthDef> = Object.fromEntries(
  DEPTHS.map((d) => [d.id, d]),
);

/** How many depths exist at all, before the drop tree extends the chain. */
export const BASE_DEPTH_COUNT = DEPTHS.length;

/** Cost of the next one, given how many have been bought at this depth. */
export function depthCost(def: DepthDef, bought: number): number {
  return def.baseCost * Math.pow(def.growth, Math.floor(bought / TIER_SIZE));
}

/**
 * Cost of `count` more in one go.
 *
 * Walks the price steps rather than summing a geometric series, because the
 * price is a staircase now, not a curve. The loop is bounded by how many times
 * a number can triple before it leaves floating point, so a few hundred
 * iterations at the absolute worst and single digits in practice.
 */
export function depthBulkCost(def: DepthDef, bought: number, count: number): number {
  if (count <= 0) return 0;
  let total = 0;
  let done = 0;
  let at = bought;
  while (done < count) {
    const room = TIER_SIZE - (at % TIER_SIZE);
    const take = Math.min(room, count - done);
    total += depthCost(def, at) * take;
    if (!Number.isFinite(total)) return Infinity;
    done += take;
    at += take;
  }
  return total;
}

/** How many more you could afford with `hearts`. */
export function depthAffordable(def: DepthDef, bought: number, hearts: number): number {
  if (hearts <= 0) return 0;
  let budget = hearts;
  let count = 0;
  let at = bought;
  // Bounded by the price outgrowing any possible budget.
  for (let step = 0; step < 2_000; step++) {
    const price = depthCost(def, at);
    if (!Number.isFinite(price) || price > budget) break;
    const room = TIER_SIZE - (at % TIER_SIZE);
    const affordable = Math.min(room, Math.floor(budget / price));
    if (affordable <= 0) break;
    budget -= price * affordable;
    count += affordable;
    at += affordable;
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Deepening                                                           */
/* ------------------------------------------------------------------ */

/**
 * How many of the deepest unlocked depth you need before the jar will go
 * deeper.
 *
 * It rises, because a flat requirement meant every depth was open within
 * minutes and the permanent multiplier compounded without limit. It rises
 * gently, because this is still the fast inner loop and must never be the
 * thing you sit and wait for.
 */
export const DEEPEN_REQUIREMENT = 20;

export function deepenRequirement(deepens: number): number {
  // Steep, and capped.
  //
  // The count resets at every rebirth, so this is the shape of one life: the
  // first few deepenings are minutes apart, the tenth is an event, and past
  // the cap each one costs a fixed four thousand purchases, which at a price
  // that triples every ten is an enormous and rising number of hearts.
  //
  // It used to rise twelve percent a step and stop at fifteen hundred, which
  // in practice meant it stopped rising almost immediately and a life could
  // deepen indefinitely. That was the engine behind the twenty-minute game.
  //
  // The cap itself is not a design choice, it is arithmetic: the price
  // staircase leaves the range of a floating point number at roughly five
  // thousand purchases, and a requirement past that is not expensive, it is
  // unreachable.
  return Math.min(4_000, Math.ceil(DEEPEN_REQUIREMENT * Math.pow(1.2, deepens)));
}

/**
 * Each deepening multiplies every depth's output, forever.
 *
 * Modest on purpose. Doubling compounded with the chain's own growth and the
 * moon tree's multipliers, and thirteen deepenings were enough to leave the
 * range of a double entirely.
 */
export const DEEPEN_MULTIPLIER = 1.5;

/**
 * How many depths an ordinary game reaches.
 *
 * Five, not eight. Each layer multiplies the growth by another factor of time,
 * and measured, eight equal layers reached the floating point ceiling inside
 * fifteen minutes however the costs were priced: the maths does not fit in a
 * double, and this game has no big-number type. Five is a degree-four curve,
 * which lasts.
 *
 * The last three are still there, reached only through the drop tree, so the
 * chain does grow again in the endgame when the resets that come with it can
 * absorb the numbers.
 */
export const REACHABLE_DEPTHS = 3;

export function maxDepthCount(extraDepths: number): number {
  return Math.min(REACHABLE_DEPTHS + extraDepths, DEPTHS.length);
}

/* ------------------------------------------------------------------ */
/* Tide, which is the speed of everything                              */
/* ------------------------------------------------------------------ */

/**
 * Tide is the one dial that touches every depth at once, and it is the shared
 * one: it rises when either of you plays. Buying it costs hearts and gets
 * dearer, so it competes with buying depth rather than replacing it.
 */
export const TIDE_BASE_COST = 1_000;
export const TIDE_COST_GROWTH = 1.18;
/** Each purchase makes everything act this much faster. */
export const TIDE_SPEED_PER = 1.08;

export function tideCost(bought: number): number {
  return TIDE_BASE_COST * Math.pow(TIDE_COST_GROWTH, bought);
}

export function tideBulkCost(bought: number, count: number): number {
  if (count <= 0) return 0;
  const first = tideCost(bought);
  return (first * (Math.pow(TIDE_COST_GROWTH, count) - 1)) / (TIDE_COST_GROWTH - 1);
}

export function tideAffordable(bought: number, hearts: number): number {
  if (hearts <= 0) return 0;
  const first = tideCost(bought);
  if (hearts < first) return 0;
  const n =
    Math.log(1 + (hearts * (TIDE_COST_GROWTH - 1)) / first) / Math.log(TIDE_COST_GROWTH);
  return Math.max(0, Math.floor(n));
}

/** The speed multiplier from every tide purchase so far. */
export function tideSpeed(bought: number): number {
  return Math.pow(TIDE_SPEED_PER, bought);
}
