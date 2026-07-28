import type { GameState, GameSettings, GameStats } from "./types";
import { ZERO_WALLET } from "./config/currencies";
import { STARTING_COLLECTIBLES } from "./config/awards";
import { SKILLS } from "./config/skills";

export const SAVE_VERSION = 3;

export const DEFAULT_SETTINGS: GameSettings = {
  sound: true,
  music: false,
  haptics: true,
  screenShake: true,
  particles: "full",
  reducedMotion: false,
  batterySaver: false,
  numberFormat: "short",
  showDamageNumbers: true,
  confirmRareSpends: true,
  buyAmount: 1,
  competitionOptIn: true,
  autoSkills: false,
};

function emptyStats(now: number): GameStats {
  return {
    totalClicks: 0,
    criticalClicks: 0,
    megaCriticalClicks: 0,
    perfectClicks: 0,
    bestCombo: 0,
    comboFinishers: 0,
    heartsFromClicks: 0,
    heartsFromPassive: 0,
    heartsFromCrits: 0,
    heartsFromSkills: 0,
    heartsFromPets: 0,
    heartsFromOffline: 0,
    heartsFromPartner: 0,
    heartsFromBosses: 0,
    heartsFromGolden: 0,
    goldenCaught: 0,
    treasuresOpened: 0,
    upgradesBought: 0,
    skillsUsed: 0,
    eggsOpened: 0,
    petsEvolved: 0,
    petsFused: 0,
    charmsCrafted: 0,
    charmsSalvaged: 0,
    bossesDefeated: 0,
    challengesCompleted: 0,
    missionsCompleted: 0,
    achievementsUnlocked: 0,
    minigamesPlayed: 0,
    fastestRebirthMs: null,
    fastestAscensionMs: null,
    longestSessionMs: 0,
    bestSessionHearts: 0,
    sessionStartedAt: now,
    sessionHearts: 0,
    history: [],
  };
}

export function createGameState(now: number = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
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
    rebirths: 0,
    ascensions: 0,

    upgrades: {},
    rebirthUpgrades: {},
    ascensionUpgrades: {},
    skills: Object.fromEntries(
      SKILLS.map((s) => [s.id, { level: 0, lastUsedAt: 0, activeUntil: 0, auto: false }]),
    ),

    pets: {},
    petLoadouts: [
      { name: "Main", slots: [null, null, null] },
      { name: "Offline", slots: [null, null, null] },
      { name: "Bosses", slots: [null, null, null] },
    ],
    activeLoadout: 0,
    eggs: {},
    pity: {},
    petCodex: [],

    charms: {},
    equipped: {},

    world: "bedroom",
    worldsUnlocked: ["bedroom"],

    bosses: {},
    activeBoss: null,

    challenges: {},
    activeChallenge: null,

    missions: [],
    storyProgress: {},

    achievements: {},
    collections: JSON.parse(JSON.stringify(STARTING_COLLECTIBLES)),
    titles: ["newcomer"],
    activeTitle: null,

    events: {},
    shopPurchases: [],

    combo: 0,
    comboExpiresAt: 0,
    heat: 0,
    focus: 0,
    energy: 0,
    charge: 0,
    buffs: [],
    floating: [],

    dailyBonus: { day: null, streak: 0 },
    partnerRewards: { day: "", claimed: [] },

    stats: emptyStats(now),
    settings: { ...DEFAULT_SETTINGS },
    log: [],

    legacyClaimed: false,
    syncedLifetime: 0,
    syncedClicks: 0,
  };
}

/**
 * Bring an older save up to date. Runs on every load, including saves that
 * came back from the server, so a device that was offline through two
 * releases still opens.
 */
