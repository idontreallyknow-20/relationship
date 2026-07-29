import type {
  AutobuyerState, CreatureInstance, GameSettings, GameState, GameStats, Person,
} from "./types";
import { ZERO_WALLET } from "./config/currencies";
import { STARTING_COLLECTIBLES } from "./config/awards";
import { SKILLS } from "./config/skills";
import { STARTER } from "./config/creatures";
import { FIRST_JAR } from "./config/jars";

export const SAVE_VERSION = 9;

/**
 * Saves older than this are not migrated, they are thrown away.
 *
 * Asked for directly, twice, and the right call both times.
 *
 * Version eight and earlier were a different game. They carry an eight tier
 * production chain, a floor with things sinking to it, and balances in three
 * currencies that no longer exist, none of which has anything to convert into:
 * there is no honest exchange rate between "twelve depths bought" and a jar you
 * fill and seal, because the first thing is not a smaller version of the
 * second, it is a different thing.
 *
 * Everything outside the jar is untouched. Messages, memories, letters, moods,
 * plans, drawings and the question history live in their own tables and are
 * not part of a game save.
 */
export const RESET_SAVES_BEFORE = 9;

export const DEFAULT_SETTINGS: GameSettings = {
  sound: true,
  ambient: false,
  haptics: true,
  screenShake: true,
  particles: "full",
  reducedMotion: false,
  batterySaver: false,
  numberFormat: "short",
  confirmRareSpends: true,
  buyAmount: 1,
  autoSkills: false,
  tutorialDone: false,
};

function emptyStats(now: number): GameStats {
  return {
    totalClicks: 0, criticalClicks: 0, megaCriticalClicks: 0, perfectClicks: 0,
    bestCombo: 0, comboFinishers: 0,
    heartsFromClicks: 0, heartsFromPassive: 0, heartsFromCrits: 0, heartsFromSkills: 0,
    heartsFromCreatures: 0, heartsFromOffline: 0, heartsFromTogether: 0, heartsFromShelf: 0,
    petDrops: 0, jarsSealed: 0,
    upgradesBought: 0, skillsUsed: 0,
    creaturesArrived: 0, creaturesEvolved: 0, itemsMade: 0, jarsUnlocked: 1,
    challengesCompleted: 0, missionsCompleted: 0, achievementsUnlocked: 0, minigamesPlayed: 0,
    fastestTideChangeMs: null, fastestNewWaterMs: null,
    longestSessionMs: 0, bestSessionHearts: 0, sessionStartedAt: now, sessionHearts: 0,
    history: [],
  };
}

/**
 * The pet each person already has, waiting rather than working.
 *
 * It used to be seated from the first second, and once the pets started
 * carrying hearts over that meant a brand new save had passive income before
 * anything had explained where income comes from: you opened the jar, did
 * nothing, and a "per second" figure appeared. That is the thing that made the
 * number confusing, not the number.
 *
 * It sits down when the pets rung arrives, which is the rung that explains it.
 */
function starterCreature(person: Person, now: number): CreatureInstance {
  return {
    id: crypto.randomUUID(),
    defId: STARTER[person],
    level: 1,
    xp: 0,
    fed: 80,
    name: null,
    trait: "eager",
    stars: 0,
    locked: true,
    itemId: null,
    slot: null,
    lastActedAt: now,
    arrivedAt: now,
  };
}

/** Every autobuyer exists from the start, off, and cheap to switch on. */
function freshAutobuyers(): Record<string, AutobuyerState> {
  const out: Record<string, AutobuyerState> = {};
  for (const target of ["upgrades", "shelf"]) {
    out[target] = { on: false, max: true, threshold: 1, lastRunAt: 0 };
  }
  return out;
}

export function createGameState(now: number = Date.now(), person: Person = "cami"): GameState {
  const starter = starterCreature(person, now);
  return {
    version: SAVE_VERSION,
    owner: person,
    createdAt: now,
    updatedAt: now,
    lastTickAt: now,
    lastSeenAt: now,

    wallet: { ...ZERO_WALLET },
    lifetime: { ...ZERO_WALLET },

    runHearts: 0,
    eraHearts: 0,
    runStartedAt: now,
    eraStartedAt: now,
    tideChanges: 0,
    newWaters: 0,

    upgrades: {},
    moonUpgrades: {},
    starUpgrades: {},
    skills: Object.fromEntries(
      SKILLS.map((s) => [s.id, { level: 0, lastUsedAt: 0, activeUntil: 0, auto: false }]),
    ),

    creatures: { [starter.id]: starter },
    items: {},
    slots: [null, null],
    codex: [starter.defId],

    sealed: [],
    shelfHearts: 0,
    shelfUpgrades: {},

    seas: 0,
    seaHearts: 0,
    seaStartedAt: now,
    sunUpgrades: {},

    dilation: { active: false, startedAt: now, hearts: 0, runs: 0 },
    dilationUpgrades: {},

    auto: { tap: true, tapCredit: 0 },
    autobuyers: freshAutobuyers(),

    jar: FIRST_JAR,
    jarsUnlocked: [FIRST_JAR],

    challenges: {},
    activeChallenge: null,

    missions: [],
    storyProgress: {},

    achievements: {},
    collections: JSON.parse(JSON.stringify(STARTING_COLLECTIBLES)),

    stageSeen: 0,
    stageReached: 0,
    stageAt: 0,

    meters: {},
    metersAt: now,

    tideLevel: 0,
    giftLeft: null,
    giftWaiting: null,

    combo: 0,
    comboExpiresAt: 0,
    buffs: [],

    dailyBonus: { day: null, streak: 0 },
    togetherRewards: { day: "", claimed: [] },

    stats: emptyStats(now),
    settings: { ...DEFAULT_SETTINGS },
    log: [],

    legacyClaimed: false,
  };
}

