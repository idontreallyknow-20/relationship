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
    at: 0,
    reveals: [],
    title: "Your jar",
    body: "Tap the heart. That is the whole game for now, and it is genuinely all you need to do.",
  },
  {
    index: 1,
    at: 50,
    reveals: ["upgrades"],
    title: "Upgrades",
    body: "You can spend hearts to make taps worth more. Spending is always better than saving here.",
  },
  {
    index: 2,
    at: 500,
    reveals: ["chain"],
    title: "The jar fills itself",
    body: "Buy Hearts and they arrive without you tapping. This is where the game starts playing itself.",
  },
  {
    index: 3,
    at: 5_000,
    reveals: ["buyAmounts", "abilities"],
    title: "Handfuls",
    body: "Buy ten or a hundred at once instead of one at a time. Abilities are here too, bought with pearls.",
  },
  {
    index: 4,
    at: 50_000,
    reveals: ["automation"],
    title: "It buys for you",
    body: "Autobuyers spend your hearts so you do not have to. Each one only spends the share you allow it.",
  },
  {
    index: 5,
    at: 500_000,
    reveals: ["pets", "vessels"],
    title: "Otters and crabs",
    body: "Yours to collect, feed and grow. They are a side thing that makes everything else stronger, and nothing needs them.",
  },
  {
    index: 6,
    at: 5e6,
    reveals: ["deepen"],
    title: "Go deeper",
    body: "Trade the chain for a permanent multiplier and a new tier below. Your hearts stay, so you rebuild immediately.",
  },
  {
    index: 7,
    at: 5e7,
    reveals: ["tide", "us"],
    title: "Tide",
    body: "One dial that speeds up every tier at once. It also rises whenever either of you uses the rest of the app.",
  },
  {
    index: 8,
    at: 1e9,
    reveals: ["missions", "challenges"],
    title: "Things to aim at",
    body: "Missions refresh daily. Challenges strip your run down and pay well if you clear them.",
  },
  {
    index: 9,
    at: 1e10,
    reveals: ["tideChange"],
    title: "Change the tide",
    body: "Start again for moons, which buy upgrades that survive every reset after this one. This is the real game.",
  },
  {
    index: 10,
    at: 1e14,
    reveals: ["newWater"],
    title: "New water",
    body: "A reset above the reset, paying stars. Everything you learned about tide changes applies again, larger.",
  },
  {
    index: 11,
    at: 1e20,
    reveals: ["sea"],
    title: "The sea",
    body: "The last one. There was never a jar.",
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
