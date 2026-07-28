// What exists yet.
//
// The game had nineteen screens on the first run and its own owner could not
// read it. So: nothing is on screen until it is yours. Not greyed out with a
// padlock and a number, not visible-but-disabled: absent. You open the app and
// there is a jar and a heart to tap, and that is genuinely all there is.
//
// That was already the intent. It did not work, and the reason was measurable
// rather than a matter of taste. Three things were wrong:
//
// 1. The rungs were keyed to lifetime hearts alone, and hearts inflate. Fifty,
//    five hundred, three thousand, twenty thousand: an idle jar makes ninety
//    hearts in the first minute, so four rungs went by before the player had
//    decided anything. A number cannot pace a game whose whole purpose is to
//    make that number enormous.
// 2. Three of the ten rungs revealed three separate systems at once. "Otters,
//    crabs and abilities" is not one thing to learn, it is three.
// 3. Nothing spaced them out. Crossing four thresholds inside one tick showed
//    one card and silently swallowed the other three.
//
// So a rung now asks for a number *and* something you actually did, reveals
// exactly one thing, and arrives no sooner than ninety seconds after the last
// one. `stageReached` is a high-water mark in the save rather than a function
// of the current state, because half of what a rung asks for (deepenings, the
// chain) is wiped by a rebirth, and a game that takes a feature back is worse
// than one that gave it too early.

import type { GameState } from "../types";

/**
 * The smallest gap between two reveals, however fast the jar is going.
 *
 * Graduated rather than flat. The first couple of rungs are small and quick to
 * absorb, and making someone sit four minutes in front of a single button to
 * earn the word "Upgrades" is its own kind of bad. Everything from the chain
 * onward is a system rather than a button, and gets room.
 */
export const STAGE_MIN_GAP_MS = 90_000;
export const STAGE_LATE_GAP_MS = 240_000;

export function stageGap(index: number): number {
  return index <= 2 ? STAGE_MIN_GAP_MS : STAGE_LATE_GAP_MS;
}

/**
 * What a rung can ask you to have done.
 *
 * Deliberately a short closed list rather than the full `MetricId` union:
 * `metricTotal` lives in `engine.ts`, which imports this file's neighbours,
 * and a gate is not worth an import cycle. Everything here reads straight off
 * the save.
 */
export type StageMetric =
  | "clicks"
  | "upgrades"
  | "depthsBought"
  | "deepens"
  | "tideChanges"
  | "newWaters"
  | "seas";

export function stageMetric(state: GameState, metric: StageMetric): number {
  switch (metric) {
    case "clicks":
      return state.stats?.totalClicks ?? 0;
    case "upgrades":
      return state.stats?.upgradesBought ?? 0;
    case "depthsBought":
      return (state.depths ?? []).reduce((sum, d) => sum + (d?.bought ?? 0), 0);
    case "deepens":
      return state.deepens ?? 0;
    case "tideChanges":
      return state.tideChanges ?? 0;
    case "newWaters":
      return state.newWaters ?? 0;
    case "seas":
      return state.seas ?? 0;
  }
}

export interface StageDef {
  /** Order, and the value stored in the save as "how far have I been told". */
  index: number;
  /** Lifetime hearts that open it. */
  at: number;
  /**
   * And something you did. A number on its own cannot pace this game; every
   * rung past the first asks for a decision as well as a balance.
   */
  needs?: { metric: StageMetric; count: number };
  /**
   * The one feature this reveals. At most one, always: a rung that reveals
   * three systems is three rungs wearing one card.
   */
  reveals: Feature[];
  /** Shown when it opens, and re-readable afterwards. */
  title: string;
  body: string;
}

/**
 * Everything that can be hidden. A screen, a control, or a whole tab.
 *
 * Kept as a union rather than free strings so a typo in a gate is a compile
 * error rather than a permanently invisible feature.
 */
export type Feature =
  | "upgrades"
  | "chain"
  | "buyAmounts"
  | "automation"
  | "abilities"
  | "pets"
  | "deepen"
  | "tide"
  | "us"
  | "vessels"
  | "missions"
  | "tideChange"
  | "challenges"
  | "newWater"
  | "sea"
  | "dilation";

