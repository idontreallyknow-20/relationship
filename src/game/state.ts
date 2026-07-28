import type { CreatureInstance, GameSettings, GameState, GameStats, Person } from "./types";
import { LEGACY_CURRENCY_MAP, ZERO_WALLET } from "./config/currencies";
import { STARTING_COLLECTIBLES } from "./config/awards";
import { SKILLS } from "./config/skills";
import { STARTER } from "./config/creatures";
import { LEGACY_WORLD_MAP, VESSELS } from "./config/vessels";

export const SAVE_VERSION = 4;

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
  drifters: true,
  autoSkills: false,
  tutorialDone: false,
};

function emptyStats(now: number): GameStats {
  return {
    totalClicks: 0, criticalClicks: 0, megaCriticalClicks: 0, perfectClicks: 0,
    chargedClicks: 0, bestCombo: 0, comboFinishers: 0,
    heartsFromClicks: 0, heartsFromPassive: 0, heartsFromCrits: 0, heartsFromSkills: 0,
    heartsFromCreatures: 0, heartsFromOffline: 0, heartsFromTogether: 0, heartsFromDrifters: 0,
    cracks: 0, collects: 0, driftersOpened: 0,
    upgradesBought: 0, skillsUsed: 0,
    creaturesArrived: 0, creaturesEvolved: 0, itemsMade: 0, vesselsUnlocked: 1,
    challengesCompleted: 0, missionsCompleted: 0, achievementsUnlocked: 0, minigamesPlayed: 0,
    fastestTideChangeMs: null, fastestNewWaterMs: null,
    longestSessionMs: 0, bestSessionHearts: 0, sessionStartedAt: now, sessionHearts: 0,
    history: [],
  };
}

/** The creature each person already has, in the jar, from the first second. */
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
    slot: 0,
    lastActedAt: now,
    arrivedAt: now,
  };
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
    slots: [starter.id, null],
    codex: [starter.defId],

    vessel: "jam_jar",
    vesselsUnlocked: ["jam_jar"],
    water: "default",

    settled: [],
    drifter: null,

    challenges: {},
    activeChallenge: null,

    missions: [],
    storyProgress: {},

    achievements: {},
    collections: JSON.parse(JSON.stringify(STARTING_COLLECTIBLES)),

    tideLevel: 0,
    giftLeft: null,
    giftWaiting: null,

    combo: 0,
    comboExpiresAt: 0,
    charge: 0,
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
 * became seven. Nothing is thrown away without being converted.
 */
