import type { CurrencyId, Mods, MulStat, AddStat } from "../types";

// Ten normal upgrade trees plus the two reset trees. Every entry is data, so
// the shop screen is a renderer and the balance lives in one place.

export type UpgradeTree =
  | "click"
  | "critical"
  | "combo"
  | "generation"
  | "jar"
  | "speed"
  | "luck"
  | "discount"
  | "offline"
  | "partner"
  | "mastery";

export interface UnlockRule {
  lifetimeHearts?: number;
  rebirths?: number;
  ascensions?: number;
  upgrade?: [string, number];
  world?: string;
  achievement?: string;
}

export type EffectKind = "add" | "mulLinear" | "mulCompound";

export interface UpgradeDef {
  id: string;
  tree: UpgradeTree;
  name: string;
  description: string;
  currency: CurrencyId;
  baseCost: number;
  growth: number;
  max: number;
  kind: EffectKind;
  stat: AddStat | MulStat;
  per: number;
  unlock?: UnlockRule;
  /** Levels that grant an extra bonus on top of the linear effect. */
  milestones?: number[];
  milestoneMods?: Mods;
  synergy?: string[];
  refundable?: boolean;
}

interface Spec {
  id: string;
  name: string;
  description: string;
  cost: number;
  growth: number;
  per: number;
  max?: number;
  kind?: EffectKind;
  stat?: AddStat | MulStat;
  currency?: CurrencyId;
  unlock?: UnlockRule;
  milestones?: number[];
  milestoneMods?: Mods;
  synergy?: string[];
}

function tree(
  treeId: UpgradeTree,
  defaults: { kind: EffectKind; stat: AddStat | MulStat; currency?: CurrencyId },
  specs: Spec[],
): UpgradeDef[] {
  return specs.map((s) => ({
    id: s.id,
    tree: treeId,
    name: s.name,
    description: s.description,
    currency: s.currency ?? defaults.currency ?? "hearts",
    baseCost: s.cost,
    growth: s.growth,
    max: s.max ?? Infinity,
    kind: s.kind ?? defaults.kind,
    stat: s.stat ?? defaults.stat,
    per: s.per,
    unlock: s.unlock,
    milestones: s.milestones ?? [10, 25, 50, 100, 200],
    milestoneMods: s.milestoneMods ?? { mul: { all: 1.02 } },
    synergy: s.synergy,
    refundable: false,
  }));
}

/* ------------------------------------------------------------------ */
/* Click power                                                         */
/* ------------------------------------------------------------------ */

const CLICK = tree("click", { kind: "add", stat: "clickFlat" }, [
  { id: "stronger_heart", name: "Stronger Heart", description: "Every tap carries a little more of you.", cost: 15, growth: 1.13, per: 1 },
  { id: "reinforced_tap", name: "Reinforced Tap", description: "A firmer press pushes more hearts through.", cost: 120, growth: 1.14, per: 4 },
  { id: "heart_pressure", name: "Heart Pressure", description: "Build pressure behind every tap.", cost: 1_400, growth: 1.15, per: 22 },
  { id: "finger_strength", name: "Finger Strength", description: "Practice pays off.", cost: 18_000, growth: 1.15, per: 130 },
  { id: "deep_affection", name: "Deep Affection", description: "Taps land with weight behind them.", cost: 240_000, growth: 1.16, per: 900 },
  { id: "power_click", name: "Power Click", description: "A heavier strike on the jar.", cost: 3.2e6, growth: 1.16, per: 6_500, unlock: { lifetimeHearts: 1e6 } },
  { id: "heavy_heart", name: "Heavy Heart", description: "Hearts land harder than they used to.", cost: 4.5e7, growth: 1.17, per: 48_000, unlock: { lifetimeHearts: 2e7 } },
  { id: "heartquake", name: "Heartquake", description: "The whole jar shakes when you tap.", cost: 6.5e8, growth: 1.17, per: 380_000, unlock: { lifetimeHearts: 3e8 } },
  { id: "jar_slam", name: "Jar Slam", description: "Hearts arrive in a heap.", cost: 9e9, growth: 1.18, per: 3.1e6, unlock: { lifetimeHearts: 5e9 } },
  { id: "infinite_affection", name: "Infinite Affection", description: "There is always more where that came from.", cost: 1.3e11, growth: 1.18, per: 2.6e7, unlock: { rebirths: 1 } },
  // Multiplicative half of the tree.
  { id: "rhythm_power", name: "Rhythm Power", description: "Steady taps multiply your click power.", cost: 900, growth: 1.35, per: 0.08, kind: "mulLinear", stat: "click", max: 40 },
  { id: "focused_touch", name: "Focused Touch", description: "Precision beats speed.", cost: 55_000, growth: 1.4, per: 0.12, kind: "mulLinear", stat: "click", max: 30 },
  { id: "double_tap", name: "Double Tap", description: "Each tap counts a second time, a little.", cost: 2.4e6, growth: 1.45, per: 0.2, kind: "mulLinear", stat: "click", max: 25, unlock: { lifetimeHearts: 5e5 } },
  { id: "triple_tap", name: "Triple Tap", description: "And a third time, faintly.", cost: 4e8, growth: 1.5, per: 0.3, kind: "mulLinear", stat: "click", max: 20, unlock: { lifetimeHearts: 1e8 } },
  { id: "charged_click", name: "Charged Click", description: "Holding the heart charges it further.", cost: 1.2e7, growth: 1.42, per: 0.15, kind: "mulLinear", stat: "chargeSpeed", max: 25, unlock: { lifetimeHearts: 4e6 } },
  { id: "perfect_click", name: "Perfect Click", description: "Landing in the timing ring pays much better.", cost: 8e7, growth: 1.48, per: 0.25, kind: "mulLinear", stat: "click", max: 20, unlock: { lifetimeHearts: 4e7 }, synergy: ["precision_touch"] },
  { id: "precision_touch", name: "Precision Touch", description: "Widens the perfect timing ring.", cost: 2e8, growth: 1.55, per: 0.06, kind: "add", stat: "critChance", max: 15, unlock: { lifetimeHearts: 1e8 } },
  { id: "pulse_strike", name: "Pulse Strike", description: "Every tenth tap pulses outward.", cost: 5e9, growth: 1.5, per: 0.35, kind: "mulLinear", stat: "click", max: 20, unlock: { rebirths: 1 } },
  { id: "tender_force", name: "Tender Force", description: "Gentleness, applied with force.", cost: 7e10, growth: 1.55, per: 0.5, kind: "mulLinear", stat: "click", max: 20, unlock: { rebirths: 2 } },
  { id: "loving_impact", name: "Loving Impact", description: "Compounds your click power with every level.", cost: 1e12, growth: 2.1, per: 0.06, kind: "mulCompound", stat: "click", max: 50, unlock: { rebirths: 3 } },
  { id: "heartbreaker", name: "Heartbreaker", description: "Compounds click power again, harder.", cost: 5e15, growth: 2.6, per: 0.1, kind: "mulCompound", stat: "click", max: 40, unlock: { ascensions: 1 } },
]);

