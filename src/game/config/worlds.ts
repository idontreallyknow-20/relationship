import type { Mods } from "../types";

// Worlds change the backdrop, the jar, and one rule of play each. Unlocking
// one is a real decision because Star Hearts are scarce.

export interface WorldDef {
  id: string;
  name: string;
  blurb: string;
  /** Two-tone backdrop. No gradients: these are flat layered shapes. */
  sky: string;
  ground: string;
  accent: string;
  jarTint: string;
  heartTint: string;
  /** Always-on effect while you are playing in this world. */
  mods: Mods;
  /** The rule this world changes, in one sentence. */
  rule: string;
  cost: { currency: "star" | "hearts"; amount: number };
  unlockLifetime: number;
  bosses: string[];
  /** Pets that only appear while this world is selected. */
  petBias?: string[];
}

export const WORLDS: WorldDef[] = [
  {
    id: "bedroom",
    name: "Bedroom Jar",
    blurb: "Where the jar has always been. A lamp, a shelf, and the two of you.",
    sky: "#fbf6ef",
    ground: "#f7dee6",
    accent: "#a85b73",
    jarTint: "#ffffff",
    heartTint: "#c28092",
    mods: {},
    rule: "No special rule. The baseline everything else is measured against.",
    cost: { currency: "hearts", amount: 0 },
    unlockLifetime: 0,
    bosses: ["stone_heart"],
  },
  {
    id: "rose_garden",
    name: "Rose Garden",
    blurb: "Overgrown, warm, and full of things that grow while you are away.",
    sky: "#f4efe4",
    ground: "#e2d6c0",
    accent: "#8f4560",
    jarTint: "#fdf3f5",
    heartTint: "#b06a80",
    mods: { mul: { cps: 1.15, offline: 1.1 } },
    rule: "Passive hearts and offline earnings are stronger. Click power is not.",
    cost: { currency: "hearts", amount: 5e6 },
    unlockLifetime: 2e6,
    bosses: ["stone_heart", "frozen_heart"],
    petBias: ["rose_fox", "cloud_bear", "lucky_frog"],
  },
  {
    id: "candy_factory",
    name: "Candy Heart Factory",
    blurb: "Loud, fast, and slightly too sweet.",
    sky: "#f7e9ef",
    ground: "#e9c9d6",
    accent: "#a83e6b",
    jarTint: "#fff6fa",
    heartTint: "#d06a92",
    mods: { mul: { click: 1.2, comboGain: 1.15 }, add: { comboDurationMs: -300 } },
    rule: "Combos climb faster but decay faster. Built for active play.",
    cost: { currency: "star", amount: 2 },
    unlockLifetime: 5e8,
    bosses: ["mimic_jar", "golden_heart_king"],
  },
  {
    id: "moonlit_balcony",
    name: "Moonlit Balcony",
    blurb: "Quiet, cold air, and a long view.",
    sky: "#2f2a3e",
    ground: "#413a55",
    accent: "#c9b0e0",
    jarTint: "#e8e2f2",
    heartTint: "#b090d0",
    mods: { mul: { golden: 1.3, crit: 1.15 }, add: { goldenChance: 0.02 } },
    rule: "Golden hearts appear more often and are worth more.",
    cost: { currency: "star", amount: 4 },
    unlockLifetime: 5e9,
    bosses: ["broken_clock_heart", "jealousy_shadow"],
    petBias: ["moon_owl", "valentine_bat", "star_hamster"],
  },
  {
    id: "memory_library",
    name: "Memory Library",
    blurb: "Everything you have both written down, shelved.",
    sky: "#f0e8dc",
    ground: "#cbb79a",
    accent: "#6a4a3f",
    jarTint: "#fdf8f0",
    heartTint: "#a06a5a",
    mods: { mul: { shardGain: 1.5, treasure: 1.2, bondGain: 1.2 } },
    rule: "Memory shards and treasure rewards flow far more freely.",
    cost: { currency: "star", amount: 6 },
    unlockLifetime: 4e10,
    bosses: ["memory_guardian"],
    petBias: ["memory_butterfly", "crystal_deer"],
  },
  {
    id: "crystal_cave",
    name: "Crystal Heart Cave",
    blurb: "Every surface reflects the jar back at you.",
    sky: "#243642",
    ground: "#325663",
    accent: "#7fd0d8",
    jarTint: "#e0f4f6",
    heartTint: "#6ab0c0",
    mods: { mul: { crit: 1.4, megaCrit: 1.3 }, add: { critChance: 0.05 } },
    rule: "A critical build world. Criticals are everywhere and hit hard.",
    cost: { currency: "star", amount: 9 },
    unlockLifetime: 2e11,
    bosses: ["frozen_heart", "heart_dragon"],
    petBias: ["crystal_turtle", "crystal_deer"],
  },
  {
    id: "golden_palace",
    name: "Golden Love Palace",
    blurb: "Too much of everything, on purpose.",
    sky: "#3a2f22",
    ground: "#6a5330",
    accent: "#e0c070",
    jarTint: "#fdf3d8",
    heartTint: "#d0a84a",
    mods: { mul: { all: 1.25, cost: 1.15 } },
    rule: "Everything pays 25% more, and everything costs 15% more.",
    cost: { currency: "star", amount: 14 },
    unlockLifetime: 1e13,
    bosses: ["golden_heart_king", "heart_dragon"],
    petBias: ["golden_bee", "golden_snail"],
  },
  {
    id: "starry_date",
    name: "Starry Date Night",
    blurb: "One blanket, no phones, and an enormous sky.",
    sky: "#1c2340",
    ground: "#2d3a5e",
    accent: "#a0c0f0",
    jarTint: "#e0e8fa",
    heartTint: "#7f9ad0",
    mods: { mul: { bondGain: 2, all: 1.15, eventReward: 1.3 } },
    rule: "The partner world. Bond energy comes in twice as fast.",
    cost: { currency: "star", amount: 20 },
    unlockLifetime: 5e14,
    bosses: ["jealousy_shadow", "cosmic_heart"],
  },
  {
    id: "cosmic_realm",
    name: "Cosmic Heart Realm",
    blurb: "The jar, and nothing else, for as far as you can see.",
    sky: "#150f24",
    ground: "#2a1f42",
    accent: "#c090f0",
    jarTint: "#efe4ff",
    heartTint: "#a070d0",
    mods: { mul: { all: 1.6, tokenGain: 1.3, crystalGain: 1.2 } },
    rule: "Endgame world. Everything is stronger, including the requirements.",
    cost: { currency: "star", amount: 30 },
    unlockLifetime: 1e16,
    bosses: ["cosmic_heart", "eternal_heart"],
    petBias: ["cosmic_whale", "eternal_dragon", "celestial_fox"],
  },
  {
    id: "eternal_garden",
    name: "Eternal Garden",
    blurb: "It was here before either of you, and it will keep going.",
    sky: "#101c18",
    ground: "#1f3a2c",
    accent: "#8fd0a8",
    jarTint: "#e4f4ea",
    heartTint: "#6ab088",
    mods: { mul: { all: 2, crystalGain: 1.5, petPower: 1.4 } },
    rule: "Unlocked by ascending. The strongest world, and the last one.",
    cost: { currency: "star", amount: 50 },
    unlockLifetime: 0,
    bosses: ["eternal_heart"],
  },
];