/**
 * Bring an older save up to date. Runs on every load, including saves that
 * came back from the server, so a device that was offline through a release
 * still opens.
 *
 * Version 4 is the re-theme: pets became otters and crabs, charms became one
 * rock or shell per creature, worlds became vessels, and fourteen currencies
 * became seven. Version 5 adds the depth chain underneath all of it.
 * Nothing is thrown away without being converted.
 */
export function migrateSave(raw: unknown, person: Person = "cami"): GameState {
  const fresh = createGameState(Date.now(), person);
  if (!raw || typeof raw !== "object") return fresh;
  const old = raw as Record<string, unknown> & { version?: number };
  const version = old.version ?? 0;

  // The clean slate. See `RESET_SAVES_BEFORE` for why.
  //
  // Every conversion branch that used to live below this line is gone with it:
  // there is nothing left to migrate *from*, because the only saves that reach
  // the code below were written by this version of the game. When there is a
  // version ten, the branch for it goes here.
  if (version < RESET_SAVES_BEFORE) return fresh;

  const merged: GameState = {
    ...fresh,
    ...(old as Partial<GameState>),
    version: SAVE_VERSION,
    owner: person,
    wallet: { ...fresh.wallet, ...((old.wallet as Record<string, number>) ?? {}) },
    lifetime: { ...fresh.lifetime, ...((old.lifetime as Record<string, number>) ?? {}) },
    upgrades: { ...((old.upgrades as Record<string, number>) ?? {}) },
    moonUpgrades: { ...((old.moonUpgrades as Record<string, number>) ?? {}) },
    starUpgrades: { ...((old.starUpgrades as Record<string, number>) ?? {}) },
    sunUpgrades: { ...((old.sunUpgrades as Record<string, number>) ?? {}) },
    shelfUpgrades: { ...((old.shelfUpgrades as Record<string, number>) ?? {}) },
    dilationUpgrades: { ...((old.dilationUpgrades as Record<string, number>) ?? {}) },
    // Spread fresh first so a skill or an autobuyer added since this save was
    // written arrives at its default rather than being absent.
    skills: { ...fresh.skills, ...((old.skills as GameState["skills"]) ?? {}) },
    autobuyers: { ...fresh.autobuyers, ...((old.autobuyers as GameState["autobuyers"]) ?? {}) },
    creatures: { ...((old.creatures as GameState["creatures"]) ?? {}) },
    items: { ...((old.items as GameState["items"]) ?? {}) },
    slots: Array.isArray(old.slots) ? (old.slots as (string | null)[]) : [...fresh.slots],
    codex: Array.isArray(old.codex) ? (old.codex as string[]) : [],
    sealed: Array.isArray(old.sealed) ? (old.sealed as GameState["sealed"]).slice(-200) : [],
    challenges: { ...((old.challenges as GameState["challenges"]) ?? {}) },
    missions: Array.isArray(old.missions) ? (old.missions as GameState["missions"]) : [],
    storyProgress: { ...((old.storyProgress as Record<string, number>) ?? {}) },
    achievements: { ...((old.achievements as GameState["achievements"]) ?? {}) },
    collections: mergeCollections(old.collections as Record<string, string[]> | undefined),
    buffs: Array.isArray(old.buffs) ? (old.buffs as GameState["buffs"]) : [],
    log: Array.isArray(old.log) ? (old.log as GameState["log"]).slice(-40) : [],
    settings: { ...fresh.settings, ...((old.settings as GameSettings) ?? {}) },
    stats: { ...fresh.stats, ...((old.stats as GameStats) ?? {}) },
  };

  // A jar that is no longer in the list, or a save that predates one, falls
  // back to the first rather than rendering nothing.
  if (!Array.isArray(merged.jarsUnlocked) || merged.jarsUnlocked.length === 0) {
    merged.jarsUnlocked = [FIRST_JAR];
  }
  if (!merged.jarsUnlocked.includes(merged.jar)) merged.jar = FIRST_JAR;

  // NaN guards. A single bad number in a save used to spread through every
  // multiplier that touched it and show up somewhere else entirely.
  for (const key of Object.keys(merged.wallet) as (keyof typeof merged.wallet)[]) {
    if (!Number.isFinite(merged.wallet[key]) || merged.wallet[key] < 0) merged.wallet[key] = 0;
    if (!Number.isFinite(merged.lifetime[key]) || merged.lifetime[key] < 0) merged.lifetime[key] = 0;
  }
  for (const key of ["runHearts", "eraHearts", "seaHearts", "shelfHearts", "tideLevel"] as const) {
    if (!Number.isFinite(merged[key]) || (merged[key] as number) < 0) {
      (merged[key] as number) = 0;
    }
  }
  merged.shelfHearts = merged.sealed.reduce((sum, jar) => {
    const value = Number(jar?.hearts) || 0;
    return sum + Math.max(0, value);
  }, 0);

  return merged;
}

function mergeCollections(stored: Record<string, string[]> | undefined): Record<string, string[]> {
  const base: Record<string, string[]> = JSON.parse(JSON.stringify(STARTING_COLLECTIBLES));
  if (!stored) return base;
  for (const [key, items] of Object.entries(stored)) {
    if (!Array.isArray(items) || !base[key]) continue;
    base[key] = Array.from(new Set([...base[key], ...items]));
  }
  return base;
}
