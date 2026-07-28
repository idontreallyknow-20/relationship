// The shape of a Love Jar save, and the vocabulary every system speaks.
//
// Content lives in `src/game/config`. Nothing in here knows about a specific
// upgrade or pet, which is what lets a new reset layer or upgrade tree be
// added without touching the engine.

export type CurrencyId =
  | "hearts"
  | "golden"
  | "dust"
  | "bond"
  | "treats"
  | "shards"
  | "tokens"
  | "crystals"
  | "star"
  | "eternal"
  | "event"
  | "fragments"
  | "skill"
  | "mastery";

/** Stats that contributors add to. Sums across every source. */
export type AddStat =
  | "clickFlat"
  | "cpsFlat"
  | "critChance"
  | "megaCritChance"
  | "comboCap"
  | "comboDurationMs"
  | "comboStart"
  | "goldenChance"
  | "treasureChance"
  | "luck"
  | "offlineHours"
  | "petSlots"
  | "skillSlots"
  | "charmSlots"
  | "jarCapacity"
  | "freeUpgradeChance"
  | "doubleRewardChance"
  | "energyMax"
  | "focusMax"
  | "heatMax"
  | "critChainChance"
  | "comboShield"
  | "startingUpgrades"
  | "dailyDeals";

/** Stats that contributors multiply. Products across every source. */
export type MulStat =
  | "all"
  | "click"
  | "cps"
  | "crit"
  | "megaCrit"
  | "comboGain"
  | "comboPower"
  | "golden"
  | "treasure"
  | "offline"
  | "cost"
  | "petPower"
  | "petXp"
  | "skillDuration"
  | "skillCooldown"
  | "bossDamage"
  | "bossReward"
  | "missionReward"
  | "eventReward"
  | "tokenGain"
  | "crystalGain"
  | "dustGain"
  | "bondGain"
  | "shardGain"
  | "fragmentGain"
  | "treatGain"
  | "chargeSpeed"
  | "energyRegen"
  | "animationSpeed";

export interface Mods {
  add?: Partial<Record<AddStat, number>>;
  mul?: Partial<Record<MulStat, number>>;
}

export type Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic"
  | "celestial"
  | "eternal"
  | "secret";

export type CharmSlot =
  | "jar"
  | "heart"
  | "pet"
  | "ring"
  | "necklace"
  | "bracelet"
  | "crown"
  | "wings"
  | "aura"
  | "relic";

/* ------------------------------------------------------------------ */
/* Owned things                                                        */
/* ------------------------------------------------------------------ */

export interface PetInstance {
  id: string;
  defId: string;
  level: number;
  xp: number;
  happiness: number;
  /** Rolled once when the pet hatches; two of the same pet play differently. */
  trait: string;
  personality: string;
  nickname: string | null;
  stars: number;
  locked: boolean;
  favorite: boolean;
  fedAt: number;
  hatchedAt: number;
  /** Set when the pet is away on an expedition. */
  expedition: { kind: string; endsAt: number } | null;
}

export interface CharmInstance {
  id: string;
  defId: string;
  slot: CharmSlot;
  rarity: Rarity;
  level: number;
  /** Rolled affixes: stat key plus magnitude. */
  affixes: { stat: AddStat | MulStat; kind: "add" | "mul"; value: number }[];
  locked: boolean;
  createdAt: number;
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
  /** yyyy-MM-dd the mission belongs to, in the couple's timezone. */
  period: string;
  rerolled: boolean;
}

export interface BossFight {
  defId: string;
  tier: number;
  hp: number;
  maxHp: number;
  startedAt: number;
  endsAt: number;
  phase: number;
  shielded: boolean;
  weakSpot: { x: number; y: number; expiresAt: number } | null;
  hitsThisPhase: number;
}

export interface FloatingHeart {
  id: string;
  kind: "golden" | "treasure" | "mimic" | "healing" | "exploding" | "shielded";
  spawnedAt: number;
  expiresAt: number;
  x: number;
  y: number;
  hp: number;
}

export interface ChallengeRun {
  defId: string;
  startedAt: number;
  endsAt: number | null;
  score: number;
  /** Snapshot of the save taken when the challenge began. */
  restore: string | null;
}