export function migrateSave(raw: unknown, person: Person = "cami"): GameState {
  const fresh = createGameState(Date.now(), person);
  if (!raw || typeof raw !== "object") return fresh;
  const old = raw as Record<string, unknown> & { version?: number };
  const version = old.version ?? 0;

  const merged: GameState = {
    ...fresh,
    ...(old as Partial<GameState>),
    version: SAVE_VERSION,
    owner: person,
    wallet: { ...fresh.wallet },
    lifetime: { ...fresh.lifetime },
    upgrades: {},
    moonUpgrades: { ...((old.moonUpgrades as Record<string, number>) ?? {}) },
    starUpgrades: { ...((old.starUpgrades as Record<string, number>) ?? {}) },
    skills: { ...fresh.skills, ...((old.skills as GameState["skills"]) ?? {}) },
    creatures: { ...((old.creatures as GameState["creatures"]) ?? {}) },
    items: { ...((old.items as GameState["items"]) ?? {}) },
    slots: Array.isArray(old.slots) ? (old.slots as (string | null)[]) : [...fresh.slots],
    codex: Array.isArray(old.codex) ? (old.codex as string[]) : [],
    settled: [],
    drifter: null,
    challenges: { ...((old.challenges as GameState["challenges"]) ?? {}) },
    missions: Array.isArray(old.missions) ? (old.missions as GameState["missions"]) : [],
    storyProgress: { ...((old.storyProgress as Record<string, number>) ?? {}) },
    achievements: { ...((old.achievements as GameState["achievements"]) ?? {}) },
    collections: mergeCollections(old.collections as Record<string, string[]> | undefined),
    buffs: Array.isArray(old.buffs) ? (old.buffs as GameState["buffs"]) : [],
    stats: { ...fresh.stats, ...((old.stats as Partial<GameStats>) ?? {}) },
    settings: { ...fresh.settings, ...((old.settings as Partial<GameSettings>) ?? {}) },
    log: Array.isArray(old.log) ? (old.log as GameState["log"]).slice(-40) : [],
    combo: 0,
    comboExpiresAt: 0,
    charge: 0,
  };

  // Currencies: fourteen names collapse onto seven.
  const oldWallet = (old.wallet as Record<string, number>) ?? {};
  const oldLifetime = (old.lifetime as Record<string, number>) ?? {};
  for (const [from, to] of Object.entries(LEGACY_CURRENCY_MAP)) {
    const held = Number(oldWallet[from]);
    const earned = Number(oldLifetime[from]);
    if (Number.isFinite(held) && held > 0) merged.wallet[to] += held;
    if (Number.isFinite(earned) && earned > 0) merged.lifetime[to] += earned;
  }

  // Upgrade ids all changed. Rather than guess a mapping, refund what was
  // spent as hearts so nothing is silently lost.
  if (version < 4) {
    const oldUpgrades = (old.upgrades as Record<string, number>) ?? {};
    const levels = Object.values(oldUpgrades).reduce((sum, n) => sum + (Number(n) || 0), 0);
    if (levels > 0) {
      merged.wallet.hearts += levels * 500;
      merged.log = [
        ...merged.log.slice(-39),
        {
          id: crypto.randomUUID(),
          at: Date.now(),
          label: "Rebuilt",
          detail: `${levels} old upgrade levels refunded as hearts`,
        },
      ];
    }

    // Old pets and charms become the currencies that replaced them.
    const pets = Object.keys((old.pets as Record<string, unknown>) ?? {}).length;
    const charms = Object.keys((old.charms as Record<string, unknown>) ?? {}).length;
    if (pets > 0) merged.wallet.shells += pets * 120;
    if (charms > 0) merged.wallet.glass += charms * 200;

    // Worlds become the vessel that replaced them, keeping the furthest.
    const worlds = Array.isArray(old.worldsUnlocked) ? (old.worldsUnlocked as string[]) : [];
    const mapped = worlds.map((w) => LEGACY_WORLD_MAP[w]).filter(Boolean);
    merged.vesselsUnlocked = Array.from(new Set(["jam_jar", ...mapped]));
    const currentWorld = typeof old.world === "string" ? LEGACY_WORLD_MAP[old.world] : null;
    merged.vessel = currentWorld && merged.vesselsUnlocked.includes(currentWorld) ? currentWorld : "jam_jar";
    merged.water = "default";

    // Reset layer counts kept their meaning even though the names changed.
    merged.tideChanges = Number(old.rebirths) || 0;
    merged.newWaters = Number(old.ascensions) || 0;
  } else {
    merged.vesselsUnlocked = Array.isArray(old.vesselsUnlocked) && old.vesselsUnlocked.length > 0
      ? (old.vesselsUnlocked as string[])
      : ["jam_jar"];
    merged.vessel = typeof old.vessel === "string" ? old.vessel : "jam_jar";
    merged.water = typeof old.water === "string" ? old.water : "default";
    merged.upgrades = { ...((old.upgrades as Record<string, number>) ?? {}) };
  }

  // Everyone always has at least their own starter, in the jar.
  if (Object.keys(merged.creatures).length === 0) {
    const starter = starterCreature(person, Date.now());
    merged.creatures = { [starter.id]: starter };
    merged.slots = [starter.id, null];
    if (!merged.codex.includes(starter.defId)) merged.codex.push(starter.defId);
  }

  // A vessel that no longer exists would strand the player.
  if (!VESSELS.some((v) => v.id === merged.vessel)) merged.vessel = "jam_jar";

  // Guard against a corrupt save producing NaN that then spreads.
  for (const key of Object.keys(merged.wallet) as (keyof typeof merged.wallet)[]) {
    if (!Number.isFinite(merged.wallet[key])) merged.wallet[key] = 0;
    if (!Number.isFinite(merged.lifetime[key])) merged.lifetime[key] = 0;
  }
  if (!Number.isFinite(merged.runHearts)) merged.runHearts = 0;
  if (!Number.isFinite(merged.eraHearts)) merged.eraHearts = 0;
  if (!Number.isFinite(merged.tideLevel)) merged.tideLevel = 0;

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
