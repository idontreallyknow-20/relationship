import type {
  Buff, CurrencyId, Derived, Drifter, GameState, Settled,
} from "./types";
import { creaturesInJar, derive, fedFactor, hasFlag, heldHands } from "./formulas";
import { safe } from "./numbers";
import { CHALLENGE_BY_ID, MISSION_BY_ID, type MetricId } from "./config/objectives";
import { ACHIEVEMENTS } from "./config/awards";
import { CREATURE_BY_ID, actionInterval, creatureScale, xpFor } from "./config/creatures";
import { DRIFTERS, DRIFTER_BY_ID, VESSEL_BY_ID } from "./config/vessels";
import { DEPTHS } from "./config/depths";
import { EGG_BY_ID } from "./config/eggs";
import { SKILL_BY_ID } from "./config/skills";

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

export type HeartSource =
  | "click" | "charge" | "crit" | "passive" | "creature" | "skill"
  | "offline" | "together" | "drifter";

const STAT_FOR_SOURCE: Partial<Record<HeartSource, keyof GameState["stats"]>> = {
  click: "heartsFromClicks",
  charge: "heartsFromClicks",
  crit: "heartsFromCrits",
  passive: "heartsFromPassive",
  creature: "heartsFromCreatures",
  skill: "heartsFromSkills",
  offline: "heartsFromOffline",
  together: "heartsFromTogether",
  drifter: "heartsFromDrifters",
};

export function addCurrency(state: GameState, currency: CurrencyId, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.wallet[currency] = safe(state.wallet[currency] + amount);
  state.lifetime[currency] = safe(state.lifetime[currency] + amount);
}

export function spendCurrency(state: GameState, currency: CurrencyId, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false;
  if (state.wallet[currency] < amount) return false;
  state.wallet[currency] = safe(state.wallet[currency] - amount);
  return true;
}

export function earnHearts(state: GameState, amount: number, source: HeartSource): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const value = safe(amount);
  addCurrency(state, "hearts", value);
  state.runHearts = safe(state.runHearts + value);
  state.eraHearts = safe(state.eraHearts + value);
  state.seaHearts = safe(state.seaHearts + value);
  state.stats.sessionHearts = safe(state.stats.sessionHearts + value);

  const key = STAT_FOR_SOURCE[source];
  if (key) (state.stats[key] as number) = safe((state.stats[key] as number) + value);
  // A critical is a tap too, so it shows in both breakdowns.
  if (source === "crit") {
    state.stats.heartsFromClicks = safe(state.stats.heartsFromClicks + value);
  }

  recordMetric(state, "hearts", value);
  if (source === "click" || source === "charge" || source === "crit") {
    recordMetric(state, "heartsFromClicks", value);
  }
  if (source === "passive" || source === "creature") recordMetric(state, "heartsFromPassive", value);
  if (source === "creature") recordMetric(state, "heartsFromCreatures", value);
  if (source === "skill") recordMetric(state, "heartsFromSkills", value);
  return value;
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

export function recordMetric(state: GameState, metric: MetricId, value: number, mode: "add" | "max" = "add"): void {
  if (!Number.isFinite(value) || value <= 0) return;

  for (const mission of state.missions) {
    const def = MISSION_BY_ID[mission.defId];
    if (!def || def.metric !== metric || mission.claimed) continue;
    mission.progress = mode === "max" ? Math.max(mission.progress, value) : safe(mission.progress + value);
  }

  if (state.activeChallenge) {
    const def = CHALLENGE_BY_ID[state.activeChallenge.defId];
    if (def && def.goal.metric === metric) {
      state.activeChallenge.score = mode === "max"
        ? Math.max(state.activeChallenge.score, value)
        : safe(state.activeChallenge.score + value);
    }
  }
}

