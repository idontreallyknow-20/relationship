import type {
  AutobuyerState, CreatureInstance, GameState, Gift, ItemInstance, ItemRarity, Person,
} from "./types";
import {
  addCurrency, addBuff, earnHearts, grantCollectible, grantReward, metricTotal,
  pushLog, recordMetric, spendCurrency,
} from "./engine";
import {
  buyableTree, creaturesInJar, derive, hasFlag, meetsUnlock, upgradeCost, upgradeNextCost,
} from "./formulas";
import { safe, seededRandom } from "./numbers";
import { UPGRADES, UPGRADE_BY_ID } from "./config/upgrades";
import {
  DROP_UPGRADES, MOON_UPGRADES, STAR_UPGRADES, RESET_UPGRADE_BY_ID,
  dropGain, moonGain, resetUpgradeCost, seaRequirement, starGain, tideRequirement,
  waterRequirement,
} from "./config/resets";
import { SKILL_BY_ID, skillCost } from "./config/skills";
import {
  CREATURES, CREATURE_BY_ID, LINE_OWNER, traitsFor, xpFor,
} from "./config/creatures";
import {
  CRAFT_COST, RARITY_META, ROCK_NAMES, SHELL_NAMES,
  affixValue, affixesFor, itemLevelScale, polishCost, rerollCost, salvageValue,
} from "./config/items";
import { VESSELS, VESSEL_BY_ID, vesselIndex } from "./config/vessels";
import {
  DEEPEN_MULTIPLIER, DEPTHS, deepenRequirement, depthAffordable, depthBulkCost,
  tideAffordable, tideBulkCost,
} from "./config/depths";
import {
  DILATION_UPGRADE_BY_ID, dilationUpgradeCost, hourGain,
} from "./config/dilation";
import { FOOD_BY_ID, MEMORY_BY_ID, TRIP_BY_ID } from "./config/memories";
import { METERS, METER_BY_ID, METER_FILL } from "./config/meters";
import { CHALLENGE_BY_ID, MISSIONS, MISSION_BY_ID, type MetricId, type MissionPeriod } from "./config/objectives";
import { createGameState } from "./state";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });
const done = (message?: string): ActionResult => ({ ok: true, message });

/* ------------------------------------------------------------------ */
/* Upgrades                                                            */
/* ------------------------------------------------------------------ */

export function buyUpgrade(state: GameState, id: string, count: number): ActionResult {
  const def = UPGRADE_BY_ID[id];
  if (!def) return fail("Unknown upgrade");
  if (!buyableTree(state, def)) return fail("That one is theirs to buy");
  if (!meetsUnlock(state, def.unlock)) return fail("Not unlocked yet");
  // Buying ten or a hundred or the lot used to be a moon upgrade. It should
  // never have been: it is not power, it is not having to press a button
  // eighty times, and making somebody earn that is just making them tap.

  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;
  if (challenge?.rule === "one_line" && def.tree !== state.owner) {
    return fail("Only your own tree in this challenge");
  }

  const owned = state.upgrades[id] ?? 0;
  const room = def.max === Infinity ? Infinity : def.max - owned;
  const levels = Math.max(0, Math.min(count, room));
  if (levels <= 0) return fail("Already at maximum");

  const derived = derive(state);
  const cost = upgradeCost(state, def, levels, derived);
  const free = Math.random() < derived.freeUpgradeChance;
  if (!free && !spendCurrency(state, def.currency, cost)) return fail("Not enough");

  state.upgrades[id] = owned + levels;
  state.stats.upgradesBought += levels;
  recordMetric(state, "upgrades", levels);
  return done(free ? `${def.name} was free` : undefined);
}

export function buyCheapest(state: GameState): ActionResult {
  const derived = derive(state);
  let best: { id: string; cost: number } | null = null;
  for (const def of UPGRADES) {
    if (def.currency !== "hearts" || !buyableTree(state, def)) continue;
    if (!meetsUnlock(state, def.unlock)) continue;
    const owned = state.upgrades[def.id] ?? 0;
    if (def.max !== Infinity && owned >= def.max) continue;
    const cost = upgradeNextCost(state, def, derived);
    if (cost > state.wallet.hearts) continue;
    if (!best || cost < best.cost) best = { id: def.id, cost };
  }
  if (!best) return fail("Nothing affordable");
  return buyUpgrade(state, best.id, 1);
}

/* ------------------------------------------------------------------ */
/* Abilities                                                           */
/* ------------------------------------------------------------------ */

export function levelSkill(state: GameState, id: string): ActionResult {
  const def = SKILL_BY_ID[id];
  const skill = state.skills[id];
  if (!def || !skill) return fail("Unknown ability");
  if (skill.level >= def.maxLevel) return fail("Already at maximum");
  if (!meetsUnlock(state, def.unlock)) return fail("Not unlocked yet");
  if (!spendCurrency(state, "pearls", skillCost(def, skill.level))) return fail("Not enough pearls");
  skill.level += 1;
  return done(`${def.name} is now level ${skill.level}`);
}

export function toggleSkillAuto(state: GameState, id: string): ActionResult {
  const def = SKILL_BY_ID[id];
  const skill = state.skills[id];
  if (!def || !skill) return fail("Unknown ability");
  if (!hasFlag(state, "auto_skill")) return fail("Automation is a moon upgrade");
  if (skill.level < def.autoLevel) return fail(`Reach level ${def.autoLevel} first`);
  skill.auto = !skill.auto;
  return done(skill.auto ? `${def.name} will fire itself` : `${def.name} is manual again`);
}

/* ------------------------------------------------------------------ */
/* Creatures                                                           */
/* ------------------------------------------------------------------ */

function rollTrait(line: "otter" | "crab", luck: number): string {
  const pool = traitsFor(line).flatMap(
    (t) => Array(Math.max(1, Math.round(t.weight * (1 + luck)))).fill(t.id) as string[],
  );
  return pool[Math.floor(Math.random() * pool.length)] ?? "eager";
}

export interface ArriveResult extends ActionResult {
  creature?: CreatureInstance;
  newToCodex?: boolean;
}

/**
 * A creature arrives. Bought rather than gambled for: this is a two person
 * game, and a gacha would be the wrong shape for it.
 */
export function addCreature(state: GameState, defId: string, now: number): ArriveResult {
  const def = CREATURE_BY_ID[defId];
  if (!def) return fail("Unknown creature");
  if (state.lifetime.hearts < def.unlockLifetime) return fail("Not ready for that one yet");
  if (Object.values(state.creatures).some((c) => c.defId === defId)) {
    return fail("You already have one");
  }
  if (def.cost && !spendCurrency(state, def.cost.currency, def.cost.amount)) {
    return fail(`Not enough ${def.cost.currency}`);
  }

  const derived = derive(state, now);
  const creature: CreatureInstance = {
    id: crypto.randomUUID(),
    defId,
    level: 1,
    xp: 0,
    fed: 80,
    name: null,
    trait: rollTrait(def.line, derived.luck),
    stars: 0,
    locked: false,
    itemId: null,
    slot: null,
    lastActedAt: now,
    arrivedAt: now,
  };
  state.creatures[creature.id] = creature;
  state.stats.creaturesArrived += 1;

  const newToCodex = !state.codex.includes(defId);
  if (newToCodex) state.codex.push(defId);
  recordMetric(state, "creaturesArrived", 1);

  // Straight into the first empty slot, so it starts working immediately.
  const empty = state.slots.findIndex((s, i) => !s && i < derived.creatureSlots);
  if (empty >= 0) {
    state.slots[empty] = creature.id;
    creature.slot = empty;
  }

  pushLog(state, "Arrived", def.name);
  return { ok: true, creature, newToCodex, message: `${def.name} arrived` };
}

