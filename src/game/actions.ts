import type {
  CharmInstance, CharmSlot, CurrencyId, GameState, PetInstance, Rarity,
} from "./types";
import {
  addCurrency, earnHearts, grantCollectible, grantReward, grantTitle,
  metricTotal, pushLog, recordMetric, spendCurrency,
} from "./engine";
import { derive, hasFlag, meetsUnlock, upgradeCost, upgradeNextCost } from "./formulas";
import { safe, seededRandom } from "./numbers";
import { UPGRADE_BY_ID, UPGRADES } from "./config/upgrades";
import {
  ASCENSION_UPGRADES, REBIRTH_UPGRADES, RESET_UPGRADE_BY_ID, ascensionCrystals,
  rebirthTokens, resetUpgradeCost, ASCENSION_REQUIREMENT, REBIRTH_REQUIREMENT,
} from "./config/resets";
import { SKILL_BY_ID, skillCost } from "./config/skills";
import {
  EGG_BY_ID, PERSONALITIES, PET_BY_ID, PETS, RARITY_META, RARITY_ORDER, TRAITS,
  petFeedCost, petXpFor,
} from "./config/pets";
import {
  AFFIXES, CHARM_NAMES, CHARM_PREFIX, CHARM_RARITY, CHARM_SLOTS, CRAFT_COST,
  charmAffixValue, enhanceCost, rerollCost, salvageValue,
} from "./config/charms";
import { BOSS_BY_ID, WORLD_BY_ID, bossHp } from "./config/worlds";
import {
  CHALLENGE_BY_ID, MISSIONS, MISSION_BY_ID, type MetricId, type MissionPeriod,
} from "./config/objectives";
import { SHOP_BY_ID } from "./config/shop";
import { EVENT_BY_ID, activeEvents } from "./config/events";
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
  if (!meetsUnlock(state, def.unlock)) return fail("Not unlocked yet");
  if (count > 1 && !hasFlag(state, "bulk")) return fail("Bulk buying is a rebirth upgrade");

  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;
  if (challenge?.rule === "single_tree" && def.tree !== "click") {
    return fail("Only the click tree is available in this challenge");
  }

  const owned = state.upgrades[id] ?? 0;
  const room = def.max === Infinity ? Infinity : def.max - owned;
  const levels = Math.max(0, Math.min(count, room));
  if (levels <= 0) return fail("Already at maximum");

  const derived = derive(state);
  const cost = upgradeCost(state, def, levels, derived);
  const free = Math.random() < derived.freeUpgradeChance;
  if (!free && !spendCurrency(state, def.currency, cost)) return fail("Not enough to buy that");

  state.upgrades[id] = owned + levels;
  state.stats.upgradesBought += levels;
  recordMetric(state, "upgrades", levels);
  return done(free ? `${def.name} was free` : undefined);
}

/** Buys the single cheapest affordable upgrade. Used by the automation flag. */
export function buyCheapest(state: GameState): ActionResult {
  const derived = derive(state);
  let best: { id: string; cost: number } | null = null;
  for (const def of UPGRADES) {
    if (def.currency !== "hearts") continue;
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
  const cost = skillCost(def, skill.level);
  if (!spendCurrency(state, "skill", cost)) return fail("Not enough skill points");
  skill.level += 1;
  return done(`${def.name} is now level ${skill.level}`);
}

export function toggleSkillAuto(state: GameState, id: string): ActionResult {
  const def = SKILL_BY_ID[id];
  const skill = state.skills[id];
  if (!def || !skill) return fail("Unknown ability");
  if (!hasFlag(state, "auto_skill")) return fail("Automation is a rebirth upgrade");
  if (skill.level < def.autoLevel) return fail(`Reach level ${def.autoLevel} first`);
  skill.auto = !skill.auto;
  return done(skill.auto ? `${def.name} will fire itself` : `${def.name} is manual again`);
}

/* ------------------------------------------------------------------ */
/* Pets                                                                */
/* ------------------------------------------------------------------ */

function rollTrait(luck: number): string {
  const pool = TRAITS.flatMap((t) => Array(Math.max(1, Math.round(t.weight * (1 + luck)))).fill(t.id) as string[]);
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollRarity(eggId: string, pity: number, luck: number): Rarity {
  const egg = EGG_BY_ID[eggId];
  if (!egg) return "common";
  if (pity >= egg.pityAt) return egg.pityRarity;

  const entries: { rarity: Rarity; weight: number }[] = [];
  for (const rarity of RARITY_ORDER) {
    const bias = egg.bias[rarity];
    if (!bias) continue;
    const rarityBoost = RARITY_ORDER.indexOf(rarity) >= 2 ? 1 + luck : 1;
    entries.push({ rarity, weight: RARITY_META[rarity].weight * bias * rarityBoost });
  }
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.rarity;
  }
  return entries[0]?.rarity ?? "common";
}

export interface EggResult extends ActionResult {
  pet?: PetInstance;
  duplicate?: boolean;
  newToCodex?: boolean;
}

export function openEgg(state: GameState, eggId: string, now: number): EggResult {
  const egg = EGG_BY_ID[eggId];
  if (!egg) return fail("Unknown egg");
  if ((state.eggs[eggId] ?? 0) <= 0) return fail("You do not have that egg");

  const derived = derive(state, now);
  state.eggs[eggId] -= 1;
  const pity = state.pity[eggId] ?? 0;
  const rarity = rollRarity(eggId, pity, derived.luck);
  state.pity[eggId] = RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf("rare") ? 0 : pity + 1;

  const world = WORLD_BY_ID[state.world];
  const candidates = PETS.filter((p) => p.rarity === rarity && p.eggs.includes(eggId));
  const pool = candidates.length > 0
    ? candidates
    : PETS.filter((p) => p.eggs.includes(eggId));
  if (pool.length === 0) return fail("That egg is empty");

  // The world nudges which pet of the rolled rarity you get.
  const biased = world?.petBias ? pool.filter((p) => world.petBias!.includes(p.id)) : [];
  const source = biased.length > 0 && Math.random() < 0.4 ? biased : pool;
  const chosen = source[Math.floor(Math.random() * source.length)] ?? pool[0];

  const duplicate = Object.values(state.pets).some((p) => p.defId === chosen.id);
  const pet: PetInstance = {
    id: crypto.randomUUID(),
    defId: chosen.id,
    level: 1,
    xp: 0,
    happiness: 80,
    trait: rollTrait(derived.luck),
    personality: PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)],
    nickname: null,
    stars: 0,
    locked: false,
    favorite: false,
    fedAt: now,
    hatchedAt: now,
    expedition: null,
  };
  state.pets[pet.id] = pet;
  state.stats.eggsOpened += 1;
  recordMetric(state, "eggs", 1);

  const newToCodex = !state.petCodex.includes(chosen.id);
  if (newToCodex) state.petCodex.push(chosen.id);

  // A duplicate is never dead weight: it converts into treats and shards.
  if (duplicate) {
    const value = Math.ceil(RARITY_META[chosen.rarity].power * 25);
    addCurrency(state, "treats", value);
    addCurrency(state, "shards", Math.ceil(RARITY_META[chosen.rarity].power));
  }

  pushLog(state, "Egg", `${chosen.name} (${RARITY_META[chosen.rarity].label})`);
  return { ok: true, pet, duplicate, newToCodex };
}

