// Time dilation: making the jar worse on purpose.
//
// Every other layer in this game asks you to reset and come back stronger.
// This one asks you to keep playing while everything is slower, and pays for
// how far you get anyway. It is the last thing that unlocks and the only one
// that changes the arithmetic rather than the numbers.
//
// What "slower" means, precisely: production is raised to a power below one.
// Ten to the twelve becomes ten to the seven and a bit. That is a small
// penalty when your numbers are small and a devastating one when they are
// large, which is exactly the right shape for a mechanic meant to sit at the
// end of the game and stop mattering as you invest in it.

import type { AddStat, Mods, MulStat } from "../types";

/**
 * The exponent applied to hearts per second and per tap while dilated.
 *
 * Slightly gentler than Antimatter Dimensions, which this is openly borrowed
 * from, because this jar has fewer layers underneath to soften the landing.
 */
export const BASE_DILATION_POWER = 0.62;

/** The ceiling `Slower Still` climbs toward. Never reaches one. */
export const MAX_DILATION_POWER = 0.9;

/**
 * How dilated production is actually computed.
 *
 * Guarded below one, because raising a number under one to a fractional power
 * makes it bigger, and a mechanic advertised as a penalty must never quietly
 * become a bonus for a jar that has just been reborn.
 */
export function dilate(value: number, power: number): number {
  if (!Number.isFinite(value) || value <= 1) return Math.max(0, value);
  return Math.pow(value, Math.min(MAX_DILATION_POWER, Math.max(0.1, power)));
}

/**
 * Hearts needed in one dilated stretch before it pays anything.
 *
 * Rises with each stretch finished, and capped for the same reason every other
 * requirement in this game is: a bar above what a floating point number can
 * hold is not difficulty, it is the end of the game with no message.
 */
export const DILATION_REQUIREMENT = 1e8;

export function dilationRequirement(runs: number): number {
  return Math.min(1e200, DILATION_REQUIREMENT * Math.pow(50, runs));
}

/**
 * What a finished stretch pays.
 *
 * Logarithmic in the overshoot, like every other reset in this game, and for
 * the same reason: the last minute of a stretch is worth more than every
 * minute before it put together, and paying proportionally for that turns the
 * layer into a treadmill that speeds up.
 */
export function hourGain(dilatedHearts: number, runs: number, multiplier = 1): number {
  const bar = dilationRequirement(runs);
  if (!(dilatedHearts >= bar)) return 0;
  const past = 1 + Math.log10(Math.max(1, dilatedHearts / bar));
  return Math.floor(past * 5 * multiplier);
}

export interface DilationUpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  growth: number;
  max: number;
  kind: "add" | "mulLinear" | "power";
  stat?: AddStat | MulStat;
  per: number;
  requires?: [string, number];
}

/**
 * A small tree, on purpose.
 *
 * Nine entries against the moon tree's twenty six. This is the last layer and
 * the player reaching it has spent weeks reading upgrade lists; what it wants
 * is a handful of decisions that each visibly change something, not another
 * screen to scroll.
 */
export const DILATION_UPGRADES: DilationUpgradeDef[] = [
  {
    id: "t_power",
    name: "Slower Still",
    description: "Dilation costs you less. This is the one everything else waits on.",
    baseCost: 2, growth: 2.2, max: 20, kind: "power", per: 0.014,
  },
  {
    id: "t_all",
    name: "Longer Hours",
    description: "Everything, dilated or not.",
    baseCost: 1, growth: 1.6, max: 100, kind: "mulLinear", stat: "all", per: 0.5,
  },
  {
    id: "t_hours",
    name: "More Hours",
    description: "Every stretch from here pays more.",
    baseCost: 4, growth: 1.8, max: 50, kind: "mulLinear", stat: "hourGain", per: 0.3,
  },
  {
    id: "t_depth",
    name: "Slow Water",
    description: "Every tier of the chain, far stronger.",
    baseCost: 3, growth: 1.7, max: 100, kind: "mulLinear", stat: "shelfRate", per: 2,
  },
  {
    id: "t_speed",
    name: "The Long Afternoon",
    description: "Everything in the jar moves faster, which is the joke.",
    baseCost: 5, growth: 1.75, max: 60, kind: "mulLinear", stat: "petSpeed", per: 1.5,
  },
  {
    id: "t_tap",
    name: "Hands That Do Not Tire",
    description: "The jar taps for you enormously more often.",
    baseCost: 3, growth: 1.6, max: 100, kind: "add", stat: "autoTapsPerSecond", per: 2_000,
  },
  {
    id: "t_moons",
    name: "Every Life Counts",
    description: "Rebirths and deep rebirths both pay far more.",
    baseCost: 8, growth: 1.9, max: 40, kind: "mulLinear", stat: "moonGain", per: 0.8,
  },
  {
    id: "t_offline",
    name: "Time Is Time",
    description: "Hours away count in full, and there are far more of them.",
    baseCost: 6, growth: 1.8, max: 60, kind: "add", stat: "offlineHours", per: 24,
    requires: ["t_power", 3],
  },
  {
    id: "t_keep",
    name: "It Remembers",
    description: "Keep far more of every tree through a rebirth.",
    baseCost: 12, growth: 2.1, max: 30, kind: "add", stat: "startingUpgrades", per: 10,
    requires: ["t_power", 5],
  },
];

export const DILATION_UPGRADE_BY_ID: Record<string, DilationUpgradeDef> = Object.fromEntries(
  DILATION_UPGRADES.map((u) => [u.id, u]),
);

export function dilationUpgradeCost(def: DilationUpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}

export function dilationUpgradeMods(def: DilationUpgradeDef, level: number): Mods {
  if (level <= 0 || def.kind === "power" || !def.stat) return {};
  if (def.kind === "add") return { add: { [def.stat as AddStat]: def.per * level } };
  return { mul: { [def.stat as MulStat]: 1 + def.per * level } };
}

/** The exponent, after however many levels of `Slower Still` are owned. */
export function dilationPower(levels: Record<string, number>): number {
  const bought = levels["t_power"] ?? 0;
  const def = DILATION_UPGRADE_BY_ID["t_power"];
  return Math.min(MAX_DILATION_POWER, BASE_DILATION_POWER + bought * def.per);
}
