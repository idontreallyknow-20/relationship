import type { AddStat, CurrencyId, Mods, MulStat, Person } from "../types";

// Three trees instead of eleven. Cami's is the otters and the surface,
// Joseph's is the crabs and the floor, Us is shared.
//
// Both of you can buy from all three. Your own tree is cheaper for you and a
// little stronger, so you specialise without ever being locked out.

export type Tree = "cami" | "joseph" | "us";

export const TREE_OWNER: Record<Tree, Person | null> = {
  cami: "cami",
  joseph: "joseph",
  us: null,
};

/**
 * You buy yours, they buy theirs.
 *
 * There used to be a penalty instead of a rule: the other person's tree cost
 * you sixty percent more and gave you a quarter less, but you could still buy
 * all of it. That made every upgrade screen twice as long as it needed to be
 * and left the player wondering why they would ever want the worse version.
 * Now Cami's tree is Cami's, Joseph's is Joseph's, and Us belongs to both.
 */

export interface UnlockRule {
  lifetimeHearts?: number;
  tideChanges?: number;
  newWaters?: number;
  upgrade?: [string, number];
  vessel?: string;
}

export type EffectKind = "add" | "mulLinear" | "mulCompound";

export interface UpgradeDef {
  id: string;
  tree: Tree;
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
  milestones?: number[];
  milestoneMods?: Mods;
  /**
   * The upgrade this one grows out of, drawn as a branch in the tree view.
   *
   * Purely a shape: nothing enforces buying a parent first, because a tree you
   * cannot see the far end of is a tree you cannot plan in. The first upgrade
   * in each tree has no parent and is the trunk.
   */
  after?: string;
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
  after?: string;
}

function tree(treeId: Tree, defaults: { kind: EffectKind; stat: AddStat | MulStat; currency?: CurrencyId }, specs: Spec[]): UpgradeDef[] {
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
    after: s.after,
    milestones: [10, 25, 50, 100, 200],
    milestoneMods: { mul: { all: 1.03 } },
  }));
}

/* ------------------------------------------------------------------ */
/* Cami: otters, the surface, bursts                                   */
/* ------------------------------------------------------------------ */

