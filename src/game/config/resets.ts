import type { AddStat, CurrencyId, GameState, Mods, MulStat } from "../types";

// Two reset layers, both themed to water. A Tide Change empties the jar. New
// Water empties everything, including the tides you have already changed.
//
// Both are instances of one shape, so a third layer later is a config entry.

export interface ResetLayerDef {
  id: string;
  name: string;
  verb: string;
  currency: CurrencyId;
  blurb: string;
  requirement: number;
  gain: (state: GameState, multiplier: number) => number;
  resets: string[];
  keeps: string[];
}

export const TIDE_REQUIREMENT = 1e9;
export const WATER_REQUIREMENT = 1e15;

/**
 * Moons scale with the cube root of the run, so a long run is worth more than
 * a short one but not proportionally. Playing actively and keeping creatures
 * fed both count.
 */
export function moonGain(state: GameState, multiplier = 1): number {
  if (state.runHearts < TIDE_REQUIREMENT) return 0;
  const base = Math.pow(state.runHearts / TIDE_REQUIREMENT, 1 / 3) * 8;
  const comboBonus = 1 + Math.min(1, state.stats.bestCombo / 400) * 0.3;
  const activeBonus = 1 + Math.min(1, state.stats.heartsFromClicks / Math.max(1, state.runHearts)) * 0.35;
  const creatureBonus = 1 + Math.min(1, Object.keys(state.creatures).length / 14) * 0.25;
  return Math.floor(base * comboBonus * activeBonus * creatureBonus * multiplier);
}

export function starGain(state: GameState, multiplier = 1): number {
  if (state.eraHearts < WATER_REQUIREMENT) return 0;
  const base = Math.pow(state.eraHearts / WATER_REQUIREMENT, 1 / 4) * 4;
  const tideBonus = 1 + Math.min(2, state.tideChanges / 20);
  const codexBonus = 1 + Math.min(0.5, state.codex.length / 14);
  return Math.floor(base * tideBonus * codexBonus * multiplier);
}

export interface ResetUpgradeDef {
  id: string;
  name: string;
  description: string;
  currency: CurrencyId;
  baseCost: number;
  growth: number;
  max: number;
  kind: "add" | "mulLinear" | "mulCompound" | "flag";
  stat?: AddStat | MulStat;
  per?: number;
  flag?: string;
  requires?: [string, number];
}