export function feedCreature(state: GameState, creatureId: string, foodId: string): ActionResult {
  const creature = state.creatures[creatureId];
  const food = FOOD_BY_ID[foodId];
  if (!creature || !food) return fail("Unknown");
  const def = CREATURE_BY_ID[creature.defId];
  if (!def) return fail("Unknown creature");
  if (!spendCurrency(state, food.cost.currency, food.cost.amount)) {
    return fail(`Not enough ${food.cost.currency}`);
  }

  // A creature likes some food more than others.
  const liked = food.favouredBy === def.line;
  creature.fed = Math.min(100, creature.fed + food.fills * (liked ? 1.3 : 1));
  const derived = derive(state);
  const xp = food.xp * (liked ? 1.5 : 1) * derived.mods.mul.creatureXp;
  return addXp(state, creatureId, xp);
}

export function addXp(state: GameState, creatureId: string, xp: number): ActionResult {
  const creature = state.creatures[creatureId];
  const def = creature ? CREATURE_BY_ID[creature.defId] : null;
  if (!creature || !def) return fail("Unknown creature");
  creature.xp += Math.max(0, xp);
  let levelled = 0;
  while (creature.level < def.maxLevel && creature.xp >= xpFor(creature.level)) {
    creature.xp -= xpFor(creature.level);
    creature.level += 1;
    levelled += 1;
  }
  if (levelled > 0) recordMetric(state, "creatureLevels", levelled);
  return done(levelled > 0 ? `${creature.name ?? def.name} reached level ${creature.level}` : undefined);
}

/** Crabs molt, otters grow. Same mechanic, different word. */
export function growCreature(state: GameState, creatureId: string): ActionResult {
  const creature = state.creatures[creatureId];
  if (!creature) return fail("Unknown creature");
  const def = CREATURE_BY_ID[creature.defId];
  if (!def?.evolvesTo || !def.evolveAt) return fail("This one does not grow any further");
  const target = CREATURE_BY_ID[def.evolvesTo];
  if (!target) return fail("This one does not grow any further");
  if (creature.level < def.evolveAt.level) return fail(`Reach level ${def.evolveAt.level} first`);
  if (!spendCurrency(state, "glass", def.evolveAt.glass)) return fail("Not enough sea glass");

  creature.defId = target.id;
  creature.level = Math.max(1, Math.floor(creature.level * 0.65));
  creature.xp = 0;
  creature.stars += 1;
  state.stats.creaturesEvolved += 1;
  recordMetric(state, "creaturesEvolved", 1);
  if (!state.codex.includes(target.id)) {
    state.codex.push(target.id);
    recordMetric(state, "creaturesArrived", 1);
  }
  pushLog(state, def.line === "crab" ? "Molted" : "Grew", `${def.name} became ${target.name}`);
  return done(`${def.name} became ${target.name}`);
}

export function placeCreature(state: GameState, slot: number, creatureId: string | null): ActionResult {
  const derived = derive(state);
  if (slot < 0 || slot >= derived.creatureSlots) return fail("That slot is not open yet");
  while (state.slots.length < derived.creatureSlots) state.slots.push(null);

  if (creatureId) {
    const creature = state.creatures[creatureId];
    if (!creature) return fail("Unknown creature");
    const def = CREATURE_BY_ID[creature.defId];
    const vessel = VESSEL_BY_ID[state.vessel];
    if (def?.needsDepth && vessel && vessel.depth < def.needsDepth) {
      return fail(`${def.name} needs deeper water than this vessel has`);
    }
    if (def?.needsFloor && vessel && vessel.floor < def.needsFloor) {
      return fail(`${def.name} needs more floor than this vessel has`);
    }
    // Take it out of wherever it was first.
    const previous = state.slots.indexOf(creatureId);
    if (previous >= 0) state.slots[previous] = null;
    creature.slot = slot;
  }

  const displaced = state.slots[slot];
  if (displaced && state.creatures[displaced]) state.creatures[displaced].slot = null;
  state.slots[slot] = creatureId;
  return done();
}

export function nameCreature(state: GameState, creatureId: string, name: string): ActionResult {
  const creature = state.creatures[creatureId];
  if (!creature) return fail("Unknown creature");
  creature.name = name.trim().slice(0, 24) || null;
  return done();
}

/** Which creatures this person can add next, in order. */
export function availableCreatures(state: GameState): { defId: string; owned: boolean; ready: boolean }[] {
  return CREATURES.map((def) => ({
    defId: def.id,
    owned: Object.values(state.creatures).some((c) => c.defId === def.id),
    ready: state.lifetime.hearts >= def.unlockLifetime,
  }));
}

/* ------------------------------------------------------------------ */
/* Rocks and shells                                                    */
/* ------------------------------------------------------------------ */

function rollAffixes(kind: "rock" | "shell", rarity: ItemRarity, level: number, luck: number) {
  const pool = affixesFor(kind);
  const count = RARITY_META[rarity].affixes;
  const chosen: typeof pool = [];
  for (let i = 0; i < count && chosen.length < pool.length; i++) {
    const remaining = pool.filter((a) => !chosen.includes(a));
    const total = remaining.reduce((sum, a) => sum + a.weight, 0);
    let roll = Math.random() * total;
    for (const affix of remaining) {
      roll -= affix.weight;
      if (roll <= 0) {
        chosen.push(affix);
        break;
      }
    }
  }
  return chosen.map((affix) => ({
    stat: affix.stat,
    kind: affix.kind,
    value: affixValue(affix, rarity, level, Math.min(1, Math.random() * (1 + luck))),
  }));
}

function itemName(kind: "rock" | "shell", seed: string): string {
  const names = kind === "rock" ? ROCK_NAMES : SHELL_NAMES;
  return names[Math.floor(seededRandom(seed) * names.length)];
}

export interface CraftResult extends ActionResult {
  item?: ItemInstance;
}

export function craftItem(state: GameState, kind: "rock" | "shell", rarity: ItemRarity): CraftResult {
  if (!hasFlag(state, "items")) return fail("Rocks and shells are a moon upgrade");
  const derived = derive(state);
  const cost = Math.ceil(CRAFT_COST[rarity] * derived.costMultiplier);
  if (!spendCurrency(state, "glass", cost)) return fail("Not enough sea glass");

  const id = crypto.randomUUID();
  const item: ItemInstance = {
    id,
    kind,
    defId: itemName(kind, id),
    rarity,
    level: 0,
    affixes: rollAffixes(kind, rarity, 0, derived.luck),
    locked: false,
    createdAt: Date.now(),
  };
  state.items[id] = item;
  state.stats.itemsMade += 1;
  recordMetric(state, "itemsMade", 1);
  return { ok: true, item, message: `${RARITY_META[rarity].label} ${item.defId}` };
}

