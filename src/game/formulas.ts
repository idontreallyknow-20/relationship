import type { AddStat, CreatureInstance, Derived, GameState, Mods, MulStat } from "./types";
import {
  OFF_TREE_COST, TREE_OWNER, UPGRADES, UPGRADE_BY_ID, upgradeMods,
  type UnlockRule, type UpgradeDef,
} from "./config/upgrades";
import {
  DROP_UPGRADES, MOON_UPGRADES, STAR_UPGRADES, RESET_UPGRADE_BY_ID, resetUpgradeCost, resetUpgradeMods,
} from "./config/resets";
import { CREATURE_BY_ID, TRAIT_BY_ID, actionInterval, creatureScale } from "./config/creatures";
import { DEEPEN_MULTIPLIER, DEPTHS, maxDepthCount, tideSpeed } from "./config/depths";
import { MEMORY_BY_ID } from "./config/memories";
import { VESSEL_BY_ID } from "./config/vessels";
import { CHALLENGE_BY_ID } from "./config/objectives";
import { affordableLevels, bulkCost, safe, scale } from "./numbers";

// Written as exhaustive records rather than arrays so that adding a stat to
// the union without listing it here is a compile error. As plain arrays a
// forgotten entry left the stat permanently undefined, which reads as a
// mysterious NaN several layers away.
const ADD_SET: Record<AddStat, true> = {
  clickFlat: true, cpsFlat: true, critChance: true, megaCritChance: true,
  comboCap: true, comboDurationMs: true, comboStart: true, comboShield: true,
  critChainChance: true, luck: true, offlineHours: true, capacity: true,
  creatureSlots: true, abilitySlots: true, startingUpgrades: true,
  driftChance: true, freeUpgradeChance: true, autoTapsPerSecond: true,
  autoChargeRatio: true, extraDepths: true, autobuyerSpeed: true,
};

const MUL_SET: Record<MulStat, true> = {
  all: true, click: true, cps: true, crit: true, megaCrit: true, comboGain: true,
  comboPower: true, chargePower: true, crackValue: true, crackSpeed: true,
  collectValue: true, collectSpeed: true, pairBonus: true, creaturePower: true,
  creatureXp: true, shellGain: true, glassGain: true, pearlGain: true,
  tideGain: true, moonGain: true, starGain: true, offline: true, cost: true,
  skillDuration: true, skillCooldown: true, missionReward: true,
  driftReward: true, depthPower: true, tideSpeed: true, deepenGain: true,
  dropGain: true,
};

const ADD_KEYS = Object.keys(ADD_SET) as AddStat[];
const MUL_KEYS = Object.keys(MUL_SET) as MulStat[];

type Bags = { add: Record<AddStat, number>; mul: Record<MulStat, number> };

function emptyBags(): Bags {
  return {
    add: Object.fromEntries(ADD_KEYS.map((k) => [k, 0])) as Record<AddStat, number>,
    mul: Object.fromEntries(MUL_KEYS.map((k) => [k, 1])) as Record<MulStat, number>,
  };
}

function apply(bags: Bags, mods: Mods | undefined) {
  if (!mods) return;
  for (const [k, v] of Object.entries(mods.add ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) bags.add[k as AddStat] += v;
  }
  for (const [k, v] of Object.entries(mods.mul ?? {})) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) bags.mul[k as MulStat] *= v;
  }
}

/* ------------------------------------------------------------------ */
/* Flags and unlocks                                                   */
/* ------------------------------------------------------------------ */

export function hasFlag(state: GameState, flag: string): boolean {
  for (const def of MOON_UPGRADES) {
    if (def.flag === flag && (state.moonUpgrades[def.id] ?? 0) > 0) return true;
  }
  for (const def of STAR_UPGRADES) {
    if (def.flag === flag && (state.starUpgrades[def.id] ?? 0) > 0) return true;
  }
  for (const def of DROP_UPGRADES) {
    if (def.flag === flag && (state.dropUpgrades[def.id] ?? 0) > 0) return true;
  }
  return false;
}

