import type { AddStat, CharmSlot, Mods, MulStat, Rarity } from "../types";
import { RARITY_META } from "./pets";

// Charms are the build layer: ten slots, rolled affixes, and set bonuses that
// reward committing to a theme instead of equipping the ten biggest numbers.

export interface CharmSlotDef {
  id: CharmSlot;
  name: string;
  description: string;
  unlockLifetime: number;
}

export const CHARM_SLOTS: CharmSlotDef[] = [
  { id: "jar", name: "Jar Charm", description: "Hangs on the jar itself.", unlockLifetime: 100_000 },
  { id: "heart", name: "Heart Charm", description: "Worn by the heart you tap.", unlockLifetime: 100_000 },
  { id: "ring", name: "Ring", description: "Small, and always there.", unlockLifetime: 2e6 },
  { id: "necklace", name: "Necklace", description: "Close to the chest.", unlockLifetime: 1e7 },
  { id: "pet", name: "Pet Charm", description: "Shared by your whole team.", unlockLifetime: 4e7 },
  { id: "bracelet", name: "Bracelet", description: "For the tapping hand.", unlockLifetime: 2e8 },
  { id: "crown", name: "Crown", description: "Earned, not bought.", unlockLifetime: 5e9 },
  { id: "wings", name: "Wings", description: "For the hearts that leave the jar.", unlockLifetime: 1e11 },
  { id: "aura", name: "Aura", description: "Visible from across the room.", unlockLifetime: 1e13 },
  { id: "relic", name: "Background Relic", description: "Older than the world you are in.", unlockLifetime: 1e15 },
];

export interface AffixDef {
  id: string;
  label: string;
  kind: "add" | "mul";
  stat: AddStat | MulStat;
  /** Value at rarity common, level 1. Scaled by rarity and level. */
  base: number;
  weight: number;
  slots?: CharmSlot[];
}

export const AFFIXES: AffixDef[] = [
  { id: "click_mul", label: "Click power", kind: "mul", stat: "click", base: 0.05, weight: 100 },
  { id: "cps_mul", label: "Passive hearts", kind: "mul", stat: "cps", base: 0.05, weight: 100 },
  { id: "all_mul", label: "All hearts", kind: "mul", stat: "all", base: 0.02, weight: 30 },
  { id: "crit_chance", label: "Critical chance", kind: "add", stat: "critChance", base: 0.008, weight: 70 },
  { id: "crit_mul", label: "Critical power", kind: "mul", stat: "crit", base: 0.06, weight: 70 },
  { id: "mega_chance", label: "Mega critical chance", kind: "add", stat: "megaCritChance", base: 0.005, weight: 40 },
  { id: "combo_time", label: "Combo time", kind: "add", stat: "comboDurationMs", base: 120, weight: 60 },
  { id: "combo_power", label: "Combo payout", kind: "mul", stat: "comboPower", base: 0.05, weight: 55 },
  { id: "golden_chance", label: "Golden heart chance", kind: "add", stat: "goldenChance", base: 0.006, weight: 45 },
  { id: "golden_mul", label: "Golden heart value", kind: "mul", stat: "golden", base: 0.08, weight: 45 },
  { id: "treasure_mul", label: "Treasure rewards", kind: "mul", stat: "treasure", base: 0.08, weight: 40 },
  { id: "luck", label: "Luck", kind: "add", stat: "luck", base: 0.01, weight: 35 },
  { id: "offline_mul", label: "Offline earnings", kind: "mul", stat: "offline", base: 0.08, weight: 45 },
  { id: "offline_hours", label: "Offline hours", kind: "add", stat: "offlineHours", base: 0.4, weight: 25 },
  { id: "cost_down", label: "Upgrade cost", kind: "mul", stat: "cost", base: -0.015, weight: 30 },
  { id: "pet_power", label: "Pet power", kind: "mul", stat: "petPower", base: 0.07, weight: 45, slots: ["pet", "necklace", "crown"] },
  { id: "boss_damage", label: "Boss damage", kind: "mul", stat: "bossDamage", base: 0.09, weight: 35 },
  { id: "skill_cd", label: "Ability cooldown", kind: "mul", stat: "skillCooldown", base: -0.015, weight: 30 },
  { id: "skill_dur", label: "Ability duration", kind: "mul", stat: "skillDuration", base: 0.05, weight: 30 },
  { id: "jar_cap", label: "Jar capacity", kind: "add", stat: "jarCapacity", base: 500, weight: 40, slots: ["jar", "relic"] },
  { id: "token_gain", label: "Rebirth tokens", kind: "mul", stat: "tokenGain", base: 0.05, weight: 18, slots: ["crown", "wings", "aura", "relic"] },
  { id: "crystal_gain", label: "Ascension crystals", kind: "mul", stat: "crystalGain", base: 0.05, weight: 8, slots: ["aura", "relic"] },
];

/** How many affixes a charm of each rarity rolls, and its stat scale. */
export const CHARM_RARITY: Record<Rarity, { affixes: number; scale: number }> = {
  common: { affixes: 1, scale: 1 },
  uncommon: { affixes: 2, scale: 1.35 },
  rare: { affixes: 2, scale: 1.9 },
  epic: { affixes: 3, scale: 2.6 },
  legendary: { affixes: 4, scale: 3.6 },
  mythic: { affixes: 4, scale: 5 },
  celestial: { affixes: 5, scale: 6.8 },
  eternal: { affixes: 5, scale: 9 },
  secret: { affixes: 6, scale: 12 },
};

/** Fragments to craft a charm, and dust to enhance one level. */
export const CRAFT_COST: Record<Rarity, number> = {
  common: 20,
  uncommon: 60,
  rare: 180,
  epic: 520,
  legendary: 1_500,
  mythic: 4_400,
  celestial: 13_000,
  eternal: 40_000,
  secret: 120_000,
};

