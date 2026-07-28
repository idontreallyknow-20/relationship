import type { CurrencyId, GameState, Mods, MulStat, AddStat } from "../types";

// Reset layers. Rebirth and Ascension are both instances of the same shape, so
// a third layer (Transcendence, Eternity, Bond Awakening) is a config entry
// and a reward currency, not an engine change.

export interface ResetLayerDef {
  id: string;
  name: string;
  verb: string;
  currency: CurrencyId;
  blurb: string;
  /** Minimum hearts in the current run or era before the layer opens. */
  requirement: (state: GameState) => number;
  /** How much currency the reset would pay right now. */
  gain: (state: GameState, multiplier: number) => number;
  /** Human readable list shown on the confirmation screen. */
  resets: string[];
  keeps: string[];
  unlock: (state: GameState) => boolean;
}

/* ------------------------------------------------------------------ */
/* Rebirth                                                             */
/* ------------------------------------------------------------------ */

export const REBIRTH_REQUIREMENT = 1e9;

/**
 * Tokens scale with the cube root of run hearts, which keeps the first rebirth
 * meaningful and stops a very long run from being worth a thousand short ones.
 * Skillful play is rewarded on top: combo, bosses and challenges all count.
 */
export function rebirthTokens(state: GameState, multiplier = 1): number {
  if (state.runHearts < REBIRTH_REQUIREMENT) return 0;
  const base = Math.pow(state.runHearts / REBIRTH_REQUIREMENT, 1 / 3) * 8;

  const comboBonus = 1 + Math.min(1, state.stats.bestCombo / 500) * 0.35;
  const bossBonus = 1 + Math.min(1, state.stats.bossesDefeated / 40) * 0.3;
  const challengeBonus = 1 + Math.min(1, state.stats.challengesCompleted / 25) * 0.25;
  const activeBonus = 1 + Math.min(1, state.stats.heartsFromClicks / Math.max(1, state.runHearts)) * 0.4;
  const petBonus = 1 + Math.min(1, Object.keys(state.pets).length / 30) * 0.2;
  const runLength = Date.now() - state.runStartedAt;
  // A very short run is worth slightly less, so rebirthing on a timer is not
  // strictly better than playing the run out.
  const lengthFactor = runLength < 10 * 60_000 ? 0.75 + (runLength / (10 * 60_000)) * 0.25 : 1;

  return Math.floor(
    base * comboBonus * bossBonus * challengeBonus * activeBonus * petBonus * lengthFactor * multiplier,
  );
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
  /** Flag upgrades unlock a feature rather than moving a number. */
  flag?: string;
  requires?: [string, number];
}