/* ------------------------------------------------------------------ */
/* Criticals                                                           */
/* ------------------------------------------------------------------ */

const CRITICAL = tree("critical", { kind: "add", stat: "critChance" }, [
  { id: "critical_chance", name: "Critical Chance", description: "Taps sometimes land twice as hard.", cost: 400, growth: 1.3, per: 0.01, max: 40 },
  { id: "lucky_heart", name: "Lucky Heart", description: "A little more luck on every tap.", cost: 9_000, growth: 1.34, per: 0.008, max: 25, unlock: { lifetimeHearts: 20_000 } },
  { id: "critical_mastery", name: "Critical Mastery", description: "Raises the crit ceiling further.", cost: 6e6, growth: 1.45, per: 0.006, max: 25, unlock: { lifetimeHearts: 5e6 } },
  { id: "mega_critical_chance", name: "Mega Critical Chance", description: "A crit can turn into a mega crit.", cost: 1.5e6, growth: 1.42, per: 0.012, max: 30, stat: "megaCritChance", unlock: { lifetimeHearts: 1e6 } },
  { id: "perfect_critical", name: "Perfect Critical", description: "Perfect timing rings crit far more often.", cost: 4e9, growth: 1.5, per: 0.01, max: 20, unlock: { rebirths: 1 } },
  { id: "critical_chain", name: "Critical Chain", description: "A crit can immediately trigger another.", cost: 3e8, growth: 1.5, per: 0.02, max: 25, stat: "critChainChance", unlock: { lifetimeHearts: 2e8 } },
  { id: "critical_power", name: "Critical Power", description: "Criticals hit for more.", cost: 2_500, growth: 1.32, per: 0.15, kind: "mulLinear", stat: "crit", max: 60 },
  { id: "golden_critical", name: "Golden Critical", description: "Criticals sometimes drop a golden heart.", cost: 3e6, growth: 1.44, per: 0.05, kind: "add", stat: "goldenChance", max: 20, unlock: { lifetimeHearts: 2e6 } },
  { id: "mega_critical_power", name: "Mega Critical Power", description: "Mega criticals hit for much more.", cost: 2e7, growth: 1.46, per: 0.4, kind: "mulLinear", stat: "megaCrit", max: 40, unlock: { lifetimeHearts: 1e7 } },
  { id: "critical_echo", name: "Critical Echo", description: "Criticals leave an echo of passive hearts.", cost: 9e8, growth: 1.48, per: 0.12, kind: "mulLinear", stat: "cps", max: 30, unlock: { lifetimeHearts: 5e8 } },
  { id: "critical_overflow", name: "Critical Overflow", description: "Overflowing crits spill extra hearts into the jar.", cost: 4e10, growth: 1.52, per: 0.25, kind: "mulLinear", stat: "crit", max: 30, unlock: { rebirths: 1 } },
  { id: "critical_frenzy", name: "Critical Frenzy", description: "Crits during a frenzy count double.", cost: 6e11, growth: 1.55, per: 0.3, kind: "mulLinear", stat: "crit", max: 25, unlock: { rebirths: 2 } },
  { id: "critical_rebate", name: "Critical Rebate", description: "Criticals shave a fraction off upgrade costs.", cost: 2e10, growth: 1.6, per: -0.004, kind: "mulLinear", stat: "cost", max: 40, unlock: { rebirths: 2 } },
  { id: "critical_energy", name: "Critical Energy", description: "Criticals refill your energy meter faster.", cost: 8e9, growth: 1.5, per: 0.2, kind: "mulLinear", stat: "energyRegen", max: 25, unlock: { rebirths: 1 } },
  { id: "pet_critical_bonus", name: "Pet Critical Bonus", description: "Your pets sharpen your criticals.", cost: 5e10, growth: 1.55, per: 0.18, kind: "mulLinear", stat: "petPower", max: 25, unlock: { rebirths: 2 }, synergy: ["pet_generator"] },
  { id: "eternal_critical", name: "Eternal Critical", description: "Compounds critical power without a ceiling in sight.", cost: 2e16, growth: 2.8, per: 0.09, kind: "mulCompound", stat: "crit", max: 40, unlock: { ascensions: 1 } },
]);

/* ------------------------------------------------------------------ */
/* Combo                                                               */
/* ------------------------------------------------------------------ */

