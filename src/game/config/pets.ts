import type { AddStat, Mods, MulStat, Rarity } from "../types";

// Pets. Thirty definitions, nine rarities, and a deliberate rule: rarity buys
// breadth, not raw power. A common pet that does one thing is often the right
// pick for a build that only cares about that one thing.

export interface PetStatSpec {
  kind: "add" | "mul";
  stat: AddStat | MulStat;
  /** Value at level 1. Grows with level and stars. */
  per: number;
}

export interface PetDef {
  id: string;
  name: string;
  rarity: Rarity;
  color: string;
  /** What kind of build this pet is for. Shown in the codex. */
  playstyle: string;
  ability: string;
  stats: PetStatSpec[];
  /** Egg pools this pet can come from. */
  eggs: string[];
  evolvesTo?: string;
  /** Level and shards required to evolve. */
  evolveAt?: { level: number; shards: number };
  maxLevel: number;
}

export const RARITY_ORDER: Rarity[] = [
  "common", "uncommon", "rare", "epic", "legendary", "mythic", "celestial", "eternal", "secret",
];

export const RARITY_META: Record<Rarity, { label: string; color: string; weight: number; power: number }> = {
  common: { label: "Common", color: "#8a7f86", weight: 1000, power: 1 },
  uncommon: { label: "Uncommon", color: "#5f8a6a", weight: 460, power: 1.35 },
  rare: { label: "Rare", color: "#4f7bd0", weight: 180, power: 1.8 },
  epic: { label: "Epic", color: "#8f6ad0", weight: 62, power: 2.4 },
  legendary: { label: "Legendary", color: "#c99a3f", weight: 20, power: 3.2 },
  mythic: { label: "Mythic", color: "#c05c8e", weight: 6, power: 4.2 },
  celestial: { label: "Celestial", color: "#3fa6b0", weight: 1.6, power: 5.5 },
  eternal: { label: "Eternal", color: "#3f5d8a", weight: 0.35, power: 7 },
  secret: { label: "Secret", color: "#43273b", weight: 0.05, power: 9 },
};

function pet(
  id: string,
  name: string,
  rarity: Rarity,
  color: string,
  playstyle: string,
  ability: string,
  stats: PetStatSpec[],
  eggs: string[],
  extra: Partial<PetDef> = {},
): PetDef {
  return { id, name, rarity, color, playstyle, ability, stats, eggs, maxLevel: 100, ...extra };
}

const m = (stat: MulStat, per: number): PetStatSpec => ({ kind: "mul", stat, per });
const a = (stat: AddStat, per: number): PetStatSpec => ({ kind: "add", stat, per });

