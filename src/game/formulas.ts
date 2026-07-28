import type { AddStat, CreatureInstance, Derived, GameState, Mods, MulStat } from "./types";
import {
TREE_OWNER, UPGRADES, UPGRADE_BY_ID, upgradeMods,
  type UnlockRule, type UpgradeDef,
} from "./config/upgrades";
import {
  SUN_UPGRADES, MOON_UPGRADES, STAR_UPGRADES, RESET_UPGRADE_BY_ID, resetUpgradeCost, resetUpgradeMods,
} from "./config/resets";
import { CREATURE_BY_ID, TRAIT_BY_ID, actionInterval, creatureScale } from "./config/creatures";
import { JAR_BY_ID, FIRST_JAR } from "./config/jars";
import {
  SHELF_UPGRADES, jarCapacity as capacityFor, ribbonGain, shelfIncome, type ShelfUpgradeDef,
} from "./config/shelf";
import { METERS, meterMods, togetherBonus } from "./config/meters";
import { combinedRebirths, jointReached } from "./config/together";
import {
  DILATION_UPGRADE_BY_ID, dilate, dilationPower, dilationUpgradeMods,
} from "./config/dilation";
import { featuresAt, stageFor } from "./config/stages";
import { MEMORY_BY_ID } from "./config/memories";
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
  freeUpgradeChance: true, autoTapsPerSecond: true,
  sealKeep: true, autoSeal: true, autobuyerSpeed: true,
};

const MUL_SET: Record<MulStat, true> = {
  all: true, click: true, cps: true, crit: true, megaCrit: true, comboGain: true,
  comboPower: true, petSpeed: true, petValue: true,
  pairBonus: true, creaturePower: true, creatureXp: true,
  ribbonGain: true, keepsakeGain: true, moonGain: true, starGain: true,
  shelfRate: true, jarCapacity: true,
  offline: true, cost: true,
  skillDuration: true, skillCooldown: true, missionReward: true,
  sunGain: true, hourGain: true,
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
  for (const def of SUN_UPGRADES) {
    if (def.flag === flag && (state.sunUpgrades[def.id] ?? 0) > 0) return true;
  }
  return false;
}

export function meetsUnlock(state: GameState, rule: UnlockRule | undefined): boolean {
  if (!rule) return true;
  if (rule.lifetimeHearts !== undefined && state.lifetime.hearts < rule.lifetimeHearts) return false;
  if (rule.tideChanges !== undefined && state.tideChanges < rule.tideChanges) return false;
  if (rule.newWaters !== undefined && state.newWaters < rule.newWaters) return false;
  if (rule.jar !== undefined && !state.jarsUnlocked.includes(rule.jar)) return false;
  if (rule.upgrade) {
    const [id, level] = rule.upgrade;
    if ((state.upgrades[id] ?? 0) < level) return false;
  }
  return true;
}

/**
 * The upgrades this person can actually buy.
 *
 * Filtered by tree as well as by unlock: the other person's line is theirs,
 * and showing it here only ever made the list twice as long.
 */
export function visibleUpgrades(state: GameState): UpgradeDef[] {
  return UPGRADES.filter(
    (u) => buyableTree(state, u) && (meetsUnlock(state, u.unlock) || (state.upgrades[u.id] ?? 0) > 0),
  );
}