export function polishItem(state: GameState, itemId: string): ActionResult {
  const item = state.items[itemId];
  if (!item) return fail("Unknown");
  if (item.level >= 20) return fail("Already at maximum");
  if (!spendCurrency(state, "glass", polishCost(item.rarity, item.level))) return fail("Not enough sea glass");
  const before = item.level;
  item.level += 1;
  const factor = itemLevelScale(item.level) / itemLevelScale(before);
  item.affixes = item.affixes.map((a) => ({ ...a, value: a.value * factor }));
  return done(`Polished to ${item.level}`);
}

export function rerollItem(state: GameState, itemId: string): ActionResult {
  const item = state.items[itemId];
  if (!item) return fail("Unknown");
  if (item.locked) return fail("That one is locked");
  if (!spendCurrency(state, "glass", rerollCost(item.rarity))) return fail("Not enough sea glass");
  item.affixes = rollAffixes(item.kind, item.rarity, item.level, derive(state).luck);
  return done("Rerolled");
}

export function salvageItem(state: GameState, itemId: string): ActionResult {
  const item = state.items[itemId];
  if (!item) return fail("Unknown");
  if (item.locked) return fail("That one is locked");
  const value = salvageValue(item.rarity, item.level);
  delete state.items[itemId];
  for (const creature of Object.values(state.creatures)) {
    if (creature.itemId === itemId) creature.itemId = null;
  }
  addCurrency(state, "glass", value);
  return done(`Salvaged for ${value} sea glass`);
}

export function giveItem(state: GameState, creatureId: string, itemId: string | null): ActionResult {
  const creature = state.creatures[creatureId];
  if (!creature) return fail("Unknown creature");
  const def = CREATURE_BY_ID[creature.defId];
  if (!def) return fail("Unknown creature");
  if (itemId) {
    const item = state.items[itemId];
    if (!item) return fail("Unknown");
    const wants = def.line === "otter" ? "rock" : "shell";
    if (item.kind !== wants) {
      return fail(def.line === "otter" ? "Otters carry rocks" : "Crabs wear shells");
    }
    // Take it off whoever had it.
    for (const other of Object.values(state.creatures)) {
      if (other.itemId === itemId) other.itemId = null;
    }
  }
  creature.itemId = itemId;
  return done();
}

/* ------------------------------------------------------------------ */
/* The depth chain                                                     */
/* ------------------------------------------------------------------ */

/** How many of this depth you can buy right now, honouring the buy amount. */
export function depthBuyCount(state: GameState, tier: number, want?: number | "max"): number {
  const def = DEPTHS[tier];
  const slot = state.depths[tier];
  if (!def || !slot?.unlocked) return 0;
  const derived = derive(state);
  const budget = state.wallet.hearts / Math.max(0.01, derived.costMultiplier);
  const affordable = depthAffordable(def, slot.bought, budget);
  const amount = want ?? state.settings.depthBuyAmount;
  if (amount === "max") return affordable;
  return Math.min(affordable, Math.max(0, Math.floor(Number(amount) || 0)));
}

/**
 * Buy into a depth.
 *
 * Buying raises both `bought` and `owned`: the price of the next one, and the
 * number actually down there working. Production from below only ever raises
 * `owned`, which is why a depth fed from beneath never gets more expensive.
 */
export function buyDepth(state: GameState, tier: number, want?: number | "max"): ActionResult {
  const def = DEPTHS[tier];
  const slot = state.depths[tier];
  if (!def) return fail("No such depth");
  if (!slot?.unlocked) return fail("The jar is not that deep yet");

  const count = depthBuyCount(state, tier, want);
  if (count <= 0) return fail("Not enough hearts");

  const derived = derive(state);
  const cost = depthBulkCost(def, slot.bought, count) * derived.costMultiplier;
  if (!spendCurrency(state, "hearts", cost)) return fail("Not enough hearts");

  slot.bought += count;
  slot.owned = safe(slot.owned + count);
  recordMetric(state, "depthsBought", count);
  return done();
}

/** Deepest depth currently open, as an index. */
export function deepestUnlocked(state: GameState): number {
  let last = 0;
  for (let i = 0; i < state.depths.length; i++) if (state.depths[i].unlocked) last = i;
  return last;
}

export function canDeepen(state: GameState): boolean {
  const tier = deepestUnlocked(state);
  return state.depths[tier].bought >= deepenRequirement(state.deepens);
}

/**
 * Go deeper.
 *
 * The fast inner loop: it costs you the whole chain and pays a permanent
 * multiplier plus, if there is any left, the next depth down. Requires a
 * count rather than a wait, so it is never something you sit and watch for.
 */
export function deepen(state: GameState): ActionResult {
  if (!canDeepen(state)) {
    return fail(`Buy ${deepenRequirement(state.deepens)} of your deepest before going deeper`);
  }
  const derived = derive(state);
  const tier = deepestUnlocked(state);
  const room = Math.min(derived.depthCount, DEPTHS.length);

  state.deepens += 1;
  recordMetric(state, "deepens", 1);

  const opened = tier + 1 < room;
  if (opened) state.depths[tier + 1].unlocked = true;

  for (const depth of state.depths) {
    depth.bought = 0;
    depth.owned = 0;
  }
  state.depths[0].unlocked = true;
  // Hearts stay. Taking them as well meant rebuilding from nothing every time,
  // and measured, that was one deepening per quarter of an hour: a wall in the
  // one loop that is supposed to be the fast one. Losing the chain is the cost;
  // losing the means to rebuild it is just waiting.

  pushLog(state, "Deeper", opened ? DEPTHS[tier + 1].name : `x${DEEPEN_MULTIPLIER} again`);
  return done(
    opened
      ? `The jar is deeper. ${DEPTHS[tier + 1].name} are down there.`
      : `Everything is ${DEEPEN_MULTIPLIER} times stronger.`,
  );
}

/* ------------------------------------------------------------------ */
/* Tide, the speed of everything                                       */
/* ------------------------------------------------------------------ */

export function tideBuyCount(state: GameState, want?: number | "max"): number {
  const derived = derive(state);
  const budget = state.wallet.hearts / Math.max(0.01, derived.costMultiplier);
  const affordable = tideAffordable(state.tideBought, budget);
  const amount = want ?? state.settings.depthBuyAmount;
  if (amount === "max") return affordable;
  return Math.min(affordable, Math.max(0, Math.floor(Number(amount) || 0)));
}

/** Tide is the one dial that touches every depth at once. */
export function buyTide(state: GameState, want?: number | "max"): ActionResult {
  const count = tideBuyCount(state, want);
  if (count <= 0) return fail("Not enough hearts");
  const derived = derive(state);
  const cost = tideBulkCost(state.tideBought, count) * derived.costMultiplier;
  if (!spendCurrency(state, "hearts", cost)) return fail("Not enough hearts");
  state.tideBought += count;
  recordMetric(state, "tideBought", count);
  return done();
}