export function feedPet(state: GameState, petId: string): ActionResult {
  const pet = state.pets[petId];
  if (!pet) return fail("Unknown pet");
  const def = PET_BY_ID[pet.defId];
  if (!def) return fail("Unknown pet");
  const cost = petFeedCost(pet.level);
  if (!spendCurrency(state, "treats", cost)) return fail("Not enough treats");

  pet.happiness = Math.min(100, pet.happiness + 18);
  pet.fedAt = Date.now();
  const derived = derive(state);
  const gained = Math.ceil(12 * derived.mods.mul.petXp);
  return addPetXp(state, petId, gained);
}

export function addPetXp(state: GameState, petId: string, xp: number): ActionResult {
  const pet = state.pets[petId];
  if (!pet) return fail("Unknown pet");
  const def = PET_BY_ID[pet.defId];
  if (!def) return fail("Unknown pet");
  pet.xp += Math.max(0, xp);
  let levelled = 0;
  while (pet.level < def.maxLevel && pet.xp >= petXpFor(pet.level)) {
    pet.xp -= petXpFor(pet.level);
    pet.level += 1;
    levelled += 1;
  }
  if (levelled > 0) recordMetric(state, "petLevels", levelled);
  return done(levelled > 0 ? `${def.name} reached level ${pet.level}` : undefined);
}

export function evolvePet(state: GameState, petId: string): ActionResult {
  const pet = state.pets[petId];
  if (!pet) return fail("Unknown pet");
  const def = PET_BY_ID[pet.defId];
  if (!def?.evolvesTo || !def.evolveAt) return fail("This pet does not evolve");
  const target = PET_BY_ID[def.evolvesTo];
  if (!target) return fail("This pet does not evolve");
  if (pet.level < def.evolveAt.level) return fail(`Reach level ${def.evolveAt.level} first`);
  if (!spendCurrency(state, "shards", def.evolveAt.shards)) return fail("Not enough memory shards");

  pet.defId = target.id;
  pet.level = Math.max(1, Math.floor(pet.level * 0.6));
  pet.xp = 0;
  state.stats.petsEvolved += 1;
  recordMetric(state, "petsEvolved", 1);
  if (!state.petCodex.includes(target.id)) state.petCodex.push(target.id);
  pushLog(state, "Evolution", `${def.name} became ${target.name}`);
  return done(`${def.name} became ${target.name}`);
}

/** Fuse a sacrifice into a keeper, adding a star and some of its levels. */
export function fusePets(state: GameState, keepId: string, sacrificeId: string): ActionResult {
  const keep = state.pets[keepId];
  const sacrifice = state.pets[sacrificeId];
  if (!keep || !sacrifice) return fail("Pick two pets");
  if (keepId === sacrificeId) return fail("Pick two different pets");
  if (sacrifice.locked) return fail("That pet is locked");
  if (keep.stars >= 5) return fail("Already at five stars");
  const keepDef = PET_BY_ID[keep.defId];
  const sacDef = PET_BY_ID[sacrifice.defId];
  if (!keepDef || !sacDef) return fail("Unknown pet");
  if (RARITY_ORDER.indexOf(sacDef.rarity) < RARITY_ORDER.indexOf(keepDef.rarity) - 1) {
    return fail("The sacrifice is too far below the keeper");
  }
  const cost = 40 * (keep.stars + 1) * RARITY_META[keepDef.rarity].power;
  if (!spendCurrency(state, "shards", Math.ceil(cost))) return fail("Not enough memory shards");

  keep.stars += 1;
  delete state.pets[sacrificeId];
  for (const loadout of state.petLoadouts) {
    loadout.slots = loadout.slots.map((slot) => (slot === sacrificeId ? null : slot));
  }
  addPetXp(state, keepId, Math.floor(sacrifice.level * 30));
  state.stats.petsFused += 1;
  recordMetric(state, "petsFused", 1);
  return done(`${keepDef.name} is now ${keep.stars} star${keep.stars === 1 ? "" : "s"}`);
}

export function equipPet(state: GameState, slot: number, petId: string | null): ActionResult {
  const derived = derive(state);
  const loadout = state.petLoadouts[state.activeLoadout];
  if (!loadout) return fail("No loadout");
  if (slot < 0 || slot >= derived.petSlots) return fail("That slot is locked");
  while (loadout.slots.length < derived.petSlots) loadout.slots.push(null);
  if (petId && loadout.slots.includes(petId)) {
    loadout.slots = loadout.slots.map((s) => (s === petId ? null : s));
  }
  loadout.slots[slot] = petId;
  return done();
}