const COMBO = tree("combo", { kind: "add", stat: "comboCap" }, [
  { id: "combo_duration", name: "Combo Duration", description: "Your combo takes longer to fade.", cost: 600, growth: 1.3, per: 120, stat: "comboDurationMs", max: 40 },
  { id: "combo_multiplier", name: "Combo Multiplier", description: "Each combo step is worth more.", cost: 3_000, growth: 1.34, per: 0.1, kind: "mulLinear", stat: "comboPower", max: 40 },
  { id: "combo_starter", name: "Combo Starter", description: "Begin every combo partway up.", cost: 25_000, growth: 1.4, per: 3, stat: "comboStart", max: 30 },
  { id: "combo_growth", name: "Combo Growth", description: "Combos climb faster per tap.", cost: 90_000, growth: 1.38, per: 0.09, kind: "mulLinear", stat: "comboGain", max: 30 },
  { id: "unbreakable_rhythm", name: "Unbreakable Rhythm", description: "Raises how high a combo can go.", cost: 12_000, growth: 1.36, per: 10, max: 50 },
  { id: "combo_protection", name: "Combo Protection", description: "Missed beats no longer end a combo instantly.", cost: 1.2e6, growth: 1.45, per: 1, stat: "comboShield", max: 10, unlock: { lifetimeHearts: 1e6 } },
  { id: "combo_recovery", name: "Combo Recovery", description: "A broken combo restarts much higher.", cost: 4e6, growth: 1.45, per: 5, stat: "comboStart", max: 30, unlock: { lifetimeHearts: 3e6 } },
  { id: "combo_freeze", name: "Combo Freeze", description: "Combos hold while an ability is running.", cost: 3e7, growth: 1.5, per: 400, stat: "comboDurationMs", max: 25, unlock: { lifetimeHearts: 2e7 } },
  { id: "combo_burst", name: "Combo Burst", description: "Reaching the cap releases a burst of hearts.", cost: 1.5e8, growth: 1.5, per: 0.2, kind: "mulLinear", stat: "comboPower", max: 25, unlock: { lifetimeHearts: 1e8 } },
  { id: "combo_criticals", name: "Combo Criticals", description: "Higher combos raise your critical chance.", cost: 6e8, growth: 1.5, per: 0.004, stat: "critChance", max: 25, unlock: { lifetimeHearts: 4e8 } },
  { id: "combo_banking", name: "Combo Banking", description: "Store part of a combo for your next session.", cost: 5e9, growth: 1.55, per: 8, stat: "comboStart", max: 25, unlock: { rebirths: 1 } },
  { id: "combo_echo", name: "Combo Echo", description: "Combos keep paying out after they end.", cost: 2e10, growth: 1.55, per: 0.15, kind: "mulLinear", stat: "cps", max: 25, unlock: { rebirths: 1 } },
  { id: "combo_insurance", name: "Combo Insurance", description: "One free save per combo, per minute.", cost: 8e10, growth: 1.7, per: 1, stat: "comboShield", max: 5, unlock: { rebirths: 2 } },
  { id: "combo_momentum", name: "Combo Momentum", description: "Long combos speed up ability recovery.", cost: 1.5e11, growth: 1.6, per: -0.02, kind: "mulLinear", stat: "skillCooldown", max: 20, unlock: { rebirths: 2 } },
  { id: "combo_pet_synergy", name: "Combo Pet Synergy", description: "Pets get stronger the longer your combo runs.", cost: 4e11, growth: 1.6, per: 0.2, kind: "mulLinear", stat: "petPower", max: 20, unlock: { rebirths: 3 } },
  { id: "golden_combo", name: "Golden Combo", description: "High combos attract golden hearts.", cost: 9e11, growth: 1.65, per: 0.3, kind: "mulLinear", stat: "golden", max: 20, unlock: { rebirths: 3 } },
  { id: "eternal_combo", name: "Eternal Combo", description: "Compounds combo power permanently.", cost: 8e15, growth: 2.7, per: 0.08, kind: "mulCompound", stat: "comboPower", max: 40, unlock: { ascensions: 1 } },
]);

/* ------------------------------------------------------------------ */
/* Passive generation                                                  */
/* ------------------------------------------------------------------ */

const GENERATION = tree("generation", { kind: "add", stat: "cpsFlat" }, [
  { id: "passive_hearts", name: "Passive Hearts", description: "Hearts trickle in on their own.", cost: 60, growth: 1.15, per: 0.5 },
  { id: "jar_generator", name: "Jar Generator", description: "The jar starts making its own hearts.", cost: 900, growth: 1.16, per: 4 },
  { id: "heart_fountain", name: "Heart Fountain", description: "A steady fountain feeding the jar.", cost: 11_000, growth: 1.16, per: 26 },
  { id: "love_factory", name: "Love Factory", description: "Industrial affection.", cost: 150_000, growth: 1.17, per: 170 },
  { id: "heart_garden", name: "Heart Garden", description: "Hearts grow if you plant them.", cost: 2e6, growth: 1.17, per: 1_200, unlock: { lifetimeHearts: 1e6 } },
  { id: "crystal_heart_mine", name: "Crystal Heart Mine", description: "Deep seams of crystallised affection.", cost: 3e7, growth: 1.18, per: 9_000, unlock: { lifetimeHearts: 1.5e7 } },
  { id: "memory_reactor", name: "Memory Reactor", description: "Old memories, still warm.", cost: 5e8, growth: 1.18, per: 70_000, unlock: { lifetimeHearts: 2e8 } },
  { id: "bond_engine", name: "Bond Engine", description: "Runs on the two of you.", cost: 8e9, growth: 1.19, per: 600_000, unlock: { lifetimeHearts: 4e9 } },
  { id: "affection_core", name: "Affection Core", description: "A core that never quite cools.", cost: 1.4e11, growth: 1.19, per: 5.2e6, unlock: { rebirths: 1 } },
  { id: "heart_portal", name: "Heart Portal", description: "Hearts arrive from somewhere else entirely.", cost: 2.6e12, growth: 1.2, per: 4.8e7, unlock: { rebirths: 2 } },
  { id: "cosmic_love_generator", name: "Cosmic Love Generator", description: "Scales with everything you have ever earned.", cost: 6e13, growth: 1.2, per: 4.5e8, unlock: { rebirths: 3 } },
  { id: "eternal_jar", name: "Eternal Jar", description: "The jar that never empties.", cost: 2e15, growth: 1.22, per: 6e9, unlock: { ascensions: 1 } },
  { id: "pet_generator", name: "Pet Generator", description: "Your pets contribute hearts while you play.", cost: 4e6, growth: 1.4, per: 0.16, kind: "mulLinear", stat: "petPower", max: 30, unlock: { lifetimeHearts: 2e6 } },
  { id: "offline_generator", name: "Offline Generator", description: "Generators keep running while the app is closed.", cost: 2e7, growth: 1.45, per: 0.1, kind: "mulLinear", stat: "offline", max: 30, unlock: { lifetimeHearts: 1e7 } },
  { id: "rebirth_generator", name: "Rebirth Generator", description: "Passive output scales with your rebirth count.", cost: 5e10, growth: 1.55, per: 0.25, kind: "mulLinear", stat: "cps", max: 25, unlock: { rebirths: 2 } },
  { id: "ascension_generator", name: "Ascension Generator", description: "Passive output scales with ascensions.", cost: 3e14, growth: 1.7, per: 0.5, kind: "mulLinear", stat: "cps", max: 25, unlock: { ascensions: 1 } },
  { id: "event_generator", name: "Event Generator", description: "Extra passive output while an event is running.", cost: 8e8, growth: 1.5, per: 0.12, kind: "mulLinear", stat: "eventReward", max: 25, unlock: { lifetimeHearts: 5e8 } },
]);

