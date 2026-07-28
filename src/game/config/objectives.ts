import type { CurrencyId, Mods } from "../types";

// One vocabulary of measurable things, shared by missions, challenges and
// achievements, so a new objective is config rather than new tracking code.

export type MetricId =
  | "clicks"
  | "criticals"
  | "megaCriticals"
  | "perfectClicks"
  | "chargedClicks"
  | "hearts"
  | "heartsFromClicks"
  | "heartsFromPassive"
  | "heartsFromSkills"
  | "heartsFromCreatures"
  | "bestCombo"
  | "comboFinishers"
  | "cracks"
  | "collects"
  | "driftersOpened"
  | "upgrades"
  | "skillsUsed"
  | "creaturesArrived"
  | "creaturesEvolved"
  | "creatureLevels"
  | "itemsMade"
  | "vessels"
  | "challenges"
  | "minigames"
  | "tideChanges"
  | "newWaters"
  | "offlineClaims"
  | "questionAnswered"
  | "togetherActions"
  | "sameEvening"
  | "depthsBought"
  | "deepens"
  | "tideBought"
  | "seas";

export const METRIC_LABEL: Record<MetricId, string> = {
  clicks: "taps",
  criticals: "critical taps",
  megaCriticals: "mega criticals",
  perfectClicks: "perfectly timed taps",
  chargedClicks: "charged taps",
  hearts: "hearts",
  heartsFromClicks: "hearts from tapping",
  heartsFromPassive: "hearts from the jar",
  heartsFromSkills: "hearts during abilities",
  heartsFromCreatures: "hearts from creatures",
  bestCombo: "combo",
  comboFinishers: "combo finishers",
  cracks: "shells cracked",
  collects: "things collected",
  driftersOpened: "drifters opened",
  upgrades: "upgrades bought",
  skillsUsed: "abilities used",
  creaturesArrived: "creatures",
  creaturesEvolved: "creatures grown",
  creatureLevels: "creature levels",
  itemsMade: "rocks and shells made",
  vessels: "vessels",
  challenges: "challenges",
  minigames: "mini-games",
  tideChanges: "tide changes",
  newWaters: "changes of water",
  offlineClaims: "returns",
  questionAnswered: "daily questions",
  togetherActions: "shared moments",
  sameEvening: "evenings together",
  depthsBought: "creatures bought down the chain",
  deepens: "deepenings",
  tideBought: "tide raised",
  seas: "seas",
};

export type Reward = Partial<Record<CurrencyId, number>> & {
  collectible?: [string, string];
  food?: Record<string, number>;
};

/* ------------------------------------------------------------------ */
/* Missions                                                            */
/* ------------------------------------------------------------------ */

export type MissionPeriod = "daily" | "weekly" | "story" | "long";

export interface MissionDef {
  id: string;
  period: MissionPeriod;
  name: string;
  metric: MetricId;
  baseGoal: number;
  scaling: "fixed" | "progress";
  reward: Reward;
  step?: number;
  weight: number;
}

const daily = (
  id: string, name: string, metric: MetricId, baseGoal: number, reward: Reward,
  scaling: "fixed" | "progress" = "fixed", weight = 10,
): MissionDef => ({ id, period: "daily", name, metric, baseGoal, scaling, reward, weight });