export function releasePet(state: GameState, petId: string): ActionResult {
  const pet = state.pets[petId];
  if (!pet) return fail("Unknown pet");
  if (pet.locked) return fail("That pet is locked");
  const def = PET_BY_ID[pet.defId];
  delete state.pets[petId];
  for (const loadout of state.petLoadouts) {
    loadout.slots = loadout.slots.map((s) => (s === petId ? null : s));
  }
  const value = Math.ceil(RARITY_META[def?.rarity ?? "common"].power * 20 * (1 + pet.level * 0.1));
  addCurrency(state, "treats", value);
  addCurrency(state, "shards", Math.ceil(value / 12));
  return done(`Released for ${value} treats`);
}

export function sendExpedition(state: GameState, petId: string, kind: string, now: number): ActionResult {
  const pet = state.pets[petId];
  if (!pet) return fail("Unknown pet");
  if (pet.expedition) return fail("Already away");
  const durations: Record<string, number> = { short: 15 * 60_000, long: 60 * 60_000, deep: 4 * 3_600_000 };
  const ms = durations[kind];
  if (!ms) return fail("Unknown expedition");
  pet.expedition = { kind, endsAt: now + ms };
  return done("Off they go");
}

export function collectExpedition(state: GameState, petId: string, now: number): ActionResult {
  const pet = state.pets[petId];
  if (!pet?.expedition) return fail("Not on an expedition");
  if (pet.expedition.endsAt > now) return fail("Still away");
  const def = PET_BY_ID[pet.defId];
  const hours = pet.expedition.kind === "short" ? 0.25 : pet.expedition.kind === "long" ? 1 : 4;
  const power = RARITY_META[def?.rarity ?? "common"].power;
  pet.expedition = null;

  const derived = derive(state, now);
  const treats = Math.ceil(20 * hours * power);
  const fragments = Math.ceil(30 * hours * power * derived.mods.mul.fragmentGain);
  const shards = Math.ceil(hours * power);
  addCurrency(state, "treats", treats);
  addCurrency(state, "fragments", fragments);
  addCurrency(state, "shards", shards);
  addPetXp(state, petId, Math.ceil(40 * hours * derived.mods.mul.petXp));
  const hearts = safe(derived.heartsPerSecond * hours * 3600 * 0.3);
  earnHearts(state, hearts, "pet");
  return done(`Back with ${treats} treats and ${fragments} fragments`);
}

/* ------------------------------------------------------------------ */
/* Charms                                                              */
/* ------------------------------------------------------------------ */

function rollAffixes(slot: CharmSlot, rarity: Rarity, level: number, luck: number) {
  const pool = AFFIXES.filter((a) => !a.slots || a.slots.includes(slot));
  const count = CHARM_RARITY[rarity].affixes;
  const chosen: typeof pool = [];
  const weights = pool.map((a) => a.weight);
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = weights.reduce((sum, w, index) => (chosen.includes(pool[index]) ? sum : sum + w), 0);
    let roll = Math.random() * total;
    for (let index = 0; index < pool.length; index++) {
      if (chosen.includes(pool[index])) continue;
      roll -= weights[index];
      if (roll <= 0) {
        chosen.push(pool[index]);
        break;
      }
    }
  }
  return chosen.map((affix) => ({
    stat: affix.stat,
    kind: affix.kind,
    value: charmAffixValue(affix, rarity, level, Math.min(1, Math.random() * (1 + luck))),
  }));
}

function charmName(slot: CharmSlot, rarity: Rarity, seed: string): string {
  const nouns = CHARM_NAMES[slot];
  const prefixes = CHARM_PREFIX[rarity];
  const a = Math.floor(seededRandom(`${seed}:n`) * nouns.length);
  const b = Math.floor(seededRandom(`${seed}:p`) * prefixes.length);
  return `${prefixes[b]} ${nouns[a]}`;
}

export interface CraftResult extends ActionResult {
  charm?: CharmInstance;
}

export function craftCharm(state: GameState, slot: CharmSlot, rarity: Rarity): CraftResult {
  if (!hasFlag(state, "charms")) return fail("Charms are a rebirth upgrade");
  const derived = derive(state);
  const cost = Math.ceil(CRAFT_COST[rarity] * derived.costMultiplier);
  if (!spendCurrency(state, "fragments", cost)) return fail("Not enough charm fragments");

  const id = crypto.randomUUID();
  const charm: CharmInstance = {
    id,
    defId: `${slot}_${rarity}`,
    slot,
    rarity,
    level: 0,
    affixes: rollAffixes(slot, rarity, 0, derived.luck),
    locked: false,
    createdAt: Date.now(),
  };
  state.charms[id] = charm;
  state.stats.charmsCrafted += 1;
  recordMetric(state, "charmsCrafted", 1);
  return { ok: true, charm, message: charmName(slot, rarity, id) };
}

export function enhanceCharm(state: GameState, charmId: string): ActionResult {
  const charm = state.charms[charmId];
  if (!charm) return fail("Unknown charm");
  if (charm.level >= 20) return fail("Already at maximum");
  const cost = enhanceCost(charm.rarity, charm.level);
  if (!spendCurrency(state, "dust", cost)) return fail("Not enough love dust");
  const before = charm.level;
  charm.level += 1;
  // Affix values scale with level, so rescale what was already rolled.
  const scale = (1 + charm.level * 0.12) / (1 + before * 0.12);
  charm.affixes = charm.affixes.map((a) => ({ ...a, value: a.value * scale }));
  return done(`Enhanced to level ${charm.level}`);
}

export function rerollCharm(state: GameState, charmId: string): ActionResult {
  const charm = state.charms[charmId];
  if (!charm) return fail("Unknown charm");
  if (charm.locked) return fail("That charm is locked");
  const cost = rerollCost(charm.rarity);
  if (!spendCurrency(state, "dust", cost)) return fail("Not enough love dust");
  const derived = derive(state);
  charm.affixes = rollAffixes(charm.slot, charm.rarity, charm.level, derived.luck);
  return done("Rerolled");
}