/* ------------------------------------------------------------------ */
/* Automation                                                          */
/* ------------------------------------------------------------------ */

export function setAutobuyer(
  state: GameState,
  target: string,
  patch: Partial<Omit<AutobuyerState, "lastRunAt">>,
): ActionResult {
  const existing = state.autobuyers[target] ?? { on: false, max: true, threshold: 1, lastRunAt: 0 };
  state.autobuyers[target] = { ...existing, ...patch };
  return done();
}

/**
 * Everything affordable, cheapest first.
 *
 * Deliberately greedy and deliberately bounded: it loops until nothing more is
 * affordable or it hits the pass limit, so one press after a reset rebuilds a
 * run rather than needing twenty. The pass limit exists because with enough
 * income "affordable" never stops being true.
 */
export function buyAll(state: GameState, passes = 40): ActionResult {
  let bought = 0;
  for (let pass = 0; pass < passes; pass++) {
    let didSomething = false;

    // Depths, deepest first: reaching down is worth more per heart.
    for (let tier = state.depths.length - 1; tier >= 0; tier--) {
      if (!state.depths[tier]?.unlocked) continue;
      if (buyDepth(state, tier, "max").ok) {
        didSomething = true;
        bought += 1;
      }
    }
    if (buyTide(state, "max").ok) {
      didSomething = true;
      bought += 1;
    }
    if (buyCheapest(state).ok) {
      didSomething = true;
      bought += 1;
    }
    if (!didSomething) break;
  }
  return bought > 0 ? done(`Bought ${bought}`) : fail("Nothing affordable");
}

/**
 * The autobuyers, run once per tick.
 *
 * Each one keeps its own clock so a slow autobuyer does not get dragged along
 * by a fast one, and each spends at most its share of the balance so switching
 * them all on does not mean the first in the list eats everything.
 */
export function runAutobuyers(state: GameState, now: number): void {
  const derived = derive(state);
  const interval = derived.autobuyerIntervalMs;

  for (const [target, buyer] of Object.entries(state.autobuyers)) {
    if (!buyer.on) continue;
    if (buyer.lastRunAt > now) buyer.lastRunAt = 0;
    if (now - buyer.lastRunAt < interval) continue;
    buyer.lastRunAt = now;

    // Spend only this autobuyer's slice, then put the rest back, so the
    // threshold means what it says regardless of what else is switched on.
    const held = state.wallet.hearts;
    const allowance = held * Math.min(1, Math.max(0, buyer.threshold));
    state.wallet.hearts = allowance;

    const want = buyer.max ? "max" : 1;
    if (target === "tide") buyTide(state, want);
    else {
      const tier = DEPTHS.findIndex((d) => d.id === target);
      if (tier >= 0) buyDepth(state, tier, want);
    }

    state.wallet.hearts = safe(state.wallet.hearts + (held - allowance));
  }
}

/* ------------------------------------------------------------------ */
/* Vessels                                                             */
/* ------------------------------------------------------------------ */

export function unlockVessel(state: GameState, id: string): ActionResult {
  const vessel = VESSEL_BY_ID[id];
  if (!vessel) return fail("Unknown vessel");
  if (state.vesselsUnlocked.includes(id)) return fail("Already yours");
  if (id === "ocean" && !hasFlag(state, "ocean")) return fail("The Ocean is a star upgrade");
  if (state.lifetime.hearts < vessel.unlockLifetime) return fail("Not enough lifetime hearts yet");
  if (!spendCurrency(state, vessel.cost.currency, vessel.cost.amount)) return fail("Not enough");

  state.vesselsUnlocked.push(id);
  state.stats.vesselsUnlocked = state.vesselsUnlocked.length;
  recordMetric(state, "vessels", 1);
  grantCollectible(state, "vessels", id);
  if (id === "aquarium") grantCollectible(state, "waters", "deep");
  pushLog(state, "Vessel", vessel.name);
  return done(`${vessel.name} is yours`);
}

export function moveTo(state: GameState, id: string): ActionResult {
  if (!state.vesselsUnlocked.includes(id)) return fail("Not yours yet");
  const vessel = VESSEL_BY_ID[id];
  if (!vessel) return fail("Unknown vessel");

  // Anything that cannot live here has to come out first.
  for (const creature of creaturesInJar(state)) {
    const def = CREATURE_BY_ID[creature.defId];
    if (!def) continue;
    const tooShallow = def.needsDepth && vessel.depth < def.needsDepth;
    const tooNarrow = def.needsFloor && vessel.floor < def.needsFloor;
    if (tooShallow || tooNarrow) {
      const slot = state.slots.indexOf(creature.id);
      if (slot >= 0) state.slots[slot] = null;
      creature.slot = null;
    }
  }
  state.vessel = id;
  return done(`Moved to the ${vessel.name}`);
}

/* ------------------------------------------------------------------ */
/* Memories, trips and water                                           */
/* ------------------------------------------------------------------ */

export function buyMemory(state: GameState, id: string): ActionResult {
  const memory = MEMORY_BY_ID[id];
  if (!memory) return fail("Unknown");
  if ((state.collections["memories"] ?? []).includes(id)) return fail("Already yours");
  if (state.lifetime.hearts < memory.unlockLifetime) return fail("Not yet");
  if (!spendCurrency(state, "tide", memory.cost)) return fail("Not enough tide");
  grantCollectible(state, "memories", id);
  if (id === "the_dragon") grantCollectible(state, "waters", "dragon");
  pushLog(state, "Memory", memory.name);
  return done(memory.name);
}

export function startTrip(state: GameState, id: string, now: number): ActionResult {
  const trip = TRIP_BY_ID[id];
  if (!trip) return fail("Unknown");
  if (state.lifetime.hearts < trip.unlockLifetime) return fail("Not yet");
  if (state.buffs.some((b) => b.source === `trip:${id}`)) return fail("Already away");
  if (!spendCurrency(state, "tide", trip.cost)) return fail("Not enough tide");

  addBuff(state, {
    source: `trip:${id}`,
    label: trip.name,
    mods: trip.mods,
    expiresAt: now + trip.hours * 3_600_000,
  });
  pushLog(state, "Trip", trip.name);
  return done(trip.name);
}

export function setWater(state: GameState, id: string): ActionResult {
  if (!(state.collections["waters"] ?? []).includes(id)) return fail("Not yours yet");
  state.water = id;
  return done();
}

/* ------------------------------------------------------------------ */
/* Together                                                            */
/* ------------------------------------------------------------------ */

export type TogetherAction =
  | "question_answered" | "message_sent" | "memory_added" | "drawing_shared"
  | "letter_sent" | "mood_shared" | "plan_made";