export const REBIRTH_UPGRADES: ResetUpgradeDef[] = [
  { id: "rb_click", name: "Permanent Click Power", description: "Click power, kept through every rebirth.", currency: "tokens", baseCost: 1, growth: 1.35, max: 100, kind: "mulLinear", stat: "click", per: 0.25 },
  { id: "rb_passive", name: "Permanent Passive Power", description: "Passive output, kept through every rebirth.", currency: "tokens", baseCost: 1, growth: 1.35, max: 100, kind: "mulLinear", stat: "cps", per: 0.25 },
  { id: "rb_all", name: "Permanent Heart Multiplier", description: "Every source of hearts, forever.", currency: "tokens", baseCost: 4, growth: 1.5, max: 60, kind: "mulLinear", stat: "all", per: 0.15 },
  { id: "rb_crit_chance", name: "Permanent Critical Chance", description: "Start every run with better criticals.", currency: "tokens", baseCost: 3, growth: 1.45, max: 40, kind: "add", stat: "critChance", per: 0.01 },
  { id: "rb_crit_power", name: "Permanent Critical Power", description: "Criticals hit harder in every run.", currency: "tokens", baseCost: 3, growth: 1.45, max: 60, kind: "mulLinear", stat: "crit", per: 0.2 },
  { id: "rb_combo", name: "Starting Combo", description: "Begin each run with a combo already going.", currency: "tokens", baseCost: 2, growth: 1.4, max: 50, kind: "add", stat: "comboStart", per: 4 },
  { id: "rb_early", name: "Faster Early Game", description: "The first hour of a run pays much better.", currency: "tokens", baseCost: 5, growth: 1.5, max: 30, kind: "mulLinear", stat: "all", per: 0.1 },
  { id: "rb_free_upgrades", name: "Free Starting Levels", description: "Begin every run with free levels of the first upgrade in each tree.", currency: "tokens", baseCost: 6, growth: 1.6, max: 25, kind: "add", stat: "startingUpgrades", per: 1 },
  { id: "rb_golden", name: "Starting Golden Hearts", description: "Golden hearts appear from the first minute.", currency: "tokens", baseCost: 4, growth: 1.5, max: 30, kind: "add", stat: "goldenChance", per: 0.008 },
  { id: "rb_token_gain", name: "Increased Token Gain", description: "Every future rebirth pays more.", currency: "tokens", baseCost: 8, growth: 1.7, max: 40, kind: "mulLinear", stat: "tokenGain", per: 0.12 },
  { id: "rb_pet_slot", name: "Extra Pet Slot", description: "Field one more pet.", currency: "tokens", baseCost: 15, growth: 2.2, max: 4, kind: "add", stat: "petSlots", per: 1 },
  { id: "rb_skill_slot", name: "Extra Ability Slot", description: "Equip one more ability.", currency: "tokens", baseCost: 18, growth: 2.3, max: 3, kind: "add", stat: "skillSlots", per: 1 },
  { id: "rb_offline", name: "Longer Offline Window", description: "Collect from more hours away, permanently.", currency: "tokens", baseCost: 5, growth: 1.55, max: 40, kind: "add", stat: "offlineHours", per: 1 },
  { id: "rb_cost", name: "Permanent Discount", description: "Every upgrade costs less, in every run.", currency: "tokens", baseCost: 10, growth: 1.75, max: 25, kind: "mulLinear", stat: "cost", per: -0.02 },
  { id: "rb_pet_power", name: "Permanent Pet Power", description: "Pets are stronger in every run.", currency: "tokens", baseCost: 6, growth: 1.6, max: 40, kind: "mulLinear", stat: "petPower", per: 0.15 },
  { id: "rb_boss", name: "Boss Mastery", description: "More damage and better rewards from bosses.", currency: "tokens", baseCost: 7, growth: 1.6, max: 30, kind: "mulLinear", stat: "bossDamage", per: 0.2 },
  { id: "rb_luck", name: "Permanent Luck", description: "Luck, in every run.", currency: "tokens", baseCost: 9, growth: 1.7, max: 25, kind: "add", stat: "luck", per: 0.02 },
  { id: "rb_requirement", name: "Reduced Requirements", description: "Rebirth unlocks at a lower heart total.", currency: "tokens", baseCost: 12, growth: 1.9, max: 15, kind: "add", stat: "startingUpgrades", per: 0 },
  // Feature unlocks.
  { id: "rb_auto_buy", name: "Automatic Purchases", description: "Unlocks buying the cheapest affordable upgrade automatically.", currency: "tokens", baseCost: 20, growth: 1, max: 1, kind: "flag", flag: "auto_buy" },
  { id: "rb_bulk", name: "Bulk Upgrades", description: "Unlocks x10, x25, x100 and max affordable buying.", currency: "tokens", baseCost: 5, growth: 1, max: 1, kind: "flag", flag: "bulk" },
  { id: "rb_charms", name: "Charms", description: "Unlocks the charm system and its ten slots.", currency: "tokens", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "charms" },
  { id: "rb_challenges", name: "Challenge Modes", description: "Unlocks challenges and their permanent rewards.", currency: "tokens", baseCost: 10, growth: 1, max: 1, kind: "flag", flag: "challenges" },
  { id: "rb_bosses", name: "Boss Hearts", description: "Unlocks boss fights.", currency: "tokens", baseCost: 8, growth: 1, max: 1, kind: "flag", flag: "bosses" },
  { id: "rb_auto_skill", name: "Ability Automation", description: "Unlocks automatic ability activation for maxed abilities.", currency: "tokens", baseCost: 30, growth: 1, max: 1, kind: "flag", flag: "auto_skill" },
  { id: "rb_keep_upgrades", name: "Keep Some Upgrades", description: "Keep a percentage of your normal upgrade levels through a rebirth.", currency: "tokens", baseCost: 25, growth: 2.4, max: 10, kind: "add", stat: "startingUpgrades", per: 2 },
  { id: "rb_ascension", name: "Ascension", description: "Unlocks the second reset layer. This is the point of the tree.", currency: "tokens", baseCost: 250, growth: 1, max: 1, kind: "flag", flag: "ascension", requires: ["rb_all", 20] },
];

/* ------------------------------------------------------------------ */
/* Ascension                                                           */
/* ------------------------------------------------------------------ */

export const ASCENSION_REQUIREMENT = 1e15;

export function ascensionCrystals(state: GameState, multiplier = 1): number {
  if (state.eraHearts < ASCENSION_REQUIREMENT) return 0;
  const base = Math.pow(state.eraHearts / ASCENSION_REQUIREMENT, 1 / 4) * 5;
  const rebirthBonus = 1 + Math.min(2, state.rebirths / 25);
  const collectionBonus = 1 + Math.min(0.5, Object.values(state.collections).flat().length / 200);
  const bossBonus = 1 + Math.min(0.6, state.stats.bossesDefeated / 60);
  return Math.floor(base * rebirthBonus * collectionBonus * bossBonus * multiplier);
}