export function salvageCharm(state: GameState, charmId: string): ActionResult {
  const charm = state.charms[charmId];
  if (!charm) return fail("Unknown charm");
  if (charm.locked) return fail("That charm is locked");
  const value = salvageValue(charm.rarity, charm.level);
  delete state.charms[charmId];
  for (const [slot, id] of Object.entries(state.equipped)) {
    if (id === charmId) state.equipped[slot as CharmSlot] = null;
  }
  addCurrency(state, "dust", value);
  state.stats.charmsSalvaged += 1;
  return done(`Salvaged for ${value} dust`);
}

export function fuseCharms(state: GameState, keepId: string, sacrificeId: string): ActionResult {
  const keep = state.charms[keepId];
  const sacrifice = state.charms[sacrificeId];
  if (!keep || !sacrifice) return fail("Pick two charms");
  if (keepId === sacrificeId) return fail("Pick two different charms");
  if (sacrifice.locked) return fail("That charm is locked");
  if (sacrifice.rarity !== keep.rarity) return fail("Both charms must be the same rarity");
  const index = RARITY_ORDER.indexOf(keep.rarity);
  if (index >= RARITY_ORDER.length - 1) return fail("Already at the top rarity");

  const cost = CRAFT_COST[keep.rarity];
  if (!spendCurrency(state, "fragments", cost)) return fail("Not enough charm fragments");
  const next = RARITY_ORDER[index + 1];
  keep.rarity = next;
  const derived = derive(state);
  keep.affixes = rollAffixes(keep.slot, next, keep.level, derived.luck);
  delete state.charms[sacrificeId];
  for (const [slot, id] of Object.entries(state.equipped)) {
    if (id === sacrificeId) state.equipped[slot as CharmSlot] = null;
  }
  return done(`Fused into a ${next} charm`);
}

export function equipCharm(state: GameState, slot: CharmSlot, charmId: string | null): ActionResult {
  if (!hasFlag(state, "charms")) return fail("Charms are a rebirth upgrade");
  const slotDef = CHARM_SLOTS.find((s) => s.id === slot);
  if (!slotDef) return fail("Unknown slot");
  const derived = derive(state);
  const unlocked = state.lifetime.hearts >= slotDef.unlockLifetime
    || CHARM_SLOTS.indexOf(slotDef) < 2 + derived.mods.add.charmSlots;
  if (!unlocked) return fail("That slot is not unlocked yet");
  if (charmId) {
    const charm = state.charms[charmId];
    if (!charm) return fail("Unknown charm");
    if (charm.slot !== slot) return fail("That charm does not fit here");
  }
  state.equipped[slot] = charmId;
  return done();
}

/* ------------------------------------------------------------------ */
/* Worlds                                                              */
/* ------------------------------------------------------------------ */

export function unlockWorld(state: GameState, worldId: string): ActionResult {
  const world = WORLD_BY_ID[worldId];
  if (!world) return fail("Unknown world");
  if (state.worldsUnlocked.includes(worldId)) return fail("Already unlocked");
  if (worldId === "eternal_garden" && !hasFlag(state, "eternal_world")) {
    return fail("The Eternal Garden is an ascension upgrade");
  }
  if (state.lifetime.hearts < world.unlockLifetime) return fail("Not enough lifetime hearts yet");
  if (!spendCurrency(state, world.cost.currency, world.cost.amount)) return fail("Not enough to unlock that");
  state.worldsUnlocked.push(worldId);
  recordMetric(state, "worldsVisited", 1);
  // Each world hands over its jar skin.
  const skins: Record<string, string> = {
    rose_garden: "rose",
    candy_factory: "candy",
    crystal_cave: "crystal_jar",
    golden_palace: "golden_jar",
    starry_date: "starlit",
    cosmic_realm: "cosmic_jar",
    eternal_garden: "eternal_jar",
  };
  if (skins[worldId]) grantCollectible(state, "jar_skins", skins[worldId]);
  pushLog(state, "World", `Unlocked ${world.name}`);
  return done(`${world.name} is open`);
}

export function travelTo(state: GameState, worldId: string): ActionResult {
  if (!state.worldsUnlocked.includes(worldId)) return fail("Not unlocked yet");
  state.world = worldId;
  return done();
}

/* ------------------------------------------------------------------ */
/* Bosses                                                              */
/* ------------------------------------------------------------------ */

export function startBoss(state: GameState, bossId: string, now: number): ActionResult {
  if (!hasFlag(state, "bosses")) return fail("Boss hearts are a rebirth upgrade");
  const def = BOSS_BY_ID[bossId];
  if (!def) return fail("Unknown boss");
  if (state.activeBoss) return fail("A fight is already running");
  if (state.lifetime.hearts < def.unlockLifetime) return fail("Not ready for that one yet");

  const record = state.bosses[bossId] ?? { defeated: 0, bestMs: null, tier: 1 };
  state.bosses[bossId] = record;
  const hp = bossHp(def, record.tier);
  state.activeBoss = {
    defId: bossId,
    tier: record.tier,
    hp,
    maxHp: hp,
    startedAt: now,
    endsAt: now + def.timeLimit * 1000,
    phase: 1,
    shielded: def.mechanic === "shield_phases",
    weakSpot: def.mechanic === "weak_spots"
      ? { x: 30 + Math.random() * 40, y: 30 + Math.random() * 40, expiresAt: now + 3_000 }
      : null,
    hitsThisPhase: 0,
  };
  return done(`${def.name}, tier ${record.tier}`);
}

export interface BossHit {
  damage: number;
  blocked: boolean;
  defeated: boolean;
  failed: boolean;
  critical: boolean;
}