export function enhanceCost(rarity: Rarity, level: number): number {
  return Math.ceil(CRAFT_COST[rarity] * 0.35 * Math.pow(1.28, level));
}

export function rerollCost(rarity: Rarity): number {
  return Math.ceil(CRAFT_COST[rarity] * 0.6);
}

export function salvageValue(rarity: Rarity, level: number): number {
  return Math.ceil(CRAFT_COST[rarity] * 0.4 * (1 + level * 0.2));
}

/** A charm at level L multiplies its rolled affixes by this. */
export function charmLevelScale(level: number): number {
  return 1 + level * 0.12;
}

/* ------------------------------------------------------------------ */
/* Set bonuses                                                         */
/* ------------------------------------------------------------------ */

export interface CharmSetDef {
  id: string;
  name: string;
  description: string;
  /** Number of equipped charms sharing this theme required for each tier. */
  tiers: { count: number; mods: Mods; label: string }[];
  /** A charm counts toward the set when it rolled any of these affixes. */
  affixes: string[];
}

export const CHARM_SETS: CharmSetDef[] = [
  {
    id: "tapper",
    name: "Tapper's Set",
    description: "For builds that live on the heart itself.",
    affixes: ["click_mul", "crit_chance", "crit_mul", "mega_chance"],
    tiers: [
      { count: 3, mods: { mul: { click: 1.15 } }, label: "+15% click power" },
      { count: 5, mods: { mul: { click: 1.35, crit: 1.2 } }, label: "+35% click power, +20% critical power" },
      { count: 8, mods: { mul: { click: 2, crit: 1.5 } }, label: "Double click power, +50% critical power" },
    ],
  },
  {
    id: "gardener",
    name: "Gardener's Set",
    description: "For builds that let the jar do the work.",
    affixes: ["cps_mul", "offline_mul", "offline_hours", "jar_cap"],
    tiers: [
      { count: 3, mods: { mul: { cps: 1.18 } }, label: "+18% passive hearts" },
      { count: 5, mods: { mul: { cps: 1.4, offline: 1.25 } }, label: "+40% passive, +25% offline" },
      { count: 8, mods: { mul: { cps: 2.2, offline: 1.6 } }, label: "More than double passive, +60% offline" },
    ],
  },
  {
    id: "fortune",
    name: "Fortune's Set",
    description: "For builds that chase golden hearts and treasure.",
    affixes: ["golden_chance", "golden_mul", "treasure_mul", "luck"],
    tiers: [
      { count: 3, mods: { mul: { golden: 1.2 } }, label: "+20% golden heart value" },
      { count: 5, mods: { mul: { golden: 1.5, treasure: 1.3 }, add: { luck: 0.05 } }, label: "+50% golden, +30% treasure, +5% luck" },
      { count: 8, mods: { mul: { golden: 2.4, treasure: 1.8 }, add: { luck: 0.12, doubleRewardChance: 0.1 } }, label: "Golden everything" },
    ],
  },
  {
    id: "keeper",
    name: "Keeper's Set",
    description: "For builds that never let a combo break.",
    affixes: ["combo_time", "combo_power", "skill_dur", "skill_cd"],
    tiers: [
      { count: 3, mods: { add: { comboDurationMs: 800 } }, label: "+0.8s combo time" },
      { count: 5, mods: { add: { comboDurationMs: 2000, comboShield: 1 }, mul: { comboPower: 1.2 } }, label: "+2s combo time, a free save, +20% payout" },
      { count: 8, mods: { add: { comboDurationMs: 4000, comboShield: 3 }, mul: { comboPower: 1.6 } }, label: "Combos that barely end" },
    ],
  },
];

export const CHARM_NAMES: Record<CharmSlot, string[]> = {
  jar: ["Ribbon", "Seal", "Clasp", "Tag", "Bell"],
  heart: ["Ember", "Locket", "Thread", "Spark", "Pin"],
  pet: ["Collar", "Whistle", "Bowl", "Leash", "Token"],
  ring: ["Band", "Signet", "Loop", "Circlet", "Promise"],
  necklace: ["Chain", "Pendant", "Cord", "Amulet", "Strand"],
  bracelet: ["Cuff", "Wrap", "Bangle", "Tie", "Braid"],
  crown: ["Diadem", "Coronet", "Wreath", "Halo", "Crest"],
  wings: ["Feather", "Pinion", "Sail", "Plume", "Span"],
  aura: ["Glow", "Shimmer", "Veil", "Corona", "Haze"],
  relic: ["Fragment", "Tablet", "Sigil", "Monolith", "Echo"],
};

export const CHARM_PREFIX: Record<Rarity, string[]> = {
  common: ["Plain", "Simple", "Worn"],
  uncommon: ["Polished", "Bright", "Fine"],
  rare: ["Radiant", "Deep", "Silver"],
  epic: ["Gilded", "Storm", "Velvet"],
  legendary: ["Ancient", "Royal", "Burning"],
  mythic: ["Astral", "Sovereign", "Undying"],
  celestial: ["Celestial", "Starbound", "Auroral"],
  eternal: ["Eternal", "Timeless", "Unending"],
  secret: ["Unnamed", "Impossible", "Hidden"],
};

export function charmAffixValue(affix: AffixDef, rarity: Rarity, level: number, roll: number): number {
  const rarityScale = CHARM_RARITY[rarity].scale * (0.6 + RARITY_META[rarity].power * 0.1);
  // Roll is 0..1 and spreads each affix between 70% and 130% of its base.
  const variance = 0.7 + roll * 0.6;
  return affix.base * rarityScale * charmLevelScale(level) * variance;
}
