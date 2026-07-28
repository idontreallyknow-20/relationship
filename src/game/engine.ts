import type {
  Buff, CurrencyId, Derived, FloatingHeart, GameState, Mods,
} from "./types";
import { derive, hasFlag } from "./formulas";
import { safe, seededRandom } from "./numbers";
import { CHALLENGE_BY_ID, MISSION_BY_ID, type MetricId } from "./config/objectives";
import { ACHIEVEMENTS } from "./config/awards";
import { WORLD_BY_ID } from "./config/worlds";
import { SKILL_BY_ID } from "./config/skills";

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

export type HeartSource =
  | "click" | "passive" | "crit" | "skill" | "pet" | "offline"
  | "partner" | "boss" | "golden" | "treasure" | "event" | "mission";

const STAT_FOR_SOURCE: Partial<Record<HeartSource, keyof GameState["stats"]>> = {
  click: "heartsFromClicks",
  passive: "heartsFromPassive",
  crit: "heartsFromCrits",
  skill: "heartsFromSkills",
  pet: "heartsFromPets",
  offline: "heartsFromOffline",
  partner: "heartsFromPartner",
  boss: "heartsFromBosses",
  golden: "heartsFromGolden",
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
  state.stats.sessionHearts = safe(state.stats.sessionHearts + value);
  const key = STAT_FOR_SOURCE[source];
  if (key) {
    (state.stats[key] as number) = safe((state.stats[key] as number) + value);
  }
  // A critical is also a tap, so it counts toward both breakdowns.
  if (source === "crit") {
    state.stats.heartsFromClicks = safe(state.stats.heartsFromClicks + value);
  }
  recordMetric(state, "hearts", value);
  if (source === "click" || source === "crit") recordMetric(state, "heartsFromClicks", value);
  if (source === "passive") recordMetric(state, "heartsFromPassive", value);
  if (source === "skill") recordMetric(state, "heartsFromSkills", value);
  return value;
}

/* ------------------------------------------------------------------ */
/* Metrics: one place that missions, events and achievements read      */
/* ------------------------------------------------------------------ */

export function recordMetric(state: GameState, metric: MetricId, value: number, mode: "add" | "max" = "add"): void {
  if (!Number.isFinite(value) || value <= 0) return;

  for (const mission of state.missions) {
    const def = MISSION_BY_ID[mission.defId];
    if (!def || def.metric !== metric || mission.claimed) continue;
    mission.progress = mode === "max"
      ? Math.max(mission.progress, value)
      : safe(mission.progress + value);
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

/** Cumulative totals, used by achievements and the codex. */
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
    case "bestCombo": return s.bestCombo;
    case "comboFinishers": return s.comboFinishers;
    case "golden": return s.goldenCaught;
    case "treasures": return s.treasuresOpened;
    case "upgrades": return s.upgradesBought;
    case "skillsUsed": return s.skillsUsed;
    case "eggs": return s.eggsOpened;
    case "petLevels": return Object.values(state.pets).reduce((sum, p) => sum + p.level - 1, 0);
    case "petsEvolved": return s.petsEvolved;
    case "petsFused": return s.petsFused;
    case "charmsCrafted": return s.charmsCrafted;
    case "bosses": return s.bossesDefeated;
    case "challenges": return s.challengesCompleted;
    case "minigames": return s.minigamesPlayed;
    case "rebirths": return state.rebirths;
    case "ascensions": return state.ascensions;
    case "offlineClaims": return offlineClaimCount(state);
    case "questionAnswered": return questionCount(state);
    case "partnerActions": return partnerActionCount(state);
    case "worldsVisited": return state.worldsUnlocked.length;
    default: return 0;
  }
}