export function hitBoss(
  state: GameState,
  now: number,
  options: { crit: boolean; onWeakSpot: boolean; combo: number },
): BossHit {
  const fight = state.activeBoss;
  if (!fight) return { damage: 0, blocked: false, defeated: false, failed: false, critical: false };
  const def = BOSS_BY_ID[fight.defId];
  if (!def) return { damage: 0, blocked: false, defeated: false, failed: false, critical: false };

  const derived = derive(state, now);
  let damage = derived.heartsPerClick * derived.bossDamage;
  let blocked = false;

  fight.hitsThisPhase += 1;

  switch (def.mechanic) {
    case "shield_phases":
      if (fight.shielded && !options.crit) {
        blocked = true;
        damage = 0;
      }
      if (fight.hitsThisPhase % 12 === 0) fight.shielded = !fight.shielded;
      break;
    case "weak_spots":
      if (!options.onWeakSpot) damage *= 0.15;
      else damage *= 3;
      if (!fight.weakSpot || fight.weakSpot.expiresAt < now) {
        fight.weakSpot = { x: 20 + Math.random() * 60, y: 25 + Math.random() * 50, expiresAt: now + 2_500 };
      }
      break;
    case "timed_phases": {
      // Open for two seconds out of every three.
      const cycle = (now - fight.startedAt) % 3_000;
      if (cycle > 2_000) {
        blocked = true;
        damage = 0;
      }
      break;
    }
    case "combo_gate":
      if (options.combo < 25) {
        blocked = true;
        damage = 0;
      }
      break;
    case "critical_windows":
      if (fight.hitsThisPhase % 5 === 0 && options.crit) damage *= 10;
      break;
    case "mimic":
      // Punishes metronomic tapping by shaving the combo.
      if (fight.hitsThisPhase % 7 === 0) {
        state.combo = Math.floor(state.combo * 0.7);
        damage *= 0.5;
      }
      break;
    case "regenerating":
      fight.hp = Math.min(fight.maxHp, fight.hp + fight.maxHp * 0.004);
      break;
    default:
      break;
  }

  if (options.crit) damage *= derived.critMultiplier * 0.5;
  fight.hp = Math.max(0, fight.hp - damage);

  if (fight.hp <= 0) {
    defeatBoss(state, now);
    return { damage, blocked, defeated: true, failed: false, critical: options.crit };
  }
  if (now > fight.endsAt) {
    state.activeBoss = null;
    return { damage, blocked, defeated: false, failed: true, critical: options.crit };
  }
  return { damage, blocked, defeated: false, failed: false, critical: options.crit };
}

function defeatBoss(state: GameState, now: number): void {
  const fight = state.activeBoss;
  if (!fight) return;
  const def = BOSS_BY_ID[fight.defId];
  state.activeBoss = null;
  if (!def) return;

  const record = state.bosses[fight.defId] ?? { defeated: 0, bestMs: null, tier: 1 };
  const elapsed = now - fight.startedAt;
  const first = record.defeated === 0;
  record.defeated += 1;
  record.bestMs = record.bestMs === null ? elapsed : Math.min(record.bestMs, elapsed);
  record.tier = Math.max(record.tier, fight.tier + 1);
  state.bosses[fight.defId] = record;

  state.stats.bossesDefeated += 1;
  recordMetric(state, "bosses", 1);

  const derived = derive(state, now);
  const hearts = safe(fight.maxHp * 0.5 * derived.mods.mul.bossReward);
  earnHearts(state, hearts, "boss");

  if (first) {
    grantReward(state, def.firstClear);
    if (def.firstClear.title) grantTitle(state, def.firstClear.title);
    const trophies: Record<string, string> = {
      stone_heart: "t_stone", frozen_heart: "t_frozen", mimic_jar: "t_mimic",
      broken_clock_heart: "t_clock", golden_heart_king: "t_king", jealousy_shadow: "t_shadow",
      memory_guardian: "t_guardian", heart_dragon: "t_dragon", cosmic_heart: "t_cosmic",
      eternal_heart: "t_eternal",
    };
    if (trophies[def.id]) grantCollectible(state, "trophies", trophies[def.id]);
    if (def.id === "frozen_heart") grantCollectible(state, "heart_designs", "crystal");
    if (def.id === "golden_heart_king") grantCollectible(state, "heart_designs", "golden");
    if (def.id === "broken_clock_heart") grantCollectible(state, "heart_designs", "clockwork");
    if (def.id === "cosmic_heart") grantCollectible(state, "heart_designs", "cosmic");
  } else {
    grantReward(state, def.repeat, 1 + Math.min(4, record.tier * 0.1));
  }
  pushLog(state, "Boss", `${def.name} tier ${fight.tier} in ${(elapsed / 1000).toFixed(1)}s`);
}