const CAMI = tree("cami", { kind: "add", stat: "clickFlat" }, [
  { id: "otter_hands", name: "Otter Hands", description: "More in every tap.", cost: 15, growth: 1.13, per: 1 },
  { after: "otter_hands", id: "quick_paws", name: "Quick Paws", description: "Otters act more often.", cost: 200, growth: 1.3, per: 0.05, kind: "mulLinear", stat: "crackSpeed", max: 40 },
  { after: "quick_paws", id: "shell_cracking", name: "Shell Cracking", description: "Every crack is worth more.", cost: 400, growth: 1.28, per: 0.09, kind: "mulLinear", stat: "crackValue", max: 60 },
  { after: "otter_hands", id: "backstroke", name: "Backstroke", description: "Combos last longer.", cost: 900, growth: 1.3, per: 130, stat: "comboDurationMs", max: 40 },
  { after: "otter_hands", id: "playful", name: "Playful", description: "Better odds on every tap.", cost: 1_800, growth: 1.32, per: 0.012, stat: "critChance", max: 40 },
  { after: "otter_hands", id: "reinforced_tap", name: "Firm Press", description: "Weight behind the tap.", cost: 6_000, growth: 1.15, per: 6 },
  { after: "playful", id: "somersault", name: "Somersault", description: "Criticals hit harder.", cost: 12_000, growth: 1.33, per: 0.16, kind: "mulLinear", stat: "crit", max: 60 },
  { after: "shell_cracking", id: "floating_together", name: "Floating Together", description: "Otters holding hands gain more.", cost: 40_000, growth: 1.4, per: 0.12, kind: "mulLinear", stat: "pairBonus", max: 30, unlock: { lifetimeHearts: 30_000 } },
  { after: "backstroke", id: "otter_chatter", name: "Otter Chatter", description: "Combos climb faster.", cost: 90_000, growth: 1.38, per: 0.08, kind: "mulLinear", stat: "comboGain", max: 30 },
  { after: "reinforced_tap", id: "deep_breath", name: "Deep Breath", description: "Every tap lands heavier.", cost: 150_000, growth: 1.42, per: 0.16, kind: "mulLinear", stat: "click", max: 30, unlock: { lifetimeHearts: 120_000 } },
  { after: "floating_together", id: "cracking_stone", name: "Cracking Stone", description: "More shells come out of every crack.", cost: 400_000, growth: 1.4, per: 0.14, kind: "mulLinear", stat: "shellGain", max: 40 },
  { after: "cracking_stone", id: "pup_patrol", name: "Pup Patrol", description: "The whole raft works harder.", cost: 1.2e6, growth: 1.42, per: 0.11, kind: "mulLinear", stat: "creaturePower", max: 40, unlock: { lifetimeHearts: 1e6 } },
  { after: "otter_chatter", id: "sleek_coat", name: "Sleek Coat", description: "Everything a little better.", cost: 5e6, growth: 1.5, per: 0.05, kind: "mulLinear", stat: "all", max: 30, unlock: { lifetimeHearts: 4e6 } },
  { after: "cracking_stone", id: "pearl_diver", name: "Pearl Diver", description: "Pearls turn up far more often.", cost: 2e7, growth: 1.5, per: 0.13, kind: "mulLinear", stat: "pearlGain", max: 40, unlock: { lifetimeHearts: 1.5e7 } },
  { after: "pup_patrol", id: "her_favourite_rock", name: "Her Favourite Rock", description: "Every rock an otter carries counts for more.", cost: 8e7, growth: 1.52, per: 0.15, kind: "mulLinear", stat: "creaturePower", max: 30, unlock: { lifetimeHearts: 6e7 } },
  { after: "somersault", id: "moonlit_water", name: "Moonlit Water", description: "Mega criticals get much stronger.", cost: 4e8, growth: 1.55, per: 0.3, kind: "mulLinear", stat: "megaCrit", max: 40, unlock: { lifetimeHearts: 3e8 } },
  { after: "moonlit_water", id: "holding_on", name: "Holding On", description: "Combos survive a slip.", cost: 2e9, growth: 1.8, per: 1, stat: "comboShield", max: 8, unlock: { tideChanges: 1 } },
  { after: "deep_breath", id: "sea_otter_strength", name: "Sea Otter Strength", description: "Click power, permanently multiplied.", cost: 1e10, growth: 1.6, per: 0.35, kind: "mulLinear", stat: "click", max: 30, unlock: { tideChanges: 1 } },
  { after: "her_favourite_rock", id: "raft", name: "Raft", description: "Otters group together and lift everything.", cost: 8e11, growth: 1.7, per: 0.25, kind: "mulLinear", stat: "crackValue", max: 30, unlock: { tideChanges: 2 } },
  { after: "sea_otter_strength", id: "endless_play", name: "Endless Play", description: "Click power, compounding.", cost: 5e14, growth: 2.4, per: 0.07, kind: "mulCompound", stat: "click", max: 50, unlock: { newWaters: 1 } },
  { after: "sleek_coat", id: "her_whole_heart", name: "Her Whole Heart", description: "Everything, compounding.", cost: 1e17, growth: 3, per: 0.05, kind: "mulCompound", stat: "all", max: 40, unlock: { newWaters: 2 } },
]);

/* ------------------------------------------------------------------ */
/* Joseph: crabs, the floor, patience                                  */
/* ------------------------------------------------------------------ */