/* ------------------------------------------------------------------ */
/* Jar                                                                 */
/* ------------------------------------------------------------------ */

const JAR = tree("jar", { kind: "add", stat: "jarCapacity" }, [
  { id: "larger_jar", name: "Larger Jar", description: "Holds more before it overflows.", cost: 300, growth: 1.22, per: 250 },
  { id: "reinforced_jar", name: "Reinforced Jar", description: "Thicker glass, steadier stack.", cost: 8_000, growth: 1.24, per: 4_000 },
  { id: "jar_capacity", name: "Jar Capacity", description: "Room for a great deal more.", cost: 250_000, growth: 1.26, per: 90_000, unlock: { lifetimeHearts: 200_000 } },
  { id: "jar_compression", name: "Jar Compression", description: "Packs hearts closer together.", cost: 9e6, growth: 1.3, per: 2.5e6, unlock: { lifetimeHearts: 6e6 } },
  { id: "endless_jar", name: "Endless Jar", description: "Capacity grows with everything you own.", cost: 5e10, growth: 1.4, per: 4e9, unlock: { rebirths: 1 } },
  { id: "overflow_bonus", name: "Overflow Bonus", description: "A full jar pays a bonus instead of wasting hearts.", cost: 45_000, growth: 1.4, per: 0.12, kind: "mulLinear", stat: "all", max: 20, unlock: { lifetimeHearts: 100_000 } },
  { id: "overflow_duration", name: "Overflow Duration", description: "Overflow lasts longer before it settles.", cost: 400_000, growth: 1.42, per: 0.1, kind: "mulLinear", stat: "click", max: 25, unlock: { lifetimeHearts: 500_000 } },
  { id: "overflow_multiplier", name: "Overflow Multiplier", description: "Overflow pays out much harder.", cost: 6e6, growth: 1.45, per: 0.18, kind: "mulLinear", stat: "all", max: 20, unlock: { lifetimeHearts: 4e6 } },
  { id: "golden_jar", name: "Golden Jar", description: "Golden hearts linger longer in a golden jar.", cost: 2e7, growth: 1.45, per: 0.2, kind: "mulLinear", stat: "golden", max: 25, unlock: { lifetimeHearts: 1e7 } },
  { id: "crystal_jar", name: "Crystal Jar", description: "Treasure hearts appear more often.", cost: 1.2e8, growth: 1.48, per: 0.25, kind: "mulLinear", stat: "treasure", max: 25, unlock: { lifetimeHearts: 8e7 } },
  { id: "jar_stability", name: "Jar Stability", description: "Combo decay slows while the jar is full.", cost: 5e8, growth: 1.5, per: 300, stat: "comboDurationMs", max: 25, unlock: { lifetimeHearts: 3e8 } },
  { id: "jar_luck", name: "Jar Luck", description: "Raises luck across the whole game.", cost: 2e9, growth: 1.55, per: 0.02, stat: "luck", max: 30, unlock: { rebirths: 1 } },
  { id: "jar_magnet", name: "Jar Magnet", description: "Bonus hearts drift toward the jar on their own.", cost: 9e9, growth: 1.55, per: 0.15, kind: "mulLinear", stat: "golden", max: 20, unlock: { rebirths: 1 } },
  { id: "jar_energy_storage", name: "Jar Energy Storage", description: "Holds more energy for abilities.", cost: 3e10, growth: 1.6, per: 12, stat: "energyMax", max: 25, unlock: { rebirths: 2 } },
  { id: "jar_combo_storage", name: "Jar Combo Storage", description: "Stores combo between sessions.", cost: 7e10, growth: 1.6, per: 6, stat: "comboStart", max: 20, unlock: { rebirths: 2 } },
  { id: "jar_critical_storage", name: "Jar Critical Storage", description: "Stored criticals fire on your next tap.", cost: 1.6e11, growth: 1.62, per: 0.2, kind: "mulLinear", stat: "crit", max: 20, unlock: { rebirths: 2 } },
  { id: "jar_reactor", name: "Jar Reactor", description: "The jar itself starts producing.", cost: 6e12, growth: 1.65, per: 0.3, kind: "mulLinear", stat: "cps", max: 25, unlock: { rebirths: 3 } },
  { id: "jar_echo", name: "Jar Echo", description: "The jar repeats a fraction of every tap.", cost: 2e13, growth: 1.7, per: 0.25, kind: "mulLinear", stat: "click", max: 20, unlock: { rebirths: 4 } },
  { id: "jar_mastery", name: "Jar Mastery", description: "Everything about the jar, improved.", cost: 5e14, growth: 1.9, per: 0.15, kind: "mulLinear", stat: "all", max: 20, unlock: { ascensions: 1 } },
  { id: "eternal_jar_core", name: "Eternal Jar Core", description: "Compounds every heart you will ever earn.", cost: 4e16, growth: 3, per: 0.07, kind: "mulCompound", stat: "all", max: 30, unlock: { ascensions: 2 } },
]);

/* ------------------------------------------------------------------ */
/* Speed                                                               */
/* ------------------------------------------------------------------ */

