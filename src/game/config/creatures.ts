import type { CurrencyId, Mods, Person } from "../types";

// Two lines, one each, mechanically opposite and mutually dependent.
//
// Otters live on the surface and crack shells open. What they crack falls.
// Crabs live on the floor and collect what falls. Neither line is complete on
// its own, which is the whole point: playing your half makes your partner's
// half stronger, without either of you needing to be online at the same time.

export type Line = "otter" | "crab";

export const LINE_OWNER: Record<Line, Person> = {
  otter: "cami",
  crab: "joseph",
};

export const LINE_NAME: Record<Line, string> = {
  otter: "Otters",
  crab: "Crabs",
};

export interface CreatureDef {
  id: string;
  name: string;
  line: Line;
  /** Unlock order within the line, 1 to 7. */
  tier: number;
  blurb: string;
  /** The one thing that makes this creature different. */
  ability: string;
  color: string;
  /** Seconds between actions at level 1. Falls with level. */
  interval: number;
  /** Multiplier on this creature's action payout. */
  power: number;
  /** Always-on contribution while it is in the jar. */
  mods?: Mods;
  cost: { currency: CurrencyId; amount: number } | null;
  unlockLifetime: number;
  evolvesTo?: string;
  evolveAt?: { level: number; glass: number };
  /** Otters need water. A shallow vessel cannot hold the deep ones. */
  /** Ribbons are the plain currency for a pet: seal a jar, seat a friend. */
  /** Crabs need floor. A narrow vessel cannot hold the big ones. */
  maxLevel: number;
}

const otter = (
  id: string, name: string, tier: number, blurb: string, ability: string,
  color: string, interval: number, power: number,
  extra: Partial<CreatureDef> = {},
): CreatureDef => ({
  id, name, line: "otter", tier, blurb, ability, color, interval, power,
  cost: null, unlockLifetime: 0, maxLevel: 100, ...extra,
});

const crab = (
  id: string, name: string, tier: number, blurb: string, ability: string,
  color: string, interval: number, power: number,
  extra: Partial<CreatureDef> = {},
): CreatureDef => ({
  id, name, line: "crab", tier, blurb, ability, color, interval, power,
  cost: null, unlockLifetime: 0, maxLevel: 100, ...extra,
});

export const CREATURES: CreatureDef[] = [
  /* ---------------------------------------------------------------- */
  /* Cami's otters. Surface, active, burst.                            */
  /* ---------------------------------------------------------------- */
  otter(
    "river_otter", "River Otter", 1,
    "Hers from the first second, and not going anywhere.",
    "Cracks a shell open on its chest. That is the whole job and it is good at it.",
    "#a87f6a", 6, 1,
    { evolvesTo: "sea_otter", evolveAt: { level: 25, glass: 400 } },
  ),
  otter(
    "otter_pup", "Otter Pup", 2,
    "Too small to crack anything. Watches closely.",
    "Copies half of whatever the otter beside it just did.",
    "#c9a68a", 6, 0.5,
    { cost: { currency: "ribbons", amount: 3 }, unlockLifetime: 50_000 },
  ),
  otter(
    "sea_otter", "Sea Otter", 3,
    "Bigger, and knows which shells are worth opening.",
    "Carries a bigger heart over, and sometimes two at once.",
    "#8a6a52", 5.5, 2.4,
    { cost: { currency: "ribbons", amount: 10 }, unlockLifetime: 2e6 },
  ),
  otter(
    "kelp_otter", "Kelp Otter", 4,
    "Wraps itself in kelp so it does not drift while it sleeps.",
    "Keeps cracking while the app is closed.",
    "#6a8a5a", 7, 2,
    {
      cost: { currency: "ribbons", amount: 35 }, unlockLifetime: 5e7,
      mods: { mul: { offline: 1.4 }, add: { offlineHours: 2 } },
    },
  ),
  otter(
    "moonlight_otter", "Moonlight Otter", 5,
    "Only really wakes up once it is dark.",
    "Everything it does after sunset counts double.",
    "#7f7fa8", 5, 3.2,
    { cost: { currency: "ribbons", amount: 120 }, unlockLifetime: 2e9 },
  ),
  otter(
    "giant_otter", "Giant Otter", 6,
    "The size of a person, and entirely unbothered by that.",
    "Cracks three shells at once.",
    "#5a4a3a", 6, 7,
    { cost: { currency: "stars", amount: 2 }, unlockLifetime: 1e13 },
  ),
  otter(
    "golden_otter", "Golden Otter", 7,
    "Nobody agrees on where it came from.",
    "Every single crack is a critical.",
    "#d0a84a", 4.5, 12,
    { cost: { currency: "stars", amount: 12 }, unlockLifetime: 1e17 },
  ),

  /* ---------------------------------------------------------------- */
  /* Joseph's crabs. Floor, patient, accumulate.                       */
  /* ---------------------------------------------------------------- */
  crab(
    "shore_crab", "Shore Crab", 1,
    "His from the first second. Walks sideways with purpose.",
    "Collects whatever has settled on the floor.",
    "#8a5a4a", 5, 1,
    { evolvesTo: "hermit_crab", evolveAt: { level: 25, glass: 400 } },
  ),
  crab(
    "hermit_crab", "Hermit Crab", 2,
    "Borrowed everything it is wearing.",
    "Whatever shell it carries counts for twice as much.",
    "#a86a4a", 5.5, 1.4,
    { cost: { currency: "ribbons", amount: 3 }, unlockLifetime: 50_000 },
  ),
  crab(
    "fiddler_crab", "Fiddler Crab", 3,
    "One claw far too large for the rest of it.",
    "Slow, but each collection is worth a great deal more.",
    "#c07a4a", 9, 4,
    { cost: { currency: "ribbons", amount: 10 }, unlockLifetime: 2e6 },
  ),
  crab(
    "sand_crab", "Sand Crab", 4,
    "Disappears into the floor and reappears somewhere else.",
    "Sifts settled hearts into ribbons while you are away.",
    "#c0a880", 6, 2.2,
    {
      cost: { currency: "ribbons", amount: 35 }, unlockLifetime: 5e7,
      mods: { mul: { ribbonGain: 1.6, offline: 1.3 } },
    },
  ),
  crab(
    "ghost_crab", "Ghost Crab", 5,
    "You mostly notice it after it has already gone.",
    "Sweeps the entire floor in one pass instead of one item at a time.",
    "#d8d0c0", 3, 3,
    { cost: { currency: "ribbons", amount: 120 }, unlockLifetime: 2e9 },
  ),
  crab(
    "coconut_crab", "Coconut Crab", 6,
    "Opens things that are not supposed to open.",
    "Anything that drifts into the jar gives up far sooner.",
    "#7a5a3a", 7, 6,
    { cost: { currency: "stars", amount: 2 }, unlockLifetime: 1e13 },
  ),
  crab(
    "sapphire_crab", "Sapphire Crab", 7,
    "Found at the bottom, where it is dark and the pressure is unkind.",
    "Everything it picks up turns into ribbons.",
    "#4a6ac0", 5, 11,
    { cost: { currency: "stars", amount: 12 }, unlockLifetime: 1e17 },
  ),
];

