// What exists yet.
//
// The game had nineteen screens on the first run and its own owner could not
// read it. So: nothing is on screen until it is yours. Not greyed out with a
// padlock and a number, not visible-but-disabled — absent. You open the app
// and there is a jar and a heart to tap, and that is genuinely all there is.
//
// Every stage names one thing and explains it in two sentences when it
// arrives, because a feature that appears without a word is the same problem
// in a different costume.

export interface StageDef {
  /** Order, and the value stored in the save as "how far have I been told". */
  index: number;
  /** Lifetime hearts that open it. */
  at: number;
  /** The feature id this reveals. UI checks against these. */
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
  | "sea";

export const STAGES: StageDef[] = [
  {
    index: 0,
    // Buy amounts are here rather than earned. Pressing a button a hundred
    // times is not a skill and charging for the shortcut is not a reward.
    at: 0,
    reveals: ["buyAmounts"],
    title: "Your jar",
    body: "Tap the heart. That is the whole game for now, and it is genuinely all you need to do.",
  },
  {
    index: 1,
    at: 50,
    reveals: ["upgrades"],
    title: "Upgrades",
    body: "Spend hearts to make taps worth more. Spending is always better than saving here, so spend everything.",
  },
  {
    index: 2,
    at: 500,
    reveals: ["chain"],
    title: "The jar fills itself",
    body: "Buy Hearts and they arrive without you tapping. Each tier above makes the tier below it, so a Handful quietly makes Hearts all day.",
  },
  {
    index: 3,
    at: 3_000,
    reveals: ["deepen"],
    title: "Going deeper",
    body: "Trade the chain in for a permanent multiplier and a longer chain. Your hearts stay, so you rebuild in seconds and come out ahead.",
  },
  {
    index: 4,
    at: 20_000,
    reveals: ["automation"],
    title: "It buys for you",
    body: "Autobuyers spend your hearts so you do not have to. Each one only spends the share you allow it, so nothing runs away with your balance.",
  },
  {
    index: 5,
    at: 120_000,
    reveals: ["abilities", "pets", "vessels"],
    title: "Otters, crabs and abilities",
    body: "Creatures are yours to collect, feed and grow, and abilities fire on a cooldown. Both are side things that make the jar stronger. Nothing needs them.",
  },
  {
    index: 6,
    at: 1e6,
    reveals: ["tideChange", "tide", "us"],
    title: "Rebirth",
    body: "Empty the jar, keep what you learned, come back faster. This is the loop the rest of the game is made of, and you will do it hundreds of times.",
  },
  {
    index: 7,
    at: 2e7,
    reveals: ["missions", "challenges"],
    title: "Things to aim at",
    body: "Missions refresh daily. Challenges take something away for one life and pay well if you finish anyway.",
  },
  {
    index: 8,
    at: 1e11,
    reveals: ["newWater"],
    title: "Deep rebirth",
    body: "A rebirth of the rebirths, paying stars. Everything you learned about rebirth applies again, larger.",
  },
  {
    index: 9,
    at: 1e18,
    reveals: ["sea"],
    title: "The last one",
    body: "The rebirth that takes the rebirths, and both of their trees, and pays drops. Nothing above this exists. There was never a jar.",
  },
];

/** How far the player has actually got, from lifetime hearts. */
export function stageFor(lifetimeHearts: number): number {
  let reached = 0;
  for (const stage of STAGES) {
    if (lifetimeHearts >= stage.at) reached = stage.index;
  }
  return reached;
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