export function meetsUnlock(state: GameState, rule: UnlockRule | undefined): boolean {
  if (!rule) return true;
  if (rule.lifetimeHearts !== undefined && state.lifetime.hearts < rule.lifetimeHearts) return false;
  if (rule.tideChanges !== undefined && state.tideChanges < rule.tideChanges) return false;
  if (rule.newWaters !== undefined && state.newWaters < rule.newWaters) return false;
  if (rule.vessel !== undefined && !state.vesselsUnlocked.includes(rule.vessel)) return false;
  if (rule.upgrade) {
    const [id, level] = rule.upgrade;
    if ((state.upgrades[id] ?? 0) < level) return false;
  }
  return true;
}

export function visibleUpgrades(state: GameState): UpgradeDef[] {
  return UPGRADES.filter((u) => meetsUnlock(state, u.unlock) || (state.upgrades[u.id] ?? 0) > 0);
}

/** True when this tree belongs to whoever owns the save. */
export function isOwnTree(state: GameState, def: UpgradeDef): boolean {
  return TREE_OWNER[def.tree] === state.owner;
}

/* ------------------------------------------------------------------ */
/* Creatures                                                          */
/* ------------------------------------------------------------------ */

export function creaturesInJar(state: GameState): CreatureInstance[] {
  return state.slots
    .map((id) => (id ? state.creatures[id] : null))
    .filter((c): c is CreatureInstance => Boolean(c));
}

/**
 * Otters hold hands. Two otters in adjacent slots each gain a bonus, which is
 * why slot order matters and why the arrangement is a decision.
 */
export function heldHands(state: GameState): Set<string> {
  const paired = new Set<string>();
  for (let i = 0; i < state.slots.length - 1; i++) {
    const a = state.slots[i] ? state.creatures[state.slots[i]!] : null;
    const b = state.slots[i + 1] ? state.creatures[state.slots[i + 1]!] : null;
    if (!a || !b) continue;
    if (CREATURE_BY_ID[a.defId]?.line !== "otter") continue;
    if (CREATURE_BY_ID[b.defId]?.line !== "otter") continue;
    paired.add(a.id);
    paired.add(b.id);
  }
  return paired;
}

export function itemMods(state: GameState, itemId: string | null): Mods {
  if (!itemId) return {};
  const item = state.items[itemId];
  if (!item) return {};
  const add: Partial<Record<AddStat, number>> = {};
  const mul: Partial<Record<MulStat, number>> = {};
  for (const affix of item.affixes) {
    if (affix.kind === "add") {
      add[affix.stat as AddStat] = (add[affix.stat as AddStat] ?? 0) + affix.value;
    } else {
      const key = affix.stat as MulStat;
      mul[key] = (mul[key] ?? 1) * Math.max(0.05, 1 + affix.value);
    }
  }
  return { add, mul };
}

/** How hungry a creature is, as a multiplier. Never falls to nothing. */
export function fedFactor(creature: CreatureInstance): number {
  return 0.55 + Math.min(1, Math.max(0, creature.fed) / 100) * 0.45;
}

/* ------------------------------------------------------------------ */
/* The one function everything else reads                              */
/* ------------------------------------------------------------------ */