export const PETS: PetDef[] = [
  // Common: narrow but genuinely strong at their one job.
  pet("heart_puppy", "Heart Puppy", "common", "#d99a86", "Pure clicking", "Nudges the heart every time you tap.",
    [m("click", 0.06)], ["basic"], { evolvesTo: "heart_dog", evolveAt: { level: 25, shards: 40 } }),
  pet("love_cat", "Love Cat", "common", "#b58fae", "Passive income", "Sits on the jar and hearts appear.",
    [m("cps", 0.07)], ["basic"], { evolvesTo: "moon_cat", evolveAt: { level: 25, shards: 40 } }),
  pet("pink_slime", "Pink Slime", "common", "#e2a0c0", "Combo starter", "Keeps the rhythm going a little longer.",
    [a("comboDurationMs", 90)], ["basic"]),
  pet("golden_snail", "Golden Snail", "common", "#c9b06a", "Offline", "Slow, patient, and works while you sleep.",
    [m("offline", 0.09), a("offlineHours", 0.2)], ["basic"]),
  pet("lucky_frog", "Lucky Frog", "common", "#7fa06a", "Luck", "Finds things you would have walked past.",
    [a("luck", 0.012)], ["basic"]),

  // Uncommon.
  pet("cupid_bunny", "Cupid Bunny", "uncommon", "#e0a8b8", "Criticals", "Aims for the soft spot.",
    [a("critChance", 0.012), m("crit", 0.05)], ["basic", "meadow"]),
  pet("rose_fox", "Rose Fox", "uncommon", "#c47a6a", "Golden hunting", "Sniffs out golden hearts.",
    [a("goldenChance", 0.01), m("golden", 0.08)], ["meadow"]),
  pet("cloud_bear", "Cloud Bear", "uncommon", "#9fb0cc", "Comfort build", "Softens every fall.",
    [a("comboShield", 0.04), a("comboDurationMs", 120)], ["meadow"]),
  pet("star_hamster", "Star Hamster", "uncommon", "#c9a86a", "Energy", "Runs the wheel so you do not have to.",
    [m("energyRegen", 0.12), a("energyMax", 1.5)], ["meadow"]),
  pet("heart_robot", "Heart Robot", "uncommon", "#8a93a0", "Automation", "Shortens every cooldown a little.",
    [m("skillCooldown", -0.01)], ["meadow", "workshop"]),

  // Rare.
  pet("crystal_turtle", "Crystal Turtle", "rare", "#6aa8b0", "Capacity", "Carries the whole jar on its back.",
    [a("jarCapacity", 800), m("all", 0.03)], ["workshop"]),
  pet("golden_bee", "Golden Bee", "rare", "#d0ac4a", "Golden economy", "Turns golden hearts into more golden hearts.",
    [m("golden", 0.14), a("goldenChance", 0.008)], ["workshop"]),
  pet("moon_owl", "Moon Owl", "rare", "#7b7fa8", "Offline mastery", "Awake exactly when you are not.",
    [m("offline", 0.16), a("offlineHours", 0.5)], ["workshop"], { evolvesTo: "moon_rabbit", evolveAt: { level: 40, shards: 120 } }),
  pet("cherry_panda", "Cherry Panda", "rare", "#c0708a", "Treats", "Eats well, shares well.",
    [m("treatGain", 0.3), m("petXp", 0.15)], ["workshop"]),
  pet("jelly_axolotl", "Jelly Axolotl", "rare", "#dc9ab4", "Recovery", "Regrows a broken combo.",
    [a("comboStart", 3), a("comboShield", 0.08)], ["workshop"]),

  // Epic.
  pet("cupid_bird", "Cupid Bird", "epic", "#d08a9a", "Critical chains", "One good hit becomes three.",
    [a("critChainChance", 0.03), m("crit", 0.09)], ["celestial"]),
  pet("valentine_bat", "Valentine Bat", "epic", "#7a5c8a", "Night play", "Everything is a little stronger after dark.",
    [m("all", 0.05), m("cps", 0.1)], ["celestial"]),
  pet("memory_butterfly", "Memory Butterfly", "epic", "#8fb0d0", "Shards", "Turns moments into shards.",
    [m("shardGain", 0.35), m("treasure", 0.12)], ["celestial"]),
  pet("crystal_deer", "Crystal Deer", "epic", "#7fb0a8", "Charms", "Finds better charms in worse places.",
    [m("fragmentGain", 0.3), a("luck", 0.02)], ["celestial"]),
  pet("star_kitten", "Star Kitten", "epic", "#c9a0d0", "Balanced", "Good at everything, best at nothing.",
    [m("click", 0.06), m("cps", 0.06), m("crit", 0.06)], ["celestial"], { evolvesTo: "celestial_fox", evolveAt: { level: 50, shards: 300 } }),

  // Legendary.
  pet("mini_unicorn", "Mini Unicorn", "legendary", "#d0a0d8", "Luck build", "Bends the odds until they break.",
    [a("luck", 0.05), a("doubleRewardChance", 0.03)], ["celestial", "cosmic"]),
  pet("heart_dragon", "Heart Dragon", "legendary", "#b0503f", "Bosses", "Made for the fights nothing else survives.",
    [m("bossDamage", 0.35), m("bossReward", 0.25)], ["cosmic"], { evolvesTo: "eternal_dragon", evolveAt: { level: 70, shards: 900 } }),
  pet("jar_mimic", "Jar Mimic", "legendary", "#8a6a4a", "Treasure", "Pretends to be the jar. Pays like a chest.",
    [m("treasure", 0.35), a("treasureChance", 0.012)], ["cosmic"]),
  pet("tiny_angel", "Tiny Angel", "legendary", "#e0dcc0", "Protection", "Nothing you build ever fully collapses.",
    [a("comboShield", 0.3), m("all", 0.07)], ["cosmic"]),
  pet("rose_serpent", "Rose Serpent", "legendary", "#a05070", "Combo", "Coils tighter the longer you go.",
    [m("comboPower", 0.16), m("comboGain", 0.12)], ["cosmic"]),

  // Mythic and beyond.
  pet("cosmic_whale", "Cosmic Whale", "mythic", "#4a6a9a", "Everything", "Slow, vast, and impossible to ignore.",
    [m("all", 0.11)], ["cosmic"]),
  pet("love_phoenix", "Love Phoenix", "mythic", "#c96a3f", "Rebirth", "Feeds on resets.",
    [m("tokenGain", 0.2), m("all", 0.06)], ["cosmic"]),
  pet("moon_rabbit", "Moon Rabbit", "celestial", "#b0b0c8", "Offline endgame", "Runs the jar entirely without you.",
    [m("offline", 0.3), a("offlineHours", 2), m("cps", 0.12)], ["cosmic"]),
  pet("celestial_fox", "Celestial Fox", "celestial", "#d0a04a", "Endgame balanced", "Nine tails, nine bonuses.",
    [m("all", 0.09), m("crit", 0.12), m("comboPower", 0.12), a("luck", 0.03)], ["cosmic"]),
  pet("eternal_dragon", "Eternal Dragon", "eternal", "#4a3f6a", "Ascension", "Older than the jar.",
    [m("all", 0.15), m("crystalGain", 0.2), m("bossDamage", 0.4)], ["cosmic"]),
  // Evolution-only forms and the secret.
  pet("heart_dog", "Heart Hound", "rare", "#c98a6a", "Pure clicking", "The puppy, grown, and still only interested in tapping.",
    [m("click", 0.15)], []),
  pet("moon_cat", "Moonlit Cat", "rare", "#9a8fb0", "Passive income", "The cat, grown, and still asleep on the jar.",
    [m("cps", 0.17)], []),
  pet("jar_spirit", "Jar Spirit", "secret", "#43273b", "Secret", "Nobody agrees on where it came from.",
    [m("all", 0.25), a("luck", 0.08), m("golden", 0.4)], []),
];

