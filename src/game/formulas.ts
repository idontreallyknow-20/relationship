import type { AddStat, Derived, GameState, Mods, MulStat } from "./types";
import { UPGRADE_BY_ID, UPGRADES, upgradeMods, type UpgradeDef, type UnlockRule } from "./config/upgrades";
import { RESET_UPGRADE_BY_ID, REBIRTH_UPGRADES, ASCENSION_UPGRADES, resetUpgradeMods, resetUpgradeCost } from "./config/resets";
import { PET_BY_ID, petMods } from "./config/pets";
import { AFFIXES, CHARM_SETS } from "./config/charms";
import { WORLD_BY_ID } from "./config/worlds";
import { CHALLENGE_BY_ID } from "./config/objectives";
import { affordableLevels, bulkCost, safe, scale } from "./numbers";

const ADD_KEYS: AddStat[] = [
  "clickFlat", "cpsFlat", "critChance", "megaCritChance", "comboCap", "comboDurationMs",
  "comboStart", "goldenChance", "treasureChance", "luck", "offlineHours", "petSlots",
  "skillSlots", "charmSlots", "jarCapacity", "freeUpgradeChance", "doubleRewardChance",
  "energyMax", "focusMax", "heatMax", "critChainChance", "comboShield", "startingUpgrades",
  "dailyDeals",
];

const MUL_KEYS: MulStat[] = [
  "all", "click", "cps", "crit", "megaCrit", "comboGain", "comboPower", "golden", "treasure",
  "offline", "cost", "petPower", "petXp", "skillDuration", "skillCooldown", "bossDamage",
  "bossReward", "missionReward", "eventReward", "tokenGain", "crystalGain", "dustGain",
  "bondGain", "shardGain", "fragmentGain", "treatGain", "chargeSpeed", "energyRegen",
  "animationSpeed",
];

function emptyBags() {
  const add = Object.fromEntries(ADD_KEYS.map((k) => [k, 0])) as Record<AddStat, number>;
  const mul = Object.fromEntries(MUL_KEYS.map((k) => [k, 1])) as Record<MulStat, number>;
  return { add, mul };
}