export function derive(state: GameState, now: number = Date.now()): Derived {
  const bags = emptyBags();
  const vessel = VESSEL_BY_ID[state.vessel] ?? VESSEL_BY_ID["jam_jar"];

  bags.add.clickFlat = 1;
  bags.add.comboCap = 30;
  bags.add.comboDurationMs = 2_400;
  bags.add.critChance = 0.02;
  bags.add.offlineHours = 3;
  bags.add.creatureSlots = vessel.slots;
  bags.add.abilitySlots = 3;
  bags.add.capacity = vessel.capacity === Infinity ? 1e300 : vessel.capacity;
  // The jar taps for you from the very first run. Upgrades make it quicker
  // and start turning those taps into charged holds.
  bags.add.autoTapsPerSecond = 1;
  bags.add.autoChargeRatio = 0;
  bags.add.autobuyerSpeed = 1;
  bags.add.extraDepths = 0;

  for (const [id, level] of Object.entries(state.upgrades)) {
    const def = UPGRADE_BY_ID[id];
    if (!def || level <= 0) continue;
    apply(bags, upgradeMods(def, level, isOwnTree(state, def)));
    if (def.milestones && def.milestoneMods) {
      const hit = def.milestones.filter((m) => level >= m).length;
      for (let i = 0; i < hit; i++) apply(bags, def.milestoneMods);
    }
  }

  for (const [id, level] of Object.entries(state.moonUpgrades)) {
    const def = RESET_UPGRADE_BY_ID[id];
    if (def) apply(bags, resetUpgradeMods(def, level));
  }
  for (const [id, level] of Object.entries(state.starUpgrades)) {
    const def = RESET_UPGRADE_BY_ID[id];
    if (def) apply(bags, resetUpgradeMods(def, level));
  }
  for (const [id, level] of Object.entries(state.dropUpgrades)) {
    const def = RESET_UPGRADE_BY_ID[id];
    if (def) apply(bags, resetUpgradeMods(def, level));
  }

  // Memories are permanent and personal.
  for (const id of state.collections["memories"] ?? []) {
    const memory = MEMORY_BY_ID[id];
    if (memory) apply(bags, memory.mods);
  }

  apply(bags, vessel.mods);

  // Creatures in the jar, each scaled by level, stars, trait, item and how
  // recently it was fed.
  const paired = heldHands(state);
  for (const creature of creaturesInJar(state)) {
    const def = CREATURE_BY_ID[creature.defId];
    if (!def) continue;
    apply(bags, def.mods);
    apply(bags, TRAIT_BY_ID[creature.trait]?.mods);
    apply(bags, itemMods(state, creature.itemId));
    if (paired.has(creature.id)) {
      apply(bags, { mul: { crackValue: 1.25, all: 1.03 } });
    }
  }

  // Rafts: five or more otters together lift everything.
  const otters = creaturesInJar(state).filter((c) => CREATURE_BY_ID[c.defId]?.line === "otter");
  if (otters.length >= 5) apply(bags, { mul: { all: 1 + otters.length * 0.03 } });

  for (const buff of state.buffs) {
    if (buff.expiresAt > now) apply(bags, buff.mods);
  }

  // Tide is shared and rises when either of you plays. It is the single
  // largest reason to be in the jar on the same evening.
  if (state.tideLevel > 0) {
    apply(bags, { mul: { all: 1 + Math.min(1, state.tideLevel / 100) * 0.6 } });
  }

  // Every depth you own at least one of contributes its standing bonus.
  for (let i = 0; i < state.depths.length && i < DEPTHS.length; i++) {
    if (state.depths[i].owned > 0) apply(bags, DEPTHS[i].mods);
  }

  // Deepening pays a multiplier that survives everything below a tide change.
  if (state.deepens > 0) {
    apply(bags, { mul: { depthPower: Math.pow(DEEPEN_MULTIPLIER, state.deepens) } });
  }

  if (state.activeChallenge) {
    const def = CHALLENGE_BY_ID[state.activeChallenge.defId];
    if (def) apply(bags, def.mods);
  }

  // Clamps.
  bags.mul.cost = Math.max(0.1, bags.mul.cost);
  bags.mul.skillCooldown = Math.max(0.15, bags.mul.skillCooldown);
  bags.mul.crackSpeed = Math.max(0.1, bags.mul.crackSpeed);
  bags.mul.collectSpeed = Math.max(0.1, bags.mul.collectSpeed);
  bags.add.critChance = Math.min(1, Math.max(0, bags.add.critChance));
  bags.add.megaCritChance = Math.min(0.9, Math.max(0, bags.add.megaCritChance));
  bags.add.comboDurationMs = Math.max(500, bags.add.comboDurationMs);
  bags.add.comboCap = Math.max(10, bags.add.comboCap);
  bags.add.freeUpgradeChance = Math.min(0.5, Math.max(0, bags.add.freeUpgradeChance));

  const global = bags.mul.all;
  const comboMultiplier = 1 + Math.min(state.combo, bags.add.comboCap) * 0.03 * bags.mul.comboPower;

  // Passive output is the creatures plus whatever the trees add. Creatures
  // are the larger share once the jar has anything in it.
  const creatureOutput = creaturesInJar(state).reduce((sum, creature) => {
    const def = CREATURE_BY_ID[creature.defId];
    if (!def) return sum;
    const per = def.power * creatureScale(creature.level, creature.stars) * fedFactor(creature);
    const interval = actionInterval(
      def,
      creature.level,
      def.line === "otter" ? bags.mul.crackSpeed : bags.mul.collectSpeed,
    );
    const value = def.line === "otter" ? bags.mul.crackValue : bags.mul.collectValue;
    return sum + (per * value * bags.mul.creaturePower) / interval;
  }, 0);

  // The chain. Depth one turns into hearts; every depth below turns into the
  // one above it. `depthPower` and the tide speed apply at every rung, which
  // is why a multiplier bought once is felt eight times over.
  const tideMul = tideSpeed(state.tideBought) * bags.mul.tideSpeed;
  const depthPower = bags.mul.depthPower;
  const surface = state.depths[0]?.owned ?? 0;
  const chainOutput = surface * (DEPTHS[0]?.power ?? 1) * depthPower * tideMul;

  return {
    heartsPerClick: safe(bags.add.clickFlat * bags.mul.click * global * comboMultiplier),
    heartsPerSecond: safe((bags.add.cpsFlat + creatureOutput + chainOutput) * bags.mul.cps * global),
    critChance: bags.add.critChance,
    critMultiplier: safe(2 * bags.mul.crit),
    megaCritChance: bags.add.megaCritChance,
    megaCritMultiplier: safe(8 * bags.mul.megaCrit),
    comboCap: Math.floor(bags.add.comboCap),
    comboDurationMs: bags.add.comboDurationMs,
    comboMultiplier,
    comboShield: bags.add.comboShield,
    critChainChance: bags.add.critChainChance,
    chargePower: bags.mul.chargePower,
    luck: bags.add.luck,
    offlineHours: Math.min(96, bags.add.offlineHours),
    offlineRate: Math.min(1, 0.35 * bags.mul.offline),
    costMultiplier: bags.mul.cost,
    capacity: safe(bags.add.capacity),
    creatureSlots: Math.max(2, Math.floor(bags.add.creatureSlots)),
    abilitySlots: Math.min(9, Math.floor(bags.add.abilitySlots)),
    skillDuration: bags.mul.skillDuration,
    skillCooldown: bags.mul.skillCooldown,
    crackValue: bags.mul.crackValue,
    crackSpeed: bags.mul.crackSpeed,
    collectValue: bags.mul.collectValue,
    collectSpeed: bags.mul.collectSpeed,
    pairBonus: bags.mul.pairBonus,
    globalMultiplier: global,
    freeUpgradeChance: bags.add.freeUpgradeChance,
    driftChance: bags.add.driftChance,
    depth: vessel.depth,
    floor: vessel.floor,

    depthCount: maxDepthCount(Math.floor(bags.add.extraDepths)),
    tideSpeedMultiplier: safe(tideMul),
    depthPower: safe(depthPower),
    autoTapsPerSecond: safe(bags.add.autoTapsPerSecond),
    autoChargeRatio: Math.min(1, Math.max(0, bags.add.autoChargeRatio)),
    autobuyerIntervalMs: Math.max(50, 5_000 / Math.max(1, bags.add.autobuyerSpeed)),

    mods: bags,
  };
}