export interface RewardLogEntry {
  id: string;
  at: number;
  label: string;
  detail: string;
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
  heartsFromPets: number;
  heartsFromOffline: number;
  heartsFromPartner: number;
  heartsFromBosses: number;
  heartsFromGolden: number;
  goldenCaught: number;
  treasuresOpened: number;
  upgradesBought: number;
  skillsUsed: number;
  eggsOpened: number;
  petsEvolved: number;
  petsFused: number;
  charmsCrafted: number;
  charmsSalvaged: number;
  bossesDefeated: number;
  challengesCompleted: number;
  missionsCompleted: number;
  achievementsUnlocked: number;
  minigamesPlayed: number;
  fastestRebirthMs: number | null;
  fastestAscensionMs: number | null;
  longestSessionMs: number;
  bestSessionHearts: number;
  sessionStartedAt: number;
  sessionHearts: number;
  /** Per day rollups, newest last, capped so the save stays small. */
  history: { day: string; hearts: number; clicks: number; bestCombo: number }[];
}

export interface GameSettings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  screenShake: boolean;
  particles: "full" | "reduced" | "off";
  reducedMotion: boolean;
  batterySaver: boolean;
  numberFormat: "short" | "scientific" | "engineering" | "full";
  showDamageNumbers: boolean;
  confirmRareSpends: boolean;
  buyAmount: 1 | 10 | 25 | 100 | "max";
  competitionOptIn: boolean;
  autoSkills: boolean;
}

/* ------------------------------------------------------------------ */
/* The save                                                            */
/* ------------------------------------------------------------------ */

export interface GameState {
  version: number;
  createdAt: number;
  updatedAt: number;
  lastTickAt: number;
  lastSeenAt: number;

  wallet: Record<CurrencyId, number>;
  lifetime: Record<CurrencyId, number>;

  /** Hearts earned since the last rebirth, and since the last ascension. */
  runHearts: number;
  eraHearts: number;
  runStartedAt: number;
  eraStartedAt: number;
  rebirths: number;
  ascensions: number;

  upgrades: Record<string, number>;
  rebirthUpgrades: Record<string, number>;
  ascensionUpgrades: Record<string, number>;
  skills: Record<string, SkillState>;

  pets: Record<string, PetInstance>;
  petLoadouts: { name: string; slots: (string | null)[] }[];
  activeLoadout: number;
  eggs: Record<string, number>;
  /** Draws since the last rare or better, per egg type. */
  pity: Record<string, number>;
  petCodex: string[];

  charms: Record<string, CharmInstance>;
  equipped: Partial<Record<CharmSlot, string | null>>;

  world: string;
  worldsUnlocked: string[];

  bosses: Record<string, { defeated: number; bestMs: number | null; tier: number }>;
  activeBoss: BossFight | null;

  challenges: Record<string, { completed: number; best: number }>;
  activeChallenge: ChallengeRun | null;

  missions: MissionInstance[];
  storyProgress: Record<string, number>;

  achievements: Record<string, { tier: number; at: number }>;
  collections: Record<string, string[]>;
  titles: string[];
  activeTitle: string | null;

  events: Record<string, { progress: number; claimed: string[]; currency: number }>;
  shopPurchases: string[];

  /** Live run state, not persisted across a rebirth. */
  combo: number;
  comboExpiresAt: number;
  heat: number;
  focus: number;
  energy: number;
  charge: number;
  buffs: Buff[];
  floating: FloatingHeart[];

  dailyBonus: { day: string | null; streak: number };
  /** Couple app rewards already granted, keyed by day so caps are honest. */
  partnerRewards: { day: string; claimed: string[] };

  stats: GameStats;
  settings: GameSettings;
  log: RewardLogEntry[];

  legacyClaimed: boolean;
  /** Client side ledger of batches already accepted by the server. */
  syncedLifetime: number;
  syncedClicks: number;
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
  goldenChancePerSecond: number;
  treasureChance: number;
  luck: number;
  offlineHours: number;
  offlineRate: number;
  costMultiplier: number;
  petSlots: number;
  skillSlots: number;
  jarCapacity: number;
  petPower: number;
  bossDamage: number;
  globalMultiplier: number;
  freeUpgradeChance: number;
  doubleRewardChance: number;
  skillDuration: number;
  skillCooldown: number;
  energyMax: number;
  focusMax: number;
  heatMax: number;
  critChainChance: number;
  comboShield: number;
  chargeSpeed: number;
  mods: { add: Record<AddStat, number>; mul: Record<MulStat, number> };
}