/** True when this tree is yours, or the shared one. */
export function buyableTree(state: GameState, def: UpgradeDef): boolean {
  return TREE_OWNER[def.tree] === null || TREE_OWNER[def.tree] === state.owner;
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


/** A shelf upgrade's effect at a given level. Same three kinds as everywhere. */
export function shelfUpgradeMods(def: ShelfUpgradeDef, level: number): Mods {
  if (level <= 0) return {};
  const stat = def.stat as AddStat | MulStat;
  if (def.kind === "add") return { add: { [stat as AddStat]: def.per * level } };
  if (def.kind === "mulLinear") return { mul: { [stat as MulStat]: 1 + def.per * level } };
  return { mul: { [stat as MulStat]: Math.pow(1 + def.per, level) } };
}

/**
 * What the pets carry over per second, all together.
 *
 * They used to work inside the jar: an otter cracked something open, the
 * pieces sank, and a crab walked along the floor to pick them up. That was
 * three mechanics to explain one number. Now each pet walks over on its own
 * timer and drops a heart in, so what they are worth is simply how often they
 * go times how much they carry.
 */
export function petIncome(state: GameState, bags: Bags): number {
  const paired = heldHands(state);
  let total = 0;
  for (const creature of creaturesInJar(state)) {
    const def = CREATURE_BY_ID[creature.defId];
    if (!def) continue;
    const every = Math.max(0.25, actionInterval(def, creature.level, bags.mul.petSpeed) / 1000);
    const carried = def.power
      * creatureScale(creature.level, creature.stars)
      * fedFactor(creature)
      * bags.mul.petValue
      * bags.mul.creaturePower
      * (paired.has(creature.id) ? bags.mul.pairBonus : 1);
    total += carried / every;
  }
  return safe(total);
}

export function derive(state: GameState, now: number = Date.now()): Derived {
  const bags = emptyBags();
  const jar = JAR_BY_ID[state.jar] ?? JAR_BY_ID[FIRST_JAR];

  bags.add.clickFlat = 1;
  bags.add.comboCap = 30;
  bags.add.comboDurationMs = 2_400;
  bags.add.critChance = 0.02;
  bags.add.offlineHours = 3;
  bags.add.creatureSlots = jar.seats;
  bags.add.abilitySlots = 3;
  bags.add.capacity = jar.capacity === Infinity ? 1e300 : jar.capacity;
  // The jar taps for you from the very first run. Upgrades make it quicker
  bags.add.autoTapsPerSecond = 1;
  bags.add.autobuyerSpeed = 1;
  bags.add.sealKeep = 0;

  for (const [id, level] of Object.entries(state.upgrades)) {
    const def = UPGRADE_BY_ID[id];
    if (!def || level <= 0) continue;
    apply(bags, upgradeMods(def, level));
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
  for (const [id, level] of Object.entries(state.sunUpgrades)) {
    const def = RESET_UPGRADE_BY_ID[id];
    if (def) apply(bags, resetUpgradeMods(def, level));
  }
  for (const [id, level] of Object.entries(state.dilationUpgrades ?? {})) {
    const def = DILATION_UPGRADE_BY_ID[id];
    if (def) apply(bags, dilationUpgradeMods(def, level));
  }

  // Memories are permanent and personal.
  for (const id of state.collections["memories"] ?? []) {
    const memory = MEMORY_BY_ID[id];
    if (memory) apply(bags, memory.mods);
  }

  apply(bags, jar.mods);

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
      apply(bags, { mul: { petValue: 1.25, all: 1.03 } });
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

  // What the two of you have built between you. Additive, never competitive.
  const partnerTotal = state.storyProgress["partnerLifetime"] ?? 0;
  if (partnerTotal > 0) {
    apply(bags, { mul: { all: togetherBonus(state.lifetime.hearts, partnerTotal) } });
  }

  // The pair's rebirths, added together and paid to both of you. Derived from
  // a remembered number rather than a live one, so it survives being offline.
  const joint = combinedRebirths(state.tideChanges, state.storyProgress["partnerRebirths"] ?? 0);
  for (const milestone of jointReached(joint)) apply(bags, milestone.mods);

  // The love meters. Each pays a share of its full multiplier.
  for (const def of METERS) {
    apply(bags, meterMods(def, state.meters[def.id] ?? 0));
  }

  // The shelf tree, bought with ribbons.
  for (const def of SHELF_UPGRADES) {
    const level = state.shelfUpgrades?.[def.id] ?? 0;
    if (level > 0) apply(bags, shelfUpgradeMods(def, level));
  }

  if (state.activeChallenge) {
    const def = CHALLENGE_BY_ID[state.activeChallenge.defId];
    if (def) apply(bags, def.mods);
  }

  // Clamps.
  bags.mul.cost = Math.max(0.1, bags.mul.cost);
  bags.mul.skillCooldown = Math.max(0.15, bags.mul.skillCooldown);
  bags.mul.petSpeed = Math.max(0.1, bags.mul.petSpeed);
  // A jar you can never fill is a loop you can never finish, and the shelf
  // upgrade that shrinks capacity is uncapped.
  bags.mul.jarCapacity = Math.max(0.05, bags.mul.jarCapacity);
  bags.add.sealKeep = Math.min(0.9, Math.max(0, bags.add.sealKeep));
  bags.add.critChance = Math.min(1, Math.max(0, bags.add.critChance));
  bags.add.megaCritChance = Math.min(0.9, Math.max(0, bags.add.megaCritChance));
  bags.add.comboDurationMs = Math.max(500, bags.add.comboDurationMs);
  bags.add.comboCap = Math.max(10, bags.add.comboCap);
  bags.add.freeUpgradeChance = Math.min(0.5, Math.max(0, bags.add.freeUpgradeChance));

  const global = bags.mul.all;
  const comboMultiplier = 1 + Math.min(state.combo, bags.add.comboCap) * 0.03 * bags.mul.comboPower;

  // Passive hearts come from two places, and both of them are things you can
  // point at on the screen.
  //
  // The shelf pays a share of every heart ever sealed into it, which is what
  // makes the run compound: income is proportional to what has been banked,
  // and what gets banked is income times time. The pets carry hearts over one
  // at a time, which is what makes the early game move before there is a shelf
  // worth having.
  //
  // This used to be an eight tier chain where each tier produced the one above
  // it, and it was the single largest reason nobody could say what the game
  // was.
  const stage = stageFor(state);
  const jarCapacity = safe(
    capacityFor(bags.add.capacity, state.shelfHearts ?? 0) * bags.mul.jarCapacity,
  );
  const shelfRate = bags.mul.shelfRate;
  const shelfOutput = shelfIncome(state, shelfRate);
  const petOutput = petIncome(state, bags);

  // Time dilation, applied last of all.
  //
  // It has to be last, because it is an exponent rather than a factor: every
  // multiplier above has to already be in the number before it is raised to a
  // power, or dilating would penalise the base rate and leave the multipliers
  // untouched, which is the opposite of what the layer is for.
  const dilated = state.dilation?.active === true;
  const power = dilationPower(state.dilationUpgrades ?? {});
  const perClick = bags.add.clickFlat * bags.mul.click * global * comboMultiplier;
  const perSecond = (bags.add.cpsFlat + petOutput) * bags.mul.cps * global + shelfOutput * global;

  return {
    heartsPerClick: safe(dilated ? dilate(perClick, power) : perClick),
    heartsPerSecond: safe(dilated ? dilate(perSecond, power) : perSecond),
    dilated,
    dilationPower: power,
    critChance: bags.add.critChance,
    critMultiplier: safe(2 * bags.mul.crit),
    megaCritChance: bags.add.megaCritChance,
    megaCritMultiplier: safe(8 * bags.mul.megaCrit),
    comboCap: Math.floor(bags.add.comboCap),
    comboDurationMs: bags.add.comboDurationMs,
    comboMultiplier,
    comboShield: bags.add.comboShield,
    critChainChance: bags.add.critChainChance,
      luck: bags.add.luck,
    offlineHours: Math.min(96, bags.add.offlineHours),
    offlineRate: Math.min(1, 0.35 * bags.mul.offline),
    costMultiplier: bags.mul.cost,
    capacity: safe(bags.add.capacity),
    creatureSlots: Math.max(2, Math.floor(bags.add.creatureSlots)),
    abilitySlots: Math.min(9, Math.floor(bags.add.abilitySlots)),
    skillDuration: bags.mul.skillDuration,
    skillCooldown: bags.mul.skillCooldown,
    petValue: bags.mul.petValue,
    petSpeed: bags.mul.petSpeed,
    pairBonus: bags.mul.pairBonus,
    globalMultiplier: global,
    freeUpgradeChance: bags.add.freeUpgradeChance,

    stage,
    features: featuresAt(stage),

    shelfRate: safe(shelfRate),
    shelfIncome: safe(shelfOutput * global),
    jarCapacity: safe(jarCapacity),
    sealKeep: bags.add.sealKeep,
    autoSeal: bags.add.autoSeal > 0,
    ribbonsIfSealed: ribbonGain(state.wallet.hearts, jarCapacity, bags.mul.ribbonGain),
    autoTapsPerSecond: safe(bags.add.autoTapsPerSecond),
      autobuyerIntervalMs: Math.max(50, 5_000 / Math.max(1, bags.add.autobuyerSpeed)),

    mods: bags,
  };
}

/* ------------------------------------------------------------------ */
/* Costs                                                               */
/* ------------------------------------------------------------------ */

export function upgradeCost(state: GameState, def: UpgradeDef, count = 1, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = (def.currency === "hearts" ? d.costMultiplier : 1);
  return safe(bulkCost(def.baseCost, def.growth, owned, count) * discount);
}

export function upgradeNextCost(state: GameState, def: UpgradeDef, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = (def.currency === "hearts" ? d.costMultiplier : 1);
  return safe(scale(def.baseCost, def.growth, owned) * discount);
}

export function maxAffordable(state: GameState, def: UpgradeDef, derived?: Derived): number {
  const owned = state.upgrades[def.id] ?? 0;
  const d = derived ?? derive(state);
  const discount = (def.currency === "hearts" ? d.costMultiplier : 1);
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