const SPEED = tree("speed", { kind: "mulLinear", stat: "animationSpeed" }, [
  { id: "faster_animations", name: "Faster Animations", description: "Snappier feedback without losing clarity.", cost: 5_000, growth: 1.5, per: 0.08, max: 8 },
  { id: "faster_ability_recovery", name: "Faster Ability Recovery", description: "Abilities come back sooner.", cost: 60_000, growth: 1.45, per: -0.025, stat: "skillCooldown", max: 25 },
  { id: "faster_pet_actions", name: "Faster Pet Actions", description: "Pets act more often.", cost: 300_000, growth: 1.45, per: 0.1, stat: "petPower", max: 25, unlock: { lifetimeHearts: 300_000 } },
  { id: "faster_energy_recovery", name: "Faster Energy Recovery", description: "Energy refills quicker.", cost: 900_000, growth: 1.45, per: 0.12, stat: "energyRegen", max: 25, unlock: { lifetimeHearts: 800_000 } },
  { id: "faster_charge", name: "Faster Charge", description: "Hold to charge fills sooner.", cost: 2.5e6, growth: 1.45, per: 0.12, stat: "chargeSpeed", max: 25, unlock: { lifetimeHearts: 2e6 } },
  { id: "faster_challenge_progress", name: "Faster Challenge Progress", description: "Challenge objectives tick up faster.", cost: 2e7, growth: 1.5, per: 0.1, stat: "missionReward", max: 20, unlock: { lifetimeHearts: 1e7 } },
  { id: "faster_mission_progress", name: "Faster Mission Progress", description: "Missions complete sooner.", cost: 5e7, growth: 1.5, per: 0.12, stat: "missionReward", max: 20, unlock: { lifetimeHearts: 3e7 } },
  { id: "faster_offline_calculation", name: "Faster Offline Calculation", description: "Offline time counts for more.", cost: 2e8, growth: 1.5, per: 0.1, stat: "offline", max: 20, unlock: { lifetimeHearts: 1e8 } },
  { id: "faster_golden_spawns", name: "Faster Golden Spawns", description: "Golden hearts show up sooner.", cost: 8e8, growth: 1.52, per: 0.15, stat: "golden", max: 20, unlock: { lifetimeHearts: 5e8 } },
  { id: "faster_treasure_opening", name: "Faster Treasure Opening", description: "Treasure hearts open instantly and pay more.", cost: 3e9, growth: 1.55, per: 0.18, stat: "treasure", max: 20, unlock: { rebirths: 1 } },
  { id: "faster_rebirth_progress", name: "Faster Rebirth Progress", description: "Rebirth requirements arrive sooner.", cost: 4e10, growth: 1.6, per: 0.12, stat: "tokenGain", max: 20, unlock: { rebirths: 2 } },
  { id: "faster_ascension_progress", name: "Faster Ascension Progress", description: "Ascension requirements arrive sooner.", cost: 8e13, growth: 1.8, per: 0.15, stat: "crystalGain", max: 20, unlock: { ascensions: 1 } },
]);

/* ------------------------------------------------------------------ */
/* Luck                                                                */
/* ------------------------------------------------------------------ */

const LUCK = tree("luck", { kind: "add", stat: "luck" }, [
  { id: "golden_heart_chance", name: "Golden Heart Chance", description: "Golden hearts appear more often.", cost: 20_000, growth: 1.4, per: 0.012, stat: "goldenChance", max: 30 },
  { id: "treasure_heart_chance", name: "Treasure Heart Chance", description: "Treasure hearts appear more often.", cost: 120_000, growth: 1.42, per: 0.008, stat: "treasureChance", max: 30, unlock: { lifetimeHearts: 150_000 } },
  { id: "critical_luck", name: "Critical Luck", description: "General luck, which touches nearly everything.", cost: 400_000, growth: 1.45, per: 0.03, max: 25, unlock: { lifetimeHearts: 400_000 } },
  { id: "double_reward_chance", name: "Double Reward Chance", description: "Rewards sometimes pay twice.", cost: 3e6, growth: 1.5, per: 0.01, stat: "doubleRewardChance", max: 30, unlock: { lifetimeHearts: 2e6 } },
  { id: "rare_pet_egg_chance", name: "Rare Pet Egg Chance", description: "Better odds inside every egg.", cost: 1.2e7, growth: 1.5, per: 0.04, max: 20, unlock: { lifetimeHearts: 8e6 } },
  { id: "bonus_currency_chance", name: "Bonus Currency Chance", description: "Extra dust, shards and fragments.", cost: 4e7, growth: 1.5, per: 0.15, kind: "mulLinear", stat: "fragmentGain", max: 20, unlock: { lifetimeHearts: 2e7 } },
  { id: "free_upgrade_chance", name: "Free Upgrade Chance", description: "Purchases are sometimes free.", cost: 2e8, growth: 1.6, per: 0.006, stat: "freeUpgradeChance", max: 25, unlock: { lifetimeHearts: 1e8 } },
  { id: "chest_luck", name: "Chest Luck", description: "Better contents from treasure hearts.", cost: 6e8, growth: 1.55, per: 0.2, kind: "mulLinear", stat: "treasure", max: 20, unlock: { lifetimeHearts: 4e8 } },
  { id: "pet_luck", name: "Pet Luck", description: "Pets find more while they work.", cost: 2e9, growth: 1.55, per: 0.18, kind: "mulLinear", stat: "petPower", max: 20, unlock: { rebirths: 1 } },
  { id: "collection_luck", name: "Collection Luck", description: "Collectibles drop more often.", cost: 8e9, growth: 1.6, per: 0.2, kind: "mulLinear", stat: "treasure", max: 20, unlock: { rebirths: 1 } },
  { id: "charm_luck", name: "Charm Luck", description: "Better affixes when crafting charms.", cost: 3e10, growth: 1.6, per: 0.04, max: 20, unlock: { rebirths: 2 } },
  { id: "rare_mission_chance", name: "Rare Mission Chance", description: "More missions with real rewards.", cost: 9e10, growth: 1.62, per: 0.2, kind: "mulLinear", stat: "missionReward", max: 20, unlock: { rebirths: 2 } },
  { id: "rare_event_chance", name: "Rare Event Chance", description: "Better odds in the event pools.", cost: 3e11, growth: 1.65, per: 0.2, kind: "mulLinear", stat: "eventReward", max: 20, unlock: { rebirths: 3 } },
  { id: "rebirth_luck", name: "Rebirth Luck", description: "More tokens from every rebirth.", cost: 1e12, growth: 1.7, per: 0.15, kind: "mulLinear", stat: "tokenGain", max: 20, unlock: { rebirths: 3 } },
  { id: "ascension_luck", name: "Ascension Luck", description: "More crystals from every ascension.", cost: 5e14, growth: 1.9, per: 0.15, kind: "mulLinear", stat: "crystalGain", max: 20, unlock: { ascensions: 1 } },
  { id: "cosmic_luck", name: "Cosmic Luck", description: "Luck, compounded.", cost: 6e16, growth: 3, per: 0.05, kind: "mulCompound", stat: "golden", max: 30, unlock: { ascensions: 2 } },
]);