export const MOON_UPGRADES: ResetUpgradeDef[] = [
  { id: "m_click", name: "Deeper Water", description: "Click power, kept through every tide.", currency: "moons", baseCost: 1, growth: 1.35, max: 100, kind: "mulLinear", stat: "click", per: 0.25 },
  { id: "m_cps", name: "Settled Floor", description: "Passive hearts, kept through every tide.", currency: "moons", baseCost: 1, growth: 1.35, max: 100, kind: "mulLinear", stat: "cps", per: 0.25 },
  { id: "m_all", name: "High Water", description: "Everything, permanently.", currency: "moons", baseCost: 4, growth: 1.5, max: 60, kind: "mulLinear", stat: "all", per: 0.15 },
  { id: "m_crack", name: "Practised Hands", description: "Otters crack harder in every run.", currency: "moons", baseCost: 3, growth: 1.45, max: 50, kind: "mulLinear", stat: "crackValue", per: 0.2 },
  { id: "m_collect", name: "Worn Path", description: "Crabs collect more in every run.", currency: "moons", baseCost: 3, growth: 1.45, max: 50, kind: "mulLinear", stat: "collectValue", per: 0.2 },
  { id: "m_crit", name: "Sharp Edge", description: "Better criticals from the first tap.", currency: "moons", baseCost: 3, growth: 1.45, max: 40, kind: "add", stat: "critChance", per: 0.01 },
  { id: "m_combo", name: "Muscle Memory", description: "Start each run with a combo going.", currency: "moons", baseCost: 2, growth: 1.4, max: 50, kind: "add", stat: "comboStart", per: 4 },
  { id: "m_keep", name: "What Stays", description: "Keep this many levels of every upgrade through a tide change.", currency: "moons", baseCost: 6, growth: 1.6, max: 25, kind: "add", stat: "startingUpgrades", per: 1 },
  { id: "m_slots", name: "Room To Move", description: "One more creature in the jar.", currency: "moons", baseCost: 15, growth: 2.2, max: 6, kind: "add", stat: "creatureSlots", per: 1 },
  { id: "m_ability", name: "Second Nature", description: "One more ability equipped.", currency: "moons", baseCost: 18, growth: 2.3, max: 3, kind: "add", stat: "abilitySlots", per: 1 },
  { id: "m_offline", name: "Long Night", description: "Collect from more hours away, permanently.", currency: "moons", baseCost: 5, growth: 1.55, max: 40, kind: "add", stat: "offlineHours", per: 1 },
  { id: "m_cost", name: "Worn Smooth", description: "Everything costs less, in every run.", currency: "moons", baseCost: 10, growth: 1.75, max: 25, kind: "mulLinear", stat: "cost", per: -0.02 },
  { id: "m_creature", name: "Well Fed", description: "Creatures are stronger in every run.", currency: "moons", baseCost: 6, growth: 1.6, max: 40, kind: "mulLinear", stat: "creaturePower", per: 0.15 },
  { id: "m_moons", name: "Pull Of The Moon", description: "Every future tide change pays more.", currency: "moons", baseCost: 8, growth: 1.7, max: 40, kind: "mulLinear", stat: "moonGain", per: 0.12 },
  { id: "m_gift", name: "Something For You", description: "What you leave your partner is worth much more.", currency: "moons", baseCost: 12, growth: 1.8, max: 20, kind: "mulLinear", stat: "all", per: 0.05 },
  // Unlocks.
  { id: "m_bulk", name: "Handfuls", description: "Buy ten, twenty five, a hundred, or as many as you can afford.", currency: "moons", baseCost: 4, growth: 1, max: 1, kind: "flag", flag: "bulk" },
  { id: "m_items", name: "Rocks And Shells", description: "Creatures can carry something.", currency: "moons", baseCost: 10, growth: 1, max: 1, kind: "flag", flag: "items" },
  { id: "m_challenges", name: "Rough Water", description: "Unlocks challenges.", currency: "moons", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "challenges" },
  { id: "m_auto_buy", name: "Steady Hand", description: "Buys the cheapest affordable upgrade on its own.", currency: "moons", baseCost: 25, growth: 1, max: 1, kind: "flag", flag: "auto_buy" },
  { id: "m_auto_feed", name: "Full Bowls", description: "Creatures feed themselves from your shells.", currency: "moons", baseCost: 18, growth: 1, max: 1, kind: "flag", flag: "auto_feed" },
  { id: "m_auto_skill", name: "Second Nature", description: "Abilities can fire themselves once maxed.", currency: "moons", baseCost: 30, growth: 1, max: 1, kind: "flag", flag: "auto_skill" },
  { id: "m_new_water", name: "New Water", description: "Unlocks the second reset layer. This is what the tree is for.", currency: "moons", baseCost: 250, growth: 1, max: 1, kind: "flag", flag: "new_water", requires: ["m_all", 20] },
];

