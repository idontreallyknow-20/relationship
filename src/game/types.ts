// The shape of a Love Jar save, and the vocabulary every system speaks.
//
// Content lives in `src/game/config`. Nothing in here knows about a specific
// upgrade or creature.

export type Person = "cami" | "joseph";

export type CurrencyId =
  | "hearts"
  | "pearls"
  | "shells"
  | "glass"
  | "tide"
  | "moons"
  | "stars"
  | "drops";

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
  | "driftChance"
  | "freeUpgradeChance"
  // Automation and the depth chain.
  | "autoTapsPerSecond"
  | "autoChargeRatio"
  | "extraDepths"
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
  | "chargePower"
  // The two creature lines.
  | "crackValue"
  | "crackSpeed"
  | "collectValue"
  | "collectSpeed"
  | "pairBonus"
  | "creaturePower"
  | "creatureXp"
  // Currencies.
  | "shellGain"
  | "glassGain"
  | "pearlGain"
  | "tideGain"
  | "moonGain"
  | "starGain"
  // Everything else.
  | "offline"
  | "cost"
  | "skillDuration"
  | "skillCooldown"
  | "missionReward"
  | "driftReward"
  // The depth chain.
  | "depthPower"
  | "tideSpeed"
  | "deepenGain"
  | "dropGain";

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

/** Something an otter cracked open, sinking toward the floor. */
export interface Settled {
  id: string;
  kind: "shell" | "glass" | "pearl";
  x: number;
  /** 0 at the surface, 1 on the floor. */
  y: number;
  value: number;
  droppedAt: number;
}

/** Something that floated in and needs tapping open. */
export interface Drifter {
  defId: string;
  id: string;
  taps: number;
  tapsDone: number;
  x: number;
  y: number;
  arrivedAt: number;
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

/**
 * One rung of the chain.
 *
 * `bought` is what you paid for and drives the price of the next one.
 * `owned` is what is actually down there producing, and includes everything
 * the depth below has made for you. They diverge on purpose: production is
 * free, and only buying makes the next one dearer.
 */
export interface DepthState {
  bought: number;
  owned: number;
  unlocked: boolean;
}

/** The jar playing itself. */
export interface AutoState {
  /** Tap on your behalf. */
  tap: boolean;
  /** Make some of those taps charged holds. */
  hold: boolean;
  /** Carries the fractional part of a tap between ticks. */
  tapCredit: number;
}

/** One autobuyer. `target` is a depth id, "tide", or a reset rung id. */
export interface AutobuyerState {
  on: boolean;
  /** Buy as many as affordable rather than one at a time. */
  max: boolean;
  /** Spend at most this share of the balance, 0 to 1. */
  threshold: number;
  lastRunAt: number;
}

/** Left behind by a tide change for the other person to find. */
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
  chargedClicks: number;
  bestCombo: number;
  comboFinishers: number;
  heartsFromClicks: number;
  heartsFromPassive: number;
  heartsFromCrits: number;
  heartsFromSkills: number;
  heartsFromCreatures: number;
  heartsFromOffline: number;
  heartsFromTogether: number;
  heartsFromDrifters: number;
  cracks: number;
  collects: number;
  driftersOpened: number;
  upgradesBought: number;
  skillsUsed: number;
  creaturesArrived: number;
  creaturesEvolved: number;
  itemsMade: number;
  vesselsUnlocked: number;
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
  /** Kept apart from `buyAmount`: the chain wants max, upgrade lists rarely do. */
  depthBuyAmount: 1 | 10 | 100 | "max";
  drifters: boolean;
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

  /** Hearts since the last tide change, and since the last new water. */
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

  /** The chain, surface first. Grows as the drop tree extends it. */
  depths: DepthState[];
  /** How many times the jar has been deepened, and the multiplier it bought. */
  deepens: number;
  /** Purchases of Tide, which is the speed of every depth at once. */
  tideBought: number;

  /** Resets of the fourth rung, and the tree it pays for. */
  seas: number;
  seaHearts: number;
  seaStartedAt: number;
  dropUpgrades: Record<string, number>;

  auto: AutoState;
  autobuyers: Record<string, AutobuyerState>;

  vessel: string;
  vesselsUnlocked: string[];
  /** Which of the unlocked water colours the jar is filled with. */
  water: string;

  settled: Settled[];
  drifter: Drifter | null;

  challenges: Record<string, { completed: number; best: number }>;
  activeChallenge: ChallengeRun | null;

  missions: MissionInstance[];
  storyProgress: Record<string, number>;

  achievements: Record<string, { tier: number; at: number }>;
  collections: Record<string, string[]>;

  /** Love meters, by id, 0 to 100. They fill from the rest of the app. */
  meters: Record<string, number>;
  /** When each meter was last brought up to date, for decay. */
  metersAt: number;

  /** Shared with the other person. */
  tideLevel: number;
  giftLeft: Gift | null;
  giftWaiting: Gift | null;

  /** Live run state, not persisted across a tide change. */
  combo: number;
  comboExpiresAt: number;
  charge: number;
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
  critChance: number;
  critMultiplier: number;
  megaCritChance: number;
  megaCritMultiplier: number;
  comboCap: number;
  comboDurationMs: number;
  comboMultiplier: number;
  comboShield: number;
  critChainChance: number;
  chargePower: number;
  luck: number;
  offlineHours: number;
  offlineRate: number;
  costMultiplier: number;
  capacity: number;
  creatureSlots: number;
  abilitySlots: number;
  skillDuration: number;
  skillCooldown: number;
  crackValue: number;
  crackSpeed: number;
  collectValue: number;
  collectSpeed: number;
  pairBonus: number;
  globalMultiplier: number;
  freeUpgradeChance: number;
  driftChance: number;
  /** Water depth and floor width of the current vessel. */
  depth: number;
  floor: number;

  /** How many depths are playable right now. */
  depthCount: number;
  /** Speed multiplier every depth is running at. */
  tideSpeedMultiplier: number;
  /** Output multiplier from deepenings, the drop tree and everything else. */
  depthPower: number;
  /** Taps a second the jar makes for you, and how many of those are charged. */
  autoTapsPerSecond: number;
  autoChargeRatio: number;
  /** How often an autobuyer may fire, in milliseconds. */
  autobuyerIntervalMs: number;
  mods: { add: Record<AddStat, number>; mul: Record<MulStat, number> };
}