/* ------------------------------------------------------------------ */
/* Discounts. Floored so nothing ever reaches zero cost.               */
/* ------------------------------------------------------------------ */

const DISCOUNT = tree("discount", { kind: "mulLinear", stat: "cost" }, [
  { id: "upgrade_cost_reduction", name: "Upgrade Cost Reduction", description: "Everything in the normal trees costs less.", cost: 30_000, growth: 1.6, per: -0.015, max: 30 },
  { id: "bulk_purchase_bonus", name: "Bulk Purchase Bonus", description: "Buying ten or more at once costs less.", cost: 250_000, growth: 1.6, per: -0.01, max: 25, unlock: { lifetimeHearts: 300_000 } },
  { id: "first_purchase_discount", name: "First Purchase Discount", description: "The first level of anything is cheaper.", cost: 900_000, growth: 1.6, per: -0.008, max: 20, unlock: { lifetimeHearts: 800_000 } },
  { id: "pet_upgrade_discount", name: "Pet Upgrade Discount", description: "Pet levelling costs fewer treats.", cost: 4e6, growth: 1.6, per: -0.012, max: 25, unlock: { lifetimeHearts: 3e6 } },
  { id: "skill_upgrade_discount", name: "Skill Upgrade Discount", description: "Skill levels cost fewer points.", cost: 1.5e7, growth: 1.6, per: -0.012, max: 25, unlock: { lifetimeHearts: 1e7 } },
  { id: "shop_discount", name: "Shop Discount", description: "The shop shaves a little off.", cost: 6e7, growth: 1.62, per: -0.01, max: 25, unlock: { lifetimeHearts: 4e7 } },
  { id: "charm_crafting_discount", name: "Charm Crafting Discount", description: "Crafting costs fewer fragments.", cost: 2e8, growth: 1.62, per: -0.012, max: 25, unlock: { lifetimeHearts: 1e8 } },
  { id: "mission_reroll_discount", name: "Mission Reroll Discount", description: "Rerolling a mission is cheaper.", cost: 8e8, growth: 1.65, per: -0.015, max: 20, unlock: { rebirths: 1 } },
  { id: "combo_based_discount", name: "Combo Based Discount", description: "High combos lower every price.", cost: 3e9, growth: 1.65, per: -0.012, max: 20, unlock: { rebirths: 1 } },
  { id: "daily_discount", name: "Daily Discount", description: "The first purchase each day is half price.", cost: 1e10, growth: 1.7, per: -0.01, max: 20, unlock: { rebirths: 2 } },
  { id: "event_shop_discount", name: "Event Shop Discount", description: "Event prices drop.", cost: 4e10, growth: 1.7, per: -0.012, max: 20, unlock: { rebirths: 2 } },
  { id: "rebirth_upgrade_discount", name: "Rebirth Upgrade Discount", description: "Rebirth upgrades cost fewer tokens.", cost: 2e11, growth: 1.75, per: -0.012, max: 20, unlock: { rebirths: 3 } },
  { id: "refund_improvement", name: "Refund Improvement", description: "Respecs return more of what you spent.", cost: 8e11, growth: 1.75, per: -0.008, max: 20, unlock: { rebirths: 3 } },
  { id: "partner_discount", name: "Partner Discount", description: "Prices drop while your partner is playing too.", cost: 3e12, growth: 1.8, per: -0.01, max: 20, unlock: { rebirths: 4 } },
  { id: "ascension_upgrade_discount", name: "Ascension Upgrade Discount", description: "Ascension upgrades cost fewer crystals.", cost: 2e15, growth: 2, per: -0.012, max: 20, unlock: { ascensions: 1 } },
]);

/* ------------------------------------------------------------------ */
/* Offline                                                             */
/* ------------------------------------------------------------------ */

const OFFLINE = tree("offline", { kind: "add", stat: "offlineHours" }, [
  { id: "longer_offline", name: "Longer Offline Earnings", description: "Collect from more hours away.", cost: 40_000, growth: 1.45, per: 1, max: 44 },
  { id: "improved_offline_rate", name: "Improved Offline Rate", description: "Time away is worth more per hour.", cost: 90_000, growth: 1.42, per: 0.08, kind: "mulLinear", stat: "offline", max: 40 },
  { id: "offline_criticals", name: "Offline Criticals", description: "Criticals happen while you are away.", cost: 1.5e6, growth: 1.5, per: 0.1, kind: "mulLinear", stat: "offline", max: 25, unlock: { lifetimeHearts: 1e6 } },
  { id: "offline_pet_actions", name: "Offline Pet Actions", description: "Pets keep working while you are away.", cost: 6e6, growth: 1.5, per: 0.12, kind: "mulLinear", stat: "petPower", max: 25, unlock: { lifetimeHearts: 4e6 } },
  { id: "offline_mission_progress", name: "Offline Mission Progress", description: "Missions advance while you are away.", cost: 2e7, growth: 1.52, per: 0.1, kind: "mulLinear", stat: "missionReward", max: 20, unlock: { lifetimeHearts: 1.5e7 } },
  { id: "offline_challenge_progress", name: "Offline Challenge Progress", description: "Challenges advance while you are away.", cost: 7e7, growth: 1.52, per: 0.1, kind: "mulLinear", stat: "missionReward", max: 20, unlock: { lifetimeHearts: 5e7 } },
  { id: "offline_skill_charging", name: "Offline Skill Charging", description: "Ability cooldowns tick down while away.", cost: 2e8, growth: 1.55, per: -0.02, kind: "mulLinear", stat: "skillCooldown", max: 20, unlock: { lifetimeHearts: 1.5e8 } },
  { id: "offline_treasure_chance", name: "Offline Treasure Chance", description: "Treasure waiting for you when you return.", cost: 8e8, growth: 1.55, per: 0.15, kind: "mulLinear", stat: "treasure", max: 20, unlock: { lifetimeHearts: 6e8 } },
  { id: "offline_combo_storage", name: "Offline Combo Storage", description: "Return with part of your combo intact.", cost: 3e9, growth: 1.6, per: 5, stat: "comboStart", max: 20, unlock: { rebirths: 1 } },
  { id: "offline_event_progress", name: "Offline Event Progress", description: "Event progress continues while away.", cost: 1e10, growth: 1.6, per: 0.12, kind: "mulLinear", stat: "eventReward", max: 20, unlock: { rebirths: 1 } },
  { id: "offline_reward_multiplier", name: "Offline Reward Multiplier", description: "A flat boost to everything earned offline.", cost: 5e10, growth: 1.65, per: 0.15, kind: "mulLinear", stat: "offline", max: 25, unlock: { rebirths: 2 } },
  { id: "welcome_back_bonus", name: "Welcome Back Bonus", description: "A burst of hearts the moment you return.", cost: 2e11, growth: 1.7, per: 0.2, kind: "mulLinear", stat: "offline", max: 20, unlock: { rebirths: 2 } },
  { id: "offline_rebirth_progress", name: "Offline Rebirth Progress", description: "Rebirth tokens accrue slowly while away.", cost: 8e11, growth: 1.75, per: 0.1, kind: "mulLinear", stat: "tokenGain", max: 20, unlock: { rebirths: 3 } },
  { id: "offline_ascension_energy", name: "Offline Ascension Energy", description: "Ascension progress accrues while away.", cost: 3e15, growth: 2, per: 0.12, kind: "mulLinear", stat: "crystalGain", max: 20, unlock: { ascensions: 1 } },
  { id: "offline_protection", name: "Offline Protection", description: "Nothing decays while you are gone.", cost: 5e9, growth: 1.8, per: 2, stat: "comboShield", max: 5, unlock: { rebirths: 1 } },
]);