// These three live in the log rather than a dedicated counter, because they
// are driven by the rest of the couples app rather than by the game loop.
function offlineClaimCount(state: GameState): number {
  return state.log.filter((l) => l.label === "Offline").length + (state.stats.heartsFromOffline > 0 ? 1 : 0);
}
function questionCount(state: GameState): number {
  return state.partnerRewards.claimed.filter((c) => c.startsWith("question")).length + (state.storyProgress["questions"] ?? 0);
}
function partnerActionCount(state: GameState): number {
  return state.storyProgress["partner"] ?? 0;
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

export function pruneBuffs(state: GameState, now: number): void {
  if (state.buffs.length === 0) return;
  state.buffs = state.buffs.filter((b) => b.expiresAt > now);
}

/* ------------------------------------------------------------------ */
/* Clicking                                                            */
/* ------------------------------------------------------------------ */

export interface ClickOptions {
  /** 0..1 position inside the timing ring; 1 is dead centre. */
  precision: number;
  /** Charge accumulated by holding, 0..1. */
  charge: number;
  now: number;
  /** Screen position, so the UI can place the popup. */
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
  overflow: boolean;
  x: number;
  y: number;
}

/**
 * One tap. Everything that makes a tap interesting lives here: the combo, the
 * timing ring, criticals, critical chains, heat and the charge bonus.
 */
export function performClick(state: GameState, derived: Derived, opts: ClickOptions): ClickOutcome {
  const { now } = opts;
  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;

  // Combo bookkeeping.
  let comboBroken = false;
  if (state.comboExpiresAt > 0 && now > state.comboExpiresAt) {
    if (state.combo > 0 && derived.comboShield >= 1) {
      // A shield absorbs the break and restarts partway up.
      state.combo = Math.floor(state.combo * 0.5);
    } else {
      comboBroken = state.combo > 0;
      if (comboBroken) state.stats.comboFinishers += state.combo >= derived.comboCap ? 1 : 0;
      state.combo = Math.floor(derived.mods.add.comboStart);
    }
  }
  const decayFactor = challenge?.rule === "fast_decay" ? 0.25 : 1;
  const gain = Math.max(1, Math.round(derived.mods.mul.comboGain));
  state.combo = Math.min(derived.comboCap, state.combo + gain);
  state.comboExpiresAt = now + derived.comboDurationMs * decayFactor;
  if (state.combo > state.stats.bestCombo) {
    state.stats.bestCombo = state.combo;
    recordMetric(state, "bestCombo", state.combo, "max");
  }

  state.stats.totalClicks += 1;
  recordMetric(state, "clicks", 1);

  // Meters.
  state.heat = Math.min(derived.heatMax, state.heat + 4);
  state.focus = Math.min(derived.focusMax, state.focus + opts.precision * 6);
  state.energy = Math.min(derived.energyMax, state.energy + 0.35);

  const perfect = opts.precision >= 0.8;
  if (perfect) {
    state.stats.perfectClicks += 1;
    recordMetric(state, "perfectClicks", 1);
  }

  // Base payout. Recomputed rather than read from `derived` because the combo
  // just changed.
  const comboMultiplier = 1 + Math.min(state.combo, derived.comboCap) * 0.03 * derived.mods.mul.comboPower;
  let hearts = derived.mods.add.clickFlat * derived.mods.mul.click * derived.mods.mul.all * comboMultiplier;

  // Timing ring: a perfect tap is worth up to 75% more.
  hearts *= 1 + opts.precision * 0.75;
  // Charge: holding before releasing is worth up to double.
  hearts *= 1 + Math.min(1, opts.charge) * derived.chargeSpeed;
  // Heat: sustained tapping ramps up to +50%.
  hearts *= 1 + (state.heat / Math.max(1, derived.heatMax)) * 0.5;

  const noCrit = challenge?.rule === "no_crit" || challenge?.rule === "hardcore";
  let crit = false;
  let mega = false;
  let chained = 0;

  if (!noCrit) {
    const critChance = perfect ? Math.min(1, derived.critChance * 1.5) : derived.critChance;
    if (Math.random() < critChance) {
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
      // Critical chains: each extra link is worth a little less.
      let chainChance = derived.critChainChance;
      while (chainChance > 0 && Math.random() < chainChance && chained < 8) {
        chained += 1;
        hearts *= 1 + derived.critMultiplier * 0.35;
        chainChance *= 0.6;
      }
      state.energy = Math.min(derived.energyMax, state.energy + 1.5);
    }
  }

  if (challenge?.rule === "combo_only" && state.combo < 20) hearts = 0;
  if (challenge?.rule === "golden_only") hearts = 0;
  if (challenge?.rule === "pet_only") hearts = 0;
  if (challenge?.rule === "offline_only") hearts = 0;

  const overflow = state.wallet.hearts > derived.jarCapacity;
  if (overflow) {
    // Overflow does not waste hearts; it pays a bonus instead.
    hearts *= 1.2;
  }

  const earned = earnHearts(state, hearts, crit ? "crit" : "click");

  return {
    hearts: earned,
    crit,
    mega,
    perfect,
    chained,
    combo: state.combo,
    comboBroken,
    overflow,
    x: opts.x,
    y: opts.y,
  };
}

/* ------------------------------------------------------------------ */
/* Floating hearts                                                     */
/* ------------------------------------------------------------------ */

export function spawnFloating(
  state: GameState,
  kind: FloatingHeart["kind"],
  now: number,
  lifetimeMs = 9_000,
): FloatingHeart {
  const heart: FloatingHeart = {
    id: crypto.randomUUID(),
    kind,
    spawnedAt: now,
    expiresAt: now + lifetimeMs,
    x: 8 + Math.random() * 84,
    y: 12 + Math.random() * 62,
    hp: kind === "shielded" ? 4 : 1,
  };
  // Hard cap so a long session cannot accumulate an unbounded list.
  if (state.floating.length >= 12) state.floating.shift();
  state.floating.push(heart);
  return heart;
}

export interface FloatingReward {
  label: string;
  hearts: number;
  currencies: Partial<Record<CurrencyId, number>>;
  collectible?: [string, string];
  buff?: { label: string; mods: Mods; durationMs: number };
}

export function collectFloating(
  state: GameState,
  derived: Derived,
  id: string,
  now: number,
): FloatingReward | null {
  const index = state.floating.findIndex((f) => f.id === id);
  if (index < 0) return null;
  const heart = state.floating[index];
  heart.hp -= 1;
  if (heart.hp > 0) return null;
  state.floating.splice(index, 1);

  const luck = 1 + derived.luck;
  const perSecond = Math.max(1, derived.heartsPerSecond);
  const perClick = Math.max(1, derived.heartsPerClick);

  switch (heart.kind) {
    case "golden": {
      const value = safe((perSecond * 90 + perClick * 40) * derived.mods.mul.golden * luck);
      earnHearts(state, value, "golden");
      state.stats.goldenCaught += 1;
      recordMetric(state, "golden", 1);
      const golden = 1 + (Math.random() < 0.25 ? 1 : 0);
      addCurrency(state, "golden", golden);
      return { label: "Golden heart", hearts: value, currencies: { golden } };
    }
    case "treasure": {
      state.stats.treasuresOpened += 1;
      recordMetric(state, "treasures", 1);
      const mult = derived.mods.mul.treasure * luck;
      const currencies: Partial<Record<CurrencyId, number>> = {
        fragments: Math.ceil(40 * mult),
        dust: Math.ceil(30 * mult),
        treats: Math.ceil(10 * mult),
      };
      if (Math.random() < 0.3) currencies.shards = Math.ceil(4 * mult);
      for (const [currency, amount] of Object.entries(currencies)) {
        addCurrency(state, currency as CurrencyId, amount as number);
      }
      const value = safe(perSecond * 240 * mult);
      earnHearts(state, value, "treasure");
      // Treasure hearts are how the love letters collection fills up.
      const letters = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"];
      const owned = state.collections["letters"] ?? [];
      const missing = letters.filter((l) => !owned.includes(l));
      let collectible: [string, string] | undefined;
      if (missing.length > 0 && Math.random() < 0.25) {
        collectible = ["letters", missing[Math.floor(Math.random() * missing.length)]];
      }
      return { label: "Treasure heart", hearts: value, currencies, collectible };
    }
    case "mimic": {
      // Costs you the combo, but pays well if you have one to lose.
      const value = safe(perClick * state.combo * 12 * luck);
      earnHearts(state, value, "golden");
      state.combo = 0;
      state.comboExpiresAt = 0;
      return { label: "Mimic heart", hearts: value, currencies: {} };
    }
    case "healing": {
      state.combo = Math.min(derived.comboCap, state.combo + 15);
      state.comboExpiresAt = now + derived.comboDurationMs * 2;
      state.energy = derived.energyMax;
      return { label: "Healing heart", hearts: 0, currencies: {} };
    }
    case "exploding": {
      const value = safe(perClick * 400 * luck);
      earnHearts(state, value, "golden");
      return {
        label: "Exploding heart",
        hearts: value,
        currencies: {},
        buff: { label: "Blast", mods: { mul: { click: 2 } }, durationMs: 12_000 },
      };
    }
    case "shielded": {
      const value = safe(perSecond * 300 * luck);
      earnHearts(state, value, "golden");
      addCurrency(state, "fragments", Math.ceil(80 * luck));
      return { label: "Shielded heart", hearts: value, currencies: { fragments: Math.ceil(80 * luck) } };
    }
    default:
      return null;
  }
}

function rollFloatingKind(state: GameState, derived: Derived): FloatingHeart["kind"] {
  const roll = Math.random();
  const treasure = derived.treasureChance * 12;
  if (roll < treasure) return "treasure";
  if (roll < treasure + 0.06) return "exploding";
  if (roll < treasure + 0.1) return "shielded";
  if (roll < treasure + 0.13 && state.combo > 20) return "mimic";
  if (roll < treasure + 0.17 && state.combo === 0) return "healing";
  return "golden";
}

/* ------------------------------------------------------------------ */
/* The tick                                                            */
/* ------------------------------------------------------------------ */

export interface TickResult {
  earned: number;
  spawned: FloatingHeart[];
  expired: number;
  comboBroken: boolean;
}

/** Advance the simulation by `dtMs`. Called about ten times a second. */
export function tick(state: GameState, dtMs: number, now: number): TickResult {
  const dt = Math.max(0, Math.min(dtMs, 5_000)) / 1000;
  const derived = derive(state, now);
  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;

  pruneBuffs(state, now);

  // Passive hearts.
  let earned = 0;
  const passiveOff = challenge?.rule === "no_passive" || challenge?.rule === "active_only" || challenge?.rule === "hardcore";
  if (!passiveOff && derived.heartsPerSecond > 0) {
    earned = earnHearts(state, derived.heartsPerSecond * dt, "passive");
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

  // Meters drift back down when you stop.
  state.heat = Math.max(0, state.heat - dt * 8);
  state.focus = Math.max(0, state.focus - dt * 4);
  state.energy = Math.min(derived.energyMax, state.energy + dt * 0.8 * derived.mods.mul.energyRegen);

  // Floating hearts.
  const spawned: FloatingHeart[] = [];
  const chance = derived.goldenChancePerSecond * dt;
  if (Math.random() < chance) {
    spawned.push(spawnFloating(state, rollFloatingKind(state, derived), now));
  }
  const before = state.floating.length;
  state.floating = state.floating.filter((f) => f.expiresAt > now);
  const expired = before - state.floating.length;

  // Automatic golden collection, once ascension unlocks it.
  if (hasFlag(state, "auto_golden")) {
    for (const heart of [...state.floating]) {
      if (heart.kind === "golden") collectFloating(state, derived, heart.id, now);
    }
  }

  // Automatic ability activation.
  if (state.settings.autoSkills && hasFlag(state, "auto_skill")) {
    for (const [id, skill] of Object.entries(state.skills)) {
      const def = SKILL_BY_ID[id];
      if (!def || !skill.auto || skill.level < def.autoLevel) continue;
      if (skillReady(state, id, now)) activateSkill(state, id, now);
    }
  }

  state.lastTickAt = now;
  state.updatedAt = now;

  return { earned, spawned, expired, comboBroken };
}

/* ------------------------------------------------------------------ */
/* Abilities                                                           */
/* ------------------------------------------------------------------ */

export interface SkillActivation {
  ok: boolean;
  reason?: string;
  instantHearts?: number;
  spawned?: number;
  label?: string;
}

/** A skill that has never been used is ready, whatever the clock says. */
function cooldownRemaining(state: GameState, id: string, now: number): number {
  const def = SKILL_BY_ID[id];
  const skill = state.skills[id];
  if (!def || !skill) return Infinity;
  if (skill.lastUsedAt <= 0) return 0;
  const cooldown = def.cooldownMs * derive(state, now).skillCooldown;
  return Math.max(0, cooldown - (now - skill.lastUsedAt));
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

  const challenge = state.activeChallenge ? CHALLENGE_BY_ID[state.activeChallenge.defId] : null;
  if (challenge?.rule === "active_only" || challenge?.rule === "hardcore") {
    return { ok: false, reason: "Abilities are disabled in this challenge" };
  }

  const derived = derive(state, now);
  if (cooldownRemaining(state, id, now) > 0) return { ok: false, reason: "Still recovering" };

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
    case "spawn_golden": {
      for (let i = 0; i < power; i++) spawnFloating(state, "golden", now, 12_000);
      return { ok: true, spawned: power, label: def.name };
    }
    case "spawn_treasure": {
      for (let i = 0; i < power; i++) spawnFloating(state, "treasure", now, 12_000);
      return { ok: true, spawned: power, label: def.name };
    }
    case "reset_cooldowns": {
      for (const [otherId, other] of Object.entries(state.skills)) {
        if (otherId !== id) other.lastUsedAt = 0;
      }
      state.energy = derived.energyMax;
      return { ok: true, label: def.name };
    }
    case "fill_energy": {
      state.energy = derived.energyMax;
      state.focus = derived.focusMax;
      return { ok: true, label: def.name };
    }
    case "max_combo": {
      state.combo = derived.comboCap;
      state.comboExpiresAt = now + derived.comboDurationMs * 3;
      return { ok: true, label: def.name };
    }
    case "boss_strike": {
      if (!state.activeBoss) return { ok: false, reason: "No boss in front of you" };
      state.activeBoss.hp = Math.max(0, state.activeBoss.hp - state.activeBoss.maxHp * power);
      return { ok: true, label: def.name };
    }
    case "free_upgrade": {
      return { ok: true, spawned: power, label: def.name };
    }
    case "offline_recall": {
      const value = safe(derived.heartsPerSecond * (power / 1000) * derived.offlineRate);
      earnHearts(state, value, "offline");
      return { ok: true, instantHearts: value, label: def.name };
    }
    case "mission_progress": {
      for (const mission of state.missions) {
        if (mission.claimed) continue;
        mission.progress = safe(mission.progress + mission.goal * power);
      }
      return { ok: true, label: def.name };
    }
    case "challenge_progress": {
      if (state.activeChallenge) {
        const cdef = CHALLENGE_BY_ID[state.activeChallenge.defId];
        if (cdef) state.activeChallenge.score = safe(state.activeChallenge.score + cdef.goal.amount * power);
      }
      return { ok: true, label: def.name };
    }
    case "pet_treats": {
      addCurrency(state, "treats", power);
      addCurrency(state, "shards", Math.ceil(power / 5));
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
  golden: number;
  treats: number;
  cappedByWindow: boolean;
  /** True when the device clock moved backwards, which we ignore. */
  clockSuspicious: boolean;
}

/**
 * Work out what the jar produced while the app was closed.
 *
 * The elapsed time is taken from the device clock but bounded on both sides:
 * negative elapsed time is discarded, and the total is capped by the offline
 * window, so winding a phone forward buys at most one full window rather than
 * unlimited hearts. The server independently rejects impossible progress.
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
    return { awayMs, countedMs: 0, hearts: 0, golden: 0, treats: 0, cappedByWindow, clockSuspicious };
  }

  const seconds = countedMs / 1000;
  const hearts = safe(derived.heartsPerSecond * seconds * derived.offlineRate);
  // A trickle of the other currencies too, so time away is never dead time.
  const golden = Math.floor(seconds / 3_600) * (1 + Math.floor(derived.luck * 4));
  const treats = Math.floor(seconds / 900);

  return { awayMs, countedMs, hearts, golden, treats, cappedByWindow, clockSuspicious };
}

export function claimOffline(state: GameState, report: OfflineReport, now: number): void {
  if (report.hearts > 0) earnHearts(state, report.hearts, "offline");
  if (report.golden > 0) addCurrency(state, "golden", report.golden);
  if (report.treats > 0) addCurrency(state, "treats", report.treats);
  state.lastSeenAt = now;
  recordMetric(state, "offlineClaims", 1);
  pushLog(state, "Offline", `${Math.round(report.countedMs / 60_000)} minutes away`);
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
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
      if (def.titleAt && def.titleAt.tier === t + 1) {
        grantTitle(state, def.titleAt.title);
      }
    }
  }
  return unlocked;
}

/* ------------------------------------------------------------------ */
/* Rewards                                                             */
/* ------------------------------------------------------------------ */

export function grantReward(
  state: GameState,
  reward: Record<string, unknown> | undefined,
  multiplier = 1,
): void {
  if (!reward) return;
  for (const [key, value] of Object.entries(reward)) {
    if (key === "eggs" && value && typeof value === "object") {
      for (const [eggId, count] of Object.entries(value as Record<string, number>)) {
        state.eggs[eggId] = (state.eggs[eggId] ?? 0) + count;
      }
      continue;
    }
    if (key === "title" && typeof value === "string") {
      grantTitle(state, value);
      continue;
    }
    if (key === "collectible" && Array.isArray(value)) {
      const [collection, item] = value as [string, string];
      grantCollectible(state, collection, item);
      continue;
    }
    if (key === "pet") continue; // handled by the caller, which needs to roll a trait
    if (typeof value === "number") {
      addCurrency(state, key as CurrencyId, Math.max(1, Math.floor(value * multiplier)));
    }
  }
}

export function grantTitle(state: GameState, title: string): void {
  const id = title.toLowerCase().replace(/[^a-z]+/g, "_");
  if (!state.titles.includes(title)) state.titles.push(title);
  grantCollectible(state, "titles", id);
}

export function grantCollectible(state: GameState, collection: string, item: string): boolean {
  const owned = state.collections[collection] ?? [];
  if (owned.includes(item)) return false;
  state.collections[collection] = [...owned, item];
  return true;
}

export function pushLog(state: GameState, label: string, detail: string): void {
  state.log = [
    ...state.log.slice(-39),
    { id: crypto.randomUUID(), at: Date.now(), label, detail },
  ];
}

/* ------------------------------------------------------------------ */
/* Daily bonus and the day rollover                                    */
/* ------------------------------------------------------------------ */

export function claimDailyBonus(state: GameState, day: string): { hearts: number; golden: number; streak: number } | null {
  if (state.dailyBonus.day === day) return null;
  const yesterday = new Date(`${day}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const continued = state.dailyBonus.day === yesterday.toISOString().slice(0, 10);
  const streak = continued ? state.dailyBonus.streak + 1 : 1;
  state.dailyBonus = { day, streak };

  const derived = derive(state);
  const hearts = safe(Math.max(1_000, derived.heartsPerSecond * 900) * (1 + streak * 0.15));
  const golden = 3 + Math.min(20, streak);
  earnHearts(state, hearts, "event");
  addCurrency(state, "golden", golden);
  addCurrency(state, "treats", 10 + streak * 2);
  pushLog(state, "Daily bonus", `Day ${streak} of your streak`);
  return { hearts, golden, streak };
}

/** Roll the statistics history over into a new day. */
export function rollDay(state: GameState, day: string): void {
  const last = state.stats.history[state.stats.history.length - 1];
  if (last && last.day === day) return;
  state.stats.history = [
    ...state.stats.history.slice(-59),
    { day, hearts: 0, clicks: 0, bestCombo: 0 },
  ];
}

export function recordDay(state: GameState, day: string, hearts: number, clicks: number, combo: number): void {
  rollDay(state, day);
  const entry = state.stats.history[state.stats.history.length - 1];
  if (!entry) return;
  entry.hearts = safe(entry.hearts + hearts);
  entry.clicks += clicks;
  entry.bestCombo = Math.max(entry.bestCombo, combo);
}

/* ------------------------------------------------------------------ */
/* Seeded daily challenge                                              */
/* ------------------------------------------------------------------ */

/** The daily seeded challenge picks the same modifiers for both partners. */
export function dailySeed(day: string): { multiplier: number; rule: string } {
  const roll = seededRandom(`seed:${day}`);
  const rules = [
    "Criticals are twice as strong",
    "Combos never decay below ten",
    "Golden hearts appear constantly",
    "Passive output is doubled",
    "Every tap counts as perfectly timed",
  ];
  return {
    multiplier: 2 + Math.floor(roll * 4),
    rule: rules[Math.floor(roll * rules.length) % rules.length],
  };
}

/** Which world the player is standing in, resolved safely. */
export function currentWorld(state: GameState) {
  return WORLD_BY_ID[state.world] ?? WORLD_BY_ID["bedroom"];
}
