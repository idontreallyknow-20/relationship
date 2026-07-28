import type { CurrencyId, Mods } from "../types";

// Missions and challenges share one vocabulary of measurable things, so a new
// objective is a config entry rather than new tracking code.

export type MetricId =
  | "clicks"
  | "criticals"
  | "megaCriticals"
  | "perfectClicks"
  | "hearts"
  | "heartsFromClicks"
  | "heartsFromPassive"
  | "heartsFromSkills"
  | "bestCombo"
  | "comboFinishers"
  | "golden"
  | "treasures"
  | "upgrades"
  | "skillsUsed"
  | "eggs"
  | "petLevels"
  | "petsEvolved"
  | "petsFused"
  | "charmsCrafted"
  | "bosses"
  | "challenges"
  | "minigames"
  | "rebirths"
  | "ascensions"
  | "offlineClaims"
  | "questionAnswered"
  | "partnerActions"
  | "worldsVisited";

export const METRIC_LABEL: Record<MetricId, string> = {
  clicks: "taps",
  criticals: "critical hits",
  megaCriticals: "mega criticals",
  perfectClicks: "perfectly timed taps",
  hearts: "hearts",
  heartsFromClicks: "hearts from tapping",
  heartsFromPassive: "hearts from generators",
  heartsFromSkills: "hearts during abilities",
  bestCombo: "combo",
  comboFinishers: "combo finishers",
  golden: "golden hearts caught",
  treasures: "treasure hearts opened",
  upgrades: "upgrades bought",
  skillsUsed: "abilities used",
  eggs: "eggs opened",
  petLevels: "pet levels gained",
  petsEvolved: "pets evolved",
  petsFused: "pets fused",
  charmsCrafted: "charms crafted",
  bosses: "bosses defeated",
  challenges: "challenges completed",
  minigames: "mini-games played",
  rebirths: "rebirths",
  ascensions: "ascensions",
  offlineClaims: "offline collections",
  questionAnswered: "daily questions answered",
  partnerActions: "shared moments",
  worldsVisited: "worlds visited",
};

export type Reward = Partial<Record<CurrencyId, number>> & {
  eggs?: Record<string, number>;
  title?: string;
  collectible?: [string, string];
  pet?: string;
};

/* ------------------------------------------------------------------ */
/* Missions                                                            */
/* ------------------------------------------------------------------ */

export type MissionPeriod = "daily" | "weekly" | "monthly" | "story" | "mastery";

export interface MissionDef {
  id: string;
  period: MissionPeriod;
  name: string;
  metric: MetricId;
  /** Goal at difficulty 1. Scaled by the player's progression. */
  baseGoal: number;
  /** Whether the goal scales with lifetime hearts or stays fixed. */
  scaling: "fixed" | "progress";
  reward: Reward;
  /** Story missions run in order; the number is the step. */
  step?: number;
  weight: number;
  requires?: MetricId;
}

const daily = (
  id: string,
  name: string,
  metric: MetricId,
  baseGoal: number,
  reward: Reward,
  scaling: "fixed" | "progress" = "progress",
  weight = 10,
): MissionDef => ({ id, period: "daily", name, metric, baseGoal, scaling, reward, weight });

