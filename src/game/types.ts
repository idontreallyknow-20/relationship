// The shape of a Love Jar save, and the vocabulary every system speaks.
//
// Content lives in `src/game/config`. Nothing in here knows about a specific
// upgrade or creature.

import type { Feature } from "./config/stages";

export type Person = "cami" | "joseph";

export interface DilationState {
  active: boolean;
  startedAt: number;
  hearts: number;
  /** How many stretches have been finished, which sets the bar for the next. */
  runs: number;
}

export type CurrencyId =
  | "hearts"
  | "ribbons"
  | "keepsakes"
  | "moons"
  | "stars"
  | "suns"
  | "hours";

/** Stats that contributors add to. Sums across every source. */
export type AddStat =
  | "clickFlat"
  | "cpsFlat"
  | "critChance"
  | "megaCritChance"
  | "comboCap"
  | "comboDurationMs"
  | "comboStart"
  | "comboShield"
  | "critChainChance"
  | "luck"
  | "offlineHours"
  | "capacity"
  | "creatureSlots"
  | "abilitySlots"
  | "startingUpgrades"
  | "freeUpgradeChance"
  // The shelf.
  | "sealKeep"
  | "autoSeal"
  // Automation.
  | "autoTapsPerSecond"
  | "autobuyerSpeed";

/** Stats that contributors multiply. Products across every source. */
export type MulStat =
  | "all"
  | "click"
  | "cps"
  | "crit"
  | "megaCrit"
  | "comboGain"
  | "comboPower"
  // The pets, who now sit around the jar rather than inside it.
  | "petSpeed"
  | "petValue"
  | "pairBonus"
  | "creaturePower"
  | "creatureXp"
  // Currencies.
  | "ribbonGain"
  | "keepsakeGain"
  | "moonGain"
  | "starGain"
  // The jar and the shelf.
  | "shelfRate"
  | "jarCapacity"
  // Everything else.
  | "offline"
  | "cost"
  | "skillDuration"
  | "skillCooldown"
  | "missionReward"
  | "sunGain"
  | "hourGain";

export interface Mods {
  add?: Partial<Record<AddStat, number>>;
  mul?: Partial<Record<MulStat, number>>;
}

/* ------------------------------------------------------------------ */
/* Things that live in the jar                                         */
/* ------------------------------------------------------------------ */

export interface CreatureInstance {
  id: string;
  defId: string;
  level: number;
  xp: number;
  /** Falls over time, raised by feeding. Never drops a creature to nothing. */
  fed: number;
  name: string | null;
  trait: string;
  /** Molts for crabs, growth for otters. */
  stars: number;
  locked: boolean;
  /** The rock an otter carries, or the shell a crab wears. */
  itemId: string | null;
  /** Which slot in the jar, or null when it is out. */
  slot: number | null;
  lastActedAt: number;
  arrivedAt: number;
}

export interface ItemInstance {
  id: string;
  kind: "rock" | "shell";
  defId: string;
  rarity: ItemRarity;
  level: number;
  affixes: { stat: AddStat | MulStat; kind: "add" | "mul"; value: number }[];
  locked: boolean;
  createdAt: number;
}

export type ItemRarity = "plain" | "smooth" | "banded" | "opaline" | "moonstone";

/**
 * A jar that was filled, sealed and put on the shelf.
 *
 * It keeps paying a share of what was in it, forever, which is why sealing
 * never destroys anything: the hearts are moved rather than spent.
 */
export interface SealedJar {
  jarId: string;
  hearts: number;
  at: number;
}

export interface SkillState {
  level: number;
  lastUsedAt: number;
  activeUntil: number;
  auto: boolean;
}

export interface Buff {
  id: string;
  source: string;
  label: string;
  mods: Mods;
  expiresAt: number;
}

export interface MissionInstance {
  id: string;
  defId: string;
  goal: number;
  progress: number;
  claimed: boolean;
  period: string;
  rerolled: boolean;
}

export interface ChallengeRun {
  defId: string;
  startedAt: number;
  endsAt: number | null;
  score: number;
  restore: string | null;
}

export interface RewardLogEntry {
  id: string;
  at: number;
  label: string;
  detail: string;
}

/** The jar playing itself. */
export interface AutoState {
  /** Tap on your behalf. */
  tap: boolean;
  /** Carries the fractional part of a tap between ticks. */
  tapCredit: number;
}

/** One autobuyer. `target` names what it buys. */
export interface AutobuyerState {
  on: boolean;
  /** Buy as many as affordable rather than one at a time. */
  max: boolean;
  /** Spend at most this share of the balance, 0 to 1. */
  threshold: number;
  lastRunAt: number;
}

/** Left behind by a rebirth for the other person to find. */
export interface Gift {
  from: Person;
  at: number;
  label: string;
  mods: Mods;
  durationMs: number;
  collected: boolean;
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

export interface GameStats {
  totalClicks: number;
  criticalClicks: number;
  megaCriticalClicks: number;
  perfectClicks: number;
  bestCombo: number;
  comboFinishers: number;
  heartsFromClicks: number;
  heartsFromPassive: number;
  heartsFromCrits: number;
  heartsFromSkills: number;
  heartsFromCreatures: number;
  heartsFromOffline: number;
  heartsFromTogether: number;
  heartsFromShelf: number;
  petDrops: number;
  jarsSealed: number;
  upgradesBought: number;
  skillsUsed: number;
  creaturesArrived: number;
  creaturesEvolved: number;
  itemsMade: number;
  jarsUnlocked: number;
  challengesCompleted: number;
  missionsCompleted: number;
  achievementsUnlocked: number;
  minigamesPlayed: number;
  fastestTideChangeMs: number | null;
  fastestNewWaterMs: number | null;
  longestSessionMs: number;
  bestSessionHearts: number;
  sessionStartedAt: number;
  sessionHearts: number;
  history: { day: string; hearts: number; clicks: number; bestCombo: number }[];
}

export interface GameSettings {
  sound: boolean;
  ambient: boolean;
  haptics: boolean;
  screenShake: boolean;
  particles: "full" | "reduced" | "off";
  reducedMotion: boolean;
  batterySaver: boolean;
  numberFormat: "short" | "scientific" | "engineering" | "full";
  confirmRareSpends: boolean;
  buyAmount: 1 | 10 | 25 | 100 | "max";
  autoSkills: boolean;
  tutorialDone: boolean;
}

/* ------------------------------------------------------------------ */
/* The save                                                            */
/* ------------------------------------------------------------------ */

export interface GameState {
  version: number;
  /** Whose save this is. Decides which upgrade tree is cheaper. */
  owner: Person;
  createdAt: number;
  updatedAt: number;
  lastTickAt: number;
  lastSeenAt: number;