export const PET_BY_ID: Record<string, PetDef> = Object.fromEntries(PETS.map((p) => [p.id, p]));

/* ------------------------------------------------------------------ */
/* Traits and personalities, rolled when a pet hatches                 */
/* ------------------------------------------------------------------ */

export interface TraitDef {
  id: string;
  name: string;
  description: string;
  mods: Mods;
  weight: number;
}

export const TRAITS: TraitDef[] = [
  { id: "eager", name: "Eager", description: "Extra click power.", mods: { mul: { click: 1.1 } }, weight: 100 },
  { id: "steady", name: "Steady", description: "Extra passive output.", mods: { mul: { cps: 1.1 } }, weight: 100 },
  { id: "sleepy", name: "Sleepy", description: "Much better offline.", mods: { mul: { offline: 1.25 } }, weight: 80 },
  { id: "sharp", name: "Sharp", description: "Better criticals.", mods: { mul: { crit: 1.15 } }, weight: 70 },
  { id: "loyal", name: "Loyal", description: "Combos last longer.", mods: { add: { comboDurationMs: 400 } }, weight: 70 },
  { id: "greedy", name: "Greedy", description: "More golden hearts.", mods: { mul: { golden: 1.2 } }, weight: 55 },
  { id: "clever", name: "Clever", description: "Cheaper upgrades.", mods: { mul: { cost: 0.97 } }, weight: 45 },
  { id: "bold", name: "Bold", description: "Hits bosses harder.", mods: { mul: { bossDamage: 1.25 } }, weight: 45 },
  { id: "radiant", name: "Radiant", description: "A little of everything.", mods: { mul: { all: 1.06 } }, weight: 25 },
  { id: "boundless", name: "Boundless", description: "A lot of everything.", mods: { mul: { all: 1.15 } }, weight: 6 },
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export const PERSONALITIES = [
  "Cheerful", "Shy", "Bossy", "Dreamy", "Loyal", "Curious",
  "Grumpy", "Playful", "Gentle", "Stubborn", "Watchful", "Silly",
];

/* ------------------------------------------------------------------ */
/* Eggs                                                                */
/* ------------------------------------------------------------------ */

export interface EggDef {
  id: string;
  name: string;
  description: string;
  cost: { currency: "golden" | "hearts" | "star"; amount: number };
  /** Rarity floor guaranteed by the pity counter. */
  pityAt: number;
  pityRarity: Rarity;
  /** Multiplies the base rarity weights for this pool. */
  bias: Partial<Record<Rarity, number>>;
  unlockLifetime: number;
}

export const EGGS: EggDef[] = [
  {
    id: "basic",
    name: "Meadow Egg",
    description: "The first egg. Commons and uncommons, with a rare now and then.",
    cost: { currency: "hearts", amount: 25_000 },
    pityAt: 12,
    pityRarity: "rare",
    bias: { common: 1, uncommon: 1, rare: 0.6 },
    unlockLifetime: 20_000,
  },
  {
    id: "meadow",
    name: "Rose Garden Egg",
    description: "Uncommons through epics, and the garden exclusives.",
    cost: { currency: "golden", amount: 12 },
    pityAt: 15,
    pityRarity: "epic",
    bias: { common: 0.4, uncommon: 1.2, rare: 1, epic: 0.8 },
    unlockLifetime: 500_000,
  },
  {
    id: "workshop",
    name: "Workshop Egg",
    description: "Where the built things come from.",
    cost: { currency: "golden", amount: 45 },
    pityAt: 18,
    pityRarity: "epic",
    bias: { common: 0.1, uncommon: 0.7, rare: 1.4, epic: 1.1, legendary: 0.5 },
    unlockLifetime: 2e7,
  },
  {
    id: "celestial",
    name: "Celestial Egg",
    description: "Epics and legendaries, with a mythic on a very good day.",
    cost: { currency: "golden", amount: 160 },
    pityAt: 20,
    pityRarity: "legendary",
    bias: { uncommon: 0.2, rare: 0.8, epic: 1.5, legendary: 1.2, mythic: 0.6 },
    unlockLifetime: 5e8,
  },
  {
    id: "cosmic",
    name: "Cosmic Egg",
    description: "The endgame pool. Everything up to eternal.",
    cost: { currency: "star", amount: 3 },
    pityAt: 25,
    pityRarity: "mythic",
    bias: { rare: 0.3, epic: 1, legendary: 1.4, mythic: 1.2, celestial: 0.9, eternal: 0.5, secret: 0.2 },
    unlockLifetime: 1e11,
  },
];

export const EGG_BY_ID: Record<string, EggDef> = Object.fromEntries(EGGS.map((e) => [e.id, e]));

/** Level scaling: a pet at level 100 is roughly six times its level 1 self. */
export function petScale(level: number, stars: number): number {
  return (1 + (level - 1) * 0.05) * (1 + stars * 0.25);
}

export function petMods(def: PetDef, level: number, stars: number, traitId: string): Mods {
  const scale = petScale(level, stars) * RARITY_META[def.rarity].power;
  const add: Partial<Record<AddStat, number>> = {};
  const mul: Partial<Record<MulStat, number>> = {};
  for (const stat of def.stats) {
    if (stat.kind === "add") {
      const key = stat.stat as AddStat;
      add[key] = (add[key] ?? 0) + stat.per * scale;
    } else {
      const key = stat.stat as MulStat;
      // Negative `per` means "reduce", for example cooldowns.
      const value = 1 + stat.per * scale;
      mul[key] = (mul[key] ?? 1) * Math.max(0.05, value);
    }
  }
  const trait = TRAIT_BY_ID[traitId];
  if (trait) {
    for (const [k, v] of Object.entries(trait.mods.add ?? {})) {
      add[k as AddStat] = (add[k as AddStat] ?? 0) + (v as number);
    }
    for (const [k, v] of Object.entries(trait.mods.mul ?? {})) {
      mul[k as MulStat] = (mul[k as MulStat] ?? 1) * (v as number);
    }
  }
  return { add, mul };
}

/** Experience needed to go from `level` to the next. */
export function petXpFor(level: number): number {
  return Math.floor(40 * Math.pow(1.18, level - 1));
}

export function petFeedCost(level: number): number {
  return Math.max(1, Math.floor(2 * Math.pow(1.09, level)));
}