export const WORLD_BY_ID: Record<string, WorldDef> = Object.fromEntries(WORLDS.map((w) => [w.id, w]));

/* ------------------------------------------------------------------ */
/* Bosses                                                              */
/* ------------------------------------------------------------------ */

export interface BossDef {
  id: string;
  name: string;
  blurb: string;
  /** Base health at tier 1. Each tier multiplies it. */
  baseHp: number;
  hpGrowth: number;
  /** Seconds allowed. */
  timeLimit: number;
  color: string;
  /** The mechanic that makes this fight different from the others. */
  mechanic:
    | "plain"
    | "shield_phases"
    | "weak_spots"
    | "timed_phases"
    | "combo_gate"
    | "critical_windows"
    | "mimic"
    | "regenerating";
  mechanicText: string;
  firstClear: { star?: number; shards?: number; fragments?: number; title?: string; pet?: string };
  repeat: { shards: number; fragments: number; mastery?: number };
  unlockLifetime: number;
}

export const BOSSES: BossDef[] = [
  {
    id: "stone_heart",
    name: "Stone Heart",
    blurb: "It does not want to open. That is the whole fight.",
    baseHp: 4_000,
    hpGrowth: 3.4,
    timeLimit: 45,
    color: "#8a8078",
    mechanic: "plain",
    mechanicText: "No tricks. Hit it until it opens.",
    firstClear: { star: 1, shards: 15, title: "Stonebreaker" },
    repeat: { shards: 6, fragments: 30 },
    unlockLifetime: 150_000,
  },
  {
    id: "frozen_heart",
    name: "Frozen Heart",
    blurb: "Cold enough that your combo stops mattering.",
    baseHp: 40_000,
    hpGrowth: 3.6,
    timeLimit: 50,
    color: "#7fb0d0",
    mechanic: "shield_phases",
    mechanicText: "Shields periodically. Criticals are the only thing that gets through a shield.",
    firstClear: { star: 1, shards: 30, fragments: 80 },
    repeat: { shards: 12, fragments: 60 },
    unlockLifetime: 4e6,
  },
  {
    id: "mimic_jar",
    name: "Mimic Jar",
    blurb: "It is not your jar. It has never been your jar.",
    baseHp: 600_000,
    hpGrowth: 3.8,
    timeLimit: 40,
    color: "#a08050",
    mechanic: "mimic",
    mechanicText: "Copies your last hit back at your combo. Vary your rhythm.",
    firstClear: { star: 2, shards: 60, fragments: 150, pet: "jar_mimic" },
    repeat: { shards: 22, fragments: 110 },
    unlockLifetime: 8e7,
  },
  {
    id: "broken_clock_heart",
    name: "Broken Clock Heart",
    blurb: "Runs on a schedule nobody agreed to.",
    baseHp: 9e6,
    hpGrowth: 4,
    timeLimit: 35,
    color: "#b0a070",
    mechanic: "timed_phases",
    mechanicText: "Damage only lands during its open phases. Watch the ring.",
    firstClear: { star: 2, shards: 110, fragments: 260 },
    repeat: { shards: 40, fragments: 190 },
    unlockLifetime: 1e9,
  },
  {
    id: "golden_heart_king",
    name: "Golden Heart King",
    blurb: "Wealthy, slow, and extremely well defended.",
    baseHp: 2e8,
    hpGrowth: 4.2,
    timeLimit: 60,
    color: "#d0a84a",
    mechanic: "weak_spots",
    mechanicText: "Only the glowing spot takes real damage, and it keeps moving.",
    firstClear: { star: 3, shards: 220, fragments: 500, title: "Kingtoppler" },
    repeat: { shards: 80, fragments: 380, mastery: 1 },
    unlockLifetime: 3e10,
  },
  {
    id: "jealousy_shadow",
    name: "Jealousy Shadow",
    blurb: "Grows whenever you look away from it.",
    baseHp: 4e9,
    hpGrowth: 4.4,
    timeLimit: 45,
    color: "#4a3f5a",
    mechanic: "regenerating",
    mechanicText: "Heals steadily. You have to out-damage the healing, not just outlast it.",
    firstClear: { star: 3, shards: 400, fragments: 900 },
    repeat: { shards: 150, fragments: 700, mastery: 1 },
    unlockLifetime: 8e11,
  },
  {
    id: "memory_guardian",
    name: "Memory Guardian",
    blurb: "Keeps the things you would rather not lose.",
    baseHp: 9e10,
    hpGrowth: 4.6,
    timeLimit: 55,
    color: "#8a6a4a",
    mechanic: "combo_gate",
    mechanicText: "Ignores every hit made below a combo of twenty five.",
    firstClear: { star: 4, shards: 700, fragments: 1_600, title: "Keeper of Memory" },
    repeat: { shards: 280, fragments: 1_200, mastery: 2 },
    unlockLifetime: 2e13,
  },
  {
    id: "heart_dragon",
    name: "Heart Dragon",
    blurb: "The fight everything else was practice for.",
    baseHp: 3e12,
    hpGrowth: 4.8,
    timeLimit: 60,
    color: "#b0503f",
    mechanic: "critical_windows",
    mechanicText: "Opens briefly after every fifth hit. Criticals in that window do ten times damage.",
    firstClear: { star: 5, shards: 1_400, fragments: 3_200, pet: "heart_dragon" },
    repeat: { shards: 520, fragments: 2_400, mastery: 3 },
    unlockLifetime: 5e14,
  },
  {
    id: "cosmic_heart",
    name: "Cosmic Heart",
    blurb: "Not hostile. Just extremely large.",
    baseHp: 2e15,
    hpGrowth: 5,
    timeLimit: 75,
    color: "#a070d0",
    mechanic: "shield_phases",
    mechanicText: "Three shield layers, each one only broken by a different damage source.",
    firstClear: { star: 6, shards: 3_000, fragments: 7_000, title: "Cosmic" },
    repeat: { shards: 1_100, fragments: 5_000, mastery: 4 },
    unlockLifetime: 1e17,
  },
  {
    id: "eternal_heart",
    name: "Eternal Heart",
    blurb: "The end of the content, and the start of the next ascension.",
    baseHp: 1e18,
    hpGrowth: 5.5,
    timeLimit: 90,
    color: "#3f5d8a",
    mechanic: "weak_spots",
    mechanicText: "Every mechanic in the game at once. Bring a finished build.",
    firstClear: { star: 10, shards: 8_000, fragments: 20_000, pet: "jar_spirit", title: "Eternal" },
    repeat: { shards: 3_000, fragments: 14_000, mastery: 8 },
    unlockLifetime: 0,
  },
];

export const BOSS_BY_ID: Record<string, BossDef> = Object.fromEntries(BOSSES.map((b) => [b.id, b]));

export function bossHp(def: BossDef, tier: number): number {
  return def.baseHp * Math.pow(def.hpGrowth, Math.max(0, tier - 1));
}
