import type { Mods } from "../types";
import type { Reward } from "./objectives";

// Events are data. Each one declares when it runs, what it changes, what it
// sells, and what it asks you to do. Adding a seasonal event is one entry.

export type EventSchedule =
  | { kind: "dates"; from: string; to: string } // MM-DD, inclusive, repeats yearly
  | { kind: "weekdays"; days: number[] } // 0 is Sunday
  | { kind: "anniversary"; windowDays: number } // around the couple's start date
  | { kind: "monthday"; day: number } // same day each month
  | { kind: "always" };

export interface EventDef {
  id: string;
  name: string;
  blurb: string;
  story: string;
  schedule: EventSchedule;
  accent: string;
  /** Applied for the whole event. */
  mods: Mods;
  /** How event tokens are earned during this event. */
  tokenRule: string;
  tokensPerMillionHearts: number;
  missions: { id: string; name: string; metric: string; goal: number; reward: Reward }[];
  shop: { id: string; name: string; description: string; cost: number; effect: Reward }[];
  boss?: string;
  /** Collectible granted for participating at all. */
  trophy?: [string, string];
}

export const EVENTS: EventDef[] = [
  {
    id: "valentine",
    name: "Valentine Week",
    blurb: "The whole jar turns red for a week.",
    story: "Every February the jar refuses to hold anything that is not a heart. Nobody has worked out why, and nobody has tried very hard.",
    schedule: { kind: "dates", from: "02-10", to: "02-17" },
    accent: "#c0395e",
    mods: { mul: { all: 1.5, golden: 1.5, bondGain: 2 } },
    tokenRule: "Event tokens come from hearts earned while the event is running.",
    tokensPerMillionHearts: 4,
    missions: [
      { id: "v_hearts", name: "Fill the red jar", metric: "hearts", goal: 5e8, reward: { event: 60 } },
      { id: "v_golden", name: "Catch fifty golden hearts", metric: "golden", goal: 50, reward: { event: 40 } },
      { id: "v_question", name: "Answer the daily question every day", metric: "questionAnswered", goal: 7, reward: { event: 80, bond: 50 } },
    ],
    shop: [
      { id: "v_egg", name: "Valentine Egg", description: "A guaranteed epic or better.", cost: 120, effect: { eggs: { celestial: 1 } } },
      { id: "v_heart", name: "Ember Heart design", description: "A heart that glows while your combo runs.", cost: 200, effect: { collectible: ["heart_designs", "ember"] } },
      { id: "v_star", name: "Star Heart", description: "One Star Heart.", cost: 150, effect: { star: 1 } },
    ],
    trophy: ["trophies", "t_stone"],
  },
  {
    id: "anniversary",
    name: "Your Anniversary",
    blurb: "Built from the date on your couple profile.",
    story: "The jar keeps its own calendar, and this is the only date on it.",
    schedule: { kind: "anniversary", windowDays: 3 },
    accent: "#8f4560",
    mods: { mul: { all: 2, bondGain: 3, tokenGain: 1.5 } },
    tokenRule: "Double event tokens, because it only happens once a year.",
    tokensPerMillionHearts: 8,
    missions: [
      { id: "a_together", name: "Both of you play on the day", metric: "partnerActions", goal: 3, reward: { event: 100, bond: 80 } },
      { id: "a_hearts", name: "One year of hearts", metric: "hearts", goal: 2e9, reward: { event: 120 } },
    ],
    shop: [
      { id: "a_jar", name: "Starlit Jar", description: "A jar with your night sky in it.", cost: 250, effect: { collectible: ["jar_skins", "starlit"] } },
      { id: "a_crystal", name: "Ascension Crystal", description: "One crystal, as a gift.", cost: 400, effect: { crystals: 1 } },
    ],
  },
  {
    id: "golden_weekend",
    name: "Golden Heart Weekend",
    blurb: "Golden hearts everywhere, every weekend.",
    story: "Saturday and Sunday, the jar is generous.",
    schedule: { kind: "weekdays", days: [0, 6] },
    accent: "#c99a3f",
    mods: { add: { goldenChance: 0.06 }, mul: { golden: 2 } },
    tokenRule: "Event tokens come from catching golden hearts.",
    tokensPerMillionHearts: 2,
    missions: [
      { id: "g_catch", name: "Catch one hundred golden hearts", metric: "golden", goal: 100, reward: { event: 50, golden: 40 } },
    ],
    shop: [
      { id: "g_gold", name: "Golden Jar", description: "The jar, in gold.", cost: 180, effect: { collectible: ["jar_skins", "golden_jar"] } },
      { id: "g_eggs", name: "Three Workshop Eggs", description: "Three eggs at once.", cost: 90, effect: { eggs: { workshop: 3 } } },
    ],
  },
  {
    id: "pet_festival",
    name: "Pet Festival",
    blurb: "The sanctuary opens its doors on the first of the month.",
    story: "Once a month every pet in the sanctuary is awake at the same time, which is louder than it sounds.",
    schedule: { kind: "monthday", day: 1 },
    accent: "#7fa06a",
    mods: { mul: { petPower: 2, petXp: 3, treatGain: 3 } },
    tokenRule: "Event tokens come from pet levels and eggs opened.",
    tokensPerMillionHearts: 1,
    missions: [
      { id: "p_levels", name: "Raise thirty pet levels", metric: "petLevels", goal: 30, reward: { event: 60, treats: 300 } },
      { id: "p_eggs", name: "Open ten eggs", metric: "eggs", goal: 10, reward: { event: 50, shards: 80 } },
    ],
    shop: [
      { id: "p_egg", name: "Festival Egg", description: "A cosmic egg at a festival price.", cost: 200, effect: { eggs: { cosmic: 1 } } },
      { id: "p_shards", name: "Shard Pouch", description: "Three hundred memory shards.", cost: 100, effect: { shards: 300 } },
    ],
  },
  {
    id: "boss_invasion",
    name: "Boss Invasion",
    blurb: "Bosses appear twice as often and pay twice as much.",
    story: "Something got into the jar. Several somethings.",
    schedule: { kind: "weekdays", days: [3] },
    accent: "#a83e4b",
    mods: { mul: { bossReward: 2, bossDamage: 1.3 } },
    tokenRule: "Event tokens come from defeating bosses.",
    tokensPerMillionHearts: 1,
    missions: [
      { id: "b_bosses", name: "Defeat ten bosses", metric: "bosses", goal: 10, reward: { event: 70, shards: 200 } },
    ],
    shop: [
      { id: "b_frag", name: "Fragment Crate", description: "Two thousand charm fragments.", cost: 120, effect: { fragments: 2_000 } },
      { id: "b_aura", name: "Nova Aura", description: "The aura from the last fight.", cost: 300, effect: { collectible: ["auras", "nova"] } },
    ],
    boss: "heart_dragon",
  },
  {
    id: "question_challenge",
    name: "Question Challenge",
    blurb: "The daily question is worth much more all week.",
    story: "A quiet event. Answer, read theirs, and the jar notices.",
    schedule: { kind: "weekdays", days: [1] },
    accent: "#7c6ba8",
    mods: { mul: { bondGain: 4 } },
    tokenRule: "Event tokens come from answering and from shared moments.",
    tokensPerMillionHearts: 1,
    missions: [
      { id: "q_answer", name: "Answer the daily question", metric: "questionAnswered", goal: 1, reward: { event: 40, bond: 30 } },
      { id: "q_share", name: "Five shared moments", metric: "partnerActions", goal: 5, reward: { event: 50, bond: 40 } },
    ],
    shop: [
      { id: "q_letters", name: "Sealed Letter", description: "One love letter for the collection.", cost: 80, effect: { collectible: ["letters", "l7"] } },
      { id: "q_bond", name: "Bond Surge", description: "Two hundred bond energy.", cost: 150, effect: { bond: 200 } },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

function mmdd(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Which events are running right now. Anniversary needs the couple's date. */
export function activeEvents(now: Date, anniversary: string | null): EventDef[] {
  const today = mmdd(now);
  return EVENTS.filter((event) => {
    const s = event.schedule;
    if (s.kind === "always") return true;
    if (s.kind === "weekdays") return s.days.includes(now.getDay());
    if (s.kind === "monthday") return now.getDate() === s.day;
    if (s.kind === "dates") {
      return s.from <= s.to
        ? today >= s.from && today <= s.to
        : today >= s.from || today <= s.to;
    }
    if (s.kind === "anniversary") {
      if (!anniversary) return false;
      const start = new Date(`${anniversary}T00:00:00Z`);
      if (Number.isNaN(start.getTime())) return false;
      const thisYear = new Date(Date.UTC(now.getFullYear(), start.getUTCMonth(), start.getUTCDate()));
      const diffDays = Math.abs(
        (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - thisYear.getTime()) / 86_400_000,
      );
      return diffDays <= s.windowDays;
    }
    return false;
  });
}
