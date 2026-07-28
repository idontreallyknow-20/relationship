import type { Mods } from "../types";

// The personal layer. Two kinds of thing.
//
// Memories are one-time, permanent, and named after something that actually
// happened. They are bought with Tide, which means they are always earned by
// the two of you rather than by grinding.
//
// Trips are temporary and repeatable. You buy one, it runs for a while, it
// ends, you can buy it again. A trip you can take more than once.

export interface MemoryDef {
  id: string;
  name: string;
  /** Shown under the name. Keep it short and specific. */
  line: string;
  cost: number;
  mods: Mods;
  effect: string;
  /** Lifetime hearts before it appears at all. */
  unlockLifetime: number;
}

export const MEMORIES: MemoryDef[] = [
  {
    id: "the_mall",
    name: "The Mall",
    line: "Where it started, which nobody would have picked.",
    cost: 12,
    mods: { mul: { all: 1.15 } },
    effect: "Everything pays 15% more, forever.",
    unlockLifetime: 20_000,
  },
  {
    id: "photo_booth",
    name: "The Photo Booth",
    line: "Four pictures. One strip. Still have it.",
    cost: 20,
    mods: { mul: { all: 1.1, pearlGain: 1.25 } },
    effect: "Everything pays more, and pearls turn up more often.",
    unlockLifetime: 60_000,
  },
  {
    id: "crawfish_boil",
    name: "The Crawfish",
    line: "She could eat these until the table gives up.",
    cost: 30,
    mods: { mul: { shellGain: 1.4, creaturePower: 1.15 } },
    effect: "More shells, and everything in the jar works harder.",
    unlockLifetime: 300_000,
  },
  {
    id: "first_drive",
    name: "The Long Drive",
    line: "Nowhere in particular, on purpose.",
    cost: 45,
    mods: { mul: { offline: 1.35 }, add: { offlineHours: 2 } },
    effect: "Time apart counts for far more.",
    unlockLifetime: 2e6,
  },
  {
    id: "the_song",
    name: "The Song",
    line: "It came on and neither of you said anything.",
    cost: 70,
    mods: { mul: { comboPower: 1.3, comboGain: 1.2 } },
    effect: "Combos climb faster and pay more.",
    unlockLifetime: 1e7,
  },
  {
    id: "bad_weather",
    name: "The Bad Weather Day",
    line: "The plan fell through and it was better.",
    cost: 110,
    mods: { mul: { all: 1.25 } },
    effect: "Everything pays a quarter more.",
    unlockLifetime: 1e8,
  },
  {
    id: "the_purple_one",
    name: "The Purple One",
    line: "Her colour, and now the water's.",
    cost: 160,
    mods: { mul: { crackValue: 1.4, pearlGain: 1.3 } },
    effect: "Otters crack far harder.",
    unlockLifetime: 1e9,
  },
  {
    id: "the_dragon",
    name: "The Dragon",
    line: "His, and nobody has ever asked why.",
    cost: 160,
    mods: { mul: { collectValue: 1.4, glassGain: 1.3 } },
    effect: "Crabs collect far more.",
    unlockLifetime: 1e9,
  },
  {
    id: "every_ordinary_tuesday",
    name: "Every Ordinary Tuesday",
    line: "Not the big ones. The rest of them.",
    cost: 400,
    mods: { mul: { all: 1.5, tideGain: 1.3 } },
    effect: "The largest permanent boost in the game.",
    unlockLifetime: 1e12,
  },
];

export const MEMORY_BY_ID: Record<string, MemoryDef> = Object.fromEntries(
  MEMORIES.map((m) => [m.id, m]),
);

/* ------------------------------------------------------------------ */
/* Trips                                                               */
/* ------------------------------------------------------------------ */

export interface TripDef {
  id: string;
  name: string;
  line: string;
  cost: number;
  /** How long the boost runs, in real hours. */
  hours: number;
  mods: Mods;
  effect: string;
  unlockLifetime: number;
}