export const CREATURE_BY_ID: Record<string, CreatureDef> = Object.fromEntries(
  CREATURES.map((c) => [c.id, c]),
);

export const OTTERS = CREATURES.filter((c) => c.line === "otter");
export const CRABS = CREATURES.filter((c) => c.line === "crab");

/** The one each person starts with, free, already in the jar. */
export const STARTER: Record<Person, string> = {
  cami: "river_otter",
  joseph: "shore_crab",
};

/* ------------------------------------------------------------------ */
/* Traits, rolled once when a creature arrives                         */
/* ------------------------------------------------------------------ */

export interface TraitDef {
  id: string;
  name: string;
  line: Line | "any";
  description: string;
  mods: Mods;
  weight: number;
}

export const TRAITS: TraitDef[] = [
  { id: "eager", name: "Eager", line: "any", description: "Acts more often.", mods: { mul: { petSpeed: 1.3225 } }, weight: 100 },
  { id: "strong", name: "Strong", line: "any", description: "Each action is worth more.", mods: { mul: { petValue: 1.44 } }, weight: 100 },
  { id: "sleepy", name: "Sleepy", line: "any", description: "Far better while you are away.", mods: { mul: { offline: 1.3 } }, weight: 70 },
  { id: "lucky", name: "Lucky", line: "any", description: "Finds ribbons it had no right to find.", mods: { mul: { ribbonGain: 1.35 } }, weight: 45 },
  { id: "tidy", name: "Tidy", line: "crab", description: "Comes back with more than it left with.", mods: { mul: { ribbonGain: 1.4 } }, weight: 60 },
  { id: "playful", name: "Playful", line: "otter", description: "Raises the whole raft.", mods: { mul: { petValue: 1.15, all: 1.04 } }, weight: 60 },
  { id: "patient", name: "Patient", line: "crab", description: "Slower, but much heavier.", mods: { mul: { petValue: 1.5, petSpeed: 0.8 } }, weight: 50 },
  { id: "clingy", name: "Clingy", line: "otter", description: "Holds hands twice as tightly.", mods: { mul: { pairBonus: 2 } }, weight: 40 },
  { id: "bright", name: "Bright", line: "any", description: "A little of everything.", mods: { mul: { all: 1.07 } }, weight: 20 },
  { id: "devoted", name: "Devoted", line: "any", description: "A lot of everything.", mods: { mul: { all: 1.18 } }, weight: 5 },
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export function traitsFor(line: Line): TraitDef[] {
  return TRAITS.filter((t) => t.line === "any" || t.line === line);
}

/* ------------------------------------------------------------------ */
/* Scaling                                                             */
/* ------------------------------------------------------------------ */

/** A creature at level 100 is roughly eight times its level 1 self. */
export function creatureScale(level: number, stars: number): number {
  return (1 + (level - 1) * 0.07) * (1 + stars * 0.3);
}

export function xpFor(level: number): number {
  return Math.floor(35 * Math.pow(1.17, level - 1));
}

export function feedCost(level: number): number {
  return Math.max(1, Math.floor(3 * Math.pow(1.08, level)));
}

/** Seconds between actions, after level and speed multipliers. */
export function actionInterval(def: CreatureDef, level: number, speedMul: number): number {
  const levelled = def.interval * (1 - Math.min(0.5, (level - 1) * 0.005));
  return Math.max(0.4, levelled / Math.max(0.1, speedMul));
}
