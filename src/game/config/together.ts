// What the two of you have done between you.
//
// Every other bonus in the game is something one person earns. This one is
// the pair's: it counts both people's rebirths added together and pays both
// people the same multiplier, permanently, whoever actually did the work.
//
// It is deliberately not competitive and deliberately not gated on being
// online at the same time. Your partner's count arrives with the save poll and
// is remembered, so the bonus keeps applying on a plane with no signal. If one
// of you plays far more than the other, the one who plays less still gets
// every rung the pair has reached, which is the entire point.

import type { Mods } from "../types";

export interface JointMilestone {
  /** Combined rebirths, yours plus theirs. */
  at: number;
  name: string;
  detail: string;
  mods: Mods;
}

export const JOINT_MILESTONES: JointMilestone[] = [
  {
    at: 2,
    name: "Both started",
    detail: "You have each been reborn at least once between you.",
    mods: { mul: { all: 1.15 } },
  },
  {
    at: 10,
    name: "Getting the hang of it",
    detail: "Ten between you.",
    mods: { mul: { all: 1.25, cps: 1.2 } },
  },
  {
    at: 25,
    name: "A habit",
    detail: "Twenty five, and neither of you had to be asked.",
    mods: { mul: { all: 1.4, click: 1.3 } },
  },
  {
    at: 60,
    name: "Sixty",
    detail: "More rebirths than weeks you have been doing this.",
    mods: { mul: { all: 1.6, moonGain: 1.25 } },
  },
  {
    at: 150,
    name: "A hundred and fifty",
    detail: "Somebody has been playing this at work.",
    mods: { mul: { all: 2, shelfRate: 1.5 } },
  },
  {
    at: 400,
    name: "Four hundred",
    detail: "Four hundred lives, and the jar still fills the same way.",
    mods: { mul: { all: 2.5, petSpeed: 1.4 } },
  },
  {
    at: 1_000,
    name: "A thousand",
    detail: "Between the two of you, a thousand times.",
    mods: { mul: { all: 4, moonGain: 1.5, shelfRate: 2 } },
  },
  {
    at: 5_000,
    name: "Five thousand",
    detail: "There is no sensible thing left to say about this number.",
    mods: { mul: { all: 8, moonGain: 2, shelfRate: 3 } },
  },
];

/** Every rung the pair has reached. */
export function jointReached(combined: number): JointMilestone[] {
  return JOINT_MILESTONES.filter((m) => combined >= m.at);
}

/** The next one, or null when they are all done. */
export function jointNext(combined: number): JointMilestone | null {
  return JOINT_MILESTONES.find((m) => combined < m.at) ?? null;
}

/**
 * Both counts added together.
 *
 * The partner's is whatever the last save poll saw, so it is a floor rather
 * than a live figure. That is on purpose: a bonus that flickered off when the
 * network dropped would be worse than one that is occasionally a little behind.
 */
export function combinedRebirths(mine: number, theirsRemembered: number): number {
  return Math.max(0, Math.floor(mine)) + Math.max(0, Math.floor(theirsRemembered));
}
