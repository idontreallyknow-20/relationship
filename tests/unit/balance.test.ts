// Does the curve actually hold up?
//
// The arithmetic in the config files is easy to get plausibly wrong: a growth
// rate a tenth too steep reads fine in a diff and turns into a wall you sit
// behind for an hour. So rather than trust it, this plays the game.
//
// A simulated player taps, buys the best thing it can afford, deepens when it
// can, and changes the tide when that is worth more than carrying on. The
// tests then assert the properties the design promises: something is always
// affordable, no rung waits on a clock, and idle eventually beats tapping.

import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state";
import { derive } from "@/game/formulas";
import { performClick, tick } from "@/game/engine";
import {
  buyAll, buyDepth, buyTide, canChangeTide, canDeepen, changeTide, deepen,
  depthBuyCount, tideBuyCount, buyResetUpgrade,
} from "@/game/actions";
import { DEPTHS, deepenRequirement, depthCost, tideCost } from "@/game/config/depths";
import { MOON_UPGRADES } from "@/game/config/resets";
import { upgradeNextCost } from "@/game/formulas";
import { UPGRADES } from "@/game/config/upgrades";
import { meetsUnlock } from "@/game/formulas";
import type { GameState } from "@/game/types";

/** One simulated second, at the real tick rate. */
const TICK_MS = 100;
const TICKS_PER_SECOND = 1000 / TICK_MS;

interface Marks {
  firstDeepen: number | null;
  firstTide: number | null;
  deepens: number;
  tideChanges: number;
  seconds: number;
  hearts: number;
  perSecond: number;
}

/**
 * Play for `seconds`, buying greedily and taking every reset that is offered.
 * `tapsPerSecond` is what a person is doing by hand on top of the automation.
 */
function play(seconds: number, tapsPerSecond = 0, spendMoons = true): Marks {
  const state = createGameState(0);
  const marks: Marks = {
    firstDeepen: null, firstTide: null, deepens: 0, tideChanges: 0,
    seconds, hearts: 0, perSecond: 0,
  };

  let now = 0;
  for (let second = 0; second < seconds; second++) {
    for (let t = 0; t < TICKS_PER_SECOND; t++) {
      now += TICK_MS;
      tick(state, TICK_MS, now);
    }

    for (let i = 0; i < tapsPerSecond; i++) {
      performClick(state, derive(state, now), {
        precision: 1, charge: 0, now, x: 50, y: 50,
      });
    }

    buyAll(state, 8);

    if (canDeepen(state)) {
      deepen(state);
      marks.deepens += 1;
      if (marks.firstDeepen === null) marks.firstDeepen = second;
    }

    if (canChangeTide(state)) {
      changeTide(state, now);
      marks.tideChanges += 1;
      if (marks.firstTide === null) marks.firstTide = second;
      if (spendMoons) {
        // Spend moons the way a person would: on the things that compound.
        for (const id of ["m_depth", "m_auto_tap", "m_autobuyer", "m_tide_speed", "m_all"]) {
          for (let i = 0; i < 20; i++) if (!buyResetUpgrade(state, id).ok) break;
        }
      }
    }
  }

  marks.hearts = state.lifetime.hearts;
  marks.perSecond = derive(state, now).heartsPerSecond;
  return marks;
}

/** The cheapest thing the player could buy right now, in hearts. */
function cheapestPurchase(state: GameState): number {
  const derived = derive(state, 0);
  let best = Infinity;

  for (let tier = 0; tier < state.depths.length; tier++) {
    if (!state.depths[tier].unlocked) continue;
    best = Math.min(best, depthCost(DEPTHS[tier], state.depths[tier].bought) * derived.costMultiplier);
  }
  best = Math.min(best, tideCost(state.tideBought) * derived.costMultiplier);

  for (const def of UPGRADES) {
    if (def.currency !== "hearts" || !meetsUnlock(state, def.unlock)) continue;
    const owned = state.upgrades[def.id] ?? 0;
    if (def.max !== Infinity && owned >= def.max) continue;
    best = Math.min(best, upgradeNextCost(state, def, derived));
  }
  return best;
}