/* ------------------------------------------------------------------ */
/* Costs                                                               */
/* ------------------------------------------------------------------ */

function treeCostFactor(state: GameState, def: UpgradeDef): number {
  return isOwnTree(state, def) ? 1 : TREE_OWNER[def.tree] === null ? 1 : OFF_TREE_COST;
}

export function upgradeCost(state: GameState, def: UpgradeDef, count = 1, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = (def.currency === "hearts" ? d.costMultiplier : 1) * treeCostFactor(state, def);
  return safe(bulkCost(def.baseCost, def.growth, owned, count) * discount);
}

export function upgradeNextCost(state: GameState, def: UpgradeDef, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = (def.currency === "hearts" ? d.costMultiplier : 1) * treeCostFactor(state, def);
  return safe(scale(def.baseCost, def.growth, owned) * discount);
}

export function maxAffordable(state: GameState, def: UpgradeDef, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = (def.currency === "hearts" ? d.costMultiplier : 1) * treeCostFactor(state, def);
  return affordableLevels(state.wallet[def.currency] / discount, def.baseCost, def.growth, owned, def.max);
}

export function resolveBuyCount(state: GameState, def: UpgradeDef, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const room = def.max === Infinity ? Infinity : Math.max(0, def.max - owned);
  const setting = state.settings.buyAmount;
  if (setting === "max") return maxAffordable(state, def, derived);
  return Math.max(0, Math.min(room, setting));
}

export { resetUpgradeCost };