export const MISSIONS: MissionDef[] = [
  daily("d_clicks", "Tap the heart", "clicks", 300, { pearls: 2, shells: 40 }),
  daily("d_crit", "Land criticals", "criticals", 40, { pearls: 2, glass: 60 }),
  daily("d_combo", "Reach a combo", "bestCombo", 40, { pearls: 3, shells: 30 }),
  daily("d_charge", "Charge and let go", "chargedClicks", 25, { pearls: 2, shells: 50 }),
  daily("d_cracks", "Crack shells open", "cracks", 60, { shells: 80, glass: 40 }),
  daily("d_collects", "Collect off the floor", "collects", 60, { glass: 90, shells: 30 }),
  daily("d_upgrades", "Buy upgrades", "upgrades", 12, { pearls: 2, glass: 60 }),
  daily("d_skills", "Use abilities", "skillsUsed", 4, { pearls: 3 }),
  daily("d_drifter", "Open something that drifted in", "driftersOpened", 2, { pearls: 3, glass: 80 }),
  daily("d_levels", "Raise creature levels", "creatureLevels", 4, { shells: 100, glass: 50 }),
  daily("d_passive", "Let the jar work alone", "heartsFromPassive", 1e6, { glass: 100, pearls: 2 }, "progress"),
  daily("d_question", "Answer today's question", "questionAnswered", 1, { tide: 8, pearls: 4 }, "fixed", 6),
  daily("d_together", "Share a moment in the app", "togetherActions", 2, { tide: 6, pearls: 2 }, "fixed", 6),
  daily("d_same_evening", "Play in the same few hours", "sameEvening", 1, { tide: 20, pearls: 5 }, "fixed", 6),
  daily("d_minigame", "Play a mini-game", "minigames", 2, { pearls: 3, shells: 40 }),
  daily("d_offline", "Come back to a full jar", "offlineClaims", 1, { pearls: 2, shells: 30 }),

  { id: "w_hearts", period: "weekly", name: "Fill it up", metric: "hearts", baseGoal: 5e7, scaling: "progress", reward: { pearls: 30, tide: 25 }, weight: 10 },
  { id: "w_cracks", period: "weekly", name: "A week of cracking", metric: "cracks", baseGoal: 500, scaling: "fixed", reward: { shells: 600, pearls: 15 }, weight: 10 },
  { id: "w_collects", period: "weekly", name: "A week of collecting", metric: "collects", baseGoal: 500, scaling: "fixed", reward: { glass: 700, pearls: 15 }, weight: 10 },
  { id: "w_creatures", period: "weekly", name: "Grow the jar", metric: "creatureLevels", baseGoal: 40, scaling: "fixed", reward: { shells: 500, glass: 400 }, weight: 10 },
  { id: "w_questions", period: "weekly", name: "Answer five questions", metric: "questionAnswered", baseGoal: 5, scaling: "fixed", reward: { tide: 60 }, weight: 8 },
  { id: "w_evenings", period: "weekly", name: "Three evenings together", metric: "sameEvening", baseGoal: 3, scaling: "fixed", reward: { tide: 90, pearls: 25 }, weight: 8 },
  { id: "w_tide", period: "weekly", name: "Change the tide twice", metric: "tideChanges", baseGoal: 2, scaling: "fixed", reward: { moons: 8, pearls: 20 }, weight: 8 },

  { id: "s1", period: "story", step: 1, name: "Put a hundred hearts in", metric: "hearts", baseGoal: 100, scaling: "fixed", reward: { hearts: 60 }, weight: 0 },
  { id: "s2", period: "story", step: 2, name: "Buy your first upgrade", metric: "upgrades", baseGoal: 1, scaling: "fixed", reward: { hearts: 250 }, weight: 0 },
  { id: "s3", period: "story", step: 3, name: "Reach a combo of ten", metric: "bestCombo", baseGoal: 10, scaling: "fixed", reward: { hearts: 900 }, weight: 0 },
  { id: "s4", period: "story", step: 4, name: "Hold, then let go", metric: "chargedClicks", baseGoal: 3, scaling: "fixed", reward: { shells: 60 }, weight: 0 },
  { id: "s5", period: "story", step: 5, name: "Watch an otter crack one open", metric: "cracks", baseGoal: 5, scaling: "fixed", reward: { shells: 100 }, weight: 0 },
  { id: "s6", period: "story", step: 6, name: "Watch a crab pick it up", metric: "collects", baseGoal: 5, scaling: "fixed", reward: { glass: 120 }, weight: 0 },
  { id: "s7", period: "story", step: 7, name: "Feed something", metric: "creatureLevels", baseGoal: 2, scaling: "fixed", reward: { pearls: 5 }, weight: 0 },
  { id: "s8", period: "story", step: 8, name: "Move to a bigger vessel", metric: "vessels", baseGoal: 2, scaling: "fixed", reward: { pearls: 10 }, weight: 0 },
  { id: "s9", period: "story", step: 9, name: "Use an ability", metric: "skillsUsed", baseGoal: 1, scaling: "fixed", reward: { pearls: 4 }, weight: 0 },
  { id: "s10", period: "story", step: 10, name: "Change the tide", metric: "tideChanges", baseGoal: 1, scaling: "fixed", reward: { moons: 3 }, weight: 0 },
  { id: "s11", period: "story", step: 11, name: "Grow a creature into the next one", metric: "creaturesEvolved", baseGoal: 1, scaling: "fixed", reward: { glass: 500 }, weight: 0 },
  { id: "s12", period: "story", step: 12, name: "Change the water", metric: "newWaters", baseGoal: 1, scaling: "fixed", reward: { stars: 2 }, weight: 0 },

  { id: "x_clicks", period: "long", name: "One million taps", metric: "clicks", baseGoal: 1e6, scaling: "fixed", reward: { stars: 3 }, weight: 0 },
  { id: "x_cracks", period: "long", name: "Fifty thousand shells", metric: "cracks", baseGoal: 50_000, scaling: "fixed", reward: { stars: 3 }, weight: 0 },
  { id: "x_creatures", period: "long", name: "Every creature in the codex", metric: "creaturesArrived", baseGoal: 14, scaling: "fixed", reward: { stars: 5 }, weight: 0 },
  { id: "x_tides", period: "long", name: "One hundred tide changes", metric: "tideChanges", baseGoal: 100, scaling: "fixed", reward: { stars: 6 }, weight: 0 },
  { id: "x_questions", period: "long", name: "One hundred daily questions", metric: "questionAnswered", baseGoal: 100, scaling: "fixed", reward: { stars: 5, tide: 300 }, weight: 0 },
  { id: "x_evenings", period: "long", name: "One hundred evenings together", metric: "sameEvening", baseGoal: 100, scaling: "fixed", reward: { stars: 8, tide: 500 }, weight: 0 },
];