const TOGETHER: Record<TogetherAction, { tide: number; label: string; perDay: number }> = {
  question_answered: { tide: 10, label: "Answered the daily question", perDay: 1 },
  message_sent: { tide: 3, label: "Sent a message", perDay: 3 },
  memory_added: { tide: 7, label: "Added a memory", perDay: 2 },
  drawing_shared: { tide: 6, label: "Shared a drawing", perDay: 2 },
  letter_sent: { tide: 7, label: "Wrote a letter", perDay: 2 },
  mood_shared: { tide: 4, label: "Shared how you are", perDay: 2 },
  plan_made: { tide: 5, label: "Made a plan", perDay: 2 },
};

/**
 * The bonus for using the rest of the app. Capped per action per day, so
 * there is never a reason to send filler messages, and entirely optional:
 * the Us tree is one of three and nothing gates on it.
 */
export function grantTogether(state: GameState, action: TogetherAction, day: string, now: number): ActionResult {
  const rule = TOGETHER[action];
  if (!rule) return fail("Unknown");
  if (state.togetherRewards.day !== day) state.togetherRewards = { day, claimed: [] };
  const used = state.togetherRewards.claimed.filter((c) => c.startsWith(action)).length;
  if (used >= rule.perDay) return fail("Already counted today");

  state.togetherRewards.claimed.push(`${action}:${used}`);
  const derived = derive(state, now);
  const tide = Math.max(1, Math.round(rule.tide * derived.mods.mul.tideGain));
  addCurrency(state, "tide", tide);
  state.tideLevel = Math.min(100, state.tideLevel + tide * 0.5);

  earnHearts(state, safe(Math.max(500, derived.heartsPerSecond * 120)), "together");
  state.storyProgress["together"] = (state.storyProgress["together"] ?? 0) + 1;
  recordMetric(state, "togetherActions", 1);
  if (action === "question_answered") {
    state.storyProgress["questions"] = (state.storyProgress["questions"] ?? 0) + 1;
    recordMetric(state, "questionAnswered", 1);
  }
  const fill = METER_FILL[action];
  if (fill) fillMeter(state, fill.meter, fill.amount, now);

  pushLog(state, "Together", `${rule.label}, +${tide} tide`);
  return done(`${rule.label}: +${tide} tide`);
}

/**
 * Both of you played within a few hours. This is the largest ongoing bonus
 * in the game, and the only one that needs the other person at all.
 */
export function recordSameEvening(state: GameState, day: string, now: number): ActionResult {
  if (state.togetherRewards.day !== day) state.togetherRewards = { day, claimed: [] };
  if (state.togetherRewards.claimed.includes("evening")) return fail("Already counted today");
  state.togetherRewards.claimed.push("evening");

  const derived = derive(state, now);
  const tide = Math.max(20, Math.round(35 * derived.mods.mul.tideGain));
  addCurrency(state, "tide", tide);
  state.tideLevel = 100;
  state.storyProgress["evenings"] = (state.storyProgress["evenings"] ?? 0) + 1;
  recordMetric(state, "sameEvening", 1);

  fillMeter(state, "presence", 100, now);

  addBuff(state, {
    source: "same_evening",
    label: "The same evening",
    mods: { mul: { all: 2, crackValue: 1.5, collectValue: 1.5 } },
    expiresAt: now + 3 * 3_600_000,
  });
  pushLog(state, "Together", "You are both here");
  return done("You are both here. Everything doubles for three hours.");
}

/** Leaving something behind for the other person when the tide goes out. */
export function leaveGift(state: GameState, from: Person, now: number): void {
  const derived = derive(state, now);
  const strength = 1.5 + Math.min(1.5, state.tideChanges * 0.05) * derived.mods.mul.all * 0.0001;
  state.giftLeft = {
    from,
    at: now,
    label: `${from === "cami" ? "Cami" : "Joseph"} left the tide out for you`,
    mods: { mul: { all: strength } },
    durationMs: 2 * 3_600_000,
    collected: false,
  };
}

/** How long a gift stays there waiting to be noticed. */
export const GIFT_WINDOW_MS = 48 * 3_600_000;

/**
 * Take whatever the other person left behind.
 *
 * `leaveGift` writes onto the giver's own save, which is all a rebirth can
 * reach. This is the other half: the receiver reads their partner's save and
 * moves the gift across. Idempotent on the gift's timestamp, so polling for it
 * every few minutes cannot hand the same one over twice.
 */
export function receiveGift(state: GameState, partner: unknown, now: number): ActionResult {
  const theirs = (partner as { giftLeft?: Gift } | null)?.giftLeft;
  if (!theirs || typeof theirs.at !== "number") return fail("Nothing left for you");
  if (theirs.from === state.owner) return fail("That one is yours");
  if (theirs.at <= (state.storyProgress["giftTakenAt"] ?? 0)) return fail("Already taken");
  if (now - theirs.at > GIFT_WINDOW_MS) return fail("Too long ago");

  state.storyProgress["giftTakenAt"] = theirs.at;
  state.giftWaiting = { ...theirs, collected: false };
  return done(theirs.label);
}

export function collectGift(state: GameState, now: number): ActionResult {
  const gift = state.giftWaiting;
  if (!gift || gift.collected) return fail("Nothing waiting");
  gift.collected = true;
  addBuff(state, {
    source: "gift",
    label: gift.label,
    mods: gift.mods,
    expiresAt: now + gift.durationMs,
  });
  state.giftWaiting = null;
  pushLog(state, "Gift", gift.label);
  return done(gift.label);
}

/* ------------------------------------------------------------------ */
/* Love meters                                                         */
/* ------------------------------------------------------------------ */

/**
 * Bring the meters up to date.
 *
 * Called from the tick and from anything that fills one, so the decay is
 * applied exactly once per elapsed hour however often either happens. Meters
 * that are already empty stay empty rather than going negative.
 */
export function settleMeters(state: GameState, now: number): void {
  const since = now - (state.metersAt ?? now);
  state.metersAt = now;
  if (since <= 0) return;
  const hours = since / 3_600_000;

  for (const def of METERS) {
    const level = state.meters[def.id] ?? 0;
    if (level <= 0) continue;
    state.meters[def.id] = Math.max(0, level - def.decayPerHour * hours);
  }
}

/** Raise a meter, from something that happened elsewhere in the app. */
export function fillMeter(state: GameState, meterId: string, amount: number, now: number): void {
  const def = METER_BY_ID[meterId];
  if (!def || amount <= 0) return;
  settleMeters(state, now);
  state.meters[meterId] = Math.min(100, (state.meters[meterId] ?? 0) + amount);
}

/* ------------------------------------------------------------------ */
/* Working on it together                                              */
/* ------------------------------------------------------------------ */

/** Record what the partner's save says, so the bonus can be derived offline. */
export function recordPartnerTotal(state: GameState, theirLifetime: number): ActionResult {
  const value = Number(theirLifetime);
  if (!Number.isFinite(value) || value < 0) return fail("Nothing to read");
  const previous = state.storyProgress["partnerLifetime"] ?? 0;
  if (value <= previous) return fail("Nothing new");
  state.storyProgress["partnerLifetime"] = value;
  return done();
}

