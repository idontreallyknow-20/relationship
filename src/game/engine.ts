import type {
  Buff, CurrencyId, Derived, GameState,
} from "./types";
import { creaturesInJar, derive, fedFactor, hasFlag, heldHands } from "./formulas";
import { safe } from "./numbers";
import { CHALLENGE_BY_ID, MISSION_BY_ID, type MetricId } from "./config/objectives";
import { ACHIEVEMENTS } from "./config/awards";
import { CREATURE_BY_ID, actionInterval, creatureScale, xpFor } from "./config/creatures";
import { FIRST_JAR, JAR_BY_ID } from "./config/jars";
import { ribbonGain } from "./config/shelf";
import { EGG_BY_ID } from "./config/eggs";
import { SKILL_BY_ID } from "./config/skills";
import { advanceStage, featuresAt, stageFor } from "./config/stages";

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

export type HeartSource =
  | "click" | "crit" | "passive" | "creature" | "skill"
  | "offline" | "together" | "shelf";

const STAT_FOR_SOURCE: Partial<Record<HeartSource, keyof GameState["stats"]>> = {
  click: "heartsFromClicks",
  crit: "heartsFromCrits",
  passive: "heartsFromPassive",
  creature: "heartsFromCreatures",
  skill: "heartsFromSkills",
  offline: "heartsFromOffline",
  together: "heartsFromTogether",
  shelf: "heartsFromShelf",
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
  // One more running total, and only while the switch is on. A dilated
  // stretch is paid for what it earned dilated, so hearts banked before
  // turning it on cannot be cashed in as if they had been.
  if (state.dilation?.active) {
    state.dilation.hearts = safe(state.dilation.hearts + value);
  }
  state.stats.sessionHearts = safe(state.stats.sessionHearts + value);

  const key = STAT_FOR_SOURCE[source];
  if (key) (state.stats[key] as number) = safe((state.stats[key] as number) + value);
  // A critical is a tap too, so it shows in both breakdowns.
  if (source === "crit") {
    state.stats.heartsFromClicks = safe(state.stats.heartsFromClicks + value);
  }

  recordMetric(state, "hearts", value);
  if (source === "click" || source === "crit") {
    recordMetric(state, "heartsFromClicks", value);
  }
  if (source === "passive" || source === "creature" || source === "shelf") {
    recordMetric(state, "heartsFromPassive", value);
  }
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
    case "hearts": return state.lifetime.hearts;
    case "heartsFromClicks": return s.heartsFromClicks;
    case "heartsFromPassive": return s.heartsFromPassive;
    case "heartsFromSkills": return s.heartsFromSkills;
    case "heartsFromCreatures": return s.heartsFromCreatures;
    case "bestCombo": return s.bestCombo;
    case "comboFinishers": return s.comboFinishers;
    case "petDrops": return s.petDrops;
    case "seals": return s.jarsSealed;
    case "upgrades": return s.upgradesBought;
    case "skillsUsed": return s.skillsUsed;
    case "creaturesArrived": return state.codex.length;
    case "creaturesEvolved": return s.creaturesEvolved;
    case "creatureLevels": return Object.values(state.creatures).reduce((sum, c) => sum + c.level - 1, 0);
    case "itemsMade": return s.itemsMade;
    case "vessels": return state.jarsUnlocked.length;
    case "challenges": return s.challengesCompleted;
    case "minigames": return s.minigamesPlayed;
    case "tideChanges": return state.tideChanges;
    case "newWaters": return state.newWaters;
    case "offlineClaims": return state.storyProgress["offline"] ?? 0;
    case "questionAnswered": return state.storyProgress["questions"] ?? 0;
    case "togetherActions": return state.storyProgress["together"] ?? 0;
    case "sameEvening": return state.storyProgress["evenings"] ?? 0;
    case "jars": return state.jarsUnlocked.length;
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
  now: number;
  x: number;
  y: number;
}

export interface ClickOutcome {
  hearts: number;
  crit: boolean;
  mega: boolean;
  perfect: boolean;
  chained: number;
  combo: number;
  comboBroken: boolean;
}


/**
 * One tap.
 *
 * A tap is a tap. There used to be a hold gesture that charged up for a
 * heavier hit, and it was the single most confusing thing in the game: two
 * ways to press the same button, with no way to tell which you wanted.
 */