export const ASCENSION_UPGRADES: ResetUpgradeDef[] = [
  { id: "as_all", name: "All Heart Gain", description: "Every heart, everywhere.", currency: "crystals", baseCost: 1, growth: 1.4, max: 100, kind: "mulLinear", stat: "all", per: 0.4 },
  { id: "as_crit", name: "All Critical Power", description: "Criticals and mega criticals together.", currency: "crystals", baseCost: 2, growth: 1.45, max: 60, kind: "mulLinear", stat: "crit", per: 0.35 },
  { id: "as_combo", name: "All Combo Power", description: "Combo payout at every step.", currency: "crystals", baseCost: 2, growth: 1.45, max: 60, kind: "mulLinear", stat: "comboPower", per: 0.35 },
  { id: "as_faster_rebirths", name: "Faster Rebirths", description: "Rebirth requirements drop sharply.", currency: "crystals", baseCost: 4, growth: 1.55, max: 25, kind: "mulLinear", stat: "tokenGain", per: 0.25 },
  { id: "as_more_tokens", name: "More Rebirth Currency", description: "Every rebirth pays far more.", currency: "crystals", baseCost: 5, growth: 1.6, max: 40, kind: "mulLinear", stat: "tokenGain", per: 0.3 },
  { id: "as_keep_progress", name: "Keep More On Rebirth", description: "Rebirth keeps a larger share of your upgrades.", currency: "crystals", baseCost: 8, growth: 1.8, max: 20, kind: "add", stat: "startingUpgrades", per: 5 },
  { id: "as_pet_retention", name: "Pet Level Retention", description: "Pets keep their levels through an ascension.", currency: "crystals", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "pet_retention" },
  { id: "as_charm_retention", name: "Charm Retention", description: "Charms survive an ascension.", currency: "crystals", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "charm_retention" },
  { id: "as_pet_slots", name: "Extra Pet Slots", description: "Two more pets in the field.", currency: "crystals", baseCost: 15, growth: 2.5, max: 3, kind: "add", stat: "petSlots", per: 1 },
  { id: "as_skill_slots", name: "Extra Ability Slots", description: "Two more abilities equipped.", currency: "crystals", baseCost: 18, growth: 2.6, max: 3, kind: "add", stat: "skillSlots", per: 1 },
  { id: "as_charm_slots", name: "Extra Charm Slots", description: "Unlocks the last charm slots early.", currency: "crystals", baseCost: 20, growth: 2.2, max: 3, kind: "add", stat: "charmSlots", per: 1 },
  { id: "as_offline_cap", name: "Higher Offline Cap", description: "Collect from far more hours away.", currency: "crystals", baseCost: 6, growth: 1.6, max: 40, kind: "add", stat: "offlineHours", per: 4 },
  { id: "as_offline_rate", name: "Better Offline Efficiency", description: "Offline hours are worth much more.", currency: "crystals", baseCost: 6, growth: 1.6, max: 40, kind: "mulLinear", stat: "offline", per: 0.25 },
  { id: "as_golden", name: "Golden Heart Multiplier", description: "Golden hearts pay far more.", currency: "crystals", baseCost: 5, growth: 1.55, max: 40, kind: "mulLinear", stat: "golden", per: 0.3 },
  { id: "as_treasure", name: "Treasure Multiplier", description: "Treasure hearts pay far more.", currency: "crystals", baseCost: 5, growth: 1.55, max: 40, kind: "mulLinear", stat: "treasure", per: 0.3 },
  { id: "as_boss", name: "Boss Reward Multiplier", description: "Bosses pay far more.", currency: "crystals", baseCost: 7, growth: 1.6, max: 30, kind: "mulLinear", stat: "bossReward", per: 0.3 },
  { id: "as_mission", name: "Mission Reward Multiplier", description: "Missions pay far more.", currency: "crystals", baseCost: 7, growth: 1.6, max: 30, kind: "mulLinear", stat: "missionReward", per: 0.3 },
  { id: "as_event", name: "Event Currency Multiplier", description: "Events pay far more.", currency: "crystals", baseCost: 7, growth: 1.6, max: 30, kind: "mulLinear", stat: "eventReward", per: 0.3 },
  { id: "as_cooldown", name: "Reduced Ability Cooldowns", description: "Abilities come back much sooner.", currency: "crystals", baseCost: 9, growth: 1.7, max: 25, kind: "mulLinear", stat: "skillCooldown", per: -0.025 },
  { id: "as_auto_golden", name: "Automatic Golden Collection", description: "Golden hearts collect themselves.", currency: "crystals", baseCost: 14, growth: 1, max: 1, kind: "flag", flag: "auto_golden" },
  { id: "as_auto_feed", name: "Automatic Pet Feeding", description: "Pets feed themselves from your treats.", currency: "crystals", baseCost: 10, growth: 1, max: 1, kind: "flag", flag: "auto_feed" },
  { id: "as_auto_mission", name: "Automatic Mission Claiming", description: "Finished missions claim themselves.", currency: "crystals", baseCost: 10, growth: 1, max: 1, kind: "flag", flag: "auto_mission" },
  { id: "as_auto_upgrade", name: "Automatic Upgrades", description: "Buys the cheapest affordable upgrade continuously.", currency: "crystals", baseCost: 22, growth: 1, max: 1, kind: "flag", flag: "auto_upgrade" },
  { id: "as_eternal_world", name: "Eternal Garden", description: "Unlocks the last world.", currency: "crystals", baseCost: 40, growth: 1, max: 1, kind: "flag", flag: "eternal_world" },
  { id: "as_pet_evolution", name: "New Evolution Paths", description: "Unlocks the second evolution of every evolving pet.", currency: "crystals", baseCost: 26, growth: 1, max: 1, kind: "flag", flag: "pet_evolution" },
  { id: "as_mastery", name: "Mastery Tree", description: "Unlocks mastery points and the mastery upgrades.", currency: "crystals", baseCost: 30, growth: 1, max: 1, kind: "flag", flag: "mastery" },
  { id: "as_eternal", name: "Eternal Progression", description: "Each ascension now grants Eternal Hearts, which nothing ever resets.", currency: "crystals", baseCost: 60, growth: 1, max: 1, kind: "flag", flag: "eternal" },
  { id: "as_crystal_gain", name: "Ascension Mastery", description: "Every future ascension pays more crystals.", currency: "crystals", baseCost: 35, growth: 2, max: 25, kind: "mulLinear", stat: "crystalGain", per: 0.2 },
];