/**
 * Remember how many times they have been reborn.
 *
 * Only ever goes up. Their save is read from the server every few minutes, and
 * a deep rebirth on their side puts their count back to zero; taking the lower
 * number would quietly delete a joint milestone the pair genuinely reached, so
 * this keeps the high water mark instead.
 */
export function recordPartnerRebirths(state: GameState, theirRebirths: number): ActionResult {
  const value = Number(theirRebirths);
  if (!Number.isFinite(value) || value < 0) return fail("Nothing to read");
  const previous = state.storyProgress["partnerRebirths"] ?? 0;
  if (value <= previous) return fail("Nothing new");
  state.storyProgress["partnerRebirths"] = value;
  return done();
}

/* ------------------------------------------------------------------ */
/* Missions                                                            */
/* ------------------------------------------------------------------ */

function goalFor(defId: string, state: GameState): number {
  const def = MISSION_BY_ID[defId];
  if (!def) return 1;
  if (def.scaling === "fixed") return def.baseGoal;
  const scale = Math.max(1, Math.pow(Math.max(1, state.lifetime.hearts) / 1e6, 0.35));
  return Math.ceil(def.baseGoal * scale);
}

function pick<T extends { weight: number; id: string }>(pool: T[], count: number, seed: string): T[] {
  const chosen: T[] = [];
  const available = [...pool];
  for (let i = 0; i < count && available.length > 0; i++) {
    const total = available.reduce((sum, item) => sum + item.weight, 0);
    let roll = seededRandom(`${seed}:${i}`) * total;
    let index = 0;
    for (; index < available.length; index++) {
      roll -= available[index].weight;
      if (roll <= 0) break;
    }
    chosen.push(...available.splice(Math.min(index, available.length - 1), 1));
  }
  return chosen;
}

export function refreshMissions(state: GameState, day: string, week: string): void {
  const keep = state.missions.filter((m) => {
    const def = MISSION_BY_ID[m.defId];
    if (!def) return false;
    if (def.period === "daily") return m.period === day;
    if (def.period === "weekly") return m.period === week;
    return true;
  });

  const has = (period: MissionPeriod) => keep.some((m) => MISSION_BY_ID[m.defId]?.period === period);
  const next = [...keep];
  const make = (defId: string, period: string) => ({
    id: crypto.randomUUID(),
    defId,
    goal: goalFor(defId, state),
    progress: 0,
    claimed: false,
    period,
    rerolled: false,
  });

  if (!has("daily")) {
    for (const def of pick(MISSIONS.filter((m) => m.period === "daily"), 4, `daily:${day}`)) {
      next.push(make(def.id, day));
    }
  }
  if (!has("weekly")) {
    for (const def of pick(MISSIONS.filter((m) => m.period === "weekly"), 3, `weekly:${week}`)) {
      next.push(make(def.id, week));
    }
  }

  const storyDefs = MISSIONS.filter((m) => m.period === "story").sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  if (!next.some((m) => MISSION_BY_ID[m.defId]?.period === "story" && !m.claimed)) {
    const doneIds = new Set(Object.keys(state.storyProgress));
    const nextStory = storyDefs.find((d) => !doneIds.has(d.id));
    if (nextStory) next.push(make(nextStory.id, "story"));
  }

  for (const def of MISSIONS.filter((m) => m.period === "long")) {
    if (!next.some((m) => m.defId === def.id)) next.push(make(def.id, "long"));
  }

  state.missions = next;
}

export function claimMission(state: GameState, missionId: string): ActionResult {
  const mission = state.missions.find((m) => m.id === missionId);
  if (!mission) return fail("Unknown mission");
  const def = MISSION_BY_ID[mission.defId];
  if (!def) return fail("Unknown mission");
  if (mission.claimed) return fail("Already claimed");

  const longLived = def.period === "story" || def.period === "long" || def.metric === "bestCombo";
  const progress = longLived
    ? Math.max(mission.progress, metricTotal(state, def.metric as MetricId))
    : mission.progress;
  if (progress < mission.goal) return fail("Not finished yet");

  mission.claimed = true;
  grantReward(state, def.reward, derive(state).mods.mul.missionReward);
  state.stats.missionsCompleted += 1;
  if (def.period === "story") state.storyProgress[def.id] = 1;
  pushLog(state, "Mission", def.name);
  return done(def.name);
}

export function rerollMission(state: GameState, missionId: string, day: string): ActionResult {
  const mission = state.missions.find((m) => m.id === missionId);
  if (!mission) return fail("Unknown mission");
  const def = MISSION_BY_ID[mission.defId];
  if (!def || def.period !== "daily") return fail("Only daily missions");
  if (mission.rerolled) return fail("Already rerolled today");
  if (!spendCurrency(state, "pearls", 5)) return fail("Not enough pearls");

  const taken = new Set(state.missions.map((m) => m.defId));
  const pool = MISSIONS.filter((m) => m.period === "daily" && !taken.has(m.id));
  if (pool.length === 0) return fail("Nothing else to swap to");
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  mission.defId = chosen.id;
  mission.goal = goalFor(chosen.id, state);
  mission.progress = 0;
  mission.rerolled = true;
  mission.period = day;
  return done("Swapped");
}

/* ------------------------------------------------------------------ */
/* Challenges                                                          */
/* ------------------------------------------------------------------ */

export function startChallenge(state: GameState, id: string, now: number): ActionResult {
  if (!hasFlag(state, "challenges")) return fail("Challenges are a moon upgrade");
  const def = CHALLENGE_BY_ID[id];
  if (!def) return fail("Unknown challenge");
  if (state.activeChallenge) return fail("Already in one");
  if (state.lifetime.hearts < def.unlockLifetime) return fail("Not unlocked yet");
  if (def.requiresTideChanges && state.tideChanges < def.requiresTideChanges) {
    return fail(`Needs ${def.requiresTideChanges} rebirths`);
  }

  const snapshot = JSON.stringify({
    upgrades: state.upgrades,
    wallet: state.wallet,
    runHearts: state.runHearts,
    runStartedAt: state.runStartedAt,
    combo: state.combo,
    vessel: state.vessel,
    slots: state.slots,
  });

  state.activeChallenge = {
    defId: id,
    startedAt: now,
    endsAt: def.timeLimit ? now + def.timeLimit * 1000 : null,
    score: 0,
    restore: snapshot,
  };

  state.upgrades = {};
  state.wallet.hearts = 0;
  state.runHearts = 0;
  state.combo = 0;
  state.comboExpiresAt = 0;
  if (def.rule === "no_creatures") state.slots = state.slots.map(() => null);
  return done(def.name);
}

export interface ChallengeOutcome extends ActionResult {
  cleared?: boolean;
  first?: boolean;
}