export const STAGES: StageDef[] = [
  {
    index: 0,
    at: 0,
    reveals: [],
    title: "Your jar",
    body: "Tap the heart. That is the whole game for now, and it is genuinely all you need to do.",
  },
  {
    index: 1,
    at: 300,
    needs: { metric: "clicks", count: 50 },
    reveals: ["upgrades"],
    title: "Upgrades",
    body: "Spend hearts to make taps worth more. Spending is always better than saving here, so spend everything.",
  },
  {
    index: 2,
    at: 4_000,
    needs: { metric: "upgrades", count: 12 },
    // Buying ten at a time is given, not earned. Pressing a button a hundred
    // times is not a skill and charging for the shortcut is not a reward. It
    // waits only until there is something worth buying ten of.
    reveals: ["buyAmounts"],
    title: "Ten at a time",
    body: "Buy ten, a hundred, or as many as you can afford. There is a Buy all button beside it that takes the cheapest first.",
  },
  {
    index: 3,
    at: 40_000,
    needs: { metric: "upgrades", count: 35 },
    reveals: ["chain"],
    title: "The jar fills itself",
    body: "Buy Hearts and they arrive without you tapping. Each tier above makes the tier below it, so a Handful quietly makes Hearts all day.",
  },
  {
    index: 4,
    at: 400_000,
    needs: { metric: "depthsBought", count: 70 },
    reveals: ["deepen"],
    title: "Going deeper",
    body: "Trade the chain in for a permanent multiplier and a longer chain. Your hearts stay, so you rebuild in seconds and come out ahead.",
  },
  {
    index: 5,
    at: 5e6,
    needs: { metric: "deepens", count: 6 },
    reveals: ["automation"],
    title: "It buys for you",
    body: "Autobuyers spend your hearts so you do not have to. Each one only spends the share you allow it, so nothing runs away with your balance.",
  },
  {
    index: 6,
    at: 4e7,
    needs: { metric: "deepens", count: 12 },
    reveals: ["tideChange"],
    title: "Rebirth",
    body: "Empty the jar, keep what you learned, come back faster. This is the loop the rest of the game is made of, and you will do it hundreds of times.",
  },
  {
    index: 7,
    at: 8e7,
    needs: { metric: "tideChanges", count: 1 },
    reveals: ["tide"],
    title: "Warmth",
    body: "A bar that fills when either of you plays and slips back when neither does. While it is up, everything in the jar is worth more.",
  },
  {
    index: 8,
    at: 2e8,
    needs: { metric: "tideChanges", count: 3 },
    reveals: ["us"],
    title: "Together",
    body: "What the two of you do in the rest of the app pays into the jar. Nothing here needs your partner, and all of it is better with them.",
  },
  {
    index: 9,
    at: 8e8,
    needs: { metric: "tideChanges", count: 5 },
    reveals: ["pets"],
    title: "Otters and crabs",
    body: "Hers open things at the surface, his carry them up off the floor. They are a side thing that makes the jar stronger, and nothing needs them.",
  },
  {
    index: 10,
    at: 4e9,
    needs: { metric: "tideChanges", count: 8 },
    reveals: ["abilities"],
    title: "Abilities",
    body: "Bought with pearls and fired on a cooldown. Half apply an effect for a while, half go off once and are done.",
  },
  {
    index: 11,
    at: 1e10,
    needs: { metric: "tideChanges", count: 8 },
    reveals: ["vessels"],
    title: "A bigger jar",
    body: "The jar you keep it all in can be a bigger one. Deeper water holds more creatures, and a wider floor holds more crabs.",
  },
  {
    index: 12,
    at: 6e10,
    needs: { metric: "tideChanges", count: 10 },
    reveals: ["missions"],
    title: "Missions",
    body: "Small goals that refresh daily, and longer ones that do not. They pay in the currencies you are shortest of.",
  },
  {
    index: 13,
    at: 4e11,
    needs: { metric: "tideChanges", count: 14 },
    reveals: ["challenges"],
    title: "Challenges",
    body: "A life with something taken away, and a permanent reward for finishing it anyway. Leave whenever you like; nothing is lost by trying.",
  },
  {
    index: 14,
    at: 1e13,
    needs: { metric: "tideChanges", count: 20 },
    reveals: ["newWater"],
    title: "Deep rebirth",
    body: "A rebirth of the rebirths, paying stars. Everything you learned about rebirth applies again, larger.",
  },
  {
    index: 15,
    at: 1e18,
    needs: { metric: "newWaters", count: 2 },
    reveals: ["sea"],
    title: "The last one",
    body: "The rebirth that takes the rebirths, and both of their trees, and pays drops. Nothing above this exists. There was never a jar.",
  },
  {
    index: 16,
    at: 1e24,
    needs: { metric: "seas", count: 1 },
    reveals: ["dilation"],
    title: "Time dilation",
    body: "A switch that makes the whole jar slower on purpose, and pays hours for how far you get anyway. It is worse than not having it until you have spent a while on the tree it pays for.",
  },
];

/** Whether a single rung's conditions are met right now. */
export function stageMet(state: GameState, def: StageDef): boolean {
  if ((state.lifetime?.hearts ?? 0) < def.at) return false;
  if (!def.needs) return true;
  return stageMetric(state, def.needs.metric) >= def.needs.count;
}

/**
 * The furthest rung whose conditions are met, ignoring the high-water mark.
 *
 * Rungs are checked in order and the walk stops at the first unmet one, so a
 * player who somehow satisfies rung nine without rung eight still learns them
 * in order. That is the whole point of a ladder.
 */
export function stageCandidate(state: GameState): number {
  let reached = 0;
  for (const def of STAGES) {
    if (def.index === 0) continue;
    if (!stageMet(state, def)) break;
    reached = def.index;
  }
  return reached;
}

/**
 * How far the player has actually got.
 *
 * Reads the high-water mark rather than recomputing, because a rebirth wipes
 * the chain and the deepenings that two of the rungs ask for. `advanceStage`
 * is what moves it, one rung at a time.
 */
export function stageFor(state: GameState): number {
  return Math.max(0, Math.floor(state.stageReached ?? 0));
}

/**
 * Move the mark at most one rung, and no sooner than `STAGE_MIN_GAP_MS` after
 * the last one.
 *
 * Both halves matter. One rung at a time means a burst of income cannot dump
 * four systems on screen at once; the gap means it cannot dump them across
 * four consecutive seconds either. Returns true if it moved, so the caller can
 * stamp the clock.
 */
export function advanceStage(state: GameState, now: number): boolean {
  const current = stageFor(state);
  if (current >= STAGES.length - 1) return false;
  if (stageCandidate(state) <= current) return false;

  const last = Number(state.stageAt) || 0;
  // A clock that jumped backwards must not lock the ladder forever.
  if (last > now) {
    state.stageAt = now;
    return false;
  }
  if (current > 0 && now - last < stageGap(current + 1)) return false;

  state.stageReached = current + 1;
  state.stageAt = now;
  return true;
}

/** Every feature revealed at or below this stage. */
export function featuresAt(stage: number): Set<Feature> {
  const out = new Set<Feature>();
  for (const def of STAGES) {
    if (def.index > stage) continue;
    for (const feature of def.reveals) out.add(feature);
  }
  return out;
}

export const STAGE_BY_INDEX: Record<number, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.index, s]),
);