export function fleeBoss(state: GameState): ActionResult {
  if (!state.activeBoss) return fail("No fight running");
  state.activeBoss = null;
  return done("Left the fight");
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

/** Regenerate the mission board for a new day, week or month. */
export function refreshMissions(state: GameState, day: string, week: string, month: string): void {
  const keep = state.missions.filter((m) => {
    const def = MISSION_BY_ID[m.defId];
    if (!def) return false;
    if (def.period === "daily") return m.period === day;
    if (def.period === "weekly") return m.period === week;
    if (def.period === "monthly") return m.period === month;
    return true; // story and mastery never expire
  });

  const has = (period: MissionPeriod) =>
    keep.some((m) => MISSION_BY_ID[m.defId]?.period === period);

  const next = [...keep];

  if (!has("daily")) {
    for (const def of pick(MISSIONS.filter((m) => m.period === "daily"), 4, `daily:${day}`)) {
      next.push({ id: crypto.randomUUID(), defId: def.id, goal: goalFor(def.id, state), progress: 0, claimed: false, period: day, rerolled: false });
    }
  }
  if (!has("weekly")) {
    for (const def of pick(MISSIONS.filter((m) => m.period === "weekly"), 3, `weekly:${week}`)) {
      next.push({ id: crypto.randomUUID(), defId: def.id, goal: goalFor(def.id, state), progress: 0, claimed: false, period: week, rerolled: false });
    }
  }
  if (!has("monthly")) {
    for (const def of pick(MISSIONS.filter((m) => m.period === "monthly"), 2, `monthly:${month}`)) {
      next.push({ id: crypto.randomUUID(), defId: def.id, goal: goalFor(def.id, state), progress: 0, claimed: false, period: month, rerolled: false });
    }
  }

  // Story missions appear one at a time, in order.
  const storyDefs = MISSIONS.filter((m) => m.period === "story").sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  const activeStory = next.find((m) => MISSION_BY_ID[m.defId]?.period === "story" && !m.claimed);
  if (!activeStory) {
    const doneIds = new Set(Object.keys(state.storyProgress));
    const nextStory = storyDefs.find((d) => !doneIds.has(d.id));
    if (nextStory) {
      next.push({ id: crypto.randomUUID(), defId: nextStory.id, goal: goalFor(nextStory.id, state), progress: 0, claimed: false, period: "story", rerolled: false });
    }
  }

  // Mastery missions are all present from the start and never expire.
  for (const def of MISSIONS.filter((m) => m.period === "mastery")) {
    if (!next.some((m) => m.defId === def.id)) {
      next.push({ id: crypto.randomUUID(), defId: def.id, goal: goalFor(def.id, state), progress: 0, claimed: false, period: "mastery", rerolled: false });
    }
  }

  state.missions = next;
}

export function claimMission(state: GameState, missionId: string): ActionResult {
  const mission = state.missions.find((m) => m.id === missionId);
  if (!mission) return fail("Unknown mission");
  const def = MISSION_BY_ID[mission.defId];
  if (!def) return fail("Unknown mission");
  if (mission.claimed) return fail("Already claimed");
  const progress = def.metric === "bestCombo" || def.period === "mastery" || def.period === "story"
    ? Math.max(mission.progress, metricForMission(state, def.metric))
    : mission.progress;
  if (progress < mission.goal) return fail("Not finished yet");

  mission.claimed = true;
  const derived = derive(state);
  grantReward(state, def.reward, derived.mods.mul.missionReward);
  state.stats.missionsCompleted += 1;
  if (def.period === "story") state.storyProgress[def.id] = 1;
  pushLog(state, "Mission", def.name);
  return done(def.name);
}

function metricForMission(state: GameState, metric: MetricId): number {
  // Story and mastery missions measure lifetime totals rather than deltas.
  return metricTotal(state, metric);
}

export function rerollMission(state: GameState, missionId: string, day: string): ActionResult {
  const mission = state.missions.find((m) => m.id === missionId);
  if (!mission) return fail("Unknown mission");
  const def = MISSION_BY_ID[mission.defId];
  if (!def || def.period !== "daily") return fail("Only daily missions can be rerolled");
  if (mission.rerolled) return fail("Already rerolled today");
  const derived = derive(state);
  const cost = Math.ceil(8 * derived.costMultiplier);
  if (!spendCurrency(state, "golden", cost)) return fail("Not enough golden hearts");

  const taken = new Set(state.missions.map((m) => m.defId));
  const pool = MISSIONS.filter((m) => m.period === "daily" && !taken.has(m.id));
  if (pool.length === 0) return fail("No other daily missions available");
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
  if (!hasFlag(state, "challenges")) return fail("Challenges are a rebirth upgrade");
  const def = CHALLENGE_BY_ID[id];
  if (!def) return fail("Unknown challenge");
  if (state.activeChallenge) return fail("Already in a challenge");
  if (state.lifetime.hearts < def.unlockLifetime) return fail("Not unlocked yet");
  if (def.requiresRebirths && state.rebirths < def.requiresRebirths) {
    return fail(`Requires ${def.requiresRebirths} rebirths`);
  }

  // A challenge run is a sandbox: the current run is stored and put back when
  // the challenge finishes, so entering one never costs you progress.
  const snapshot = JSON.stringify({
    upgrades: state.upgrades,
    wallet: state.wallet,
    runHearts: state.runHearts,
    runStartedAt: state.runStartedAt,
    combo: state.combo,
    world: state.world,
  });

  state.activeChallenge = {
    defId: id,
    startedAt: now,
    endsAt: def.timeLimit ? now + def.timeLimit * 1000 : null,
    score: 0,
    restore: snapshot,
  };

  // Start from nothing, which is what makes the restriction mean something.
  state.upgrades = {};
  state.wallet.hearts = 0;
  state.runHearts = 0;
  state.combo = 0;
  state.comboExpiresAt = 0;
  return done(def.name);
}

export interface ChallengeOutcome extends ActionResult {
  cleared?: boolean;
  first?: boolean;
}

export function finishChallenge(state: GameState, now: number, forceAbandon = false): ChallengeOutcome {
  const run = state.activeChallenge;
  if (!run) return fail("No challenge running");
  const def = CHALLENGE_BY_ID[run.defId];
  state.activeChallenge = null;

  // Restore the run that was put aside.
  if (run.restore) {
    try {
      const snapshot = JSON.parse(run.restore) as Partial<GameState>;
      Object.assign(state, snapshot);
    } catch {
      // A corrupt snapshot should not lose the save; the player keeps
      // whatever the challenge produced instead.
    }
  }
  if (!def) return done();

  const cleared = !forceAbandon && run.score >= def.goal.amount;
  if (!cleared) return done(forceAbandon ? "Challenge abandoned" : "Challenge failed");

  const record = state.challenges[def.id] ?? { completed: 0, best: 0 };
  const first = record.completed === 0;
  record.completed += 1;
  record.best = Math.max(record.best, run.score);
  state.challenges[def.id] = record;
  state.stats.challengesCompleted += 1;
  recordMetric(state, "challenges", 1);

  grantReward(state, first ? def.reward : (def.repeatReward ?? def.reward));
  if (first && def.reward.title) grantTitle(state, def.reward.title);
  if (first && def.reward.collectible) {
    grantCollectible(state, def.reward.collectible[0], def.reward.collectible[1]);
  }
  pushLog(state, "Challenge", `${def.name} cleared`);
  return { ok: true, cleared: true, first, message: `${def.name} cleared` };
}

/* ------------------------------------------------------------------ */
/* Reset layers                                                        */
/* ------------------------------------------------------------------ */

export function canRebirth(state: GameState): boolean {
  return state.runHearts >= REBIRTH_REQUIREMENT;
}

export function rebirthPreview(state: GameState): number {
  const derived = derive(state);
  return rebirthTokens(state, derived.mods.mul.tokenGain);
}

export function doRebirth(state: GameState, now: number): ActionResult {
  if (!canRebirth(state)) return fail("Not enough hearts in this run yet");
  const tokens = rebirthPreview(state);
  if (tokens <= 0) return fail("This run would not pay anything");

  const elapsed = now - state.runStartedAt;
  state.stats.fastestRebirthMs = state.stats.fastestRebirthMs === null
    ? elapsed
    : Math.min(state.stats.fastestRebirthMs, elapsed);

  addCurrency(state, "tokens", tokens);
  state.rebirths += 1;
  recordMetric(state, "rebirths", 1);

  // Keep a share of normal upgrade levels if the tree paid for it.
  const derived = derive(state);
  const keepLevels = Math.floor(derived.mods.add.startingUpgrades);
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
  state.heat = 0;
  state.focus = 0;
  state.energy = 0;
  state.buffs = [];
  state.floating = [];
  state.activeBoss = null;
  state.world = "bedroom";

  pushLog(state, "Rebirth", `${tokens} rebirth tokens`);
  return done(`Rebirth ${state.rebirths}: ${tokens} tokens`);
}

export function canAscend(state: GameState): boolean {
  return hasFlag(state, "ascension") && state.eraHearts >= ASCENSION_REQUIREMENT;
}

export function ascensionPreview(state: GameState): number {
  const derived = derive(state);
  return ascensionCrystals(state, derived.mods.mul.crystalGain);
}

export function doAscend(state: GameState, now: number): ActionResult {
  if (!hasFlag(state, "ascension")) return fail("Ascension is a rebirth upgrade");
  if (!canAscend(state)) return fail("Not enough hearts in this era yet");
  const crystals = ascensionPreview(state);
  if (crystals <= 0) return fail("This era would not pay anything");

  const elapsed = now - state.eraStartedAt;
  state.stats.fastestAscensionMs = state.stats.fastestAscensionMs === null
    ? elapsed
    : Math.min(state.stats.fastestAscensionMs, elapsed);

  addCurrency(state, "crystals", crystals);
  if (hasFlag(state, "eternal")) {
    addCurrency(state, "eternal", Math.max(1, Math.floor(crystals / 10)));
  }
  state.ascensions += 1;
  recordMetric(state, "ascensions", 1);

  const keepPets = hasFlag(state, "pet_retention");
  const keepCharms = hasFlag(state, "charm_retention");

  state.upgrades = {};
  state.rebirthUpgrades = {};
  state.wallet.hearts = 0;
  state.wallet.tokens = 0;
  state.runHearts = 0;
  state.eraHearts = 0;
  state.rebirths = 0;
  state.runStartedAt = now;
  state.eraStartedAt = now;
  state.combo = 0;
  state.comboExpiresAt = 0;
  state.buffs = [];
  state.floating = [];
  state.activeBoss = null;
  state.activeChallenge = null;
  state.world = "bedroom";
  state.worldsUnlocked = ["bedroom"];

  if (!keepPets) {
    for (const pet of Object.values(state.pets)) {
      pet.level = 1;
      pet.xp = 0;
    }
  }
  if (!keepCharms) {
    state.charms = {};
    state.equipped = {};
  }

  pushLog(state, "Ascension", `${crystals} ascension crystals`);
  return done(`Ascension ${state.ascensions}: ${crystals} crystals`);
}

export function buyResetUpgrade(state: GameState, id: string): ActionResult {
  const def = RESET_UPGRADE_BY_ID[id];
  if (!def) return fail("Unknown upgrade");
  const isRebirth = REBIRTH_UPGRADES.some((u) => u.id === id);
  const owned = (isRebirth ? state.rebirthUpgrades : state.ascensionUpgrades)[id] ?? 0;
  if (owned >= def.max) return fail("Already at maximum");
  if (def.requires) {
    const [reqId, reqLevel] = def.requires;
    const reqOwned = (isRebirth ? state.rebirthUpgrades : state.ascensionUpgrades)[reqId] ?? 0;
    if (reqOwned < reqLevel) {
      return fail(`Requires ${RESET_UPGRADE_BY_ID[reqId]?.name ?? reqId} level ${reqLevel}`);
    }
  }
  const cost = resetUpgradeCost(def, owned);
  if (!spendCurrency(state, def.currency, cost)) return fail(`Not enough ${def.currency}`);
  if (isRebirth) state.rebirthUpgrades[id] = owned + 1;
  else state.ascensionUpgrades[id] = owned + 1;
  return done(`${def.name} level ${owned + 1}`);
}

export function respec(state: GameState, layer: "rebirth" | "ascension"): ActionResult {
  const defs = layer === "rebirth" ? REBIRTH_UPGRADES : ASCENSION_UPGRADES;
  const levels = layer === "rebirth" ? state.rebirthUpgrades : state.ascensionUpgrades;
  let refund = 0;
  for (const def of defs) {
    const owned = levels[def.id] ?? 0;
    for (let i = 0; i < owned; i++) refund += resetUpgradeCost(def, i);
  }
  if (refund <= 0) return fail("Nothing to refund");
  if (layer === "rebirth") state.rebirthUpgrades = {};
  else state.ascensionUpgrades = {};
  addCurrency(state, layer === "rebirth" ? "tokens" : "crystals", Math.floor(refund * 0.9));
  return done(`Refunded ${Math.floor(refund * 0.9)}`);
}

/* ------------------------------------------------------------------ */
/* Shop                                                                */
/* ------------------------------------------------------------------ */

export function buyShopItem(state: GameState, id: string, now: number): ActionResult {
  const def = SHOP_BY_ID[id];
  if (!def) return fail("Unknown item");
  if (def.once && state.shopPurchases.includes(id)) return fail("Already owned");
  if (def.unlockLifetime && state.lifetime.hearts < def.unlockLifetime) return fail("Not unlocked yet");

  const derived = derive(state, now);
  const paid: [CurrencyId, number][] = [];
  for (const [currency, amount] of Object.entries(def.cost)) {
    const price = Math.ceil((amount as number) * (currency === "hearts" ? derived.costMultiplier : 1));
    if (state.wallet[currency as CurrencyId] < price) {
      // Put back anything already taken.
      for (const [c, a] of paid) addCurrency(state, c, a);
      return fail("Not enough to buy that");
    }
    spendCurrency(state, currency as CurrencyId, price);
    paid.push([currency as CurrencyId, price]);
  }

  if (def.once) state.shopPurchases.push(id);

  switch (def.effect.kind) {
    case "collectible":
      grantCollectible(state, def.effect.collection, def.effect.item);
      break;
    case "egg":
      state.eggs[def.effect.egg] = (state.eggs[def.effect.egg] ?? 0) + def.effect.count;
      break;
    case "currency":
      addCurrency(state, def.effect.currency, def.effect.amount);
      break;
    case "boost":
      state.buffs.push({
        id: crypto.randomUUID(),
        source: `shop:${id}`,
        label: def.effect.label,
        mods: def.effect.mods,
        expiresAt: now + def.effect.durationMs,
      });
      break;
    case "respec":
      return respec(state, def.effect.layer);
    case "reroll":
      return done("Use it on a daily mission");
    default:
      break;
  }
  return done(def.name);
}

/* ------------------------------------------------------------------ */
/* Partner rewards from the rest of the app                            */
/* ------------------------------------------------------------------ */

export type PartnerAction =
  | "question_answered"
  | "message_sent"
  | "memory_added"
  | "drawing_shared"
  | "letter_sent"
  | "mood_shared"
  | "plan_made"
  | "streak_day"
  | "anniversary";

const PARTNER_REWARDS: Record<PartnerAction, { bond: number; label: string; perDay: number }> = {
  question_answered: { bond: 8, label: "Answered the daily question", perDay: 1 },
  message_sent: { bond: 2, label: "Sent a message", perDay: 3 },
  memory_added: { bond: 6, label: "Added a shared memory", perDay: 2 },
  drawing_shared: { bond: 5, label: "Shared a drawing", perDay: 2 },
  letter_sent: { bond: 6, label: "Wrote a letter", perDay: 2 },
  mood_shared: { bond: 3, label: "Shared how you are", perDay: 2 },
  plan_made: { bond: 4, label: "Made a plan together", perDay: 2 },
  streak_day: { bond: 10, label: "Kept your streak", perDay: 1 },
  anniversary: { bond: 40, label: "An anniversary", perDay: 1 },
};

/**
 * Grant the small bonus that comes from using the rest of the app.
 *
 * Each action is capped per day so there is never a reason to send filler
 * messages or fake activity, and nothing here is required to progress: the
 * partner tree is one of eleven, and it is optional.
 */
export function grantPartnerReward(
  state: GameState,
  action: PartnerAction,
  day: string,
  now: number,
): ActionResult {
  const rule = PARTNER_REWARDS[action];
  if (!rule) return fail("Unknown action");
  if (state.partnerRewards.day !== day) {
    state.partnerRewards = { day, claimed: [] };
  }
  const used = state.partnerRewards.claimed.filter((c) => c.startsWith(action)).length;
  if (used >= rule.perDay) return fail("Already counted today");

  state.partnerRewards.claimed.push(`${action}:${used}`);
  const derived = derive(state, now);
  const bond = Math.max(1, Math.round(rule.bond * derived.mods.mul.bondGain));
  addCurrency(state, "bond", bond);

  const hearts = safe(Math.max(500, derived.heartsPerSecond * 120));
  earnHearts(state, hearts, "partner");
  state.storyProgress["partner"] = (state.storyProgress["partner"] ?? 0) + 1;
  if (action === "question_answered") {
    state.storyProgress["questions"] = (state.storyProgress["questions"] ?? 0) + 1;
    recordMetric(state, "questionAnswered", 1);
  }
  recordMetric(state, "partnerActions", 1);
  pushLog(state, "Together", `${rule.label}: +${bond} bond`);
  return done(`${rule.label}: +${bond} bond energy`);
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export function syncEvents(state: GameState, now: Date, anniversary: string | null): void {
  for (const event of activeEvents(now, anniversary)) {
    if (!state.events[event.id]) {
      state.events[event.id] = { progress: 0, claimed: [], currency: 0 };
    }
  }
}

export function claimEventShopItem(state: GameState, eventId: string, itemId: string): ActionResult {
  const event = EVENT_BY_ID[eventId];
  if (!event) return fail("Unknown event");
  const item = event.shop.find((s) => s.id === itemId);
  if (!item) return fail("Unknown item");
  const progress = state.events[eventId] ?? { progress: 0, claimed: [], currency: 0 };
  if (progress.claimed.includes(itemId)) return fail("Already bought");
  if (!spendCurrency(state, "event", item.cost)) return fail("Not enough event tokens");
  progress.claimed.push(itemId);
  state.events[eventId] = progress;
  grantReward(state, item.effect);
  return done(item.name);
}

/* ------------------------------------------------------------------ */
/* Legacy migration                                                    */
/* ------------------------------------------------------------------ */

/**
 * Fold the old love jar into the new game. Called once per person after the
 * server confirms the tap count, which it also records so it cannot be
 * claimed twice.
 */
export function applyLegacy(state: GameState, taps: number): void {
  if (state.legacyClaimed) return;
  state.legacyClaimed = true;
  if (taps > 0) {
    earnHearts(state, taps, "click");
    state.stats.totalClicks += taps;
    grantCollectible(state, "jar_skins", "founding");
    grantTitle(state, "Founding Jar");
    pushLog(state, "Legacy", `${taps} hearts carried over from the old jar`);
  }
}

/** A completely fresh save, used when a device signs into a new account. */
export function freshState(): GameState {
  return createGameState();
}