export function finishChallenge(state: GameState, now: number, abandon = false): ChallengeOutcome {
  const run = state.activeChallenge;
  if (!run) return fail("Nothing running");
  const def = CHALLENGE_BY_ID[run.defId];
  state.activeChallenge = null;

  if (run.restore) {
    try {
      Object.assign(state, JSON.parse(run.restore) as Partial<GameState>);
    } catch {
      // A corrupt snapshot should not lose the save; the player keeps
      // whatever the challenge produced instead.
    }
  }
  if (!def) return done();

  const cleared = !abandon && run.score >= def.goal.amount;
  if (!cleared) return done(abandon ? "Left it" : "Not this time");

  const record = state.challenges[def.id] ?? { completed: 0, best: 0 };
  const first = record.completed === 0;
  record.completed += 1;
  record.best = Math.max(record.best, run.score);
  state.challenges[def.id] = record;
  state.stats.challengesCompleted += 1;
  recordMetric(state, "challenges", 1);

  grantReward(state, first ? def.reward : (def.repeatReward ?? def.reward));
  pushLog(state, "Challenge", def.name);
  return { ok: true, cleared: true, first, message: `${def.name} cleared` };
}

/* ------------------------------------------------------------------ */
/* Reset layers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Put the chain back to how it looked on the first morning.
 *
 * Every rebirth calls this. Only the first tier is open, nothing is bought,
 * no deepening has happened and the jar is back to its ordinary speed. The
 * autobuyers keep their settings, because turning eight switches back on
 * after every rebirth is not a decision, it is a chore.
 */
function resetChain(state: GameState): void {
  for (let i = 0; i < state.depths.length; i++) {
    state.depths[i].bought = 0;
    state.depths[i].owned = 0;
    state.depths[i].unlocked = i === 0;
  }
  state.deepens = 0;
  state.tideBought = 0;
}

export function canChangeTide(state: GameState): boolean {
  return state.runHearts >= tideRequirement(state.tideChanges);
}

export function tidePreview(state: GameState): number {
  return moonGain(state, derive(state).mods.mul.moonGain);
}

export function changeTide(state: GameState, now: number): ActionResult {
  if (!canChangeTide(state)) return fail("Not enough hearts in this run yet");
  const moons = tidePreview(state);
  if (moons <= 0) return fail("This run would not pay anything");

  // A clock that moved backwards must not record an impossible record.
  const elapsed = Math.max(0, now - state.runStartedAt);
  state.stats.fastestTideChangeMs = state.stats.fastestTideChangeMs === null
    ? elapsed
    : Math.min(state.stats.fastestTideChangeMs, elapsed);

  addCurrency(state, "moons", moons);
  state.tideChanges += 1;
  recordMetric(state, "tideChanges", 1);

  const keepLevels = Math.floor(derive(state).mods.add.startingUpgrades);
  const kept: Record<string, number> = {};
  if (keepLevels > 0) {
    for (const [id, level] of Object.entries(state.upgrades)) {
      const keptLevel = Math.min(level, keepLevels);
      if (keptLevel > 0) kept[id] = keptLevel;
    }
  }

  state.upgrades = kept;
  state.wallet.hearts = 0;
  state.runHearts = 0;
  state.runStartedAt = now;
  state.combo = 0;
  state.comboExpiresAt = 0;
  state.buffs = state.buffs.filter((b) => b.source.startsWith("trip:"));
  state.settled = [];
  state.drifter = null;
  state.vessel = "jam_jar";

  // The chain goes, and so does every deepening.
  //
  // This is the whole reason the game used to end after twenty minutes. A
  // rebirth took your hearts and your upgrades but left the chain standing,
  // so income came straight back, the bar was crossed again within seconds,
  // and the permanent multipliers compounded on themselves until hearts left
  // the range of a floating point number. Measured: eighty-eight rebirths and
  // a hundred and sixty-three deepenings inside the twentieth minute.
  //
  // Clearing the chain is what makes a life have a shape. You rebuild it each
  // time, faster than the last, which is the entire pleasure of the genre.
  resetChain(state);

  leaveGift(state, state.owner, now);
  if (state.tideChanges >= 50) grantCollectible(state, "waters", "dawn");
  pushLog(state, "Rebirth", `${moons} moons`);
  return done(`Rebirth ${state.tideChanges}: ${moons} moons`);
}

export function canChangeWater(state: GameState): boolean {
  return hasFlag(state, "new_water") && state.eraHearts >= waterRequirement(state.newWaters);
}

export function waterPreview(state: GameState): number {
  return starGain(state, derive(state).mods.mul.starGain);
}

export function changeWater(state: GameState, now: number): ActionResult {
  if (!hasFlag(state, "new_water")) return fail("Deep Rebirth is a moon upgrade");
  if (!canChangeWater(state)) return fail("Not enough hearts in this era yet");
  const stars = waterPreview(state);
  if (stars <= 0) return fail("This era would not pay anything");

  const elapsed = Math.max(0, now - state.eraStartedAt);
  state.stats.fastestNewWaterMs = state.stats.fastestNewWaterMs === null
    ? elapsed
    : Math.min(state.stats.fastestNewWaterMs, elapsed);

  addCurrency(state, "stars", stars);
  state.newWaters += 1;
  recordMetric(state, "newWaters", 1);

  const keepCreatures = hasFlag(state, "creature_retention");
  const keepItems = hasFlag(state, "item_retention");

  state.upgrades = {};
  state.moonUpgrades = {};
  state.wallet.hearts = 0;
  state.wallet.moons = 0;
  state.runHearts = 0;
  state.eraHearts = 0;
  state.tideChanges = 0;
  state.runStartedAt = now;
  state.eraStartedAt = now;
  state.combo = 0;
  state.comboExpiresAt = 0;
  state.buffs = [];
  state.settled = [];
  state.drifter = null;
  state.vessel = "jam_jar";
  state.vesselsUnlocked = ["jam_jar"];

  if (!keepCreatures) {
    for (const creature of Object.values(state.creatures)) {
      creature.level = 1;
      creature.xp = 0;
    }
  }
  if (!keepItems) {
    state.items = {};
    for (const creature of Object.values(state.creatures)) creature.itemId = null;
  }
  if (state.newWaters >= 3) grantCollectible(state, "waters", "moonstone");

  pushLog(state, "Deep rebirth", `${stars} stars`);
  return done(`Deep rebirth ${state.newWaters}: ${stars} stars`);
}

/* ------------------------------------------------------------------ */
/* The last rebirth                                                    */
/* ------------------------------------------------------------------ */

export function canLetGo(state: GameState): boolean {
  return state.newWaters >= 3 && state.seaHearts >= seaRequirement(state.seas);
}

export function seaPreview(state: GameState): number {
  return dropGain(state, derive(state).mods.mul.dropGain);
}

/**
 * The last rung.
 *
 * Takes everything the layers above it took, plus those layers themselves:
 * moons, stars, both trees, and how deep the jar goes. What survives is the
 * drop tree and everything that was never really about the numbers, which is
 * the creatures, the memories and the two of you.
 */