export const MISSION_BY_ID: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

/* ------------------------------------------------------------------ */
/* Challenges                                                          */
/* ------------------------------------------------------------------ */

export type ChallengeRule =
  | "no_crit"
  | "no_passive"
  | "no_creatures"
  | "creatures_only"
  | "limited_clicks"
  | "time_attack"
  | "combo_only"
  | "charge_only"
  | "one_line"
  | "fast_decay"
  | "endless"
  | "together";

export interface ChallengeDef {
  id: string;
  name: string;
  description: string;
  rule: ChallengeRule;
  goal: { metric: MetricId; amount: number };
  timeLimit: number | null;
  mods: Mods;
  reward: Reward;
  repeatReward?: Reward;
  unlockLifetime: number;
  requiresTideChanges?: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: "no_crit", name: "Cold Water", description: "Criticals never fire.",
    rule: "no_crit", goal: { metric: "hearts", amount: 5e6 }, timeLimit: 600,
    mods: { mul: { click: 1.6 } }, reward: { moons: 2, pearls: 20 },
    repeatReward: { moons: 1 }, unlockLifetime: 1e6, difficulty: 1,
  },
  {
    id: "no_passive", name: "Nothing Automatic", description: "The jar produces nothing on its own.",
    rule: "no_passive", goal: { metric: "heartsFromClicks", amount: 2e6 }, timeLimit: 480,
    mods: { mul: { click: 2.5 } }, reward: { moons: 2, pearls: 25 },
    repeatReward: { moons: 1 }, unlockLifetime: 1e6, difficulty: 1,
  },
  {
    id: "no_creatures", name: "Empty Water", description: "Nothing lives in the jar.",
    rule: "no_creatures", goal: { metric: "hearts", amount: 2e7 }, timeLimit: 480,
    mods: { mul: { click: 2, cps: 2 } }, reward: { moons: 3, glass: 500 },
    repeatReward: { moons: 1 }, unlockLifetime: 1e7, difficulty: 2,
  },
  {
    id: "creatures_only", name: "Let Them Work", description: "Your taps do nothing at all.",
    rule: "creatures_only", goal: { metric: "heartsFromCreatures", amount: 3e7 }, timeLimit: 600,
    mods: { mul: { creaturePower: 6, crackSpeed: 2, collectSpeed: 2 } }, reward: { moons: 3, shells: 800 },
    repeatReward: { moons: 1, shells: 200 }, unlockLifetime: 2e7, difficulty: 2,
  },
  {
    id: "limited_clicks", name: "Five Hundred Taps", description: "You get five hundred taps.",
    rule: "limited_clicks", goal: { metric: "hearts", amount: 5e7 }, timeLimit: null,
    mods: { mul: { click: 8 }, add: { critChance: 0.2 } }, reward: { moons: 4, pearls: 40 },
    repeatReward: { moons: 2 }, unlockLifetime: 5e7, difficulty: 3,
  },
  {
    id: "charge_only", name: "Patience Only", description: "Only charged taps count for anything.",
    rule: "charge_only", goal: { metric: "hearts", amount: 8e7 }, timeLimit: 480,
    mods: { mul: { chargePower: 5 } }, reward: { moons: 4, glass: 900 },
    repeatReward: { moons: 2 }, unlockLifetime: 8e7, difficulty: 3,
  },
  {
    id: "time_attack", name: "Two Minutes", description: "Two minutes. One number.",
    rule: "time_attack", goal: { metric: "hearts", amount: 1e8 }, timeLimit: 120,
    mods: { mul: { all: 4 } }, reward: { moons: 4, pearls: 50 },
    repeatReward: { moons: 2, pearls: 15 }, unlockLifetime: 1e8, difficulty: 3,
  },
  {
    id: "combo_only", name: "Keep It Going", description: "Hearts only count above a combo of twenty.",
    rule: "combo_only", goal: { metric: "hearts", amount: 3e8 }, timeLimit: 420,
    mods: { mul: { comboPower: 3 }, add: { comboDurationMs: 1_500 } },
    reward: { moons: 5, pearls: 40 }, repeatReward: { moons: 2 }, unlockLifetime: 3e8, difficulty: 4,
  },
  {
    id: "one_line", name: "One Of You", description: "Only one tree can be bought from.",
    rule: "one_line", goal: { metric: "hearts", amount: 1e9 }, timeLimit: 540,
    mods: { mul: { all: 3, cost: 0.6 } }, reward: { moons: 5, stars: 1 },
    repeatReward: { moons: 2 }, unlockLifetime: 1e9, requiresTideChanges: 1, difficulty: 4,
  },
  {
    id: "fast_decay", name: "Slipping", description: "Combos decay four times faster.",
    rule: "fast_decay", goal: { metric: "bestCombo", amount: 120 }, timeLimit: 300,
    mods: { mul: { comboGain: 2.5, comboPower: 2 } }, reward: { moons: 4, pearls: 35 },
    repeatReward: { moons: 2 }, unlockLifetime: 5e8, difficulty: 4,
  },
  {
    id: "together", name: "Both Of You", description: "Your hearts and theirs, added, in one day.",
    rule: "together", goal: { metric: "hearts", amount: 2e9 }, timeLimit: null,
    mods: { mul: { tideGain: 3, all: 1.5 } }, reward: { tide: 150, moons: 4 },
    repeatReward: { tide: 50 }, unlockLifetime: 1e9, difficulty: 2,
  },
  {
    id: "endless", name: "Endless", description: "No goal, no timer. See how far it goes.",
    rule: "endless", goal: { metric: "hearts", amount: 1e14 }, timeLimit: null,
    mods: { mul: { all: 1.5 } }, reward: { stars: 5 },
    repeatReward: { stars: 1 }, unlockLifetime: 1e12, requiresTideChanges: 5, difficulty: 5,
  },
];

export const CHALLENGE_BY_ID: Record<string, ChallengeDef> = Object.fromEntries(
  CHALLENGES.map((c) => [c.id, c]),
);
