// Easter eggs.
//
// Things nobody is told about. No list in the codex, no achievement row, no
// hint text: they either happen to you or they do not, and when one does it
// says one line and pays something small.
//
// The rule for all of them: never worth hunting, always worth finding. Nothing
// here is more than a modest multiplier or a handful of pearls, because an egg
// that mattered would turn into a checklist the moment one of you found it.

import type { Mods } from "../types";

export interface EggDef {
  id: string;
  /** What it says when it happens. One line, no explanation. */
  line: string;
  /** A short-lived buff, if it gives one. */
  mods?: Mods;
  durationMs?: number;
  pearls?: number;
}

export const EGGS: EggDef[] = [
  {
    id: "midnight",
    line: "Still awake.",
    mods: { mul: { all: 2 } },
    durationMs: 30 * 60_000,
  },
  {
    id: "same_minute",
    line: "You both opened it in the same minute.",
    mods: { mul: { all: 3 } },
    durationMs: 60 * 60_000,
    pearls: 25,
  },
  {
    id: "the_number",
    line: "143.",
    mods: { mul: { click: 1.43 } },
    durationMs: 143 * 60_000,
  },
  {
    id: "leap",
    line: "A day that only comes round every four years.",
    mods: { mul: { all: 4 } },
    durationMs: 24 * 60 * 60_000,
  },
  {
    id: "otter_hands",
    line: "Otters hold hands so they do not drift apart while they sleep.",
    mods: { mul: { pairBonus: 1.5 } },
    durationMs: 6 * 60 * 60_000,
  },
  {
    id: "crab_sideways",
    line: "Sideways is still forwards.",
    mods: { mul: { collectValue: 1.6 } },
    durationMs: 3 * 60 * 60_000,
  },
  {
    id: "patient",
    line: "You held it for a very long time.",
    pearls: 50,
    mods: { mul: { chargePower: 2 } },
    durationMs: 60 * 60_000,
  },
  {
    id: "empty",
    line: "You spent every last one.",
    mods: { mul: { cost: 0.85 } },
    durationMs: 45 * 60_000,
  },
  {
    id: "the_mall",
    line: "The photo booth had a curtain that never quite closed.",
    pearls: 100,
  },
];

export const EGG_BY_ID: Record<string, EggDef> = Object.fromEntries(
  EGGS.map((e) => [e.id, e]),
);