export function metricTotal(state: GameState, metric: MetricId): number {
  const s = state.stats;
  switch (metric) {
    case "clicks": return s.totalClicks;
    case "criticals": return s.criticalClicks;
    case "megaCriticals": return s.megaCriticalClicks;
    case "perfectClicks": return s.perfectClicks;
    case "chargedClicks": return s.chargedClicks;
    case "hearts": return state.lifetime.hearts;
    case "heartsFromClicks": return s.heartsFromClicks;
    case "heartsFromPassive": return s.heartsFromPassive;
    case "heartsFromSkills": return s.heartsFromSkills;
    case "heartsFromCreatures": return s.heartsFromCreatures;
    case "bestCombo": return s.bestCombo;
    case "comboFinishers": return s.comboFinishers;
    case "cracks": return s.cracks;
    case "collects": return s.collects;
    case "driftersOpened": return s.driftersOpened;
    case "upgrades": return s.upgradesBought;
    case "skillsUsed": return s.skillsUsed;
    case "creaturesArrived": return state.codex.length;
    case "creaturesEvolved": return s.creaturesEvolved;
    case "creatureLevels": return Object.values(state.creatures).reduce((sum, c) => sum + c.level - 1, 0);
    case "itemsMade": return s.itemsMade;
    case "vessels": return state.vesselsUnlocked.length;
    case "challenges": return s.challengesCompleted;
    case "minigames": return s.minigamesPlayed;
    case "tideChanges": return state.tideChanges;
    case "newWaters": return state.newWaters;
    case "offlineClaims": return state.storyProgress["offline"] ?? 0;
    case "questionAnswered": return state.storyProgress["questions"] ?? 0;
    case "togetherActions": return state.storyProgress["together"] ?? 0;
    case "sameEvening": return state.storyProgress["evenings"] ?? 0;
    case "depthsBought": return state.depths.reduce((sum, d) => sum + d.bought, 0);
    case "deepens": return state.deepens;
    case "tideBought": return state.tideBought;
    case "seas": return state.seas;
    default: return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Buffs                                                               */
/* ------------------------------------------------------------------ */

export function addBuff(state: GameState, buff: Omit<Buff, "id">): void {
  const existing = state.buffs.find((b) => b.source === buff.source);
  if (existing) {
    existing.expiresAt = Math.max(existing.expiresAt, buff.expiresAt);
    existing.mods = buff.mods;
    existing.label = buff.label;
    return;
  }
  state.buffs.push({ ...buff, id: crypto.randomUUID() });
}

/* ------------------------------------------------------------------ */
/* Clicking                                                            */
/* ------------------------------------------------------------------ */

export interface ClickOptions {
  /** 0..1 inside the timing ring; 1 is dead centre. */
  precision: number;
  /** 0..1 held before release. At 1 the tap becomes a charged drop. */
  charge: number;
  now: number;
  x: number;
  y: number;
}

export interface ClickOutcome {
  hearts: number;
  crit: boolean;
  mega: boolean;
  perfect: boolean;
  charged: boolean;
  chained: number;
  combo: number;
  comboBroken: boolean;
  dropped: Settled | null;
}

/** A charged tap counts as this many combo steps instead of one. */
export const CHARGE_COMBO_STEPS = 5;
/** Held at least this far counts as charged. */
export const CHARGE_THRESHOLD = 0.85;

/**
 * One tap.
 *
 * Tapping is rate: many small hits, fast combo growth. Charging is feeding:
 * one heavy hit that counts as five combo steps and drops a shell to the
 * floor for the crabs. Both are correct, at different moments, which is what
 * makes holding a decision rather than a trap.
 */
export function performClick(state: GameState, derived: Derived, opts: ClickOptions): ClickOutcome {
  const { now } = opts;
  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;
  const charged = opts.charge >= CHARGE_THRESHOLD;

  let comboBroken = false;
  if (state.comboExpiresAt > 0 && now > state.comboExpiresAt) {
    if (state.combo > 0 && derived.comboShield >= 1) {
      state.combo = Math.floor(state.combo * 0.5);
    } else {
      comboBroken = state.combo > 0;
      if (comboBroken && state.combo >= derived.comboCap) state.stats.comboFinishers += 1;
      state.combo = Math.floor(derived.mods.add.comboStart);
    }
  }

  const decay = challenge?.rule === "fast_decay" ? 0.25 : 1;
  const steps = charged ? CHARGE_COMBO_STEPS : 1;
  const gain = Math.max(1, Math.round(derived.mods.mul.comboGain)) * steps;
  state.combo = Math.min(derived.comboCap, state.combo + gain);
  state.comboExpiresAt = now + derived.comboDurationMs * decay;
  if (state.combo > state.stats.bestCombo) {
    state.stats.bestCombo = state.combo;
    recordMetric(state, "bestCombo", state.combo, "max");
  }

  state.stats.totalClicks += 1;
  recordMetric(state, "clicks", 1);

  const perfect = opts.precision >= 0.8;
  if (perfect) {
    state.stats.perfectClicks += 1;
    recordMetric(state, "perfectClicks", 1);
  }
  if (charged) {
    state.stats.chargedClicks += 1;
    recordMetric(state, "chargedClicks", 1);
  }

  const comboMultiplier = 1 + Math.min(state.combo, derived.comboCap) * 0.03 * derived.mods.mul.comboPower;
  let hearts = derived.mods.add.clickFlat * derived.mods.mul.click * derived.mods.mul.all * comboMultiplier;
  hearts *= 1 + opts.precision * 0.75;
  if (charged) hearts *= 1.6 * derived.chargePower;

  const noCrit = challenge?.rule === "no_crit";
  let crit = false;
  let mega = false;
  let chained = 0;

  if (!noCrit) {
    const chance = perfect ? Math.min(1, derived.critChance * 1.5) : derived.critChance;
    if (Math.random() < chance) {
      crit = true;
      hearts *= derived.critMultiplier;
      state.stats.criticalClicks += 1;
      recordMetric(state, "criticals", 1);
      if (Math.random() < derived.megaCritChance) {
        mega = true;
        hearts *= derived.megaCritMultiplier / derived.critMultiplier;
        state.stats.megaCriticalClicks += 1;
        recordMetric(state, "megaCriticals", 1);
      }
      let chainChance = derived.critChainChance;
      while (chainChance > 0 && Math.random() < chainChance && chained < 8) {
        chained += 1;
        hearts *= 1 + derived.critMultiplier * 0.35;
        chainChance *= 0.6;
      }
    }
  }

  if (challenge?.rule === "combo_only" && state.combo < 20) hearts = 0;
  if (challenge?.rule === "creatures_only") hearts = 0;
  if (challenge?.rule === "charge_only" && !charged) hearts = 0;

  // Overflow is a bonus, not waste.
  if (state.wallet.hearts > derived.capacity) hearts *= 1.2;

  const earned = earnHearts(state, hearts, crit ? "crit" : charged ? "charge" : "click");

  // The charged drop: a shell for the crabs, straight to the floor.
  let dropped: Settled | null = null;
  if (charged) {
    dropped = dropSettled(state, "shell", Math.max(1, earned * 0.15), opts.x, 0.15);
  }

  return {
    hearts: earned, crit, mega, perfect, charged, chained,
    combo: state.combo, comboBroken, dropped,
  };
}

/* ------------------------------------------------------------------ */
/* The floor                                                           */
/* ------------------------------------------------------------------ */

const MAX_SETTLED = 24;

export function dropSettled(
  state: GameState,
  kind: Settled["kind"],
  value: number,
  x: number,
  y = 0.05,
): Settled {
  const item: Settled = {
    id: crypto.randomUUID(),
    kind,
    x: Math.max(4, Math.min(96, x)),
    y,
    value: safe(value),
    droppedAt: Date.now(),
  };
  // Oldest falls out rather than letting the floor grow without bound.
  if (state.settled.length >= MAX_SETTLED) state.settled.shift();
  state.settled.push(item);
  return item;
}

export interface CollectResult {
  kind: Settled["kind"];
  hearts: number;
  currency: CurrencyId | null;
  amount: number;
}

/** A crab picking something up, or you tapping it yourself. */
export function collectSettled(
  state: GameState,
  derived: Derived,
  id: string,
  byCreature: boolean,
): CollectResult | null {
  const index = state.settled.findIndex((s) => s.id === id);
  if (index < 0) return null;
  const item = state.settled[index];
  state.settled.splice(index, 1);

  const value = item.value * derived.collectValue * (1 + derived.luck);
  state.stats.collects += 1;
  recordMetric(state, "collects", 1);

  const hearts = earnHearts(state, value, byCreature ? "creature" : "click");

  switch (item.kind) {
    case "shell": {
      const amount = Math.max(1, Math.ceil(value * 0.02 * derived.mods.mul.shellGain));
      addCurrency(state, "shells", amount);
      return { kind: item.kind, hearts, currency: "shells", amount };
    }
    case "glass": {
      const amount = Math.max(1, Math.ceil(value * 0.02 * derived.mods.mul.glassGain));
      addCurrency(state, "glass", amount);
      return { kind: item.kind, hearts, currency: "glass", amount };
    }
    case "pearl": {
      const amount = Math.max(1, Math.ceil(1 * derived.mods.mul.pearlGain));
      addCurrency(state, "pearls", amount);
      return { kind: item.kind, hearts, currency: "pearls", amount };
    }
    default:
      return { kind: item.kind, hearts, currency: null, amount: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* Drifters                                                            */
/* ------------------------------------------------------------------ */

export function spawnDrifter(state: GameState, now: number, defId?: string): Drifter | null {
  if (state.drifter) return null;
  const def = defId ? DRIFTER_BY_ID[defId] : DRIFTERS[Math.floor(Math.random() * DRIFTERS.length)];
  if (!def) return null;
  const drifter: Drifter = {
    id: crypto.randomUUID(),
    defId: def.id,
    taps: def.taps,
    tapsDone: 0,
    x: 20 + Math.random() * 60,
    y: 25 + Math.random() * 40,
    arrivedAt: now,
  };
  state.drifter = drifter;
  return drifter;
}

export interface DrifterHit {
  opened: boolean;
  remaining: number;
  reward?: { hearts: number; pearls: number; shells: number; glass: number };
  note?: string;
}

export function tapDrifter(state: GameState, derived: Derived): DrifterHit | null {
  const drifter = state.drifter;
  if (!drifter) return null;
  const def = DRIFTER_BY_ID[drifter.defId];
  if (!def) {
    state.drifter = null;
    return null;
  }

  // Coconut crabs open things much faster.
  const help = creaturesInJar(state).some((c) => c.defId === "coconut_crab") ? 3 : 1;
  drifter.tapsDone += help;
  if (drifter.tapsDone < drifter.taps) {
    return { opened: false, remaining: drifter.taps - drifter.tapsDone };
  }

  state.drifter = null;
  state.stats.driftersOpened += 1;
  recordMetric(state, "driftersOpened", 1);

  const scale = Math.max(1, derived.heartsPerSecond * 30) * derived.mods.mul.driftReward;
  const hearts = earnHearts(state, def.reward.hearts * scale, "drifter");
  const pearls = def.reward.pearls ?? 0;
  const shells = def.reward.shells ?? 0;
  const glass = def.reward.glass ?? 0;
  if (pearls) addCurrency(state, "pearls", pearls);
  if (shells) addCurrency(state, "shells", shells);
  if (glass) addCurrency(state, "glass", glass);

  // Notes turn up inside things that drift in.
  const notes = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];
  const owned = state.collections["notes"] ?? [];
  const missing = notes.filter((n) => !owned.includes(n));
  let note: string | undefined;
  if (missing.length > 0 && Math.random() < 0.2) {
    note = missing[Math.floor(Math.random() * missing.length)];
    grantCollectible(state, "notes", note);
  }

  return { opened: true, remaining: 0, reward: { hearts, pearls, shells, glass }, note };
}

/* ------------------------------------------------------------------ */
/* The tick                                                            */
/* ------------------------------------------------------------------ */

export interface TickResult {
  cracked: number;
  collected: number;
  comboBroken: boolean;
  drifted: boolean;
  /** Taps the jar made on your behalf this tick. */
  autoTaps: number;
  /** Hearts the depth chain produced this tick. */
  chainHearts: number;
}

/**
 * Run the chain for `dt` seconds.
 *
 * Deepest first, so within a single tick a purchase at the bottom does not
 * instantly appear at the top: each depth is paid from what the one below it
 * held at the *start* of the tick. That one-tick lag is what makes a deep
 * purchase feel like it is travelling up through the water, and it keeps the
 * maths honest at any tick rate.
 */
export function runChain(state: GameState, derived: Derived, dt: number): number {
  const count = Math.min(state.depths.length, derived.depthCount, DEPTHS.length);
  const speed = derived.depthPower * derived.tideSpeedMultiplier * dt;

  const before = state.depths.map((d) => d.owned);
  for (let i = count - 1; i >= 1; i--) {
    const producing = before[i];
    if (producing <= 0) continue;
    const made = producing * DEPTHS[i].power * speed;
    if (made > 0) state.depths[i - 1].owned = safe(state.depths[i - 1].owned + made);
  }

  // The surface turns into hearts rather than into another depth.
  const surface = before[0];
  if (surface <= 0) return 0;
  const hearts = surface * DEPTHS[0].power * speed
    * derived.mods.mul.cps * derived.globalMultiplier;
  return earnHearts(state, hearts, "passive");
}

/**
 * Taps the jar makes for you.
 *
 * Fractional taps carry over in `tapCredit` rather than being rounded away,
 * so half a tap a second really is half a tap a second and not nothing. The
 * same function runs during offline catch-up, which is why it takes `dt`
 * rather than reading the clock.
 */
export function runAutoTaps(state: GameState, derived: Derived, dt: number, now: number): number {
  if (!state.auto.tap || derived.autoTapsPerSecond <= 0) return 0;

  state.auto.tapCredit += derived.autoTapsPerSecond * dt;
  // The epsilon matters: ten ticks of 0.1 sum to 0.9999999999999999, so a
  // plain floor would drop one tap in every whole second, forever.
  const taps = Math.min(Math.floor(state.auto.tapCredit + 1e-9), 200);
  if (taps <= 0) return 0;
  state.auto.tapCredit -= taps;

  const chargeShare = state.auto.hold ? derived.autoChargeRatio : 0;
  for (let i = 0; i < taps; i++) {
    // Auto-taps land dead centre. That is the point of automating them.
    performClick(state, derived, {
      precision: 1,
      charge: chargeShare > 0 && Math.random() < chargeShare ? 1 : 0,
      now,
      x: 50,
      y: 50,
    });
  }
  return taps;
}

const SINK_PER_SECOND = 0.28;

/** Advance the simulation. Called about ten times a second. */
export function tick(state: GameState, dtMs: number, now: number): TickResult {
  const dt = Math.max(0, Math.min(dtMs, 5_000)) / 1000;
  const derived = derive(state, now);
  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;

  state.buffs = state.buffs.filter((b) => b.expiresAt > now);

  // Whatever is in the water sinks toward the floor.
  for (const item of state.settled) {
    item.y = Math.min(1, item.y + SINK_PER_SECOND * dt);
  }

  // The chain, then the taps it pays for.
  const chainHearts = challenge?.rule === "no_passive" ? 0 : runChain(state, derived, dt);
  const autoTaps = runAutoTaps(state, derived, dt, now);

  let cracked = 0;
  let collected = 0;
  const noCreatures = challenge?.rule === "no_creatures";
  const noPassive = challenge?.rule === "no_passive";
  const paired = heldHands(state);

  if (!noCreatures) {
    for (const creature of creaturesInJar(state)) {
      const def = CREATURE_BY_ID[creature.defId];
      if (!def) continue;
      const speed = def.line === "otter" ? derived.crackSpeed : derived.collectSpeed;
      const interval = actionInterval(def, creature.level, speed) * 1000;
      // A clock that jumped backwards would otherwise leave a creature waiting
      // for a moment that has already passed, forever.
      if (creature.lastActedAt > now) creature.lastActedAt = now - interval;
      if (now - creature.lastActedAt < interval) continue;
      creature.lastActedAt = now;

      const scale = def.power * creatureScale(creature.level, creature.stars) * fedFactor(creature);
      const pairBoost = paired.has(creature.id) ? 1.25 * derived.pairBonus : 1;

      if (def.line === "otter") {
        // Crack: pay out, and drop what came out of the shell.
        const value = scale * derived.crackValue * derived.mods.mul.creaturePower
          * derived.globalMultiplier * pairBoost;
        if (!noPassive) earnHearts(state, value * 8, "creature");
        state.stats.cracks += 1;
        recordMetric(state, "cracks", 1);
        cracked += 1;

        const roll = Math.random();
        const kind: Settled["kind"] = roll < 0.06 * (1 + derived.luck) ? "pearl" : roll < 0.35 ? "glass" : "shell";
        dropSettled(state, kind, value, 10 + Math.random() * 80);
      } else {
        // Collect: take the nearest thing that has reached the floor.
        const ready = state.settled.filter((s) => s.y > 0.75);
        if (ready.length === 0) continue;
        // Ghost crabs sweep everything at once, everyone else takes one.
        const take = creature.defId === "ghost_crab" ? ready : [ready[0]];
        for (const item of take) {
          collectSettled(state, derived, item.id, true);
          collected += 1;
        }
      }

      // Creatures get a little hungrier and a little more experienced.
      creature.fed = Math.max(0, creature.fed - 0.35);
      addXpSilently(state, creature.id, 1 * derived.mods.mul.creatureXp);
    }
  }

  // Whatever the trees add on top of the creatures.
  if (!noPassive && derived.mods.add.cpsFlat > 0) {
    earnHearts(state, derived.mods.add.cpsFlat * derived.mods.mul.cps * derived.globalMultiplier * dt, "passive");
  }

  // Combo decay.
  let comboBroken = false;
  if (state.combo > 0 && state.comboExpiresAt > 0 && now > state.comboExpiresAt) {
    if (derived.comboShield >= 1) {
      state.combo = Math.floor(state.combo * 0.5);
      state.comboExpiresAt = now + derived.comboDurationMs;
      if (state.combo <= 0) comboBroken = true;
    } else {
      comboBroken = true;
      if (state.combo >= derived.comboCap) state.stats.comboFinishers += 1;
      state.combo = Math.floor(derived.mods.add.comboStart);
      state.comboExpiresAt = 0;
    }
  }

  // Tide goes out slowly. Playing puts it back.
  state.tideLevel = Math.max(0, state.tideLevel - dt * 0.05);

  // Something drifts in now and then.
  let drifted = false;
  if (state.settings.drifters && !state.drifter) {
    const chance = (0.0025 + derived.driftChance) * dt;
    if (Math.random() < chance) {
      spawnDrifter(state, now);
      drifted = true;
    }
  }

  if (state.settings.autoSkills && hasFlag(state, "auto_skill")) {
    for (const [id, skill] of Object.entries(state.skills)) {
      const def = SKILL_BY_ID[id];
      if (!def || !skill.auto || skill.level < def.autoLevel) continue;
      if (skillReady(state, id, now)) activateSkill(state, id, now);
    }
  }

  if (hasFlag(state, "auto_feed")) autoFeed(state);

  state.lastTickAt = now;
  state.updatedAt = now;
  return { cracked, collected, comboBroken, drifted, autoTaps, chainHearts };
}

/** Experience without the level-up message; the tick calls this constantly. */
function addXpSilently(state: GameState, creatureId: string, xp: number): void {
  const creature = state.creatures[creatureId];
  const def = creature ? CREATURE_BY_ID[creature.defId] : null;
  if (!creature || !def) return;
  creature.xp += Math.max(0, xp);
  while (creature.level < def.maxLevel && creature.xp >= xpFor(creature.level)) {
    creature.xp -= xpFor(creature.level);
    creature.level += 1;
    recordMetric(state, "creatureLevels", 1);
  }
}

function autoFeed(state: GameState): void {
  for (const creature of creaturesInJar(state)) {
    if (creature.fed > 40) continue;
    if (state.wallet.shells < 8) return;
    if (spendCurrency(state, "shells", 8)) creature.fed = Math.min(100, creature.fed + 20);
  }
}

/* ------------------------------------------------------------------ */
/* Abilities                                                           */
/* ------------------------------------------------------------------ */

export interface SkillActivation {
  ok: boolean;
  reason?: string;
  instantHearts?: number;
  label?: string;
}

function cooldownRemaining(state: GameState, id: string, now: number): number {
  const def = SKILL_BY_ID[id];
  const skill = state.skills[id];
  if (!def || !skill) return Infinity;
  if (skill.lastUsedAt <= 0) return 0;
  return Math.max(0, def.cooldownMs * derive(state, now).skillCooldown - (now - skill.lastUsedAt));
}

export function skillReady(state: GameState, id: string, now: number): boolean {
  const skill = state.skills[id];
  if (!skill || skill.level <= 0) return false;
  return cooldownRemaining(state, id, now) <= 0;
}

export function activateSkill(state: GameState, id: string, now: number): SkillActivation {
  const def = SKILL_BY_ID[id];
  const skill = state.skills[id];
  if (!def || !skill) return { ok: false, reason: "Unknown ability" };
  if (skill.level <= 0) return { ok: false, reason: "Not learned yet" };
  if (cooldownRemaining(state, id, now) > 0) return { ok: false, reason: "Still recovering" };

  const derived = derive(state, now);
  skill.lastUsedAt = now;
  state.stats.skillsUsed += 1;
  recordMetric(state, "skillsUsed", 1);

  if (def.effect.kind === "buff") {
    const duration = def.durationMs * derived.skillDuration;
    skill.activeUntil = now + duration;
    addBuff(state, {
      source: `skill:${id}`,
      label: def.name,
      mods: def.effect.mods(skill.level),
      expiresAt: now + duration,
    });
    return { ok: true, label: def.name };
  }

  const power = def.effect.power(skill.level);
  switch (def.effect.instant) {
    case "heart_burst": {
      const value = safe(Math.max(derived.heartsPerSecond, derived.heartsPerClick) * power);
      earnHearts(state, value, "skill");
      return { ok: true, instantHearts: value, label: def.name };
    }
    case "crack_all": {
      let total = 0;
      for (const creature of creaturesInJar(state)) {
        const cdef = CREATURE_BY_ID[creature.defId];
        if (cdef?.line !== "otter") continue;
        const value = cdef.power * creatureScale(creature.level, creature.stars)
          * derived.crackValue * derived.globalMultiplier * power;
        total += earnHearts(state, value * 8, "skill");
        state.stats.cracks += 1;
        recordMetric(state, "cracks", 1);
        dropSettled(state, "shell", value, 10 + Math.random() * 80);
      }
      return { ok: true, instantHearts: total, label: def.name };
    }
    case "collect_all": {
      let total = 0;
      for (const item of [...state.settled]) {
        const result = collectSettled(state, derived, item.id, true);
        if (result) total += result.hearts * power;
      }
      return { ok: true, instantHearts: total, label: def.name };
    }
    case "spawn_drifter": {
      for (let i = 0; i < power; i++) spawnDrifter(state, now);
      return { ok: true, label: def.name };
    }
    case "reset_cooldowns": {
      for (const [otherId, other] of Object.entries(state.skills)) {
        if (otherId !== id) other.lastUsedAt = 0;
      }
      return { ok: true, label: def.name };
    }
    case "max_combo": {
      state.combo = derived.comboCap;
      state.comboExpiresAt = now + derived.comboDurationMs * 3;
      return { ok: true, label: def.name };
    }
    case "feed_all": {
      for (const creature of creaturesInJar(state)) creature.fed = 100;
      return { ok: true, label: def.name };
    }
    case "mission_progress": {
      for (const mission of state.missions) {
        if (!mission.claimed) mission.progress = safe(mission.progress + mission.goal * power);
      }
      return { ok: true, label: def.name };
    }
    default:
      return { ok: true, label: def.name };
  }
}

/* ------------------------------------------------------------------ */
/* Offline                                                             */
/* ------------------------------------------------------------------ */

export interface OfflineReport {
  awayMs: number;
  countedMs: number;
  hearts: number;
  shells: number;
  glass: number;
  cappedByWindow: boolean;
  clockSuspicious: boolean;
  /** What each depth grew to while you were away. */
  depths: number[];
}

/** Coarse steps used to advance the chain over an offline window. */
const OFFLINE_STEPS = 240;

/**
 * Run the chain forward over a long stretch without ticking it ten times a
 * second for every one of those seconds.
 *
 * Two hundred and forty steps over any window is close enough: the chain is
 * polynomial in time, and the error from coarse stepping is a fraction of a
 * percent against a number that is about to be multiplied by a hundred anyway.
 * Returns the depth counts and the hearts the surface produced.
 */
function simulateChain(
  state: GameState,
  derived: Derived,
  seconds: number,
): { depths: number[]; hearts: number } {
  const count = Math.min(state.depths.length, derived.depthCount, DEPTHS.length);
  const owned = state.depths.map((d) => d.owned);
  const step = seconds / OFFLINE_STEPS;
  const speed = derived.depthPower * derived.tideSpeedMultiplier * step;
  let hearts = 0;

  for (let s = 0; s < OFFLINE_STEPS; s++) {
    const before = owned.slice();
    for (let i = count - 1; i >= 1; i--) {
      if (before[i] <= 0) continue;
      owned[i - 1] = safe(owned[i - 1] + before[i] * DEPTHS[i].power * speed);
    }
    if (before[0] > 0) hearts = safe(hearts + before[0] * DEPTHS[0].power * speed);
  }

  return { depths: owned, hearts: safe(hearts * derived.mods.mul.cps * derived.globalMultiplier) };
}

/**
 * What the jar produced while the app was closed.
 *
 * Elapsed time comes from the device clock but is bounded on both sides:
 * time that ran backwards is discarded, and the total is capped by the
 * offline window, so a wound-forward clock buys one window and no more.
 */
export function computeOffline(state: GameState, now: number): OfflineReport {
  const derived = derive(state, now);
  const rawAway = now - state.lastSeenAt;
  const clockSuspicious = rawAway < -60_000;
  const awayMs = Math.max(0, rawAway);
  const windowMs = derived.offlineHours * 3_600_000;
  const countedMs = Math.min(awayMs, windowMs);
  const cappedByWindow = awayMs > windowMs;

  if (countedMs < 60_000 || clockSuspicious) {
    return {
      awayMs, countedMs: 0, hearts: 0, shells: 0, glass: 0,
      cappedByWindow, clockSuspicious, depths: state.depths.map((d) => d.owned),
    };
  }

  const seconds = countedMs / 1000;

  // The chain keeps running while the app is shut, so time away compounds
  // rather than merely accruing. Everything else that is not the chain is
  // paid at the offline rate as before.
  const chain = simulateChain(state, derived, seconds);
  const chainNow = (state.depths[0]?.owned ?? 0) * (DEPTHS[0]?.power ?? 1)
    * derived.depthPower * derived.tideSpeedMultiplier
    * derived.mods.mul.cps * derived.globalMultiplier;
  const other = Math.max(0, derived.heartsPerSecond - chainNow);

  const hearts = safe(chain.hearts + other * seconds * derived.offlineRate);
  const shells = Math.floor(seconds / 240 * derived.mods.mul.shellGain);
  const glass = Math.floor(seconds / 300 * derived.mods.mul.glassGain);
  return {
    awayMs, countedMs, hearts, shells, glass,
    cappedByWindow, clockSuspicious, depths: chain.depths,
  };
}

export function claimOffline(state: GameState, report: OfflineReport, now: number): void {
  // Whatever the chain grew into while the app was shut.
  for (let i = 0; i < state.depths.length; i++) {
    const grown = report.depths[i];
    if (Number.isFinite(grown) && grown > state.depths[i].owned) state.depths[i].owned = grown;
  }
  if (report.hearts > 0) earnHearts(state, report.hearts, "offline");
  if (report.shells > 0) addCurrency(state, "shells", report.shells);
  if (report.glass > 0) addCurrency(state, "glass", report.glass);
  state.lastSeenAt = now;
  state.storyProgress["offline"] = (state.storyProgress["offline"] ?? 0) + 1;
  recordMetric(state, "offlineClaims", 1);
  pushLog(state, "Back", `${Math.round(report.countedMs / 60_000)} minutes away`);
}

/* ------------------------------------------------------------------ */
/* Easter eggs                                                         */
/* ------------------------------------------------------------------ */

export interface EggFound {
  id: string;
  line: string;
}

/** Each one lands once, ever. */
function claimEgg(state: GameState, id: string, now: number): EggFound | null {
  const def = EGG_BY_ID[id];
  if (!def) return null;
  const found = state.collections["eggs"] ?? [];
  if (found.includes(id)) return null;

  grantCollectible(state, "eggs", id);
  if (def.mods && def.durationMs) {
    addBuff(state, {
      source: `egg:${id}`,
      label: def.line,
      mods: def.mods,
      expiresAt: now + def.durationMs,
    });
  }
  if (def.pearls) addCurrency(state, "pearls", def.pearls);
  pushLog(state, "Oh", def.line);
  return { id, line: def.line };
}

/**
 * Look for the quiet ones.
 *
 * Called every tick, which sounds expensive and is not: every branch is a
 * comparison against a number already in hand, and each egg stops being
 * checked the moment it is found.
 */
export function checkEggs(state: GameState, now: number, partnerHereMs: number | null): EggFound[] {
  const found: EggFound[] = [];
  const date = new Date(now);
  const push = (id: string) => {
    const egg = claimEgg(state, id, now);
    if (egg) found.push(egg);
  };

  const hour = date.getHours();
  const minute = date.getMinutes();

  // Playing at midnight.
  if (hour === 0 && minute < 5) push("midnight");
  // 1:43, or 143 of anything. It is "I love you" in letter counts.
  if (hour === 1 && minute === 43) push("the_number");
  // The twenty-ninth of February.
  if (date.getMonth() === 1 && date.getDate() === 29) push("leap");
  // Both of you opened the jar within the same minute.
  if (partnerHereMs !== null && partnerHereMs < 60_000) push("same_minute");

  // Five otters holding hands is a raft, and a raft is why they hold hands.
  if (heldHands(state).size >= 5) push("otter_hands");
  // A thousand things carried up off the floor.
  if (state.stats.collects >= 1_000) push("crab_sideways");
  // A hundred charged taps, which is a lot of holding on.
  if (state.stats.chargedClicks >= 100) push("patient");
  // Spending literally everything.
  if (state.lifetime.hearts > 1e6 && state.wallet.hearts < 1) push("empty");
  // Both of the first two memories.
  const memories = state.collections["memories"] ?? [];
  if (memories.includes("the_mall") && memories.includes("photo_booth")) push("the_mall");

  return found;
}

/* ------------------------------------------------------------------ */
/* Achievements and rewards                                            */
/* ------------------------------------------------------------------ */

export interface AchievementUnlock {
  id: string;
  name: string;
  tier: number;
  description: string;
}

export function checkAchievements(state: GameState, now: number): AchievementUnlock[] {
  const unlocked: AchievementUnlock[] = [];
  for (const def of ACHIEVEMENTS) {
    const current = state.achievements[def.id]?.tier ?? 0;
    if (current >= def.tiers.length) continue;
    const total = metricTotal(state, def.metric);
    let tier = current;
    while (tier < def.tiers.length && total >= def.tiers[tier]) tier += 1;
    if (tier === current) continue;

    state.achievements[def.id] = { tier, at: now };
    for (let t = current; t < tier; t++) {
      state.stats.achievementsUnlocked += 1;
      grantReward(state, def.reward, 1 + t * 0.5);
      unlocked.push({
        id: def.id,
        name: def.name,
        tier: t + 1,
        description: `${def.description} (${def.tiers[t].toLocaleString()})`,
      });
    }
  }
  return unlocked;
}

export function grantReward(state: GameState, reward: Record<string, unknown> | undefined, multiplier = 1): void {
  if (!reward) return;
  for (const [key, value] of Object.entries(reward)) {
    if (key === "collectible" && Array.isArray(value)) {
      const [collection, item] = value as [string, string];
      grantCollectible(state, collection, item);
      continue;
    }
    if (key === "food") continue;
    if (typeof value === "number") {
      addCurrency(state, key as CurrencyId, Math.max(1, Math.floor(value * multiplier)));
    }
  }
}

export function grantCollectible(state: GameState, collection: string, item: string): boolean {
  const owned = state.collections[collection] ?? [];
  if (owned.includes(item)) return false;
  state.collections[collection] = [...owned, item];
  return true;
}

export function pushLog(state: GameState, label: string, detail: string): void {
  state.log = [...state.log.slice(-39), { id: crypto.randomUUID(), at: Date.now(), label, detail }];
}

/* ------------------------------------------------------------------ */
/* Daily and day rollover                                              */
/* ------------------------------------------------------------------ */

export function claimDailyBonus(state: GameState, day: string): { hearts: number; pearls: number; streak: number } | null {
  if (state.dailyBonus.day === day) return null;
  const yesterday = new Date(`${day}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const continued = state.dailyBonus.day === yesterday.toISOString().slice(0, 10);
  const streak = continued ? state.dailyBonus.streak + 1 : 1;
  state.dailyBonus = { day, streak };

  const derived = derive(state);
  const hearts = safe(Math.max(1_000, derived.heartsPerSecond * 900) * (1 + streak * 0.15));
  const pearls = 2 + Math.min(15, streak);
  earnHearts(state, hearts, "together");
  addCurrency(state, "pearls", pearls);
  addCurrency(state, "shells", 20 + streak * 3);
  pushLog(state, "Daily", `Day ${streak}`);
  return { hearts, pearls, streak };
}

export function rollDay(state: GameState, day: string): void {
  const last = state.stats.history[state.stats.history.length - 1];
  if (last && last.day === day) return;
  state.stats.history = [...state.stats.history.slice(-59), { day, hearts: 0, clicks: 0, bestCombo: 0 }];
}

export function recordDay(state: GameState, day: string, hearts: number, clicks: number, combo: number): void {
  rollDay(state, day);
  const entry = state.stats.history[state.stats.history.length - 1];
  if (!entry) return;
  entry.hearts = safe(entry.hearts + hearts);
  entry.clicks += clicks;
  entry.bestCombo = Math.max(entry.bestCombo, combo);
}

export function currentVessel(state: GameState) {
  return VESSEL_BY_ID[state.vessel] ?? VESSEL_BY_ID["jam_jar"];
}