export function performClick(state: GameState, derived: Derived, opts: ClickOptions): ClickOutcome {
  const { now } = opts;
  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;

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
  const steps = 1;
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

  const comboMultiplier = 1 + Math.min(state.combo, derived.comboCap) * 0.03 * derived.mods.mul.comboPower;
  let hearts = derived.mods.add.clickFlat * derived.mods.mul.click * derived.mods.mul.all * comboMultiplier;
  hearts *= 1 + opts.precision * 0.75;

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

  if (challenge?.rule === "perfect_only" && !perfect) hearts = 0;
  if (challenge?.rule === "combo_only" && state.combo < 20) hearts = 0;
  if (challenge?.rule === "creatures_only") hearts = 0;

  // Overflow is a bonus, not waste.
  if (state.wallet.hearts > derived.capacity) hearts *= 1.2;

  const earned = earnHearts(state, hearts, crit ? "crit" : "click");

  return {
    hearts: earned, crit, mega, perfect, chained,
    combo: state.combo, comboBroken,
  };
}

/* ------------------------------------------------------------------ */
/* The floor                                                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Sealing a jar                                                       */
/* ------------------------------------------------------------------ */

export interface TickResult {
  /** Hearts the pets carried over this tick. */
  carried: number;
  comboBroken: boolean;
  /** Whether a full jar sealed itself this tick. */
  sealed: boolean;
  /** Taps the jar made on your behalf this tick. */
  autoTaps: number;
  /** Hearts the shelf produced this tick. */
  shelfHearts: number;
}

export function canSeal(state: GameState, derived: Derived): boolean {
  return state.wallet.hearts >= derived.jarCapacity && derived.jarCapacity > 0;
}

export interface SealResult {
  hearts: number;
  ribbons: number;
  jarId: string;
}

/**
 * Fill a jar, seal it, put it on the shelf, start the next one.
 *
 * Nothing is destroyed here, which is the whole reason this works as the fast
 * inner loop: the hearts move out of the jar and onto the shelf, where they go
 * on paying a share of themselves forever. What you give up is the balance you
 * were holding, and what you get is a permanent income and a ribbon.
 *
 * The one subtlety is `sealKeep`, an upgrade that leaves a fraction behind so
 * the new jar does not start from literally nothing. It is capped well under
 * one, because a jar that kept everything would be a button that printed
 * ribbons.
 */
export function sealJar(state: GameState, derived: Derived, now: number): SealResult | null {
  if (!canSeal(state, derived)) return null;

  const hearts = state.wallet.hearts;
  const kept = safe(hearts * derived.sealKeep);
  const banked = safe(hearts - kept);
  const ribbons = ribbonGain(hearts, derived.jarCapacity, derived.mods.mul.ribbonGain);

  state.sealed = [...state.sealed.slice(-199), { jarId: state.jar, hearts: banked, at: now }];
  state.shelfHearts = safe(state.shelfHearts + banked);
  state.wallet.hearts = kept;

  addCurrency(state, "ribbons", ribbons);
  state.stats.jarsSealed += 1;
  recordMetric(state, "seals", 1);
  pushLog(state, "Sealed", `${JAR_BY_ID[state.jar]?.name ?? "A jar"}, and onto the shelf`);

  return { hearts: banked, ribbons, jarId: state.jar };
}

export function runAutoTaps(state: GameState, derived: Derived, dt: number, now: number): number {
  if (!state.auto.tap || derived.autoTapsPerSecond <= 0) return 0;

  state.auto.tapCredit += derived.autoTapsPerSecond * dt;
  // The epsilon matters: ten ticks of 0.1 sum to 0.9999999999999999, so a
  // plain floor would drop one tap in every whole second, forever.
  const taps = Math.min(Math.floor(state.auto.tapCredit + 1e-9), 200);
  if (taps <= 0) return 0;
  state.auto.tapCredit -= taps;

  for (let i = 0; i < taps; i++) {
    // Auto-taps land dead centre. That is the point of automating them.
    performClick(state, derived, {
      precision: 1,
      now,
      x: 50,
      y: 50,
    });
  }
  return taps;
}

