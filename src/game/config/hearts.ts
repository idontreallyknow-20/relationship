// What is actually in the jar.
//
// The problem this file exists to solve: you cannot draw a billion hearts. An
// idle game's whole promise is that the number runs away from you, and a jar
// you put hearts into has to keep showing you the hearts, so at some point the
// picture and the number stop being able to agree.
//
// The answer is that hearts merge. Ten blush hearts are one rose heart, ten
// rose are one plum, and so on up a coloured ladder. That is the same idea as
// "different coloured hearts are worth more", which is the point: the fix for
// the rendering limit and the reason to want a bigger number are one mechanic.
//
// The consequence worth stating plainly is that the jar's contents are not
// simulated. There is no list of hearts anywhere in the save. `heartsToPile`
// writes one number in base ten and hands back a bag of coloured hearts, so:
//
//   - the picture can never drift out of sync with the balance, because it is
//     derived from it every frame rather than maintained alongside it;
//   - both phones agree without being told anything;
//   - the drawn count is bounded by nine per tier, whatever the total is;
//   - and a rebirth that empties the jar needs no cleanup.
//
// Crossing a power of ten is a visible merge rather than a digit changing,
// which is the moment a number getting bigger becomes something to watch.

/** How many of one tier make one of the next. Ten, because we read in ten. */
export const MERGE_AT = 10;

export interface HeartTier {
  /** 0 is the heart you tap. */
  tier: number;
  name: string;
  /** What one of these is worth in tapped hearts. */
  value: number;
  color: string;
  /** A slightly darker edge, so a heart reads as a shape and not a blob. */
  edge: string;
}

const LADDER: Array<[string, string, string]> = [
  ["Blush", "#f0b8c8", "#e0a0b4"],
  ["Rose", "#e08aa4", "#c96f8a"],
  ["Berry", "#c25f7e", "#a84b68"],
  ["Plum", "#9c5a86", "#82466f"],
  ["Iris", "#7c6ba8", "#63548c"],
  ["Cornflower", "#5f7fc0", "#4a68a4"],
  ["Sea", "#3f8f96", "#2f757c"],
  ["Fern", "#4f9068", "#3c7553"],
  ["Honey", "#c9a03f", "#a98430"],
  ["Amber", "#d2802f", "#b06722"],
  ["Ember", "#c4522f", "#a33f22"],
  ["Ash", "#7d6a68", "#645350"],
  ["Pearl", "#cfc4b4", "#b3a795"],
  ["Moonlight", "#a9b6d8", "#8b9abf"],
  ["Starlight", "#8f7fd0", "#7364b0"],
  ["Daybreak", "#e4a06a", "#c68352"],
  ["Everlasting", "#b8477a", "#98325f"],
];

export const HEART_TIERS: HeartTier[] = LADDER.map(([name, color, edge], tier) => ({
  tier,
  name,
  value: Math.pow(MERGE_AT, tier),
  color,
  edge,
}));

export const TOP_TIER = HEART_TIERS.length - 1;

/** The largest total the ladder can name without the top tier piling up. */
export const LADDER_CEILING = Math.pow(MERGE_AT, HEART_TIERS.length);

export interface PileEntry {
  tier: number;
  /** How many of this colour are in the jar. */
  count: number;
}

/**
 * The highest tier that has appeared in a jar holding this much.
 *
 * Used to decide what the player has actually met, so a colour is introduced
 * once rather than every time it reappears.
 */
export function highestTier(total: number): number {
  if (!(total >= 1)) return 0;
  return Math.min(TOP_TIER, Math.floor(Math.log10(total) / Math.log10(MERGE_AT)));
}

/**
 * The bag of coloured hearts representing `total`, biggest first.
 *
 * Base ten, so at most nine of each colour, which is what bounds the drawing.
 * The top tier is the one exception and is allowed to run past nine: there has
 * to be somewhere for the overflow to go, and by the time a jar holds ten of
 * the last colour the count is being read rather than counted anyway. It is
 * clamped so a very large total cannot ask for a million circles.
 *
 * `maxDrawn` is a hard budget on how many hearts come back. When a total needs
 * more than that, the smallest colours are dropped first: nobody looking at a
 * jar with four Everlasting hearts in it is counting the blush ones.
 */
export function heartsToPile(total: number, maxDrawn = 120): PileEntry[] {
  const out: PileEntry[] = [];
  if (!Number.isFinite(total) || total < 1) return out;

  let left = Math.floor(total);
  let budget = Math.max(0, Math.floor(maxDrawn));

  for (let tier = TOP_TIER; tier >= 0 && budget > 0; tier--) {
    const value = HEART_TIERS[tier].value;
    if (left < value) continue;

    // At the top there is nothing left to merge into, so it accumulates.
    const whole = tier === TOP_TIER
      ? Math.floor(left / value)
      : Math.floor(left / value) % MERGE_AT;
    if (whole <= 0) continue;

    const drawn = Math.min(whole, budget, tier === TOP_TIER ? 24 : MERGE_AT - 1);
    if (drawn > 0) {
      out.push({ tier, count: drawn });
      budget -= drawn;
    }
    left -= whole * value;
  }

  return out;
}

/** How many hearts a pile is worth, which is the inverse of the above. */
export function pileValue(pile: PileEntry[]): number {
  return pile.reduce((sum, entry) => sum + entry.count * HEART_TIERS[entry.tier].value, 0);
}

/**
 * Where the jar is between one merge and the next, from 0 to 1.
 *
 * Drives the fill line behind the hearts, so a jar that is nearly ready to
 * merge reads from across the room without anybody counting circles. Deliberately
 * the fraction toward the *next colour* rather than toward the jar's capacity:
 * capacity is a different bar, drawn elsewhere, and the two would fight.
 */
export function mergeProgress(total: number): number {
  if (!(total >= 1)) return Math.max(0, Math.min(1, total));
  const tier = highestTier(total);
  if (tier >= TOP_TIER) return 1;
  const at = Math.pow(MERGE_AT, tier);
  const next = at * MERGE_AT;
  return Math.max(0, Math.min(1, (total - at) / (next - at)));
}

export const HEART_TIER_BY_INDEX: Record<number, HeartTier> = Object.fromEntries(
  HEART_TIERS.map((t) => [t.tier, t]),
);
