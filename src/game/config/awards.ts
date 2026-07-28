import type { MetricId, Reward } from "./objectives";

// Achievements are tiered: one definition produces several unlocks, each with
// its own reward, so the list stays readable while the count stays high.

export type AchievementCategory =
  | "clicking"
  | "hearts"
  | "criticals"
  | "combos"
  | "upgrades"
  | "skills"
  | "pets"
  | "charms"
  | "rebirth"
  | "ascension"
  | "challenges"
  | "bosses"
  | "collections"
  | "events"
  | "offline"
  | "active"
  | "questions"
  | "couple"
  | "hidden"
  | "funny";

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  metric: MetricId;
  tiers: number[];
  /** Reward for tier n, scaled by the tier index. */
  reward: Reward;
  hidden?: boolean;
  titleAt?: { tier: number; title: string };
}

const t = (
  id: string,
  category: AchievementCategory,
  name: string,
  description: string,
  metric: MetricId,
  tiers: number[],
  reward: Reward,
  extra: Partial<AchievementDef> = {},
): AchievementDef => ({ id, category, name, description, metric, tiers, reward, ...extra });

export const ACHIEVEMENTS: AchievementDef[] = [
  t("ach_clicks", "clicking", "Tapping Away", "Tap the heart.", "clicks",
    [100, 1_000, 10_000, 50_000, 250_000, 1_000_000], { golden: 3, skill: 1 },
    { titleAt: { tier: 5, title: "Devoted" } }),
  t("ach_perfect", "clicking", "Right On Time", "Land perfectly timed taps.", "perfectClicks",
    [50, 500, 5_000, 25_000, 100_000], { golden: 4, skill: 1 }),
  t("ach_hearts", "hearts", "Filling Up", "Earn hearts, in total.", "hearts",
    [1_000, 100_000, 1e7, 1e9, 1e12, 1e15, 1e18], { golden: 5, star: 1 },
    { titleAt: { tier: 6, title: "Jarkeeper" } }),
  t("ach_hearts_click", "active", "By Hand", "Earn hearts by tapping.", "heartsFromClicks",
    [10_000, 1e6, 1e8, 1e10, 1e13], { golden: 4, skill: 1 }),
  t("ach_hearts_passive", "offline", "While You Were Out", "Earn hearts from generators.", "heartsFromPassive",
    [10_000, 1e6, 1e8, 1e10, 1e13], { dust: 200, golden: 3 }),
  t("ach_offline", "offline", "Welcome Back", "Collect offline earnings.", "offlineClaims",
    [1, 10, 50, 200, 1_000], { golden: 3, treats: 30 }),
  t("ach_crit", "criticals", "Sharp", "Land critical hits.", "criticals",
    [50, 1_000, 25_000, 200_000, 2_000_000], { golden: 4, fragments: 200 }),
  t("ach_mega", "criticals", "Overwhelming", "Land mega criticals.", "megaCriticals",
    [10, 250, 5_000, 50_000], { golden: 6, skill: 2 }),
  t("ach_combo", "combos", "In Rhythm", "Reach a combo.", "bestCombo",
    [25, 75, 150, 300, 600, 1_200], { golden: 5, skill: 1 },
    { titleAt: { tier: 5, title: "Metronome" } }),
  t("ach_finisher", "combos", "Big Finish", "Land combo finishers.", "comboFinishers",
    [10, 100, 1_000, 10_000], { golden: 5, dust: 300 }),
  t("ach_upgrades", "upgrades", "Collector of Levels", "Buy upgrades.", "upgrades",
    [25, 250, 2_500, 25_000, 150_000], { golden: 4, dust: 250 }),
  t("ach_skills", "skills", "Well Practised", "Use abilities.", "skillsUsed",
    [10, 200, 2_000, 20_000], { skill: 2, golden: 4 }),
  t("ach_eggs", "pets", "Hatchling", "Open pet eggs.", "eggs",
    [1, 25, 150, 600, 2_000], { treats: 60, shards: 10 }),
  t("ach_pet_levels", "pets", "Good Company", "Raise pet levels.", "petLevels",
    [10, 200, 2_000, 15_000], { treats: 120, shards: 20 }),
  t("ach_evolve", "pets", "Grown Up", "Evolve pets.", "petsEvolved",
    [1, 5, 20, 60], { shards: 60, star: 1 }),
  t("ach_fuse", "pets", "Two Into One", "Fuse pets.", "petsFused",
    [1, 10, 50, 200], { shards: 80, treats: 200 }),
  t("ach_charms", "charms", "Adorned", "Craft charms.", "charmsCrafted",
    [1, 25, 150, 600], { fragments: 300, dust: 400 }),
  t("ach_bosses", "bosses", "Heartbreaker", "Defeat bosses.", "bosses",
    [1, 10, 60, 250, 1_000], { shards: 80, fragments: 500 },
    { titleAt: { tier: 4, title: "Unbeaten" } }),
  t("ach_challenges", "challenges", "Willing", "Complete challenges.", "challenges",
    [1, 10, 40, 120], { tokens: 3, skill: 3 }),
  t("ach_rebirth", "rebirth", "Again From The Top", "Rebirth.", "rebirths",
    [1, 5, 25, 100, 500], { tokens: 5, star: 1 },
    { titleAt: { tier: 3, title: "Reborn" } }),
  t("ach_ascension", "ascension", "Higher", "Ascend.", "ascensions",
    [1, 3, 10, 30], { crystals: 2, star: 2 },
    { titleAt: { tier: 2, title: "Ascended" } }),
  t("ach_golden", "hearts", "Gold Rush", "Catch golden hearts.", "golden",
    [10, 250, 2_500, 20_000], { golden: 20, dust: 300 }),
  t("ach_treasure", "collections", "Finders Keepers", "Open treasure hearts.", "treasures",
    [5, 100, 1_000, 8_000], { fragments: 400, star: 1 }),
  t("ach_worlds", "collections", "Somewhere Else", "Visit worlds.", "worldsVisited",
    [2, 4, 7, 10], { star: 1, golden: 30 }),
  t("ach_minigames", "events", "Side Quest", "Play mini-games.", "minigames",
    [5, 50, 300, 1_500], { golden: 10, treats: 80 }),
  t("ach_questions", "questions", "Still Curious", "Answer the daily question.", "questionAnswered",
    [1, 10, 50, 200, 1_000], { bond: 20, star: 1 },
    { titleAt: { tier: 3, title: "Still Curious" } }),
  t("ach_partner", "couple", "Two Of You", "Share moments in the app.", "partnerActions",
    [5, 50, 300, 1_500], { bond: 25, golden: 10 }),
  // Hidden ones. They stay out of the list until the first tier is earned, so
  // every threshold here has to be something the metric genuinely measures.
  t("ach_secret_precise", "hidden", "Nothing But Net", "Land ten thousand perfectly timed taps.", "perfectClicks",
    [10_000], { golden: 25, title: "Night Owl" }, { hidden: true }),
  t("ach_secret_mimic", "hidden", "Wise To It", "Beat twenty five boss hearts.", "bosses",
    [25], { shards: 150 }, { hidden: true }),
  t("ach_secret_patient", "hidden", "Patience", "Come back to twenty five lots of offline earnings.", "offlineClaims",
    [25], { golden: 40, dust: 500 }, { hidden: true }),
  // Funny ones, which are real achievements with real rewards.
  t("ach_funny_slow", "funny", "Taking It Slow", "Let the jar earn a million hearts without your help.", "heartsFromPassive",
    [1_000_000], { golden: 5 }),
  t("ach_funny_burst", "funny", "Somebody Is Excited", "Tap five thousand times.", "clicks",
    [5_000], { golden: 10, title: "Enthusiastic" }),
  t("ach_funny_broke", "funny", "Spent It All", "Buy five hundred upgrade levels.", "upgrades",
    [500], { golden: 15 }),
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Total number of individual unlocks across every tier. */
export const ACHIEVEMENT_TOTAL = ACHIEVEMENTS.reduce((sum, a) => sum + a.tiers.length, 0);

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export interface CollectibleDef {
  id: string;
  name: string;
  /** Plain language description of how it is obtained. */
  source: string;
  rarity: "common" | "rare" | "legendary";
}

export interface CollectionDef {
  id: string;
  name: string;
  description: string;
  items: CollectibleDef[];
  /** Reward for completing the whole set. */
  completion: Reward;
}

const c = (id: string, name: string, source: string, rarity: CollectibleDef["rarity"] = "common"): CollectibleDef =>
  ({ id, name, source, rarity });

export const COLLECTIONS: CollectionDef[] = [
  {
    id: "heart_designs",
    name: "Heart designs",
    description: "The heart you tap.",
    completion: { star: 2, mastery: 1 },
    items: [
      c("classic", "Classic", "Yours from the start."),
      c("paper", "Paper Heart", "Buy from the shop."),
      c("crystal", "Crystal Heart", "Defeat the Frozen Heart."),
      c("golden", "Golden Heart", "Defeat the Golden Heart King.", "rare"),
      c("clockwork", "Clockwork Heart", "Defeat the Broken Clock Heart.", "rare"),
      c("ember", "Ember Heart", "Reach a combo of six hundred.", "rare"),
      c("cosmic", "Cosmic Heart", "Defeat the Cosmic Heart.", "legendary"),
      c("eternal", "Eternal Heart", "Ascend three times.", "legendary"),
    ],
  },
  {
    id: "jar_skins",
    name: "Jar skins",
    description: "The jar itself.",
    completion: { star: 2, mastery: 1 },
    items: [
      c("plain", "Plain Jar", "Yours from the start."),
      c("founding", "Founding Jar", "For everyone who used the old love jar.", "rare"),
      c("rose", "Rose Jar", "Unlock the Rose Garden."),
      c("candy", "Candy Jar", "Unlock the Candy Heart Factory."),
      c("crystal_jar", "Crystal Jar", "Unlock the Crystal Heart Cave."),
      c("golden_jar", "Golden Jar", "Unlock the Golden Love Palace.", "rare"),
      c("starlit", "Starlit Jar", "Unlock Starry Date Night.", "rare"),
      c("cosmic_jar", "Cosmic Jar", "Unlock the Cosmic Heart Realm.", "legendary"),
      c("eternal_jar", "Eternal Jar", "Unlock the Eternal Garden.", "legendary"),
    ],
  },
  {
    id: "click_effects",
    name: "Click effects",
    description: "What happens when you tap.",
    completion: { golden: 60 },
    items: [
      c("ripple", "Ripple", "Yours from the start."),
      c("petals", "Petals", "Buy from the shop."),
      c("steady_hand", "Steady Hand", "Complete the Cold Hands challenge.", "rare"),
      c("sparks", "Sparks", "Land ten thousand criticals."),
      c("bloom", "Bloom", "Complete the Rose Garden collection.", "rare"),
      c("starfall", "Starfall", "Reach ascension.", "legendary"),
    ],
  },
  {
    id: "combo_effects",
    name: "Combo effects",
    description: "What a long combo looks like.",
    completion: { golden: 60 },
    items: [
      c("glow", "Glow", "Yours from the start."),
      c("metronome", "Metronome", "Complete the Rhythm Run challenge.", "rare"),
      c("chain", "Chain", "Reach a combo of three hundred."),
      c("firestorm", "Firestorm", "Reach a combo of twelve hundred.", "legendary"),
    ],
  },
  {
    id: "auras",
    name: "Auras",
    description: "Worn around the jar.",
    completion: { star: 1 },
    items: [
      c("none", "None", "Yours from the start."),
      c("warm", "Warm", "Buy from the shop."),
      c("frost", "Frost", "Defeat the Frozen Heart twenty times."),
      c("dusk", "Dusk", "Unlock the Moonlit Balcony."),
      c("nova", "Nova", "Defeat the Eternal Heart.", "legendary"),
    ],
  },
  {
    id: "trophies",
    name: "Boss trophies",
    description: "One for every boss, on first clear.",
    completion: { star: 5, mastery: 3 },
    items: [
      c("t_stone", "Stone Fragment", "Defeat the Stone Heart."),
      c("t_frozen", "Frozen Shard", "Defeat the Frozen Heart."),
      c("t_mimic", "False Lid", "Defeat the Mimic Jar."),
      c("t_clock", "Stopped Hand", "Defeat the Broken Clock Heart.", "rare"),
      c("t_king", "Golden Crown", "Defeat the Golden Heart King.", "rare"),
      c("t_shadow", "Quiet Shadow", "Defeat the Jealousy Shadow.", "rare"),
      c("t_guardian", "Guardian's Key", "Defeat the Memory Guardian.", "rare"),
      c("t_dragon", "Dragon Scale", "Defeat the Heart Dragon.", "legendary"),
      c("t_cosmic", "Cosmic Ember", "Defeat the Cosmic Heart.", "legendary"),
      c("t_eternal", "Eternal Ember", "Defeat the Eternal Heart.", "legendary"),
    ],
  },
  {
    id: "letters",
    name: "Love letters",
    description: "Found inside treasure hearts. Each one is a short note.",
    completion: { star: 3, mastery: 2 },
    items: [
      c("l1", "The first one", "Open a treasure heart."),
      c("l2", "The one about mornings", "Open a treasure heart."),
      c("l3", "The one about the drive home", "Open a treasure heart."),
      c("l4", "The one you almost threw away", "Open a treasure heart.", "rare"),
      c("l5", "The one written badly on purpose", "Open a treasure heart."),
      c("l6", "The one about the kitchen", "Open a treasure heart."),
      c("l7", "The one nobody has read yet", "Open a treasure heart.", "rare"),
      c("l8", "The last one", "Open a treasure heart.", "legendary"),
    ],
  },
  {
    id: "titles",
    name: "Titles",
    description: "Shown next to your name on the couple leaderboard.",
    completion: { mastery: 3 },
    items: [
      c("newcomer", "Newcomer", "Yours from the start."),
      c("handmade", "Handmade", "Complete the Nothing Automatic challenge.", "rare"),
      c("stonebreaker", "Stonebreaker", "Defeat the Stone Heart."),
      c("kingtoppler", "Kingtoppler", "Defeat the Golden Heart King.", "rare"),
      c("keeper", "Keeper of Memory", "Defeat the Memory Guardian.", "rare"),
      c("unbroken", "Unbroken", "Complete the One Life challenge.", "legendary"),
      c("hardcore", "Hardcore", "Complete the Hardcore challenge.", "legendary"),
      c("eternal_title", "Eternal", "Defeat the Eternal Heart.", "legendary"),
    ],
  },
];

export const COLLECTION_BY_ID: Record<string, CollectionDef> = Object.fromEntries(
  COLLECTIONS.map((col) => [col.id, col]),
);

/** Items every player owns from the first second. */
export const STARTING_COLLECTIBLES: Record<string, string[]> = {
  heart_designs: ["classic"],
  jar_skins: ["plain"],
  click_effects: ["ripple"],
  combo_effects: ["glow"],
  auras: ["none"],
  trophies: [],
  letters: [],
  titles: ["newcomer"],
};

export const LETTER_TEXT: Record<string, string> = {
  l1: "I kept this one because it was the first thing you ever wrote down for me.",
  l2: "You are impossible before nine in the morning and I would not change it.",
  l3: "The drive home is my favourite part of any day that ends with you in it.",
  l4: "I almost threw this away. I am glad I am the kind of person who does not.",
  l5: "This one is written badly on purpose so you would know it was really me.",
  l6: "Half of everything I know about you, I learned standing in a kitchen.",
  l7: "I have not shown you this one yet. I will, eventually.",
  l8: "If this is the last one, it is only because we ran out of paper.",
};