export function migrateSave(raw: unknown): GameState {
  const fresh = createGameState();
  if (!raw || typeof raw !== "object") return fresh;
  const old = raw as Partial<GameState> & { version?: number };

  // Deep merge, preferring the stored value where it exists and has the right
  // shape. Anything the save does not know about takes the new default.
  const merged: GameState = {
    ...fresh,
    ...old,
    version: SAVE_VERSION,
    wallet: { ...fresh.wallet, ...(old.wallet ?? {}) },
    lifetime: { ...fresh.lifetime, ...(old.lifetime ?? {}) },
    upgrades: { ...(old.upgrades ?? {}) },
    rebirthUpgrades: { ...(old.rebirthUpgrades ?? {}) },
    ascensionUpgrades: { ...(old.ascensionUpgrades ?? {}) },
    skills: { ...fresh.skills, ...(old.skills ?? {}) },
    pets: { ...(old.pets ?? {}) },
    petLoadouts: Array.isArray(old.petLoadouts) && old.petLoadouts.length > 0 ? old.petLoadouts : fresh.petLoadouts,
    eggs: { ...(old.eggs ?? {}) },
    pity: { ...(old.pity ?? {}) },
    petCodex: Array.isArray(old.petCodex) ? old.petCodex : [],
    charms: { ...(old.charms ?? {}) },
    equipped: { ...(old.equipped ?? {}) },
    worldsUnlocked: Array.isArray(old.worldsUnlocked) && old.worldsUnlocked.length > 0 ? old.worldsUnlocked : ["bedroom"],
    bosses: { ...(old.bosses ?? {}) },
    challenges: { ...(old.challenges ?? {}) },
    missions: Array.isArray(old.missions) ? old.missions : [],
    storyProgress: { ...(old.storyProgress ?? {}) },
    achievements: { ...(old.achievements ?? {}) },
    collections: mergeCollections(old.collections),
    titles: Array.isArray(old.titles) && old.titles.length > 0 ? old.titles : ["newcomer"],
    events: { ...(old.events ?? {}) },
    shopPurchases: Array.isArray(old.shopPurchases) ? old.shopPurchases : [],
    buffs: Array.isArray(old.buffs) ? old.buffs : [],
    floating: [],
    stats: { ...fresh.stats, ...(old.stats ?? {}) },
    settings: { ...fresh.settings, ...(old.settings ?? {}) },
    log: Array.isArray(old.log) ? old.log.slice(-40) : [],
    dailyBonus: old.dailyBonus ?? fresh.dailyBonus,
    partnerRewards: old.partnerRewards ?? fresh.partnerRewards,
  };

  // Version specific fixes.
  if ((old.version ?? 0) < 2) {
    // v1 stored a single pet slot list rather than named loadouts.
    merged.petLoadouts = fresh.petLoadouts;
    merged.activeLoadout = 0;
  }
  if ((old.version ?? 0) < 3) {
    // v2 did not separate era hearts from run hearts.
    merged.eraHearts = Math.max(merged.eraHearts ?? 0, merged.runHearts ?? 0);
    merged.eraStartedAt = merged.eraStartedAt || merged.runStartedAt || merged.createdAt;
  }

  // Guard against a corrupt save producing NaN that then spreads.
  for (const key of Object.keys(merged.wallet) as (keyof typeof merged.wallet)[]) {
    if (!Number.isFinite(merged.wallet[key])) merged.wallet[key] = 0;
    if (!Number.isFinite(merged.lifetime[key])) merged.lifetime[key] = 0;
  }
  if (!Number.isFinite(merged.runHearts)) merged.runHearts = 0;
  if (!Number.isFinite(merged.eraHearts)) merged.eraHearts = 0;
  merged.combo = 0;
  merged.comboExpiresAt = 0;

  return merged;
}

function mergeCollections(stored: Record<string, string[]> | undefined): Record<string, string[]> {
  const base: Record<string, string[]> = JSON.parse(JSON.stringify(STARTING_COLLECTIBLES));
  if (!stored) return base;
  for (const [key, items] of Object.entries(stored)) {
    if (!Array.isArray(items)) continue;
    base[key] = Array.from(new Set([...(base[key] ?? []), ...items]));
  }
  return base;
}