export const TRIPS: TripDef[] = [
  {
    id: "day_out",
    name: "A Day Out",
    line: "Back before dark.",
    cost: 8,
    hours: 4,
    mods: { mul: { all: 1.5 } },
    effect: "Everything pays half again for four hours.",
    unlockLifetime: 50_000,
  },
  {
    id: "weekend",
    name: "A Weekend",
    line: "Two nights, one bag.",
    cost: 25,
    hours: 24,
    mods: { mul: { all: 2 } },
    effect: "Everything doubles for a day.",
    unlockLifetime: 1e6,
  },
  {
    id: "the_coast",
    name: "The Coast",
    line: "Somewhere with water, obviously.",
    cost: 60,
    hours: 48,
    mods: { mul: { all: 2.5, crackValue: 1.5, collectValue: 1.5 } },
    effect: "Two days of everything, and the jar likes it.",
    unlockLifetime: 5e7,
  },
  {
    id: "china",
    name: "China",
    line: "The big one. Worth every hour of the flight.",
    cost: 200,
    hours: 168,
    mods: { mul: { all: 4, pearlGain: 2, tideGain: 1.5 } },
    effect: "A full week at four times everything. The best boost there is.",
    unlockLifetime: 1e9,
  },
];

export const TRIP_BY_ID: Record<string, TripDef> = Object.fromEntries(TRIPS.map((t) => [t.id, t]));

/* ------------------------------------------------------------------ */
/* Food                                                                */
/* ------------------------------------------------------------------ */

// Creatures eat. Shells are the everyday food; the rest are better and
// scarcer. Crawfish are the good stuff.

export interface FoodDef {
  id: string;
  name: string;
  line: string;
  cost: { currency: "shells" | "glass" | "pearls"; amount: number };
  /** How much it fills a creature, out of 100. */
  fills: number;
  /** Experience it gives on top. */
  xp: number;
  /** Some food is liked by one line more than the other. */
  favouredBy?: "otter" | "crab";
  color: string;
}

export const FOODS: FoodDef[] = [
  {
    id: "shellfish",
    name: "Shellfish",
    line: "Whatever is on the floor. Fine.",
    cost: { currency: "shells", amount: 8 },
    fills: 20,
    xp: 12,
    color: "#c0a880",
  },
  {
    id: "urchin",
    name: "Sea Urchin",
    line: "Spiky, and worth the trouble.",
    cost: { currency: "shells", amount: 30 },
    fills: 45,
    xp: 35,
    favouredBy: "otter",
    color: "#6a5a7a",
  },
  {
    id: "kelp",
    name: "Kelp",
    line: "Green, endless, good for you.",
    cost: { currency: "glass", amount: 40 },
    fills: 35,
    xp: 25,
    favouredBy: "crab",
    color: "#5a8a5a",
  },
  {
    id: "crawfish",
    name: "Crawfish",
    line: "Her favourite. The whole table goes quiet.",
    cost: { currency: "pearls", amount: 4 },
    fills: 100,
    xp: 120,
    color: "#b8443a",
  },
];

export const FOOD_BY_ID: Record<string, FoodDef> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

/* ------------------------------------------------------------------ */
/* Water colours                                                       */
/* ------------------------------------------------------------------ */

// Cosmetic, and the one place her colours are the point.

export interface WaterDef {
  id: string;
  name: string;
  color: string;
  source: string;
}

export const WATERS: WaterDef[] = [
  { id: "default", name: "Plain", color: "", source: "Whatever the vessel came with." },
  { id: "her_pink", name: "Hers, Pink", color: "#e8a0c0", source: "Yours from the start." },
  { id: "her_purple", name: "Hers, Purple", color: "#a888d8", source: "Yours from the start." },
  { id: "deep", name: "Deep", color: "#2f5a80", source: "Reach the Aquarium." },
  { id: "dawn", name: "Dawn", color: "#e0b088", source: "Fifty tide changes." },
  { id: "dragon", name: "Dragon", color: "#a03a2a", source: "Buy The Dragon." },
  { id: "moonstone", name: "Moonstone", color: "#c8c0e0", source: "Change the water three times." },
];

export const WATER_BY_ID: Record<string, WaterDef> = Object.fromEntries(WATERS.map((w) => [w.id, w]));