const JOSEPH = tree("joseph", { kind: "add", stat: "cpsFlat" }, [
  { id: "sideways_walk", name: "Sideways Walk", description: "The jar makes hearts on its own.", cost: 60, growth: 1.15, per: 0.6 },
  { after: "sideways_walk", id: "pincer_strength", name: "Pincer Strength", description: "Every collection is worth more.", cost: 350, growth: 1.28, per: 0.09, kind: "mulLinear", stat: "collectValue", max: 60 },
  { after: "pincer_strength", id: "tidepool_sweep", name: "Tidepool Sweep", description: "Crabs cover the floor faster.", cost: 700, growth: 1.3, per: 0.05, kind: "mulLinear", stat: "collectSpeed", max: 40 },
  { after: "sideways_walk", id: "shell_collecting", name: "Shell Collecting", description: "More shells off the floor.", cost: 2_000, growth: 1.32, per: 0.13, kind: "mulLinear", stat: "shellGain", max: 40 },
  { after: "sideways_walk", id: "hard_shell", name: "Hard Shell", description: "Combos survive a slip.", cost: 9_000, growth: 1.9, per: 1, stat: "comboShield", max: 8 },
  { after: "sideways_walk", id: "steady_hands", name: "Steady Hands", description: "The jar produces more without you.", cost: 20_000, growth: 1.35, per: 0.11, kind: "mulLinear", stat: "cps", max: 60 },
  { after: "shell_collecting", id: "sand_sifting", name: "Sand Sifting", description: "More sea glass out of the floor.", cost: 55_000, growth: 1.36, per: 0.14, kind: "mulLinear", stat: "glassGain", max: 40 },
  { after: "hard_shell", id: "his_deep_pocket", name: "His Deep Pocket", description: "The jar holds far more before it spills.", cost: 120_000, growth: 1.3, per: 40_000, stat: "capacity", max: 60, unlock: { lifetimeHearts: 80_000 } },
  { after: "his_deep_pocket", id: "burrow_deeper", name: "Burrow Deeper", description: "Collect from more hours away.", cost: 300_000, growth: 1.45, per: 1, stat: "offlineHours", max: 40, unlock: { lifetimeHearts: 250_000 } },
  { after: "burrow_deeper", id: "patience", name: "Patience", description: "Time away is worth more per hour.", cost: 700_000, growth: 1.42, per: 0.1, kind: "mulLinear", stat: "offline", max: 40 },
  { after: "tidepool_sweep", id: "claw_sharpening", name: "Claw Sharpening", description: "Criticals hit harder.", cost: 2e6, growth: 1.4, per: 0.15, kind: "mulLinear", stat: "crit", max: 40, unlock: { lifetimeHearts: 1.5e6 } },
  { after: "sand_sifting", id: "night_scuttle", name: "Night Scuttle", description: "Creatures keep working in the dark.", cost: 9e6, growth: 1.45, per: 0.12, kind: "mulLinear", stat: "creaturePower", max: 40, unlock: { lifetimeHearts: 7e6 } },
  { after: "steady_hands", id: "hoarding", name: "Hoarding", description: "Capacity, multiplied.", cost: 4e7, growth: 1.5, per: 0.2, kind: "mulLinear", stat: "cps", max: 30, unlock: { lifetimeHearts: 3e7 } },
  { after: "claw_sharpening", id: "low_tide_reach", name: "Low Tide Reach", description: "Crabs reach the whole floor at once.", cost: 1.5e8, growth: 1.5, per: 0.12, kind: "mulLinear", stat: "collectSpeed", max: 30, unlock: { lifetimeHearts: 1e8 } },
  { after: "night_scuttle", id: "his_shell", name: "The One That Fits", description: "Every shell a crab wears counts for more.", cost: 6e8, growth: 1.52, per: 0.15, kind: "mulLinear", stat: "creaturePower", max: 30, unlock: { lifetimeHearts: 5e8 } },
  { after: "his_shell", id: "molt_faster", name: "Molt Faster", description: "Creatures gain experience much faster.", cost: 3e9, growth: 1.55, per: 0.25, kind: "mulLinear", stat: "creatureXp", max: 30, unlock: { tideChanges: 1 } },
  { after: "low_tide_reach", id: "ghost_step", name: "Ghost Step", description: "Collections come round far quicker.", cost: 2e10, growth: 1.6, per: 0.18, kind: "mulLinear", stat: "collectSpeed", max: 25, unlock: { tideChanges: 1 } },
  { after: "hoarding", id: "barnacle_farm", name: "Barnacle Farm", description: "Passive output, permanently multiplied.", cost: 4e11, growth: 1.65, per: 0.3, kind: "mulLinear", stat: "cps", max: 30, unlock: { tideChanges: 2 } },
  { after: "patience", id: "deep_burrow", name: "Deep Burrow", description: "A great deal more time away counts.", cost: 6e12, growth: 1.8, per: 3, stat: "offlineHours", max: 20, unlock: { tideChanges: 3 } },
  { after: "barnacle_farm", id: "endless_patience", name: "Endless Patience", description: "Passive hearts, compounding.", cost: 5e14, growth: 2.4, per: 0.07, kind: "mulCompound", stat: "cps", max: 50, unlock: { newWaters: 1 } },
  { after: "endless_patience", id: "his_whole_heart", name: "His Whole Heart", description: "Everything, compounding.", cost: 1e17, growth: 3, per: 0.05, kind: "mulCompound", stat: "all", max: 40, unlock: { newWaters: 2 } },
]);

/* ------------------------------------------------------------------ */
/* Us: shared, bought with Tide, both of you benefit                   */
/* ------------------------------------------------------------------ */