  wallet: Record<CurrencyId, number>;
  lifetime: Record<CurrencyId, number>;

  /** Hearts this life, and since the last ascension. */
  runHearts: number;
  eraHearts: number;
  runStartedAt: number;
  eraStartedAt: number;
  tideChanges: number;
  newWaters: number;

  upgrades: Record<string, number>;
  moonUpgrades: Record<string, number>;
  starUpgrades: Record<string, number>;
  skills: Record<string, SkillState>;

  creatures: Record<string, CreatureInstance>;
  items: Record<string, ItemInstance>;
  /** Creature ids by jar slot. Adjacency is what makes otters hold hands. */
  slots: (string | null)[];
  codex: string[];

  /** Every jar filled and put away, and what is banked across all of them. */
  sealed: SealedJar[];
  shelfHearts: number;
  shelfUpgrades: Record<string, number>;

  /** Resets of the third rung, Forever, and the tree it pays for. */
  seas: number;
  seaHearts: number;
  seaStartedAt: number;
  sunUpgrades: Record<string, number>;

  /**
   * Time dilation: the jar running slowly on purpose.
   *
   * `active` is the switch, `hearts` is what this dilated stretch has earned
   * so far, and `startedAt` is when it began. All three live in the save
   * because a dilated run has to survive being closed, and the whole point of
   * the layer is that it takes a long time.
   */
  dilation: DilationState;
  dilationUpgrades: Record<string, number>;

  auto: AutoState;
  autobuyers: Record<string, AutobuyerState>;

  /** The jar being filled, and every jar unlocked so far. */
  jar: string;
  jarsUnlocked: string[];

  challenges: Record<string, { completed: number; best: number }>;
  activeChallenge: ChallengeRun | null;

  missions: MissionInstance[];
  storyProgress: Record<string, number>;

  achievements: Record<string, { tier: number; at: number }>;
  collections: Record<string, string[]>;

  /** The highest stage whose arrival has been shown to the player. */
  stageSeen: number;
  /**
   * The highest stage actually reached. A high-water mark rather than a
   * function of the current state, because a rebirth wipes the chain and the
   * deepenings that two of the rungs ask for, and a game that takes a feature
   * back is worse than one that gave it too early.
   */
  stageReached: number;
  /** When the mark last moved, so reveals cannot arrive on top of each other. */
  stageAt: number;

  meters: Record<string, number>;
  /** When each meter was last brought up to date, for decay. */
  metersAt: number;

  /** Shared with the other person. */
  tideLevel: number;
  giftLeft: Gift | null;
  giftWaiting: Gift | null;

  /** Live run state, not persisted across a rebirth. */
  combo: number;
  comboExpiresAt: number;
  buffs: Buff[];

  dailyBonus: { day: string | null; streak: number };
  togetherRewards: { day: string; claimed: string[] };

  stats: GameStats;
  settings: GameSettings;
  log: RewardLogEntry[];

  legacyClaimed: boolean;
}

/* ------------------------------------------------------------------ */
/* Derived numbers the UI reads                                        */
/* ------------------------------------------------------------------ */

export interface Derived {
  heartsPerClick: number;
  heartsPerSecond: number;
  /** True while the jar is deliberately running slowly. */
  dilated: boolean;
  /** The exponent dilation applies, whether or not it is switched on. */
  dilationPower: number;
  critChance: number;
  critMultiplier: number;
  megaCritChance: number;
  megaCritMultiplier: number;
  comboCap: number;
  comboDurationMs: number;
  comboMultiplier: number;
  comboShield: number;
  critChainChance: number;
  luck: number;
  offlineHours: number;
  offlineRate: number;
  costMultiplier: number;
  capacity: number;
  creatureSlots: number;
  abilitySlots: number;
  skillDuration: number;
  skillCooldown: number;
  petSpeed: number;
  petValue: number;
  pairBonus: number;
  globalMultiplier: number;
  freeUpgradeChance: number;

  /** How far the game has been revealed, and what that means is on screen. */
  stage: number;
  features: Set<Feature>;

  /** What one heart on the shelf pays per second, after every multiplier. */
  shelfRate: number;
  /** What the shelf is paying per second in total. */
  shelfIncome: number;
  /** Hearts this jar holds before it is full, after every multiplier. */
  jarCapacity: number;
  /** How much of a sealed jar is left behind rather than banked, 0 to 1. */
  sealKeep: number;
  /** A full jar seals itself. */
  autoSeal: boolean;
  /** Ribbons the next seal would pay. */
  ribbonsIfSealed: number;
  /** Taps a second the jar makes for you. */
  autoTapsPerSecond: number;
  /** How often an autobuyer may fire, in milliseconds. */
  autobuyerIntervalMs: number;
  mods: { add: Record<AddStat, number>; mul: Record<MulStat, number> };
}