export const RESET_UPGRADE_BY_ID: Record<string, ResetUpgradeDef> = Object.fromEntries(
  [...REBIRTH_UPGRADES, ...ASCENSION_UPGRADES].map((u) => [u.id, u]),
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

/* ------------------------------------------------------------------ */
/* Layer definitions                                                   */
/* ------------------------------------------------------------------ */

export const RESET_LAYERS: ResetLayerDef[] = [
  {
    id: "rebirth",
    name: "Rebirth",
    verb: "Rebirth",
    currency: "tokens",
    blurb: "Empty the jar and start the run again, permanently stronger.",
    requirement: () => REBIRTH_REQUIREMENT,
    gain: (state, multiplier) => rebirthTokens(state, multiplier),
    resets: [
      "Current hearts and this run's total",
      "Every normal upgrade tree, except levels your rebirth upgrades keep",
      "Passive generators",
      "Active combo, heat, focus and energy",
      "The world you are standing in, back to the Bedroom Jar",
    ],
    keeps: [
      "Lifetime hearts and every statistic",
      "Every pet, their levels and the pet codex",
      "Charms and equipment",
      "Achievements, collections, titles and cosmetics",
      "Rebirth tokens and rebirth upgrades",
      "Ascension progress",
      "Boss clears, challenge records and event items",
      "Everything in the rest of the couples app",
    ],
    unlock: (state) => state.stats.heartsFromClicks > 0,
  },
  {
    id: "ascension",
    name: "Ascension",
    verb: "Ascend",
    currency: "crystals",
    blurb: "Fold the whole rebirth loop into a single crystal and begin again.",
    requirement: () => ASCENSION_REQUIREMENT,
    gain: (state, multiplier) => ascensionCrystals(state, multiplier),
    resets: [
      "Everything a rebirth resets",
      "Rebirth tokens and every rebirth upgrade",
      "Your rebirth count for this era",
      "Pet levels, unless you own Pet Level Retention",
      "Charms, unless you own Charm Retention",
      "Unlocked worlds, back to the Bedroom Jar",
    ],
    keeps: [
      "Lifetime statistics and personal records",
      "The pet codex and every rarity you have unlocked",
      "Achievements, titles, cosmetics and collections",
      "Ascension crystals and ascension upgrades",
      "Eternal Hearts once Eternal Progression is unlocked",
      "Secret unlocks and account milestones",
      "Question history and everything in the rest of the app",
    ],
    unlock: (state) => (state.rebirthUpgrades["rb_ascension"] ?? 0) > 0,
  },
];