/* ------------------------------------------------------------------ */
/* Partner. Bought with Bond Energy, which is capped daily, so nobody  */
/* has any reason to spam their partner for progress.                  */
/* ------------------------------------------------------------------ */

const PARTNER = tree("partner", { kind: "mulLinear", stat: "all", currency: "bond" }, [
  { id: "shared_question_bonus", name: "Shared Question Bonus", description: "Answering the daily question is worth more.", cost: 4, growth: 1.35, per: 0.05, max: 20, stat: "bondGain" },
  { id: "message_bonus", name: "Message Bonus", description: "A thoughtful message pays a little more.", cost: 6, growth: 1.35, per: 0.05, max: 20, stat: "bondGain" },
  { id: "memory_bonus", name: "Memory Bonus", description: "Shared memories are worth more bond.", cost: 8, growth: 1.35, per: 0.05, max: 20, stat: "bondGain" },
  { id: "drawing_bonus", name: "Drawing Bonus", description: "Drawings are worth more bond.", cost: 8, growth: 1.35, per: 0.05, max: 20, stat: "bondGain" },
  { id: "compliment_bonus", name: "Compliment Bonus", description: "Compliments and letters are worth more bond.", cost: 10, growth: 1.35, per: 0.05, max: 20, stat: "bondGain" },
  { id: "couple_combo", name: "Couple Combo", description: "Combos climb faster. Works whether or not they are online.", cost: 14, growth: 1.4, per: 0.06, max: 20, stat: "comboGain" },
  { id: "couple_critical", name: "Couple Critical", description: "Shared criticals hit harder.", cost: 18, growth: 1.4, per: 0.08, max: 20, stat: "crit" },
  { id: "partner_click_assist", name: "Partner Click Assist", description: "A ghost of their taps helps yours land.", cost: 24, growth: 1.42, per: 0.07, max: 20, stat: "click" },
  { id: "partner_generator", name: "Partner Generator", description: "Passive output rises with your shared streak.", cost: 30, growth: 1.42, per: 0.07, max: 20, stat: "cps" },
  { id: "shared_jar_overflow", name: "Shared Jar Overflow", description: "Overflow pays both of you.", cost: 40, growth: 1.45, per: 0.06, max: 20, stat: "all" },
  { id: "partner_pet_synergy", name: "Partner Pet Synergy", description: "Pets are stronger when you both play.", cost: 55, growth: 1.45, per: 0.08, max: 20, stat: "petPower" },
  { id: "shared_offline_bonus", name: "Shared Offline Bonus", description: "Better offline rate for both of you.", cost: 70, growth: 1.45, per: 0.07, max: 20, stat: "offline" },
  { id: "date_streak_bonus", name: "Date Streak Bonus", description: "Plans you keep together pay out.", cost: 90, growth: 1.5, per: 0.06, max: 20, stat: "all" },
  { id: "partner_gift_bonus", name: "Partner Gift Bonus", description: "Gifts sent and received are worth more.", cost: 120, growth: 1.5, per: 0.1, max: 15, stat: "eventReward" },
  { id: "bond_level_bonus", name: "Bond Level Bonus", description: "A global multiplier from your bond level.", cost: 160, growth: 1.55, per: 0.06, max: 25, stat: "all" },
  { id: "partner_rebirth_bonus", name: "Partner Rebirth Bonus", description: "More tokens when you both rebirth in the same week.", cost: 220, growth: 1.6, per: 0.08, max: 15, stat: "tokenGain", unlock: { rebirths: 1 } },
  { id: "partner_ascension_bonus", name: "Partner Ascension Bonus", description: "More crystals when you both ascend.", cost: 400, growth: 1.7, per: 0.08, max: 15, stat: "crystalGain", unlock: { ascensions: 1 } },
]);

/* ------------------------------------------------------------------ */
/* Mastery. The long tail, bought with Mastery Points.                 */
/* ------------------------------------------------------------------ */