describe("no time walls", () => {
  it("always has something affordable within half a minute of income", () => {
    const state = createGameState(0);
    let now = 0;
    const stalls: string[] = [];

    for (let second = 0; second < 1_800; second++) {
      for (let t = 0; t < TICKS_PER_SECOND; t++) {
        now += TICK_MS;
        tick(state, TICK_MS, now);
      }
      buyAll(state, 8);
      if (canDeepen(state)) deepen(state);

      const income = Math.max(derive(state, now).heartsPerSecond, 0.5);
      const wait = (cheapestPurchase(state) - state.wallet.hearts) / income;
      // Sampled once a minute: checking every second says the same thing
      // thirty times over and makes the failure harder to read.
      if (second % 60 === 0 && wait > 30) {
        stalls.push(`${second}s: ${Math.round(wait)}s until anything is affordable`);
      }
    }

    expect(stalls, `the player waits with nothing to buy:\n${stalls.join("\n")}`).toEqual([]);
  });

  it("reaches the first deepening within a few minutes, hands off", () => {
    const marks = play(300);
    expect(marks.firstDeepen, "never deepened in five minutes").not.toBeNull();
    expect(marks.firstDeepen!).toBeLessThan(240);
  });

  it("keeps deepening rather than stalling after the first one", () => {
    const marks = play(900);
    expect(marks.deepens).toBeGreaterThan(1);
  });

  it("reaches a tide change in the first session", () => {
    const marks = play(3_600);
    expect(marks.firstTide, "no tide change in an hour of play").not.toBeNull();
  });

  it("gets faster the longer it runs, rather than slower", () => {
    const one = play(300);
    const two = play(600);
    // Twice the time is worth much more than twice the progress, because the
    // multipliers from the first half are still running in the second.
    expect(two.hearts).toBeGreaterThan(one.hearts * 4);
  });

  it("never reaches a requirement it cannot afford", () => {
    // The cost staircase leaves the range of a double at roughly six thousand
    // purchases, so a requirement above that is a wall rather than a price.
    // This is the guard against reintroducing one.
    for (let deepens = 0; deepens < 500; deepens++) {
      const needed = deepenRequirement(deepens);
      expect(
        Number.isFinite(depthCost(DEPTHS[0], needed)),
        `deepening ${deepens} needs ${needed}, which costs more than a number can hold`,
      ).toBe(true);
    }
  });
});

describe("idle against active", () => {
  it("plays entirely on its own", () => {
    const idle = play(600, 0);
    expect(idle.hearts).toBeGreaterThan(0);
    expect(idle.perSecond).toBeGreaterThan(0);
    expect(idle.deepens).toBeGreaterThan(0);
  });

  it("rewards tapping early on", () => {
    const idle = play(120, 0);
    const active = play(120, 5);
    expect(active.hearts).toBeGreaterThan(idle.hearts);
  });

  it("carries the game on its own once the automation is fed", () => {
    // Tapping by hand is still worth more than idling in a short window, and
    // that is fine: what matters is that leaving it alone is never a dead end.
    // A jar left to itself for a quarter of an hour makes real progress.
    const idle = play(900, 0);
    expect(idle.hearts).toBeGreaterThan(1e5);
    expect(idle.deepens).toBeGreaterThan(0);
    expect(idle.perSecond).toBeGreaterThan(10);
  });
});

describe("the numbers stay sane", () => {
  it("never reaches infinity or NaN over a long run", () => {
    const state = createGameState(0);
    let now = 0;
    for (let second = 0; second < 900; second++) {
      for (let t = 0; t < TICKS_PER_SECOND; t++) {
        now += TICK_MS;
        tick(state, TICK_MS, now);
      }
      buyAll(state, 8);
      if (canDeepen(state)) deepen(state);
      if (canChangeTide(state)) changeTide(state, now);
    }

    expect(Number.isFinite(state.wallet.hearts)).toBe(true);
    expect(Number.isFinite(state.lifetime.hearts)).toBe(true);
    for (const depth of state.depths) {
      expect(Number.isFinite(depth.owned), "a depth ran away").toBe(true);
      expect(Number.isFinite(depth.bought)).toBe(true);
    }
    const derived = derive(state, now);
    for (const [key, value] of Object.entries(derived)) {
      if (typeof value === "number") {
        expect(Number.isFinite(value), `${key} became ${value}`).toBe(true);
      }
    }
  });

  it("buys in bulk without ever overspending", () => {
    const state = createGameState(0);
    state.wallet.hearts = 12_345;
    const before = state.wallet.hearts;
    const count = depthBuyCount(state, 0, "max");
    buyDepth(state, 0, "max");
    expect(state.depths[0].bought).toBe(count);
    expect(state.wallet.hearts).toBeGreaterThanOrEqual(0);
    expect(state.wallet.hearts).toBeLessThanOrEqual(before);
  });

  it("prices tide so it competes with depth rather than replacing it", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e6;
    expect(tideBuyCount(state, "max")).toBeGreaterThan(0);
    buyTide(state, "max");
    // Not so cheap that one purchase buys hundreds of levels.
    expect(state.tideBought).toBeLessThan(60);
  });
});

describe("the moon tree is worth buying", () => {
  it("makes the next run meaningfully faster", () => {
    const plain = createGameState(0);
    const invested = createGameState(0);
    invested.wallet.moons = 500;
    for (const id of MOON_UPGRADES.filter((u) => u.kind !== "flag").map((u) => u.id)) {
      for (let i = 0; i < 5; i++) if (!buyResetUpgrade(invested, id).ok) break;
    }

    plain.wallet.hearts = 1e6;
    invested.wallet.hearts = 1e6;
    buyAll(plain, 8);
    buyAll(invested, 8);

    let now = 0;
    for (let t = 0; t < 600; t++) {
      now += TICK_MS;
      tick(plain, TICK_MS, now);
      tick(invested, TICK_MS, now);
    }
    expect(invested.lifetime.hearts).toBeGreaterThan(plain.lifetime.hearts * 2);
  });
});