export const STAR_UPGRADES: ResetUpgradeDef[] = [
  { id: "s_all", name: "Everything Rises", description: "Every heart, everywhere.", currency: "stars", baseCost: 1, growth: 1.4, max: 100, kind: "mulLinear", stat: "all", per: 0.4 },
  { id: "s_crack", name: "Old Hands", description: "Otters, far stronger.", currency: "stars", baseCost: 2, growth: 1.45, max: 60, kind: "mulLinear", stat: "crackValue", per: 0.35 },
  { id: "s_collect", name: "Old Paths", description: "Crabs, far stronger.", currency: "stars", baseCost: 2, growth: 1.45, max: 60, kind: "mulLinear", stat: "collectValue", per: 0.35 },
  { id: "s_moons", name: "Faster Tides", description: "Tide changes pay far more moons.", currency: "stars", baseCost: 4, growth: 1.55, max: 40, kind: "mulLinear", stat: "moonGain", per: 0.3 },
  { id: "s_keep", name: "Deep Roots", description: "Keep far more through a tide change.", currency: "stars", baseCost: 8, growth: 1.8, max: 20, kind: "add", stat: "startingUpgrades", per: 5 },
  { id: "s_slots", name: "Open Water", description: "Two more creatures in the jar.", currency: "stars", baseCost: 12, growth: 2.4, max: 4, kind: "add", stat: "creatureSlots", per: 1 },
  { id: "s_offline_cap", name: "Long Away", description: "Far more time away counts.", currency: "stars", baseCost: 6, growth: 1.6, max: 40, kind: "add", stat: "offlineHours", per: 4 },
  { id: "s_offline_rate", name: "Still Working", description: "Time away is worth much more.", currency: "stars", baseCost: 6, growth: 1.6, max: 40, kind: "mulLinear", stat: "offline", per: 0.25 },
  { id: "s_pearls", name: "Pearl Beds", description: "Pearls, far more often.", currency: "stars", baseCost: 5, growth: 1.55, max: 40, kind: "mulLinear", stat: "pearlGain", per: 0.3 },
  { id: "s_glass", name: "Glass Beach", description: "Sea glass, far more often.", currency: "stars", baseCost: 5, growth: 1.55, max: 40, kind: "mulLinear", stat: "glassGain", per: 0.3 },
  { id: "s_tide", name: "Spring Tide", description: "Tide rises far faster for both of you.", currency: "stars", baseCost: 7, growth: 1.6, max: 30, kind: "mulLinear", stat: "tideGain", per: 0.3 },
  { id: "s_cooldown", name: "No Waiting", description: "Abilities come back much sooner.", currency: "stars", baseCost: 9, growth: 1.7, max: 25, kind: "mulLinear", stat: "skillCooldown", per: -0.025 },
  { id: "s_creature_keep", name: "They Stay", description: "Creatures keep their levels through new water.", currency: "stars", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "creature_retention" },
  { id: "s_item_keep", name: "Keepsakes", description: "Rocks and shells survive new water.", currency: "stars", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "item_retention" },
  { id: "s_auto_upgrade", name: "It Runs Itself", description: "Buys upgrades continuously.", currency: "stars", baseCost: 20, growth: 1, max: 1, kind: "flag", flag: "auto_upgrade" },
  { id: "s_ocean", name: "The Ocean", description: "Unlocks the last vessel.", currency: "stars", baseCost: 40, growth: 1, max: 1, kind: "flag", flag: "ocean" },
  { id: "s_stars", name: "More Stars", description: "Every new water pays more.", currency: "stars", baseCost: 30, growth: 2, max: 25, kind: "mulLinear", stat: "starGain", per: 0.2 },
];

export const RESET_UPGRADE_BY_ID: Record<string, ResetUpgradeDef> = Object.fromEntries(
  [...MOON_UPGRADES, ...STAR_UPGRADES].map((u) => [u.id, u]),
);

export function resetUpgradeMods(def: ResetUpgradeDef, level: number): Mods {
  if (level <= 0 || def.kind === "flag" || !def.stat || !def.per) return {};
  if (def.kind === "add") return { add: { [def.stat as AddStat]: def.per * level } };
  if (def.kind === "mulLinear") return { mul: { [def.stat as MulStat]: 1 + def.per * level } };
  return { mul: { [def.stat as MulStat]: Math.pow(1 + def.per, level) } };
}

export function resetUpgradeCost(def: ResetUpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}

export const RESET_LAYERS: ResetLayerDef[] = [
  {
    id: "tide",
    name: "Tide Change",
    verb: "Change the tide",
    currency: "moons",
    blurb: "The water goes out. Everything living stays.",
    requirement: TIDE_REQUIREMENT,
    gain: moonGain,
    resets: [
      "Hearts in the jar, and this run's total",
      "Every upgrade in all three trees, minus what What Stays keeps",
      "Your combo",
      "The vessel, back to the Jam Jar",
    ],
    keeps: [
      "Every creature, their levels, names and what they carry",
      "The codex, collections and cosmetics",
      "Moons and moon upgrades",
      "New water progress",
      "Tide, and everything in the Us tree",
      "Everything in the rest of the app",
    ],
  },
  {
    id: "water",
    name: "New Water",
    verb: "Change the water",
    currency: "stars",
    blurb: "All of it, out. Rare, and worth it.",
    requirement: WATER_REQUIREMENT,
    gain: starGain,
    resets: [
      "Everything a tide change resets",
      "Moons and every moon upgrade",
      "Your tide change count",
      "Creature levels, unless you own They Stay",
      "Rocks and shells, unless you own Keepsakes",
      "Vessels, back to the Jam Jar",
    ],
    keeps: [
      "The codex. Every creature you have ever met stays met",
      "Collections, cosmetics and names",
      "Stars and star upgrades",
      "Lifetime statistics and records",
      "Question history and everything else in the app",
    ],
  },
];