const MASTERY = tree("mastery", { kind: "mulCompound", stat: "all", currency: "mastery" }, [
  { id: "mastery_click", name: "Click Mastery", description: "Compounds click power forever.", cost: 3, growth: 1.6, per: 0.05, max: 50, stat: "click" },
  { id: "mastery_passive", name: "Passive Mastery", description: "Compounds passive output forever.", cost: 3, growth: 1.6, per: 0.05, max: 50, stat: "cps" },
  { id: "mastery_crit", name: "Critical Mastery", description: "Compounds critical power forever.", cost: 5, growth: 1.65, per: 0.05, max: 40, stat: "crit" },
  { id: "mastery_combo", name: "Combo Mastery", description: "Compounds combo power forever.", cost: 5, growth: 1.65, per: 0.05, max: 40, stat: "comboPower" },
  { id: "mastery_pets", name: "Pet Mastery", description: "Compounds pet power forever.", cost: 8, growth: 1.7, per: 0.05, max: 40, stat: "petPower" },
  { id: "mastery_luck", name: "Luck Mastery", description: "Compounds golden heart value forever.", cost: 8, growth: 1.7, per: 0.05, max: 40, stat: "golden" },
  { id: "mastery_all", name: "Jar Mastery", description: "Compounds every source of hearts.", cost: 20, growth: 1.9, per: 0.04, max: 40, stat: "all" },
  { id: "mastery_tokens", name: "Rebirth Mastery", description: "Compounds rebirth token gain.", cost: 15, growth: 1.85, per: 0.05, max: 30, stat: "tokenGain" },
  { id: "mastery_crystals", name: "Ascension Mastery", description: "Compounds ascension crystal gain.", cost: 30, growth: 2, per: 0.05, max: 30, stat: "crystalGain" },
]);

export const UPGRADES: UpgradeDef[] = [
  ...CLICK,
  ...CRITICAL,
  ...COMBO,
  ...GENERATION,
  ...JAR,
  ...SPEED,
  ...LUCK,
  ...DISCOUNT,
  ...OFFLINE,
  ...PARTNER,
  ...MASTERY,
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);

export const UPGRADE_TREES: { id: UpgradeTree; name: string; blurb: string }[] = [
  { id: "click", name: "Click power", blurb: "Everything that makes a single tap worth more." },
  { id: "critical", name: "Criticals", blurb: "Chance, power, chains and echoes." },
  { id: "combo", name: "Combo", blurb: "Length, height and what happens at the top." },
  { id: "generation", name: "Generation", blurb: "Hearts that arrive without you." },
  { id: "jar", name: "The jar", blurb: "Capacity, overflow and what the jar does on its own." },
  { id: "speed", name: "Speed", blurb: "Cooldowns, charge time and how fast things resolve." },
  { id: "luck", name: "Luck", blurb: "Odds across every random thing in the game." },
  { id: "discount", name: "Discounts", blurb: "Lower prices. Never free, on purpose." },
  { id: "offline", name: "Offline", blurb: "Making time away count without replacing playing." },
  { id: "partner", name: "Partner", blurb: "Optional bonuses from the rest of the app." },
  { id: "mastery", name: "Mastery", blurb: "The long tail, bought with mastery points." },
];

/** The mods a given upgrade contributes at a given level. */
export function upgradeMods(def: UpgradeDef, level: number): Mods {
  if (level <= 0) return {};
  if (def.kind === "add") {
    return { add: { [def.stat as AddStat]: def.per * level } };
  }
  if (def.kind === "mulLinear") {
    return { mul: { [def.stat as MulStat]: 1 + def.per * level } };
  }
  return { mul: { [def.stat as MulStat]: Math.pow(1 + def.per, level) } };
}

/** Plain English description of what the next level buys. */
export function nextEffectLabel(def: UpgradeDef): string {
  if (def.kind === "add") {
    if (def.stat === "comboDurationMs") return `+${(def.per / 1000).toFixed(2)}s combo time`;
    if (def.stat === "critChance" || def.stat === "megaCritChance" || def.stat === "goldenChance" ||
        def.stat === "treasureChance" || def.stat === "freeUpgradeChance" ||
        def.stat === "doubleRewardChance" || def.stat === "critChainChance" || def.stat === "luck") {
      return `+${(def.per * 100).toFixed(2)}%`;
    }
    return `+${def.per.toLocaleString()} ${addStatLabel(def.stat as AddStat)}`;
  }
  const pct = Math.abs(def.per * 100);
  const sign = def.per < 0 ? "-" : "+";
  const suffix = def.kind === "mulCompound" ? " compounding" : "";
  return `${sign}${pct.toFixed(pct < 1 ? 2 : 0)}% ${mulStatLabel(def.stat as MulStat)}${suffix}`;
}

export function addStatLabel(stat: AddStat): string {
  const labels: Partial<Record<AddStat, string>> = {
    clickFlat: "hearts per click",
    cpsFlat: "hearts per second",
    comboCap: "max combo",
    comboStart: "starting combo",
    jarCapacity: "jar capacity",
    petSlots: "pet slots",
    skillSlots: "ability slots",
    charmSlots: "charm slots",
    energyMax: "max energy",
    focusMax: "max focus",
    heatMax: "max heat",
    comboShield: "combo saves",
    offlineHours: "offline hours",
    startingUpgrades: "free starting levels",
    dailyDeals: "daily deals",
  };
  return labels[stat] ?? stat;
}

export function mulStatLabel(stat: MulStat): string {
  const labels: Partial<Record<MulStat, string>> = {
    all: "to all hearts",
    click: "click power",
    cps: "passive hearts",
    crit: "critical power",
    megaCrit: "mega critical power",
    comboGain: "combo growth",
    comboPower: "combo payout",
    golden: "golden heart value",
    treasure: "treasure rewards",
    offline: "offline earnings",
    cost: "upgrade cost",
    petPower: "pet power",
    petXp: "pet experience",
    skillDuration: "ability duration",
    skillCooldown: "ability cooldown",
    bossDamage: "boss damage",
    bossReward: "boss rewards",
    missionReward: "mission rewards",
    eventReward: "event rewards",
    tokenGain: "rebirth tokens",
    crystalGain: "ascension crystals",
    dustGain: "love dust",
    bondGain: "bond energy",
    shardGain: "memory shards",
    fragmentGain: "charm fragments",
    treatGain: "pet treats",
    chargeSpeed: "charge speed",
    energyRegen: "energy recovery",
    animationSpeed: "animation speed",
  };
  return labels[stat] ?? stat;
}