export const MISSIONS: MissionDef[] = [
  // Daily. Deliberately mixed: some are counters, some ask for a specific play.
  daily("d_clicks", "Tap the heart", "clicks", 300, { hearts: 0, golden: 2, treats: 8 }, "fixed"),
  daily("d_crit", "Land criticals", "criticals", 40, { golden: 2, fragments: 40 }, "fixed"),
  daily("d_combo", "Reach a combo", "bestCombo", 40, { golden: 3, skill: 1 }, "fixed"),
  daily("d_golden", "Catch golden hearts", "golden", 5, { golden: 5, treats: 10 }, "fixed"),
  daily("d_upgrades", "Buy upgrades", "upgrades", 12, { golden: 2, dust: 60 }, "fixed"),
  daily("d_skills", "Use abilities", "skillsUsed", 4, { skill: 1, golden: 2 }, "fixed"),
  daily("d_skill_hearts", "Earn hearts during an ability", "heartsFromSkills", 5e5, { golden: 3, fragments: 60 }, "progress"),
  daily("d_egg", "Open a pet egg", "eggs", 1, { treats: 25, shards: 3 }, "fixed"),
  daily("d_pet_level", "Level up a pet", "petLevels", 3, { treats: 30, shards: 2 }, "fixed"),
  daily("d_boss", "Defeat a boss", "bosses", 1, { shards: 12, fragments: 90 }, "fixed"),
  daily("d_treasure", "Open a treasure heart", "treasures", 2, { fragments: 120, dust: 80 }, "fixed"),
  daily("d_question", "Answer today's question together", "questionAnswered", 1, { bond: 6, golden: 4 }, "fixed", 6),
  daily("d_partner", "Share a moment in the app", "partnerActions", 2, { bond: 5, golden: 2 }, "fixed", 6),
  daily("d_minigame", "Play a mini-game", "minigames", 2, { golden: 3, treats: 15 }, "fixed"),
  daily("d_perfect", "Land perfectly timed taps", "perfectClicks", 60, { golden: 3, skill: 1 }, "fixed"),
  daily("d_passive", "Let the jar work alone", "heartsFromPassive", 1e6, { dust: 100, golden: 2 }, "progress"),
  daily("d_offline", "Collect offline earnings", "offlineClaims", 1, { golden: 2, treats: 10 }, "fixed"),

  // Weekly.
  { id: "w_hearts", period: "weekly", name: "Fill the jar", metric: "hearts", baseGoal: 5e7, scaling: "progress", reward: { golden: 40, star: 1, skill: 3 }, weight: 10 },
  { id: "w_bosses", period: "weekly", name: "Clear bosses", metric: "bosses", baseGoal: 8, scaling: "fixed", reward: { shards: 120, fragments: 700, mastery: 1 }, weight: 10 },
  { id: "w_challenges", period: "weekly", name: "Complete challenges", metric: "challenges", baseGoal: 3, scaling: "fixed", reward: { star: 1, tokens: 5, skill: 3 }, weight: 10 },
  { id: "w_eggs", period: "weekly", name: "Hatch pets", metric: "eggs", baseGoal: 10, scaling: "fixed", reward: { shards: 60, treats: 200 }, weight: 10 },
  { id: "w_combo", period: "weekly", name: "Hold a long combo", metric: "bestCombo", baseGoal: 150, scaling: "fixed", reward: { golden: 30, skill: 2 }, weight: 10 },
  { id: "w_questions", period: "weekly", name: "Answer five daily questions", metric: "questionAnswered", baseGoal: 5, scaling: "fixed", reward: { bond: 40, star: 1 }, weight: 8 },
  { id: "w_rebirth", period: "weekly", name: "Rebirth", metric: "rebirths", baseGoal: 2, scaling: "fixed", reward: { tokens: 12, golden: 40 }, weight: 8 },

  // Monthly.
  { id: "m_lifetime", period: "monthly", name: "A month of hearts", metric: "hearts", baseGoal: 2e9, scaling: "progress", reward: { star: 4, crystals: 1, mastery: 2 }, weight: 10 },
  { id: "m_pets", period: "monthly", name: "Grow the sanctuary", metric: "petLevels", baseGoal: 120, scaling: "fixed", reward: { shards: 400, star: 2 }, weight: 10 },
  { id: "m_bosses", period: "monthly", name: "Boss hunter", metric: "bosses", baseGoal: 40, scaling: "fixed", reward: { star: 3, mastery: 3 }, weight: 10 },

  // Story. These run in order and teach the game.
  { id: "s1", period: "story", step: 1, name: "Drop your first hundred hearts", metric: "hearts", baseGoal: 100, scaling: "fixed", reward: { hearts: 50 }, weight: 0 },
  { id: "s2", period: "story", step: 2, name: "Buy your first upgrade", metric: "upgrades", baseGoal: 1, scaling: "fixed", reward: { hearts: 200 }, weight: 0 },
  { id: "s3", period: "story", step: 3, name: "Reach a combo of ten", metric: "bestCombo", baseGoal: 10, scaling: "fixed", reward: { hearts: 800 }, weight: 0 },
  { id: "s4", period: "story", step: 4, name: "Land your first critical", metric: "criticals", baseGoal: 1, scaling: "fixed", reward: { hearts: 2_000 }, weight: 0 },
  { id: "s5", period: "story", step: 5, name: "Catch a golden heart", metric: "golden", baseGoal: 1, scaling: "fixed", reward: { golden: 5 }, weight: 0 },
  { id: "s6", period: "story", step: 6, name: "Hatch your first pet", metric: "eggs", baseGoal: 1, scaling: "fixed", reward: { treats: 40 }, weight: 0 },
  { id: "s7", period: "story", step: 7, name: "Use an ability", metric: "skillsUsed", baseGoal: 1, scaling: "fixed", reward: { skill: 2 }, weight: 0 },
  { id: "s8", period: "story", step: 8, name: "Defeat the Stone Heart", metric: "bosses", baseGoal: 1, scaling: "fixed", reward: { star: 1, shards: 20 }, weight: 0 },
  { id: "s9", period: "story", step: 9, name: "Rebirth for the first time", metric: "rebirths", baseGoal: 1, scaling: "fixed", reward: { tokens: 3 }, weight: 0 },
  { id: "s10", period: "story", step: 10, name: "Complete a challenge", metric: "challenges", baseGoal: 1, scaling: "fixed", reward: { star: 1, skill: 3 }, weight: 0 },
  { id: "s11", period: "story", step: 11, name: "Evolve a pet", metric: "petsEvolved", baseGoal: 1, scaling: "fixed", reward: { shards: 80 }, weight: 0 },
  { id: "s12", period: "story", step: 12, name: "Ascend", metric: "ascensions", baseGoal: 1, scaling: "fixed", reward: { crystals: 2, title: "Ascended" }, weight: 0 },

  // Mastery. Very long term, and they never expire.
  { id: "x_clicks", period: "mastery", name: "One million taps", metric: "clicks", baseGoal: 1e6, scaling: "fixed", reward: { mastery: 5, title: "Devoted" }, weight: 0 },
  { id: "x_bosses", period: "mastery", name: "Five hundred bosses", metric: "bosses", baseGoal: 500, scaling: "fixed", reward: { mastery: 8, title: "Unbeaten" }, weight: 0 },
  { id: "x_pets", period: "mastery", name: "Every pet in the codex", metric: "eggs", baseGoal: 400, scaling: "fixed", reward: { mastery: 8, pet: "jar_spirit" }, weight: 0 },
  { id: "x_rebirths", period: "mastery", name: "One hundred rebirths", metric: "rebirths", baseGoal: 100, scaling: "fixed", reward: { mastery: 10, title: "Reborn" }, weight: 0 },
  { id: "x_questions", period: "mastery", name: "One hundred daily questions", metric: "questionAnswered", baseGoal: 100, scaling: "fixed", reward: { mastery: 10, title: "Still Curious" }, weight: 0 },
];