export function letGo(state: GameState, now: number): ActionResult {
  if (state.newWaters < 3) return fail("Do three deep rebirths first");
  if (!canLetGo(state)) return fail("Not enough yet");
  const drops = seaPreview(state);
  if (drops <= 0) return fail("This one would not pay anything");

  addCurrency(state, "drops", drops);
  state.seas += 1;
  recordMetric(state, "seas", 1);

  const keepDeepens = hasFlag(state, "keep_deepens");

  state.upgrades = {};
  state.moonUpgrades = {};
  state.starUpgrades = {};
  state.wallet.hearts = 0;
  state.wallet.moons = 0;
  state.wallet.stars = 0;
  state.runHearts = 0;
  state.eraHearts = 0;
  state.seaHearts = 0;
  state.tideChanges = 0;
  state.newWaters = 0;
  state.runStartedAt = now;
  state.eraStartedAt = now;
  state.seaStartedAt = now;
  state.combo = 0;
  state.comboExpiresAt = 0;
  state.buffs = [];
  state.settled = [];
  state.drifter = null;
  state.vessel = "jam_jar";
  state.vesselsUnlocked = ["jam_jar"];
  state.tideBought = 0;
  if (!keepDeepens) state.deepens = 0;

  for (let i = 0; i < state.depths.length; i++) {
    state.depths[i] = { bought: 0, owned: 0, unlocked: i === 0 };
  }

  pushLog(state, "Last rebirth", `${drops} drops`);
  return done(`${drops} drops. There was never a jar.`);
}

/* ------------------------------------------------------------------ */
/* Time dilation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Dilation opens once you have let the sea go at least once.
 *
 * It is the only mechanic in the game that is worse than not having it until
 * you have invested in it, so it sits behind the layer that proves you know
 * what a reset is for.
 */
export function dilationUnlocked(state: GameState): boolean {
  return state.seas >= 1;
}

/**
 * Turn the jar down.
 *
 * Costs nothing and takes nothing away, which is deliberate: the price of
 * dilation is that everything is slower while it is on, and adding a reset on
 * top of that would make the first stretch feel like a punishment for reading
 * the tooltip. Hearts already banked stay in the jar; they simply do not count
 * toward what the stretch pays.
 */
export function enterDilation(state: GameState, now: number): ActionResult {
  if (!dilationUnlocked(state)) return fail("Let the sea go first");
  if (state.dilation.active) return fail("Already dilated");
  state.dilation = { ...state.dilation, active: true, startedAt: now, hearts: 0 };
  pushLog(state, "Dilation", "The jar slowed down");
  return done("Everything is slower now. Keep going.");
}

export function dilationPreview(state: GameState): number {
  return hourGain(state.dilation.hearts, state.dilation.runs, derive(state).mods.mul.hourGain);
}

/**
 * Come back out, and be paid for how far you got.
 *
 * Leaving without reaching the bar is allowed and pays nothing. It has to be
 * allowed: dilation can be entered before it is survivable, and a switch that
 * will not turn off is a trap rather than a decision.
 */
export function leaveDilation(state: GameState, now: number): ActionResult {
  if (!state.dilation.active) return fail("Not dilated");
  const hours = dilationPreview(state);

  state.dilation = {
    active: false,
    startedAt: now,
    hearts: 0,
    runs: hours > 0 ? state.dilation.runs + 1 : state.dilation.runs,
  };

  if (hours <= 0) return done("Back to normal speed. That stretch paid nothing.");
  addCurrency(state, "hours", hours);
  recordMetric(state, "dilations", 1);
  pushLog(state, "Dilation", `${hours} hours`);
  return done(`${hours} hours`);
}

export function buyDilationUpgrade(state: GameState, id: string): ActionResult {
  const def = DILATION_UPGRADE_BY_ID[id];
  if (!def) return fail("Unknown");
  const level = state.dilationUpgrades[id] ?? 0;
  if (level >= def.max) return fail("Already at maximum");
  if (def.requires) {
    const [needId, needLevel] = def.requires;
    if ((state.dilationUpgrades[needId] ?? 0) < needLevel) {
      return fail(`Needs ${DILATION_UPGRADE_BY_ID[needId]?.name ?? needId} first`);
    }
  }
  const cost = dilationUpgradeCost(def, level);
  if (!spendCurrency(state, "hours", cost)) return fail("Not enough hours");
  state.dilationUpgrades[id] = level + 1;
  return done(`${def.name} is now level ${level + 1}`);
}

/**
 * Go deeper on its own, and turn the tide on its own, once the drop tree has
 * bought the right to. Both are pure convenience: they do exactly what the
 * player would do by hand, at the first moment it is possible.
 */
export function runDeepAutomation(state: GameState, now: number): void {
  if (hasFlag(state, "auto_deepen") && canDeepen(state)) deepen(state);
  if (hasFlag(state, "auto_tide") && canChangeTide(state)) changeTide(state, now);
}

export function buyResetUpgrade(state: GameState, id: string): ActionResult {
  const def = RESET_UPGRADE_BY_ID[id];
  if (!def) return fail("Unknown upgrade");
  const levels = MOON_UPGRADES.some((u) => u.id === id)
    ? state.moonUpgrades
    : DROP_UPGRADES.some((u) => u.id === id)
      ? state.dropUpgrades
      : state.starUpgrades;
  const owned = levels[id] ?? 0;
  if (owned >= def.max) return fail("Already at maximum");
  if (def.requires) {
    const [reqId, reqLevel] = def.requires;
    if ((levels[reqId] ?? 0) < reqLevel) {
      return fail(`Needs ${RESET_UPGRADE_BY_ID[reqId]?.name ?? reqId} level ${reqLevel}`);
    }
  }
  if (!spendCurrency(state, def.currency, resetUpgradeCost(def, owned))) {
    return fail(`Not enough ${def.currency}`);
  }
  levels[id] = owned + 1;
  return done(`${def.name} level ${owned + 1}`);
}

export function respec(state: GameState, layer: "moons" | "stars" | "drops"): ActionResult {
  const defs = layer === "moons" ? MOON_UPGRADES : layer === "drops" ? DROP_UPGRADES : STAR_UPGRADES;
  const levels = layer === "moons"
    ? state.moonUpgrades
    : layer === "drops"
      ? state.dropUpgrades
      : state.starUpgrades;
  let refund = 0;
  for (const def of defs) {
    const owned = levels[def.id] ?? 0;
    for (let i = 0; i < owned; i++) refund += resetUpgradeCost(def, i);
  }
  if (refund <= 0) return fail("Nothing to refund");
  if (layer === "moons") state.moonUpgrades = {};
  else if (layer === "drops") state.dropUpgrades = {};
  else state.starUpgrades = {};
  addCurrency(state, layer, Math.floor(refund * 0.9));
  return done(`Refunded ${Math.floor(refund * 0.9)}`);
}

/* ------------------------------------------------------------------ */
/* Legacy                                                              */
/* ------------------------------------------------------------------ */

/** Old love jar taps become hearts, once. */
export function applyLegacy(state: GameState, taps: number): void {
  if (state.legacyClaimed) return;
  state.legacyClaimed = true;
  if (taps > 0) {
    earnHearts(state, taps, "click");
    state.stats.totalClicks += taps;
    pushLog(state, "Legacy", `${taps} hearts carried over from the old jar`);
  }
}

export function freshState(person: Person): GameState {
  return createGameState(Date.now(), person);
}

export { LINE_OWNER, vesselIndex, VESSELS };