function apply(bags: { add: Record<AddStat, number>; mul: Record<MulStat, number> }, mods: Mods | undefined) {
  if (!mods) return;
  if (mods.add) {
    for (const [k, v] of Object.entries(mods.add)) {
      if (typeof v === "number" && Number.isFinite(v)) bags.add[k as AddStat] += v;
    }
  }
  if (mods.mul) {
    for (const [k, v] of Object.entries(mods.mul)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) bags.mul[k as MulStat] *= v;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Feature flags from the reset trees                                  */
/* ------------------------------------------------------------------ */

export function hasFlag(state: GameState, flag: string): boolean {
  for (const def of REBIRTH_UPGRADES) {
    if (def.flag === flag && (state.rebirthUpgrades[def.id] ?? 0) > 0) return true;
  }
  for (const def of ASCENSION_UPGRADES) {
    if (def.flag === flag && (state.ascensionUpgrades[def.id] ?? 0) > 0) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Unlocks                                                             */
/* ------------------------------------------------------------------ */

export function meetsUnlock(state: GameState, rule: UnlockRule | undefined): boolean {
  if (!rule) return true;
  if (rule.lifetimeHearts !== undefined && state.lifetime.hearts < rule.lifetimeHearts) return false;
  if (rule.rebirths !== undefined && state.rebirths < rule.rebirths) return false;
  if (rule.ascensions !== undefined && state.ascensions < rule.ascensions) return false;
  if (rule.world !== undefined && !state.worldsUnlocked.includes(rule.world)) return false;
  if (rule.achievement !== undefined && !state.achievements[rule.achievement]) return false;
  if (rule.upgrade) {
    const [id, level] = rule.upgrade;
    if ((state.upgrades[id] ?? 0) < level) return false;
  }
  return true;
}

export function visibleUpgrades(state: GameState): UpgradeDef[] {
  return UPGRADES.filter((u) => {
    if (u.tree === "mastery" && !hasFlag(state, "mastery")) return false;
    if (meetsUnlock(state, u.unlock)) return true;
    // Show the next locked entry so progression is legible.
    return (state.upgrades[u.id] ?? 0) > 0;
  });
}

/* ------------------------------------------------------------------ */
/* Equipped things                                                     */
/* ------------------------------------------------------------------ */

export function activePetIds(state: GameState): string[] {
  const loadout = state.petLoadouts[state.activeLoadout] ?? state.petLoadouts[0];
  if (!loadout) return [];
  return loadout.slots.filter((id): id is string => Boolean(id) && Boolean(state.pets[id!]));
}

export function equippedCharmIds(state: GameState): string[] {
  return Object.values(state.equipped).filter((id): id is string => Boolean(id) && Boolean(state.charms[id!]));
}

export function charmMods(state: GameState, charmId: string): Mods {
  const charm = state.charms[charmId];
  if (!charm) return {};
  const add: Partial<Record<AddStat, number>> = {};
  const mul: Partial<Record<MulStat, number>> = {};
  for (const affix of charm.affixes) {
    if (affix.kind === "add") {
      const key = affix.stat as AddStat;
      add[key] = (add[key] ?? 0) + affix.value;
    } else {
      const key = affix.stat as MulStat;
      mul[key] = (mul[key] ?? 1) * Math.max(0.05, 1 + affix.value);
    }
  }
  return { add, mul };
}

function charmSetMods(state: GameState): { mods: Mods[]; active: { setId: string; tier: number }[] } {
  const equipped = equippedCharmIds(state).map((id) => state.charms[id]);
  const mods: Mods[] = [];
  const active: { setId: string; tier: number }[] = [];
  for (const set of CHARM_SETS) {
    const count = equipped.filter((charm) =>
      charm.affixes.some((affix) => {
        const def = AFFIXES.find((a) => a.stat === affix.stat && a.kind === affix.kind);
        return def ? set.affixes.includes(def.id) : false;
      }),
    ).length;
    let bestTier = -1;
    set.tiers.forEach((tier, index) => {
      if (count >= tier.count) bestTier = index;
    });
    if (bestTier >= 0) {
      mods.push(set.tiers[bestTier].mods);
      active.push({ setId: set.id, tier: bestTier });
    }
  }
  return { mods, active };
}

export function activeCharmSets(state: GameState) {
  return charmSetMods(state).active;
}

/* ------------------------------------------------------------------ */
/* The one function everything else reads                              */
/* ------------------------------------------------------------------ */

export function derive(state: GameState, now: number = Date.now()): Derived {
  const bags = emptyBags();

  // Base values before anything is bought.
  bags.add.clickFlat = 1;
  bags.add.comboCap = 30;
  bags.add.comboDurationMs = 2_400;
  bags.add.critChance = 0.02;
  bags.add.megaCritChance = 0;
  bags.add.goldenChance = 0.004;
  bags.add.treasureChance = 0.0012;
  bags.add.offlineHours = 3;
  bags.add.petSlots = 3;
  bags.add.skillSlots = 3;
  bags.add.charmSlots = 0;
  bags.add.jarCapacity = 25_000;
  bags.add.energyMax = 20;
  bags.add.focusMax = 100;
  bags.add.heatMax = 100;

  for (const [id, level] of Object.entries(state.upgrades)) {
    const def = UPGRADE_BY_ID[id];
    if (!def || level <= 0) continue;
    apply(bags, upgradeMods(def, level));
    // Milestone levels give a small extra bonus each time one is passed.
    if (def.milestones && def.milestoneMods) {
      const hit = def.milestones.filter((m) => level >= m).length;
      for (let i = 0; i < hit; i++) apply(bags, def.milestoneMods);
    }
  }

  for (const [id, level] of Object.entries(state.rebirthUpgrades)) {
    const def = RESET_UPGRADE_BY_ID[id];
    if (def) apply(bags, resetUpgradeMods(def, level));
  }
  for (const [id, level] of Object.entries(state.ascensionUpgrades)) {
    const def = RESET_UPGRADE_BY_ID[id];
    if (def) apply(bags, resetUpgradeMods(def, level));
  }

  for (const petId of activePetIds(state)) {
    const pet = state.pets[petId];
    const def = PET_BY_ID[pet.defId];
    if (!def) continue;
    const mods = petMods(def, pet.level, pet.stars, pet.trait);
    // An unhappy pet contributes less, but never nothing.
    const happiness = 0.6 + Math.min(1, pet.happiness / 100) * 0.4;
    apply(bags, {
      add: Object.fromEntries(Object.entries(mods.add ?? {}).map(([k, v]) => [k, (v as number) * happiness])),
      mul: Object.fromEntries(Object.entries(mods.mul ?? {}).map(([k, v]) => [k, 1 + ((v as number) - 1) * happiness])),
    });
  }

  for (const charmId of equippedCharmIds(state)) apply(bags, charmMods(state, charmId));
  for (const mods of charmSetMods(state).mods) apply(bags, mods);

  const world = WORLD_BY_ID[state.world];
  if (world) apply(bags, world.mods);

  for (const buff of state.buffs) {
    if (buff.expiresAt > now) apply(bags, buff.mods);
  }

  if (state.activeChallenge) {
    const def = CHALLENGE_BY_ID[state.activeChallenge.defId];
    if (def) apply(bags, def.mods);
  }

  // Pet power is a multiplier on the pet contribution, applied afterwards so
  // it does not double count: it scales click and passive output together.
  const petCount = activePetIds(state).length;
  if (petCount > 0 && bags.mul.petPower !== 1) {
    const petBonus = 1 + (bags.mul.petPower - 1) * (0.3 + petCount * 0.1);
    bags.mul.click *= petBonus;
    bags.mul.cps *= petBonus;
  }

  // Clamp the pieces that must stay sane.
  bags.mul.cost = Math.max(0.05, bags.mul.cost);
  bags.mul.skillCooldown = Math.max(0.15, bags.mul.skillCooldown);
  bags.add.critChance = Math.min(1, Math.max(0, bags.add.critChance));
  bags.add.megaCritChance = Math.min(0.9, Math.max(0, bags.add.megaCritChance));
  bags.add.goldenChance = Math.min(1, Math.max(0, bags.add.goldenChance));
  bags.add.treasureChance = Math.min(0.5, Math.max(0, bags.add.treasureChance));
  bags.add.freeUpgradeChance = Math.min(0.5, Math.max(0, bags.add.freeUpgradeChance));
  bags.add.doubleRewardChance = Math.min(0.9, Math.max(0, bags.add.doubleRewardChance));
  bags.add.critChainChance = Math.min(0.9, Math.max(0, bags.add.critChainChance));
  bags.add.comboDurationMs = Math.max(500, bags.add.comboDurationMs);
  bags.add.comboCap = Math.max(10, bags.add.comboCap);

  const global = bags.mul.all;
  const comboMultiplier = 1 + Math.min(state.combo, bags.add.comboCap) * 0.03 * bags.mul.comboPower;

  const heartsPerClick = safe(bags.add.clickFlat * bags.mul.click * global * comboMultiplier);
  const heartsPerSecond = safe(bags.add.cpsFlat * bags.mul.cps * global);

  return {
    heartsPerClick,
    heartsPerSecond,
    critChance: bags.add.critChance,
    critMultiplier: safe(2 * bags.mul.crit),
    megaCritChance: bags.add.megaCritChance,
    megaCritMultiplier: safe(8 * bags.mul.megaCrit),
    comboCap: Math.floor(bags.add.comboCap),
    comboDurationMs: bags.add.comboDurationMs,
    comboMultiplier,
    goldenChancePerSecond: safe(bags.add.goldenChance * bags.mul.golden * 0.35),
    treasureChance: bags.add.treasureChance,
    luck: bags.add.luck,
    offlineHours: Math.min(72, bags.add.offlineHours),
    offlineRate: Math.min(1, 0.35 * bags.mul.offline),
    costMultiplier: bags.mul.cost,
    petSlots: Math.min(8, Math.floor(bags.add.petSlots)),
    skillSlots: Math.min(9, Math.floor(bags.add.skillSlots)),
    jarCapacity: safe(bags.add.jarCapacity),
    petPower: bags.mul.petPower,
    bossDamage: bags.mul.bossDamage,
    globalMultiplier: global,
    freeUpgradeChance: bags.add.freeUpgradeChance,
    doubleRewardChance: bags.add.doubleRewardChance,
    skillDuration: bags.mul.skillDuration,
    skillCooldown: bags.mul.skillCooldown,
    energyMax: bags.add.energyMax,
    focusMax: bags.add.focusMax,
    heatMax: bags.add.heatMax,
    critChainChance: bags.add.critChainChance,
    comboShield: bags.add.comboShield,
    chargeSpeed: bags.mul.chargeSpeed,
    mods: bags,
  };
}

/* ------------------------------------------------------------------ */
/* Costs                                                               */
/* ------------------------------------------------------------------ */

export function upgradeCost(state: GameState, def: UpgradeDef, count = 1, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = def.currency === "hearts" ? d.costMultiplier : 1;
  return safe(bulkCost(def.baseCost, def.growth, owned, count) * discount);
}

export function upgradeNextCost(state: GameState, def: UpgradeDef, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = def.currency === "hearts" ? d.costMultiplier : 1;
  return safe(scale(def.baseCost, def.growth, owned) * discount);
}

/** How many levels the player can afford, honouring the tree's maximum. */
export function maxAffordable(state: GameState, def: UpgradeDef, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = def.currency === "hearts" ? d.costMultiplier : 1;
  const balance = state.wallet[def.currency] / discount;
  return affordableLevels(balance, def.baseCost, def.growth, owned, def.max);
}

/** Resolve the player's chosen buy amount into a concrete level count. */
export function resolveBuyCount(state: GameState, def: UpgradeDef, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const room = def.max === Infinity ? Infinity : Math.max(0, def.max - owned);
  const setting = state.settings.buyAmount;
  if (setting === "max") return maxAffordable(state, def, derived);
  return Math.max(0, Math.min(room, setting));
}

export { resetUpgradeCost };
