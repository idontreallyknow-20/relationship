import type { AddStat, ItemRarity, MulStat } from "../types";

// One item per creature, not ten slots on the player. An otter carries a
// favourite rock. A crab wears a shell. Both are made from sea glass.

export const RARITIES: ItemRarity[] = ["plain", "smooth", "banded", "opaline", "moonstone"];

export const RARITY_META: Record<ItemRarity, {
  label: string;
  color: string;
  affixes: number;
  scale: number;
  weight: number;
}> = {
  plain: { label: "Plain", color: "#9a9088", affixes: 1, scale: 1, weight: 100 },
  smooth: { label: "Smooth", color: "#7fa08a", affixes: 2, scale: 1.6, weight: 45 },
  banded: { label: "Banded", color: "#4f7bd0", affixes: 3, scale: 2.5, weight: 16 },
  opaline: { label: "Opaline", color: "#b48fd0", affixes: 4, scale: 3.8, weight: 4.5 },
  moonstone: { label: "Moonstone", color: "#d0c8a8", affixes: 5, scale: 6, weight: 1 },
};

export const CRAFT_COST: Record<ItemRarity, number> = {
  plain: 40,
  smooth: 140,
  banded: 480,
  opaline: 1_600,
  moonstone: 6_000,
};

/** Names, so a rock is a thing rather than a stat block. */
export const ROCK_NAMES = [
  "River Stone", "Flat Stone", "Warm Stone", "Speckled Stone", "Heart Stone",
  "Skipping Stone", "Quiet Stone", "The Good One",
];

export const SHELL_NAMES = [
  "Spiral Shell", "Cone Shell", "Cowrie", "Whelk", "Turret Shell",
  "Auger", "Nautilus", "The One That Fits",
];

export interface AffixDef {
  id: string;
  label: string;
  kind: "add" | "mul";
  stat: AddStat | MulStat;
  base: number;
  weight: number;
  /** Some affixes only make sense on one line's item. */
  only?: "rock" | "shell";
}

export const AFFIXES: AffixDef[] = [
  { id: "crack_value", label: "Crack payout", kind: "mul", stat: "crackValue", base: 0.12, weight: 100, only: "rock" },
  { id: "crack_speed", label: "Crack speed", kind: "mul", stat: "crackSpeed", base: 0.08, weight: 80, only: "rock" },
  { id: "pair", label: "Holding hands", kind: "mul", stat: "pairBonus", base: 0.15, weight: 45, only: "rock" },
  { id: "collect_value", label: "Collect payout", kind: "mul", stat: "collectValue", base: 0.12, weight: 100, only: "shell" },
  { id: "collect_speed", label: "Collect speed", kind: "mul", stat: "collectSpeed", base: 0.08, weight: 80, only: "shell" },
  { id: "glass", label: "Sea glass", kind: "mul", stat: "glassGain", base: 0.14, weight: 55, only: "shell" },
  { id: "click", label: "Click power", kind: "mul", stat: "click", base: 0.07, weight: 70 },
  { id: "cps", label: "Passive hearts", kind: "mul", stat: "cps", base: 0.07, weight: 70 },
  { id: "all", label: "All hearts", kind: "mul", stat: "all", base: 0.03, weight: 25 },
  { id: "crit_chance", label: "Critical chance", kind: "add", stat: "critChance", base: 0.01, weight: 55 },
  { id: "crit_power", label: "Critical power", kind: "mul", stat: "crit", base: 0.08, weight: 55 },
  { id: "combo_time", label: "Combo time", kind: "add", stat: "comboDurationMs", base: 150, weight: 50 },
  { id: "shells", label: "Shells", kind: "mul", stat: "shellGain", base: 0.14, weight: 50 },
  { id: "pearls", label: "Pearls", kind: "mul", stat: "pearlGain", base: 0.1, weight: 30 },
  { id: "offline", label: "Offline", kind: "mul", stat: "offline", base: 0.1, weight: 45 },
  { id: "luck", label: "Luck", kind: "add", stat: "luck", base: 0.015, weight: 30 },
  { id: "creature", label: "Creature power", kind: "mul", stat: "creaturePower", base: 0.09, weight: 40 },
  { id: "xp", label: "Creature experience", kind: "mul", stat: "creatureXp", base: 0.15, weight: 35 },
];

export function affixesFor(kind: "rock" | "shell"): AffixDef[] {
  return AFFIXES.filter((a) => !a.only || a.only === kind);
}

export function itemLevelScale(level: number): number {
  return 1 + level * 0.15;
}

export function affixValue(affix: AffixDef, rarity: ItemRarity, level: number, roll: number): number {
  const variance = 0.75 + roll * 0.5;
  return affix.base * RARITY_META[rarity].scale * itemLevelScale(level) * variance;
}

export function polishCost(rarity: ItemRarity, level: number): number {
  return Math.ceil(CRAFT_COST[rarity] * 0.4 * Math.pow(1.3, level));
}

export function rerollCost(rarity: ItemRarity): number {
  return Math.ceil(CRAFT_COST[rarity] * 0.7);
}

export function salvageValue(rarity: ItemRarity, level: number): number {
  return Math.ceil(CRAFT_COST[rarity] * 0.45 * (1 + level * 0.25));
}