export const MISSION_BY_ID: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

/* ------------------------------------------------------------------ */
/* Challenges                                                          */
/* ------------------------------------------------------------------ */

export type ChallengeRule =
  | "no_crit"
  | "no_passive"
  | "limited_clicks"
  | "time_attack"
  | "combo_only"
  | "pet_only"
  | "no_pets"
  | "single_tree"
  | "random_costs"
  | "fast_decay"
  | "boss_rush"
  | "golden_only"
  | "offline_only"
  | "active_only"
  | "one_life"
  | "escalating"
  | "rebirth_speedrun"
  | "ascension_speedrun"
  | "seeded"
  | "endless"
  | "hardcore"
  | "partner_coop"
  | "partner_versus";

export interface ChallengeDef {
  id: string;
  name: string;
  description: string;
  rule: ChallengeRule;
  /** What the run has to reach. */
  goal: { metric: MetricId; amount: number };
  /** Seconds, or null for untimed. */
  timeLimit: number | null;
  /** Effects applied for the duration of the run. */
  mods: Mods;
  reward: Reward;
  /** Repeatable challenges pay a smaller reward every time after the first. */
  repeatReward?: Reward;
  unlockLifetime: number;
  requiresRebirths?: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: "no_crit", name: "Cold Hands", description: "Criticals never fire. Everything has to come from raw taps.",
    rule: "no_crit", goal: { metric: "hearts", amount: 5e6 }, timeLimit: 600,
    mods: { mul: { click: 1.5 } }, reward: { tokens: 2, skill: 2, collectible: ["click_effects", "steady_hand"] },
    repeatReward: { tokens: 1 }, unlockLifetime: 1e6, difficulty: 1,
  },
  {
    id: "no_passive", name: "Nothing Automatic", description: "Generators produce nothing. Only your hands count.",
    rule: "no_passive", goal: { metric: "heartsFromClicks", amount: 2e6 }, timeLimit: 480,
    mods: { mul: { click: 2.5 } }, reward: { tokens: 2, golden: 20, collectible: ["titles", "handmade"] },
    repeatReward: { tokens: 1 }, unlockLifetime: 1e6, difficulty: 1,
  },
  {
    id: "limited_clicks", name: "Five Hundred Taps", description: "You get five hundred taps. Make them count.",
    rule: "limited_clicks", goal: { metric: "hearts", amount: 2e7 }, timeLimit: null,
    mods: { mul: { click: 6 }, add: { critChance: 0.15 } }, reward: { tokens: 3, skill: 3 },
    repeatReward: { tokens: 1 }, unlockLifetime: 1e7, difficulty: 2,
  },
  {
    id: "time_attack", name: "Two Minutes", description: "Two minutes, one number to beat.",
    rule: "time_attack", goal: { metric: "hearts", amount: 5e7 }, timeLimit: 120,
    mods: { mul: { all: 3 } }, reward: { tokens: 3, golden: 40 },
    repeatReward: { tokens: 1, golden: 10 }, unlockLifetime: 2e7, difficulty: 2,
  },
  {
    id: "combo_only", name: "Rhythm Run", description: "Hearts only count while your combo is above twenty.",
    rule: "combo_only", goal: { metric: "hearts", amount: 1e8 }, timeLimit: 420,
    mods: { mul: { comboPower: 3 }, add: { comboDurationMs: 1500 } },
    reward: { tokens: 4, skill: 3, collectible: ["combo_effects", "metronome"] },
    repeatReward: { tokens: 2 }, unlockLifetime: 5e7, difficulty: 3,
  },
  {
    id: "pet_only", name: "Let Them Work", description: "Your taps do nothing. The pets do everything.",
    rule: "pet_only", goal: { metric: "hearts", amount: 2e8 }, timeLimit: 600,
    mods: { mul: { petPower: 8 } }, reward: { tokens: 4, shards: 200, treats: 400 },
    repeatReward: { tokens: 2, shards: 60 }, unlockLifetime: 1e8, difficulty: 3,
  },
  {
    id: "no_pets", name: "Empty Sanctuary", description: "No pets at all. Just you and the jar.",
    rule: "no_pets", goal: { metric: "hearts", amount: 1.5e8 }, timeLimit: 480,
    mods: { mul: { click: 2, cps: 2 } }, reward: { tokens: 3, golden: 50 },
    repeatReward: { tokens: 1 }, unlockLifetime: 1e8, difficulty: 2,
  },
  {
    id: "single_tree", name: "One Road", description: "Only the click tree can be bought.",
    rule: "single_tree", goal: { metric: "hearts", amount: 3e8 }, timeLimit: 540,
    mods: { mul: { click: 4, cost: 0.6 } }, reward: { tokens: 4, skill: 4 },
    repeatReward: { tokens: 2 }, unlockLifetime: 3e8, difficulty: 3,
  },
  {
    id: "random_costs", name: "Unstable Prices", description: "Every price shifts every ten seconds.",
    rule: "random_costs", goal: { metric: "hearts", amount: 5e8 }, timeLimit: 480,
    mods: { mul: { all: 2 } }, reward: { tokens: 4, dust: 800 },
    repeatReward: { tokens: 2 }, unlockLifetime: 5e8, difficulty: 3,
  },
  {
    id: "fast_decay", name: "Slipping", description: "Combos decay four times faster.",
    rule: "fast_decay", goal: { metric: "bestCombo", amount: 120 }, timeLimit: 300,
    mods: { mul: { comboGain: 2.5, comboPower: 2 } }, reward: { tokens: 3, skill: 3 },
    repeatReward: { tokens: 1 }, unlockLifetime: 2e8, difficulty: 3,
  },
  {
    id: "boss_rush", name: "Boss Rush", description: "Five bosses back to back with no break.",
    rule: "boss_rush", goal: { metric: "bosses", amount: 5 }, timeLimit: 420,
    mods: { mul: { bossDamage: 2.5 } }, reward: { tokens: 5, star: 1, shards: 500 },
    repeatReward: { tokens: 2, shards: 150 }, unlockLifetime: 1e9, requiresRebirths: 1, difficulty: 4,
  },
  {
    id: "golden_only", name: "All That Glitters", description: "Only golden hearts pay anything.",
    rule: "golden_only", goal: { metric: "golden", amount: 60 }, timeLimit: 420,
    mods: { add: { goldenChance: 0.5 }, mul: { golden: 4 } }, reward: { tokens: 4, golden: 150 },
    repeatReward: { tokens: 2, golden: 40 }, unlockLifetime: 8e8, difficulty: 3,
  },
  {
    id: "offline_only", name: "Away Game", description: "Nothing counts except what the jar makes without you.",
    rule: "offline_only", goal: { metric: "heartsFromPassive", amount: 1e9 }, timeLimit: 900,
    mods: { mul: { cps: 6, offline: 3 } }, reward: { tokens: 4, dust: 1_200 },
    repeatReward: { tokens: 2 }, unlockLifetime: 2e9, difficulty: 3,
  },
  {
    id: "active_only", name: "Hands On", description: "Passive output is off and abilities are disabled.",
    rule: "active_only", goal: { metric: "heartsFromClicks", amount: 2e9 }, timeLimit: 480,
    mods: { mul: { click: 8 } }, reward: { tokens: 5, skill: 5 },
    repeatReward: { tokens: 2 }, unlockLifetime: 3e9, requiresRebirths: 1, difficulty: 4,
  },
  {
    id: "one_life", name: "One Life", description: "Break your combo once and the run ends.",
    rule: "one_life", goal: { metric: "hearts", amount: 4e9 }, timeLimit: null,
    mods: { mul: { all: 4, comboPower: 2 } }, reward: { tokens: 6, star: 1, title: "Unbroken" },
    repeatReward: { tokens: 3 }, unlockLifetime: 5e9, requiresRebirths: 2, difficulty: 5,
  },
  {
    id: "escalating", name: "Rising Tide", description: "The goal doubles every ninety seconds until you stop.",
    rule: "escalating", goal: { metric: "hearts", amount: 1e10 }, timeLimit: null,
    mods: { mul: { all: 2 } }, reward: { tokens: 6, mastery: 2 },
    repeatReward: { tokens: 3, mastery: 1 }, unlockLifetime: 1e10, requiresRebirths: 2, difficulty: 5,
  },
  {
    id: "rebirth_speedrun", name: "Rebirth Speedrun", description: "Reach the rebirth requirement from nothing, against the clock.",
    rule: "rebirth_speedrun", goal: { metric: "hearts", amount: 1e9 }, timeLimit: 600,
    mods: { mul: { all: 5, cost: 0.4 } }, reward: { tokens: 8, star: 2, title: "Quick Heart" },
    repeatReward: { tokens: 4 }, unlockLifetime: 2e10, requiresRebirths: 3, difficulty: 5,
  },
  {
    id: "ascension_speedrun", name: "Ascension Speedrun", description: "The whole loop, compressed, once.",
    rule: "ascension_speedrun", goal: { metric: "hearts", amount: 1e12 }, timeLimit: 1_800,
    mods: { mul: { all: 20, cost: 0.25, tokenGain: 3 } }, reward: { crystals: 3, star: 4, title: "Meteoric" },
    repeatReward: { crystals: 1 }, unlockLifetime: 1e13, requiresRebirths: 10, difficulty: 5,
  },
  {
    id: "seeded", name: "Daily Seed", description: "The same rules for both of you, every day, decided by the date.",
    rule: "seeded", goal: { metric: "hearts", amount: 5e8 }, timeLimit: 300,
    mods: { mul: { all: 3 } }, reward: { star: 1, golden: 60, skill: 2 },
    repeatReward: { golden: 20 }, unlockLifetime: 1e8, difficulty: 3,
  },
  {
    id: "endless", name: "Endless", description: "No goal and no timer. See how far the jar goes.",
    rule: "endless", goal: { metric: "hearts", amount: 1e14 }, timeLimit: null,
    mods: { mul: { all: 1.5 } }, reward: { mastery: 5, title: "Endless" },
    repeatReward: { mastery: 1 }, unlockLifetime: 1e12, requiresRebirths: 5, difficulty: 5,
  },
  {
    id: "hardcore", name: "Hardcore", description: "Every restriction at once. Nothing helps you.",
    rule: "hardcore", goal: { metric: "hearts", amount: 1e11 }, timeLimit: 900,
    mods: { mul: { cost: 2.5 } }, reward: { tokens: 15, crystals: 1, star: 3, title: "Hardcore" },
    repeatReward: { tokens: 5 }, unlockLifetime: 1e11, requiresRebirths: 5, difficulty: 5,
  },
  {
    id: "partner_coop", name: "Together", description: "Your combined hearts today decide whether you both clear it.",
    rule: "partner_coop", goal: { metric: "hearts", amount: 2e9 }, timeLimit: null,
    mods: { mul: { bondGain: 3, all: 1.5 } }, reward: { bond: 80, star: 1, title: "Two Hands" },
    repeatReward: { bond: 25 }, unlockLifetime: 1e9, difficulty: 2,
  },
  {
    id: "partner_versus", name: "Friendly Rivalry", description: "Whoever fills more of the jar today takes it. Both of you get something.",
    rule: "partner_versus", goal: { metric: "hearts", amount: 1e9 }, timeLimit: null,
    mods: { mul: { all: 1.4 } }, reward: { golden: 60, bond: 40 },
    repeatReward: { golden: 20, bond: 10 }, unlockLifetime: 1e9, difficulty: 2,
  },
];

export const CHALLENGE_BY_ID: Record<string, ChallengeDef> = Object.fromEntries(
  CHALLENGES.map((c) => [c.id, c]),
);
