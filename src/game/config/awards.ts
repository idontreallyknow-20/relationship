import type { MetricId, Reward } from "./objectives";

// Achievements are tiered: one definition produces several unlocks. Every
// threshold is something the metric genuinely measures.

export type AchievementCategory =
  | "tapping" | "hearts" | "criticals" | "combos" | "upgrades" | "abilities"
  | "otters" | "crabs" | "jar" | "tides" | "challenges" | "together" | "hidden";

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  metric: MetricId;
  tiers: number[];
  reward: Reward;
  hidden?: boolean;
}

const t = (
  id: string, category: AchievementCategory, name: string, description: string,
  metric: MetricId, tiers: number[], reward: Reward, extra: Partial<AchievementDef> = {},
): AchievementDef => ({ id, category, name, description, metric, tiers, reward, ...extra });

export const ACHIEVEMENTS: AchievementDef[] = [
  t("a_clicks", "tapping", "Tapping Away", "Tap the heart.", "clicks",
    [100, 1_000, 10_000, 50_000, 250_000, 1_000_000], { pearls: 3 }),
  t("a_perfect", "tapping", "Right On Time", "Land perfectly timed taps.", "perfectClicks",
    [50, 500, 5_000, 25_000, 100_000], { pearls: 4 }),
  t("a_perfect", "tapping", "Dead Centre", "Tap exactly on the beat.", "perfectClicks",
    [25, 250, 2_500, 20_000], { pearls: 4, shells: 60 }),
  t("a_hearts", "hearts", "Filling Up", "Earn hearts, in total.", "hearts",
    [1_000, 100_000, 1e7, 1e9, 1e12, 1e15, 1e18], { pearls: 6 }),
  t("a_passive", "hearts", "While You Were Out", "Earn hearts without touching it.", "heartsFromPassive",
    [10_000, 1e6, 1e8, 1e10, 1e13], { glass: 200 }),
  t("a_offline", "hearts", "Welcome Back", "Come back to a full jar.", "offlineClaims",
    [1, 10, 50, 200, 1_000], { pearls: 3, shells: 40 }),
  t("a_crit", "criticals", "Sharp", "Land critical taps.", "criticals",
    [50, 1_000, 25_000, 200_000, 2_000_000], { pearls: 4, glass: 150 }),
  t("a_mega", "criticals", "Overwhelming", "Land mega criticals.", "megaCriticals",
    [10, 250, 5_000, 50_000], { pearls: 6 }),
  t("a_combo", "combos", "In Rhythm", "Reach a combo.", "bestCombo",
    [25, 75, 150, 300, 600, 1_200], { pearls: 5 }),
  t("a_finisher", "combos", "Big Finish", "Take a combo all the way to the cap.", "comboFinishers",
    [10, 100, 1_000, 10_000], { pearls: 5, glass: 250 }),
  t("a_upgrades", "upgrades", "Collector Of Levels", "Buy upgrades.", "upgrades",
    [25, 250, 2_500, 25_000, 150_000], { pearls: 4, glass: 200 }),
  t("a_abilities", "abilities", "Well Practised", "Use abilities.", "skillsUsed",
    [10, 200, 2_000, 20_000], { pearls: 5 }),
  t("a_cracks", "otters", "Crack", "Watch a shell come open.", "cracks",
    [10, 500, 10_000, 150_000, 2_000_000], { shells: 120 }),
  t("a_collects", "crabs", "Found It", "Watch something get picked up.", "collects",
    [10, 500, 10_000, 150_000, 2_000_000], { glass: 150 }),
  t("a_creatures", "jar", "Full Jar", "Meet creatures.", "creaturesArrived",
    [2, 4, 7, 10, 14], { pearls: 10, shells: 200 }),
  t("a_levels", "jar", "Well Fed", "Raise creature levels.", "creatureLevels",
    [10, 200, 2_000, 15_000], { shells: 250, glass: 200 }),
  t("a_evolved", "jar", "Grown", "Grow a creature into the next one.", "creaturesEvolved",
    [1, 5, 20, 60], { glass: 400, pearls: 8 }),
  t("a_items", "jar", "Keepsakes", "Make rocks and shells.", "itemsMade",
    [1, 25, 150, 600], { glass: 350 }),
  t("a_vessels", "jar", "Somewhere Bigger", "Move to a new vessel.", "vessels",
    [2, 4, 6, 8, 10], { pearls: 15, stars: 1 }),
  t("a_drifters", "jar", "Something Drifted In", "Open whatever floats in.", "driftersOpened",
    [5, 100, 1_000, 8_000], { glass: 400, pearls: 6 }),
  t("a_tides", "tides", "Out And Back", "Change the tide.", "tideChanges",
    [1, 5, 25, 100, 500], { moons: 5 }),
  t("a_waters", "tides", "All Of It", "Change the water.", "newWaters",
    [1, 3, 10, 30], { stars: 2 }),
  t("a_challenges", "challenges", "Rough Water", "Complete challenges.", "challenges",
    [1, 10, 40, 120], { moons: 3, pearls: 20 }),
  t("a_questions", "together", "Still Curious", "Answer the daily question.", "questionAnswered",
    [1, 10, 50, 200, 1_000], { tide: 25 }),
  t("a_shared", "together", "Two Of You", "Share moments in the app.", "togetherActions",
    [5, 50, 300, 1_500], { tide: 30 }),
  t("a_evenings", "together", "The Same Evening", "Play within a few hours of each other.", "sameEvening",
    [1, 10, 50, 200, 1_000], { tide: 60, pearls: 10 }),
  t("a_hidden_deep", "hidden", "Down There", "Land ten thousand perfectly timed taps.", "perfectClicks",
    [10_000], { pearls: 40 }, { hidden: true }),
  t("a_hidden_patient", "hidden", "Patience", "Come back twenty five times.", "offlineClaims",
    [25], { glass: 800 }, { hidden: true }),
  t("a_hidden_both", "hidden", "Always The Same Evening", "Fifty evenings in the same few hours.", "sameEvening",
    [50], { tide: 300, stars: 1 }, { hidden: true }),
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export const ACHIEVEMENT_TOTAL = ACHIEVEMENTS.reduce((sum, a) => sum + a.tiers.length, 0);

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export interface CollectibleDef {
  id: string;
  name: string;
  source: string;
  rare?: boolean;
}

export interface CollectionDef {
  id: string;
  name: string;
  items: CollectibleDef[];
  completion: Reward;
}

const c = (id: string, name: string, source: string, rare = false): CollectibleDef =>
  ({ id, name, source, rare });

export const COLLECTIONS: CollectionDef[] = [
  {
    id: "waters",
    name: "Water",
    completion: { stars: 2 },
    items: [
      c("default", "Plain", "The vessel's own."),
      c("her_pink", "Hers, Pink", "Yours from the start."),
      c("her_purple", "Hers, Purple", "Yours from the start."),
      c("deep", "Deep", "Reach the Aquarium.", true),
      c("dawn", "Dawn", "Fifty tide changes.", true),
      c("dragon", "Dragon", "Buy The Dragon.", true),
      c("moonstone", "Moonstone", "Change the water three times.", true),
    ],
  },
  {
    id: "memories",
    name: "Memories",
    completion: { stars: 4, tide: 200 },
    items: [
      c("the_mall", "The Mall", "Where it started."),
      c("photo_booth", "The Photo Booth", "Four pictures, one strip."),
      c("crawfish_boil", "The Crawfish", "Her favourite."),
      c("first_drive", "The Long Drive", "Nowhere in particular."),
      c("the_song", "The Song", "It came on and neither of you said anything."),
      c("bad_weather", "The Bad Weather Day", "The plan fell through.", true),
      c("the_purple_one", "The Purple One", "Her colour.", true),
      c("the_dragon", "The Dragon", "His.", true),
      c("every_ordinary_tuesday", "Every Ordinary Tuesday", "The rest of them.", true),
    ],
  },
  {
    id: "vessels",
    name: "Vessels",
    completion: { stars: 3 },
    items: [
      c("jam_jar", "Jam Jar", "Already on the shelf."),
      c("mason_jar", "Mason Jar", "Taller, and it seals."),
      c("apothecary", "Apothecary Jar", "Older than both of you."),
      c("fishbowl", "Fishbowl", "Enough water to float in."),
      c("tidepool", "Tidepool", "A dent in a rock."),
      c("terrarium", "Terrarium", "Kelp took hold."),
      c("reef_tank", "Reef Tank", "It has a schedule.", true),
      c("aquarium", "Aquarium", "People stop and look.", true),
      c("cove", "Cove", "You stopped calling it a jar.", true),
      c("ocean", "Ocean", "There is no lid.", true),
    ],
  },
  {
    id: "notes",
    name: "Notes",
    completion: { stars: 3, tide: 150 },
    items: [
      c("n1", "The first one", "Found in a drifter."),
      c("n2", "The one about mornings", "Found in a drifter."),
      c("n3", "The one about the drive home", "Found in a drifter."),
      c("n4", "The one you almost threw away", "Found in a drifter.", true),
      c("n5", "The one written badly on purpose", "Found in a drifter."),
      c("n6", "The one about the kitchen", "Found in a drifter."),
      c("n7", "The one nobody has read yet", "Found in a drifter.", true),
      c("n8", "The last one", "Found in a drifter.", true),
    ],
  },
];

export const COLLECTION_BY_ID: Record<string, CollectionDef> = Object.fromEntries(
  COLLECTIONS.map((col) => [col.id, col]),
);

export const STARTING_COLLECTIBLES: Record<string, string[]> = {
  waters: ["default", "her_pink", "her_purple"],
  // Not listed anywhere in the UI. Finding one is the whole of it.
  eggs: [],
  memories: [],
  vessels: ["jam_jar"],
  notes: [],
};

export const NOTE_TEXT: Record<string, string> = {
  n1: "I kept this because it was the first thing you ever wrote down for me.",
  n2: "You are impossible before nine in the morning and I would not change it.",
  n3: "The drive home is my favourite part of any day that ends with you in it.",
  n4: "I almost threw this away. I am glad I am not the kind of person who does.",
  n5: "This one is written badly on purpose so you would know it was really me.",
  n6: "Half of what I know about you I learned standing in a kitchen.",
  n7: "I have not shown you this one yet. I will, eventually.",
  n8: "If this is the last one, it is only because we ran out of paper.",
};
