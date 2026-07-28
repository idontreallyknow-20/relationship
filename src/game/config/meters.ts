// Love meters.
//
// Four bars that fill from things the two of you actually do, and each one
// pays a multiplier while it is up. They are the game's answer to "why open
// the rest of the app": not a quest list, just a visible number that goes up
// when you talk to each other.
//
// Every meter decays. That is deliberate and gentle: a meter that only ever
// rose would be a one-time unlock wearing a progress bar, and one that fell
// fast would be a chore. A week of silence takes a meter to zero; an evening
// together fills it.

import type { Mods } from "../types";

export interface MeterDef {
  id: string;
  name: string;
  /** What fills it, in the plainest words available. */
  fills: string;
  color: string;
  /** Percentage points lost per hour with nothing happening. */
  decayPerHour: number;
  /** The multiplier at a full meter. Interpolated linearly from 1 at empty. */
  full: Mods;
}

export const METERS: MeterDef[] = [
  {
    id: "warmth",
    name: "Warmth",
    fills: "Messages, moods, letters",
    color: "#c4566f",
    decayPerHour: 0.9,
    full: { mul: { all: 1.5 } },
  },
  {
    id: "attention",
    name: "Attention",
    fills: "Answering the daily question",
    color: "#7c6ba8",
    decayPerHour: 0.7,
    full: { mul: { petValue: 4 } },
  },
  {
    id: "keeping",
    name: "Keeping",
    fills: "Memories, drawings, plans",
    color: "#5d7f5a",
    decayPerHour: 0.5,
    full: { mul: { shelfRate: 1.6 } },
  },
  {
    id: "presence",
    name: "Presence",
    fills: "Both of you in the jar the same evening",
    color: "#c99a3f",
    decayPerHour: 2.2,
    full: { mul: { petSpeed: 2, all: 1.25 } },
  },
];

export const METER_BY_ID: Record<string, MeterDef> = Object.fromEntries(
  METERS.map((m) => [m.id, m]),
);

/** Which meter each together-action fills, and by how much. */
export const METER_FILL: Record<string, { meter: string; amount: number }> = {
  message_sent: { meter: "warmth", amount: 8 },
  mood_shared: { meter: "warmth", amount: 14 },
  letter_sent: { meter: "warmth", amount: 22 },
  question_answered: { meter: "attention", amount: 34 },
  memory_added: { meter: "keeping", amount: 20 },
  drawing_shared: { meter: "keeping", amount: 18 },
  plan_made: { meter: "keeping", amount: 16 },
};

/**
 * The multiplier a meter is currently paying.
 *
 * Linear from nothing at empty to the full value at a hundred, so a half-full
 * Warmth is worth 1.25 rather than nothing until it caps. Partial credit keeps
 * the bar worth looking at on the way up.
 */
export function meterMods(def: MeterDef, level: number): Mods {
  const share = Math.min(1, Math.max(0, level / 100));
  if (share <= 0) return {};
  const mul: Record<string, number> = {};
  for (const [stat, value] of Object.entries(def.full.mul ?? {})) {
    mul[stat] = 1 + (value - 1) * share;
  }
  return { mul: mul as Mods["mul"] };
}

/* ------------------------------------------------------------------ */
/* What the two of you are building between you                        */
/* ------------------------------------------------------------------ */

/**
 * The pair bonus.
 *
 * Both saves carry a running lifetime total. Neither person can see the
 * other's jar, so the partner's is read on the same poll that fetches the
 * gift, and the sum decides the multiplier. Deliberately additive rather than
 * competitive: there is no way to be ahead of each other, only a number that
 * is larger when both of you have been playing.
 *
 * Logarithmic, so the first hour together matters far more than the hundredth
 * and neither of you can ever fall too far behind to matter.
 */
export function togetherBonus(mine: number, theirs: number): number {
  const pair = Math.max(0, mine) + Math.max(0, theirs);
  if (pair <= 0) return 1;
  return 1 + Math.log10(1 + pair / 1e6) * 0.35;
}
