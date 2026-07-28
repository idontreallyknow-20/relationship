import type { Mods } from "../types";
import type { UnlockRule } from "./upgrades";

// Fourteen abilities, bought and levelled with Pearls. Half apply a timed
// effect, half fire once.

export type InstantEffect =
  | "heart_burst"
  | "crack_all"
  | "collect_all"
  | "spawn_drifter"
  | "reset_cooldowns"
  | "max_combo"
  | "feed_all"
  | "mission_progress";

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  effect:
    | { kind: "buff"; mods: (level: number) => Mods }
    | { kind: "instant"; instant: InstantEffect; power: (level: number) => number };
  cooldownMs: number;
  durationMs: number;
  maxLevel: number;
  costBase: number;
  costGrowth: number;
  unlock: UnlockRule;
  flourish: "swell" | "surge" | "calm" | "still";
  autoLevel: number;
}

export const SKILLS: SkillDef[] = [
  {
    id: "swell",
    name: "Swell",
    description: "The water rises and everything pays more.",
    effect: { kind: "buff", mods: (l) => ({ mul: { all: 2 + 0.4 * l } }) },
    cooldownMs: 120_000, durationMs: 15_000, maxLevel: 25, costBase: 2, costGrowth: 1.4,
    unlock: { lifetimeHearts: 2_000 }, flourish: "swell", autoLevel: 10,
  },
  {
    id: "feeding_frenzy",
    name: "Feeding Frenzy",
    description: "Every otter cracks at once.",
    effect: { kind: "instant", instant: "crack_all", power: (l) => 3 + l * 0.5 },
    cooldownMs: 150_000, durationMs: 0, maxLevel: 25, costBase: 2, costGrowth: 1.42,
    unlock: { lifetimeHearts: 20_000 }, flourish: "surge", autoLevel: 12,
  },
  {
    id: "low_tide",
    name: "Low Tide",
    description: "The floor empties. Every crab collects everything at once.",
    effect: { kind: "instant", instant: "collect_all", power: (l) => 2 + l * 0.4 },
    cooldownMs: 150_000, durationMs: 0, maxLevel: 25, costBase: 2, costGrowth: 1.42,
    unlock: { lifetimeHearts: 20_000 }, flourish: "still", autoLevel: 12,
  },
  {
    id: "quickening",
    name: "Quickening",
    description: "Everything in the jar moves at double speed.",
    effect: { kind: "buff", mods: (l) => ({ mul: { crackSpeed: 2 + 0.1 * l, collectSpeed: 2 + 0.1 * l } }) },
    cooldownMs: 180_000, durationMs: 25_000, maxLevel: 20, costBase: 3, costGrowth: 1.45,
    unlock: { lifetimeHearts: 250_000 }, flourish: "surge", autoLevel: 12,
  },
  {
    id: "sure_hands",
    name: "Sure Hands",
    description: "Every tap is a critical.",
    effect: { kind: "buff", mods: (l) => ({ add: { critChance: 1 }, mul: { crit: 1 + 0.12 * l } }) },
    cooldownMs: 200_000, durationMs: 12_000, maxLevel: 20, costBase: 4, costGrowth: 1.48,
    unlock: { lifetimeHearts: 400_000 }, flourish: "surge", autoLevel: 12,
  },
  {
    id: "still_water",
    name: "Still Water",
    description: "Nothing decays. The combo holds where it is.",
    effect: { kind: "buff", mods: () => ({ add: { comboShield: 99, comboDurationMs: 40_000 } }) },
    cooldownMs: 180_000, durationMs: 25_000, maxLevel: 15, costBase: 4, costGrowth: 1.5,
    unlock: { lifetimeHearts: 1e6 }, flourish: "still", autoLevel: 10,
  },
  {
    id: "overflow",
    name: "Overflow",
    description: "The jar spills on purpose, and pays for it.",
    effect: { kind: "instant", instant: "heart_burst", power: (l) => 80 + 30 * l },
    cooldownMs: 300_000, durationMs: 0, maxLevel: 25, costBase: 3, costGrowth: 1.45,
    unlock: { lifetimeHearts: 2e6 }, flourish: "swell", autoLevel: 15,
  },
  {
    id: "full_bowls",
    name: "Full Bowls",
    description: "Feeds everything in the jar to the top.",
    effect: { kind: "instant", instant: "feed_all", power: () => 1 },
    cooldownMs: 240_000, durationMs: 0, maxLevel: 10, costBase: 3, costGrowth: 1.4,
    unlock: { lifetimeHearts: 3e6 }, flourish: "calm", autoLevel: 6,
  },
  {
    id: "perfect_rhythm",
    name: "Perfect Rhythm",
    description: "Every tap lands perfectly timed.",
    effect: { kind: "buff", mods: (l) => ({ mul: { click: 3 + 0.3 * l, comboGain: 2 } }) },
    cooldownMs: 210_000, durationMs: 15_000, maxLevel: 20, costBase: 5, costGrowth: 1.5,
    unlock: { lifetimeHearts: 2e7 }, flourish: "surge", autoLevel: 12,
  },
  {
    id: "something_drifts_in",
    name: "Something Drifts In",
    description: "Calls in whatever is passing.",
    effect: { kind: "instant", instant: "spawn_drifter", power: (l) => 1 + Math.floor(l / 6) },
    cooldownMs: 300_000, durationMs: 0, maxLevel: 15, costBase: 4, costGrowth: 1.5,
    unlock: { lifetimeHearts: 5e7 }, flourish: "calm", autoLevel: 10,
  },
  {
    id: "spring_tide",
    name: "Spring Tide",
    description: "Tide rises for both of you, fast.",
    effect: { kind: "buff", mods: (l) => ({ mul: { tideGain: 3 + 0.3 * l, all: 1.5 } }) },
    cooldownMs: 420_000, durationMs: 45_000, maxLevel: 20, costBase: 6, costGrowth: 1.55,
    unlock: { lifetimeHearts: 1e8 }, flourish: "swell", autoLevel: 12,
  },
  {
    id: "one_breath",
    name: "One Breath",
    description: "Fills the combo to the top and holds it there.",
    effect: { kind: "instant", instant: "max_combo", power: () => 1 },
    cooldownMs: 180_000, durationMs: 0, maxLevel: 10, costBase: 5, costGrowth: 1.5,
    unlock: { tideChanges: 1 }, flourish: "still", autoLevel: 8,
  },
  {
    id: "the_whole_shore",
    name: "The Whole Shore",
    description: "Pushes every mission forward.",
    effect: { kind: "instant", instant: "mission_progress", power: (l) => 0.15 + 0.02 * l },
    cooldownMs: 600_000, durationMs: 0, maxLevel: 15, costBase: 6, costGrowth: 1.6,
    unlock: { tideChanges: 1 }, flourish: "calm", autoLevel: 10,
  },
  {
    id: "slack_water",
    name: "Slack Water",
    description: "Every cooldown resets at once.",
    effect: { kind: "instant", instant: "reset_cooldowns", power: () => 1 },
    cooldownMs: 1_800_000, durationMs: 0, maxLevel: 10, costBase: 15, costGrowth: 1.8,
    unlock: { newWaters: 1 }, flourish: "still", autoLevel: 8,
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function skillCost(def: SkillDef, level: number): number {
  return Math.ceil(def.costBase * Math.pow(def.costGrowth, level));
}