const US = tree("us", { kind: "mulLinear", stat: "all", currency: "tide" }, [
  { id: "holding_hands", name: "Holding Hands", description: "Everything, for both of you.", cost: 5, growth: 1.35, per: 0.06, max: 40 },
  { after: "holding_hands", id: "same_tide", name: "Same Tide", description: "Tide rises faster whoever is playing.", cost: 8, growth: 1.35, per: 0.1, stat: "tideGain", max: 30 },
  { after: "holding_hands", id: "two_currents", name: "Two Currents", description: "Otters and crabs both work harder.", cost: 12, growth: 1.4, per: 0.09, stat: "creaturePower", max: 30 },
  { after: "holding_hands", id: "shared_water", name: "Shared Water", description: "The jar holds more.", cost: 18, growth: 1.4, per: 0.15, stat: "cps", max: 25 },
  { after: "two_currents", id: "in_sync", name: "In Sync", description: "Combos climb faster and last longer.", cost: 25, growth: 1.42, per: 0.08, stat: "comboGain", max: 25 },
  { after: "holding_hands", id: "long_distance", name: "Long Distance", description: "Time apart counts for more.", cost: 35, growth: 1.45, per: 0.12, stat: "offline", max: 30 },
  { after: "long_distance", id: "home_again", name: "Home Again", description: "Coming back is worth more.", cost: 50, growth: 1.45, per: 0.15, stat: "offline", max: 25 },
  { after: "same_tide", id: "warm_evening", name: "Warm Evening", description: "Tide takes much longer to go out.", cost: 70, growth: 1.5, per: 0.12, stat: "tideGain", max: 25 },
  { after: "home_again", id: "left_for_you", name: "Left For You", description: "What you leave behind is worth more.", cost: 100, growth: 1.5, per: 0.2, stat: "all", max: 20, unlock: { tideChanges: 1 } },
  { after: "shared_water", id: "one_jar", name: "One Jar", description: "Everything, again.", cost: 160, growth: 1.55, per: 0.1, stat: "all", max: 30, unlock: { tideChanges: 1 } },
  { after: "in_sync", id: "anniversary_swell", name: "Anniversary Swell", description: "The day itself pays far more.", cost: 240, growth: 1.6, per: 0.25, stat: "missionReward", max: 20, unlock: { tideChanges: 2 } },
  { after: "warm_evening", id: "moon_pull", name: "Moon Pull", description: "Every rebirth pays more moons.", cost: 400, growth: 1.7, per: 0.12, stat: "moonGain", max: 25, unlock: { tideChanges: 3 } },
  { after: "one_jar", id: "ours", name: "Ours", description: "Everything, compounding, for both of you.", cost: 1_200, growth: 2.2, per: 0.05, kind: "mulCompound", stat: "all", max: 40, unlock: { newWaters: 1 } },
]);

export const UPGRADES: UpgradeDef[] = [...CAMI, ...JOSEPH, ...US];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);

export const TREES: { id: Tree; name: string; blurb: string }[] = [
  { id: "cami", name: "Cami", blurb: "Otters, the surface, and hitting things until they open." },
  { id: "joseph", name: "Joseph", blurb: "Crabs, the floor, and picking up what falls." },
  { id: "us", name: "Us", blurb: "Bought with Tide. Both of you get it." },
];

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

export function nextEffectLabel(def: UpgradeDef): string {
  if (def.kind === "add") {
    if (def.stat === "comboDurationMs") return `+${(def.per / 1000).toFixed(2)}s combo`;
    if (["critChance", "megaCritChance", "luck", "driftChance", "freeUpgradeChance"].includes(def.stat)) {
      return `+${(def.per * 100).toFixed(2)}%`;
    }
    return `+${def.per.toLocaleString()} ${STAT_LABEL[def.stat] ?? def.stat}`;
  }
  const pct = Math.abs(def.per * 100);
  const sign = def.per < 0 ? "-" : "+";
  return `${sign}${pct.toFixed(pct < 1 ? 2 : 0)}% ${STAT_LABEL[def.stat] ?? def.stat}${def.kind === "mulCompound" ? ", compounding" : ""}`;
}

export const STAT_LABEL: Partial<Record<AddStat | MulStat, string>> = {
  clickFlat: "per tap",
  cpsFlat: "per second",
  comboCap: "max combo",
  comboStart: "starting combo",
  comboShield: "combo saves",
  capacity: "capacity",
  creatureSlots: "creature slots",
  abilitySlots: "ability slots",
  offlineHours: "offline hours",
  all: "to everything",
  click: "click power",
  cps: "passive hearts",
  crit: "critical power",
  megaCrit: "mega critical power",
  comboGain: "combo growth",
  comboPower: "combo payout",
  crackValue: "crack payout",
  crackSpeed: "crack speed",
  collectValue: "collect payout",
  collectSpeed: "collect speed",
  pairBonus: "holding hands",
  creaturePower: "creature power",
  creatureXp: "creature experience",
  shellGain: "shells",
  glassGain: "sea glass",
  pearlGain: "pearls",
  tideGain: "tide",
  moonGain: "moons",
  starGain: "stars",
  offline: "offline earnings",
  cost: "cost",
  skillDuration: "ability duration",
  skillCooldown: "ability cooldown",
  missionReward: "mission rewards",
  driftReward: "drifter rewards",
};
