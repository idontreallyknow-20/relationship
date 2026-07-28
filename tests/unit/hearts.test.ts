// The one function the whole jar picture rests on.
//
// `heartsToPile` is the answer to "you cannot draw a billion hearts", and it is
// the kind of function that is easy to get plausibly wrong: an off-by-one in
// the base ten split shows up as a jar that is quietly missing a colour, and an
// unbounded return shows up as a phone that stops responding at 1e12 rather
// than as anything a screenshot would catch.

import { describe, expect, it } from "vitest";
import {
  HEART_TIERS,
  MERGE_AT,
  TOP_TIER,
  heartsToPile,
  highestTier,
  mergeProgress,
  pileValue,
} from "@/game/config/hearts";

describe("the heart ladder", () => {
  it("starts at one and multiplies by ten", () => {
    expect(HEART_TIERS[0].value).toBe(1);
    for (let i = 1; i < HEART_TIERS.length; i++) {
      expect(HEART_TIERS[i].value).toBe(HEART_TIERS[i - 1].value * MERGE_AT);
    }
  });

  it("gives every tier a name and two distinct colours", () => {
    const names = new Set<string>();
    for (const tier of HEART_TIERS) {
      expect(tier.name.length).toBeGreaterThan(0);
      expect(names.has(tier.name), `${tier.name} appears twice`).toBe(false);
      names.add(tier.name);
      expect(tier.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tier.edge).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tier.edge).not.toBe(tier.color);
    }
  });

  it("reaches far enough to be worth having", () => {
    // A run that ends at a thousand hearts would not need a ladder.
    expect(HEART_TIERS[TOP_TIER].value).toBeGreaterThanOrEqual(1e16);
  });
});

describe("heartsToPile", () => {
  it("draws nothing for an empty jar", () => {
    expect(heartsToPile(0)).toEqual([]);
    expect(heartsToPile(0.4)).toEqual([]);
    expect(heartsToPile(-5)).toEqual([]);
  });

  it("draws one heart for one heart", () => {
    expect(heartsToPile(1)).toEqual([{ tier: 0, count: 1 }]);
  });

  it("merges ten into one of the next colour", () => {
    expect(heartsToPile(9)).toEqual([{ tier: 0, count: 9 }]);
    expect(heartsToPile(10)).toEqual([{ tier: 1, count: 1 }]);
    expect(heartsToPile(11)).toEqual([
      { tier: 1, count: 1 },
      { tier: 0, count: 1 },
    ]);
  });

  it("reads a number the way it is written", () => {
    // 1,234 is one thousand, two hundreds, three tens and four ones.
    expect(heartsToPile(1_234)).toEqual([
      { tier: 3, count: 1 },
      { tier: 2, count: 2 },
      { tier: 1, count: 3 },
      { tier: 0, count: 4 },
    ]);
  });

  it("leaves out a colour the number does not have", () => {
    expect(heartsToPile(1_004)).toEqual([
      { tier: 3, count: 1 },
      { tier: 0, count: 4 },
    ]);
  });

  it("comes back biggest first, so the drawing can stack from the bottom", () => {
    const pile = heartsToPile(987_654);
    for (let i = 1; i < pile.length; i++) {
      expect(pile[i].tier).toBeLessThan(pile[i - 1].tier);
    }
  });

  // The whole point of the file.
  it("never draws more than the budget, at any magnitude", () => {
    for (let exponent = 0; exponent <= 40; exponent++) {
      const total = Math.pow(10, exponent);
      for (const value of [total, total * 1.5, total * 9.99]) {
        const drawn = heartsToPile(value).reduce((sum, e) => sum + e.count, 0);
        expect(drawn, `${value.toExponential()} drew ${drawn} hearts`).toBeLessThanOrEqual(120);
      }
    }
  });

  it("honours a smaller budget by dropping the smallest colours first", () => {
    const pile = heartsToPile(999_999_999, 12);
    const drawn = pile.reduce((sum, e) => sum + e.count, 0);
    expect(drawn).toBeLessThanOrEqual(12);
    // What survives is the top of the number, not the bottom of it.
    expect(pile[0].tier).toBe(8);
  });

  it("is exact below the drawing budget", () => {
    // Anything with few enough digits comes back adding up to itself, so the
    // jar is a true picture of the balance rather than an impression of it.
    for (const total of [1, 7, 42, 305, 6_789, 90_909, 111_111]) {
      expect(pileValue(heartsToPile(total)), `${total}`).toBe(total);
    }
  });

  it("never claims more than is actually there", () => {
    for (let exponent = 0; exponent <= 30; exponent++) {
      const total = Math.floor(Math.pow(10, exponent) * 3.7);
      expect(pileValue(heartsToPile(total))).toBeLessThanOrEqual(total);
    }
  });

  it("keeps at most nine of a colour, except at the very top", () => {
    for (const total of [1e6 - 1, 5.55e9, 8.88e12, 9.99e15]) {
      for (const entry of heartsToPile(total)) {
        if (entry.tier === TOP_TIER) continue;
        expect(entry.count, `tier ${entry.tier} of ${total}`).toBeLessThanOrEqual(MERGE_AT - 1);
      }
    }
  });

  it("lets the top colour pile up rather than losing the overflow", () => {
    const huge = HEART_TIERS[TOP_TIER].value * 7;
    const pile = heartsToPile(huge);
    expect(pile[0].tier).toBe(TOP_TIER);
    expect(pile[0].count).toBe(7);
  });

  it("survives numbers past the top of the ladder without hanging", () => {
    const pile = heartsToPile(1e300);
    expect(pile.length).toBeGreaterThan(0);
    expect(pile.reduce((sum, e) => sum + e.count, 0)).toBeLessThanOrEqual(120);
  });

  it("survives nonsense", () => {
    expect(heartsToPile(NaN)).toEqual([]);
    expect(heartsToPile(Infinity)).toEqual([]);
  });

  it("is a pure function of the total, so two phones agree", () => {
    expect(heartsToPile(123_456_789)).toEqual(heartsToPile(123_456_789));
  });
});

describe("highestTier", () => {
  it("names the biggest colour in the jar", () => {
    expect(highestTier(0)).toBe(0);
    expect(highestTier(9)).toBe(0);
    expect(highestTier(10)).toBe(1);
    expect(highestTier(999)).toBe(2);
    expect(highestTier(1_000)).toBe(3);
  });

  it("stops at the top of the ladder", () => {
    expect(highestTier(1e300)).toBe(TOP_TIER);
  });

  it("only ever goes up as the total does", () => {
    let previous = 0;
    for (let exponent = 0; exponent <= 30; exponent++) {
      const now = highestTier(Math.pow(10, exponent));
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
  });
});

describe("mergeProgress", () => {
  it("runs from one merge to the next", () => {
    expect(mergeProgress(10)).toBeCloseTo(0, 5);
    expect(mergeProgress(100)).toBeCloseTo(0, 5);
    expect(mergeProgress(55)).toBeCloseTo(0.5, 1);
  });

  it("stays inside the bar at every magnitude", () => {
    for (let exponent = 0; exponent <= 40; exponent++) {
      for (const factor of [1, 2.5, 9.99]) {
        const value = mergeProgress(Math.pow(10, exponent) * factor);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is full once the ladder is finished, rather than dividing by nothing", () => {
    expect(mergeProgress(1e300)).toBe(1);
  });
});