/** Advance the simulation. Called about ten times a second. */
export function tick(state: GameState, dtMs: number, now: number): TickResult {
  const dt = Math.max(0, Math.min(dtMs, 5_000)) / 1000;
  const derived = derive(state, now);
  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;

  state.buffs = state.buffs.filter((b) => b.expiresAt > now);

  // The shelf, then the taps.
  //
  // Every jar ever sealed pays a share of what was put in it, all at once and
  // forever. This is the compounding part of the game and the reason a run
  // accelerates: income is proportional to what has been banked, and what
  // gets banked is income times time.
  const shelfHearts = challenge?.rule === "no_passive"
    ? 0
    : earnHearts(state, derived.shelfIncome * dt, "shelf");
  const autoTaps = runAutoTaps(state, derived, dt, now);

  let carried = 0;
  const noCreatures = challenge?.rule === "no_creatures";
  const noPassive = challenge?.rule === "no_passive";
  const paired = heldHands(state);

  // The pets, who sit around the jar rather than inside it.
  //
  // Each one walks over on its own clock and drops a heart in. That is the
  // whole mechanic. It used to be two: an otter cracked something open inside
  // the jar, the pieces sank to a floor, and a crab walked along that floor to
  // pick them up, which meant an otter with no crab beside it earned nothing
  // and neither of them earned hearts at all.
  if (!noCreatures && !noPassive) {
    for (const creature of creaturesInJar(state)) {
      const def = CREATURE_BY_ID[creature.defId];
      if (!def) continue;
      const interval = actionInterval(def, creature.level, derived.petSpeed) * 1000;
      // A clock that jumped backwards would otherwise leave a pet waiting for
      // a moment that has already passed, forever.
      if (creature.lastActedAt > now) creature.lastActedAt = now - interval;
      if (now - creature.lastActedAt < interval) continue;
      creature.lastActedAt = now;

      const pairBoost = paired.has(creature.id) ? 1.25 * derived.pairBonus : 1;
      const value = def.power
        * creatureScale(creature.level, creature.stars)
        * fedFactor(creature)
        * derived.petValue
        * derived.mods.mul.creaturePower
        * derived.globalMultiplier
        * pairBoost;

      earnHearts(state, value, "creature");
      state.stats.petDrops += 1;
      recordMetric(state, "petDrops", 1);
      carried += 1;

      // Pets get a little hungrier and a little more experienced.
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

  // A full jar seals itself, once you have taught it how.
  let sealed = false;
  if (derived.autoSeal && canSeal(state, derived)) {
    sealed = sealJar(state, derived, now) !== null;
  }

  if (state.settings.autoSkills && hasFlag(state, "auto_skill")) {
    for (const [id, skill] of Object.entries(state.skills)) {
      const def = SKILL_BY_ID[id];
      if (!def || !skill.auto || skill.level < def.autoLevel) continue;
      if (skillReady(state, id, now)) activateSkill(state, id, now);
    }
  }

  if (hasFlag(state, "auto_feed")) autoFeed(state);

  // The reveal ladder, one rung at a time and no faster than the gap allows.
  // Everything on screen is gated off `stageReached`, so this is the single
  // place a feature can ever appear.
  if (advanceStage(state, now)) seatWaitingPets(state);

  state.lastTickAt = now;
  state.updatedAt = now;
  return { carried, comboBroken, sealed, autoTaps, shelfHearts };
}

/**
 * Sit any pet down that is waiting for a chair.
 *
 * Called when a rung opens, which is how the starter pet arrives: it is in the
 * save from the first second but out of the jar, so that a new save has no
 * passive income until the rung that explains passive income. Anything the
 * player took out by hand stays out, because this only ever fills empty seats
 * up to the number of pets that have never been seated.
 */
function seatWaitingPets(state: GameState): void {
  if (!featuresAt(stageFor(state)).has("pets")) return;
  const seated = new Set(state.slots.filter(Boolean) as string[]);
  for (const creature of Object.values(state.creatures)) {
    if (seated.has(creature.id) || creature.slot !== null) continue;
    const free = state.slots.indexOf(null);
    if (free < 0) return;
    state.slots[free] = creature.id;
    creature.slot = free;
    seated.add(creature.id);
  }
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
    if (state.wallet.ribbons < 1) return;
    if (spendCurrency(state, "ribbons", 1)) creature.fed = Math.min(100, creature.fed + 30);
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
    case "everyone_at_once": {
      // Every pet makes its trip immediately, whether or not its timer was up.
      let total = 0;
      for (const creature of creaturesInJar(state)) {
        const cdef = CREATURE_BY_ID[creature.defId];
        if (!cdef) continue;
        const value = cdef.power * creatureScale(creature.level, creature.stars)
          * fedFactor(creature) * derived.petValue * derived.globalMultiplier * power;
        total += earnHearts(state, value, "skill");
        state.stats.petDrops += 1;
        recordMetric(state, "petDrops", 1);
      }
      return { ok: true, instantHearts: total, label: def.name };
    }
    case "top_it_up": {
      // A pour straight into the jar, worth a stretch of the shelf's output.
      const value = safe(derived.shelfIncome * 60 * power);
      earnHearts(state, value, "skill");
      return { ok: true, instantHearts: value, label: def.name };
    }
    case "seal_it": {
      const result = canSeal(state, derived) ? sealJar(state, derived, now) : null;
      return result
        ? { ok: true, label: def.name }
        : { ok: false, reason: "The jar is not full yet" };
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
  ribbons: number;
  cappedByWindow: boolean;
  clockSuspicious: boolean;
}

/**
 * What the jar produced while the app was closed.
 *
 * Elapsed time comes from the device clock but is bounded on both sides: time
 * that ran backwards is discarded, and the total is capped by the offline
 * window, so a wound-forward clock buys one window and no more.
 *
 * The shelf is paid in full and the rest at the offline rate. That split is
 * deliberate: the shelf is the part of the game that is explicitly about
 * hearts arriving while you are not there, and discounting it would be
 * charging you for the mechanic's whole purpose. Tapping, obviously, pays
 * nothing while the app is shut.
 *
 * This used to step an eight tier chain forward two hundred and forty times
 * and then subtract the chain's current rate back out of `heartsPerSecond` to
 * avoid paying for it twice, which was the most delicate arithmetic in the
 * file and existed only to serve the mechanic that has now gone.
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
    return { awayMs, countedMs: 0, hearts: 0, ribbons: 0, cappedByWindow, clockSuspicious };
  }

  const seconds = countedMs / 1000;
  const shelf = derived.shelfIncome * seconds;
  const rest = Math.max(0, derived.heartsPerSecond - derived.shelfIncome);
  const hearts = safe(shelf + rest * seconds * derived.offlineRate);

  // A ribbon for roughly every jar's worth that came in while you were out,
  // so coming back to a long night is worth something in its own right rather
  // than only in hearts.
  const ribbons = derived.jarCapacity > 0
    ? Math.floor(Math.min(50, hearts / derived.jarCapacity) * derived.mods.mul.ribbonGain)
    : 0;

  return { awayMs, countedMs, hearts, ribbons, cappedByWindow, clockSuspicious };
}

export function claimOffline(state: GameState, report: OfflineReport, now: number): void {
  if (report.hearts > 0) earnHearts(state, report.hearts, "offline");
  if (report.ribbons > 0) addCurrency(state, "ribbons", report.ribbons);
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
  if (def.ribbons) addCurrency(state, "ribbons", def.ribbons);
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
  if (state.stats.petDrops >= 1_000) push("crab_sideways");
  // A thousand taps by hand, which is a lot of sitting with it.
  if (state.stats.totalClicks >= 1_000) push("patient");
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

export function claimDailyBonus(state: GameState, day: string): { hearts: number; ribbons: number; streak: number } | null {
  if (state.dailyBonus.day === day) return null;

  // The first open is not a welcome back.
  //
  // This paid `max(1000, hps * 900)` hearts the very first time the jar was
  // ever opened, which on a fresh save is a thousand hearts and twenty-three
  // shells handed over before a single tap. That alone cleared the first three
  // rungs of the ladder, and it was the largest single reason the opening felt
  // like being handed the whole game at once. Day one now only starts the
  // streak; the reward is for coming back.
  if (state.dailyBonus.day === null) {
    state.dailyBonus = { day, streak: 1 };
    return null;
  }

  const yesterday = new Date(`${day}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const continued = state.dailyBonus.day === yesterday.toISOString().slice(0, 10);
  const streak = continued ? state.dailyBonus.streak + 1 : 1;
  state.dailyBonus = { day, streak };

  const derived = derive(state);
  const hearts = safe(Math.max(1_000, derived.heartsPerSecond * 900) * (1 + streak * 0.15));
  const ribbons = 1 + Math.min(10, streak);
  earnHearts(state, hearts, "together");
  addCurrency(state, "ribbons", ribbons);
  pushLog(state, "Daily", `Day ${streak}`);
  return { hearts, ribbons, streak };
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

export function currentJar(state: GameState) {
  return JAR_BY_ID[state.jar] ?? JAR_BY_ID[FIRST_JAR];
}
