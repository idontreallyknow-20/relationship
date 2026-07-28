// The depths of the jar.
//
// This is the engine underneath everything else. Each depth's inhabitants
// produce the depth above them, and the surface produces hearts, so buying at
// depth six cascades down through five, four and three and arrives as hearts
// some seconds later. That chain is the only reason the numbers ever run away;
// without it every upgrade is a nudge and the game is over in an evening.
//
// Depths one and two are the otters and the crabs that were already here, so
// none of the personalisation is lost: hers still sit on the surface, his
// still walk the floor, and the crack-and-collect loop plays on top of this
// rather than beside it.

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
 * Ten purchases and the eleventh costs about a hundred times the first. Steep
 * enough that reaching further down is always tempting, shallow enough that
 * the next one is never far away.
 */
const GROWTH = 1.6;

/**
 * Each depth starts far dearer than the one above. This is what makes the
 * decision interesting: spend wide and shallow now, or save for one deep one
 * that pays for itself several times over.
 */
export const DEPTHS: DepthDef[] = [
  {
    tier: 1,
    id: "otters",
    name: "Otters",
    unit: "otters",
    blurb: "Hers. They float at the surface and crack things open.",
    color: "#a87f6a",
    baseCost: 10,
    growth: GROWTH,
    power: 1,
  },
  {
    tier: 2,
    id: "crabs",
    name: "Crabs",
    unit: "crabs",
    blurb: "His. They walk the floor and carry what falls back up.",
    color: "#8a5a4a",
    baseCost: 100,
    growth: GROWTH,
    power: 1,
  },
  {
    tier: 3,
    id: "kelp",
    name: "Kelp",
    unit: "fronds",
    blurb: "It grows where the light still reaches, and the crabs live in it.",
    color: "#5d7f5a",
    baseCost: 1e4,
    growth: GROWTH,
    power: 1,
    mods: { mul: { collectValue: 1.05 } },
  },
  {
    tier: 4,
    id: "clams",
    name: "Clams",
    unit: "clams",
    blurb: "Shut, mostly. What they open for, the kelp takes root in.",
    color: "#8f8299",
    baseCost: 1e7,
    growth: GROWTH,
    power: 1,
    mods: { mul: { pearlGain: 1.1 } },
  },
  {
    tier: 5,
    id: "urchins",
    name: "Urchins",
    unit: "urchins",
    blurb: "Slow, spined, and patient. The clams grow on what they leave.",
    color: "#6b5b8f",
    baseCost: 1e11,
    growth: GROWTH,
    power: 1,
    mods: { mul: { crackValue: 1.08 } },
  },
  {
    tier: 6,
    id: "rays",
    name: "Rays",
    unit: "rays",
    blurb: "They pass over the floor and stir it, and the urchins follow.",
    color: "#4a6b8f",
    baseCost: 1e16,
    growth: GROWTH,
    power: 1,
    mods: { mul: { all: 1.03 } },
  },
  {
    tier: 7,
    id: "eels",
    name: "Eels",
    unit: "eels",
    blurb: "Down where the light gave up. Nothing here is in a hurry.",
    color: "#3d4a6b",
    baseCost: 1e22,
    growth: GROWTH,
    power: 1,
    mods: { mul: { all: 1.05 } },
  },
  {
    tier: 8,
    id: "current",
    name: "The Current",
    unit: "currents",
    blurb: "Not alive. It moves everything above it anyway.",
    color: "#2a3350",
    baseCost: 1e30,
    growth: GROWTH,
    power: 1,
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
  return def.baseCost * Math.pow(def.growth, bought);
}

/**
 * Cost of `count` more in one go.
 *
 * The closed form of a geometric series, so buying a thousand at once is one
 * multiply rather than a thousand, which matters when an autobuyer is doing it
 * ten times a second.
 */
export function depthBulkCost(def: DepthDef, bought: number, count: number): number {
  if (count <= 0) return 0;
  const first = depthCost(def, bought);
  if (def.growth === 1) return first * count;
  return (first * (Math.pow(def.growth, count) - 1)) / (def.growth - 1);
}

/** How many more you could afford with `hearts`, solved rather than looped. */
export function depthAffordable(def: DepthDef, bought: number, hearts: number): number {
  if (hearts <= 0) return 0;
  const first = depthCost(def, bought);
  if (hearts < first) return 0;
  if (def.growth === 1) return Math.floor(hearts / first);
  const n = Math.log(1 + (hearts * (def.growth - 1)) / first) / Math.log(def.growth);
  return Math.max(0, Math.floor(n));
}

/* ------------------------------------------------------------------ */
/* Deepening                                                           */
/* ------------------------------------------------------------------ */

/**
 * How many of the deepest unlocked depth you need before the jar will go
 * deeper. Flat and small on purpose: this is the fast inner loop, and it must
 * never be the thing you are waiting on.
 */
export const DEEPEN_REQUIREMENT = 20;

/** Each deepening multiplies every depth's output, forever. */
export const DEEPEN_MULTIPLIER = 2;

/**
 * Deepening past the eighth needs the drop tree. Until then the chain stops at
 * The Current and further deepenings just pay the multiplier.
 */
export function maxDepthCount(extraDepths: number): number {
  return Math.min(DEPTHS.length + extraDepths, DEPTHS.length + 4);
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
